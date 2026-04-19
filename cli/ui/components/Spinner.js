import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

const e = React.createElement;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner({ color = '#C4A87C' }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);

  return e(Text, { color }, SPINNER_FRAMES[frame]);
}
