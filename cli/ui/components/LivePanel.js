import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { answerPlaceholder } from '../lib/input.js';
import { Spinner } from './Spinner.js';
import { PulsingText } from './PulsingText.js';
import { ProgressBar } from './ProgressBar.js';

const e = React.createElement;

export function LivePanel({
  completed,
  input,
  isIdle,
  phase,
  progress,
  question,
  sessionId,
  smoother,
  status,
  topicInputHandlers,
}) {
  const showSpinner =
    !smoother.display &&
    progress.total === 0 &&
    (phase === 'planning' || phase === 'writing');

  const spinnerLabel = phase === 'writing'
    ? (status || 'Starting chapter jobs')
    : (status || 'Thinking');

  return e(Box, { flexDirection: 'column' },
    smoother.display ? e(Box, { flexDirection: 'column', paddingLeft: 2 },
      e(Text, { color: '#DDD5C7', wrap: 'wrap' }, smoother.display),
    ) : null,

    showSpinner ? e(Box, { paddingLeft: 2 },
      e(Spinner),
      e(Text, { color: '#8B8178' }, ' '),
      e(PulsingText, {}, spinnerLabel),
    ) : null,

    progress.total > 0 ? e(Box, { paddingLeft: 2, marginTop: 1 },
      e(ProgressBar, { done: progress.done, total: progress.total }),
    ) : null,

    completed ? e(Box, { flexDirection: 'column', paddingLeft: 2, marginTop: 1 },
      e(Text, { color: '#6B6358' }, '─'.repeat(50)),
      e(Text, { color: '#C4A87C', bold: true }, '\n  Your breakdown is ready!\n'),
      e(Text, { color: '#8B8178' }, '  Open it in your browser:\n'),
      e(Text, { color: '#D2691E', bold: true }, `    open ${completed.artifactPath}\n`),
      sessionId ? e(Text, { color: '#6B6358' }, `  Session: ${sessionId}\n`) : null,
      e(Text, { color: '#6B6358' }, '─'.repeat(50)),
    ) : null,

    isIdle ? e(Box, { paddingLeft: 2, marginTop: 1 },
      e(Text, { color: '#D2691E' }, '> '),
      e(TextInput, {
        value: input,
        onChange: topicInputHandlers.onChange,
        onSubmit: topicInputHandlers.onSubmit,
        placeholder: question ? answerPlaceholder(question) : '',
        focus: true,
        showCursor: true,
      }),
    ) : null,
  );
}
