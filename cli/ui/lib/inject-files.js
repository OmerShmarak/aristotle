import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const MAX_BYTES = 200_000;

/**
 * Scan `message` for `@path` tokens and produce the text sent to the model.
 * Each successfully-read file is appended as a labeled block; missing files
 * are left untouched (the `@token` remains in the message as plain text).
 */
export function injectTaggedFiles(message, cwd) {
  const tokenRe = /(^|\s)@([^\s]+)/g;
  const seen = new Set();
  const blocks = [];

  for (const m of message.matchAll(tokenRe)) {
    const rel = m[2];
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = resolve(cwd, rel);
    let contents;
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) {
        contents = `[file too large to inline — ${st.size} bytes, limit ${MAX_BYTES}]`;
      } else {
        contents = readFileSync(abs, 'utf-8');
      }
    } catch {
      continue;
    }

    blocks.push(
      `The user tagged a file: @${rel}\n<file_content path="${rel}">\n${contents}\n</file_content>`,
    );
  }

  if (!blocks.length) return message;
  return `${message}\n\n${blocks.join('\n\n')}`;
}
