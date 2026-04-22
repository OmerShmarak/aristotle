import React from 'react';
import { Box, Text } from 'ink';
import { answerPlaceholder } from '../lib/input.js';
import { ChatInput } from './ChatInput.js';
import { Spinner } from './Spinner.js';
import { PulsingText } from './PulsingText.js';
import { ProgressBar } from './ProgressBar.js';

const e = React.createElement;

export function LivePanel({
  input,
  isIdle,
  phase,
  progress,
  question,
  smoother,
  status,
  projectFiles,
  chatHandlers,
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

    isIdle ? e(Box, { flexDirection: 'column', marginTop: 1 },
      e(ChatInput, {
        value: input,
        onChange: chatHandlers.onChange,
        onSubmit: chatHandlers.onSubmit,
        onCtrlCEmpty: chatHandlers.onCtrlCEmpty,
        placeholder: question ? answerPlaceholder(question) : 'Type a message, @ to tag a file',
        focus: true,
        projectFiles,
      }),
    ) : null,
  );
}
