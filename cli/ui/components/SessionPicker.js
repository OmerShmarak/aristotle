import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

const e = React.createElement;

const PAGE = 10;

function relativeTime(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function SessionPicker({ sessions, onSelect, onCancel }) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => { setCursor(0); }, [sessions]);

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch === 'c')) {
      onCancel?.();
      return;
    }
    if (key.return) {
      const picked = sessions[cursor];
      if (picked) onSelect?.(picked);
      return;
    }
    if (key.upArrow || (key.ctrl && ch === 'p')) {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && ch === 'n')) {
      setCursor(c => Math.min(sessions.length - 1, c + 1));
      return;
    }
  });

  if (!sessions.length) {
    return e(Box, { flexDirection: 'column', paddingLeft: 2, paddingY: 1 },
      e(Text, { color: '#C4A87C' }, 'No past sessions to resume.'),
      e(Text, { color: '#6B6358' }, 'Press Esc to continue.'),
    );
  }

  const start = Math.max(0, Math.min(cursor - Math.floor(PAGE / 2), sessions.length - PAGE));
  const visible = sessions.slice(start, start + PAGE);

  return e(Box, { flexDirection: 'column', paddingLeft: 2, paddingY: 1 },
    e(Text, { color: '#C4A87C' }, `Resume a session  (↑/↓ to move, Enter to select, Esc to cancel)`),
    e(Text, { color: '#6B6358' }, `${sessions.length} session${sessions.length === 1 ? '' : 's'} available`),
    e(Box, { flexDirection: 'column', marginTop: 1 },
      ...visible.map((s, i) => {
        const idx = start + i;
        const selected = idx === cursor;
        const marker = selected ? '› ' : '  ';
        const color = selected ? '#D2691E' : '#DDD5C7';
        const dim = selected ? '#D2691E' : '#8B8178';
        return e(Box, { key: s.id },
          e(Text, { color },
            marker,
            (s.topic || '(chat)').slice(0, 60).padEnd(60, ' '),
          ),
          e(Text, { color: dim }, `  ${relativeTime(s.startedAt).padStart(8, ' ')}  ${s.id}`),
        );
      }),
    ),
  );
}
