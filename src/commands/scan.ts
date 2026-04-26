import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { Database } from "bun:sqlite";
import { resolveBestCwd } from "../platform/argv.ts";

interface ParsedTranscript {
  first_prompt: string | null;
  message_count: number;
  token_count: number;
  first_ts: number;
  last_ts: number;
}

function parseTranscript(path: string): ParsedTranscript {
  const out: ParsedTranscript = {
    first_prompt: null,
    message_count: 0,
    token_count: 0,
    first_ts: 0,
    last_ts: 0,
  };
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return out; }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    out.message_count++;
    const usage = o?.message?.usage ?? o?.usage ?? {};
    out.token_count += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
    const ts = o?.timestamp ? Math.floor(Date.parse(o.timestamp) / 1000) : 0;
    if (ts > 0) {
      if (!out.first_ts) out.first_ts = ts;
      out.last_ts = ts;
    }
    if (!out.first_prompt) {
      const role = o?.message?.role ?? o?.role;
      const content = o?.message?.content ?? o?.content;
      if (role === "user") {
        if (typeof content === "string") out.first_prompt = content.slice(0, 200);
        else if (Array.isArray(content) && content[0]?.text)
          out.first_prompt = String(content[0].text).slice(0, 200);
      }
    }
  }
  if (out.first_ts === 0) {
    try {
      const mtime = Math.floor(statSync(path).mtimeMs / 1000);
      out.first_ts = mtime;
      out.last_ts = mtime;
    } catch { /* ignore */ }
  }
  return out;
}

export function scan(db: Database, projectsRoot: string): number {
  if (!existsSync(projectsRoot)) return 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, cwd, launch_argv_json, first_prompt, is_backfilled,
       message_count, token_count, status, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, 'done', ?, ?)
  `);
  let inserted = 0;
  for (const sub of readdirSync(projectsRoot)) {
    const subPath = join(projectsRoot, sub);
    let isDir = false;
    try { isDir = statSync(subPath).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    const cwd = resolveBestCwd(sub);
    for (const file of readdirSync(subPath)) {
      if (extname(file) !== ".jsonl") continue;
      const sessionId = basename(file, ".jsonl");
      const parsed = parseTranscript(join(subPath, file));
      const result = insert.run(
        sessionId, cwd, JSON.stringify(["claude"]),
        parsed.first_prompt,
        parsed.message_count, parsed.token_count,
        parsed.first_ts, parsed.last_ts,
      );
      if (result.changes > 0) inserted++;
    }
  }
  return inserted;
}
