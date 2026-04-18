import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ChapterTracker } from '../lib/tracker.js';

const e = React.createElement;

// ─── Streaming text hook ────────────────────────────────
// Appends tokens immediately as they arrive. No buffering.
function useStreamingText() {
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

// ─── Spinner ────────────────────────────────────────────
// Cycles through frames so the UI is never static.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner({ color = '#C4A87C' }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return e(Text, { color }, SPINNER_FRAMES[frame]);
}

// ─── Pulsing text ───────────────────────────────────────
// Text that gently pulses between two colors.
const PULSE_COLORS = ['#8B8178', '#C4A87C', '#DDD5C7', '#C4A87C', '#8B8178'];

function PulsingText({ children }) {
  const [ci, setCi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCi(c => (c + 1) % PULSE_COLORS.length), 400);
    return () => clearInterval(t);
  }, []);
  return e(Text, { color: PULSE_COLORS[ci] }, children);
}

// ─── Progress Bar ───────────────────────────────────────
function ProgressBar({ done, total }) {
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

// ─── Main App ───────────────────────────────────────────
export function App({ engine, banner, topic }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('');
  const [tracker] = useState(() => new ChapterTracker());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(null); // null | { artifactPath }
  const smoother = useStreamingText();

  // Wire engine events to React state
  useEffect(() => {
    const onText = (ev) => {
      if (!ev.parentToolUseId) {
        smoother.append(ev.text);
      }
    };
    const onPhase = (ev) => setPhase(ev.phase);
    const onStatus = (ev) => setStatus(ev.message);
    const onTaskStarted = (ev) => {
      tracker.handle(ev);
      setProgress({ done: tracker.completedCount, total: tracker.spawnedCount });
    };
    const onTaskCompleted = (ev) => {
      tracker.handle(ev);
      setProgress({ done: tracker.completedCount, total: tracker.spawnedCount });
    };
    const onTurnEnd = () => {
      const finalText = smoother.flush();
      if (finalText.trim()) {
        setMessages(msgs => [...msgs, { id: Date.now(), role: 'assistant', text: finalText }]);
      }
      setPhase('idle');
    };
    const onError = (ev) => {
      setMessages(msgs => [...msgs, { id: Date.now(), role: 'error', text: ev.message }]);
    };
    const onDone = (ev) => {
      setCompleted(ev);
    };

    engine.on('text', onText);
    engine.on('phase', onPhase);
    engine.on('status', onStatus);
    engine.on('task_started', onTaskStarted);
    engine.on('task_completed', onTaskCompleted);
    engine.on('turn_end', onTurnEnd);
    engine.on('error', onError);
    engine.on('done', onDone);
    return () => {
      engine.off('text', onText);
      engine.off('phase', onPhase);
      engine.off('status', onStatus);
      engine.off('task_started', onTaskStarted);
      engine.off('task_completed', onTaskCompleted);
      engine.off('turn_end', onTurnEnd);
      engine.off('error', onError);
      engine.off('done', onDone);
    };
  }, [engine, tracker]);

  // Auto-send the initial topic
  useEffect(() => {
    if (!started) {
      setStarted(true);
      engine.send(`I want to learn about: ${topic}`);
    }
  }, [started, engine, topic]);

  // Handle user submit
  const handleSubmit = useCallback((value) => {
    if (!value.trim() || phase !== 'idle') return;
    const text = value.trim();
    setInput('');
    setMessages(msgs => [...msgs, { id: Date.now(), role: 'user', text }]);
    engine.send(text);
  }, [phase, engine]);

  // Auto-exit after breakdown is complete
  useEffect(() => {
    if (!completed) return;
    const t = setTimeout(() => {
      exit();
      process.exit(0);
    }, 500);
    return () => clearTimeout(t);
  }, [completed, exit]);

  // Ctrl+C to exit
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') exit();
  });

  const isIdle = phase === 'idle' && started && !completed;
  const isWorking = phase === 'planning' || phase === 'writing';

  return e(Box, { flexDirection: 'column' },
    // Completed messages scroll up via Static
    e(Static, { items: [{ id: 'banner', role: 'banner' }, ...messages] },
      (item) => {
        if (item.role === 'banner') {
          return e(Box, { key: 'banner', flexDirection: 'column' },
            e(Text, { color: '#C4A87C' }, banner),
            e(Text, { bold: true, color: '#8B4513' }, '  A R I S T O T L E'),
            e(Text, { color: '#8B8178' }, '  Understand everything.\n'),
            e(Text, { color: '#DDD5C7' }, '  Topic: ', e(Text, { color: '#D2691E' }, topic), '\n'),
            e(Text, { color: '#6B6358' }, '  ' + '─'.repeat(50) + '\n'),
          );
        }
        const color = item.role === 'user' ? '#D2691E' : item.role === 'error' ? '#CD5C5C' : '#DDD5C7';
        const prefix = item.role === 'user' ? '\n  > ' : '';
        return e(Box, { key: String(item.id), paddingLeft: item.role === 'user' ? 0 : 2 },
          e(Text, { color, wrap: 'wrap' }, prefix + item.text + (item.role === 'user' ? '\n' : '')),
        );
      }
    ),

    // Live area
    e(Box, { flexDirection: 'column' },

      // Streaming text + blinking cursor
      smoother.display ? e(Box, { paddingLeft: 2 },
        e(Text, { color: '#DDD5C7', wrap: 'wrap' }, smoother.display),
      ) : null,

      // Status line with spinner (planning phase, no text yet)
      phase === 'planning' && !smoother.display ? e(Box, { paddingLeft: 2 },
        e(Spinner),
        e(Text, { color: '#8B8178' }, ' '),
        e(PulsingText, {}, status || 'Thinking'),
      ) : null,

      // Progress bar with spinner (writing phase)
      progress.total > 0 ? e(Box, { paddingLeft: 2, marginTop: 1 },
        e(ProgressBar, { done: progress.done, total: progress.total }),
      ) : null,

      // Completion banner
      completed ? e(Box, { flexDirection: 'column', paddingLeft: 2, marginTop: 1 },
        e(Text, { color: '#6B6358' }, '─'.repeat(50)),
        e(Text, { color: '#C4A87C', bold: true }, '\n  Your breakdown is ready!\n'),
        e(Text, { color: '#8B8178' }, '  Open it in your browser:\n'),
        e(Text, { color: '#D2691E', bold: true }, `    open ${completed.artifactPath}\n`),
        e(Text, { color: '#6B6358' }, '─'.repeat(50)),
      ) : null,

      // Input bar
      isIdle ? e(Box, { paddingLeft: 2, marginTop: 1 },
        e(Text, { color: '#D2691E' }, '> '),
        e(TextInput, {
          value: input,
          onChange: setInput,
          onSubmit: handleSubmit,
          focus: true,
          showCursor: true,
        }),
      ) : null,
    ),
  );
}
