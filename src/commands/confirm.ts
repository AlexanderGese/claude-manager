import { openSync } from "node:fs";
import { ReadStream as TtyReadStream, WriteStream as TtyWriteStream } from "node:tty";
import type { SessionRow } from "../registry/search.ts";

// Raw ANSI escapes — we deliberately do not import chalk here. confirm runs
// in the cm() shell wrapper context where stdout is captured by $(...). All
// user-facing text goes to /dev/tty directly so it never leaks into the
// resume line that the wrapper eval's.
const ANSI = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  coral: "\x1b[38;2;217;119;87m",
  peach: "\x1b[38;2;232;184;148m",
  muted: "\x1b[38;2;168;153;134m",
  fg:    "\x1b[38;2;245;240;232m",
};

export type ConfirmResult = "yes" | "no" | "tui";

export function confirmResume(row: SessionRow, query: string): Promise<ConfirmResult> {
  return new Promise<ConfirmResult>((resolve) => {
    let out: TtyWriteStream;
    let inp: TtyReadStream;
    try {
      out = new TtyWriteStream(openSync("/dev/tty", "w"));
      inp = new TtyReadStream(openSync("/dev/tty", "r"));
    } catch {
      // No controlling tty — fail closed, don't auto-resume something the user
      // can't confirm.
      process.stderr.write("claude-manager: no terminal for confirmation; aborting.\n");
      resolve("no");
      return;
    }

    const name = row.custom_name ?? row.first_prompt ?? "(untitled)";
    out.write(
      `\n` +
      `  ${ANSI.coral}${ANSI.bold}did you mean${ANSI.reset}  ${ANSI.peach}${ANSI.bold}${name}${ANSI.reset}\n` +
      `  ${ANSI.muted}query${ANSI.reset}  ${ANSI.fg}${query}${ANSI.reset}\n` +
      `  ${ANSI.muted}cwd  ${ANSI.reset}  ${ANSI.fg}${row.cwd}${ANSI.reset}\n` +
      `\n` +
      `  ${ANSI.coral}${ANSI.bold}↵${ANSI.reset}${ANSI.dim} resume${ANSI.reset}    ` +
      `${ANSI.coral}${ANSI.bold}t${ANSI.reset}${ANSI.dim} open TUI${ANSI.reset}    ` +
      `${ANSI.coral}${ANSI.bold}n${ANSI.reset}${ANSI.dim}/Esc cancel${ANSI.reset}\n` +
      `  `,
    );

    const cleanup = () => {
      try { inp.setRawMode(false); } catch {}
      inp.removeAllListeners("data");
      inp.pause();
    };
    const finish = (r: ConfirmResult) => {
      cleanup();
      out.write("\n");
      resolve(r);
    };

    inp.setRawMode(true);
    inp.resume();
    inp.on("data", (chunk: Buffer) => {
      const ch = chunk[0];
      // Enter (LF or CR) → yes
      if (ch === 0x0a || ch === 0x0d) return finish("yes");
      // t / T → open TUI
      if (ch === 0x74 || ch === 0x54) return finish("tui");
      // anything else (n, q, Esc, Ctrl-c, etc.) → cancel
      finish("no");
    });
  });
}
