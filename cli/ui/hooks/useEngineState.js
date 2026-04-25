import { useCallback, useEffect, useState } from 'react';
import { ChapterTracker } from '../../lib/tracker.js';
import { useStreamingText } from './useStreamingText.js';

export function useEngineState(engine) {
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('');
  const [question, setQuestion] = useState(null);
  const [tracker] = useState(() => new ChapterTracker());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [completed, setCompleted] = useState(null);
  const smoother = useStreamingText();
  const appendMessage = useCallback((message) => {
    setMessages((msgs) => [...msgs, message]);
  }, []);
  const commitStreamingText = useCallback(() => {
    const finalText = smoother.flush();
    if (!finalText.trim()) return;

    appendMessage({
      id: Date.now(),
      role: 'assistant',
      text: finalText,
    });
  }, [appendMessage, smoother]);

  useEffect(() => {
    const syncProgress = () => {
      setProgress({ done: tracker.completedCount, total: tracker.totalCount });
    };

    const onText = (ev) => {
      if (!ev.parentToolUseId) {
        smoother.append(ev.text);
      }
    };

    const onPhase = (ev) => setPhase(ev.phase);
    const onStatus = (ev) => setStatus(ev.message);

    const onQuestion = (ev) => {
      setQuestion(ev);
      const lines = [
        ev.header || 'Approval',
        ev.question || '',
        ...(ev.options || []).map((opt, i) => `${i + 1}. ${opt.label} — ${opt.description}`),
      ].filter(Boolean);

      appendMessage({
        id: Date.now(),
        role: 'assistant',
        text: lines.join('\n'),
      });
    };

    const onQuestionCleared = () => setQuestion(null);

    const onTurnStart = () => {
      tracker.reset();
      syncProgress();
    };

    const onChaptersTotal = (ev) => {
      tracker.setTotal(ev.total);
      syncProgress();
    };

    const onChapterDone = (ev) => {
      tracker.markDone(ev.id);
      syncProgress();
    };

    const onToolStart = (ev) => {
      if (!ev.parentToolUseId) {
        commitStreamingText();
      }
    };

    const onTurnEnd = () => {
      commitStreamingText();
      setPhase('idle');
    };

    const onError = (ev) => {
      appendMessage({
        id: Date.now(),
        role: 'error',
        text: ev.message,
      });
    };

    const onDone = (ev) => setCompleted(ev);
    const onInterrupted = (ev) => {
      appendMessage({
        id: Date.now(),
        role: 'assistant',
        text: ev.message || 'Interrupted current turn.',
      });
    };

    engine.on('text', onText);
    engine.on('phase', onPhase);
    engine.on('status', onStatus);
    engine.on('question', onQuestion);
    engine.on('question_cleared', onQuestionCleared);
    engine.on('turn_start', onTurnStart);
    engine.on('chapters_total', onChaptersTotal);
    engine.on('chapter_done', onChapterDone);
    engine.on('tool_start', onToolStart);
    engine.on('turn_end', onTurnEnd);
    engine.on('error', onError);
    engine.on('done', onDone);
    engine.on('interrupted', onInterrupted);

    return () => {
      engine.off('text', onText);
      engine.off('phase', onPhase);
      engine.off('status', onStatus);
      engine.off('question', onQuestion);
      engine.off('question_cleared', onQuestionCleared);
      engine.off('turn_start', onTurnStart);
      engine.off('chapters_total', onChaptersTotal);
      engine.off('chapter_done', onChapterDone);
      engine.off('tool_start', onToolStart);
      engine.off('turn_end', onTurnEnd);
      engine.off('error', onError);
      engine.off('done', onDone);
      engine.off('interrupted', onInterrupted);
    };
  }, [appendMessage, commitStreamingText, engine, smoother, tracker]);

  return {
    completed,
    messages,
    phase,
    progress,
    question,
    setQuestion,
    smoother,
    status,
    appendMessage,
    setMessages,
  };
}
