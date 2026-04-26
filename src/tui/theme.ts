// Claude-inspired palette. Coral primary, warm secondaries, deep neutrals.
// Hex values render as truecolor — cli.ts forces FORCE_COLOR=3.
export const theme = {
  accent:        "#D97757",  // Claude coral — primary
  accentSoft:    "#E8B894",  // peach / soft coral — hover & secondary highlight
  accentDeep:    "#7A4131",  // dark coral — subtle borders, dim accents
  fg:            "#F5F0E8",  // warm off-white — primary text
  fgMuted:       "#A89986",  // tan — secondary text
  fgDim:         "#6B6258",  // dim brown-gray — tertiary
  bgSelected:    "#D97757",  // full-row highlight bg
  fgSelected:    "#1A1410",  // near-black for max contrast on coral
  border:        "#D97757",
  borderDim:     "#3A2E26",  // very dim warm brown — sub-pane borders
  user:          "#E8B894",  // user message tag
  assistant:     "#A89986",  // assistant message tag
} as const;

// Visual glyphs. Box-drawing characters work in any modern terminal.
export const GLYPHS = {
  fav:         "*",
  unfav:       " ",
  bullet:      "*",
  rowMark:     "▎",       // selected-row left accent bar
  hRule:       "─",
  vRule:       "│",
  diamond:     "◆",       // header bullet
  cursor:      "▮",       // search cursor
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

// Backwards-compat: theme.test/init still reference ICONS.
export const ICONS = GLYPHS;
