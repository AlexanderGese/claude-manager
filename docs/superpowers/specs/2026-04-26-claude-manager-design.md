# claude-manager — Design Spec

**Status:** Approved 2026-04-26
**Repo:** `claude-manager` (greenfield)

---

## 1. Vision

A global Claude Code session resumer. From any directory, `cm` opens a TUI of every Claude session you have ever had. Pick one, hit enter, and you are `cd`'d into the original project running `claude --resume <id>` with the exact original launch flags. Favorites, custom names, fuzzy search, and live preview pane.

Solves two real problems:
1. `~/.claude/projects/` is a flat opaque pile — there is no native way to find an old chat.
2. Resuming a chat means remembering the exact directory and the exact `claude` flags you used. Nobody does.

---

## 2. Architecture

Four components.

### 2.A The hook (`hook.sh`)

Bash script (~50 lines), zero Node startup cost. Installed at `~/.claudemanager/hook.sh`.

Triggered by Claude Code on two events:

- **`SessionStart`** — captures:
  - `cwd` (from hook input JSON)
  - `session_id` (from hook input JSON)
  - Parent `claude` argv:
    - Linux: read `/proc/$PPID/cmdline` (NUL-separated)
    - macOS: `ps -o args= -p $PPID`
  - Env allow-list: `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, hash(`ANTHROPIC_API_KEY`) for identity, `CLAUDE_CODE_*`
  - Git: `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD` (silent fail if not a repo)
  - Timestamp
- **`Stop` / `SessionEnd`** — captures:
  - `transcript_path` (from hook input JSON)
  - Reads transcript: counts messages, sums `usage.input_tokens + usage.output_tokens`, derives `last_activity_at`

**Output:** appends a single JSON line to `~/.claudemanager/queue.jsonl`. Schema:

```json
{"event":"start","ts":1745684123,"session_id":"abc-123","cwd":"/home/x/proj","argv":["claude","--model","opus"],"env":{"ANTHROPIC_MODEL":"opus"},"git":{"branch":"main","sha":"deadbeef"},"first_prompt":null}
{"event":"stop","ts":1745684923,"session_id":"abc-123","message_count":42,"token_count":18391}
```

**Critical:** hook writes ONLY to `queue.jsonl`. Never to stdout/stderr — that would bleed into the Claude Code UI. Errors swallowed silently (`exec 2>/dev/null` fallback).

### 2.B The CLI/TUI binary (`claude-manager`)

TypeScript. Bun runtime. Compiled to a single static binary via `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile=claude-manager`. Same source supports `bun-darwin-x64` and `bun-darwin-arm64`. Distributed via npm with platform-specific `optionalDependencies` (or just runs under `bun` if user already has it).

**On every launch:** drains `queue.jsonl` into `~/.claudemanager/db.sqlite` (idempotent — INSERT OR IGNORE keyed on `session_id`, UPDATEs for stop events), truncates the queue, then continues.

**Subcommands:**

| Command | Purpose |
| --- | --- |
| `claude-manager` (no arg) | Open full TUI |
| `claude-manager pick` | Internal — used by shell `cm()` function. Outputs the `cd && exec` line on stdout. |
| `claude-manager init [bash\|zsh\|fish]` | Print shell init script for `eval`. |
| `claude-manager doctor` | Health check: hook installed? settings.json valid? registry readable? wrapper sourced? |
| `claude-manager scan` | Backfill from `~/.claude/projects/`. See §2.E. |
| `claude-manager prune` | Delete sessions older than `prune_days` (config). Confirms before deleting favorited/named. |
| `claude-manager uninstall` | Remove hook + settings.json patch. Leave registry intact. |
| `claude-manager export <id>` | Dump session JSONL. (`--md` deferred.) |

**Convenience aliases (via shell function):**

| Command | Purpose |
| --- | --- |
| `cm` | TUI |
| `cm here` | TUI pre-filtered to `$(pwd)` |
| `cm last` | Resume the single most recent session, no TUI |
| `cm <fuzzy>` | Auto-resume if 1 match, else TUI pre-filtered |

### 2.C The shell wrapper

The `claude-manager init <shell>` subcommand prints a function definition. User adds `eval "$(claude-manager init zsh)"` to their `~/.zshrc` (or equivalent).

The function:
1. Calls `claude-manager pick "$@"` and captures stdout.
2. `eval`s it. Stdout is a line like `cd '/path/to/proj' && exec claude --model opus --mcp-config foo.json --resume abc-123`.
3. Because the function runs in the parent shell, the `cd` and `exec` actually take effect.

Three shell variants generated (bash, zsh, fish).

### 2.D The registry (SQLite)

`~/.claudemanager/db.sqlite`. Accessed via `bun:sqlite` (built into Bun, sync API, fast).

```sql
CREATE TABLE sessions (
  session_id        TEXT PRIMARY KEY,
  cwd               TEXT NOT NULL,
  launch_argv_json  TEXT NOT NULL,    -- ["claude","--model","opus",...]
  env_json          TEXT,             -- captured allow-listed env
  git_branch        TEXT,
  git_sha           TEXT,
  first_prompt      TEXT,
  custom_name       TEXT,             -- user override (favorites)
  is_favorite       INTEGER DEFAULT 0,
  is_archived       INTEGER DEFAULT 0,
  is_backfilled     INTEGER DEFAULT 0, -- 1 if imported by `scan`
  message_count     INTEGER DEFAULT 0,
  token_count       INTEGER DEFAULT 0,
  status            TEXT,             -- active|idle|done (derived from last_activity_at)
  created_at        INTEGER NOT NULL,
  last_activity_at  INTEGER NOT NULL,
  origin_host       TEXT,             -- multi-machine sync prep (hostname)
  schema_version    INTEGER DEFAULT 1
);

CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at DESC);
CREATE INDEX idx_sessions_cwd           ON sessions(cwd);
CREATE INDEX idx_sessions_favorite      ON sessions(is_favorite) WHERE is_favorite = 1;

CREATE TABLE tags (
  session_id TEXT NOT NULL,
  tag        TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE project_favorites (
  cwd          TEXT PRIMARY KEY,
  custom_name  TEXT
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Default settings rows seeded on first launch:
- `prune_days = 0` (off)
- `hide_missing_dirs = 1`
- `delete_jsonl_with_session = "ask"` (per Q21)
- `accent_color = "#D97757"`

### 2.E The scanner (`claude-manager scan`)

Walks `~/.claude/projects/`. Each subdirectory is a sanitized cwd, e.g. `-home-user-projects-claude-manager` ↔ `/home/user/projects/claude-manager`. Unsanitize: replace `-` with `/`, prefix with `/` (and re-resolve any path that contains `--`).

For each `*.jsonl` file in each subdir:
1. `session_id` = filename stem.
2. Skip if already in `sessions` table (idempotent).
3. Read first line → extract `first_prompt` (first user message) and any model name.
4. Read last line → `last_activity_at`.
5. `wc -l` → `message_count` (rough).
6. Sum any `usage.input_tokens + usage.output_tokens` → `token_count`.
7. Insert with `launch_argv_json = ["claude"]`, `is_backfilled = 1`.

**Runs automatically once during postinstall.** Re-runnable safely.

---

## 3. Data flow

### Session start

```
user: claude --model opus --mcp-config foo.json
  → Claude Code fires SessionStart hook with {cwd, session_id, transcript_path}
  → hook.sh:
      reads /proc/$PPID/cmdline → ["claude","--model","opus","--mcp-config","foo.json"]
      reads env allow-list
      reads git info
      appends one start-event JSON line to ~/.claudemanager/queue.jsonl
      exits 0 silently
```

### Session end

```
Claude Code fires Stop hook with {transcript_path, session_id}
  → hook.sh:
      tails transcript JSONL → message count, last_activity_at, sum(usage)
      appends one stop-event JSON line to queue.jsonl
```

### Resume

```
user: cm
  → shell fn calls: claude-manager pick "$@"
  → claude-manager:
      1. drain queue.jsonl into db.sqlite (INSERT OR IGNORE / UPDATE), truncate queue
      2. open Ink TUI
      3. user picks session "abc-123"
      4. write to stdout: cd '/path/to/proj' && exec claude --model opus --mcp-config foo.json --resume abc-123
      5. exit 0
  → shell fn: eval "$captured_stdout"
  → user is now in /path/to/proj running claude --resume abc-123
```

If the user cancels with `q`, `pick` writes nothing; `eval ""` is a no-op.

---

## 4. UI

ASCII-only. Claude-coral accent (`#D97757`) on selected row background, favorites star, and pane borders. Rounded box-drawing for borders. Two-line rows are not used — single-line compact rows since user said "idc" and compact shows more.

```
+-- Claude Manager ----------------------------- 127 sessions --+
| / search...                                                    |
+----------------------------------------------------------------+
| * Favorites -------------------------------------------------- |
|>>claude-manager design        ~/Desktop/claude-manager  2h ago |  <- coral bg
|  refactor auth middleware     ~/work/api               yest.   |
| -------------------------------------------------------------- |
|   debug websocket reconnect   ~/work/api                3d ago |
|   add postgres migrations     ~/work/api                5d ago |
|   try ink layout              ~/sandbox/ink-test        1w ago |
|   ...                                                          |
+-- preview ----------------------------------------------------- +
| user: lay out the design as 4 components and a data flow line  |
| assistant: locked. here's the full design...                   |
| user: ship it                                                  |
+----------------------------------------------------------------+
| enter resume  f fav  r rename  d delete  t tag  / search  q    |
+----------------------------------------------------------------+
```

### Visual rules
- Accent color: Claude coral `#D97757` for selected-row bg, fav stars, active border.
- Theme: auto-detect terminal bg → pick light or dark variant.
- Borders: rounded (`╭╮╰╯`).
- Icons: ASCII only (`*`, `>`, `[F]`).
- Highlight: full-row background fill in accent.
- Density: compact (1 line / row).
- Dates: relative for < 60 days, absolute (`2026-02-15`) after.
- Search: always-visible at top.
- Favorites: grouped section with `* Favorites ──────` divider, then ungrouped rest.
- Live preview pane: updates as you arrow.

### Keys
- `↑/↓` `j/k` — move
- `↵` — resume selected (writes cd && exec line to stdout, exits)
- `f` — toggle favorite
- `r` — rename (inline edit of `custom_name`)
- `d` — delete (asks: registry only, or also delete JSONL?)
- `t` — add/remove tag (prompt)
- `/` — focus search
- `g/G` — top/bottom
- `Ctrl-d/u` — page down/up
- `?` — help overlay
- `q` `Esc` — quit (no-op)

---

## 5. Install flow

`npm i -g claude-manager` runs postinstall:

1. `mkdir -p ~/.claudemanager`
2. Write `~/.claudemanager/hook.sh`, `chmod +x`.
3. Read `~/.claude/settings.json` (or create `{}`). Non-destructively merge:
   ```json
   {
     "hooks": {
       "SessionStart": [
         { "type": "command", "command": "~/.claudemanager/hook.sh start" }
       ],
       "Stop": [
         { "type": "command", "command": "~/.claudemanager/hook.sh stop" }
       ]
     }
   }
   ```
   Preserve all existing hooks. Idempotent: skip if our entry already present.
4. Detect user's shell (`$SHELL`) and print:
   > Add to your `~/.zshrc`:
   > ```
   > eval "$(claude-manager init zsh)"
   > ```
5. Run `claude-manager scan` to backfill existing sessions.
6. Run `claude-manager doctor` and print summary.

`claude-manager uninstall`:
- Removes the two hook entries from `~/.claude/settings.json`.
- Removes `~/.claudemanager/hook.sh`.
- Leaves `~/.claudemanager/db.sqlite` intact (user can `rm -rf` it themselves).
- Prints reminder to remove `eval "$(...)"` line from rc file.

---

## 6. Edge cases & safety

| Case | Handling |
| --- | --- |
| Cross-platform argv | Linux `/proc/$PPID/cmdline`; macOS `ps -o args=`; Windows skipped v1. |
| Hook stdout leakage | Hook redirects all output, exits 0 always. |
| Source dir moved | On resume: check inode + `git remote -v`; if matches a different path, offer to update `cwd`. |
| Source dir gone | Hidden by default; if user picks one (config toggled), prompt: "start fresh chat in [pick new dir]?" |
| Session already open elsewhere | Scan `pgrep -af "claude.*--resume <id>"`; warn before relaunch. |
| Pruning a favorited/named session | Confirm before deleting. |
| Delete from TUI (`d`) | Prompt: "(r) registry only / (a) also delete JSONL / (c) cancel". |
| Backfilled session has no original flags | `launch_argv_json = ["claude"]`; resume still works. |
| Massive queue.jsonl (user never opens TUI) | Drain truncates; size cap of 10MB triggers oldest-line drop with warning. |
| `~/.claude/settings.json` corrupted | Doctor detects; offers to back up + repair. |
| Multiple shells (zsh + fish) | `init` prints variant per arg; user adds to each rc separately. |

---

## 7. Repo layout

```
claude-manager/
├── src/
│   ├── cli.ts                  # argv router → subcommands
│   ├── tui/
│   │   ├── App.tsx
│   │   ├── List.tsx
│   │   ├── Preview.tsx
│   │   ├── SearchBar.tsx
│   │   └── theme.ts
│   ├── commands/
│   │   ├── pick.ts
│   │   ├── init.ts             # shell wrapper script generation
│   │   ├── doctor.ts
│   │   ├── scan.ts
│   │   ├── prune.ts
│   │   ├── uninstall.ts
│   │   └── export.ts
│   ├── registry/
│   │   ├── db.ts               # bun:sqlite wrapper
│   │   ├── schema.sql
│   │   ├── migrations.ts
│   │   ├── drain.ts            # queue.jsonl → sqlite
│   │   └── search.ts           # fuzzy + filter
│   ├── hook/
│   │   └── hook.sh             # shipped as static asset
│   ├── platform/
│   │   ├── argv.ts             # linux + macos
│   │   └── settings.ts         # ~/.claude/settings.json patcher
│   └── postinstall.ts
├── tests/
│   ├── drain.test.ts
│   ├── scan.test.ts
│   ├── settings-patch.test.ts
│   └── unsanitize-cwd.test.ts
├── package.json
├── tsconfig.json
├── README.md
└── docs/
    └── superpowers/specs/2026-04-26-claude-manager-design.md
```

---

## 8. Out of scope (v1)

- Free-form notes (Q13: nay)
- Markdown export (Q25: deferred)
- Multi-machine sync (schema reserved via `origin_host`, not implemented)
- Stats dashboard
- Windows support
- Themes beyond light/dark auto-detect

---

## 9. Open questions

None.
