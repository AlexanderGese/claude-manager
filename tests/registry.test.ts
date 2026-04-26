import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";

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
