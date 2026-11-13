# TECH_BLUEPRINT.md — Byte Builds: Café Shift

No production code is included. Tables describe behaviour; names are proposals.

## 1. Stack decision

**Recommendation: A, restructured.** Stay on plain HTML, CSS and JavaScript with Canvas 2D, and rebuild the single file as ES modules with a simulation that has no knowledge of the DOM. Do not migrate to Phaser for the first release.

| Criterion | A. Plain JS, restructured | B. Phaser + TypeScript |
|---|---|---|
| Maintainability | Good once split into modules. Small surface, no framework upgrades | Good structure, at the cost of a framework, a compiler and a bundler to maintain |
| Performance | One scene, under 30 moving things. No problem measured in the audit | Not a limiting factor either way. Adds about 345 KB compressed for the full build of the current major version before any game code |
| Testability | Rules run in Node's built-in test runner with no dependencies | Equal only if the rules are kept outside Phaser, which is the same work as A |
| Animation needs | Tweens, state-driven poses, small effects: roughly 150 lines of helper code | Tweens, timelines and sprite animation built in. Its strength is sprite sheets, which this project is not producing |
| Mobile support | Needs pixel-ratio scaling and pointer input written once | Scale manager and input built in |
| Migration cost | Low. Existing draw functions move across nearly unchanged | High. The procedural art must be re-expressed as Phaser graphics or baked to textures, and none of the audit's defects is fixed by the move |

**Why A:** every defect in the audit comes from design or from rules and visuals being tangled. An engine fixes neither. The game is one screen with a few dozen entities and no physics, camera, tilemap or asset loading. Phaser's real advantages here (scaling, input, tweens) cost a few hundred lines to cover, against a migration that discards working art code.

**Types:** JavaScript with JSDoc annotations and `// @ts-check`. The check is enforced with `tsc --noEmit` over `jsconfig.json` (`checkJs`, `strict`); TypeScript is a development-only dependency and nothing is compiled. The game is served as static files over HTTP. Opening `index.html` directly from disk is not supported, because browsers block module loading from `file://`.

**Reconsider Phaser if** the vertical slice passes and the next phase needs any of: sprite-sheet characters, more than one scene or location, particle-heavy effects, or frame time over budget on the target phone. With rules already separated, that later move replaces only the view.

**Not included:** backend, database, accounts, analytics, AI runtime, external fonts, image assets.

## 2. Module map

| Module | Responsibility | May import |
|---|---|---|
| `sim/config` | Every tunable number and the shift scripts | nothing |
| `sim/rng` | Seeded random numbers | nothing |
| `sim/schedule` | Builds the guest schedule for a shift from a seed | config, rng |
| `sim/state` | Creates the initial state for a shift | config, schedule |
| `sim/invariants` | Checks ownership and accounting rules on any state | sim only |
| `sim/digest` | Stable fingerprint of a state, for determinism tests | nothing |
| `sim/types` | JSDoc type definitions | nothing |
| `sim/step` (M1) | Advances state by one tick, applies commands, returns events | sim only |
| `sim/customers`, `sim/owner`, `sim/stations`, `sim/upgrades` | Rules for each entity | sim only |
| `view/renderer` | Canvas setup, pixel ratio, cached background layer, draw order | view, reads sim state |
| `view/scene` | Positions and hit areas for everything tappable | nothing |
| `view/actors/*` | Owner, customers, Byte, props: ported draw functions with pose parameters | view |
| `view/anim` | Tween helper and clip selection | nothing |
| `view/fx` | One-shot effects created from events | view |
| `ui/hud`, `ui/overlays`, `ui/byteLine` | DOM: clock, coins, mood, shop, results, Byte's caption | reads sim state |
| `input` | Pointer to hit area to command | view/scene |
| `audio` | Sounds from events | nothing |
| `main` | Loop and wiring | all |
| `test/*` | Rule tests, scripted players, balance gates | sim only |

