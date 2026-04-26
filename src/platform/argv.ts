import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export function unsanitizeCwd(name: string): string {
  if (!name.startsWith("-")) return name;
  return name.replace(/-/g, "/");
}

/**
 * Try the obvious unsanitized path first, then a few fallbacks that
 * preserve known dash-containing path components (e.g. "claude-manager",
 * "next.js", scoped dirs). Returns the first that exists, or the obvious one.
 */
export function resolveCwdCandidates(name: string): string[] {
  if (!name.startsWith("-")) return [name];
  const obvious = name.replace(/-/g, "/");
  const candidates = new Set<string>([obvious]);
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "-") {
      const variant =
        name.slice(0, i).replace(/-/g, "/") + "-" +
        name.slice(i + 1).replace(/-/g, "/");
      candidates.add(variant);
    }
  }
  return [...candidates];
}

export function resolveBestCwd(name: string): string {
  const candidates = resolveCwdCandidates(name);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? name;
}

export function readParentArgv(): string[] {
  const ppid = process.ppid;
  try {
    if (platform() === "linux") {
      const raw = readFileSync(`/proc/${ppid}/cmdline`);
      const parts = raw
        .toString("utf8")
        .split("\0")
        .filter(s => s.length > 0);
      return parts.length ? parts : ["claude"];
    }
    if (platform() === "darwin") {
      const out = execSync(`ps -o args= -p ${ppid}`, { encoding: "utf8" }).trim();
      return out ? out.split(/\s+/) : ["claude"];
    }
  } catch { /* fall through */ }
  return ["claude"];
}
