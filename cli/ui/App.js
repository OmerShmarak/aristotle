import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useEngineState } from './hooks/useEngineState.js';
import { isProbeCommand, normalizeAnswer } from './lib/input.js';
import { Transcript } from './components/Transcript.js';
import { LivePanel } from './components/LivePanel.js';

const e = React.createElement;

// ─── Main App ───────────────────────────────────────────
export function App({ engine, banner, topic, sessionId }) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const submitLockRef = useRef(false);
  const inputRef = useRef('');
  const {
    appendMessage,
    completed,
    messages,
    phase,
    progress,
    question,
    setQuestion,
    smoother,
    status,
  } = useEngineState(engine);

  const runProbeCommand = useCallback(() => {
    setInput('');
    inputRef.current = '';
    const baseId = Date.now();
    appendMessage({ id: baseId, role: 'user', text: '/probe-approval' });
    appendMessage({
      id: baseId + 1,
      role: 'assistant',
      text: 'Running approval probe in an isolated Claude session.',
    });
    engine.probeApproval();
  }, [appendMessage, engine]);

  // Auto-send the initial topic
  useEffect(() => {
    if (!started) {
      setStarted(true);
      if (process.env.ARISTOTLE_AUTO_PROBE === '1') {
        engine.probeApproval();
        return;
      }
      if (process.env.ARISTOTLE_SKIP_INITIAL_SEND === '1') return;
      engine.send(`I want to learn about: ${topic}`);
    }
  }, [started, engine, topic]);

  const submitValue = useCallback((value) => {
    if (!value.trim() || phase !== 'idle' || submitLockRef.current) return;
    submitLockRef.current = true;
    const raw = value.trim();
    if (isProbeCommand(raw)) {
      runProbeCommand();
      queueMicrotask(() => { submitLockRef.current = false; });
      return;
    }

    const text = normalizeAnswer(raw, question);
    setInput('');
    appendMessage({ id: Date.now(), role: 'user', text });
    if (question) setQuestion(null);
    engine.send(text);
    queueMicrotask(() => { submitLockRef.current = false; });
  }, [appendMessage, phase, engine, question, runProbeCommand, setQuestion]);

  // Handle user submit
  const handleSubmit = useCallback((value) => {
    submitValue(value);
  }, [submitValue]);

  const handleInputChange = useCallback((value) => {
    inputRef.current = value;
    setInput(value);
    if (phase === 'idle' && isProbeCommand(value) && !submitLockRef.current) {
      queueMicrotask(() => submitValue(value));
    }
  }, [isProbeCommand, phase, submitValue]);

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
    if (key.return && phase === 'idle') {
      submitValue(inputRef.current);
    }
  });

  const isIdle = phase === 'idle' && started && !completed;

  return e(Box, { flexDirection: 'column' },
    e(Transcript, { banner, messages, sessionId, topic }),
    e(LivePanel, {
      completed,
      input,
      isIdle,
      phase,
      progress,
      question,
      sessionId,
      smoother,
      status,
      topicInputHandlers: {
        onChange: handleInputChange,
        onSubmit: handleSubmit,
      },
    }),
  );
}
