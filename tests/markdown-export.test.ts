import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderMarkdown } from "../src/commands/export.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cm-mdexport-"));
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

const BASIC_JSONL = [
  JSON.stringify({ sessionId: "sess-md-1", message: { role: "user", content: "Hello world" }, timestamp: "2026-01-01T10:00:00Z" }),
  JSON.stringify({ sessionId: "sess-md-1", message: { role: "assistant", content: "Hi there!" }, timestamp: "2026-01-01T10:00:05Z" }),
].join("\n");

test("renderMarkdown produces a markdown document with H1 title", () => {
  const f = join(tmp, "sess-md-1.jsonl");
  writeFileSync(f, BASIC_JSONL);
  const md = renderMarkdown("sess-md-1", f);
  expect(md).toMatch(/^# /);
});

test("renderMarkdown includes H3 headers for each role", () => {
  const f = join(tmp, "sess-md-1.jsonl");
  writeFileSync(f, BASIC_JSONL);
  const md = renderMarkdown("sess-md-1", f);
  expect(md).toContain("### user");
  expect(md).toContain("### assistant");
});

test("renderMarkdown includes message content", () => {
  const f = join(tmp, "sess-md-1.jsonl");
  writeFileSync(f, BASIC_JSONL);
  const md = renderMarkdown("sess-md-1", f);
  expect(md).toContain("Hello world");
  expect(md).toContain("Hi there!");
});

test("renderMarkdown separates messages with horizontal rules", () => {
  const f = join(tmp, "sess-md-1.jsonl");
  writeFileSync(f, BASIC_JSONL);
  const md = renderMarkdown("sess-md-1", f);
  expect(md).toContain("---");
});

test("renderMarkdown handles empty transcript gracefully", () => {
  const f = join(tmp, "empty.jsonl");
  writeFileSync(f, "");
  const md = renderMarkdown("empty", f);
  // Should at minimum produce an H1.
  expect(md).toMatch(/^# /);
});

test("renderMarkdown handles tool_use blocks as fenced code with tool name", () => {
  const line = JSON.stringify({
    sessionId: "sess-tool",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", name: "bash", input: { command: "ls -la" } },
      ],
    },
    timestamp: "2026-01-01T10:00:00Z",
  });
  const f = join(tmp, "sess-tool.jsonl");
  writeFileSync(f, line);
  const md = renderMarkdown("sess-tool", f);
  expect(md).toContain("```bash");
});

test("renderMarkdown handles array content with text blocks", () => {
  const line = JSON.stringify({
    sessionId: "sess-arr",
    message: {
      role: "user",
      content: [
        { type: "text", text: "Array content here" },
      ],
    },
    timestamp: "2026-01-01T10:00:00Z",
  });
  const f = join(tmp, "sess-arr.jsonl");
  writeFileSync(f, line);
  const md = renderMarkdown("sess-arr", f);
  expect(md).toContain("Array content here");
});
