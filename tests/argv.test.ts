import { test, expect } from "bun:test";
import { unsanitizeCwd } from "../src/platform/argv.ts";

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
