import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

// Creates a fresh session directory under ~/.aristotle/sessions/<id>/ and
// writes meta.json. The id is YYYYMMDD-HHMMSS-xxxx (4 random hex chars),
// so `ls` is chronological and the random suffix keeps same-second launches
// distinct.
export function createSession({ topic, breakdownDir, claudeVersion, provider }) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = randomBytes(2).toString('hex');
  const id = `${stamp}-${suffix}`;

  const sessionDir = sessionsDir(id);
  mkdirSync(sessionDir, { recursive: true });

  const meta = {
    id,
    topic,
    breakdownDir,
    startedAt: now.toISOString(),
    nodeVersion: process.version,
    claudeVersion: claudeVersion || null,
    platform: process.platform,
    provider: provider || null,
    providerSessionId: null,
  };
  writeMeta(sessionDir, meta);

  return { id, sessionDir };
}

export function sessionsRoot() {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return resolve(home, '.aristotle', 'sessions');
}

export function sessionsDir(id) {
  return resolve(sessionsRoot(), id);
}

export function readMeta(sessionDir) {
  const path = resolve(sessionDir, 'meta.json');
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

export function writeMeta(sessionDir, meta) {
  writeFileSync(resolve(sessionDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
}

export function updateMeta(sessionDir, patch) {
  const current = readMeta(sessionDir) || {};
  const next = { ...current, ...patch };
  writeMeta(sessionDir, next);
  return next;
}
