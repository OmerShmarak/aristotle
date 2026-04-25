import { appendFileSync, writeFileSync } from 'fs';

export function resetLog(filePath) {
  if (!filePath) return;
  writeFileSync(filePath, '');
}

export function appendJsonLine(filePath, value) {
  if (!filePath) return;
  appendFileSync(filePath, JSON.stringify(value) + '\n');
}
