import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme } from "./theme.ts";
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

  const listHeight = Math.max(5, Math.floor(termHeight * 0.55));
  const previewHeight = Math.max(3, termHeight - listHeight - 6);
  const currentRow = rows[selected] ?? null;

  return (
    <Box flexDirection="column" width={termWidth}>
      <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent} bold>Claude Manager</Text>
        <Text color={theme.fgDim}>{`   ${rows.length} sessions`}</Text>
      </Box>
      <Box paddingX={1}>
        <SearchBar query={query} filterCwd={filterCwd} total={allRows.length} shown={rows.length} />
      </Box>
      <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={listHeight}>
        <List rows={rows} selectedIndex={selected} height={listHeight - 2} width={termWidth - 4} />
      </Box>
      <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={previewHeight}>
        <Preview row={currentRow} height={previewHeight - 3} />
      </Box>
      <Box paddingX={1}>
        <Text color={theme.fgDim}>
          enter resume   f fav   d delete   / type to search   q quit
        </Text>
      </Box>
    </Box>
  );
}
