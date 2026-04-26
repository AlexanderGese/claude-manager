import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";

interface StartEvent {
  event: "start";
  ts: number;
  session_id: string;
  cwd: string;
  argv: string[];
  env: Record<string, string> | null;
  git: { branch: string | null; sha: string | null } | null;
  first_prompt: string | null;
  origin_host?: string;
}

interface StopEvent {
  event: "stop";
  ts: number;
  session_id: string;
  message_count: number;
  token_count: number;
  first_prompt?: string | null;
}

type Event = StartEvent | StopEvent;

export function drain(db: Database, queuePath: string): void {
  if (!existsSync(queuePath)) return;
  const raw = readFileSync(queuePath, "utf8");
  if (!raw) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, cwd, launch_argv_json, env_json, git_branch, git_sha,
       first_prompt, created_at, last_activity_at, origin_host, is_backfilled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const updateStop = db.prepare(`
    UPDATE sessions
       SET message_count = ?,
           token_count = ?,
           last_activity_at = ?,
           status = 'done',
           first_prompt = COALESCE(first_prompt, ?)
     WHERE session_id = ?
  `);

  db.transaction(() => {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let evt: Event;
      try { evt = JSON.parse(line) as Event; } catch { continue; }
      if (evt.event === "start") {
        insert.run(
          evt.session_id,
          evt.cwd,
          JSON.stringify(evt.argv),
          evt.env ? JSON.stringify(evt.env) : null,
          evt.git?.branch ?? null,
          evt.git?.sha ?? null,
          evt.first_prompt,
          evt.ts,
          evt.ts,
          evt.origin_host ?? null,
        );
      } else if (evt.event === "stop") {
        updateStop.run(
          evt.message_count,
          evt.token_count,
          evt.ts,
          evt.first_prompt ?? null,
          evt.session_id,
        );
      }
    }
  })();

  writeFileSync(queuePath, "");
}
