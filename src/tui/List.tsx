import React from "react";
import { Box, Text } from "ink";
import { theme, ICONS, relativeTime } from "./theme.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  rows: SessionRow[];
  selectedIndex: number;
  height: number;
  width: number;
}

export function List({ rows, selectedIndex, height, width }: Props) {
  const windowSize = Math.max(1, height - 2);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(windowSize / 2), rows.length - windowSize));
  const slice = rows.slice(start, start + windowSize);

  let lastFavIdx = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i].is_favorite) { lastFavIdx = i; break; }
  }

  return (
    <Box flexDirection="column">
      {slice.map((row, i) => {
        const realIdx = start + i;
        const isSel = realIdx === selectedIndex;
        const title = row.custom_name ?? row.first_prompt ?? "(untitled)";
        const cwdShort = shorten(row.cwd, 32);
        const when = relativeTime(row.last_activity_at);
        const fav = row.is_favorite ? ICONS.fav : ICONS.unfav;

        // Build the visible row content, then pad to full width so the
        // selected-row background paints all the way across.
        const left = ` ${fav} ${title.padEnd(32).slice(0, 32)}  `;
        const right = `${cwdShort.padEnd(34).slice(0, 34)}${when}`;
        const fullRow = (left + right).padEnd(Math.max(1, width));

        return (
          <React.Fragment key={row.session_id}>
            <Box>
              {isSel ? (
                <Text backgroundColor={theme.bgSelected} color={theme.fgSelected} bold>
                  {fullRow}
                </Text>
              ) : (
                <Text>
                  <Text color={theme.fg}>{left}</Text>
                  <Text color={theme.fgDim}>{right.padEnd(Math.max(0, width - left.length))}</Text>
                </Text>
              )}
            </Box>
            {i === lastFavIdx && lastFavIdx < slice.length - 1 && (
              <Text color={theme.fgDim}>{ICONS.separator.repeat(Math.max(1, width))}</Text>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 3) / 2);
  const tail = Math.floor((max - 3) / 2);
  return s.slice(0, head) + "..." + s.slice(s.length - tail);
}
