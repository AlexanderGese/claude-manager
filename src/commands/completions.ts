import { openDb } from "../registry/db.ts";

const STATIC = [
  "last", "here", "scan", "doctor", "prune", "uninstall",
  "export", "grep", "auto-name", "theme", "init", "completions",
];

export function run(): void {
  const db = openDb();
  try {
    const names = db.query<{ custom_name: string }, []>(
      "SELECT DISTINCT custom_name FROM sessions WHERE custom_name IS NOT NULL ORDER BY custom_name"
    ).all().map(r => r.custom_name);
    process.stdout.write([...STATIC, ...names].join("\n") + "\n");
  } finally { db.close(); }
}
