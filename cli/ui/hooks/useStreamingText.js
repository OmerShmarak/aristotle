import { useState, useCallback, useRef } from 'react';

export function useStreamingText() {
  const [display, setDisplay] = useState('');
  const ref = useRef('');

  const append = useCallback((text) => {
    ref.current += text;
    setDisplay(ref.current);
  }, []);

  const flush = useCallback(() => {
    const final = ref.current;
    ref.current = '';
    setDisplay('');
    return final;
  }, []);

  return { display, append, flush };
}
