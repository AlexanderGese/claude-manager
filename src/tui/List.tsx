import React from "react";
import { Box, Text } from "ink";
import { theme, ICONS, relativeTime } from "./theme.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  rows: SessionRow[];
  selectedIndex: number;
  height: number;
}

export function List({ rows, selectedIndex, height }: Props) {
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

        return (
          <React.Fragment key={row.session_id}>
            <Box>
              <Text
                backgroundColor={isSel ? theme.bgSelected : undefined}
                color={isSel ? theme.fgSelected : theme.fg}
              >
                {` ${fav} `}
                {title.padEnd(32).slice(0, 32)}
                {"  "}
                <Text color={isSel ? theme.fgSelected : theme.fgDim}>
                  {cwdShort.padEnd(34).slice(0, 34)}{when}
                </Text>
              </Text>
            </Box>
            {i === lastFavIdx && lastFavIdx < slice.length - 1 && (
              <Text color={theme.fgDim}>{" " + ICONS.separator.repeat(70)}</Text>
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
