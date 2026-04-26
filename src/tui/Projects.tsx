import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS, langTag, relativeTime } from "./theme.ts";
import type { Database } from "bun:sqlite";

interface Props { db: Database; width: number; height: number }

interface ProjectRow {
  cwd: string;
  sessions: number;
  tokens: number;
  messages: number;
  last_activity_at: number;
}

export function Projects({ db, width, height }: Props) {
  const projects = useMemo<ProjectRow[]>(() => {
    return db.query<ProjectRow, []>(
      `SELECT
         cwd,
         COUNT(*)                              AS sessions,
         COALESCE(SUM(token_count), 0)         AS tokens,
         COALESCE(SUM(message_count), 0)       AS messages,
         MAX(last_activity_at)                 AS last_activity_at
       FROM sessions WHERE is_archived = 0
       GROUP BY cwd
       ORDER BY last_activity_at DESC`
    ).all();
  }, [db]);

  if (projects.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color={theme.fgDim} italic>no projects yet.</Text>
      </Box>
    );
  }

  const slice = projects.slice(0, Math.max(1, height - 3));
  const maxSessions = Math.max(...slice.map(p => p.sessions), 1);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={theme.accent} bold>{`${GLYPHS.diamond}  projects`}</Text>
      <Box marginTop={1} flexDirection="column">
        {slice.map((p, i) => (
          <ProjectLine key={p.cwd} p={p} max={maxSessions} width={width - 4} index={i} />
        ))}
      </Box>
    </Box>
  );
}

function ProjectLine({ p, max, width }: { p: ProjectRow; max: number; width: number; index: number }) {
  const lang = langTag(p.cwd);
  const cwdShort = shorten(p.cwd, Math.max(20, Math.min(48, Math.floor(width * 0.4))));
  const barLen = Math.max(1, Math.floor((p.sessions / max) * 18));
  const bar = "█".repeat(barLen).padEnd(18);
  const when = relativeTime(p.last_activity_at);
  return (
    <Box>
      <Text color={theme.accentDeep}>{lang} </Text>
      <Text color={theme.fg}>{cwdShort.padEnd(48).slice(0, 48)}</Text>
      <Text color={theme.accent}>{` ${bar}`}</Text>
      <Text color={theme.fg}>{`  ${String(p.sessions).padStart(3)}`}</Text>
      <Text color={theme.fgDim}>{` sess  `}</Text>
      <Text color={theme.accentSoft}>{when}</Text>
    </Box>
  );
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}
