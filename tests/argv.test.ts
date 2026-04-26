import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unsanitizeCwd, resolveCwdCandidates, resolveBestCwd } from "../src/platform/argv.ts";

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

test("resolveCwdCandidates: includes the all-slashes form", () => {
  const c = resolveCwdCandidates("-home-x-claude-manager");
  expect(c).toContain("/home/x/claude/manager");
});

test("resolveCwdCandidates: enumerates single-dash variants", () => {
  const c = resolveCwdCandidates("-home-x-claude-manager");
  expect(c).toContain("/home/x/claude-manager");
  expect(c).toContain("/home/x-claude/manager");
});

test("resolveCwdCandidates: handles two dashed components in same name", () => {
  const c = resolveCwdCandidates("-home-user-my-project-sub-dir");
  expect(c).toContain("/home/user/my-project/sub-dir");
});

test("resolveCwdCandidates: pass-through when no leading dash", () => {
  expect(resolveCwdCandidates("weird")).toEqual(["weird"]);
});

test("resolveBestCwd: prefers an existing path over the all-slashes form", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cm-resolve-"));
  try {
    const real = join(tmp, "foo-bar", "baz");
    mkdirSync(real, { recursive: true });
    const sanitized = real.replace(/\//g, "-");
    expect(resolveBestCwd(sanitized)).toBe(real);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
