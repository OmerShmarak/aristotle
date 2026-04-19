import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';

const e = React.createElement;

export function ProgressBar({ done, total }) {
  if (total === 0) return null;

  const barWidth = 20;
  const filled = Math.round((done / total) * barWidth);
  const label = total === 1 ? 'chapter' : 'chapters';
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const isDone = done === total && total > 0;

  return e(Box, {},
    !isDone ? e(Spinner, { color: '#D2691E' }) : null,
    e(Text, { color: '#D2691E' }, isDone ? '' : ' '),
    e(Text, { color: '#D2691E' }, bar),
    e(Text, { color: '#C4A87C' }, ` ${done}/${total} ${label} written`),
    isDone ? e(Text, { color: '#C4A87C' }, ' — done') : null,
  );
}
