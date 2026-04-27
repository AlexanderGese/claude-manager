import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { scan } from "../src/commands/scan.ts";

let tmp: string;
let db: Database;
let projects: string;
const FIXTURE = join(import.meta.dir, "fixtures", "sample.jsonl");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-scan-"));
  db = openDb(join(tmp, "test.sqlite"));
  projects = join(tmp, "projects");
  mkdirSync(join(projects, "-tmp"), { recursive: true });
  copyFileSync(FIXTURE, join(projects, "-tmp", "sess-100.jsonl"));
});
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }); });

test("scan inserts session from jsonl file", () => {
  const inserted = scan(db, projects);
  expect(inserted).toBe(1);
  const row = db.query<any, []>("SELECT * FROM sessions WHERE session_id='sess-100'").get();
  expect(row.cwd).toBe("/tmp");
  expect(row.first_prompt).toBe("backfill me please");
  expect(row.message_count).toBe(3);
  expect(row.token_count).toBe(7);
  expect(row.is_backfilled).toBe(1);
  expect(JSON.parse(row.launch_argv_json)).toEqual(["claude"]);
  expect(row.status).toBe("done");
  // 2026-01-01T10:00:00Z and 2026-01-01T10:01:00Z, in epoch seconds
  expect(row.created_at).toBe(Math.floor(Date.parse("2026-01-01T10:00:00Z") / 1000));
  expect(row.last_activity_at).toBe(Math.floor(Date.parse("2026-01-01T10:01:00Z") / 1000));
});

test("scan is idempotent (re-running inserts 0)", () => {
  expect(scan(db, projects)).toBe(1);
  expect(scan(db, projects)).toBe(0);
});

test("scan handles missing root directory gracefully", () => {
  expect(scan(db, "/nonexistent/path")).toBe(0);
});

test("scan picks up Pattern B sessions: UUID dir with no top-level jsonl", () => {
  // -tmp/<uuid>/ exists but no top-level <uuid>.jsonl. Should still register.
  const uuid = "abcdef01-2345-4789-89ab-cdef01234567";
  mkdirSync(join(projects, "-tmp", uuid), { recursive: true });
  const inserted = scan(db, projects);
  // 1 from the fixture + 1 from the UUID dir
  expect(inserted).toBe(2);
  const row = db.query<any, [string]>("SELECT * FROM sessions WHERE session_id=?").get(uuid);
  expect(row).toBeTruthy();
  expect(row.cwd).toBe("/tmp");
  expect(row.first_prompt).toBeNull();
  expect(row.message_count).toBe(0);
  expect(row.token_count).toBe(0);
  expect(row.is_backfilled).toBe(1);
  expect(row.status).toBe("done");
});

test("scan does not double-insert when both <uuid>.jsonl and <uuid>/ exist", () => {
  // The fixture's session id is "sess-100" (not a UUID), so create a real
  // UUID-shaped pair: the .jsonl file AND the directory.
  const uuid = "11111111-2222-4333-8444-555555555555";
  mkdirSync(join(projects, "-tmp", uuid), { recursive: true });
  copyFileSync(FIXTURE, join(projects, "-tmp", `${uuid}.jsonl`));
  const inserted = scan(db, projects);
  // sess-100 fixture (1) + new uuid (1, only from .jsonl, not from dir)
  expect(inserted).toBe(2);
  const count = db.query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM sessions WHERE session_id=?").get(uuid);
  expect(count?.c).toBe(1);
});

test("scan ignores skill-injections.jsonl", () => {
  // This is a Claude Code internal, not a user session.
  const fs = require("node:fs");
  fs.writeFileSync(join(projects, "-tmp", "skill-injections.jsonl"), "{}\n");
  scan(db, projects);
  const row = db.query<any, []>("SELECT * FROM sessions WHERE session_id='skill-injections'").get();
  expect(row).toBeNull();
});
