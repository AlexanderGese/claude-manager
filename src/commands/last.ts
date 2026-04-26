import { openDb } from "../registry/db.ts";
import { buildResumeLine } from "./pick.ts";

export function run(): void {
  const db = openDb();
  try {
    const row = db.query<any, []>(
      "SELECT * FROM sessions WHERE is_archived = 0 ORDER BY last_activity_at DESC LIMIT 1"
    ).get();
    if (!row) { console.error("no sessions in registry."); process.exit(1); }
    process.stdout.write(buildResumeLine(row));
  } finally { db.close(); }
}
