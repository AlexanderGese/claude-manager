import { test, expect } from "bun:test";
import { renderInit } from "../src/commands/init.ts";

test("bash variant defines cm() and aliases", () => {
  const out = renderInit("bash");
  expect(out).toContain("cm()");
  expect(out).toContain("claude-manager pick");
  expect(out).toContain("eval");
});

test("zsh variant uses bash syntax (zsh-compatible)", () => {
  expect(renderInit("zsh")).toBe(renderInit("bash"));
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
