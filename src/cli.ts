#!/usr/bin/env bun
// IMPORTANT: must be set BEFORE any dynamic import that pulls in chalk
// (transitively via ink/react). The cm() shell wrapper captures our stdout
// via $(...), so chalk's auto-detect sees a non-TTY pipe and falls back to
// color level 0 — emitting no ANSI codes at all. The result: no coral
// selection bar, no dim text, no accent borders. Forcing truecolor here
// works because cli.ts's static imports below don't touch chalk; ink/react
// only load via dynamic import() inside the subcommand dispatch.
if (!process.env.FORCE_COLOR) process.env.FORCE_COLOR = "3";

import { paths } from "./platform/paths.ts";
import { openDb } from "./registry/db.ts";
import { drain } from "./registry/drain.ts";

const HELP = `
   █▀▀ █▀▄▀█    claude-manager v0.2.0
   █   █   █    global session resumer for claude code
   ▀▀▀ ▀   ▀

Usage:
  claude-manager [<query>]            open TUI (or auto-resume on unique fuzzy match)
  claude-manager here                 open TUI filtered to $(pwd)
  claude-manager last                 resume the most recent session anywhere
  claude-manager pick                 internal: print "cd && exec" line on stdout
  claude-manager scan                 backfill from ~/.claude/projects
  claude-manager init [bash|zsh|fish] print shell wrapper for eval
  claude-manager doctor               health check
  claude-manager prune                delete sessions older than prune_days
  claude-manager export <id> [--md]   dump session transcript (--md for markdown)
  claude-manager grep <pattern>       search message content across all transcripts
  claude-manager auto-name <id>       generate a name for a session via claude -p
  claude-manager auto-name --all      name every unnamed session (max 10)
  claude-manager theme list           list available themes
  claude-manager theme <name>         set active theme
  claude-manager theme reset          reset theme to coral (default)
  claude-manager completions          print completion tokens for shell tab completion
  claude-manager uninstall            remove hook + settings.json patch
  claude-manager --help               this help
  claude-manager --version            version
`;

const VERSION = "0.2.0";

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "";
  const rest = argv.slice(1);

  if (cmd === "--help" || cmd === "-h") { process.stdout.write(HELP); return; }
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }

  // Drain queue on every CLI invocation so the registry is fresh.
  {
    const db = openDb();
    try { drain(db, paths.queue); } finally { db.close(); }
  }

  switch (cmd) {
    case "init":        return (await import("./commands/init.ts")).run(rest);
    case "doctor":      return (await import("./commands/doctor.ts")).run();
    case "scan":        return (await import("./commands/scan.ts")).cli();
    case "pick":        return (await import("./commands/pick.ts")).run(rest);
    case "here":        return (await import("./commands/here.ts")).run();
    case "last":        return (await import("./commands/last.ts")).run();
    case "prune":       return (await import("./commands/prune.ts")).run();
    case "export":      return (await import("./commands/export.ts")).run(rest);
    case "grep":        return (await import("./commands/grep.ts")).run(rest);
    case "auto-name":   return (await import("./commands/auto-name.ts")).run(rest);
    case "theme":       return (await import("./commands/theme.ts")).run(rest);
    case "completions": return (await import("./commands/completions.ts")).run();
    case "uninstall":   return (await import("./commands/uninstall.ts")).run();
    case "":            return (await import("./commands/pick.ts")).run([]);
    default:            return (await import("./commands/fuzzy.ts")).run([cmd, ...rest]);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
