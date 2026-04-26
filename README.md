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
