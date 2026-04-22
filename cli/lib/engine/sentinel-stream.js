import {
  CHAPTER_DONE_RE,
  DONE_RE,
  MAX_PARTIAL_LEN,
  SENTINEL_RE,
  SLUG_RE,
  TOTAL_RE,
} from './constants.js';

export class SentinelStream {
  constructor({ onChaptersTotal, onChapterDone, onDonePath, onSlug, onText, shouldEmitText }) {
    this.buffer = '';
    this.onChaptersTotal = onChaptersTotal;
    this.onChapterDone = onChapterDone;
    this.onDonePath = onDonePath;
    this.onSlug = onSlug;
    this.onText = onText;
    this.shouldEmitText = shouldEmitText;
  }

  reset() {
    this.buffer = '';
  }

  process(text) {
    this.buffer += text;

    this.buffer = this.buffer.replace(SENTINEL_RE, (match) => {
      this.#handleSentinel(match);
      return '';
    });

    const safe = this.#splitSafeText();
    if (safe && this.shouldEmitText()) {
      this.onText(safe);
    }
    return safe;
  }

  flush() {
    if (!this.buffer) return;

    const remaining = this.buffer.replace(SENTINEL_RE, (match) => {
      this.#handleSentinel(match);
      return '';
    });

    this.buffer = '';
    if (remaining && this.shouldEmitText()) {
      this.onText(remaining);
    }
  }

  #splitSafeText() {
    const buf = this.buffer;
    let cutIdx = buf.length;

    const tailMatch = buf.match(/%%[A-Z_]*(?::[^%\n]*)?%?$/);
    if (tailMatch) {
      cutIdx = tailMatch.index;
    } else if (buf.endsWith('%')) {
      cutIdx = buf.length - 1;
    }

    if (buf.length - cutIdx > MAX_PARTIAL_LEN) {
      cutIdx = buf.length;
    }

    const safe = buf.slice(0, cutIdx);
    this.buffer = buf.slice(cutIdx);
    return safe;
  }

  #handleSentinel(token) {
    let match;

    if ((match = token.match(TOTAL_RE))) {
      this.onChaptersTotal(Number(match[1]));
      return;
    }

    if ((match = token.match(CHAPTER_DONE_RE))) {
      this.onChapterDone(match[1].trim());
      return;
    }

    if ((match = token.match(DONE_RE))) {
      this.onDonePath(match[1].trim());
      return;
    }

    if ((match = token.match(SLUG_RE))) {
      this.onSlug?.(match[1].trim());
    }
  }
}
