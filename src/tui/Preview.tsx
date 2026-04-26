import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { theme } from "./theme.ts";
import { paths } from "../platform/paths.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  row: SessionRow | null;
  height: number;
}

interface Msg { role: string; text: string }

export function Preview({ row, height }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);

  useEffect(() => {
    if (!row) { setMsgs([]); return; }
    setMsgs(loadMessages(row.session_id, height));
  }, [row?.session_id, height]);

  if (!row) {
    return <Text color={theme.fgDim}>(select a session)</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.fgDim}>
        {row.cwd} • {row.message_count} msgs • {row.token_count.toLocaleString()} tok
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {msgs.length === 0 && <Text color={theme.fgDim}>(no transcript on disk)</Text>}
        {msgs.map((m, i) => (
          <Text key={i} color={m.role === "user" ? theme.accent : theme.fg}>
            {m.role}: {m.text}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function loadMessages(sessionId: string, max: number): Msg[] {
  if (!existsSync(paths.claudeProjects)) return [];
  for (const sub of readdirSync(paths.claudeProjects)) {
    const file = join(paths.claudeProjects, sub, `${sessionId}.jsonl`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const out: Msg[] = [];
    for (const line of lines) {
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const role = o?.message?.role ?? o?.role;
      const content = o?.message?.content ?? o?.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) text = content.map((c: any) => c?.text ?? "").join(" ");
      if (role && text) out.push({ role, text: text.slice(0, 120) });
    }
    return out.slice(-max);
  }
  return [];
}
