# Byte Builds: Café Shift

A small browser café-management game featuring Byte. Plain HTML, CSS, JavaScript ES modules and Canvas 2D. No framework, no backend, no runtime dependencies.

**Status: M3 animated café** (branch `m3-animated-cafe`). The M2.5 game with a detailed café, characters drawn from moving parts, and animation for brewing, carrying, serving, washing, wiping, guests and Byte, all driven by the simulation. The simulation is unchanged. A TapIt visual kit is ready at `/tapit-preview.html` but is not part of the game yet. See `docs/M3_RESULTS.md`.

## Play it

```
npm start
```

Then open http://127.0.0.1:5173/ in a browser.

- **Serve an order:** press a guest or their numbered ticket, then the coffee machine or pastry case. When it is ready, drag it from the station to the guest, or press the station and then the guest.
- **Questions** (blue bubble with a phone): press the guest to answer. It takes 2.5 s of your time and they hold the counter spot until you do.
- **Sink and tables** work as before: press to wash or wipe.
- **Your list** under the tickets shows what you are doing and the next two things. Press an item to cancel it.
- **Keys:** `4`–`6` pick or deliver to a counter guest, `1` / `2` make or pick up at the machine or pastry case, `3` sink, `7`–`9` tables, `Esc` puts back what you carry, `C` cancel, `P` pause. `Tab` reaches every target as a labelled button.
- **On a phone:** run `npm run start:lan` and open the address it prints from a phone on the same Wi-Fi. This makes the game reachable by other devices on that network until you stop it, so use it only on a network you trust.

## Requirements

- Node.js 22 or later (for the local server, tests and typecheck)
- A current browser

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Installs the development-only tools exactly as locked: TypeScript, Node's type definitions and Playwright. Needs `package-lock.json`; see "Lockfile" below |
| `npm start` | Serves the project at http://127.0.0.1:5173/ (`node tools/serve.mjs 8080` for another port) |
| `npm run start:lan` | The same, reachable from other devices on your network, for testing on a phone |
| `npm test` | Runs the automated tests with Node's built-in test runner |
| `npm run typecheck` | Type-checks all JavaScript through JSDoc annotations (`tsc -p jsconfig.json`, nothing is compiled) |
| `npm run verify` | Confirms the files in `legacy/` still match their recorded SHA-256 (`verify:legacy` is the same command) |
| `npm run balance` | Plays the shift with the four scripted players and reports gates B1–B4, plus a 20-seed summary for context |
| `npm run check` | Typecheck, tests and legacy verification together |
| `npm run check:browser` | Plays the game headlessly with real mouse, touch and keyboard input at 1280×800, 360×640 and 640×360, and fails on errors, failed requests, page scroll, small touch targets, lost input, or a result that differs from the same commands replayed in Node. See "Browser check" below |

`npm start`, `npm test` and `npm run verify` need no install. `npm run typecheck` and `npm run check:browser` need `npm ci` first.

### Browser check

Playwright is a development dependency, but it does not include a browser. Do one of these once:

- `npx playwright install chromium` downloads Playwright's own Chromium (roughly 150 MB), or
- set `CHROME_PATH` to an installed Chrome or Chromium, for example `CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.

Then run `npm run check:browser`.

### Lockfile

`package-lock.json` is committed (generated on Windows with npm 11). Use `npm ci` for a clean, locked install.

**Open the game through the local server.** Opening `index.html` straight from disk (`file://`) is not supported: browsers block module loading there.

### Development settings in the address bar

- `?seed=12345` uses another schedule seed.
- `?debug` exposes `window.cafeShift` for the browser check: the state, the command log, a speed control and a scripted player. It is not linked from the game.

## Layout

```
index.html            entry point
src/main.js           wiring between page, input, view and game
src/game.js           the loop: input to commands, fixed ticks, results
src/styles.css
src/sim/              rules. No DOM, canvas, audio, clock or unseeded randomness
  config.js           every tunable number
  rng.js              seeded random numbers
  schedule.js         seeded guest schedule for a shift
  state.js            starting state
  step.js             one tick of the rules: commands in, events out
  replay.js           play a whole shift, or replay a recorded one
  invariants.js       ownership, reverse-reference and accounting rules, checkable on any state
  digest.js           stable state fingerprint
  types.js            JSDoc type definitions
  index.js            public surface
src/view/scene.js     layout as data: hit areas, hit testing, keys
src/view/renderer.js  draws the café from the simulation state
src/view/art.js       drawing helpers ported from the prototype
src/ui/dom.js         HUD, target buttons, action strip, overlay: created once, updated in place
src/ui/labels.js      words for actions, targets and refusals
src/ui/byte.js        Byte's lines
test/                 automated tests; test/support holds the scripted players and test helpers
tools/                static server, legacy verification, balance report, browser check
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
| `none` | `f76ad97ffb398126` |
| `test-stand` | `5c6abb45cf171432` |

A changed fingerprint means the config, the schedule generator or the state shape changed. Update the pinned value only on purpose.
