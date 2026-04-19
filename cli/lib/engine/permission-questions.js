export function extractQuestions(permissionDenials) {
  const questions = [];

  for (const denial of permissionDenials) {
    if (denial.tool_name !== 'AskUserQuestion') continue;

    const question = denial.tool_input?.questions?.[0];
    if (!question) continue;

    questions.push({
      question: question.question || '',
      header: question.header || 'Approval',
      multiSelect: Boolean(question.multiSelect),
      options: Array.isArray(question.options) ? question.options : [],
    });
  }

  return questions;
}
