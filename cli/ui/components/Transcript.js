import React from 'react';
import { Box, Static, Text } from 'ink';
import { Banner } from './Banner.js';

const e = React.createElement;

export function Transcript({ banner, messages, sessionId, topic }) {
  return e(Static, { items: [{ id: 'banner', role: 'banner' }, ...messages] }, (item) => {
    if (item.role === 'banner') {
      return e(Banner, { banner, topic, sessionId });
    }

    const color = item.role === 'user' ? '#D2691E' : item.role === 'error' ? '#CD5C5C' : '#DDD5C7';
    const prefix = item.role === 'user' ? '\n  > ' : '';

    return e(Box, { key: String(item.id), paddingLeft: item.role === 'user' ? 0 : 2 },
      e(Text, { color, wrap: 'wrap' }, prefix + item.text + '\n'),
    );
  });
}
