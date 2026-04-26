import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme, GLYPHS } from "./theme.ts";
import { List } from "./List.tsx";
import { SearchBar } from "./SearchBar.tsx";
import { Preview } from "./Preview.tsx";
import type { Database } from "bun:sqlite";
import { listSessions, type SessionRow } from "../registry/search.ts";

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

  const [query, setQuery] = useState(initialQuery);
  const [filterCwd] = useState<string | null>(initialFilterCwd);
  const [selected, setSelected] = useState(0);
  const [tick, force] = useState(0);

  const hideMissing = useMemo(() => {
    const v = db.query<{ value: string }, []>(
      "SELECT value FROM settings WHERE key='hide_missing_dirs'"
    ).get()?.value;
    return v === "1";
  }, [db]);

  const allRows = useMemo(
    () => listSessions(db, { query: "", filterCwd: null, includeMissing: !hideMissing }),
    [db, tick, hideMissing]
  );
  const rows = useMemo(
    () => listSessions(db, { query, filterCwd, includeMissing: !hideMissing }),
    [db, query, filterCwd, tick, hideMissing]
  );

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c") || input === "q") {
      onCancel();
      exit();
      return;
    }
    if (key.return) {
      const row = rows[selected];
      if (row) { onSelect(row); exit(); }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelected(s => Math.max(0, s - 1)); return;
    }
    if (key.downArrow || input === "j") {
      setSelected(s => Math.max(0, Math.min(rows.length - 1, s + 1))); return;
    }
    if (key.pageUp || (key.ctrl && input === "u")) {
      setSelected(s => Math.max(0, s - 10)); return;
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      setSelected(s => Math.max(0, Math.min(rows.length - 1, s + 10))); return;
    }
    if (input === "g") { setSelected(0); return; }
    if (input === "G") { setSelected(Math.max(0, rows.length - 1)); return; }
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
    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1));
      setSelected(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
      setQuery(q => q + input);
      setSelected(0);
      return;
    }
  });

  // Layout math: header (3) + search (1) + list (~55%) + preview (rest) + footer (1)
  const fixedH = 3 + 1 + 1;
  const listHeight = Math.max(6, Math.floor((termHeight - fixedH) * 0.55));
  const previewHeight = Math.max(4, termHeight - fixedH - listHeight - 1);
  const currentRow = rows[selected] ?? null;

  return (
    <Box flexDirection="column" width={termWidth}>

      {/* HEADER — coral box, brand mark, version, count */}
      <Box borderStyle="round" borderColor={theme.accent} paddingX={2} flexDirection="row">
        <Text color={theme.accent} bold>{`${GLYPHS.diamond}  claude-manager`}</Text>
        <Text color={theme.fgDim}>{"   session resumer"}</Text>
        <Box flexGrow={1} />
        <Text color={theme.fgMuted}>{`${rows.length}`}</Text>
        <Text color={theme.fgDim}>{` of ${allRows.length} sessions   `}</Text>
        <Text color={theme.accentDeep}>v0.1.0</Text>
      </Box>

      {/* SEARCH BAR */}
      <SearchBar query={query} filterCwd={filterCwd} total={allRows.length} shown={rows.length} />

      {/* LIST PANE */}
      <Box
        borderStyle="round"
        borderColor={theme.borderDim}
        flexDirection="column"
        paddingX={1}
        height={listHeight}
      >
        <List rows={rows} selectedIndex={selected} height={listHeight - 2} width={termWidth - 4} />
      </Box>

      {/* PREVIEW PANE */}
      <Box
        borderStyle="round"
        borderColor={theme.borderDim}
        flexDirection="column"
        paddingX={1}
        height={previewHeight}
      >
        <Preview row={currentRow} height={previewHeight - 3} width={termWidth - 4} />
      </Box>

      {/* FOOTER — coral keys, dim labels */}
      <Box paddingX={2}>
        <KeyHint k="↵" label="resume" />
        <KeyHint k="f" label="favorite" />
        <KeyHint k="d" label="delete" />
        <KeyHint k="g/G" label="top/bottom" />
        <KeyHint k="/" label="search" />
        <KeyHint k="q" label="quit" />
      </Box>
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