**The rule that matters:** nothing under `sim/` touches the DOM, the canvas, audio or the clock. Nothing outside `sim/` changes simulation state. The view may only read state and consume events.

## 3. Data flow

```
pointer → input → command → sim.step(state, dt, commands) → events
                                   ↓                          ↓
                              state (read-only)        fx, audio, Byte
                                   ↓
                         renderer picks clips and draws
```

- **Fixed time step** of 1/30 s for rules, with rendering every frame. Time is an integer tick count and every duration is converted to whole ticks once, when the state is created. Results do not depend on frame rate, and a run can be replayed from seed plus commands.
- **Commands** are taps on a target: machine, case, sink, stand, a table, a customer, or a queued action.
- **Events** are facts: guest arrived, brew started, brew finished, item handed over, coins earned, question answered, table wiped, dish washed, action cancelled, guest left happy, guest left unhappy, guest tapped stand, shift ended. Each event carries its tick and a sequence number.

### Seeded guest schedule *(added after review)*

- The schedule is built once, before the shift, by a pure function of the shift config and the run seed. **The step function uses no randomness.**
- Generator: mulberry32. Each attribute draws from its own stream, seeded by hashing run seed, shift id and stream name, so changing one attribute never shifts another.
- Arrivals: a fixed number of guests, evenly spaced between the first and last arrival times, each moved by a bounded jitter, rounded to whole ticks, then sorted. Ids are assigned in arrival order.
- Orders, questions and stand use are **exact counts** dealt by seeded shuffle. Question topics are dealt round-robin from a shuffled list, so every supported topic appears.
- Whether a guest would use the stand is fixed in the schedule and independent of whether a stand exists. The same seed therefore gives the same guests with the stand off and on.
- Shift 3 reuses Shift 2's streams and adds its extra guests from a separate stream.

### Test-only stand preset *(added after review)*

State creation takes a preset: `none`, or `test-stand`, which starts the shift with the stand installed. The preset is used by automated tests and the M5 slice only; the campaign never passes it, and there the stand comes only from Shop B.

### Order of work inside one tick *(added after review)*

1. **Commands**, in the order received: queue an action, remove a queued action, cancel the current action.
2. **Owner.** Advance the current action. On completion, apply its effects. If idle, start the next queued action: check it, reserve, begin. An action that starts on this tick first makes progress on the next.
3. **Machine.** Advance brews; a finished brew becomes ready.
4. **Guests, in ascending id.** Advance timers and apply transitions: walking, patience, consuming, stand use, leaving.
5. **Releases and promotions.** Freed counter spots go to the head of the door queue; a free stand goes to the head of its queue.
6. **Arrivals** due on this tick, in ascending id: claim a spot, join the door queue, or walk past.
7. **Shift phase:** doors close, shift ends.
8. Tick count increases by one.

Consequences: a hand-over that completes on the tick patience would reach zero succeeds, because the owner is processed first and attended guests do not lose patience. A spot freed on a tick is refilled on the same tick.

### Metrics recorded by the simulation *(added after review)*

| Metric | Unit |
|---|---|
| Owner time by category: start brew, plate, hand over, answer, wipe, wash, travel, idle | ticks |
| Counter-spot time by guest state: waiting, asking | spot-ticks |
| Time with every counter spot occupied | ticks |
| Guests served, left happy, left unhappy, walked past | count |
| Gross earnings, coins spent, wallet | coins |

The stand is judged first on owner time spent answering and on counter-spot time held by asking guests.

## 4. State machines

**Shift:** intro → playing ⇄ paused → summary → shop → next shift, or results.

**Customer:**

| From | Event | To |
|---|---|---|
| arriving | reached a spot | waiting |
| arriving | spots and door full | walking past |
| waiting | handed order, has a question, stand not used | asking |
| waiting | handed order, has a supported question, uses stand | at stand |
| waiting | handed order, no question | seated or standing |
| waiting, asking | patience reaches zero | leaving unhappy |
| asking | owner finished answering | walking to a table, or standing |
| at stand | tap sequence ended | walking to a table, or standing |
| walking to a table | walk timer ended | seated |
| seated, standing | consume timer ended | leaving happy |

