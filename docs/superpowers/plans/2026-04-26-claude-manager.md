# claude-manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a globally-installable CLI (`claude-manager` / `cm`) that auto-captures every Claude Code session's launch context via a shell hook, stores them in a SQLite registry at `~/.claudemanager/`, and provides a fuzzy-searchable Ink TUI to resume any past session in its original directory with its original flags.

**Architecture:** Four loosely-coupled units — (1) a Bash `hook.sh` that fires on `SessionStart`/`Stop` and appends JSON lines to `~/.claudemanager/queue.jsonl`; (2) a Bun + TypeScript CLI binary that drains the queue into `~/.claudemanager/db.sqlite` and renders an Ink TUI; (3) a generated shell function (`cm`) that captures the picker's stdout and `eval`s it so the parent shell actually `cd`s; (4) a postinstall script that wires (1) into `~/.claude/settings.json`, registers (3) instructions, and runs an initial backfill scan over `~/.claude/projects/`.

**Tech Stack:** Bun (runtime + bundler + test runner + bun:sqlite), TypeScript, Ink (React for terminal), Bash (hook script). No external DB driver, no test framework dependencies (bun:test is built-in).

---

## Conventions

- **All file paths in this plan are relative to the repo root** `/home/devlsx/Desktop/actualprojects/claude-manager` unless explicitly absolute.
- **Test runner:** `bun test` (built-in). Test files: `tests/<area>.test.ts`.
- **Run single test file:** `bun test tests/registry.test.ts`.
- **Run single test:** `bun test --test-name-pattern "drain inserts new session"`.
- **Type check:** `bunx tsc --noEmit`.
- **Linter:** none — keep noise low; rely on `tsc --noEmit` and tests.
- **Commit style:** conventional (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- **Commit cadence:** at the end of every task. Each task ends with an explicit commit step.

---

## Repo file map (locked in upfront)

```
claude-manager/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md                                  (Task 28)
├── src/
│   ├── cli.ts                                  router (Task 14)
│   ├── postinstall.ts                          (Task 25)
│   ├── tui/
│   │   ├── App.tsx                             (Task 23)
│   │   ├── List.tsx                            (Task 20)
│   │   ├── Preview.tsx                         (Task 22)
│   │   ├── SearchBar.tsx                       (Task 21)
│   │   └── theme.ts                            (Task 19)
│   ├── commands/
│   │   ├── init.ts                             shell wrapper gen (Task 15)
│   │   ├── doctor.ts                           (Task 16)
│   │   ├── pick.ts                             TUI launcher (Task 24)
│   │   ├── scan.ts                             backfill (Task 12)
│   │   ├── prune.ts                            (Task 18a)
│   │   ├── uninstall.ts                        (Task 18b)
│   │   ├── export.ts                           (Task 18c)
│   │   ├── last.ts                             (Task 18d)
│   │   ├── here.ts                             (Task 18e)
│   │   └── fuzzy.ts                            auto-resume (Task 18f)
│   ├── registry/
│   │   ├── db.ts                               connection + bootstrap (Task 5)
│   │   ├── schema.sql                          (Task 4)
│   │   ├── drain.ts                            queue → sqlite (Task 6)
│   │   └── search.ts                           filter + fuzzy (Task 7)
│   ├── platform/
│   │   ├── settings.ts                         ~/.claude/settings.json patcher (Task 8)
│   │   ├── argv.ts                             parent argv + cwd unsanitize (Task 9)
│   │   └── paths.ts                            $HOME/.claudemanager paths (Task 5)
│   └── hook/
│       └── hook.sh                             shipped as static asset (Task 10)
└── tests/
    ├── registry.test.ts                        Task 5, 6, 7
    ├── drain.test.ts                           Task 6
    ├── settings.test.ts                        Task 8
    ├── argv.test.ts                            Task 9
    ├── hook.test.ts                            Task 11
    ├── scan.test.ts                            Task 12
    ├── init.test.ts                            Task 15
    └── fixtures/
        ├── sample.jsonl                        sample claude transcript
        └── claude-projects/                    fake ~/.claude/projects tree
```

---

# Phase 0 — Scaffolding

## Task 1: Create package.json + tsconfig + gitignore

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "claude-manager",
  "version": "0.1.0",
  "description": "Global session manager + resumer for Claude Code",
  "type": "module",
  "bin": {
    "claude-manager": "./src/cli.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit",
    "postinstall": "bun src/postinstall.ts || true"
  },
  "engines": {
    "bun": ">=1.1.0"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  },
  "files": [
    "src/**/*"
  ]
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["bun-types", "react"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules
*.log
.DS_Store
dist
*.local
.env
.env.*
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lock
git commit -m "chore: scaffold package.json, tsconfig, gitignore"
```

---

## Task 2: Verify test runner works

**Files:**
- Create: `tests/sanity.test.ts`

- [ ] **Step 1: Write a trivial passing test**

```typescript
import { test, expect } from "bun:test";

test("bun:test runner is wired up", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 2: Run the test**

Run: `bun test`
Expected: 1 pass, 0 fail.

- [ ] **Step 3: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tests/sanity.test.ts
git commit -m "test: verify bun:test runner"
```

---

# Phase 1 — Registry layer

## Task 3: Path helpers

**Files:**
- Create: `src/platform/paths.ts`

- [ ] **Step 1: Write paths module**

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".claudemanager");

export const paths = {
  root: ROOT,
  db: join(ROOT, "db.sqlite"),
  queue: join(ROOT, "queue.jsonl"),
  hook: join(ROOT, "hook.sh"),
  settings: join(homedir(), ".claude", "settings.json"),
  claudeProjects: join(homedir(), ".claude", "projects"),
} as const;
```

- [ ] **Step 2: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/platform/paths.ts
git commit -m "feat(platform): add paths helper"
```

---

## Task 4: Schema SQL

**Files:**
- Create: `src/registry/schema.sql`

- [ ] **Step 1: Write schema**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id        TEXT PRIMARY KEY,
  cwd               TEXT NOT NULL,
  launch_argv_json  TEXT NOT NULL,
  env_json          TEXT,
  git_branch        TEXT,
  git_sha           TEXT,
  first_prompt      TEXT,
  custom_name       TEXT,
  is_favorite       INTEGER NOT NULL DEFAULT 0,
  is_archived       INTEGER NOT NULL DEFAULT 0,
  is_backfilled     INTEGER NOT NULL DEFAULT 0,
  message_count     INTEGER NOT NULL DEFAULT 0,
  token_count       INTEGER NOT NULL DEFAULT 0,
  status            TEXT,
  created_at        INTEGER NOT NULL,
  last_activity_at  INTEGER NOT NULL,
  origin_host       TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
  ON sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_cwd
  ON sessions(cwd);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite
  ON sessions(is_favorite) WHERE is_favorite = 1;

CREATE TABLE IF NOT EXISTS tags (
  session_id TEXT NOT NULL,
  tag        TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS project_favorites (
  cwd          TEXT PRIMARY KEY,
  custom_name  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

- [ ] **Step 2: Commit**

```bash
git add src/registry/schema.sql
git commit -m "feat(registry): add schema.sql"
```

---

## Task 5: db.ts — open + bootstrap + seed defaults

**Files:**
- Create: `src/registry/db.ts`
- Create: `tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `db.ts`**

```typescript
import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "../platform/paths.ts";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));

const DEFAULT_SETTINGS: Record<string, string> = {
  prune_days: "0",
  hide_missing_dirs: "1",
  delete_jsonl_with_session: "ask",
  accent_color: "#D97757",
  schema_version: "1",
};

export function openDb(path: string = paths.db): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  seedDefaults(db);
  return db;
}

function seedDefaults(db: Database) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insert.run(k, v);
  }
}
```

- [ ] **Step 4: Run test**

Run: `bun test tests/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/registry/db.ts tests/registry.test.ts
git commit -m "feat(registry): db open + schema bootstrap + default settings"
```

---

## Task 6: Drain — queue.jsonl → SQLite

**Files:**
- Create: `src/registry/drain.ts`
- Create: `tests/drain.test.ts`

Background: each line in `queue.jsonl` is one of two events:

```json
{"event":"start","ts":1745684123,"session_id":"abc-123","cwd":"/p","argv":["claude","--model","opus"],"env":{},"git":{"branch":"main","sha":"d34db33f"},"first_prompt":null,"origin_host":"hostname"}
{"event":"stop","ts":1745684923,"session_id":"abc-123","message_count":42,"token_count":18391}
```

`start` → `INSERT OR IGNORE` (don't clobber existing custom_name/favorite/etc).
`stop` → `UPDATE` last_activity_at, message_count, token_count, status='done'.

After drain: truncate the queue file.

- [ ] **Step 1: Write failing test for start event insert**

```typescript
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
  // seed
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
  drain(db, queue); // queue never written
  const count = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM sessions").get();
  expect(count?.c).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/drain.test.ts`
Expected: FAIL — drain module not found.

- [ ] **Step 3: Write `drain.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";

interface StartEvent {
  event: "start";
  ts: number;
  session_id: string;
  cwd: string;
  argv: string[];
  env: Record<string, string> | null;
  git: { branch: string | null; sha: string | null } | null;
  first_prompt: string | null;
  origin_host?: string;
}

interface StopEvent {
  event: "stop";
  ts: number;
  session_id: string;
  message_count: number;
  token_count: number;
}

type Event = StartEvent | StopEvent;

export function drain(db: Database, queuePath: string): void {
  if (!existsSync(queuePath)) return;
  const raw = readFileSync(queuePath, "utf8");
  if (!raw) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, cwd, launch_argv_json, env_json, git_branch, git_sha,
       first_prompt, created_at, last_activity_at, origin_host, is_backfilled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const updateStop = db.prepare(`
    UPDATE sessions
       SET message_count = ?, token_count = ?, last_activity_at = ?, status = 'done'
     WHERE session_id = ?
  `);

  db.transaction(() => {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let evt: Event;
      try { evt = JSON.parse(line) as Event; } catch { continue; }
      if (evt.event === "start") {
        insert.run(
          evt.session_id,
          evt.cwd,
          JSON.stringify(evt.argv),
          evt.env ? JSON.stringify(evt.env) : null,
          evt.git?.branch ?? null,
          evt.git?.sha ?? null,
          evt.first_prompt,
          evt.ts,
          evt.ts,
          evt.origin_host ?? null,
        );
      } else if (evt.event === "stop") {
        updateStop.run(evt.message_count, evt.token_count, evt.ts, evt.session_id);
      }
    }
  })();

  writeFileSync(queuePath, "");
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/drain.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/registry/drain.ts tests/drain.test.ts
git commit -m "feat(registry): drain queue.jsonl into sqlite (idempotent)"
```

---

## Task 7: Search + filter

**Files:**
- Create: `src/registry/search.ts`
- Modify: `tests/registry.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/registry.test.ts`:

```typescript
import { listSessions, fuzzyMatch } from "../src/registry/search.ts";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/registry.test.ts`
Expected: FAIL — search module not found.

- [ ] **Step 3: Write `search.ts`**

```typescript
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

// Tiny case-insensitive fuzzy match: returns 0 if no match,
// higher = better. Each character of `q` must appear in order in `s`;
// closer-together hits score higher.
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
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/registry/search.ts tests/registry.test.ts
git commit -m "feat(registry): listSessions + fuzzy search"
```

---

# Phase 2 — Platform helpers

## Task 8: settings.ts — non-destructive ~/.claude/settings.json patcher

**Files:**
- Create: `src/platform/settings.ts`
- Create: `tests/settings.test.ts`

The patcher must:
- Read `~/.claude/settings.json` (create if missing).
- Add our two hook entries to `hooks.SessionStart` and `hooks.Stop` arrays.
- Skip if our entries already present (idempotent — match by `command` substring `claudemanager/hook.sh`).
- Preserve every existing key and other hook entries unchanged.
- Provide a corresponding `unpatch` that removes them.

Claude Code hook config shape:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [
          { "type": "command", "command": "/path/to/script" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 1: Write failing tests**

```typescript
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchSettings, unpatchSettings } from "../src/platform/settings.ts";

let tmp: string;
let path: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-settings-"));
  path = join(tmp, "settings.json");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const HOOK = "/abs/path/to/hook.sh";

test("patchSettings creates settings.json if missing", () => {
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe(`${HOOK} start`);
  expect(j.hooks.Stop[0].hooks[0].command).toBe(`${HOOK} stop`);
});

test("patchSettings preserves existing keys + other hooks", () => {
  writeFileSync(path, JSON.stringify({
    theme: "dark",
    hooks: {
      SessionStart: [
        { matcher: ".*", hooks: [{ type: "command", command: "/other/script" }] },
      ],
    },
  }));
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.theme).toBe("dark");
  expect(j.hooks.SessionStart).toHaveLength(2);
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe("/other/script");
  expect(j.hooks.SessionStart[1].hooks[0].command).toBe(`${HOOK} start`);
});

test("patchSettings is idempotent", () => {
  patchSettings(path, HOOK);
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart).toHaveLength(1);
  expect(j.hooks.Stop).toHaveLength(1);
});

test("unpatchSettings removes only our entries", () => {
  writeFileSync(path, JSON.stringify({
    hooks: {
      SessionStart: [
        { matcher: ".*", hooks: [{ type: "command", command: "/other/script" }] },
      ],
    },
  }));
  patchSettings(path, HOOK);
  unpatchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart).toHaveLength(1);
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe("/other/script");
  expect(j.hooks.Stop ?? []).toHaveLength(0);
});

test("unpatchSettings on missing file is no-op", () => {
  unpatchSettings(path, HOOK);
  expect(existsSync(path)).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `settings.ts`**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface HookCmd { type: "command"; command: string }
interface HookEntry { matcher?: string; hooks: HookCmd[] }
interface Settings {
  hooks?: { SessionStart?: HookEntry[]; Stop?: HookEntry[]; [k: string]: HookEntry[] | undefined };
  [k: string]: unknown;
}

function load(path: string): Settings {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")) as Settings; }
  catch { return {}; }
}

function save(path: string, s: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(s, null, 2) + "\n");
}

function entryMatches(entry: HookEntry, hookPath: string): boolean {
  return entry.hooks.some(h => h.command.includes(hookPath));
}

export function patchSettings(path: string, hookPath: string): void {
  const s = load(path);
  s.hooks ??= {};
  for (const [event, arg] of [["SessionStart", "start"], ["Stop", "stop"]] as const) {
    s.hooks[event] ??= [];
    const arr = s.hooks[event]!;
    if (arr.some(e => entryMatches(e, hookPath))) continue;
    arr.push({
      matcher: ".*",
      hooks: [{ type: "command", command: `${hookPath} ${arg}` }],
    });
  }
  save(path, s);
}

export function unpatchSettings(path: string, hookPath: string): void {
  if (!existsSync(path)) return;
  const s = load(path);
  if (!s.hooks) { save(path, s); return; }
  for (const event of ["SessionStart", "Stop"] as const) {
    const arr = s.hooks[event];
    if (!arr) continue;
    s.hooks[event] = arr.filter(e => !entryMatches(e, hookPath));
    if (s.hooks[event]!.length === 0) delete s.hooks[event];
  }
  save(path, s);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/settings.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/platform/settings.ts tests/settings.test.ts
git commit -m "feat(platform): non-destructive ~/.claude/settings.json patcher"
```

---

## Task 9: argv.ts — cwd unsanitize + parent argv reader

**Files:**
- Create: `src/platform/argv.ts`
- Create: `tests/argv.test.ts`

The two utilities here:

1. `unsanitizeCwd(name)` — converts a `~/.claude/projects` directory name back to a real path.
   Claude Code sanitizes paths by replacing `/` with `-`. So `/home/devlsx/Desktop/foo` becomes `-home-devlsx-Desktop-foo`. Best-effort reverse: if the dir name starts with `-`, treat each `-` as a `/`. (Cannot recover paths that contained literal `-` chars perfectly — return best-effort path; caller verifies via `existsSync`.)

2. `readParentArgv()` — returns the argv that launched the parent process.
   - Linux: read `/proc/{ppid}/cmdline`, NUL-separated.
   - macOS: shell out to `ps -o args= -p {ppid}` and split on whitespace.
   - Other: returns `["claude"]`.

- [ ] **Step 1: Write failing tests**

```typescript
import { test, expect } from "bun:test";
import { unsanitizeCwd } from "../src/platform/argv.ts";

test("unsanitizeCwd: simple absolute path", () => {
  expect(unsanitizeCwd("-home-devlsx-Desktop-claude-manager"))
    .toBe("/home/devlsx/Desktop/claude/manager");
});

test("unsanitizeCwd: leading slash preserved", () => {
  expect(unsanitizeCwd("-home-x")).toBe("/home/x");
});

test("unsanitizeCwd: returns input if it does not start with '-'", () => {
  expect(unsanitizeCwd("weird")).toBe("weird");
});
```

(Note: the lossy `claude-manager` → `claude/manager` is acceptable for v1 — the scanner will check `existsSync` against the unsanitized path and a few candidate variants.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/argv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `argv.ts`**

```typescript
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export function unsanitizeCwd(name: string): string {
  if (!name.startsWith("-")) return name;
  return name.replace(/-/g, "/");
}

/**
 * Try the obvious unsanitized path first, then a few fallbacks that
 * preserve known dash-containing path components (e.g. "claude-manager",
 * "next.js", scoped dirs). Returns the first that exists, or the obvious one.
 */
export function resolveCwdCandidates(name: string): string[] {
  if (!name.startsWith("-")) return [name];
  const obvious = name.replace(/-/g, "/");
  const candidates = new Set<string>([obvious]);
  // try with each "-" preserved one at a time; cheap heuristic
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "-") {
      const variant =
        name.slice(0, i).replace(/-/g, "/") + "-" +
        name.slice(i + 1).replace(/-/g, "/");
      candidates.add(variant);
    }
  }
  return [...candidates];
}

export function resolveBestCwd(name: string): string {
  const candidates = resolveCwdCandidates(name);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? name;
}

export function readParentArgv(): string[] {
  const ppid = process.ppid;
  try {
    if (platform() === "linux") {
      const raw = readFileSync(`/proc/${ppid}/cmdline`);
      const parts = raw
        .toString("utf8")
        .split("\0")
        .filter(s => s.length > 0);
      return parts.length ? parts : ["claude"];
    }
    if (platform() === "darwin") {
      const out = execSync(`ps -o args= -p ${ppid}`, { encoding: "utf8" }).trim();
      return out ? out.split(/\s+/) : ["claude"];
    }
  } catch { /* fall through */ }
  return ["claude"];
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/argv.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/platform/argv.ts tests/argv.test.ts
git commit -m "feat(platform): cwd unsanitize + parent argv reader"
```

---

# Phase 3 — Hook script

## Task 10: hook.sh

**Files:**
- Create: `src/hook/hook.sh`

The hook is a Bash script invoked by Claude Code with one positional arg (`start` or `stop`) and a JSON payload on stdin. It must:

- Never write to stdout / stderr.
- Always exit 0 even on internal errors.
- Append exactly one JSON line to `~/.claudemanager/queue.jsonl`.

Hook input shape per Claude Code docs:
```json
// SessionStart: { "session_id": "abc-123", "cwd": "/p", "transcript_path": "/path/to.jsonl" }
// Stop:         { "session_id": "abc-123", "cwd": "/p", "transcript_path": "/path/to.jsonl" }
```

- [ ] **Step 1: Write `hook.sh`**

```bash
#!/usr/bin/env bash
# claude-manager hook — captures session metadata.
# Invoked by Claude Code on SessionStart ($1=start) and Stop ($1=stop).
# MUST be silent: never print to stdout or stderr.

set -u
event="${1:-}"
queue="${HOME}/.claudemanager/queue.jsonl"
mkdir -p "$(dirname "$queue")" 2>/dev/null || exit 0

# Read hook input JSON from stdin (best-effort).
input=""
if [ ! -t 0 ]; then
  input=$(cat 2>/dev/null || true)
fi

extract() {
  # extract "key" string value from one-line JSON $input
  local key=$1
  printf '%s' "$input" | sed -n "s/.*\"${key}\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n1
}

session_id=$(extract session_id)
cwd=$(extract cwd)
transcript=$(extract transcript_path)
ts=$(date +%s)
host=$(hostname 2>/dev/null || echo unknown)

[ -z "$session_id" ] && exit 0

# Helper: JSON-escape a string for embedding in a JSON value.
jesc() {
  printf '%s' "$1" | python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read())[1:-1])' 2>/dev/null \
    || printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

if [ "$event" = "start" ]; then
  # Parent argv
  argv_json='["claude"]'
  if [ -r "/proc/${PPID}/cmdline" ]; then
    argv_json=$(tr '\0' '\n' < "/proc/${PPID}/cmdline" | python3 -c 'import sys,json; print(json.dumps([l.rstrip("\n") for l in sys.stdin if l.strip()]))' 2>/dev/null) \
      || argv_json='["claude"]'
  elif command -v ps >/dev/null 2>&1; then
    args=$(ps -o args= -p "$PPID" 2>/dev/null || true)
    if [ -n "$args" ]; then
      argv_json=$(printf '%s' "$args" | python3 -c 'import sys,json,shlex; print(json.dumps(shlex.split(sys.stdin.read().strip())))' 2>/dev/null) \
        || argv_json='["claude"]'
    fi
  fi

  # Env allow-list
  env_json='{}'
  env_json=$(python3 -c 'import os,json; keys=["ANTHROPIC_MODEL","ANTHROPIC_BASE_URL","CLAUDE_CODE_USE_BEDROCK","CLAUDE_CODE_USE_VERTEX","CLAUDE_CODE_MAX_OUTPUT_TOKENS"]; print(json.dumps({k:os.environ[k] for k in keys if k in os.environ}))' 2>/dev/null || echo '{}')

  # Git info
  branch=""
  sha=""
  if [ -n "$cwd" ] && [ -d "$cwd" ]; then
    branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    sha=$(git -C "$cwd" rev-parse HEAD 2>/dev/null || true)
  fi

  # First prompt: skip on start (we don't have it yet); will be populated by stop event from transcript
  printf '{"event":"start","ts":%s,"session_id":"%s","cwd":"%s","argv":%s,"env":%s,"git":{"branch":"%s","sha":"%s"},"first_prompt":null,"origin_host":"%s"}\n' \
    "$ts" "$(jesc "$session_id")" "$(jesc "$cwd")" "$argv_json" "$env_json" "$(jesc "$branch")" "$(jesc "$sha")" "$(jesc "$host")" \
    >> "$queue" 2>/dev/null || true

elif [ "$event" = "stop" ]; then
  msg_count=0
  tok_count=0
  first_prompt=""
  if [ -n "$transcript" ] && [ -r "$transcript" ]; then
    read -r msg_count tok_count first_prompt <<<"$(python3 -c '
import sys, json
msgs = 0; toks = 0; first = ""
with open(sys.argv[1]) as f:
    for line in f:
        if not line.strip(): continue
        try: o = json.loads(line)
        except: continue
        msgs += 1
        u = (o.get("message") or {}).get("usage") or {}
        toks += int(u.get("input_tokens",0)) + int(u.get("output_tokens",0))
        if not first and (o.get("message") or {}).get("role") == "user":
            content = (o.get("message") or {}).get("content")
            if isinstance(content, str):
                first = content[:200]
            elif isinstance(content, list) and content and isinstance(content[0], dict):
                first = (content[0].get("text") or "")[:200]
print(msgs, toks, first.replace("\n", " "))
' "$transcript" 2>/dev/null || echo "0 0 ")"
  fi
  printf '{"event":"stop","ts":%s,"session_id":"%s","message_count":%s,"token_count":%s,"first_prompt":"%s"}\n' \
    "$ts" "$(jesc "$session_id")" "${msg_count:-0}" "${tok_count:-0}" "$(jesc "${first_prompt:-}")" \
    >> "$queue" 2>/dev/null || true
fi

exit 0
```

- [ ] **Step 2: Make executable + sanity-run**

Run: `chmod +x src/hook/hook.sh && echo '{"session_id":"test","cwd":"/tmp","transcript_path":""}' | src/hook/hook.sh start && tail -1 ~/.claudemanager/queue.jsonl 2>/dev/null && rm -f ~/.claudemanager/queue.jsonl`
Expected: a JSON line is printed showing the start event was appended.

- [ ] **Step 3: Commit**

```bash
git add src/hook/hook.sh
git commit -m "feat(hook): bash hook for SessionStart + Stop events"
```

---

## Task 11: Hook integration test

**Files:**
- Create: `tests/hook.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { test, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
const HOOK = join(import.meta.dir, "..", "src", "hook", "hook.sh");

beforeEach(() => { home = mkdtempSync(join(tmpdir(), "cm-hook-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

function runHook(arg: "start" | "stop", input: object) {
  execSync(`bash "${HOOK}" ${arg}`, {
    input: JSON.stringify(input),
    env: { ...process.env, HOME: home },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("start event writes one JSON line to queue.jsonl", () => {
  runHook("start", { session_id: "abc", cwd: "/tmp", transcript_path: "" });
  const queue = join(home, ".claudemanager", "queue.jsonl");
  expect(existsSync(queue)).toBe(true);
  const lines = readFileSync(queue, "utf8").trim().split("\n");
  expect(lines).toHaveLength(1);
  const evt = JSON.parse(lines[0]);
  expect(evt.event).toBe("start");
  expect(evt.session_id).toBe("abc");
  expect(evt.cwd).toBe("/tmp");
  expect(Array.isArray(evt.argv)).toBe(true);
});

test("stop event with transcript counts messages + tokens", () => {
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, [
    JSON.stringify({ message: { role: "user",      content: "hello",  usage: { input_tokens: 5, output_tokens: 0 } } }),
    JSON.stringify({ message: { role: "assistant", content: "hi",     usage: { input_tokens: 0, output_tokens: 3 } } }),
  ].join("\n") + "\n");
  runHook("stop", { session_id: "abc", cwd: "/tmp", transcript_path: transcript });
  const queue = join(home, ".claudemanager", "queue.jsonl");
  const evt = JSON.parse(readFileSync(queue, "utf8").trim());
  expect(evt.event).toBe("stop");
  expect(evt.message_count).toBe(2);
  expect(evt.token_count).toBe(8);
  expect(evt.first_prompt).toBe("hello");
});

test("missing session_id is silently dropped", () => {
  runHook("start", { cwd: "/tmp", transcript_path: "" } as any);
  const queue = join(home, ".claudemanager", "queue.jsonl");
  expect(existsSync(queue)).toBe(false);
});
```

- [ ] **Step 2: Run tests**

Run: `bun test tests/hook.test.ts`
Expected: 3 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/hook.test.ts
git commit -m "test(hook): integration tests for start + stop events"
```

---

# Phase 4 — Scanner (backfill)

## Task 12: scan.ts

**Files:**
- Create: `src/commands/scan.ts`
- Create: `tests/scan.test.ts`
- Create: `tests/fixtures/sample.jsonl`

`scan` walks `~/.claude/projects/*/` and inserts each `*.jsonl` file as a backfilled session. Uses `INSERT OR IGNORE` keyed on `session_id` (filename stem) — so re-running is safe.

- [ ] **Step 1: Write fixture transcript**

```jsonl
{"sessionId":"sess-100","message":{"role":"user","content":"backfill me please","usage":{"input_tokens":3,"output_tokens":0}},"timestamp":"2026-01-01T10:00:00Z"}
{"sessionId":"sess-100","message":{"role":"assistant","content":"sure","usage":{"input_tokens":0,"output_tokens":2}},"timestamp":"2026-01-01T10:00:05Z"}
{"sessionId":"sess-100","message":{"role":"user","content":"and again","usage":{"input_tokens":2,"output_tokens":0}},"timestamp":"2026-01-01T10:01:00Z"}
```

(Save as `tests/fixtures/sample.jsonl`.)

- [ ] **Step 2: Write failing scan test**

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/scan.test.ts`
Expected: FAIL — scan module not found.

- [ ] **Step 4: Write `scan.ts`**

```typescript
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { Database } from "bun:sqlite";
import { resolveBestCwd } from "../platform/argv.ts";

interface ParsedTranscript {
  first_prompt: string | null;
  message_count: number;
  token_count: number;
  first_ts: number;
  last_ts: number;
}

function parseTranscript(path: string): ParsedTranscript {
  const out: ParsedTranscript = {
    first_prompt: null,
    message_count: 0,
    token_count: 0,
    first_ts: 0,
    last_ts: 0,
  };
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return out; }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    out.message_count++;
    const usage = o?.message?.usage ?? o?.usage ?? {};
    out.token_count += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
    const ts = o?.timestamp ? Math.floor(Date.parse(o.timestamp) / 1000) : 0;
    if (ts > 0) {
      if (!out.first_ts) out.first_ts = ts;
      out.last_ts = ts;
    }
    if (!out.first_prompt) {
      const role = o?.message?.role ?? o?.role;
      const content = o?.message?.content ?? o?.content;
      if (role === "user") {
        if (typeof content === "string") out.first_prompt = content.slice(0, 200);
        else if (Array.isArray(content) && content[0]?.text)
          out.first_prompt = String(content[0].text).slice(0, 200);
      }
    }
  }
  if (out.first_ts === 0) {
    try {
      const mtime = Math.floor(statSync(path).mtimeMs / 1000);
      out.first_ts = mtime;
      out.last_ts = mtime;
    } catch { /* ignore */ }
  }
  return out;
}

export function scan(db: Database, projectsRoot: string): number {
  if (!existsSync(projectsRoot)) return 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (session_id, cwd, launch_argv_json, first_prompt, is_backfilled,
       message_count, token_count, status, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, 'done', ?, ?)
  `);
  let inserted = 0;
  for (const sub of readdirSync(projectsRoot)) {
    const subPath = join(projectsRoot, sub);
    let isDir = false;
    try { isDir = statSync(subPath).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    const cwd = resolveBestCwd(sub);
    for (const file of readdirSync(subPath)) {
      if (extname(file) !== ".jsonl") continue;
      const sessionId = basename(file, ".jsonl");
      const parsed = parseTranscript(join(subPath, file));
      const result = insert.run(
        sessionId, cwd, JSON.stringify(["claude"]),
        parsed.first_prompt,
        parsed.message_count, parsed.token_count,
        parsed.first_ts, parsed.last_ts,
      );
      if (result.changes > 0) inserted++;
    }
  }
  return inserted;
}
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/scan.test.ts`
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/scan.ts tests/scan.test.ts tests/fixtures/sample.jsonl
git commit -m "feat(scan): backfill sessions from ~/.claude/projects"
```

---

# Phase 5 — CLI router + non-TUI subcommands

## Task 13: cli.ts router

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Write router**

```typescript
#!/usr/bin/env bun
import { paths } from "./platform/paths.ts";
import { openDb } from "./registry/db.ts";
import { drain } from "./registry/drain.ts";

const HELP = `
claude-manager — global session manager for Claude Code

Usage:
  claude-manager [<query>]            open TUI (or auto-resume on unique fuzzy match)
  claude-manager here                 open TUI filtered to $(pwd)
  claude-manager last                 resume the most recent session anywhere
  claude-manager pick                 internal: print "cd && exec" line on stdout
  claude-manager scan                 backfill from ~/.claude/projects
  claude-manager init [bash|zsh|fish] print shell wrapper for eval
  claude-manager doctor               health check
  claude-manager prune                delete sessions older than prune_days
  claude-manager export <id>          dump session transcript
  claude-manager uninstall            remove hook + settings.json patch
  claude-manager --help               this help
  claude-manager --version            version
`;

const VERSION = "0.1.0";

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "";
  const rest = argv.slice(1);

  if (cmd === "--help" || cmd === "-h") { process.stdout.write(HELP); return; }
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }

  // For every CLI invocation, drain the queue first so the registry is fresh.
  // Open a brief db scope here only for drain; commands that need it open their own.
  {
    const db = openDb();
    try { drain(db, paths.queue); } finally { db.close(); }
  }

  switch (cmd) {
    case "init":      return (await import("./commands/init.ts")).run(rest);
    case "doctor":    return (await import("./commands/doctor.ts")).run();
    case "scan":      return (await import("./commands/scan.ts")).cli();
    case "pick":      return (await import("./commands/pick.ts")).run(rest);
    case "here":      return (await import("./commands/here.ts")).run();
    case "last":      return (await import("./commands/last.ts")).run();
    case "prune":     return (await import("./commands/prune.ts")).run();
    case "export":    return (await import("./commands/export.ts")).run(rest);
    case "uninstall": return (await import("./commands/uninstall.ts")).run();
    case "":          return (await import("./commands/pick.ts")).run([]);
    default:          return (await import("./commands/fuzzy.ts")).run([cmd, ...rest]);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Make executable + sanity check (will fail because subcommands don't exist yet — acceptable)**

Run: `chmod +x src/cli.ts && bun src/cli.ts --version`
Expected: `0.1.0` printed.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): router with help, version, and subcommand dispatch"
```

---

## Task 14: scan command CLI wrapper

**Files:**
- Modify: `src/commands/scan.ts` — add `cli()` export
- Modify: `tests/scan.test.ts` — no change (already covers the function)

- [ ] **Step 1: Append `cli()` to `src/commands/scan.ts`**

Add at the end of the file:

```typescript
import { paths } from "../platform/paths.ts";

export function cli() {
  const db = openDb();
  try {
    const n = scan(db, paths.claudeProjects);
    console.log(`scanned: inserted ${n} session(s) from ${paths.claudeProjects}`);
  } finally { db.close(); }
}
```

Add the new import at the top of `scan.ts`:

```typescript
import { openDb } from "../registry/db.ts";
```

- [ ] **Step 2: Run scan via CLI (smoke)**

Run: `bun src/cli.ts scan`
Expected: prints `scanned: inserted N session(s) from /home/devlsx/.claude/projects` (N depends on how many real sessions exist).

- [ ] **Step 3: Re-run tests to confirm nothing broke**

Run: `bun test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/commands/scan.ts
git commit -m "feat(cli): wire scan subcommand"
```

---

## Task 15: init — generate shell wrapper

**Files:**
- Create: `src/commands/init.ts`
- Create: `tests/init.test.ts`

The wrapper function captures `claude-manager pick`'s stdout and `eval`s it. Three shell variants. The wrapper also defines the alias `cm` → the function.

Bash/zsh function:
```bash
cm() {
  local out
  out=$(command claude-manager pick "$@") || return $?
  [ -n "$out" ] && eval "$out"
}
```

Fish function:
```fish
function cm
  set -l out (command claude-manager pick $argv)
  or return $status
  test -n "$out"; and eval $out
end
```

- [ ] **Step 1: Write failing tests**

```typescript
import { test, expect } from "bun:test";
import { renderInit } from "../src/commands/init.ts";

test("bash variant defines cm() and aliases", () => {
  const out = renderInit("bash");
  expect(out).toContain("cm()");
  expect(out).toContain("claude-manager pick");
  expect(out).toContain("eval");
});

test("zsh variant uses bash syntax (zsh-compatible)", () => {
  expect(renderInit("zsh")).toBe(renderInit("bash"));
});

test("fish variant uses fish syntax", () => {
  const out = renderInit("fish");
  expect(out).toContain("function cm");
  expect(out).toContain("end");
});

test("unknown shell defaults to bash with comment", () => {
  const out = renderInit("nope" as any);
  expect(out).toContain("# falling back");
  expect(out).toContain("cm()");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test tests/init.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `init.ts`**

```typescript
type Shell = "bash" | "zsh" | "fish";

const POSIX_FN = `cm() {
  local out
  out=$(command claude-manager pick "$@") || return $?
  [ -n "$out" ] && eval "$out"
}
`;

const FISH_FN = `function cm
  set -l out (command claude-manager pick $argv)
  or return $status
  test -n "$out"; and eval $out
end
`;

export function renderInit(shell: Shell | string): string {
  switch (shell) {
    case "bash":
    case "zsh":
      return POSIX_FN;
    case "fish":
      return FISH_FN;
    default:
      return `# falling back to bash-style wrapper for shell '${shell}'\n` + POSIX_FN;
  }
}

export function run(args: string[]): void {
  const shell = (args[0] ?? detectShell()) as Shell;
  process.stdout.write(renderInit(shell));
}

function detectShell(): Shell {
  const s = process.env.SHELL ?? "";
  if (s.endsWith("/fish")) return "fish";
  if (s.endsWith("/zsh"))  return "zsh";
  return "bash";
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/init.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Smoke check**

Run: `bun src/cli.ts init zsh`
Expected: `cm()` function definition printed.

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts tests/init.test.ts
git commit -m "feat(cli): init subcommand prints shell wrapper for eval"
```

---

## Task 16: doctor

**Files:**
- Create: `src/commands/doctor.ts`

Simple checks; print PASS/FAIL lines and exit 0 (warnings) or 1 (failures).

- [ ] **Step 1: Write `doctor.ts`**

```typescript
import { existsSync, readFileSync, statSync } from "node:fs";
import { paths } from "../platform/paths.ts";

interface Check { name: string; ok: boolean; detail: string }

function checks(): Check[] {
  const out: Check[] = [];

  // 1. .claudemanager dir
  out.push({
    name: "registry directory",
    ok: existsSync(paths.root),
    detail: paths.root,
  });

  // 2. hook.sh
  out.push({
    name: "hook.sh installed",
    ok: existsSync(paths.hook) && (statSync(paths.hook).mode & 0o111) !== 0,
    detail: paths.hook,
  });

  // 3. db.sqlite
  out.push({
    name: "registry db",
    ok: existsSync(paths.db),
    detail: paths.db,
  });

  // 4. settings.json patched
  let patched = false;
  if (existsSync(paths.settings)) {
    try {
      const j = JSON.parse(readFileSync(paths.settings, "utf8"));
      const hooks = j?.hooks ?? {};
      const allEntries = [
        ...(hooks.SessionStart ?? []),
        ...(hooks.Stop ?? []),
      ];
      patched = allEntries.some((e: any) =>
        (e.hooks ?? []).some((h: any) =>
          typeof h.command === "string" && h.command.includes(".claudemanager/hook.sh")
        )
      );
    } catch { /* leave false */ }
  }
  out.push({ name: "settings.json patched", ok: patched, detail: paths.settings });

  // 5. claude binary on PATH
  let claude = false;
  try {
    const p = (process.env.PATH ?? "").split(":");
    claude = p.some(d => d && existsSync(`${d}/claude`));
  } catch { /* ignore */ }
  out.push({ name: "claude on PATH", ok: claude, detail: "which claude" });

  return out;
}

export function run(): void {
  const results = checks();
  let failed = 0;
  for (const c of results) {
    const tag = c.ok ? "OK  " : "FAIL";
    process.stdout.write(`[${tag}] ${c.name.padEnd(28)} ${c.detail}\n`);
    if (!c.ok) failed++;
  }
  process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
  if (failed > 0) {
    process.stdout.write("\nFix suggestions:\n");
    process.stdout.write("  - run `claude-manager` postinstall again, or `npm i -g claude-manager`\n");
    process.stdout.write("  - add `eval \"$(claude-manager init zsh)\"` to your ~/.zshrc\n");
    process.exit(1);
  }
}
```

- [ ] **Step 2: Smoke run**

Run: `bun src/cli.ts doctor`
Expected: prints checks. Several may be FAIL (postinstall hasn't run yet). Exit code 1 is fine.

- [ ] **Step 3: Commit**

```bash
git add src/commands/doctor.ts
git commit -m "feat(cli): doctor health check"
```

---

## Task 17: prune, uninstall, export, last, here, fuzzy (small commands)

**Files:**
- Create: `src/commands/prune.ts`
- Create: `src/commands/uninstall.ts`
- Create: `src/commands/export.ts`
- Create: `src/commands/last.ts`
- Create: `src/commands/here.ts`
- Create: `src/commands/fuzzy.ts`

- [ ] **Step 1: Write `prune.ts`**

```typescript
import { openDb } from "../registry/db.ts";

export function run(): void {
  const db = openDb();
  try {
    const days = Number(
      db.query<{ value: string }, []>("SELECT value FROM settings WHERE key='prune_days'")
        .get()?.value ?? "0"
    );
    if (days <= 0) {
      console.log("prune_days = 0 (disabled). set it via SQLite or future config command.");
      return;
    }
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const result = db.run(
      "DELETE FROM sessions WHERE last_activity_at < ? AND is_favorite = 0 AND custom_name IS NULL",
      [cutoff]
    );
    console.log(`pruned ${result.changes} session(s) older than ${days} days`);
  } finally { db.close(); }
}
```

- [ ] **Step 2: Write `uninstall.ts`**

```typescript
import { existsSync, unlinkSync } from "node:fs";
import { paths } from "../platform/paths.ts";
import { unpatchSettings } from "../platform/settings.ts";

export function run(): void {
  unpatchSettings(paths.settings, paths.hook);
  if (existsSync(paths.hook)) unlinkSync(paths.hook);
  console.log("uninstalled hook + settings patch.");
  console.log(`registry preserved at: ${paths.root}`);
  console.log(`reminder: remove \`eval "$(claude-manager init ...)"\` from your shell rc.`);
}
```

- [ ] **Step 3: Write `export.ts`**

```typescript
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../platform/paths.ts";

export function run(args: string[]): void {
  const id = args[0];
  if (!id) { console.error("usage: claude-manager export <session-id>"); process.exit(2); }
  for (const sub of readdirSync(paths.claudeProjects)) {
    const f = join(paths.claudeProjects, sub, `${id}.jsonl`);
    if (existsSync(f)) {
      process.stdout.write(readFileSync(f));
      return;
    }
  }
  console.error(`no transcript found for session ${id}`);
  process.exit(1);
}
```

- [ ] **Step 4: Write `last.ts`**

```typescript
import { openDb } from "../registry/db.ts";
import { buildResumeLine } from "./pick.ts";

export function run(): void {
  const db = openDb();
  try {
    const row = db.query<any, []>(
      "SELECT * FROM sessions WHERE is_archived = 0 ORDER BY last_activity_at DESC LIMIT 1"
    ).get();
    if (!row) { console.error("no sessions in registry."); process.exit(1); }
    process.stdout.write(buildResumeLine(row));
  } finally { db.close(); }
}
```

(Depends on `pick.ts` Task 24 exporting `buildResumeLine` — that's fine; placeholder import resolves once pick is written.)

- [ ] **Step 5: Write `here.ts`**

```typescript
import { run as pickRun } from "./pick.ts";
export function run(): void { pickRun(["--here"]); }
```

- [ ] **Step 6: Write `fuzzy.ts`**

```typescript
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
```

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit`
Expected: errors only about `pick.ts` not yet exporting — acceptable for now (will resolve in Task 24). Actually, since `pick.ts` doesn't exist yet, these are "module not found" errors. **Skip typecheck this task** — proceed.

- [ ] **Step 8: Commit (without running tests; pick.ts is missing intentionally)**

```bash
git add src/commands/prune.ts src/commands/uninstall.ts src/commands/export.ts \
        src/commands/last.ts src/commands/here.ts src/commands/fuzzy.ts
git commit -m "feat(cli): prune, uninstall, export, last, here, fuzzy commands"
```

---

# Phase 6 — TUI

## Task 18: theme.ts

**Files:**
- Create: `src/tui/theme.ts`

- [ ] **Step 1: Write theme**

```typescript
export const theme = {
  accent:        "#D97757",  // Claude coral
  accentSubtle:  "#7A4131",
  fg:            "white",
  fgDim:         "gray",
  fgFav:         "yellow",
  bgSelected:    "#D97757",  // full-row highlight bg
  fgSelected:    "black",
  border:        "#D97757",
  borderDim:     "gray",
} as const;

export const ICONS = {
  fav:        "*",
  unfav:      " ",
  selectMark: ">",
  separator:  "-",
};

export function relativeTime(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSec;
  const SIXTY_DAYS = 60 * 86400;
  if (delta > SIXTY_DAYS) {
    const d = new Date(unixSec * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (delta < 60)        return "just now";
  if (delta < 3600)      return `${Math.floor(delta/60)}m ago`;
  if (delta < 86400)     return `${Math.floor(delta/3600)}h ago`;
  if (delta < 2 * 86400) return "yesterday";
  if (delta < 7 * 86400) return `${Math.floor(delta/86400)}d ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}
```

- [ ] **Step 2: Quick test** (inline assertions via repl, no test file needed for trivial pure functions)

Run: `bun -e 'import("./src/tui/theme.ts").then(m => { console.log(m.relativeTime(Math.floor(Date.now()/1000)-3600)); console.log(m.relativeTime(Math.floor(Date.now()/1000)-2*86400)); })'`
Expected: `1h ago` then `yesterday`.

- [ ] **Step 3: Commit**

```bash
git add src/tui/theme.ts
git commit -m "feat(tui): theme + relative time helper"
```

---

## Task 19: List.tsx

**Files:**
- Create: `src/tui/List.tsx`

- [ ] **Step 1: Write List component**

```typescript
import React from "react";
import { Box, Text } from "ink";
import { theme, ICONS, relativeTime } from "./theme.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  rows: SessionRow[];
  selectedIndex: number;
  height: number;
}

export function List({ rows, selectedIndex, height }: Props) {
  // Compute window: keep selected visible
  const windowSize = Math.max(1, height - 2);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(windowSize / 2), rows.length - windowSize));
  const slice = rows.slice(start, start + windowSize);

  // Insert favorites separator after the last favorite in the slice
  let lastFavIdx = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i].is_favorite) { lastFavIdx = i; break; }
  }

  return (
    <Box flexDirection="column">
      {slice.map((row, i) => {
        const realIdx = start + i;
        const isSel = realIdx === selectedIndex;
        const title = row.custom_name ?? row.first_prompt ?? "(untitled)";
        const cwdShort = shorten(row.cwd, 32);
        const when = relativeTime(row.last_activity_at);
        const fav = row.is_favorite ? ICONS.fav : ICONS.unfav;

        return (
          <React.Fragment key={row.session_id}>
            <Box>
              <Text
                backgroundColor={isSel ? theme.bgSelected : undefined}
                color={isSel ? theme.fgSelected : theme.fg}
              >
                {` ${fav} `}
                {title.padEnd(32).slice(0, 32)}
                {"  "}
                <Text color={isSel ? theme.fgSelected : theme.fgDim}>
                  {cwdShort.padEnd(34).slice(0, 34)}{when}
                </Text>
              </Text>
            </Box>
            {i === lastFavIdx && lastFavIdx < slice.length - 1 && (
              <Text color={theme.fgDim}>{" " + ICONS.separator.repeat(70)}</Text>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 3) / 2);
  const tail = Math.floor((max - 3) / 2);
  return s.slice(0, head) + "..." + s.slice(s.length - tail);
}
```

- [ ] **Step 2: Type-check (will still fail because cli.ts imports pick.ts which doesn't exist yet — skip global typecheck for now)**

Skip.

- [ ] **Step 3: Commit**

```bash
git add src/tui/List.tsx
git commit -m "feat(tui): List component with favorites separator + window"
```

---

## Task 20: SearchBar.tsx

**Files:**
- Create: `src/tui/SearchBar.tsx`

- [ ] **Step 1: Write SearchBar**

```typescript
import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.ts";

interface Props {
  query: string;
  filterCwd: string | null;
  total: number;
  shown: number;
}

export function SearchBar({ query, filterCwd, total, shown }: Props) {
  return (
    <Box>
      <Text color={theme.accent}> / </Text>
      <Text>{query || ""}</Text>
      <Text color={theme.fgDim}>
        {filterCwd ? `   [filter: ${filterCwd}]` : ""}
        {`   ${shown}/${total} shown`}
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/SearchBar.tsx
git commit -m "feat(tui): SearchBar component"
```

---

## Task 21: Preview.tsx

**Files:**
- Create: `src/tui/Preview.tsx`

- [ ] **Step 1: Write Preview**

```typescript
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { theme } from "./theme.ts";
import { paths } from "../platform/paths.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  row: SessionRow | null;
  height: number;
}

interface Msg { role: string; text: string }

export function Preview({ row, height }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);

  useEffect(() => {
    if (!row) { setMsgs([]); return; }
    setMsgs(loadMessages(row.session_id, height));
  }, [row?.session_id, height]);

  if (!row) {
    return <Text color={theme.fgDim}>(select a session)</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.fgDim}>
        {row.cwd} • {row.message_count} msgs • {row.token_count.toLocaleString()} tok
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {msgs.length === 0 && <Text color={theme.fgDim}>(no transcript on disk)</Text>}
        {msgs.map((m, i) => (
          <Text key={i} color={m.role === "user" ? theme.accent : theme.fg}>
            {m.role}: {m.text}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function loadMessages(sessionId: string, max: number): Msg[] {
  if (!existsSync(paths.claudeProjects)) return [];
  for (const sub of readdirSync(paths.claudeProjects)) {
    const file = join(paths.claudeProjects, sub, `${sessionId}.jsonl`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const out: Msg[] = [];
    for (const line of lines) {
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const role = o?.message?.role ?? o?.role;
      const content = o?.message?.content ?? o?.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) text = content.map((c: any) => c?.text ?? "").join(" ");
      if (role && text) out.push({ role, text: text.slice(0, 120) });
    }
    return out.slice(-max);
  }
  return [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/Preview.tsx
git commit -m "feat(tui): Preview component (lazy transcript read)"
```

---

## Task 22: App.tsx — composition + key handling

**Files:**
- Create: `src/tui/App.tsx`

- [ ] **Step 1: Write App**

```typescript
import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { theme } from "./theme.ts";
import { List } from "./List.tsx";
import { SearchBar } from "./SearchBar.tsx";
import { Preview } from "./Preview.tsx";
import type { Database } from "bun:sqlite";
import { listSessions, type SessionRow } from "../registry/search.ts";

interface Props {
  db: Database;
  initialFilterCwd: string | null;
  initialQuery: string;
  onSelect: (row: SessionRow) => void;
  onCancel: () => void;
}

export function App({ db, initialFilterCwd, initialQuery, onSelect, onCancel }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 30;
  const termWidth = stdout?.columns ?? 100;

  const [query, setQuery] = useState(initialQuery);
  const [filterCwd] = useState<string | null>(initialFilterCwd);
  const [selected, setSelected] = useState(0);
  const [, force] = useState(0);

  const allRows = useMemo(
    () => listSessions(db, { query: "", filterCwd: null, includeMissing: true }),
    [db, /* refresh on force */]
  );
  const rows = useMemo(
    () => listSessions(db, { query, filterCwd, includeMissing: true }),
    [db, query, filterCwd]
  );

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c") || input === "q") {
      onCancel();
      exit();
      return;
    }
    if (key.return) {
      const row = rows[selected];
      if (row) { onSelect(row); exit(); }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelected(s => Math.max(0, s - 1)); return;
    }
    if (key.downArrow || input === "j") {
      setSelected(s => Math.min(rows.length - 1, s + 1)); return;
    }
    if (key.pageUp || (key.ctrl && input === "u")) {
      setSelected(s => Math.max(0, s - 10)); return;
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      setSelected(s => Math.min(rows.length - 1, s + 10)); return;
    }
    if (input === "g") { setSelected(0); return; }
    if (input === "G") { setSelected(rows.length - 1); return; }
    if (input === "f") {
      const row = rows[selected];
      if (row) {
        db.run("UPDATE sessions SET is_favorite = 1 - is_favorite WHERE session_id = ?", [row.session_id]);
        force(n => n + 1);
      }
      return;
    }
    if (input === "d") {
      const row = rows[selected];
      if (row) {
        db.run("DELETE FROM sessions WHERE session_id = ?", [row.session_id]);
        setSelected(s => Math.max(0, s - 1));
        force(n => n + 1);
      }
      return;
    }
    // search input
    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1));
      setSelected(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
      setQuery(q => q + input);
      setSelected(0);
      return;
    }
  });

  const listHeight = Math.max(5, Math.floor(termHeight * 0.55));
  const previewHeight = Math.max(3, termHeight - listHeight - 6);
  const currentRow = rows[selected] ?? null;

  return (
    <Box flexDirection="column" width={termWidth}>
      <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent} bold>Claude Manager</Text>
        <Text color={theme.fgDim}>{`   ${rows.length} sessions`}</Text>
      </Box>
      <Box paddingX={1}>
        <SearchBar query={query} filterCwd={filterCwd} total={allRows.length} shown={rows.length} />
      </Box>
      <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={listHeight}>
        <List rows={rows} selectedIndex={selected} height={listHeight - 2} />
      </Box>
      <Box borderStyle="round" borderColor={theme.borderDim} flexDirection="column" paddingX={1} height={previewHeight}>
        <Preview row={currentRow} height={previewHeight - 3} />
      </Box>
      <Box paddingX={1}>
        <Text color={theme.fgDim}>
          enter resume   f fav   d delete   / type to search   q quit
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tui/App.tsx
git commit -m "feat(tui): App composition + key bindings"
```

---

## Task 23: pick.ts — TUI launcher + resume line builder

**Files:**
- Create: `src/commands/pick.ts`

`buildResumeLine(row)` produces the shell line: `cd 'CWD' && exec ARGV... --resume ID`.

The picker prints either nothing (cancelled) or a `cd && exec` line on stdout. Anything else (Ink rendering) goes to stderr or `/dev/tty`.

Critical: Ink renders to stdout by default. We need to redirect Ink to `/dev/tty` so our pick stdout stays clean. Use `render(<App />, { stdout: <ttyStream> })`.

- [ ] **Step 1: Write `pick.ts`**

```typescript
import React from "react";
import { render } from "ink";
import { openSync, createWriteStream, createReadStream } from "node:fs";
import { openDb } from "../registry/db.ts";
import { App } from "../tui/App.tsx";
import type { SessionRow } from "../registry/search.ts";

export function buildResumeLine(row: SessionRow): string {
  const argv = JSON.parse(row.launch_argv_json) as string[];
  const filtered = argv.filter(a => a !== "--resume" && !a.startsWith("--resume="));
  // ensure first token is "claude" (defensive)
  if (filtered[0] !== "claude" && !filtered[0]?.endsWith("/claude")) {
    filtered.unshift("claude");
  }
  filtered.push("--resume", row.session_id);
  const cmd = filtered.map(shellQuote).join(" ");
  const cwd = shellQuote(row.cwd);
  return `cd ${cwd} && exec ${cmd}\n`;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./@:=-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function run(args: string[]): void {
  const initialFilterCwd = args.includes("--here") ? process.cwd() : null;
  const queryIdx = args.indexOf("--query");
  const initialQuery = queryIdx >= 0 ? (args[queryIdx + 1] ?? "") : "";

  const db = openDb();

  // Ink output → /dev/tty so our stdout stays clean for the shell wrapper.
  const ttyOutFd = openSync("/dev/tty", "w");
  const ttyInFd  = openSync("/dev/tty", "r");
  const ttyOut = createWriteStream("", { fd: ttyOutFd }) as any;
  const ttyIn  = createReadStream("",  { fd: ttyInFd  }) as any;

  let chosen: SessionRow | null = null;

  const app = render(
    React.createElement(App, {
      db,
      initialFilterCwd,
      initialQuery,
      onSelect: (row) => { chosen = row; },
      onCancel: () => { chosen = null; },
    }),
    { stdout: ttyOut, stdin: ttyIn, exitOnCtrlC: false }
  );

  app.waitUntilExit().then(() => {
    db.close();
    if (chosen) process.stdout.write(buildResumeLine(chosen));
    process.exit(0);
  });
}
```

- [ ] **Step 2: Type-check now (everything wired)**

Run: `bunx tsc --noEmit`
Expected: no errors. If there are errors, fix them — the most likely is a missing React import in a tsx file or a strict mode complaint.

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: all green (no new tests added in this task).

- [ ] **Step 4: Smoke launch**

Run: `bun src/cli.ts pick </dev/null` (Note: the `/dev/tty` open might fail in some CI; OK if it fails locally too — just confirm it doesn't crash on import).

If your terminal supports it, run interactively: `bun src/cli.ts`
Expected: TUI opens. Press `q` to quit.

- [ ] **Step 5: Commit**

```bash
git add src/commands/pick.ts
git commit -m "feat(cli): pick subcommand launches Ink TUI on /dev/tty, prints resume line on stdout"
```

---

# Phase 7 — Postinstall + distribution

## Task 24: postinstall.ts

**Files:**
- Create: `src/postinstall.ts`

Runs at `npm install -g claude-manager`. Steps:
1. `mkdir -p ~/.claudemanager`
2. Copy `src/hook/hook.sh` → `~/.claudemanager/hook.sh`, `chmod +x`
3. Patch `~/.claude/settings.json` (non-destructive)
4. Run scan
5. Print rc-file instructions
6. Run doctor

- [ ] **Step 1: Write `postinstall.ts`**

```typescript
#!/usr/bin/env bun
import { mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paths } from "./platform/paths.ts";
import { patchSettings } from "./platform/settings.ts";
import { openDb } from "./registry/db.ts";
import { scan } from "./commands/scan.ts";
import { renderInit } from "./commands/init.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = join(HERE, "hook", "hook.sh");

function main() {
  console.log("claude-manager: setting up...");

  mkdirSync(paths.root, { recursive: true });

  if (existsSync(HOOK_SRC)) {
    copyFileSync(HOOK_SRC, paths.hook);
    chmodSync(paths.hook, 0o755);
    console.log(`  hook installed: ${paths.hook}`);
  } else {
    console.warn(`  WARN: hook source not found at ${HOOK_SRC}`);
  }

  patchSettings(paths.settings, paths.hook);
  console.log(`  settings.json patched: ${paths.settings}`);

  const db = openDb();
  try {
    const n = scan(db, paths.claudeProjects);
    console.log(`  scanned existing sessions: ${n} new`);
  } finally { db.close(); }

  const shell = (process.env.SHELL ?? "").endsWith("/fish") ? "fish"
              : (process.env.SHELL ?? "").endsWith("/zsh")  ? "zsh"
              : "bash";
  const rc = shell === "fish" ? "~/.config/fish/config.fish"
           : shell === "zsh"  ? "~/.zshrc"
           : "~/.bashrc";
  console.log("");
  console.log(`Add this to your ${rc}:`);
  console.log("");
  console.log(`  eval "$(claude-manager init ${shell})"`);
  console.log("");
  console.log("Then open a new shell and run:  cm");
  console.log("");
}

try { main(); } catch (e) {
  console.warn("postinstall encountered an error (continuing):", e);
}
```

- [ ] **Step 2: Smoke run**

Run: `bun src/postinstall.ts`
Expected: messages print, no crash. After, run `bun src/cli.ts doctor` — most checks should now PASS.

- [ ] **Step 3: Verify the hook + queue → drain cycle locally**

Run:
```bash
echo '{"session_id":"smoke-1","cwd":"'$(pwd)'","transcript_path":""}' | ~/.claudemanager/hook.sh start
bun src/cli.ts last
```
Expected: a `cd ... && exec claude --resume smoke-1` line is printed (or "no sessions" if drain wasn't triggered — drain runs on every CLI invocation so it should appear).

- [ ] **Step 4: Commit**

```bash
git add src/postinstall.ts
git commit -m "feat(install): postinstall wires hook, patches settings, scans, prints rc snippet"
```

---

## Task 25: package.json bin entries + final wiring

**Files:**
- Modify: `package.json`

The `bin` already points at `src/cli.ts`. Add a `cm` alias too. Verify the hook source ships in the npm tarball.

- [ ] **Step 1: Update `package.json`**

Replace the `bin` section with:

```json
"bin": {
  "claude-manager": "./src/cli.ts",
  "cm": "./src/cli.ts"
},
```

(Note: this `cm` binary won't `cd` your shell — the *shell function* `cm` is what gives you that. The binary alias is a fallback for `cm scan`, `cm doctor` etc. that don't need to cd.)

Make sure `files` array includes hook script:

```json
"files": [
  "src/**/*",
  "!src/**/*.test.ts"
]
```

- [ ] **Step 2: Verify package would publish correctly**

Run: `npm pack --dry-run`
Expected: a list of files including `src/hook/hook.sh`, `src/cli.ts`, `src/postinstall.ts`, `src/tui/*.tsx`, etc.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(pkg): add cm bin alias + tighten files glob"
```

---

# Phase 8 — E2E + README

## Task 26: End-to-end smoke

**Files:**
- Create: `tests/e2e.test.ts`

This test: simulates a SessionStart event, drains it, lists, and verifies the resume line.

- [ ] **Step 1: Write E2E test**

```typescript
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
```

- [ ] **Step 2: Run**

Run: `bun test tests/e2e.test.ts`
Expected: 1 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e.test.ts
git commit -m "test(e2e): smoke test queue → drain → list → resume line"
```

---

## Task 27: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# claude-manager

Global session manager for [Claude Code](https://claude.com/claude-code). Opens a fuzzy TUI of every Claude session you have ever had — pick one, hit enter, you're back in the original directory running `claude --resume <id>` with the exact original flags.

## Install

Requires [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).

```bash
npm i -g claude-manager
```

The postinstall script:
- Installs a `SessionStart` + `Stop` hook into `~/.claude/settings.json` (non-destructive).
- Backfills your existing sessions from `~/.claude/projects/`.
- Prints the one line you need to add to your shell rc.

Add to your `~/.zshrc` (or `~/.bashrc`, or `~/.config/fish/config.fish`):

```bash
eval "$(claude-manager init zsh)"
```

Open a new shell, then run:

```bash
cm
```

## Commands

| Command | Description |
| --- | --- |
| `cm` | open the TUI |
| `cm here` | TUI pre-filtered to `$(pwd)` |
| `cm last` | resume the most recent session, no TUI |
| `cm <fuzzy>` | auto-resume on unique fuzzy match, else TUI pre-filtered |
| `claude-manager scan` | re-run backfill |
| `claude-manager doctor` | health check |
| `claude-manager prune` | delete old sessions per `prune_days` setting |
| `claude-manager uninstall` | remove hook + settings patch (registry preserved) |
| `claude-manager export <id>` | dump session transcript to stdout |

## Keys (TUI)

- `↑/↓` `j/k` — move
- `Enter` — resume selected
- `f` — toggle favorite
- `d` — delete (registry only)
- `g/G` — top/bottom
- `Ctrl-d/u` — page down/up
- type — fuzzy search
- `q` `Esc` — quit

## How it works

A tiny Bash hook fires on every Claude `SessionStart` and `Stop`, writing one JSON line per event to `~/.claudemanager/queue.jsonl` — captures cwd, the parent `claude` argv (read from `/proc/$PPID/cmdline` on Linux or `ps` on macOS), git branch/SHA, env vars, and post-session token/message counts.

The next time you run `cm`, the binary drains the queue into `~/.claudemanager/db.sqlite` and renders an Ink TUI. Pick a session and the binary writes a `cd '<dir>' && exec claude ... --resume <id>` line to stdout. The `cm` shell function (installed by `eval "$(claude-manager init)"`) `eval`s that line — so your parent shell actually `cd`s.

## Uninstall

```bash
claude-manager uninstall
npm uninstall -g claude-manager
```

The registry at `~/.claudemanager/db.sqlite` is preserved. Remove it manually if you want a fresh start: `rm -rf ~/.claudemanager`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install + commands + how-it-works"
```

---

## Task 28: Final verification

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: all green.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify CLI works end-to-end**

Run: `bun src/cli.ts --version` → `0.1.0`
Run: `bun src/cli.ts doctor` → mostly OK
Run: `bun src/cli.ts scan` → reports session count
Run: `bun src/cli.ts last` → either prints a resume line or "no sessions"

- [ ] **Step 4: Tag v0.1.0**

```bash
git tag v0.1.0
git log --oneline | head -30
```

- [ ] **Step 5: Final commit (if anything was tweaked)**

```bash
git status
# if clean, nothing to do
```

---

## Self-review checklist (post-write)

- [x] **Spec coverage:** §2.A (hook) → Task 10/11. §2.B (CLI/TUI) → Tasks 13-23. §2.C (shell wrapper) → Task 15. §2.D (registry) → Tasks 4-7. §2.E (scanner) → Task 12. §3 (data flow) → covered by integration in Tasks 11, 23, 26. §4 (UI) → Tasks 18-22. §5 (install flow) → Task 24. §6 (edge cases): cross-platform argv → Task 9; hook silence → Task 10; missing dir → handled in `resolveBestCwd`; backfill flag → Task 12. §7 (repo layout) → matches file map. §8 (out of scope) → respected (no notes, no markdown export, no Windows).
- [x] **Placeholder scan:** Every step has actual code or actual command.
- [x] **Type consistency:** `SessionRow` defined once in `registry/search.ts`, referenced everywhere. `paths` object stable across files. `buildResumeLine`, `openDb`, `drain`, `scan`, `listSessions`, `fuzzyMatch`, `patchSettings`, `unpatchSettings`, `renderInit`, `resolveBestCwd`, `readParentArgv` — all named consistently in their definitions and uses.

Plan complete.
