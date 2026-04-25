import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

export function FileAutocomplete({ matches, selectedIndex, query }) {
  if (!matches || matches.length === 0) {
    return e(Box, { paddingLeft: 4, marginTop: 0 },
      e(Text, { color: '#6B6358' }, `no files matching "${query}"`),
    );
  }
  return e(Box, { flexDirection: 'column', paddingLeft: 4, marginTop: 0 },
    ...matches.map((path, i) =>
      e(Text, {
        key: path,
        color: i === selectedIndex ? '#D2691E' : '#8B8178',
        bold: i === selectedIndex,
      }, `${i === selectedIndex ? '›' : ' '} ${path}`),
    ),
  );
}
