import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'artifacts',
  '.tui-test',
  'tui-traces',
  '.next',
  '.cache',
  'coverage',
]);

const MAX_FILES = 5000;

/**
 * Walk `rootDir` and return a list of relative file paths. Skips hidden
 * entries, common build/output dirs, and stops at MAX_FILES to keep this
 * bounded for giant repos.
 */
export function listProjectFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(relative(rootDir, join(dir, entry.name)));
      }
    }
  }
  return out.sort();
}

/**
 * Given a list of project files and a query (without the leading `@`), return
 * the best matches. Prefers prefix matches on the basename, then substring
 * matches anywhere in the path.
 */
export function matchFiles(files, query, limit = 8) {
  if (!query) return files.slice(0, limit);
  const q = query.toLowerCase();
  const prefix = [];
  const substring = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    const base = lower.split(sep).pop() || lower;
    if (base.startsWith(q) || lower.startsWith(q)) prefix.push(f);
    else if (lower.includes(q)) substring.push(f);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...substring].slice(0, limit);
}

/**
 * Walk backward from `cursorPos` in `text` to find an active `@`-token.
 * Returns `{ start, query }` (start is the index of the `@`, query is what
 * comes after it before the cursor) or `null` if the cursor isn't inside a
 * tag. The tag ends at the first whitespace.
 */
export function activeAtToken(text, cursorPos) {
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i === 0 ? '' : text[i - 1];
      if (i === 0 || /\s/.test(before)) {
        return { start: i, query: text.slice(i + 1, cursorPos) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}
