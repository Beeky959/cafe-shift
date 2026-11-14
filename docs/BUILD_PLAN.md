# BUILD_PLAN.md — Byte Builds: Café Shift

Order matters. Each milestone has a gate; work does not move on until it passes.

## 1. The vertical slice

**Shift 2 only, playable twice: once without the stand and once with it.** The second play uses the test-only preset `test-stand` (TECH_BLUEPRINT.md §3), which starts the same seeded shift with the stand installed. The preset is not reachable from the campaign, where the stand first appears in Shop B. *(Corrected after review.)* The paired run is a test harness and is separate from campaign progression: campaign code creates shifts without a preset, and a test asserts that. One 75-second shift, the full task chain (brew, serve, tables, dishes), questions, the stand, and a results card comparing the two plays. Reused prototype art, no new art, no Shift 1, no Shift 3, no Shop A.

This is the smallest thing that can answer all four questions in the brief: is it enjoyable, does feedback satisfy, is there real prioritisation, and is the stand's use understood.

## 2. Milestones

### M0 — Scaffold
- **Build:** repository and module folders; the prototype byte-for-byte under `legacy/` with its filename kept and its SHA-256 recorded and verified by a test; a committed dependency lockfile and a declared browser-test dependency; a zero-dependency static server; simulation foundation (`config`, `rng`, `schedule`, `state`, `invariants`, `digest`) with no DOM, canvas, audio or clock; JSDoc typecheck; documented commands.
- **Depends on:** nothing. The start conditions in section 5 gate M1 onward.
- **Gate:** tests pass, including a deterministic-initial-state test with a pinned fingerprint; typecheck passes; the page loads from the local static server at desktop size and at 360×640 with no uncaught console errors, no failed local requests and no page scroll; the browser shows the same state fingerprint as Node; `legacy/` hashes verify. Loading from `file://` is not supported and not claimed.

### M1 — Simulation, no visuals
- **Status:** built. Results and open risks are in `docs/M1_RESULTS.md`.
- **Build:** the step function, state machines and events from TECH_BLUEPRINT.md §3–4 for the core loop: arrivals, brewing, plating, hand-over, tables, dishes, and manual digital-question behaviour: guests who ask the owner about Wi-Fi, the menu, Instagram, reviews or the website, and are answered by the owner. Four scripted players (section 3). **No stand rules:** the step function rejects a state with the stand installed until M4. *(Corrected after the M0 review.)*
- **Depends on:** M0.
- **Gate:** all rule tests pass; invariants hold through 10,000 random commands; `checkInvariants` returns nothing after every tick of every test, scripted run and fuzz run, including runs that cancel actions, let guests run out of patience and end the shift during an action; the same seed and commands produce the same event log; balance gates B1–B4 pass. B5–B6 are not part of M1.

### M2 — Scene and input
- **Status:** built. Results and open risks are in `docs/M2_RESULTS.md`.
- **Build:** renderer with pixel-ratio scaling and cached background, 4:3 layout, hit areas, pointer input, HUD. Entities drawn in static poses with progress bars only.
- **Depends on:** M1.
- **Gate:** Shift 2 is completable by tapping on a phone; 100 scripted taps on valid targets produce 100 commands; no scrolling at 360×640; the layout data passes the 360 px rules in TECH_BLUEPRINT.md §6 (48 px minimum, 8 px gaps, no overlaps, near-miss and tie-break behaviour).

### M2.5 — Gameplay experiment: order service by hand
- **Status:** built on a separate branch, awaiting playtest. See `docs/M2_5_EXPERIMENT.md`. M3 waits for its result.

### M3 — Animation for the core tasks
- **Status:** built on branch `m3-animated-cafe`, awaiting gameplay approval. See `docs/M3_RESULTS.md`.
- **Build:** clip selection, tweens, effects; brewing, serving, wiping, washing, customer reactions, Byte expressions.
- **Depends on:** M2.
- **Gate:** clip-selection tests pass for every state; no completion effect without a completion event in a replayed log; cancel, overlap and repeat cases from TECH_BLUEPRINT.md §5 demonstrated; frame budget met on the test phone.

### M4 — Questions and the stand
- **Build:** TapIt behaviour: the stand's rules in the simulation and the paired-run comparison (`none` against `test-stand`, same seed) as a test harness; visuals for asking guests and the stand; the phone-tap sequence, the Shop B card, the results comparison, Byte's hint rules.
- **Depends on:** M3, and confirmed TapIt facts (section 5).
- **Gate:** balance gates B5–B6 pass, and B1–B4 still pass; the stand cannot be used by the player to resolve a request; all on-screen claims match the approved wording.

### M5 — Slice playtest. Decision point
- **Build:** nothing new. Run the test in section 4.
- **Gate:** human gates H1–H6. **Pass:** continue to M6. **Fail:** fix the failing area and retest once. A second failure means the design is revisited before any further build.

### M6 — Complete the short game (only after M5 passes)
- **Build:** Shift 1 with first-time teaching, Shift 3, Shop A, star ratings, sound, results screen, score copy.
- **Gate:** a full run takes 4–6 minutes; B1–B6 re-run across all three shifts; a run without buying TapIt is completable with at least 2 stars by the priority player.

