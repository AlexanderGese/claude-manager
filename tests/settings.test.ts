import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchSettings, unpatchSettings } from "../src/platform/settings.ts";

let tmp: string;
let path: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-settings-"));
  path = join(tmp, "settings.json");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const HOOK = "/abs/path/to/hook.sh";

test("patchSettings creates settings.json if missing", () => {
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe(`${HOOK} start`);
  expect(j.hooks.Stop[0].hooks[0].command).toBe(`${HOOK} stop`);
});

test("patchSettings preserves existing keys + other hooks", () => {
  writeFileSync(path, JSON.stringify({
    theme: "dark",
    hooks: {
      SessionStart: [
        { matcher: ".*", hooks: [{ type: "command", command: "/other/script" }] },
      ],
    },
  }));
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.theme).toBe("dark");
  expect(j.hooks.SessionStart).toHaveLength(2);
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe("/other/script");
  expect(j.hooks.SessionStart[1].hooks[0].command).toBe(`${HOOK} start`);
});

test("patchSettings is idempotent", () => {
  patchSettings(path, HOOK);
  patchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart).toHaveLength(1);
  expect(j.hooks.Stop).toHaveLength(1);
});

test("unpatchSettings removes only our entries", () => {
  writeFileSync(path, JSON.stringify({
    hooks: {
      SessionStart: [
        { matcher: ".*", hooks: [{ type: "command", command: "/other/script" }] },
      ],
    },
  }));
  patchSettings(path, HOOK);
  unpatchSettings(path, HOOK);
  const j = JSON.parse(readFileSync(path, "utf8"));
  expect(j.hooks.SessionStart).toHaveLength(1);
  expect(j.hooks.SessionStart[0].hooks[0].command).toBe("/other/script");
  expect(j.hooks.Stop ?? []).toHaveLength(0);
});

test("unpatchSettings on missing file is no-op", () => {
  unpatchSettings(path, HOOK);
  expect(existsSync(path)).toBe(false);
});
