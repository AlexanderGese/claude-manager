import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { listSessions } from "../src/registry/search.ts";

let tmp: string;
let db: Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-tags-test-"));
  db = openDb(join(tmp, "test.sqlite"));
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function seed(ids: string[]) {
  const ins = db.prepare(
    "INSERT INTO sessions (session_id, cwd, launch_argv_json, first_prompt, created_at, last_activity_at) VALUES (?,?,?,?,1,1)"
  );
  for (const id of ids) ins.run(id, "/tmp", '["claude"]', `prompt-${id}`);
}

function addTag(sessionId: string, tag: string) {
  db.run("INSERT OR IGNORE INTO tags (session_id, tag) VALUES (?, ?)", [sessionId, tag]);
}

test("listSessions with tags: [] returns all sessions (no filter)", () => {
  seed(["a", "b", "c"]);
  const rows = listSessions(db, { query: "", filterCwd: null, includeMissing: true, tags: [] });
  expect(rows.map(r => r.session_id).sort()).toEqual(["a", "b", "c"]);
});

test("listSessions with tags: ['bug'] returns only sessions with that tag", () => {
  seed(["a", "b", "c"]);
  addTag("a", "bug");
  addTag("c", "bug");
  const rows = listSessions(db, { query: "", filterCwd: null, includeMissing: true, tags: ["bug"] });
  expect(rows.map(r => r.session_id).sort()).toEqual(["a", "c"]);
});

test("listSessions AND semantics: tags ['bug','wip'] requires both tags", () => {
  seed(["a", "b", "c"]);
  addTag("a", "bug");
  addTag("a", "wip");  // a has both
  addTag("b", "bug");   // b has only bug
  addTag("c", "wip");   // c has only wip
  const rows = listSessions(db, { query: "", filterCwd: null, includeMissing: true, tags: ["bug", "wip"] });
  expect(rows.map(r => r.session_id)).toEqual(["a"]);
});

test("listSessions tag filter + query both work together", () => {
  seed(["a", "b"]);
  addTag("a", "bug");
  addTag("b", "bug");
  // Only "a" has prompt matching "alpha".
  db.run("UPDATE sessions SET first_prompt = 'alpha task' WHERE session_id = 'a'");
  db.run("UPDATE sessions SET first_prompt = 'beta task'  WHERE session_id = 'b'");
  const rows = listSessions(db, { query: "alpha", filterCwd: null, includeMissing: true, tags: ["bug"] });
  expect(rows.map(r => r.session_id)).toEqual(["a"]);
});

test("tag toggle: inserting then deleting a tag removes it", () => {
  seed(["x"]);
  addTag("x", "wip");
  db.run("DELETE FROM tags WHERE session_id = ? AND tag = ?", ["x", "wip"]);
  const rows = listSessions(db, { query: "", filterCwd: null, includeMissing: true, tags: ["wip"] });
  expect(rows).toHaveLength(0);
});
