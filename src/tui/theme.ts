import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { paths } from "../platform/paths.ts";

// ── Palette type ──────────────────────────────────────────────────────────────
export interface Palette {
  accent:      string;
  accentSoft:  string;
  accentDeep:  string;
  fg:          string;
  fgMuted:     string;
  fgDim:       string;
  bgSelected:  string;
  fgSelected:  string;
  border:      string;
  borderDim:   string;
  user:        string;
  assistant:   string;
}

// ── All built-in palettes ─────────────────────────────────────────────────────
export const THEMES: Record<string, Palette> = {
  coral: {
    accent:      "#D97757",
    accentSoft:  "#E8B894",
    accentDeep:  "#7A4131",
    fg:          "#F5F0E8",
    fgMuted:     "#A89986",
    fgDim:       "#6B6258",
    bgSelected:  "#D97757",
    fgSelected:  "#1A1410",
    border:      "#D97757",
    borderDim:   "#3A2E26",
    user:        "#E8B894",
    assistant:   "#A89986",
  },
  catppuccin: {
    accent:      "#f5c2e7",
    accentSoft:  "#cba6f7",
    accentDeep:  "#6e6c7e",
    fg:          "#cdd6f4",
    fgMuted:     "#a6adc8",
    fgDim:       "#7f849c",
    bgSelected:  "#f5c2e7",
    fgSelected:  "#1e1e2e",
    border:      "#f5c2e7",
    borderDim:   "#45475a",
    user:        "#89dceb",
    assistant:   "#a6e3a1",
  },
  gruvbox: {
    accent:      "#fe8019",
    accentSoft:  "#fabd2f",
    accentDeep:  "#7c6f64",
    fg:          "#ebdbb2",
    fgMuted:     "#bdae93",
    fgDim:       "#928374",
    bgSelected:  "#fe8019",
    fgSelected:  "#1d2021",
    border:      "#fe8019",
    borderDim:   "#504945",
    user:        "#83a598",
    assistant:   "#b8bb26",
  },
  nord: {
    accent:      "#88c0d0",
    accentSoft:  "#81a1c1",
    accentDeep:  "#5e81ac",
    fg:          "#eceff4",
    fgMuted:     "#d8dee9",
    fgDim:       "#4c566a",
    bgSelected:  "#88c0d0",
    fgSelected:  "#2e3440",
    border:      "#88c0d0",
    borderDim:   "#4c566a",
    user:        "#8fbcbb",
    assistant:   "#a3be8c",
  },
  mono: {
    accent:      "#ffffff",
    accentSoft:  "#dddddd",
    accentDeep:  "#888888",
    fg:          "#ffffff",
    fgMuted:     "#cccccc",
    fgDim:       "#888888",
    bgSelected:  "#ffffff",
    fgSelected:  "#000000",
    border:      "#ffffff",
    borderDim:   "#555555",
    user:        "#eeeeee",
    assistant:   "#cccccc",
  },
};

// ── Active theme — loaded once at module import ───────────────────────────────
function loadActiveName(): string {
  try {
    const db = new Database(paths.db, { readonly: true });
    try {
      const v = db.query<{ value: string }, []>(
        "SELECT value FROM settings WHERE key='theme'"
      ).get()?.value;
      return v ?? "coral";
    } finally { db.close(); }
  } catch { return "coral"; }
}

export const theme: Palette = THEMES[loadActiveName()] ?? THEMES.coral;

// ── Glyphs ────────────────────────────────────────────────────────────────────
export const GLYPHS = {
  fav:         "*",
  unfav:       " ",
  bullet:      "*",
  rowMark:     "▌",
  rowMarkThin: "▎",
  hRule:       "─",
  vRule:       "│",
  diamond:     "◆",
  cursor:      "▮",
} as const;

// ── Time helpers ──────────────────────────────────────────────────────────────
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

export function timeBucket(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSec;
  if (delta < 86400)        return "today";
  if (delta < 2 * 86400)    return "yesterday";
  if (delta < 7 * 86400)    return "this week";
  if (delta < 30 * 86400)   return "this month";
  return "older";
}

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

// Backwards-compat alias.
export const ICONS = GLYPHS;
