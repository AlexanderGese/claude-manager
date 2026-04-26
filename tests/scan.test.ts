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
});

test("scan is idempotent (re-running inserts 0)", () => {
  expect(scan(db, projects)).toBe(1);
  expect(scan(db, projects)).toBe(0);
});

test("scan handles missing root directory gracefully", () => {
  expect(scan(db, "/nonexistent/path")).toBe(0);
});
