# claude-manager

A global session manager + resumer for [Claude Code](https://claude.com/claude-code). Run `cm` from any directory, fuzzy-search every Claude session you've ever had, hit enter — your shell `cd`s into the original project and resumes the chat with the exact original `claude` flags.

```
╭─ ◆  claude-manager   session resumer                    21 of 24 sessions   v0.1.0 ─╮

 1 sessions    2 overview    3 projects    4 help

  >  cm-build▮                                                                  3 / 24

╭──────────────────────────────────────────────────────────────────────────────────╮
│  ── ★ favorites ────────────────────────────────────────────────────────────     │
│ ▌▌  *  ts   claude-manager design          ~/Desktop/claude-manager   2h ago     │
│  ── today ───────────────────────────────────────────────────────────────────    │
│        ts   refactor auth middleware       ~/work/api                  3h ago    │
│        py   debug failing migration        ~/work/db                  17m ago    │
│  ── yesterday ───────────────────────────────────────────────────────────────    │
│        rs   crab shell skeleton            ~/code/crab                 1d ago    │
╰──────────────────────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────────╮
│  /home/devlsx/Desktop/claude-manager   42 msgs   18.4k tok                       │
│                                                                                  │
│  ▎ you   refactor the auth middleware to use the new session token format        │
│  ▎ asst  i'll start by reading the current middleware to understand…             │
╰──────────────────────────────────────────────────────────────────────────────────╯

  ↵ resume   r rename   f favorite   d delete   Tab view   ? help   q quit
```

---

## Install

Requires [Bun](https://bun.sh) (≥ 1.1):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then from inside this repo:

```bash
bun install                         # deps
ln -sf "$(pwd)/src/cli.ts" ~/.bun/bin/claude-manager
bun src/postinstall.ts              # installs hook + patches ~/.claude/settings.json + scans
echo 'eval "$(claude-manager init zsh)"' >> ~/.zshrc   # or .bashrc / .config/fish/config.fish
exec $SHELL
```

What postinstall does (idempotent):

- Writes `~/.claudemanager/hook.sh` (chmod +x)
- Non-destructively merges `SessionStart` + `Stop` hooks into `~/.claude/settings.json`
- Backfills every existing session from `~/.claude/projects/` into `~/.claudemanager/db.sqlite`
- Prints the one line to add to your shell rc

Verify with:

```bash
claude-manager doctor       # 5/5 checks should pass
```

---

## Commands

| Command | Description |
| --- | --- |
| `cm` | open the TUI |
| `cm here` | TUI pre-filtered to `$(pwd)` |
| `cm last` | resume the most recent session, no TUI |
| `cm <name>` | **exact custom_name match → resume immediately** |
| `cm <fuzzy>` | **closest match → confirm prompt** (`↵` resume, `t` open TUI, anything else cancels) |
| `claude-manager scan` | re-run backfill from `~/.claude/projects/` |
| `claude-manager doctor` | health check (registry, hook, settings patch, claude on PATH) |
| `claude-manager prune` | delete sessions older than `prune_days` setting |
| `claude-manager uninstall` | remove hook + settings patch (registry preserved) |
| `claude-manager export <id>` | dump a session transcript to stdout |
| `claude-manager init [bash\|zsh\|fish]` | print shell wrapper for `eval` |

---

## Keys (TUI)

**Navigation**

| Key | Action |
| --- | --- |
| `↑ ↓` / `j k` | move |
| `Ctrl-u` / `Ctrl-d` | page up / page down |
| `g` / `G` | top / bottom |
| `Tab` / `Shift-Tab` | next / previous view |
| `1` `2` `3` / `?` | jump to sessions / overview / projects / help |

**Actions** (sessions view)

| Key | Action |
| --- | --- |
| `↵` Enter | resume selected session |
| `r` | rename — set `custom_name` (used by `cm <name>`) |
| `f` | toggle favorite |
| `d` | delete from registry |

**Search**

| Key | Action |
| --- | --- |
| any letter | live fuzzy filter |
| Backspace | remove last char |
| `q` / `Esc` / `Ctrl-c` | quit (no resume) |

---

## Views

The TUI has four tabs:

1. **sessions** — the picker. Time-bucketed groups (`★ favorites` / `today` / `yesterday` / `this week` / `this month` / `older`). Per-project language tag (`ts` `js` `py` `rs` `go` `rb` `dn` `jv` `git`) detected from marker files (`tsconfig.json`, `Cargo.toml`, `pyproject.toml`, etc).
2. **overview** — totals (sessions / favorites / messages / tokens), 30-day session sparkline, oldest→newest span.
3. **projects** — cwd grouping with horizontal coral bars sized by session count, last-activity timestamps.
4. **help** — full keymap reference.

---

## Custom names

Press `r` on a row in the TUI to give a session a memorable name:

```
rename  refactor the auth middleware  →  auth-rewrite▮
```

Then from any directory:

```bash
$ cm auth-rewrite
# resumes immediately — no prompt
```

Close-but-not-exact matches get a confirmation:

```bash
$ cm auth

  did you mean  auth-rewrite
  query  auth
  cwd    /home/devlsx/work/api

  ↵ resume    t open TUI    n/Esc cancel
```

Ranking is custom_name (×4) > first prompt (×2) > cwd (×1). Exact case-insensitive name match wins immediately.

---

## How it works

A small Bash hook fires on every Claude `SessionStart` and `Stop`. It writes a single JSON line per event to `~/.claudemanager/queue.jsonl` capturing:

- `cwd`
- The full parent `claude` argv (Linux: `/proc/$PPID/cmdline`; macOS: `ps -o args=`)
- Git branch / SHA (if cwd is a repo)
- An env allow-list (`ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, etc.)
- On stop: message count, token count, first user prompt

The hook is silent — never writes to stdout/stderr. The Claude UI never sees it.

The next time you run any `cm` command, the binary drains `queue.jsonl` into `~/.claudemanager/db.sqlite` (idempotent — `INSERT OR IGNORE` keyed on session_id, preserves favorites/custom names) and then routes to the right subcommand.

When you pick a session, the binary writes a single line on stdout:

```
cd '/home/devlsx/work/api' && exec claude --model opus --mcp-config foo.json --resume abc-123
```

Your shell function (`eval "$(claude-manager init zsh)"`) captures that and `eval`s it — so the **parent shell** actually `cd`s and the new `claude` process replaces the shell. Non-resume output (doctor checks, scan summary, help text) is just printed.

The TUI itself is rendered to `/dev/tty` directly so it never pollutes the captured stdout.

---

## Files

| Path | Purpose |
| --- | --- |
| `~/.claudemanager/db.sqlite` | session registry (sessions, tags, favorites, settings) |
| `~/.claudemanager/queue.jsonl` | append-only event queue, drained on every CLI invocation |
| `~/.claudemanager/hook.sh` | the bash hook installed into Claude Code |
| `~/.claude/settings.json` | patched non-destructively to register the hook |

Settings live in the `settings` table:

| Key | Default | Meaning |
| --- | --- | --- |
| `prune_days` | `0` | If > 0, `claude-manager prune` removes non-favorite, non-named sessions older than this |
| `hide_missing_dirs` | `1` | Hide rows whose `cwd` no longer exists on disk |
| `delete_jsonl_with_session` | `ask` | Reserved for future TUI delete confirmation |
| `accent_color` | `#D97757` | Reserved for future themability |

---

## Uninstall

```bash
claude-manager uninstall   # removes hook + settings patch (registry preserved)
unlink ~/.bun/bin/claude-manager
```

Then strip the `eval "$(claude-manager init …)"` line from your rc file. To wipe the registry too:

```bash
rm -rf ~/.claudemanager
```

---

## Known limitations (v0.1.0)

- **Bun required.** No Node-only build path yet.
- **Linux + macOS only.** Windows skipped — `/proc` and `ps -o args=` are the parent-argv strategies.
- **`cm` deletion has no confirmation prompt.** A miskey on `d` immediately removes the row from the registry (the underlying transcript JSONL on disk is left alone).
- **Markdown export deferred.** `claude-manager export <id>` dumps raw JSONL.
- **No multi-machine sync.** Schema reserves `origin_host` for it; not implemented.

---

## Architecture

```
src/
├── cli.ts                  argv router; forces FORCE_COLOR=3 before chalk loads
├── postinstall.ts          hook copy + settings patch + initial scan
├── hook/hook.sh            silent bash session-capture hook
├── registry/
│   ├── db.ts               bun:sqlite open + WAL + schema + default settings
│   ├── schema.sql          tables + indexes
│   ├── drain.ts            queue.jsonl → sqlite (idempotent, preserves user fields)
│   └── search.ts           listSessions + fuzzyMatch (subsequence + proximity)
├── platform/
│   ├── paths.ts            ~/.claudemanager + ~/.claude/* path constants
│   ├── settings.ts         non-destructive ~/.claude/settings.json merge
│   └── argv.ts             cwd unsanitize (power-set), parent argv read
├── commands/
│   ├── pick.ts             Ink TUI launcher → /dev/tty + buildResumeLine + shell quoting
│   ├── confirm.ts          /dev/tty raw-mode confirm prompt for cm <fuzzy>
│   ├── fuzzy.ts            cm <query> dispatch: exact → resume, fuzzy → confirm, else TUI
│   ├── last.ts             resume most-recent
│   ├── here.ts             TUI filtered to $(pwd)
│   ├── scan.ts             backfill from ~/.claude/projects
│   ├── init.ts             shell wrapper generation (bash/zsh/fish)
│   ├── doctor.ts           health checks
│   ├── prune.ts / uninstall.ts / export.ts
└── tui/
    ├── App.tsx             view-switching, key handling, rename mode
    ├── List.tsx            time-bucket grouping, lang tags, full-width selection
    ├── SearchBar.tsx       coral prompt, cursor, counts
    ├── Preview.tsx         per-message coral bullet, role tags
    ├── Stats.tsx           overview view: totals + 30-day sparkline
    ├── Projects.tsx        per-cwd grouping with relative bar charts
    ├── Help.tsx            full keymap reference
    └── theme.ts            palette + glyphs + relativeTime + timeBucket + langTag
```

47 tests (`bun test`). Type-check: `bunx tsc --noEmit`.
