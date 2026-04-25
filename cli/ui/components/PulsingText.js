import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

const e = React.createElement;
const PULSE_COLORS = ['#8B8178', '#C4A87C', '#DDD5C7', '#C4A87C', '#8B8178'];

export function PulsingText({ children }) {
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setColorIndex((current) => (current + 1) % PULSE_COLORS.length), 400);
    return () => clearInterval(timer);
  }, []);

  return e(Text, { color: PULSE_COLORS[colorIndex] }, children);
}
