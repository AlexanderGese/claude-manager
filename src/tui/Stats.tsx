import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS } from "./theme.ts";
import type { Database } from "bun:sqlite";

interface Props { db: Database; width: number; height: number }

interface Totals {
  sessions: number;
  favorites: number;
  tokens: number;
  messages: number;
  active: number;
  oldest: number | null;
  newest: number | null;
}

interface DailyBucket { day: string; count: number; tokens: number }

const SPARK = " ▁▂▃▄▅▆▇█";

export function Stats({ db, width }: Props) {
  const totals = useMemo<Totals>(() => {
    const r = db.query<any, []>(
      `SELECT
         COUNT(*)                                  AS sessions,
         COALESCE(SUM(is_favorite), 0)             AS favorites,
         COALESCE(SUM(token_count), 0)             AS tokens,
         COALESCE(SUM(message_count), 0)           AS messages,
         COALESCE(SUM(CASE WHEN status IS NULL OR status != 'done' THEN 1 ELSE 0 END), 0) AS active,
         MIN(created_at)                           AS oldest,
         MAX(last_activity_at)                     AS newest
       FROM sessions WHERE is_archived = 0`
    ).get();
    return r as Totals;
  }, [db]);

  const daily = useMemo<DailyBucket[]>(() => {
    const rows = db.query<{ day: string; count: number; tokens: number }, []>(
      `SELECT
         strftime('%Y-%m-%d', last_activity_at, 'unixepoch') AS day,
         COUNT(*)                                              AS count,
         COALESCE(SUM(token_count), 0)                         AS tokens
       FROM sessions WHERE is_archived = 0
       GROUP BY day ORDER BY day ASC`
    ).all();
    return rows;
  }, [db]);

  const last30 = lastNDays(daily, 30);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={theme.accent} bold>{`${GLYPHS.diamond}  overview`}</Text>
      <Box marginTop={1} flexDirection="row">
        <Stat label="sessions"   value={totals.sessions.toLocaleString()} accent />
        <Stat label="favorites"  value={String(totals.favorites)} />
        <Stat label="messages"   value={fmtNum(totals.messages)} />
        <Stat label="tokens"     value={fmtNum(totals.tokens)} accent />
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text color={theme.accentSoft} bold>last 30 days</Text>
        <Box marginTop={1}>
          <SessionSpark buckets={last30} width={Math.max(20, width - 8)} />
        </Box>
        <Box marginTop={0}>
          <Text color={theme.fgDim}>
            {last30[0]?.day ?? "—"}{"   "}
            {GLYPHS.hRule.repeat(Math.max(1, Math.max(20, width - 8) - 24))}
            {"   "}
            {last30[last30.length - 1]?.day ?? "—"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text color={theme.accentSoft} bold>span</Text>
        <Box marginTop={0}>
          <Text color={theme.fgDim}>oldest </Text>
          <Text color={theme.fg}>{fmtDate(totals.oldest)}</Text>
          <Text color={theme.fgDim}>{"   newest "}</Text>
          <Text color={theme.fg}>{fmtDate(totals.newest)}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Box marginRight={5} flexDirection="column">
      <Text color={accent ? theme.accent : theme.fg} bold>{value}</Text>
      <Text color={theme.fgDim}>{label}</Text>
    </Box>
  );
}

function SessionSpark({ buckets, width }: { buckets: DailyBucket[]; width: number }) {
  const w = Math.max(1, width);
  const data = buckets.slice(-w);
  const max = Math.max(1, ...data.map(b => b.count));
  const chars = data.map(b => {
    const idx = Math.round((b.count / max) * (SPARK.length - 1));
    return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
  }).join("");
  return <Text color={theme.accent}>{chars.padEnd(w, " ")}</Text>;
}

function lastNDays(daily: DailyBucket[], n: number): DailyBucket[] {
  const map = new Map(daily.map(d => [d.day, d]));
  const out: DailyBucket[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) ?? { day: key, count: 0, tokens: 0 });
  }
  return out;
}

function fmtNum(n: number): string {
  if (!n)               return "0";
  if (n < 1000)         return String(n);
  if (n < 1_000_000)    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

function fmtDate(unixSec: number | null): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}
