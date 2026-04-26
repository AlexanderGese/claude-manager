import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface HookCmd { type: "command"; command: string }
interface HookEntry { matcher?: string; hooks: HookCmd[] }
interface Settings {
  hooks?: { SessionStart?: HookEntry[]; Stop?: HookEntry[]; [k: string]: HookEntry[] | undefined };
  [k: string]: unknown;
}

function load(path: string): Settings {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")) as Settings; }
  catch { return {}; }
}

function save(path: string, s: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(s, null, 2) + "\n");
}

function entryMatches(entry: HookEntry, hookPath: string): boolean {
  return entry.hooks?.some(h => h.command?.includes(hookPath) ?? false) ?? false;
}

export function patchSettings(path: string, hookPath: string): void {
  const s = load(path);
  s.hooks ??= {};
  for (const [event, arg] of [["SessionStart", "start"], ["Stop", "stop"]] as const) {
    s.hooks[event] ??= [];
    const arr = s.hooks[event]!;
    if (arr.some(e => entryMatches(e, hookPath))) continue;
    arr.push({
      matcher: ".*",
      hooks: [{ type: "command", command: `${hookPath} ${arg}` }],
    });
  }
  save(path, s);
}

export function unpatchSettings(path: string, hookPath: string): void {
  if (!existsSync(path)) return;
  const s = load(path);
  if (!s.hooks) { save(path, s); return; }
  for (const event of ["SessionStart", "Stop"] as const) {
    const arr = s.hooks[event];
    if (!arr) continue;
    s.hooks[event] = arr.filter(e => !entryMatches(e, hookPath));
    if (s.hooks[event]!.length === 0) delete s.hooks[event];
  }
  if (Object.keys(s.hooks).length === 0) delete s.hooks;
  save(path, s);
}
