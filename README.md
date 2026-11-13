# Byte Builds: Café Shift

A small browser café-management game featuring Byte. Plain HTML, CSS, JavaScript ES modules and Canvas 2D. No framework, no backend, no runtime dependencies.

**Status: Milestone M0 (scaffold).** The page shows an empty scene and the simulation's starting state. There is no gameplay yet. The plan is in `docs/BUILD_PLAN.md`.

## Requirements

- Node.js 22 or later (for the local server, tests and typecheck)
- A current browser

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the two development-only tools: TypeScript and Node's type definitions |
| `npm start` | Serves the project at http://127.0.0.1:5173/ (`node tools/serve.mjs 8080` for another port) |
| `npm test` | Runs the automated tests with Node's built-in test runner |
| `npm run typecheck` | Type-checks all JavaScript through JSDoc annotations (`tsc -p jsconfig.json`, nothing is compiled) |
| `npm run verify:legacy` | Confirms the files in `legacy/` still match their recorded SHA-256 |
| `npm run check` | Typecheck, tests and legacy verification together |
| `npm run check:browser` | Optional. Loads the page headlessly at 1280×800 and 360×640 and fails on console errors, failed requests, page scroll or a wrong state fingerprint. Needs Playwright available to Node; it is not a project dependency. Set `CHROME_PATH` to use an installed Chrome |

`npm start`, `npm test` and `npm run verify:legacy` need no install.

**Open the game through the local server.** Opening `index.html` straight from disk (`file://`) is not supported: browsers block module loading there.

### Development settings in the address bar

- `?seed=12345` uses another schedule seed.
- `?preset=test-stand` starts with the stand installed. This is a test-only preset for comparing the same shift with and without the stand; the campaign never uses it.

## Layout

```
index.html            entry point
src/main.js           wiring between page, view and simulation
src/styles.css
src/sim/              rules. No DOM, canvas, audio, clock or unseeded randomness
  config.js           every tunable number
  rng.js              seeded random numbers
  schedule.js         seeded guest schedule for a shift
  state.js            starting state
  invariants.js       ownership and accounting rules, checkable on any state
  digest.js           stable state fingerprint
  types.js            JSDoc type definitions
  index.js            public surface
src/view/renderer.js  canvas sizing and the placeholder scene
test/                 automated tests
tools/                static server, legacy verification, optional browser check
docs/                 audit, design, technical blueprint, build plan, review reconciliation
legacy/               the original V0.2 prototype. Reference only. Never edited
```

Two rules are enforced by tests:

1. Nothing under `src/sim/` touches the DOM, canvas, audio, the clock or `Math.random`, and it imports only from `src/sim/`.
2. The files in `legacy/` are byte-for-byte as received.

## The prototype in `legacy/`

`legacy/byte-cafe-shift-v2.html` is the original playable prototype, kept under its original filename and unchanged.

```
67658822942475d56de8a22aa315ca702f80e14260b7d3ab776fef38100989cd  byte-cafe-shift-v2.html
```

All three received files are listed in `legacy/SHA256SUMS`. The game does not load anything from this folder.

## Determinism

The same seed, shift and preset always give the same starting state, in Node and in the browser. The default state's fingerprint is pinned in `test/state.test.js` and shown on the page:

| Preset | Fingerprint |
|---|---|
| `none` | `e07c41c9965d475a` |
| `test-stand` | `0a0524c5953d3344` |

A changed fingerprint means the config, the schedule generator or the state shape changed. Update the pinned value only on purpose.
