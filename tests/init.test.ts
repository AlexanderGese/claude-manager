import { test, expect } from "bun:test";
import { renderInit } from "../src/commands/init.ts";

test("bash variant defines cm() and routes through cli (NOT pick directly)", () => {
  const out = renderInit("bash");
  expect(out).toContain("cm()");
  // Must call the binary with user args verbatim so cli.ts can dispatch
  // to last/here/fuzzy. Hardcoding 'pick' would silently break those.
  expect(out).toContain('command claude-manager "$@"');
  expect(out).not.toMatch(/claude-manager pick/);
  expect(out).toContain("eval");
});

test("bash variant only evals lines that look like resume commands", () => {
  // Resume lines start with `cd ` and contain `&& exec ` — only those eval.
  // Other output (doctor, scan, --help, etc.) gets printed, not executed.
  expect(renderInit("bash")).toContain('"cd "*"&& exec "*');
});

test("fish variant only evals lines that look like resume commands", () => {
  expect(renderInit("fish")).toContain("'cd *&& exec *'");
});

test("zsh variant includes the cm() wrapper and zsh-specific completion", () => {
  const out = renderInit("zsh");
  // The cm() wrapper function must be present.
  expect(out).toContain("cm()");
  expect(out).toContain('command claude-manager "$@"');
  expect(out).toContain('"cd "*"&& exec "*');
  // zsh uses compctl, not complete -F.
  expect(out).toContain("compctl -K _cm_complete cm");
  expect(out).toContain("reply=");
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
