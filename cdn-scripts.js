// Single source of truth for renderer CDN URLs.
//
// Consumers:
//   - build-book.sh        — via `node -e 'console.log(require(...).BUILD_HEAD.join("\n"))'`
//   - verify-render.js     — via `require('../cdn-scripts.js').RENDERER_SCRIPTS`
//   - verify-collisions.js — via `require('../cdn-scripts.js').RENDERER_SCRIPTS`
//
// When adding a new renderer skill that needs a new CDN script:
//   1. Add the URL to RENDERER_SCRIPTS below.
//   2. That's it. Build script and both verifiers pick it up automatically.
//
// KaTeX is for the build only (renders inline math in the published HTML);
// it's not needed for visual verification.

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

const KATEX_HEAD = [
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">',
  '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>',
  '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>',
];

const BUILD_HEAD = [
  ...KATEX_HEAD,
  ...RENDERER_STYLES.map((url) => `<link rel="stylesheet" href="${url}">`),
  ...RENDERER_SCRIPTS.map((url) => `<script src="${url}"></script>`),
];

module.exports = { RENDERER_SCRIPTS, RENDERER_STYLES, KATEX_HEAD, BUILD_HEAD };
