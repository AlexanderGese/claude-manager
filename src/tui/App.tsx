import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme, GLYPHS } from "./theme.ts";
import { List } from "./List.tsx";
import { SearchBar } from "./SearchBar.tsx";
import { Preview } from "./Preview.tsx";
import { Stats } from "./Stats.tsx";
import { Projects } from "./Projects.tsx";
import { Help } from "./Help.tsx";
import type { Database } from "bun:sqlite";
import { listSessions, type SessionRow } from "../registry/search.ts";

type View = "sessions" | "stats" | "projects" | "help";
const VIEWS: View[] = ["sessions", "stats", "projects", "help"];
const VIEW_LABEL: Record<View, string> = {
  sessions: "sessions",
  stats:    "overview",
  projects: "projects",
  help:     "help",
};

interface Props {
  db: Database;
  initialFilterCwd: string | null;
  initialQuery: string;
  onSelect: (row: SessionRow) => void;
  onCancel: () => void;
}

export function App({ db, initialFilterCwd, initialQuery, onSelect, onCancel }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 30;
  const termWidth = stdout?.columns ?? 100;

  const [view, setView] = useState<View>("sessions");
  const [query, setQuery] = useState(initialQuery);
  const [filterCwd] = useState<string | null>(initialFilterCwd);
  const [selected, setSelected] = useState(0);
  const [tick, force] = useState(0);
  // When non-null, we are editing the custom_name of rows[selected].
  const [editing, setEditing] = useState<string | null>(null);

  const [hideMissing, setHideMissing] = useState(() => {
    const v = db.query<{ value: string }, []>(
      "SELECT value FROM settings WHERE key='hide_missing_dirs'"
    ).get()?.value;
    return v === "1";
  });

  const allRows = useMemo(
    () => listSessions(db, { query: "", filterCwd: null, includeMissing: !hideMissing }),
    [db, tick, hideMissing]
  );
  const rows = useMemo(
    () => listSessions(db, { query, filterCwd, includeMissing: !hideMissing }),
    [db, query, filterCwd, tick, hideMissing]
  );

  useInput((input, key) => {
    // ── RENAME MODE captures everything ───────────────────────────────
    if (editing !== null) {
      if (key.escape) { setEditing(null); return; }
      if (key.return) {
        const row = rows[selected];
        if (row) {
          const trimmed = editing.trim();
          db.run(
            "UPDATE sessions SET custom_name = ? WHERE session_id = ?",
            [trimmed.length > 0 ? trimmed : null, row.session_id],
          );
          force(n => n + 1);
        }
        setEditing(null);
        return;
      }
      if (key.backspace || key.delete) {
        setEditing(s => (s ?? "").slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
        setEditing(s => (s ?? "") + input);
      }
      return;
    }

    // ── GLOBAL ────────────────────────────────────────────────────────
    if (key.escape || (key.ctrl && input === "c") || input === "q") {
      onCancel();
      exit();
      return;
    }
    if (key.tab) {
      const idx = VIEWS.indexOf(view);
      const next = key.shift ? VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length] : VIEWS[(idx + 1) % VIEWS.length];
      setView(next);
      return;
    }
    if (input === "1") { setView("sessions"); return; }
    if (input === "2") { setView("stats");    return; }
    if (input === "3") { setView("projects"); return; }
    if (input === "?") { setView("help");     return; }

    // ── SESSIONS-VIEW ONLY ────────────────────────────────────────────
    if (view !== "sessions") return;

    if (key.return) {
      const row = rows[selected];
      if (row) { onSelect(row); exit(); }
      return;
    }
    if (key.upArrow || input === "k") { setSelected(s => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") { setSelected(s => Math.max(0, Math.min(rows.length - 1, s + 1))); return; }
    if (key.pageUp || (key.ctrl && input === "u")) { setSelected(s => Math.max(0, s - 10)); return; }
    if (key.pageDown || (key.ctrl && input === "d")) { setSelected(s => Math.max(0, Math.min(rows.length - 1, s + 10))); return; }
    if (input === "g") { setSelected(0); return; }
    if (input === "G") { setSelected(Math.max(0, rows.length - 1)); return; }

    if (input === "r") {
      const row = rows[selected];
      if (row) setEditing(row.custom_name ?? "");
      return;
    }
    if (input === "H") {
      // Toggle hide_missing_dirs and persist for next launch.
      setHideMissing(h => {
        const next = !h;
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('hide_missing_dirs', ?)", [next ? "1" : "0"]);
        return next;
      });
      setSelected(0);
      return;
    }
    if (input === "f") {
      const row = rows[selected];
      if (row) {
        db.run("UPDATE sessions SET is_favorite = 1 - is_favorite WHERE session_id = ?", [row.session_id]);
        force(n => n + 1);
      }
      return;
    }
    if (input === "d") {
      const row = rows[selected];
      if (row) {
        db.run("DELETE FROM sessions WHERE session_id = ?", [row.session_id]);
        setSelected(s => Math.max(0, s - 1));
        force(n => n + 1);
      }
      return;
    }
    if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); setSelected(0); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
      setQuery(q => q + input);
      setSelected(0);
      return;
    }
  });

  const fixedH = 3 + 1 + 1 + 1; // header + tabs + search/rename + footer
  const listHeight = Math.max(6, Math.floor((termHeight - fixedH) * 0.55));
  const previewHeight = Math.max(4, termHeight - fixedH - listHeight - 1);
  const currentRow = rows[selected] ?? null;
  const bodyHeight = termHeight - fixedH;

  return (
    <Box flexDirection="column" width={termWidth}>

      <Box borderStyle="round" borderColor={theme.accent} paddingX={2} flexDirection="row">
        <Text color={theme.accent} bold>{`${GLYPHS.diamond}  claude-manager`}</Text>
        <Text color={theme.fgDim}>{"   session resumer"}</Text>
        <Box flexGrow={1} />
        {view === "sessions" ? (
          <>
            <Text color={theme.fgMuted}>{`${rows.length}`}</Text>
            <Text color={theme.fgDim}>{` of ${allRows.length} sessions   `}</Text>
          </>
        ) : (
          <Text color={theme.fgDim}>{`${VIEW_LABEL[view]} view   `}</Text>
        )}
        <Text color={theme.accentDeep}>v0.1.0</Text>
      </Box>

      <TabBar view={view} />

      {view === "sessions" && (
        <>
          {editing !== null ? (
            <RenameBar value={editing} target={currentRow} />
          ) : (
            <SearchBar query={query} filterCwd={filterCwd} total={allRows.length} shown={rows.length} />
          )}
          <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={listHeight} overflow="hidden">
            <List rows={rows} selectedIndex={selected} height={listHeight - 2} width={termWidth - 4} />
          </Box>
          <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={previewHeight} overflow="hidden">
            <Preview row={currentRow} height={previewHeight - 3} width={termWidth - 4} />
          </Box>
        </>
      )}

      {view === "stats" && (
        <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" height={bodyHeight} overflow="hidden">
          <Stats db={db} width={termWidth - 4} height={bodyHeight - 2} />
        </Box>
      )}
      {view === "projects" && (
        <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" height={bodyHeight} overflow="hidden">
          <Projects db={db} width={termWidth - 4} height={bodyHeight - 2} />
        </Box>
      )}
      {view === "help" && (
        <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" height={bodyHeight} overflow="hidden">
          <Help width={termWidth - 4} height={bodyHeight - 2} />
        </Box>
      )}

      <Box paddingX={2}>
        {editing !== null ? (
          <>
            <KeyHint k="↵" label="save" />
            <KeyHint k="Esc" label="cancel" />
          </>
        ) : view === "sessions" ? (
          <>
            <KeyHint k="↵" label="resume" />
            <KeyHint k="r" label="rename" />
            <KeyHint k="f" label="favorite" />
            <KeyHint k="d" label="delete" />
            <KeyHint k="Tab" label="view" />
            <KeyHint k="?" label="help" />
            <KeyHint k="q" label="quit" />
          </>
        ) : (
          <>
            <KeyHint k="Tab" label="next view" />
            <KeyHint k="1/2/3" label="jump" />
            <KeyHint k="?" label="help" />
            <KeyHint k="q" label="quit" />
          </>
        )}
      </Box>
    </Box>
  );
}

function TabBar({ view }: { view: View }) {
  return (
    <Box paddingX={2}>
      {VIEWS.map((v, i) => {
        const active = v === view;
        const num = i + 1;
        return (
          <Box key={v} marginRight={3}>
            <Text color={active ? theme.fgSelected : theme.fgDim} backgroundColor={active ? theme.accent : undefined} bold={active}>
              {` ${num}  ${VIEW_LABEL[v]} `}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function RenameBar({ value, target }: { value: string; target: SessionRow | null }) {
  const targetLabel = target?.custom_name ?? target?.first_prompt ?? "(untitled)";
  return (
    <Box paddingX={2}>
      <Text color={theme.accent} bold>{"rename  "}</Text>
      <Text color={theme.fgDim}>{targetLabel.slice(0, 30)}</Text>
      <Text color={theme.fgDim}>{"  →  "}</Text>
      <Text color={theme.fg} bold>{value}</Text>
      <Text color={theme.accent}>{GLYPHS.cursor}</Text>
    </Box>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <Box marginRight={3}>
      <Text color={theme.accent} bold>{k}</Text>
      <Text color={theme.fgDim}>{` ${label}`}</Text>
    </Box>
  );
}
