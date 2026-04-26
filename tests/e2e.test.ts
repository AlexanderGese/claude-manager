import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { drain } from "../src/registry/drain.ts";
import { listSessions } from "../src/registry/search.ts";
import { buildResumeLine } from "../src/commands/pick.ts";

let tmp: string;
let db: Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-e2e-"));
  db = openDb(join(tmp, "db.sqlite"));
});
afterEach(() => { db.close(); rmSync(tmp, { recursive: true, force: true }); });

test("e2e: queue line → drain → list → resume line", () => {
  const queue = join(tmp, "queue.jsonl");
  writeFileSync(queue, JSON.stringify({
    event: "start",
    ts: 1700000000,
    session_id: "e2e-1",
    cwd: "/home/user/proj",
    argv: ["claude", "--model", "opus", "--mcp-config", "foo.json"],
    env: {},
    git: { branch: "main", sha: "abc" },
    first_prompt: "do the thing",
  }) + "\n");

  drain(db, queue);
  const rows = listSessions(db, { query: "", filterCwd: null, includeMissing: true });
  expect(rows).toHaveLength(1);

  const line = buildResumeLine(rows[0]);
  expect(line).toBe(
    "cd /home/user/proj && exec claude --model opus --mcp-config foo.json --resume e2e-1\n"
  );
});
