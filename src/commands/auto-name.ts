import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../platform/paths.ts";
import { openDb } from "../registry/db.ts";

const MAX_MESSAGES = 5;
const MAX_CHARS_PER_MSG = 200;
const MAX_PER_INVOCATION = 10;
const NAME_RE = /^[a-z][a-z0-9-]+$/;

interface SessionRow {
  session_id: string;
  cwd: string;
  custom_name: string | null;
  first_prompt: string | null;
}

function findTranscriptPath(sessionId: string): string | null {
  if (!existsSync(paths.claudeProjects)) return null;
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  let subs: string[];
  try { subs = readdirSync(paths.claudeProjects); } catch { return null; }
  for (const sub of subs) {
    const f = join(paths.claudeProjects, sub, `${sessionId}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

function buildSnippet(transcriptPath: string): string {
  let raw: string;
  try { raw = readFileSync(transcriptPath, "utf8"); } catch { return ""; }
  const msgs: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const role: string = o?.message?.role ?? o?.role ?? "";
    if (role !== "user" && role !== "assistant") continue;
    const content = o?.message?.content ?? o?.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      text = content
        .filter((b: any) => b?.type === "text")
        .map((b: any) => String(b.text))
        .join(" ");
    }
    if (!text) continue;
    msgs.push(`${role}: ${text.slice(0, MAX_CHARS_PER_MSG)}`);
    if (msgs.length >= MAX_MESSAGES) break;
  }
  return msgs.join("\n");
}

async function callClaude(prompt: string): Promise<string> {
  const proc = Bun.spawn(["claude", "-p", prompt], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`claude exited with code ${exitCode}`);
  return output.trim();
}

export async function autoName(sessionId: string): Promise<string | null> {
  const transcriptPath = findTranscriptPath(sessionId);
  if (!transcriptPath) return null;

  const snippet = buildSnippet(transcriptPath);
  if (!snippet) return null;

  const prompt = [
    "Summarize this Claude Code conversation in 3-5 words, kebab-case, lowercase, no quotes. Output ONLY the name.",
    "",
    snippet,
  ].join("\n");

  let name: string;
  try { name = await callClaude(prompt); }
  catch { return null; }

  name = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!NAME_RE.test(name)) return null;
  return name;
}

export async function run(args: string[]): Promise<void> {
  // Check that claude is on PATH before doing anything.
  const which = Bun.spawnSync(["which", "claude"], { stdout: "pipe", stderr: "pipe" });
  if (which.exitCode !== 0) {
    console.error("error: 'claude' not found on PATH. Install Claude Code first.");
    process.exit(1);
  }

  const doAll = args.includes("--all");
  const sessionId = args.find(a => !a.startsWith("-"));

  if (!doAll && !sessionId) {
    console.error("usage: claude-manager auto-name <id>  OR  claude-manager auto-name --all");
    process.exit(2);
  }

  const db = openDb();
  try {
    if (doAll) {
      const rows = db.query<SessionRow, [number]>(
        "SELECT session_id, cwd, custom_name, first_prompt FROM sessions WHERE custom_name IS NULL ORDER BY last_activity_at DESC LIMIT ?"
      ).all(MAX_PER_INVOCATION);

      let named = 0;
      let failed = 0;
      for (const row of rows) {
        process.stdout.write(`${row.session_id.slice(0, 8)}…  generating name…`);
        const name = await autoName(row.session_id);
        if (name) {
          db.run("UPDATE sessions SET custom_name = ? WHERE session_id = ?", [name, row.session_id]);
          process.stdout.write(`\r${row.session_id.slice(0, 8)}  →  ${name}                  \n`);
          named++;
        } else {
          process.stdout.write(`\r${row.session_id.slice(0, 8)}  →  (failed)                  \n`);
          failed++;
        }
      }

      console.log(`\nDone: ${named} named, ${failed} failed (of ${rows.length} processed)`);
    } else {
      // Single session.
      const row = db.query<SessionRow, [string]>(
        "SELECT session_id, cwd, custom_name, first_prompt FROM sessions WHERE session_id = ?"
      ).get(sessionId!);

      if (!row) {
        console.error(`session not found: ${sessionId}`);
        process.exit(1);
      }

      const name = await autoName(row.session_id);
      if (name) {
        db.run("UPDATE sessions SET custom_name = ? WHERE session_id = ?", [name, row.session_id]);
        console.log(`${row.session_id.slice(0, 8)}  →  ${name}`);
      } else {
        console.error("could not generate a valid name (no transcript or claude returned invalid output)");
        process.exit(1);
      }
    }
  } finally { db.close(); }
}
