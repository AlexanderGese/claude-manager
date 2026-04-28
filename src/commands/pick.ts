import React from "react";
import { render } from "ink";
import { openSync } from "node:fs";
import { ReadStream as TtyReadStream, WriteStream as TtyWriteStream } from "node:tty";
import { openDb } from "../registry/db.ts";
import { App } from "../tui/App.tsx";
import type { SessionRow } from "../registry/search.ts";

export function buildResumeLine(row: SessionRow): string {
  const argv = JSON.parse(row.launch_argv_json) as string[];
  // Strip any prior --resume flag AND its value token, plus --resume=foo form.
  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--resume") { i++; continue; }
    if (argv[i].startsWith("--resume=")) continue;
    filtered.push(argv[i]);
  }
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

  // When invoked through the cm() shell wrapper, stdout is captured by $(...)
  // and stdin is still the user's TTY. We must redirect Ink to /dev/tty so the
  // captured stdout stays clean for the resume line that the wrapper eval's.
  //
  // When invoked DIRECTLY as `claude-manager` (or `claude-manager pick`) from
  // an interactive shell — including a recording session like ttyd/vhs — both
  // stdout and stdin ARE the user's terminal. Use them. Opening /dev/tty in
  // that case opens a different stream than the one being recorded, and the
  // TUI never appears in the capture.
  const stdoutIsTty = process.stdout.isTTY === true;
  const stdinIsTty  = process.stdin.isTTY === true;

  let inkStdin: TtyReadStream | typeof process.stdin;
  let inkStdout: TtyWriteStream | typeof process.stdout;

  if (stdoutIsTty && stdinIsTty) {
    inkStdin  = process.stdin;
    inkStdout = process.stdout;
  } else {
    try {
      inkStdin  = new TtyReadStream(openSync("/dev/tty", "r"));
      inkStdout = new TtyWriteStream(openSync("/dev/tty", "w"));
    } catch {
      console.error("claude-manager: no controlling terminal — run `cm` interactively from a shell.");
      db.close();
      process.exit(1);
    }
  }

  let chosen: SessionRow | null = null;

  const app = render(
    React.createElement(App, {
      db,
      initialFilterCwd,
      initialQuery,
      onSelect: (row) => { chosen = row; },
      onCancel: () => { chosen = null; },
    }),
    { stdout: inkStdout as any, stdin: inkStdin as any, exitOnCtrlC: false }
  );

  app.waitUntilExit().then(() => {
    db.close();
    if (chosen) process.stdout.write(buildResumeLine(chosen));
    process.exit(0);
  });
}