Walking in, walking to a table and walking to the stand are timed simulation states, because spots and tables are claimed and released around them. The walk out is visual only: the guest has already released everything. Full ownership rules are in GAME_DESIGN.md §3a.

**Owner:** idle → travelling → working → idle. A cancel during travelling or working returns to idle. Queued actions that have become invalid are dropped with an `action cancelled` event.

**Machine:** empty → brewing → ready → empty. With the second head, two independent slots.

**Table:** clean → occupied → dirty → being wiped → clean. A cancelled wipe returns to dirty.

**Sink:** holds a count of dirty dishes. Washing moves one dish at a time to clean.

**Stand:** absent → placed → idle ⇄ in use.

**Invariants, tested continuously:** clean + in use + dirty dishes equals the total; a customer is in exactly one place; no timer is negative; a counter spot holds at most one customer; wallet equals starting wallet plus gross earnings minus coins spent.

## 5. Animation system

### Principles
1. **State picks the pose.** Each frame, every visible entity selects its clip from its simulation state. The view never decides that something has happened.
2. **Progress drives timed actions.** Brewing, wiping, washing and answering read a 0–1 progress value from the simulation. They cannot drift, and pause works automatically.
3. **Events trigger one-shots.** Coin pops, hearts, puffs, the stand tick.
4. **Each entity owns its own clip.** The machine brews while the owner wipes; two things animate independently with no special case.

### Phases and their relation to simulation state *(added after review)*

| Visual phase | Driven by | Length | Can it delay the simulation? |
|---|---|---|---|
| Move | Owner `travelling`, guest walking states: position is the simulation's own progress value | Set by the simulation | No. It is the simulation's timer, displayed |
| Work loop | Owner `working`, machine `brewing`, guest `at stand`: pose is a function of progress 0–1 | Set by the simulation | No |
| Settle, success | The completion event | 250 ms at most | No. Visual only; the simulation has already moved on |
| Settle, cancel | The cancel event | 100 ms at most | No |
| Idle and reactions | The entity's current state (waiting, impatient, seated…) | While the state lasts | No |
| Exit walk | The guest-left event, on a visual copy of the guest | Up to 1 s | No. The guest no longer exists in the simulation |

- The view never leads the simulation and trails it by at most one settle.
- A new clip interrupts a settle. If the owner starts another action the frame after completing one, the settle is cut short.
- No visual phase has a timer the rules depend on. Any wait the player must sit through is a simulation duration in `sim/config`.

### Required behaviours
| Situation | Behaviour |
|---|---|
| Cancellation | The simulation emits `action cancelled`. The clip settles to idle in about 100 ms. No completion effect plays |
| Completion | A completion one-shot plays only on the completion event, never because a clip reached its end |
| Overlap | One body clip per entity. One-shots layer on top |
| Repetition | Re-triggering a one-shot restarts it. A looping clip that is already playing continues. Effects are pooled with a cap of 24 |
| Pause | Everything freezes, including idle motion |
| Reduced motion | When the device asks for it, bobbing and shaking are disabled; state changes still show |

### Clips by subject
| Subject | Clips |
|---|---|
| Brewing coffee | Owner: reach to machine. Machine: empty, brewing (shake and steam scaled by progress, fill bar), ready (cup with steam, soft pulse) |
| Serving drinks | Owner: pick up, carry, hand over. Item travels owner to guest on an arc. Guest: receive |
| Cleaning tables | Owner: walk to table, wipe loop bound to progress. Table: dirty marks fade with progress, sparkle on completion |
| Washing dishes | Owner: scrub loop. Sink: bubbles while active. Dish stack counts change one at a time, each with a small pop |
| Customer reactions | Idle, waiting (foot tap begins under half patience), impatient (under a quarter), receive, happy, tip, frown and leave, asking, walking |
| Byte expressions | Neutral, happy, thinking, concerned, pointing, celebrating. Eye shapes and antenna colour only; body bob continues |
| Stand interaction | Guest: walk to stand, phone out, tap. Stand: ring pulse on tap. Phone card: page with five icons, one highlights, tick. Guest: phone away, continue |

