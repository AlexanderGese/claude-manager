import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { Database } from "bun:sqlite";
import { resolveBestCwd } from "../platform/argv.ts";
import { openDb } from "../registry/db.ts";
import { paths } from "../platform/paths.ts";

// Matches a Claude session UUID (8-4-4-4-12 hex). Used to recognize
// Pattern-B sessions: a UUID-named directory in a project subdir whose
// top-level <uuid>.jsonl transcript was never written or has been removed.
// These are still resumable via `claude --resume <uuid>` even though we
// can't extract token/message counts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filenames at the project-subdir top level that aren't user-facing sessions.
const NON_SESSION_NAMES = new Set([
  "skill-injections.jsonl",
]);

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

function dirMtime(path: string): number {
  try { return Math.floor(statSync(path).mtimeMs / 1000); }
  catch { return 0; }
}

export function scan(db: Database, projectsRoot: string): number {
  if (!existsSync(projectsRoot)) return 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, cwd, launch_argv_json, first_prompt, is_backfilled,
       message_count, token_count, status, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let projectDirs: string[];
  try { projectDirs = readdirSync(projectsRoot); }
  catch { return 0; }

  for (const sub of projectDirs) {
    const subPath = join(projectsRoot, sub);
    let isDir = false;
    try { isDir = statSync(subPath).isDirectory(); } catch { continue; }
    if (!isDir) continue;

    const cwd = resolveBestCwd(sub);
    let entries: string[];
    try { entries = readdirSync(subPath); } catch { continue; }

    // Track which UUIDs we've seen as top-level files so we don't double-insert
    // them as Pattern-B dirs below.
    const seenIds = new Set<string>();

    // Pattern A: top-level <session-id>.jsonl transcript files.
    for (const file of entries) {
      if (extname(file) !== ".jsonl") continue;
      if (NON_SESSION_NAMES.has(file)) continue;
      const sessionId = basename(file, ".jsonl");
      seenIds.add(sessionId);
      const parsed = parseTranscript(join(subPath, file));
      const result = insert.run(
        sessionId,
        cwd,
        JSON.stringify(["claude"]),
        parsed.first_prompt,
        parsed.message_count,
        parsed.token_count,
        "done",
        parsed.first_ts,
        parsed.last_ts,
      );
      if (result.changes > 0) inserted++;
    }

    // Pattern B: <session-id>/ directories with no matching top-level jsonl.
    // Register them as resumable but with placeholder metadata (no transcript
    // means we can't compute first_prompt / message_count / token_count).
    for (const entry of entries) {
      if (!UUID_RE.test(entry)) continue;
      if (seenIds.has(entry)) continue;
      const innerPath = join(subPath, entry);
      let innerIsDir = false;
      try { innerIsDir = statSync(innerPath).isDirectory(); } catch { continue; }
      if (!innerIsDir) continue;
      const ts = dirMtime(innerPath) || dirMtime(subPath);
      const result = insert.run(
        entry,
        cwd,
        JSON.stringify(["claude"]),
        null,        // first_prompt — unknown, no transcript
        0,           // message_count
        0,           // token_count
        "done",
        ts,
        ts,
      );
      if (result.changes > 0) inserted++;
    }
  }

  return inserted;
}

export function cli() {
  const db = openDb();
  try {
    const n = scan(db, paths.claudeProjects);
    console.log(`scanned: inserted ${n} session(s) from ${paths.claudeProjects}`);
  } finally { db.close(); }
}
