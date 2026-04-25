// Provider registry. Each provider exports { name, run, check }:
//   - run(prompt, opts): Promise<{ sessionId }>      — same shape as runClaude
//   - check(): Promise<string|null>                  — version string or null
//   - opts.resume: opaque resume token from a prior run
//   - opts.onEvent emits normalized events: text/tool_start/task_started/result/...
//
// To add a new provider, drop a file in this directory exporting that shape
// and register it below.

import { claudeCodeProvider } from './claude-code.js';

const providers = new Map();

export function registerProvider(provider) {
  if (!provider?.name) throw new Error('provider must have a name');
  providers.set(provider.name, provider);
}

export function getProvider(name) {
  const p = providers.get(name);
  if (!p) throw new Error(`unknown provider: ${name}`);
  return p;
}

export function listProviders() {
  return [...providers.keys()];
}

export function defaultProvider() {
  return claudeCodeProvider;
}

registerProvider(claudeCodeProvider);
