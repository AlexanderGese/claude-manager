import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { paths } from "../platform/paths.ts";
import { relativeTime } from "../tui/theme.ts";
import { openDb } from "../registry/db.ts";
import { homedir } from "node:os";

const MAX_MATCHES_PER_SESSION = 3;
const SKIPPED_DIRS = new Set(["subagents", "tool-results"]);
const NON_SESSION_FILES = new Set(["skill-injections.jsonl"]);

const isTTY = Boolean(process.stdout.isTTY);

function coral(s: string) { return isTTY ? `\x1b[38;2;217;119;87m${s}\x1b[0m` : s; }
function bold(s: string) { return isTTY ? `\x1b[1m${s}\x1b[0m` : s; }
function dim(s: string) { return isTTY ? `\x1b[2m${s}\x1b[0m` : s; }

function highlightMatch(text: string, pat: string): string {
  if (!isTTY) return text;
  const idx = text.toLowerCase().indexOf(pat.toLowerCase());
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `\x1b[1;38;2;217;119;87m${text.slice(idx, idx + pat.length)}\x1b[0m` +
    text.slice(idx + pat.length)
  );
}

function shortHome(p: string): string {
  const h = homedir();
  return p.startsWith(h) ? "~" + p.slice(h.length) : p;
}

interface Match {
  role: string;
  text: string;
}

interface SessionMatch {
  sessionId: string;
  cwd: string;
  lastTs: number;
  matches: Match[];
  totalMatches: number;
}

function extractMessages(filePath: string): Array<{ role: string; text: string; ts: number }> {
  let raw: string;
  try { raw = readFileSync(filePath, "utf8"); } catch { return []; }
  const out: Array<{ role: string; text: string; ts: number }> = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const role: string = o?.message?.role ?? o?.role ?? "";
    if (!role) continue;
    const content = o?.message?.content ?? o?.content;
    const ts = o?.timestamp ? Math.floor(Date.parse(o.timestamp) / 1000) : 0;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b: any) => b?.type === "text")
        .map((b: any) => String(b.text))
        .join(" ");
    }
    if (text) out.push({ role, text, ts });
  }
  return out;
}

// Build a session_id → cwd map from the registry in a single query.
function buildCwdMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const db = openDb();
    try {
      const rows = db.query<{ session_id: string; cwd: string }, []>(
        "SELECT session_id, cwd FROM sessions"
      ).all();
      for (const r of rows) map.set(r.session_id, r.cwd);
    } finally { db.close(); }
  } catch { /* db might not exist yet */ }
  return map;
}

export function run(args: string[]): void {
  const pattern = args[0];
  if (!pattern) {
    console.error("usage: claude-manager grep <pattern>");
    process.exit(2);
  }

  if (!existsSync(paths.claudeProjects)) {
    console.error(`projects directory not found: ${paths.claudeProjects}`);
    process.exit(1);
  }

  const patLower = pattern.toLowerCase();
  const cwdMap = buildCwdMap();
  const results: SessionMatch[] = [];

  let projectDirs: string[];
  try { projectDirs = readdirSync(paths.claudeProjects); }
  catch { process.exit(1); return; }

  for (const sub of projectDirs) {
    const subPath = join(paths.claudeProjects, sub);
    if (SKIPPED_DIRS.has(sub)) continue;
    let isDir = false;
    try { isDir = statSync(subPath).isDirectory(); } catch { continue; }
    if (!isDir) continue;

    let entries: string[];
    try { entries = readdirSync(subPath); } catch { continue; }

    for (const file of entries) {
      if (extname(file) !== ".jsonl") continue;
      if (NON_SESSION_FILES.has(file)) continue;

      const sessionId = basename(file, ".jsonl");
      const filePath = join(subPath, file);
      const msgs = extractMessages(filePath);

      const matchingMsgs = msgs.filter(m => m.text.toLowerCase().includes(patLower));
      if (matchingMsgs.length === 0) continue;

      const lastTs = msgs.reduce((max, m) => m.ts > max ? m.ts : max, 0);
      const cwd = cwdMap.get(sessionId) ?? subPath;

      results.push({
        sessionId,
        cwd,
        lastTs,
        matches: matchingMsgs.slice(0, MAX_MATCHES_PER_SESSION),
        totalMatches: matchingMsgs.length,
      });
    }
  }

  if (results.length === 0) {
    process.stdout.write("no matches found\n");
    return;
  }

  results.sort((a, b) => b.lastTs - a.lastTs);

  for (const r of results) {
    const age = r.lastTs ? relativeTime(r.lastTs) : "unknown";
    const header = `${r.sessionId.slice(0, 8)}  (${shortHome(r.cwd)} · ${age})`;
    process.stdout.write(bold(coral(header)) + "\n");

    for (const m of r.matches) {
      const roleLabel = m.role === "assistant" ? "asst" : m.role.slice(0, 4).padEnd(4);
      const snippet = m.text.slice(0, 120).replace(/\n/g, " ");
      const highlighted = highlightMatch(snippet, pattern);
      process.stdout.write(`   ${dim(roleLabel)}  : ${highlighted}\n`);
    }

    if (r.totalMatches > MAX_MATCHES_PER_SESSION) {
      process.stdout.write(`   ${dim(`(${r.totalMatches - MAX_MATCHES_PER_SESSION} more matches)`)}\n`);
    }

    process.stdout.write("\n");
  }
}
