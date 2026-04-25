import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { activeAtToken, matchFiles } from '../lib/files.js';
import { FileAutocomplete } from './FileAutocomplete.js';

const e = React.createElement;

const AUTOCOMPLETE_LIMIT = 8;

/**
 * Controlled single-line input built on Ink's useInput. Unlike ink-text-input
 * this supports Ctrl+W and Option/Meta+Backspace (word delete), and owns the
 * @-tag autocomplete popup.
 *
 * Props:
 *   value, onChange(value, cursor?)        — controlled text
 *   onSubmit(value)                        — Enter pressed (not consumed by autocomplete)
 *   onCtrlCEmpty()                         — Ctrl+C when input is empty (parent decides: exit)
 *   placeholder                            — string shown when value === ''
 *   focus                                  — default true; disables input when false
 *   projectFiles                           — array of relative paths for @-autocomplete
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  onCtrlCEmpty,
  placeholder = '',
  focus = true,
  projectFiles = [],
}) {
  const [cursor, setCursor] = useState(value.length);

  // If the parent swaps `value` out-of-band (e.g. reset to '' on submit),
  // clamp the cursor so it stays inside the string.
  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, value.length)));
  }, [value]);

  const atToken = useMemo(() => activeAtToken(value, cursor), [value, cursor]);
  const autocompleteActive = !!atToken;
  const matches = useMemo(() => {
    if (!atToken) return [];
    return matchFiles(projectFiles, atToken.query, AUTOCOMPLETE_LIMIT);
  }, [atToken, projectFiles]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    setSelectedIndex(0);
  }, [atToken?.query, atToken?.start]);

  const commit = useCallback((next, nextCursor) => {
    onChange(next);
    setCursor(Math.max(0, Math.min(nextCursor, next.length)));
  }, [onChange]);

  const acceptCompletion = useCallback(() => {
    if (!atToken || matches.length === 0) return false;
    const selection = matches[Math.min(selectedIndex, matches.length - 1)];
    if (!selection) return false;
    const before = value.slice(0, atToken.start);
    const after = value.slice(cursor);
    const insert = `@${selection} `;
    const next = before + insert + after;
    commit(next, before.length + insert.length);
    return true;
  }, [atToken, matches, selectedIndex, value, cursor, commit]);

  useInput((input, key) => {
    if (!focus) return;

    // --- Ctrl+C --------------------------------------------------------
    // Clear a non-empty buffer. If already empty, let the parent decide
    // (usually: exit on second press).
    if (key.ctrl && input === 'c') {
      if (value.length > 0) {
        commit('', 0);
      } else {
        onCtrlCEmpty?.();
      }
      return;
    }

    // --- Autocomplete navigation --------------------------------------
    if (autocompleteActive && matches.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (key.tab || (key.return && !key.shift)) {
        if (acceptCompletion()) return;
      }
      if (key.escape) {
        // Close the popup without canceling the typed `@query`. We do that
        // by inserting a space right after the cursor so activeAtToken()
        // no longer matches — cheap and reversible.
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        commit(before + ' ' + after, cursor + 1);
        return;
      }
    }

    // --- Word delete (Ctrl+W, Meta+Backspace) -------------------------
    // Readline semantics: delete back to (but not including) the previous
    // word boundary, where "word" is a run of non-whitespace characters.
    if ((key.ctrl && input === 'w') || (key.meta && key.backspace)) {
      if (cursor === 0) return;
      let i = cursor;
      while (i > 0 && /\s/.test(value[i - 1])) i--;
      while (i > 0 && !/\s/.test(value[i - 1])) i--;
      const next = value.slice(0, i) + value.slice(cursor);
      commit(next, i);
      return;
    }

    // --- Basic movement ------------------------------------------------
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }

    // --- Backspace -----------------------------------------------------
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      commit(next, cursor - 1);
      return;
    }

    // --- Enter ---------------------------------------------------------
    if (key.return) {
      onSubmit?.(value);
      return;
    }

    // --- Printable characters -----------------------------------------
    if (input && !key.ctrl && !key.meta) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      commit(next, cursor + input.length);
    }
  }, { isActive: focus });

  const showPlaceholder = value.length === 0 && placeholder;
  const renderedValue = showPlaceholder ? '' : value;

  // Build the on-screen text: value with a block cursor at `cursor`.
  let before = '';
  let cursorChar = ' ';
  let after = '';
  if (showPlaceholder) {
    cursorChar = placeholder[0] || ' ';
    after = placeholder.slice(1);
  } else {
    before = renderedValue.slice(0, cursor);
    cursorChar = renderedValue[cursor] || ' ';
    after = renderedValue.slice(cursor + 1);
  }

  return e(Box, { flexDirection: 'column' },
    e(Box, { paddingLeft: 2 },
      e(Text, { color: '#D2691E' }, '> '),
      e(Text, { color: showPlaceholder ? '#6B6358' : '#DDD5C7' }, before),
      focus
        ? e(Text, { inverse: true, color: showPlaceholder ? '#6B6358' : '#DDD5C7' }, cursorChar)
        : e(Text, { color: showPlaceholder ? '#6B6358' : '#DDD5C7' }, cursorChar),
      e(Text, { color: showPlaceholder ? '#6B6358' : '#DDD5C7' }, after),
    ),
    autocompleteActive
      ? e(FileAutocomplete, { matches, selectedIndex, query: atToken.query })
      : null,
  );
}
