# Product Hunt — claude-manager launch kit

Everything you need to paste into the Product Hunt submission form.

---

## 1. Name

```
claude-manager
```

## 2. Tagline (max 60 characters)

Pick one — I'd lead with the first.

| Tagline | Chars |
| --- | --- |
| `Resume any past Claude Code chat from anywhere` | 47 |
| `Tab-complete every Claude Code chat you've had` | 47 |
| `Like fzf for your Claude Code sessions` | 39 |
| `cm <name> → resume any Claude chat instantly` | 45 |
| `A global TUI session manager for Claude Code` | 45 |

## 3. Description (≤ 260 chars)

```
A lightning-fast TUI for browsing and resuming every Claude Code session you've ever had. Custom names, #tags, fuzzy search, time-bucketed history, cost tracking, 5 themes, tab-completion, and one-keystroke resume in the original project directory. Open source.
```

(259 chars.)

Alternative shorter version (≤ 200 chars) for places that demand brevity:

```
TUI session manager for Claude Code. Captures every chat via a silent shell hook. cm <name> resumes any session in its original directory with the original flags. Free, open source.
```

## 4. Topics / categories

Tick these on Product Hunt:

- **Developer Tools** (primary)
- **AI**
- **Open Source**
- **Productivity**
- **Command Line Tools** (if available as a sub-topic)

## 5. Platforms

- **Linux**
- **macOS**

(No Windows yet — note in description if asked.)

## 6. Pricing

```
Free / Open Source
```

## 7. Logo

Upload **`assets/icon.png`** (1024×1024). Solid coral `cm` block-mark on warm dark rounded background — recognizable at small sizes (favicon to hero shot).

A 240×240 variant is at `assets/icon-240.png` if PH ever falls back to a smaller display.

The wordmark version (`assets/logo.png`, 1024×1024) is for the gallery / website — uses the same mark plus "claude-manager" + tagline.

## 8. Gallery (1270×760 recommended for each)

Take screenshots of the live TUI. Suggested order:

