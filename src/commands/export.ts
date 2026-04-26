import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../platform/paths.ts";

export function run(args: string[]): void {
  const id = args[0];
  if (!id) { console.error("usage: claude-manager export <session-id>"); process.exit(2); }
  if (!existsSync(paths.claudeProjects)) {
    console.error(`projects directory not found: ${paths.claudeProjects}`);
    process.exit(1);
  }
  for (const sub of readdirSync(paths.claudeProjects)) {
    const f = join(paths.claudeProjects, sub, `${id}.jsonl`);
    if (existsSync(f)) {
      process.stdout.write(readFileSync(f));
      return;
    }
  }
  console.error(`no transcript found for session ${id}`);
  process.exit(1);
}
