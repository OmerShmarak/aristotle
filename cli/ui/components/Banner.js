import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

export function Banner({ banner, topic, sessionId }) {
  return e(Box, { key: 'banner', flexDirection: 'column' },
    e(Text, { color: '#C4A87C' }, banner),
    e(Text, { bold: true, color: '#8B4513' }, '  A R I S T O T L E'),
    e(Text, { color: '#8B8178' }, '  Understand everything.\n'),
    e(Text, { color: '#DDD5C7' }, '  Topic: ', e(Text, { color: '#D2691E' }, topic)),
    sessionId ? e(Text, { color: '#6B6358' }, `  Session: ${sessionId}`) : null,
    e(Text, { color: '#6B6358' }, '\n  ' + '─'.repeat(50) + '\n'),
  );
}
