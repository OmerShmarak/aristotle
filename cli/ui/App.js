import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useEngineState } from './hooks/useEngineState.js';
import { isProbeCommand, normalizeAnswer } from './lib/input.js';
import { listProjectFiles } from './lib/files.js';
import { injectTaggedFiles } from './lib/inject-files.js';
import { Transcript } from './components/Transcript.js';
import { LivePanel } from './components/LivePanel.js';
import { SessionPicker } from './components/SessionPicker.js';

const e = React.createElement;

// ─── Main App ───────────────────────────────────────────
export function App({
  engine,
  banner,
  topic,
  sessionId,
  filesRoot,
  initialMessages,
  showPicker: showPickerInitial,
  sessionsApi,
}) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(!!showPickerInitial);
  const [pickerSessions, setPickerSessions] = useState([]);
  const submitLockRef = useRef(false);
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
    setMessages,
  } = useEngineState(engine);

  useEffect(() => {
    if (!initialMessages || !initialMessages.length) return;
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const refreshSessions = useCallback(() => {
    if (!sessionsApi?.listSessions) return;
    setPickerSessions(sessionsApi.listSessions());
  }, [sessionsApi]);

  useEffect(() => {
    if (pickerOpen) refreshSessions();
  }, [pickerOpen, refreshSessions]);

  const projectFiles = useMemo(
    () => listProjectFiles(filesRoot || process.cwd()),
    [filesRoot],
  );

  const runProbeCommand = useCallback(() => {
    setInput('');
    const baseId = Date.now();
    appendMessage({ id: baseId, role: 'user', text: '/probe-approval' });
    appendMessage({
      id: baseId + 1,
      role: 'assistant',
      text: 'Running approval probe in an isolated Claude session.',
    });
    engine.probeApproval();
  }, [appendMessage, engine]);

  // Auto-send the initial topic IF one was provided on the command line.
  // No topic → user gets an empty chat and starts the conversation.
  useEffect(() => {
    if (started) return;
    if (pickerOpen) return;
    setStarted(true);
    if (process.env.ARISTOTLE_AUTO_PROBE === '1') {
      engine.probeApproval();
      return;
    }
    if (process.env.ARISTOTLE_SKIP_INITIAL_SEND === '1') return;
    if (initialMessages && initialMessages.length) return;
    if (topic) {
      // Topic is already rendered in the banner — no need to also echo it as
      // a user transcript row.
      engine.send(`I want to learn about: ${topic}`);
    }
  }, [started, engine, topic, pickerOpen, initialMessages]);

  const submitValue = useCallback((value) => {
    if (!value.trim() || phase !== 'idle' || submitLockRef.current) return;
    submitLockRef.current = true;
    const raw = value.trim();
    if (isProbeCommand(raw)) {
      runProbeCommand();
      queueMicrotask(() => { submitLockRef.current = false; });
      return;
    }

    const displayText = normalizeAnswer(raw, question);
    const modelText = question
      ? displayText
      : injectTaggedFiles(displayText, filesRoot || process.cwd());
    setInput('');
    appendMessage({ id: Date.now(), role: 'user', text: displayText });
    if (question) setQuestion(null);
    engine.send(modelText);
    queueMicrotask(() => { submitLockRef.current = false; });
  }, [appendMessage, phase, engine, question, runProbeCommand, setQuestion, filesRoot]);

  // When the engine emits `done`, append the open-it message to the transcript
  // and keep the chat open. No more auto-exit.
  const prevCompletedRef = useRef(null);
  useEffect(() => {
    if (!completed || completed === prevCompletedRef.current) return;
    prevCompletedRef.current = completed;
    appendMessage({
      id: Date.now(),
      role: 'assistant',
      text: `Your breakdown is ready. Open it:\n  open ${completed.artifactPath}`,
    });
  }, [completed, appendMessage]);

  const [activeSessionId, setActiveSessionId] = useState(sessionId);

  const handlePickSession = useCallback((picked) => {
    if (!picked) return;
    const restored = sessionsApi?.loadSessionMessages?.(picked.id) ?? [];
    engine.setResume({
      sessionId: picked.providerSessionId,
      breakdownDir: picked.breakdownDir,
    });
    const baseId = Date.now();
    const banner = {
      id: baseId,
      role: 'assistant',
      text: `── Resumed session ${picked.id} (${picked.topic || 'chat'}) ──`,
    };
    // Re-tag ids so they don't collide with any pre-existing transcript rows.
    const tagged = restored.map((m, i) => ({ ...m, id: baseId + 1 + i }));
    setMessages(prev => [...prev, banner, ...tagged]);
    setActiveSessionId(picked.id);
    setPickerOpen(false);
    setStarted(true);
  }, [engine, sessionsApi, setMessages]);

  const handleCancelPicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'r' && !pickerOpen && phase === 'idle') {
      setPickerOpen(true);
    }
  }, { isActive: !pickerOpen && phase === 'idle' });

  // Ctrl+C when the input is empty → double-tap to exit, matching Claude
  // Code's behavior. The ChatInput handles single-tap clear itself.
  const lastCtrlCRef = useRef(0);
  const handleCtrlCEmpty = useCallback(() => {
    const now = Date.now();
    if (phase !== 'idle') {
      const signaled = typeof engine.signal === 'function'
        ? engine.signal('interrupt')
        : typeof engine.interrupt === 'function'
          ? engine.interrupt()
          : false;
      if (signaled) return;
    }
    if (now - lastCtrlCRef.current < 2000) {
      exit();
      process.exit(0);
      return;
    }
    lastCtrlCRef.current = now;
  }, [engine, exit, phase]);

  // While the model is thinking/writing, Ctrl+C interrupts the active turn.
  // During idle, Ctrl+C is handled inside ChatInput (which calls
  // handleCtrlCEmpty when the buffer is empty).
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c' && phase !== 'idle') {
      const signaled = typeof engine.signal === 'function'
        ? engine.signal('interrupt')
        : typeof engine.interrupt === 'function'
          ? engine.interrupt()
          : false;
      if (!signaled) {
        exit();
        process.exit(0);
      }
    }
  }, { isActive: phase !== 'idle' });

  const handleInputChange = useCallback((value) => {
    setInput(value);
    if (phase === 'idle' && isProbeCommand(value) && !submitLockRef.current) {
      queueMicrotask(() => submitValue(value));
    }
  }, [phase, submitValue]);

  const isIdle = phase === 'idle' && started && !pickerOpen;

  return e(Box, { flexDirection: 'column' },
    e(Transcript, {
      banner,
      messages,
      sessionId: activeSessionId,
      topic,
    }),
    pickerOpen
      ? e(SessionPicker, {
          sessions: pickerSessions,
          onSelect: handlePickSession,
          onCancel: handleCancelPicker,
        })
      : e(LivePanel, {
          input,
          isIdle,
          phase,
          progress,
          question,
          smoother,
          status,
          projectFiles,
          chatHandlers: {
            onChange: handleInputChange,
            onSubmit: submitValue,
            onCtrlCEmpty: handleCtrlCEmpty,
          },
        }),
  );
}
