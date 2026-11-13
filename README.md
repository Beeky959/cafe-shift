# Byte Builds: Café Shift

A small browser café-management game featuring Byte. Plain HTML, CSS, JavaScript ES modules and Canvas 2D. No framework, no backend, no runtime dependencies.

**Status: Milestone M0 (scaffold).** The page shows an empty scene and the simulation's starting state. There is no gameplay yet. The plan is in `docs/BUILD_PLAN.md`.

## Requirements

- Node.js 22 or later (for the local server, tests and typecheck)
- A current browser

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Installs the development-only tools exactly as locked: TypeScript, Node's type definitions and Playwright. Needs `package-lock.json`; see "Lockfile" below |
| `npm start` | Serves the project at http://127.0.0.1:5173/ (`node tools/serve.mjs 8080` for another port) |
| `npm test` | Runs the automated tests with Node's built-in test runner |
| `npm run typecheck` | Type-checks all JavaScript through JSDoc annotations (`tsc -p jsconfig.json`, nothing is compiled) |
| `npm run verify` | Confirms the files in `legacy/` still match their recorded SHA-256 (`verify:legacy` is the same command) |
| `npm run check` | Typecheck, tests and legacy verification together |
| `npm run check:browser` | Loads the page headlessly at 1280×800 and 360×640 and fails on console errors, failed requests, page scroll or a state fingerprint that differs from Node's. See "Browser check" below |

`npm start`, `npm test` and `npm run verify` need no install. `npm run typecheck` and `npm run check:browser` need `npm ci` first.

### Browser check

Playwright is a development dependency, but it does not include a browser. Do one of these once:

- `npx playwright install chromium` downloads Playwright's own Chromium (roughly 150 MB), or
- set `CHROME_PATH` to an installed Chrome or Chromium, for example `CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.

Then run `npm run check:browser`.

### Lockfile

`package-lock.json` is **not yet in the repository**. It could not be generated where this milestone was built, because that environment has no access to the npm registry. On a machine with network access, run once:

```
npm install
git add package-lock.json
git commit -m "Add dependency lockfile"
```

From then on use `npm ci`. Until that commit exists, `npm ci` fails by design.

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
  invariants.js       ownership, reverse-reference and accounting rules, checkable on any state
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

All three received files are listed in `legacy/SHA256SUMS`. The game does not load anything from this folder. `.gitattributes` marks the folder as binary so Git never converts its line endings; keep that file.

## Determinism

The same seed, shift and preset always give the same starting state, in Node and in the browser. The default state's fingerprint is pinned in `test/state.test.js` and shown on the page:

| Preset | Fingerprint |
|---|---|
| `none` | `f95c5e831d48c5a4` |
| `test-stand` | `fb9cdb894ece56f0` |

A changed fingerprint means the config, the schedule generator or the state shape changed. Update the pinned value only on purpose.
