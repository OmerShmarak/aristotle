// Single source of truth for renderer CDN URLs.
//
// Consumers:
//   - build-book.sh            — via `node -e 'console.log(require(...).BUILD_HEAD.join("\n"))'`
//   - verify-render.js         — RENDERER_SCRIPTS + RENDERER_STYLES
//   - verify-collisions.js     — RENDERER_SCRIPTS + RENDERER_STYLES
//   - verify-svg-collisions.js — KATEX_SYNC_HEAD + RENDERER_SCRIPTS + RENDERER_STYLES
//   - screenshot-boards.js     — KATEX_SYNC_HEAD + RENDERER_SCRIPTS + RENDERER_STYLES
//
// When adding a new renderer skill that needs a new CDN script:
//   1. Add the URL to RENDERER_SCRIPTS below.
//   2. That's it. Build script and all verifiers pick it up automatically.
//
// KaTeX comes in two flavours: deferred for the published HTML (KATEX_HEAD,
// build only) and synchronous for the JSXGraph verifiers (KATEX_SYNC_HEAD —
// JSXGraph's useKatex labels need window.katex available at board-draw time).
// The canvas verifiers don't need KaTeX at all.

const RENDERER_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js',
  'https://cdn.jsdelivr.net/npm/p5@1.9.4/lib/p5.min.js',
  'https://cdn.jsdelivr.net/npm/3dmol@2.4.0/build/3Dmol-min.js',
  'https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraphcore.js',
];

const RENDERER_STYLES = [
  'https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css',
];

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css';
const KATEX_JS = [
  'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js',
];

const katexHead = (defer) => [
  `<link rel="stylesheet" href="${KATEX_CSS}">`,
  ...KATEX_JS.map((url) => `<script${defer ? ' defer' : ''} src="${url}"></script>`),
];

const KATEX_HEAD = katexHead(true);
const KATEX_SYNC_HEAD = katexHead(false);

const BUILD_HEAD = [
  ...KATEX_HEAD,
  ...RENDERER_STYLES.map((url) => `<link rel="stylesheet" href="${url}">`),
  ...RENDERER_SCRIPTS.map((url) => `<script src="${url}"></script>`),
];

module.exports = { RENDERER_SCRIPTS, RENDERER_STYLES, KATEX_HEAD, KATEX_SYNC_HEAD, BUILD_HEAD };
