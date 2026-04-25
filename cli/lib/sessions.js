// Provider-agnostic session catalog. Lists past Aristotle runs and
// reconstructs their transcripts from engine.jsonl. Knows nothing about
// claude-specific event shapes — engine.jsonl is the normalized layer.

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { sessionsRoot, sessionsDir, readMeta } from './session.js';

export function listSessions() {
  const root = sessionsRoot();
  if (!existsSync(root)) return [];
  const entries = readdirSync(root)
    .map(id => {
      const dir = resolve(root, id);
      let st;
      try { st = statSync(dir); } catch { return null; }
      if (!st.isDirectory()) return null;
      const meta = readMeta(dir);
      if (!meta) return null;
      return {
        id,
        dir,
        topic: meta.topic || '(chat)',
        startedAt: meta.startedAt || null,
        breakdownDir: meta.breakdownDir || null,
        provider: meta.provider || null,
        providerSessionId: meta.providerSessionId || null,
        mtimeMs: st.mtimeMs,
      };
    })
    .filter(Boolean)
    .filter(s => s.providerSessionId) // only resumable sessions
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries;
}

// Replays engine.jsonl into the message list the App's transcript expects:
// rows of { id, role: 'user'|'assistant'|'error', text }. Consecutive `text`
// events between turn boundaries are concatenated into one assistant row, the
// way the live UI commits streamed text on turn_end / tool_start.
export function loadSessionMessages(sessionId) {
  const dir = sessionsDir(sessionId);
  const logPath = resolve(dir, 'engine.jsonl');
  if (!existsSync(logPath)) return [];

  const messages = [];
  let buffer = '';
  let nextId = 1;

  const flushAssistant = () => {
    const trimmed = buffer.trim();
    buffer = '';
    if (!trimmed) return;
    messages.push({ id: nextId++, role: 'assistant', text: trimmed });
  };

  const lines = readFileSync(logPath, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const { event, payload } = entry;
    switch (event) {
      case 'user_message':
        flushAssistant();
        if (payload?.text) {
          messages.push({ id: nextId++, role: 'user', text: payload.text });
        }
        break;
      case 'text':
        if (payload?.text && !payload.parentToolUseId) buffer += payload.text;
        break;
      case 'tool_start':
        if (!payload?.parentToolUseId) flushAssistant();
        break;
      case 'turn_end':
        flushAssistant();
        break;
      case 'error':
        flushAssistant();
        if (payload?.message) {
          messages.push({ id: nextId++, role: 'error', text: payload.message });
        }
        break;
      case 'done':
        flushAssistant();
        if (payload?.artifactPath) {
          messages.push({
            id: nextId++,
            role: 'assistant',
            text: `Your breakdown is ready. Open it:\n  open ${payload.artifactPath}`,
          });
        }
        break;
    }
  }
  flushAssistant();
  return messages;
}
