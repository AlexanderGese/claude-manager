import React from "react";
import { Box, Text } from "ink";
import { theme, GLYPHS } from "./theme.ts";

interface Props {
  query: string;
  filterCwd: string | null;
  total: number;
  shown: number;
}

export function SearchBar({ query, filterCwd, total, shown }: Props) {
  return (
    <Box>
      <Text color={theme.accent} bold>{"  >  "}</Text>
      {query.length > 0 ? (
        <Text color={theme.fg} bold>{query}</Text>
      ) : (
        <Text color={theme.fgDim} italic>type to search…</Text>
      )}
      <Text color={theme.accent}>{GLYPHS.cursor}</Text>
      <Box flexGrow={1} />
      {filterCwd && (
        <>
          <Text color={theme.fgDim}>{"filter: "}</Text>
          <Text color={theme.accentSoft}>{filterCwd}</Text>
          <Text color={theme.fgDim}>{"   "}</Text>
        </>
      )}
      <Text color={theme.fg} bold>{shown}</Text>
      <Text color={theme.fgDim}>{` / ${total} `}</Text>
    </Box>
  );
}
