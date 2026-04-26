import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { drain } from "../src/registry/drain.ts";

let tmp: string;
let db: Database;
let queue: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-drain-"));
  db = openDb(join(tmp, "test.sqlite"));
  queue = join(tmp, "queue.jsonl");
});
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }); });

test("drain inserts new session from start event", () => {
  writeFileSync(queue, JSON.stringify({
    event: "start",
    ts: 1700000000,
    session_id: "abc-123",
    cwd: "/proj",
    argv: ["claude", "--model", "opus"],
    env: { ANTHROPIC_MODEL: "opus" },
    git: { branch: "main", sha: "deadbeef" },
    first_prompt: "hello",
    origin_host: "hostA",
  }) + "\n");

  drain(db, queue);

  const row = db.query<any, []>("SELECT * FROM sessions WHERE session_id='abc-123'").get();
  expect(row.cwd).toBe("/proj");
  expect(row.git_branch).toBe("main");
  expect(row.first_prompt).toBe("hello");
  expect(JSON.parse(row.launch_argv_json)).toEqual(["claude", "--model", "opus"]);
  expect(row.is_backfilled).toBe(0);
  expect(row.created_at).toBe(1700000000);
  expect(row.last_activity_at).toBe(1700000000);
  expect(readFileSync(queue, "utf8")).toBe("");
});

test("drain stop event updates message_count + token_count + last_activity", () => {
  db.prepare(
    "INSERT INTO sessions (session_id, cwd, launch_argv_json, created_at, last_activity_at) VALUES (?,?,?,?,?)"
  ).run("xyz", "/p", JSON.stringify(["claude"]), 1700000000, 1700000000);

  writeFileSync(queue, JSON.stringify({
    event: "stop", ts: 1700000500, session_id: "xyz",
    message_count: 7, token_count: 1234,
  }) + "\n");

  drain(db, queue);

  const row = db.query<any, []>("SELECT * FROM sessions WHERE session_id='xyz'").get();
  expect(row.message_count).toBe(7);
  expect(row.token_count).toBe(1234);
  expect(row.last_activity_at).toBe(1700000500);
  expect(row.status).toBe("done");
});

test("drain is idempotent — start event for existing session preserves custom_name + favorite", () => {
  db.prepare(
    "INSERT INTO sessions (session_id, cwd, launch_argv_json, created_at, last_activity_at, custom_name, is_favorite) VALUES (?,?,?,?,?,?,?)"
  ).run("dup", "/p", "[\"claude\"]", 1700000000, 1700000000, "MyName", 1);

  writeFileSync(queue, JSON.stringify({
    event: "start", ts: 1700000999, session_id: "dup",
    cwd: "/p", argv: ["claude"], env: {}, git: null, first_prompt: null,
  }) + "\n");

  drain(db, queue);

  const row = db.query<any, []>("SELECT custom_name, is_favorite FROM sessions WHERE session_id='dup'").get();
  expect(row.custom_name).toBe("MyName");
  expect(row.is_favorite).toBe(1);
});

test("drain handles malformed line by skipping it", () => {
  writeFileSync(queue, "not json\n" + JSON.stringify({
    event: "start", ts: 1, session_id: "ok", cwd: "/p", argv: ["claude"], env: {}, git: null, first_prompt: null,
  }) + "\n");
  drain(db, queue);
  const count = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions").get();
  expect(count?.c).toBe(1);
});

test("drain on missing queue file is no-op", () => {
  drain(db, queue);
  const count = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions").get();
  expect(count?.c).toBe(0);
});

test("drain stop event for unknown session_id is silently no-op", () => {
  writeFileSync(queue, JSON.stringify({
    event: "stop", ts: 1700000500, session_id: "ghost",
    message_count: 9, token_count: 99,
  }) + "\n");
  drain(db, queue);
  const count = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions").get();
  expect(count?.c).toBe(0);
  expect(readFileSync(queue, "utf8")).toBe("");
});
