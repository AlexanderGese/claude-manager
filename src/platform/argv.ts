import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export function unsanitizeCwd(name: string): string {
  if (!name.startsWith("-")) return name;
  return name.replace(/-/g, "/");
}

/**
 * Try every plausible unsanitization of a Claude-projects directory name back
 * into a real filesystem path. The leading `-` always represents `/`. Each
 * subsequent `-` is ambiguous: it could be a path separator, or a literal dash
 * inside a directory component (e.g. `claude-manager`, `my-feature`).
 *
 * For up to 6 ambiguous dashes we enumerate the full power-set (≤64 candidates).
 * For more, we fall back to the all-slashes form plus single-dash-preserved
 * variants — combinatorial explosion isn't worth chasing for absurdly nested paths.
 */
export function resolveCwdCandidates(name: string): string[] {
  if (!name.startsWith("-")) return [name];
  const ambiguous: number[] = [];
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "-") ambiguous.push(i);
  }
  const n = ambiguous.length;
  const candidates = new Set<string>();
  if (n <= 6) {
    for (let mask = 0; mask < (1 << n); mask++) {
      const keep = new Set<number>();
      for (let bit = 0; bit < n; bit++) {
        if (mask & (1 << bit)) keep.add(ambiguous[bit]);
      }
      let out = "/";
      for (let i = 1; i < name.length; i++) {
        out += name[i] === "-" ? (keep.has(i) ? "-" : "/") : name[i];
      }
      candidates.add(out);
    }
  } else {
    candidates.add("/" + name.slice(1).replace(/-/g, "/"));
    for (const i of ambiguous) {
      let out = "/";
      for (let j = 1; j < name.length; j++) {
        out += name[j] === "-" ? (j === i ? "-" : "/") : name[j];
      }
      candidates.add(out);
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
      // ps gives us a flat string; whitespace-split loses quoting context.
      // Acceptable for v1 — quoted args (e.g. --system-prompt "x y") are rare.
      const out = execSync(`ps -o args= -p ${ppid}`, { encoding: "utf8" }).trim();
      return out ? out.split(/\s+/) : ["claude"];
    }
  } catch { /* fall through */ }
  return ["claude"];
}