1. **Hero shot — sessions view, default coral theme.** Show: header with the CM mark, the tab bar with "1 sessions" highlighted, a few rows including a `★ favorites` group and a `today` group, language tags visible, a row selected with the chunky coral bar. (This is the screen everyone sees first.)
2. **Tab-completion in action — animated GIF.** Terminal showing `cm aut<Tab>` → `cm auth-rewrite` → enter → `cd ...` → claude resumes. Use [vhs](https://github.com/charmbracelet/vhs) or asciinema to record.
3. **Confirm prompt for `cm <fuzzy>`.** Show the coral "did you mean…" prompt with the three options.
4. **Overview view (#2 tab).** Cost panel with "$X.XX lifetime", 30-day session sparkline, "this week" stats, the "by model" breakdown.
5. **Theme switcher — animated GIF.** Cycle: `claude-manager theme catppuccin && cm` → `theme gruvbox` → `theme nord` → `theme mono` → back to coral. Quick visual variety.
6. **Tags + bulk select.** Search bar showing `#bug` chip filter, several rows with `[x]` bulk-select markers, `<3 selected>` in footer.

For animated GIFs use [vhs](https://github.com/charmbracelet/vhs) — it's literally built for terminal demos and you can commit the `.tape` files.

## 9. Promo video (optional, 60s max)

Strong 30–60 second screencap covering, in order:

1. (0:00–0:08) `cm` → TUI opens. Cursor moves through the time-bucketed list.
2. (0:08–0:18) Type `auth` → list filters live. `Enter` → terminal cd's into the project and Claude resumes.
3. (0:18–0:28) New terminal. `cm aut<Tab>` autocompletes. Enter → resume.
4. (0:28–0:38) `cm` again, press `Tab` → Overview view → cost panel. `Tab` → Projects view.
5. (0:38–0:50) Switch themes live: `theme catppuccin → gruvbox → nord` (each shows the TUI re-rendered).
6. (0:50–0:60) End on the logo + URL.

Tools: [vhs](https://github.com/charmbracelet/vhs) for record, ffmpeg for trim/encode.

## 10. First comment (the maker introduction)

Paste this as the first comment after launch:

```
👋 hey Product Hunt — I made claude-manager.

if you live in Claude Code as much as I do, you probably have hundreds of past sessions scattered across project directories. there's no native way to find them. I'd be like "wait, which directory was I in when I refactored the auth middleware last week?" and the answer was always "spend 3 minutes grepping ~/.claude/projects/."

claude-manager fixes that.

a tiny silent bash hook captures every Claude session as it happens — cwd, the exact `claude` argv flags, git branch, env. all of it lands in ~/.claudemanager/db.sqlite. then `cm` opens a fuzzy TUI of every chat you've ever had, time-bucketed (today / yesterday / this week / older), language-tagged, with custom names if you've set them.

the killer feature: `cm <name>` → resume the chat by its name. tab-completion works. fuzzy → confirms before launching. exact match → instant.

what ships in v0.2:
• 4-pane TUI (sessions, overview, projects, help) with Tab to switch
• custom names, #tags, favorites, bulk-delete with multi-select
• cost tracking with per-model breakdown
• markdown export, transcript grep
• auto-name via `claude -p` (it asks Claude to summarize the chat for you)
• 5 themes (coral / catppuccin / gruvbox / nord / mono)
• Linux + macOS, requires Bun

the whole thing is one bash hook, one bun-typescript binary, one sqlite file, zero daemons. uninstall removes the hook cleanly and leaves your registry intact.

source: https://github.com/AlexanderGese/claude-manager
install: see README

would love feedback — what would make this part of your daily flow?
```

## 11. Cross-post to X (≤ 280 chars)

Three options — pick whichever vibes.

```
shipping claude-manager today.

it's a fuzzy TUI for every Claude Code session you've ever had. `cm <name>` resumes any chat from any directory. tab-completion. cost tracking. 5 themes. open source.

→ producthunt.com/posts/claude-manager
```

```
i could never find my old Claude Code chats so i built claude-manager — a TUI that captures every session and lets you resume any of them by name from anywhere.

`cm aut<Tab>` → `cm auth-rewrite` → cd's back into the project. instant.

[link]
```

```
the worst part of using Claude Code daily is finding old chats.

ssh'd to a different repo. lost the conversation. or the project moved. gone.

i made `cm` — type a name, resume the chat, in the original directory, with the original flags.

producthunt.com/posts/claude-manager
```

## 12. Hashtags for X / Hacker News headline

X hashtags: `#claudecode #ai #devtools #cli #opensource`

HN title (Show HN style):

```
Show HN: claude-manager – TUI session resumer for Claude Code (Bun, SQLite)
```

## 13. URLs

- Website / repo: `https://github.com/AlexanderGese/claude-manager`
- Issue tracker: `https://github.com/AlexanderGese/claude-manager/issues`
- License: MIT (add a `LICENSE` file before launching if not present)

---

## Pre-launch checklist

- [ ] Push the repo to `github.com/AlexanderGese/claude-manager` (public)
- [ ] Push the `v0.2.0` tag → triggers the GitHub release
- [ ] Add a `LICENSE` file (MIT)
- [ ] Record the 6 gallery screenshots / GIFs (`vhs` is your friend)
- [ ] Convert any extra screenshots to PNG, ≥ 1270×760
- [ ] Schedule the PH submission for **12:01 AM PT** the day of launch (PH gives the full day's voting window)
- [ ] Have first-comment text ready in clipboard
- [ ] Post the X tweet within 5 minutes of PH going live
- [ ] Post to HN (Show HN) within an hour
- [ ] DM 5–10 people who'd genuinely use this and ask them to upvote / leave honest feedback

## Image assets in this repo

| File | Size | Purpose |
| --- | --- | --- |
| `assets/icon.svg` | vector | source-of-truth icon-only mark |
| `assets/icon.png` | 1024 × 1024 | **Product Hunt logo** |
| `assets/icon-240.png` | 240 × 240 | favicon / small contexts |
| `assets/logo.svg` | vector | source-of-truth full logo with wordmark |
| `assets/logo.png` | 1024 × 1024 | gallery / website hero |
