import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".claudemanager");

export const paths = {
  root: ROOT,
  db: join(ROOT, "db.sqlite"),
  queue: join(ROOT, "queue.jsonl"),
  hook: join(ROOT, "hook.sh"),
  settings: join(homedir(), ".claude", "settings.json"),
  claudeProjects: join(homedir(), ".claude", "projects"),
} as const;
