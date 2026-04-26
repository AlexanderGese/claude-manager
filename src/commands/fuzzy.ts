import { openDb } from "../registry/db.ts";
import { listSessions, fuzzyMatch, type SessionRow } from "../registry/search.ts";
import { run as pickRun, buildResumeLine } from "./pick.ts";
import { confirmResume } from "./confirm.ts";

// Multiplier for the gap between best and second-best match score above
// which we treat the top hit as a "clear winner" worth a confirm prompt.
// Below this gap, ambiguity → open TUI pre-filtered.
const CLEAR_WINNER_RATIO = 1.4;

export async function run(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) { pickRun([]); return; }

  const db = openDb();
  let candidates: SessionRow[];
  try {
    candidates = listSessions(db, { query: "", filterCwd: null, includeMissing: true });
  } finally { db.close(); }

  // 1. Exact custom_name match (case-insensitive) → resume immediately, no prompt.
  const lower = query.toLowerCase();
  const exact = candidates.filter(c => (c.custom_name ?? "").toLowerCase() === lower);
  if (exact.length === 1) {
    process.stdout.write(buildResumeLine(exact[0]));
    return;
  }
  if (exact.length > 1) {
    pickRun(["--query", query]);
    return;
  }

  // 2. Fuzzy rank, custom_name weighted heaviest.
  const scored = candidates
    .map(c => {
      const nameScore  = c.custom_name ? fuzzyMatch(query, c.custom_name) * 4 : 0;
      const titleScore = fuzzyMatch(query, c.first_prompt ?? "") * 2;
      const cwdScore   = fuzzyMatch(query, c.cwd);
      return { row: c, score: Math.max(nameScore, titleScore, cwdScore) };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) { pickRun(["--query", query]); return; }

  // 3. Clear top hit → confirm with the user.
  const top = scored[0];
  const second = scored[1];
  const isClearWinner = !second || top.score >= second.score * CLEAR_WINNER_RATIO;

  if (isClearWinner) {
    const result = await confirmResume(top.row, query);
    if (result === "yes")      process.stdout.write(buildResumeLine(top.row));
    else if (result === "tui") pickRun(["--query", query]);
    // "no" → exit silently
    return;
  }

  // 4. Ambiguous → open TUI pre-filtered.
  pickRun(["--query", query]);
}
