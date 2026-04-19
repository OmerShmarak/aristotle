export function isProbeCommand(value) {
  return value.trim() === '/probe-approval';
}

export function normalizeAnswer(value, question) {
  if (!question) return value;

  const byIndex = Number(value);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= question.options.length) {
    return question.options[byIndex - 1].label;
  }

  const lower = value.toLowerCase();
  const exact = question.options.find((opt) => opt.label.toLowerCase() === lower);
  if (exact) return exact.label;

  if (question.options.length === 2) {
    if (lower === 'y' || lower === 'yes') return question.options[0].label;
    if (lower === 'n' || lower === 'no') return question.options[1].label;
  }

  return value;
}

export function answerPlaceholder(question) {
  if (!question?.options?.length) return '';
  return `Reply with ${question.options.map((opt, i) => `${i + 1}:${opt.label}`).join(' or ')}`;
}
