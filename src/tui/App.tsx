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

// Parse `#tag` tokens out of a raw query string.
function parseQuery(raw: string): { terms: string; tags: string[] } {
  const parts = raw.trim().split(/\s+/);
  const tags: string[] = [];
  const terms: string[] = [];
  for (const p of parts) {
    if (p.startsWith("#") && p.length > 1) {
      tags.push(p.slice(1).toLowerCase());
    } else if (p) {
      terms.push(p);
    }
  }
  return { terms: terms.join(" "), tags };
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
  // When non-null, we are in tag-input mode for rows[selected] (or bulk selection).
  const [tagging, setTagging] = useState<string | null>(null);
  // Bulk-select set of session_ids.
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const [hideMissing, setHideMissing] = useState(() => {
    const v = db.query<{ value: string }, []>(
      "SELECT value FROM settings WHERE key='hide_missing_dirs'"
    ).get()?.value;
    return v === "1";
  });

  const { terms, tags: filterTags } = useMemo(() => parseQuery(query), [query]);

  const allRows = useMemo(
    () => listSessions(db, { query: "", filterCwd: null, includeMissing: !hideMissing }),
    [db, tick, hideMissing]
  );
  const rows = useMemo(
    () => listSessions(db, { query: terms, filterCwd, includeMissing: !hideMissing, tags: filterTags }),
    [db, terms, filterCwd, tick, hideMissing, filterTags]
  );

  // Load all tags once per tick — one query, O(sessions).
  const tagsByRow = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    const tagRows = db.query<{ session_id: string; tag: string }, []>(
      "SELECT session_id, tag FROM tags ORDER BY tag ASC"
    ).all();
    for (const tr of tagRows) {
      const existing = map.get(tr.session_id) ?? [];
      existing.push(tr.tag);
      map.set(tr.session_id, existing);
    }
    return map;
  }, [db, tick]);

  useInput((input, key) => {
    // ── TAG MODE captures everything ──────────────────────────────────
    if (tagging !== null) {
      if (key.escape) { setTagging(null); return; }
      if (key.return) {
        const trimmed = tagging.trim().toLowerCase();
        if (trimmed) {
          // Determine target session_ids: bulk selection or just current row.
          const targetIds: string[] = selection.size > 0
            ? [...selection]
            : (rows[selected] ? [rows[selected].session_id] : []);
          for (const sid of targetIds) {
            // Toggle: if ALL targets have the tag, remove; if any don't, add.
            const existing = tagsByRow.get(sid) ?? [];
            if (existing.includes(trimmed)) {
              db.run("DELETE FROM tags WHERE session_id = ? AND tag = ?", [sid, trimmed]);
            } else {
              db.run("INSERT OR IGNORE INTO tags (session_id, tag) VALUES (?, ?)", [sid, trimmed]);
            }
          }
          force(n => n + 1);
        }
        setTagging(null);
        return;
      }
      if (key.backspace || key.delete) {
        setTagging(s => (s ?? "").slice(0, -1));
        return;
      }
      // Only allow tag-safe characters.
      if (input && !key.ctrl && !key.meta && input.length === 1 && /[\w\-]/.test(input)) {
        setTagging(s => (s ?? "") + input);
      }
      return;
    }

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
    if (key.escape) {
      if (selection.size > 0) { setSelection(new Set()); return; }
      onCancel();
      exit();
      return;
    }
    if ((key.ctrl && input === "c") || input === "q") {
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

    // ── BULK: Space toggles current row in/out of selection ───────────
    if (input === " ") {
      const row = rows[selected];
      if (row) {
        setSelection(prev => {
          const next = new Set(prev);
          if (next.has(row.session_id)) next.delete(row.session_id);
          else next.add(row.session_id);
          return next;
        });
      }
      return;
    }

    // ── BULK: `a` selects all visible rows ────────────────────────────
    if (input === "a") {
      setSelection(new Set(rows.map(r => r.session_id)));
      return;
    }

    // ── DELETE: bulk or single ────────────────────────────────────────
    if (input === "d") {
      if (selection.size > 0) {
        const ids = [...selection];
        const placeholders = ids.map(() => "?").join(", ");
        db.run(`DELETE FROM sessions WHERE session_id IN (${placeholders})`, ids);
        setSelection(new Set());
        setSelected(s => Math.max(0, s - 1));
        force(n => n + 1);
      } else {
        const row = rows[selected];
        if (row) {
          db.run("DELETE FROM sessions WHERE session_id = ?", [row.session_id]);
          setSelected(s => Math.max(0, s - 1));
          force(n => n + 1);
        }
      }
      return;
    }

    // ── TAG: enter tag mode ───────────────────────────────────────────
    if (input === "t") {
      setTagging("");
      return;
    }

    if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); setSelected(0); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
      setQuery(q => q + input);
      setSelected(0);
      return;
    }
  });

  // Header (6: round border 2 + paddingY 2 + 2 content rows) + tabs (1) +
  // search/rename (1) + footer (1)
  const fixedH = 6 + 1 + 1 + 1;
  const listHeight = Math.max(6, Math.floor((termHeight - fixedH) * 0.55));
  const previewHeight = Math.max(4, termHeight - fixedH - listHeight - 1);
  const currentRow = rows[selected] ?? null;
  const bodyHeight = termHeight - fixedH;

  const inBulk = selection.size > 0;

  return (
    <Box flexDirection="column" width={termWidth}>

      <Box
        borderStyle="round"
        borderColor={theme.accent}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Box flexDirection="row">
          <Text color={theme.accent} bold>{`${GLYPHS.diamond}  claude-manager`}</Text>
          <Box flexGrow={1} />
          {view === "sessions" ? (
            <>
              <Text color={theme.fg} bold>{`${rows.length}`}</Text>
              <Text color={theme.fgDim}>{` of ${allRows.length} sessions`}</Text>
            </>
          ) : (
            <Text color={theme.fgDim}>{`${VIEW_LABEL[view]} view`}</Text>
          )}
          <Text color={theme.fgDim}>{"   "}</Text>
          <Text color={theme.accentDeep}>v0.2.0</Text>
        </Box>
        <Box flexDirection="row" marginTop={0}>
          <Text color={theme.fgMuted}>{"   global session resumer for "}</Text>
          <Text color={theme.accentSoft}>claude code</Text>
        </Box>
      </Box>

      <TabBar view={view} />

      {view === "sessions" && (
        <>
          {editing !== null ? (
            <RenameBar value={editing} target={currentRow} />
          ) : tagging !== null ? (
            <TagBar value={tagging} target={currentRow} existingTags={currentRow ? (tagsByRow.get(currentRow.session_id) ?? []) : []} bulkCount={selection.size} />
          ) : (
            <>
              <SearchBar query={query} filterCwd={filterCwd} total={allRows.length} shown={rows.length} />
              {filterTags.length > 0 && (
                <Box paddingX={2}>
                  <Text color={theme.fgDim}>{"filter: "}</Text>
                  {filterTags.map(tag => (
                    <Box key={tag} marginRight={1}>
                      <Text color={theme.accentSoft} bold>{`#${tag}`}</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}
          <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={listHeight} overflow="hidden">
            <List rows={rows} selectedIndex={selected} height={listHeight - 2} width={termWidth - 4} selection={selection} tagsByRow={tagsByRow} />
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
        ) : tagging !== null ? (
          <>
            <KeyHint k="↵" label="save tag" />
            <KeyHint k="Esc" label="cancel" />
          </>
        ) : inBulk ? (
          <>
            <KeyHint k="Space" label="toggle" />
            <KeyHint k="d" label={`delete ${selection.size}`} />
            <KeyHint k="t" label={`tag ${selection.size}`} />
            <KeyHint k="Esc" label="clear" />
            <Text color={theme.fgDim}>{`   <${selection.size} selected>`}</Text>
          </>
        ) : view === "sessions" ? (
          <>
            <KeyHint k="↵" label="resume" />
            <KeyHint k="r" label="rename" />
            <KeyHint k="f" label="favorite" />
            <KeyHint k="t" label="tag" />
            <KeyHint k="d" label="delete" />
            <KeyHint k="Space" label="select" />
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
  // Pad every pill to the same width so the active coral background reads as
  // a chunky uniform tab, not a tight wrapper around the text.
  const labelMax = Math.max(...VIEWS.map(v => VIEW_LABEL[v].length));
  const pillWidth = labelMax + 7; // "  N   <label>  "

  return (
    <Box paddingX={2}>
      {VIEWS.map((v, i) => {
        const active = v === view;
        const num = i + 1;
        const inner = `  ${num}   ${VIEW_LABEL[v]}  `.padEnd(pillWidth);
        return (
          <Box key={v} marginRight={2}>
            <Text
              color={active ? theme.fgSelected : theme.fgDim}
              backgroundColor={active ? theme.accent : undefined}
              bold={active}
            >
              {inner}
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

function TagBar({ value, target, existingTags, bulkCount }: {
  value: string;
  target: SessionRow | null;
  existingTags: string[];
  bulkCount: number;
}) {
  const label = bulkCount > 0
    ? `tag ${bulkCount} sessions`
    : (target?.custom_name ?? target?.first_prompt ?? "(untitled)").slice(0, 24);
  return (
    <Box paddingX={2}>
      <Text color={theme.accent} bold>{"tag  "}</Text>
      <Text color={theme.fgDim}>{label}</Text>
      <Text color={theme.fgDim}>{"  "}</Text>
      {existingTags.map(tag => (
        <Box key={tag} marginRight={1}>
          <Text color={theme.accentSoft}>{`#${tag}`}</Text>
        </Box>
      ))}
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
