import React from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS, relativeTime, timeBucket, langTag } from "./theme.ts";
import type { SessionRow } from "../registry/search.ts";

interface Props {
  rows: SessionRow[];
  selectedIndex: number;
  height: number;
  width: number;
  selection?: Set<string>;
  tagsByRow?: Map<string, string[]>;
}

const TITLE_W = 38;
const CWD_W   = 30;

export function List({ rows, selectedIndex, height, width, selection, tagsByRow }: Props) {
  if (rows.length === 0) {
    return (
      <Box paddingTop={1} paddingLeft={2}>
        <Text color={theme.fgDim} italic>no sessions match. press </Text>
        <Text color={theme.accent} bold>backspace</Text>
        <Text color={theme.fgDim} italic> to clear search.</Text>
      </Box>
    );
  }

  // Pre-compute per-row bucket tags. Then window the visible slice.
  const buckets = rows.map(r => r.is_favorite ? "favorites" : timeBucket(r.last_activity_at));

  const headerBudget = Math.min(3, Math.max(1, Math.floor(height / 6)));
  const windowSize = Math.max(1, height - 1 - headerBudget);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(windowSize / 2), rows.length - windowSize));
  const slice = rows.slice(start, start + windowSize);

  const lineWidth = Math.max(20, width);

  return (
    <Box flexDirection="column">
      {slice.map((row, i) => {
        const realIdx = start + i;
        const isSel = realIdx === selectedIndex;
        const isFav = row.is_favorite === 1;
        const isInBulk = selection?.has(row.session_id) ?? false;
        const bucket = buckets[realIdx];
        const prevBucket = realIdx > 0 ? buckets[realIdx - 1] : null;
        const showHeader = i === 0 || bucket !== prevBucket;

        const title = row.custom_name ?? row.first_prompt ?? "(untitled)";
        const cwdShort = shorten(row.cwd, CWD_W);
        const when = relativeTime(row.last_activity_at);
        const lang = langTag(row.cwd);
        const rowTags = tagsByRow?.get(row.session_id) ?? [];

        const titleSlice = title.padEnd(TITLE_W).slice(0, TITLE_W);
        // gutter (` ▌ * [ts]  `) ≈ 11 chars. Reserve, then fill.
        const gutter = 11;
        const meta = `${cwdShort.padEnd(CWD_W)}  ${when}`;
        const interior = Math.max(1, lineWidth - gutter - 1);
        const contentRaw = `${titleSlice}  ${meta}`;
        const content = contentRaw.length > interior
          ? contentRaw.slice(0, interior - 1) + "…"
          : contentRaw.padEnd(interior);

        // Tag chips only if there's room (need at least 10 chars per tag).
        const tagsStr = rowTags.length > 0 && lineWidth > 80
          ? " " + rowTags.map(t => `#${t}`).join(" ")
          : "";

        // Left marker: bulk-selected rows show [x], others show fav glyph.
        const favMark = isInBulk ? "[x]" : ` ${isFav ? GLYPHS.fav : " "} `;

        return (
          <React.Fragment key={row.session_id}>
            {showHeader && <SectionHeader bucket={bucket} width={lineWidth} />}

            <Box>
              {isSel ? (
                <>
                  <Text color={isInBulk ? theme.accent : theme.accent} bold>{`${GLYPHS.rowMark}${GLYPHS.rowMark} `}</Text>
                  <Text backgroundColor={theme.bgSelected} color={theme.fgSelected} bold>
                    {favMark}
                  </Text>
                  <Text backgroundColor={theme.bgSelected} color={theme.fgSelected} bold>
                    {`${lang}  ${content} `}
                  </Text>
                  {tagsStr.length > 0 && (
                    <Text backgroundColor={theme.bgSelected} color={theme.fgSelected}>{tagsStr}</Text>
                  )}
                </>
              ) : (
                <Text>
                  <Text>   </Text>
                  <Text color={isInBulk ? theme.accent : (isFav ? theme.accent : theme.fgDim)} bold={isFav || isInBulk}>
                    {favMark}
                  </Text>
                  <Text color={theme.accentDeep}>{lang}</Text>
                  <Text color={theme.fg}>{`  ${titleSlice}`}</Text>
                  <Text color={theme.fgDim}>{`  ${cwdShort.padEnd(CWD_W)}  `}</Text>
                  <Text color={theme.accentSoft}>{when}</Text>
                  {tagsStr.length > 0 && (
                    <Text color={theme.accentSoft}>{tagsStr}</Text>
                  )}
                </Text>
              )}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

function SectionHeader({ bucket, width }: { bucket: string; width: number }) {
  const isFav = bucket === "favorites";
  const label = isFav ? `${GLYPHS.fav} favorites` : bucket;
  const labelColored = (
    <Text color={isFav ? theme.accent : theme.accentSoft} bold>{label}</Text>
  );
  const trailing = Math.max(1, width - label.length - 6);
  return (
    <Box>
      <Text color={theme.accentDeep}>{`  ${GLYPHS.hRule.repeat(2)} `}</Text>
      {labelColored}
      <Text color={theme.accentDeep}>{` ${GLYPHS.hRule.repeat(trailing)}`}</Text>
    </Box>
  );
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}