### M7 — Release checks
- **Build:** accessibility pass (focus order, reduced motion, contrast, labels), browser matrix, copy review against the claims list, load size check.
- **Gate:** works on the agreed browsers; total download under 300 KB; no console errors; disclaimers present.

## 3. Balance gates (automated: B1–B4 in M1, B5–B6 in M4)

Scripted players act at human speed, one action per second unless stated.

| Player | Behaviour |
|---|---|
| Idle | Never acts |
| Arrival-order | Always handles the oldest request; waits during brews |
| Priority | Handles the lowest patience first; uses brew time for other work; washes before dishes run out |
| Fast priority | As priority, one action per 0.7 s |

| Gate | Shift 2, no stand unless stated | Pass when |
|---|---|---|
| B1 | Idle | At least 60% of guests leave unhappy |
| B2 | Arrival-order | Serves at least 50% of guests: naive play is not hopeless |
| B3 | Priority vs arrival-order | Priority earns at least 20% more coins |
| B4 | Fast priority | Can serve every guest with none leaving unhappy, while the owner is busy at least 70% of the shift |
| B5 | Priority, `none` vs `test-stand` preset, same seed | With the stand: owner time answering falls by at least 60%, and counter-spot time held by asking guests falls by at least 60% |
| B6 | Every scripted player, same seed | The stand never lowers gross earnings, score or guest mood |

B1 and B3 prove pressure and prioritisation. B4 proves a skilled player is kept busy and is not forced to lose anyone. *(Corrected after review: the first draft required that even the best player lose guests.)* B5 measures the stand on its two primary effects, owner time and counter occupancy; B6 guards against it making anything worse, which the prototype fails. Thresholds are met by tuning `sim/config` only.

## 4. Human gates (M5)

Five people who have not seen the game, each on their own phone, with no instructions beyond what the game shows. Sessions observed silently; one question set afterwards.

| Gate | Measure | Pass when |
|---|---|---|
| H1 Learnable | Finishes the first play without asking for help | 4 of 5 |
| H2 Enjoyable | Starts a second play unprompted, or rates "would play again" 4 or 5 out of 5 | 4 of 5 |
| H3 Feedback | Names, unprompted, at least one moment that felt good to do | 4 of 5 |
| H4 Prioritisation | Describes a trade-off they made ("I left the table because…") | 4 of 5 |
| H5 Stand understood | Asked "what did the stand do?", says guests looked things up themselves so they did not have to answer | 4 of 5 |
| H6 Stand not misread | Nobody says it takes orders or payments, or that it raised reviews or sales | 5 of 5 |

Results are recorded by hand. No analytics are added to the game.

## 5. Conditions before Claude Code starts

1. **Design approved:** the single-owner model, the dish and table chain, one-tap input with no request panel, three shifts, two shops, no loan.
2. **Stack approved:** plain JavaScript modules and Canvas 2D, restructured; Phaser deferred.
3. **TapIt facts confirmed in writing:** the destinations a real TapIt page supports (Wi-Fi details, menu, Instagram, Google review link, website), and one approved sentence describing the product.
4. **Brand permissions confirmed:** use of the TapIt name, colour and wordmark in the scene, and whether Byte's current canvas design is on-model.
5. **Targets agreed:** browser floor and one named mid-range Android phone and one iPhone for testing.
6. **Playtesters lined up:** five people for M5.
7. **Repository created** with the prototype in `legacy/`.

## 6. Test strategy

| Layer | What | How |
|---|---|---|
| Rules | Every transition in the state tables; invariants | Node's built-in test runner, no dependencies |
| Determinism | Same seed and commands give the same events | Replay test |
| Robustness | 10,000 random commands | Fuzz test with invariant checks |
| Balance | B1–B4 from M1, B5–B6 from M4 | Scripted players, run on every config change |
| Animation contract | State to clip; completion effects need completion events | Pure function tests and log replay |
| Input | Tap to command on real layout sizes | Scripted pointer events in a headless browser, development only |
| Devices | Phone portrait and landscape, desktop | Manual matrix on the agreed browsers |
| Claims | Every on-screen statement about TapIt | Checklist review against condition 3 |

## 7. Handoff to Claude Code

**Read first:** GAME_AUDIT.md §8, GAME_DESIGN.md §2–8, TECH_BLUEPRINT.md §2–5.

**Start at M0, stop at M5.** Do not begin M6 without a recorded pass on H1–H6.

**Hard rules**
- Nothing under `sim/` imports from `view/`, `ui/`, `input` or `audio`, or touches the DOM, canvas, audio or clock.
- Every tunable number lives in `sim/config`.
- The step function uses no randomness. All randomness is consumed when the schedule is built.
- Wallet, gross earnings and score are separate figures; spending never lowers the score.
- No runtime dependencies. Development-only tools are allowed if they are not shipped.
- No interactive DOM node is rebuilt during play.
- The player can never resolve a request by tapping the stand.
- No text or figure implies TapIt takes orders or payments, or changes reviews, followers or sales.
- The prototype in `legacy/` is reference only and is not edited.

**Definition of done for each milestone:** its gate passes, tests are green, and a short note records what was built and any number that was changed from GAME_DESIGN.md §4 with the reason.

**When blocked:** if a balance gate cannot be met by tuning numbers in `sim/config`, stop and report which gate and what was tried. Do not add mechanics to pass a gate.
