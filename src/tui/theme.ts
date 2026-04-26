import { existsSync } from "node:fs";
import { join } from "node:path";

// Claude-inspired palette. Coral primary, warm secondaries, deep neutrals.
// Hex values render as truecolor — cli.ts forces FORCE_COLOR=3.
export const theme = {
  accent:        "#D97757",  // Claude coral — primary
  accentSoft:    "#E8B894",  // peach — secondary highlight
  accentDeep:    "#7A4131",  // dark coral — subtle borders, dim accents
  fg:            "#F5F0E8",  // warm off-white — primary text
  fgMuted:       "#A89986",  // tan — secondary text
  fgDim:         "#6B6258",  // dim brown-gray — tertiary
  bgSelected:    "#D97757",
  fgSelected:    "#1A1410",
  border:        "#D97757",
  borderDim:     "#3A2E26",  // very dim warm brown — sub-pane borders
  user:          "#E8B894",
  assistant:     "#A89986",
} as const;

export const GLYPHS = {
  fav:         "*",
  unfav:       " ",
  bullet:      "*",
  rowMark:     "▌",   // chunky half-block — selected-row indicator
  rowMarkThin: "▎",   // thin left bar — message bullet in preview
  hRule:       "─",
  vRule:       "│",
  diamond:     "◆",
  cursor:      "▮",
} as const;

export function relativeTime(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSec;
  const SIXTY_DAYS = 60 * 86400;
  if (delta > SIXTY_DAYS) {
    const d = new Date(unixSec * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (delta < 60)        return "just now";
  if (delta < 3600)      return `${Math.floor(delta/60)}m ago`;
  if (delta < 86400)     return `${Math.floor(delta/3600)}h ago`;
  if (delta < 2 * 86400) return "yesterday";
  if (delta < 7 * 86400) return `${Math.floor(delta/86400)}d ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

// Time bucket label for grouping the list.
// Favorites are handled separately by the caller.
export function timeBucket(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSec;
  if (delta < 86400)        return "today";
  if (delta < 2 * 86400)    return "yesterday";
  if (delta < 7 * 86400)    return "this week";
  if (delta < 30 * 86400)   return "this month";
  return "older";
}

// Lazy, memoized language tag derived from marker files in cwd.
// Cache lives for the process lifetime — TUIs are short-lived.
const LANG_CACHE = new Map<string, string>();
export function langTag(cwd: string): string {
  const cached = LANG_CACHE.get(cwd);
  if (cached !== undefined) return cached;
  let tag = "   ";
  try {
    if (existsSync(join(cwd, "Cargo.toml")))                                       tag = "rs ";
    else if (existsSync(join(cwd, "go.mod")))                                      tag = "go ";
    else if (existsSync(join(cwd, "pyproject.toml")) ||
             existsSync(join(cwd, "requirements.txt")) ||
             existsSync(join(cwd, "setup.py")))                                    tag = "py ";
    else if (existsSync(join(cwd, "package.json"))) {
      tag = existsSync(join(cwd, "tsconfig.json")) ? "ts " : "js ";
    }
    else if (existsSync(join(cwd, "Gemfile")))                                     tag = "rb ";
    else if (existsSync(join(cwd, "deno.json")) || existsSync(join(cwd, "deno.jsonc"))) tag = "dn ";
    else if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle"))) tag = "jv ";
    else if (existsSync(join(cwd, ".git")))                                        tag = "git";
  } catch { /* ignore */ }
  LANG_CACHE.set(cwd, tag);
  return tag;
}

// Backwards-compat alias for older imports.
export const ICONS = GLYPHS;
