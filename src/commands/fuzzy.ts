import { openDb } from "../registry/db.ts";
import { listSessions } from "../registry/search.ts";
import { run as pickRun, buildResumeLine } from "./pick.ts";

export function run(args: string[]): void {
  const query = args.join(" ");
  const db = openDb();
  try {
    const matches = listSessions(db, { query, filterCwd: null, includeMissing: false });
    if (matches.length === 1) {
      process.stdout.write(buildResumeLine(matches[0]));
      return;
    }
  } finally { db.close(); }
  pickRun(["--query", query]);
}
