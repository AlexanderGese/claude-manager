import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { theme, GLYPHS } from "./theme.ts";
import { paths } from "../platform/paths.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  row: SessionRow | null;
  height: number;
  width: number;
}

interface Msg { role: string; text: string }

const ROLE_LABEL: Record<string, string> = {
  user:      "you ",
  assistant: "asst",
  system:    "sys ",
  tool:      "tool",
};

export function Preview({ row, height, width }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);

  useEffect(() => {
    if (!row) { setMsgs([]); return; }
    setMsgs(loadMessages(row.session_id, height));
  }, [row?.session_id, height]);

  if (!row) {
    return (
      <Box paddingTop={1} paddingLeft={1}>
        <Text color={theme.fgDim} italic>select a session to preview…</Text>
      </Box>
    );
  }

  // Reserve room for "▎ asst  " (8 chars) plus padding.
  const textWidth = Math.max(20, width - 12);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent} bold>{row.cwd}</Text>
        <Text color={theme.fgDim}>{`   ${row.message_count} msgs   ${formatTokens(row.token_count)} tok`}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {msgs.length === 0 ? (
          <Text color={theme.fgDim} italic>(no transcript on disk)</Text>
        ) : (
          msgs.map((m, i) => {
            const isUser = m.role === "user";
            const label = ROLE_LABEL[m.role] ?? m.role.slice(0, 4).padEnd(4);
            const text = truncate(m.text.replace(/\s+/g, " "), textWidth);
            return (
              <Box key={i}>
                <Text color={isUser ? theme.accent : theme.accentDeep}>{GLYPHS.rowMark} </Text>
                <Text color={isUser ? theme.user : theme.assistant} bold={isUser}>{label}</Text>
                <Text color={theme.fgDim}>  </Text>
                <Text color={isUser ? theme.fg : theme.fgMuted}>{text}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatTokens(n: number): string {
  if (n < 1000)   return String(n);
  if (n < 10000)  return (n / 1000).toFixed(1) + "k";
  if (n < 1_000_000) return Math.round(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1) + "M";
}

function loadMessages(sessionId: string, max: number): Msg[] {
  if (!existsSync(paths.claudeProjects)) return [];
  for (const sub of readdirSync(paths.claudeProjects)) {
    const file = join(paths.claudeProjects, sub, `${sessionId}.jsonl`);
    if (!existsSync(file)) continue;
    let raw: string;
    try { raw = readFileSync(file, "utf8"); } catch { return []; }
    const lines = raw.trim().split("\n");
    const out: Msg[] = [];
    for (const line of lines) {
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const role = o?.message?.role ?? o?.role;
      const content = o?.message?.content ?? o?.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) text = content.map((c: any) => c?.text ?? "").join(" ");
      if (role && text) out.push({ role, text: text.slice(0, 200) });
    }
    return out.slice(-max);
  }
  return [];
}
