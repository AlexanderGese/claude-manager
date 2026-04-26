import { openDb } from "../registry/db.ts";

export function run(): void {
  const db = openDb();
  try {
    const days = Number(
      db.query<{ value: string }, []>("SELECT value FROM settings WHERE key='prune_days'")
        .get()?.value ?? "0"
    );
    if (days <= 0) {
      console.log("prune_days = 0 (disabled). set it via SQLite or future config command.");
      return;
    }
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const result = db.run(
      "DELETE FROM sessions WHERE last_activity_at < ? AND is_favorite = 0 AND custom_name IS NULL",
      [cutoff]
    );
    console.log(`pruned ${result.changes} session(s) older than ${days} days`);
  } finally { db.close(); }
}
