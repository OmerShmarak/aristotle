// Provider registry. Each provider exports { name, run, check }:
//   - run(prompt, opts): Promise<{ sessionId }>      — same shape as runClaude
//   - check(): Promise<string|null>                  — version string or null
//   - opts.resume: opaque resume token from a prior run
//   - opts.onEvent emits normalized events: text/tool_start/task_started/result/...
//
// To add a new provider, drop a file in this directory exporting that shape
// and register it below.

import { claudeCodeProvider } from './claude-code.js';
import { codexProvider } from './codex.js';

const providers = new Map();
const aliases = new Map([
  ['claude', 'claude-code'],
]);

export function registerProvider(provider) {
  if (!provider?.name) throw new Error('provider must have a name');
  providers.set(provider.name, provider);
}

export function getProvider(name) {
  const canonicalName = aliases.get(name) || name;
  const p = providers.get(canonicalName);
  if (!p) throw new Error(`unknown provider: ${name}`);
  return p;
}

export function listProviders() {
  return [...providers.keys()];
}

export function defaultProvider() {
  const requested = process.env.ARISTOTLE_PROVIDER?.trim();
  if (requested) return getProvider(requested);
  return claudeCodeProvider;
}

registerProvider(claudeCodeProvider);
registerProvider(codexProvider);
