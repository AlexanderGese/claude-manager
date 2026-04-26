import { test, expect } from "bun:test";
import { buildResumeLine } from "../src/commands/pick.ts";
import type { SessionRow } from "../src/registry/search.ts";

function row(overrides: Partial<SessionRow> & { session_id: string; cwd: string; launch_argv_json: string }): SessionRow {
  const defaults: Omit<SessionRow, "session_id" | "cwd" | "launch_argv_json"> = {
    env_json: null,
    git_branch: null,
    git_sha: null,
    first_prompt: null,
    custom_name: null,
    is_favorite: 0,
    is_archived: 0,
    is_backfilled: 0,
    message_count: 0,
    token_count: 0,
    status: null,
    created_at: 0,
    last_activity_at: 0,
    origin_host: null,
    schema_version: 1,
  };
  return { ...defaults, ...overrides };
}

test("buildResumeLine: simple argv preserved + --resume appended", () => {
  const r = row({ session_id: "s1", cwd: "/p", launch_argv_json: JSON.stringify(["claude", "--model", "opus"]) });
  expect(buildResumeLine(r)).toBe("cd /p && exec claude --model opus --resume s1\n");
});

test("buildResumeLine: prepends 'claude' when missing from argv", () => {
  const r = row({ session_id: "s1", cwd: "/p", launch_argv_json: JSON.stringify(["--model", "opus"]) });
  expect(buildResumeLine(r)).toBe("cd /p && exec claude --model opus --resume s1\n");
});

test("buildResumeLine: strips prior --resume and its value, then re-adds the new id", () => {
  const r = row({
    session_id: "new",
    cwd: "/p",
    launch_argv_json: JSON.stringify(["claude", "--model", "opus", "--resume", "old-id", "--mcp-config", "x"]),
  });
  expect(buildResumeLine(r)).toBe("cd /p && exec claude --model opus --mcp-config x --resume new\n");
});

test("buildResumeLine: strips --resume=value joined form", () => {
  const r = row({
    session_id: "new",
    cwd: "/p",
    launch_argv_json: JSON.stringify(["claude", "--resume=old-id", "--model", "opus"]),
  });
  expect(buildResumeLine(r)).toBe("cd /p && exec claude --model opus --resume new\n");
});

test("buildResumeLine: shell-quotes paths with spaces", () => {
  const r = row({
    session_id: "s1",
    cwd: "/path with spaces/proj",
    launch_argv_json: JSON.stringify(["claude"]),
  });
  expect(buildResumeLine(r)).toBe("cd '/path with spaces/proj' && exec claude --resume s1\n");
});

test("buildResumeLine: shell-quotes paths with single quotes using '\\'' splice", () => {
  const r = row({
    session_id: "s1",
    cwd: "/it's/here",
    launch_argv_json: JSON.stringify(["claude"]),
  });
  expect(buildResumeLine(r)).toBe("cd '/it'\\''s/here' && exec claude --resume s1\n");
});

test("buildResumeLine: shell-quotes argv values with metacharacters", () => {
  const r = row({
    session_id: "s1",
    cwd: "/p",
    launch_argv_json: JSON.stringify(["claude", "--system-prompt", "you are $(evil)"]),
  });
  expect(buildResumeLine(r)).toBe("cd /p && exec claude --system-prompt 'you are $(evil)' --resume s1\n");
});
