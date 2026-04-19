import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

// Creates a fresh session directory under ~/.aristotle/sessions/<id>/ and
// writes meta.json. The id is YYYYMMDD-HHMMSS-xxxx (4 random hex chars),
// so `ls` is chronological and the random suffix keeps same-second launches
// distinct.
export function createSession({ topic, breakdownDir, claudeVersion }) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = randomBytes(2).toString('hex');
  const id = `${stamp}-${suffix}`;

  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const sessionDir = resolve(home, '.aristotle', 'sessions', id);
  mkdirSync(sessionDir, { recursive: true });

  const meta = {
    id,
    topic,
    breakdownDir,
    startedAt: now.toISOString(),
    nodeVersion: process.version,
    claudeVersion: claudeVersion || null,
    platform: process.platform,
  };
  writeFileSync(resolve(sessionDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  return { id, sessionDir };
}
