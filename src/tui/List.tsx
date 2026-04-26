import React from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS, relativeTime } from "./theme.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  rows: SessionRow[];
  selectedIndex: number;
  height: number;
  width: number;
}

const TITLE_W = 38;
const CWD_W   = 32;

export function List({ rows, selectedIndex, height, width }: Props) {
  const windowSize = Math.max(1, height - 1);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(windowSize / 2), rows.length - windowSize));
  const slice = rows.slice(start, start + windowSize);

  let lastFavIdx = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i].is_favorite) { lastFavIdx = i; break; }
  }

  if (rows.length === 0) {
    return (
      <Box paddingTop={1} paddingLeft={2}>
        <Text color={theme.fgDim} italic>no sessions match. press </Text>
        <Text color={theme.accent} bold>backspace</Text>
        <Text color={theme.fgDim} italic> to clear search.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {slice.map((row, i) => {
        const realIdx = start + i;
        const isSel = realIdx === selectedIndex;
        const isFav = row.is_favorite === 1;

        const title = row.custom_name ?? row.first_prompt ?? "(untitled)";
        const cwdShort = shorten(row.cwd, CWD_W);
        const when = relativeTime(row.last_activity_at);

        // Reserve 4 chars for left gutter (` ▎ * ` style markers).
        const gutter = 4;
        const meta = `${cwdShort.padEnd(CWD_W)}  ${when}`;
        const titleSlice = title.padEnd(TITLE_W).slice(0, TITLE_W);
        // Available content width minus gutter and the meta block.
        const interior = Math.max(1, width - gutter - 1);
        const contentRaw = `${titleSlice}  ${meta}`;
        const content = contentRaw.length > interior
          ? contentRaw.slice(0, interior - 1) + "…"
          : contentRaw.padEnd(interior);

        return (
          <React.Fragment key={row.session_id}>
            <Box>
              {isSel ? (
                <>
                  <Text color={theme.accent} bold>{GLYPHS.rowMark} </Text>
                  <Text backgroundColor={theme.bgSelected} color={theme.fgSelected} bold>
                    {` ${isFav ? GLYPHS.fav : " "} ${content} `}
                  </Text>
                </>
              ) : (
                <Text>
                  <Text>  </Text>
                  <Text color={isFav ? theme.accent : theme.fgDim} bold={isFav}>
                    {` ${isFav ? GLYPHS.fav : " "} `}
                  </Text>
                  <Text color={theme.fg}>{titleSlice}</Text>
                  <Text color={theme.fgDim}>{`  ${cwdShort.padEnd(CWD_W)}  `}</Text>
                  <Text color={theme.accentSoft}>{when}</Text>
                </Text>
              )}
            </Box>

            {i === lastFavIdx && lastFavIdx < slice.length - 1 && (
              <Box>
                <Text color={theme.accentDeep}>
                  {`  ${GLYPHS.hRule.repeat(2)} `}
                </Text>
                <Text color={theme.accent} bold>favorites</Text>
                <Text color={theme.accentDeep}>
                  {` ${GLYPHS.hRule.repeat(Math.max(1, width - 16))}`}
                </Text>
              </Box>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}
