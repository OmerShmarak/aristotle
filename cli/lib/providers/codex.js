import { checkCodex, runCodex } from '../Codex.js';

export const codexProvider = {
  name: 'codex',
  displayName: 'Codex',
  logFile: 'Codex.jsonl',
  run: runCodex,
  check: checkCodex,
};