### Verifying it
The clip selector is a pure function of entity state, so it is unit tested without a canvas: for each state, the expected clip. A recorded event log is replayed against the effects layer to confirm every completion effect has a matching completion event.

## 6. Rendering and mobile

- **One scene, 4:3**, logical size 960×720, scaled uniformly. Backing store multiplied by device pixel ratio, capped at 2.
- **Layers:** static background drawn once to an offscreen canvas; dynamic entities; effects.
- **Nothing interactive is rebuilt during play.** DOM nodes persist and are updated in place. This removes the lost-tap defect from the audit.

### Interaction at 360 px wide *(specified after review)*

**Layout at 360×640, portrait, top to bottom, no page scroll:** HUD 44 px; scene 360×270, full width; action strip 48 px; Byte's caption 56 px. The page is locked (`overscroll-behavior: none`), the canvas takes `touch-action: none`, and safe-area insets are respected. In landscape the scene is height-limited and centred.

**Scale:** 0.375 screen px per logical px.

**Targets:** ten, all at fixed positions: machine, pastry case, sink, three counter spots, three tables, stand. Guests are targeted through the spot or table they occupy, never through the moving figure, so a target cannot move under a finger.

| Rule | Value |
|---|---|
| Minimum hit rectangle | 128×128 logical = 48×48 px |
| Minimum gap between hit rectangles | 22 logical = 8 px |
| Overlap between hit rectangles | None; checked by a test on the layout data |
| Near-miss tolerance | A tap outside every rectangle selects the nearest one whose edge is within 16 logical = 6 px |
| Tie-break for equal distance | Counter spot, machine, pastry case, sink, table, stand |
| Action-strip chips | 48×48 px each: the current action and two queued |

**Selection:**
1. Decided on `pointerdown`, from the primary pointer only. There is no drag, long-press, double-tap or hover dependence.
2. The point is converted to logical coordinates and matched to one target by the rules above.
3. The target's context decides the action: waiting guest with their item ready → hand over; asking guest → answer; empty machine → start brew; pastry case → plate; dirty table → wipe; sink with dirty dishes → wash; stand → show its description.
4. If the target has no valid action now, no command is sent. The target shakes and shows what is missing (for example a dish icon). Actions are never chained automatically.
5. A second `pointerdown` on the same target within 80 ms is ignored.
6. An accepted tap is acknowledged on the next frame by a press flash and a new chip in the action strip.

**Desktop:** the same targets, with a hover highlight and number keys 1–9 and 0 mapped to them; Escape pauses.
- **Text in the scene:** icons only. Words live in the DOM.
- **Browser floor:** proposed as current and previous major versions of Chrome, Edge, Firefox and Safari, and iOS Safari 16 or later. To be confirmed.
- **Frame budget:** 95th percentile under 16.7 ms on the agreed test phone.

## 7. What moves across from the prototype

| Prototype | Destination |
|---|---|
| `byte`, `customer`, `plant`, `rounded`, `oval`, `poly`, `textAt` (L105–112) | `view/actors`, with pose parameters added |
| Background portion of `drawWorld` (L115–151) | `view/renderer`, cached layer, recomposed to 4:3 |
| `sound` (L57) | `audio`, driven by events |
| Pause, visibility and Escape handling (L173–176) | `main` |
| Modal and overlay styles, palette, focus styles | `ui/overlays`, CSS unminified |
| Schedule tables (L47–51) | `sim/config`, new content |
| Footer and results disclaimers (L41, L71, L73) | `ui/overlays`, wording kept |

Everything in the prototype's rules (L63–102, L163–167) is replaced.
