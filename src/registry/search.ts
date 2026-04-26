import type { Database } from "bun:sqlite";

export interface SessionRow {
  session_id: string;
  cwd: string;
  launch_argv_json: string;
  env_json: string | null;
  git_branch: string | null;
  git_sha: string | null;
  first_prompt: string | null;
  custom_name: string | null;
  is_favorite: number;
  is_archived: number;
  is_backfilled: number;
  message_count: number;
  token_count: number;
  status: string | null;
  created_at: number;
  last_activity_at: number;
}

export interface ListOpts {
  query: string;
  filterCwd: string | null;
  includeMissing: boolean;
}

export function listSessions(db: Database, opts: ListOpts): SessionRow[] {
  let sql = "SELECT * FROM sessions WHERE is_archived = 0";
  const params: any[] = [];
  if (opts.filterCwd) {
    sql += " AND cwd = ?";
    params.push(opts.filterCwd);
  }
  sql += " ORDER BY is_favorite DESC, last_activity_at DESC";
  const rows = db.query<SessionRow, any[]>(sql).all(...params);
  if (opts.query) {
    return rows
      .map(r => ({ r, score: fuzzyMatch(opts.query, displayText(r)) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.r);
  }
  return rows;
}

export function displayText(r: SessionRow): string {
  return [r.custom_name ?? "", r.first_prompt ?? "", r.cwd].join(" ");
}

export function fuzzyMatch(q: string, s: string): number {
  if (!q) return 1;
  const qq = q.toLowerCase();
  const ss = s.toLowerCase();
  let qi = 0;
  let lastHit = -1;
  let score = 0;
  for (let si = 0; si < ss.length && qi < qq.length; si++) {
    if (ss[si] === qq[qi]) {
      score += lastHit === -1 ? 10 : Math.max(1, 10 - (si - lastHit - 1));
      lastHit = si;
      qi++;
    }
  }
  return qi === qq.length ? score : 0;
}
