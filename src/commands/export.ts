import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../platform/paths.ts";
import { openDb } from "../registry/db.ts";

export function run(args: string[]): void {
  const filtered = args.filter(a => a !== "--md" && a !== "--markdown");
  const wantMd = filtered.length < args.length;
  const id = filtered[0];

  if (!id) { console.error("usage: claude-manager export <id|name> [--md]"); process.exit(2); }

  // Reject obvious path traversals, but allow normal session IDs including dashes.
  if (id.includes("/") || id.includes("..")) {
    console.error("invalid session id");
    process.exit(2);
  }

  if (!existsSync(paths.claudeProjects)) {
    console.error(`projects directory not found: ${paths.claudeProjects}`);
    process.exit(1);
  }

  // Resolve id: try exact custom_name match first, then treat as session_id.
  let resolvedId = id;
  try {
    const db = openDb();
    try {
      const byName = db.query<{ session_id: string }, [string]>(
        "SELECT session_id FROM sessions WHERE custom_name = ? LIMIT 1"
      ).get(id);
      if (byName) resolvedId = byName.session_id;
    } finally { db.close(); }
  } catch { /* if DB isn't ready yet, fall through to session_id lookup */ }

  for (const sub of readdirSync(paths.claudeProjects)) {
    const f = join(paths.claudeProjects, sub, `${resolvedId}.jsonl`);
    if (existsSync(f)) {
      if (wantMd) {
        const md = renderMarkdown(resolvedId, f);
        process.stdout.write(md);
      } else {
        process.stdout.write(readFileSync(f));
      }
      return;
    }
  }

  console.error(`no transcript found for session ${id}`);
  process.exit(1);
}

interface MsgLine {
  role: "user" | "assistant" | "system";
  text: string;
  toolName?: string;
  isToolResult?: boolean;
}

export function renderMarkdown(sessionId: string, transcriptPath: string): string {
  const raw = readFileSync(transcriptPath, "utf8");
  const lines = raw.split("\n").filter(l => l.trim());

  let title = sessionId;
  let cwd = "";
  let isoDate = "";
  let msgCount = 0;
  let tokenCount = 0;
  let firstTs = 0;

  const messages: MsgLine[] = [];

  // Try to look up session metadata from the registry.
  try {
    const db = openDb();
    try {
      const row = db.query<{
        custom_name: string | null;
        first_prompt: string | null;
        cwd: string;
        created_at: number;
        message_count: number;
        token_count: number;
      }, [string]>(
        "SELECT custom_name, first_prompt, cwd, created_at, message_count, token_count FROM sessions WHERE session_id = ?"
      ).get(sessionId);
      if (row) {
        title = row.custom_name ?? row.first_prompt ?? sessionId;
        cwd = row.cwd;
        firstTs = row.created_at;
        msgCount = row.message_count;
        tokenCount = row.token_count;
      }
    } finally { db.close(); }
  } catch { /* best-effort */ }

  // Walk JSONL to extract messages. Metadata from the registry is preferred
  // but we also derive first_ts and counts from the transcript if the registry
  // had nothing.
  for (const line of lines) {
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }

    // Timestamp for first line if registry had none.
    if (!firstTs && o.timestamp) {
      const ts = Date.parse(o.timestamp);
      if (!isNaN(ts)) firstTs = Math.floor(ts / 1000);
    }

    const role: string = o?.message?.role ?? o?.role ?? "";
    if (!role) continue;

    const content = o?.message?.content ?? o?.content;

    if (role === "user" || role === "assistant" || role === "system") {
      if (typeof content === "string") {
        if (!title || title === sessionId) title = content.slice(0, 80);
        messages.push({ role: role as MsgLine["role"], text: content });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text" && typeof block.text === "string") {
            if (!title || title === sessionId) title = block.text.slice(0, 80);
            messages.push({ role: role as MsgLine["role"], text: block.text });
          } else if (block?.type === "tool_use") {
            const input = typeof block.input === "object"
              ? JSON.stringify(block.input, null, 2)
              : String(block.input ?? "");
            messages.push({ role: role as MsgLine["role"], text: input, toolName: block.name ?? "tool" });
          } else if (block?.type === "tool_result") {
            const resultContent = Array.isArray(block.content)
              ? block.content.map((c: any) => c?.text ?? "").join("\n")
              : typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content ?? "");
            messages.push({ role: role as MsgLine["role"], text: resultContent, isToolResult: true });
          }
        }
      }
    }
  }

  // Compute real counts from transcript if registry had zeros.
  if (!msgCount) msgCount = messages.length;

  if (firstTs && !isoDate) {
    isoDate = new Date(firstTs * 1000).toISOString().slice(0, 10);
  }

  const parts: string[] = [];

  // Title
  parts.push(`# ${title}\n`);

  // Metadata line
  const meta: string[] = [];
  if (cwd) meta.push(`\`${cwd}\``);
  if (isoDate) meta.push(isoDate);
  if (msgCount) meta.push(`${msgCount} messages`);
  if (tokenCount) meta.push(`${tokenCount} tokens`);
  if (meta.length) parts.push(`\n${meta.join(" · ")}\n`);

  parts.push("\n---\n");

  // Messages
  for (const msg of messages) {
    parts.push(`\n### ${msg.role}\n`);
    if (msg.toolName) {
      parts.push(`\n\`\`\`${msg.toolName}\n${msg.text}\n\`\`\`\n`);
    } else if (msg.isToolResult) {
      parts.push(`\n\`\`\`tool-result\n${msg.text}\n\`\`\`\n`);
    } else {
      parts.push(`\n${msg.text}\n`);
    }
    parts.push("\n---\n");
  }

  return parts.join("");
}
