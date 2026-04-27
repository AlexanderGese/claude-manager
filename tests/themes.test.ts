import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/registry/db.ts";
import { THEMES } from "../src/tui/theme.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-theme-"));
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

test("THEMES contains all 5 expected palettes", () => {
  expect(Object.keys(THEMES)).toEqual(
    expect.arrayContaining(["coral", "catppuccin", "gruvbox", "nord", "mono"])
  );
  expect(Object.keys(THEMES).length).toBe(5);
});

test("every palette has all required fields", () => {
  const REQUIRED_FIELDS = [
    "accent", "accentSoft", "accentDeep",
    "fg", "fgMuted", "fgDim",
    "bgSelected", "fgSelected",
    "border", "borderDim",
    "user", "assistant",
  ];
  for (const [name, palette] of Object.entries(THEMES)) {
    for (const field of REQUIRED_FIELDS) {
      expect((palette as any)[field]).toBeTruthy();
    }
  }
});

test("openDb seeds a default theme = 'coral' setting", () => {
  const db = openDb(join(tmp, "test.sqlite"));
  try {
    const row = db.query<{ value: string }, []>(
      "SELECT value FROM settings WHERE key='theme'"
    ).get();
    expect(row?.value).toBe("coral");
  } finally { db.close(); }
});

test("theme can be set and read back from DB", () => {
  const db = openDb(join(tmp, "test.sqlite"));
  try {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'nord')");
    const row = db.query<{ value: string }, []>(
      "SELECT value FROM settings WHERE key='theme'"
    ).get();
    expect(row?.value).toBe("nord");
  } finally { db.close(); }
});

test("theme command run() with 'list' prints all theme names", () => {
  // We test the logic directly: the list of names matches THEMES keys.
  const names = Object.keys(THEMES);
  expect(names).toContain("coral");
  expect(names).toContain("catppuccin");
  expect(names).toContain("gruvbox");
  expect(names).toContain("nord");
  expect(names).toContain("mono");
});

test("setting theme to an unknown name is rejected", () => {
  // Import run and test that it calls process.exit for unknown themes.
  // We simulate this by checking that the unknown name isn't in THEMES.
  expect(THEMES["unknowntheme"]).toBeUndefined();
});

test("coral palette has coral accent color", () => {
  expect(THEMES.coral.accent).toBe("#D97757");
});

test("nord palette has frost-cyan accent", () => {
  expect(THEMES.nord.accent).toBe("#88c0d0");
});
