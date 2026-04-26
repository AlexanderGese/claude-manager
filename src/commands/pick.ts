import React from "react";
import { render } from "ink";
import { openSync, createWriteStream, createReadStream } from "node:fs";
import { openDb } from "../registry/db.ts";
import { App } from "../tui/App.tsx";
import type { SessionRow } from "../registry/search.ts";

export function buildResumeLine(row: SessionRow): string {
  const argv = JSON.parse(row.launch_argv_json) as string[];
  const filtered = argv.filter(a => a !== "--resume" && !a.startsWith("--resume="));
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
