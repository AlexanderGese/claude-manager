import React from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS } from "./theme.ts";

interface Group { title: string; rows: Array<[string, string]> }

const GROUPS: Group[] = [
  {
    title: "navigation",
    rows: [
      ["↑ ↓  /  j k", "move up/down"],
      ["Ctrl-d / Ctrl-u", "page down / page up"],
      ["g / G", "first / last"],
      ["Tab / Shift-Tab", "next / prev view"],
    ],
  },
  {
    title: "actions",
    rows: [
      ["↵ Enter", "resume selected session"],
      ["f", "toggle favorite"],
      ["d", "delete from registry"],
    ],
  },
  {
    title: "search & filter",
    rows: [
      ["type any letter", "fuzzy search live"],
      ["Backspace", "remove last char"],
      ["q  /  Esc  /  Ctrl-c", "quit (no resume)"],
    ],
  },
  {
    title: "shell-only",
    rows: [
      ["cm last", "resume most-recent, no TUI"],
      ["cm here", "TUI filtered to $(pwd)"],
      ["cm <fuzzy>", "auto-resume on unique match"],
      ["claude-manager doctor", "health check"],
      ["claude-manager scan", "rescan ~/.claude/projects"],
      ["claude-manager uninstall", "remove hook + settings patch"],
    ],
  },
];

export function Help({ width }: { width: number; height: number }) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={theme.accent} bold>{`${GLYPHS.diamond}  help`}</Text>
      <Box marginTop={1} flexDirection="column">
        {GROUPS.map(g => (
          <Box key={g.title} flexDirection="column" marginBottom={1}>
            <Text color={theme.accentSoft} bold>{g.title}</Text>
            {g.rows.map(([k, v], i) => (
              <Box key={i}>
                <Text color={theme.accent} bold>{`  ${k.padEnd(22)}`}</Text>
                <Text color={theme.fgDim}>{v}</Text>
              </Box>
            ))}
          </Box>
        ))}
        <Text color={theme.accentDeep}>{`  ${"─".repeat(Math.max(10, width - 8))}`}</Text>
        <Text color={theme.fgDim} italic>
          {"  registry: ~/.claudemanager/db.sqlite   ·   hook: ~/.claudemanager/hook.sh"}
        </Text>
      </Box>
    </Box>
  );
}
