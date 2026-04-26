import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.ts";

interface Props {
  query: string;
  filterCwd: string | null;
  total: number;
  shown: number;
}

export function SearchBar({ query, filterCwd, total, shown }: Props) {
  return (
    <Box>
      <Text color={theme.accent}> / </Text>
      <Text>{query || ""}</Text>
      <Text color={theme.fgDim}>
        {filterCwd ? `   [filter: ${filterCwd}]` : ""}
        {`   ${shown}/${total} shown`}
      </Text>
    </Box>
  );
}
