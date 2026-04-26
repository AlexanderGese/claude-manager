import { test, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
const HOOK = join(import.meta.dir, "..", "src", "hook", "hook.sh");

beforeEach(() => { home = mkdtempSync(join(tmpdir(), "cm-hook-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

function runHook(arg: "start" | "stop", input: object) {
  execSync(`bash "${HOOK}" ${arg}`, {
    input: JSON.stringify(input),
    env: { ...process.env, HOME: home },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("start event writes one JSON line to queue.jsonl", () => {
  runHook("start", { session_id: "abc", cwd: "/tmp", transcript_path: "" });
  const queue = join(home, ".claudemanager", "queue.jsonl");
  expect(existsSync(queue)).toBe(true);
  const lines = readFileSync(queue, "utf8").trim().split("\n");
  expect(lines).toHaveLength(1);
  const evt = JSON.parse(lines[0]);
  expect(evt.event).toBe("start");
  expect(evt.session_id).toBe("abc");
  expect(evt.cwd).toBe("/tmp");
  expect(Array.isArray(evt.argv)).toBe(true);
});

test("stop event with transcript counts messages + tokens", () => {
  const transcript = join(home, "t.jsonl");
  writeFileSync(transcript, [
    JSON.stringify({ message: { role: "user",      content: "hello",  usage: { input_tokens: 5, output_tokens: 0 } } }),
    JSON.stringify({ message: { role: "assistant", content: "hi",     usage: { input_tokens: 0, output_tokens: 3 } } }),
  ].join("\n") + "\n");
  runHook("stop", { session_id: "abc", cwd: "/tmp", transcript_path: transcript });
  const queue = join(home, ".claudemanager", "queue.jsonl");
  const evt = JSON.parse(readFileSync(queue, "utf8").trim());
  expect(evt.event).toBe("stop");
  expect(evt.message_count).toBe(2);
  expect(evt.token_count).toBe(8);
  expect(evt.first_prompt).toBe("hello");
});

test("missing session_id is silently dropped", () => {
  runHook("start", { cwd: "/tmp", transcript_path: "" } as any);
  const queue = join(home, ".claudemanager", "queue.jsonl");
  expect(existsSync(queue)).toBe(false);
});
