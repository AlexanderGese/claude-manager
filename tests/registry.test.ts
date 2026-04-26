import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { listSessions, fuzzyMatch } from "../src/registry/search.ts";

let tmp: string;
let db: Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-test-"));
  db = openDb(join(tmp, "test.sqlite"));
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

test("openDb creates schema + seeds default settings", () => {
  const tables = db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  expect(tables).toContain("sessions");
  expect(tables).toContain("tags");
  expect(tables).toContain("project_favorites");
  expect(tables).toContain("settings");

  const prune = db.query<{ value: string }, []>(
    "SELECT value FROM settings WHERE key='prune_days'"
  ).get();
  expect(prune?.value).toBe("0");
});

function seed(db: Database, rows: Array<{ id: string; cwd: string; first_prompt: string; fav?: 0 | 1; ts?: number }>) {
  const ins = db.prepare(
    "INSERT INTO sessions (session_id, cwd, launch_argv_json, first_prompt, is_favorite, created_at, last_activity_at) VALUES (?,?,?,?,?,?,?)"
  );
  for (const r of rows) ins.run(r.id, r.cwd, "[\"claude\"]", r.first_prompt, r.fav ?? 0, r.ts ?? 1, r.ts ?? 1);
}

test("listSessions returns favorites first, then by last_activity desc", () => {
  seed(db, [
    { id: "a", cwd: "/p1", first_prompt: "first",  fav: 0, ts: 100 },
    { id: "b", cwd: "/p2", first_prompt: "second", fav: 1, ts: 50  },
    { id: "c", cwd: "/p3", first_prompt: "third",  fav: 0, ts: 200 },
  ]);
  const ids = listSessions(db, { query: "", filterCwd: null, includeMissing: true }).map(r => r.session_id);
  expect(ids).toEqual(["b", "c", "a"]);
});

test("listSessions filterCwd narrows to that cwd", () => {
  seed(db, [
    { id: "a", cwd: "/p1", first_prompt: "x", ts: 1 },
    { id: "b", cwd: "/p2", first_prompt: "y", ts: 2 },
  ]);
  const ids = listSessions(db, { query: "", filterCwd: "/p2", includeMissing: true }).map(r => r.session_id);
  expect(ids).toEqual(["b"]);
});

test("fuzzyMatch ranks better matches higher", () => {
  expect(fuzzyMatch("auth", "refactor auth middleware")).toBeGreaterThan(0);
  expect(fuzzyMatch("auth", "claude is great")).toBe(0);
  expect(fuzzyMatch("ATH", "auth"))
    .toBeGreaterThan(fuzzyMatch("ATH", "alphabet"));
});

test("listSessions filters out sessions with missing cwds when includeMissing=false", () => {
  seed(db, [
    { id: "exists",  cwd: tmp,     first_prompt: "real",  ts: 1 },
    { id: "ghost",   cwd: "/no/such/dir/abc", first_prompt: "gone", ts: 2 },
  ]);
  const ids = listSessions(db, { query: "", filterCwd: null, includeMissing: false }).map(r => r.session_id);
  expect(ids).toEqual(["exists"]);
});
