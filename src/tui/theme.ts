export const theme = {
  accent:        "#D97757",  // Claude coral
  accentSubtle:  "#7A4131",
  fg:            "white",
  fgDim:         "gray",
  fgFav:         "yellow",
  bgSelected:    "#D97757",  // full-row highlight bg
  fgSelected:    "black",
  border:        "#D97757",
  borderDim:     "gray",
} as const;

export const ICONS = {
  fav:        "*",
  unfav:      " ",
  selectMark: ">",
  separator:  "-",
};

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
