# REVIEW_RECONCILIATION.md

Corrections made after the independent review (verdict: approve with changes). The review text itself was not supplied; these corrections answer the eight items listed in the M0 brief. Edits were targeted; changed passages are marked "after review" in the documents.

| # | Review item | Decision | Where |
|---|---|---|---|
| 1 | Shift 2 comparison vs the stand's later unlock | A test-only preset, `test-stand`, starts the same seeded shift with the stand installed. Used by tests and the M5 slice; never by the campaign, where the stand comes only from Shop B. Whether a guest would use a stand is fixed in the schedule, so both arms see identical guests | TECH_BLUEPRINT §3; BUILD_PLAN §1, B5; GAME_DESIGN §6. Implemented in `src/sim/config.js`, `state.js`, `schedule.js` |
| 2 | Ownership and release rules | One holder per dish, guest, spot and table at every tick. Tables for dishes, spots, door, tables, stand, attended guests, each owner action (reserved at start, committed at completion, released on cancel), and end of shift. Exit questions removed | GAME_DESIGN §3a; TECH_BLUEPRINT §4. Checked by `src/sim/invariants.js` |
| 3 | Wallet, gross earnings, score | Three separate figures. Gross never decreases; wallet = start + gross − spent; score = gross + mood bonus, per shift. Spending never lowers the score | GAME_DESIGN §6. Fields in `Economy`, rule in `invariants.js` |
| 4 | Good players forced to lose customers | Removed. B4 now requires that a fast, prioritising player can serve everyone while staying busy at least 70% of the shift. B2 is a floor for naive play, not a ceiling | BUILD_PLAN §3 |
| 5 | Seeded schedules and event ordering | Schedule built once by a pure function; mulberry32 with one stream per attribute; exact counts by seeded shuffle; whole ticks. The step function uses no randomness. Eight ordered phases per tick, with the tie-break consequences stated | TECH_BLUEPRINT §3. Implemented in `rng.js`, `schedule.js` |
| 6 | Measuring the stand | Primary measures are owner time answering and counter-spot time held by asking guests. Earnings and walk-pasts are context only and never attributed to the stand. Metrics table defined | GAME_DESIGN §8; TECH_BLUEPRINT §3; BUILD_PLAN B5–B6. Counters in `Metrics` |
| 7 | Mobile interaction at 360 px | Layout budget at 360×640; ten fixed targets; 48 px minimum, 8 px gaps, no overlaps; near-miss tolerance and tie-break order; selection on `pointerdown`; invalid taps send no command; guests targeted through fixed spots | TECH_BLUEPRINT §6; BUILD_PLAN M2 gate |
| 8 | Animation phases vs simulation state | Phase table: move and work loops display the simulation's own progress; settles and exit walks are visual only, bounded, and can never delay the rules. The view never leads the simulation | TECH_BLUEPRINT §5 |

## Not changed

- GAME_AUDIT.md: findings stand as written.
- The creative goal: a café-management game with Byte, where the stand arises from guests asking about the café's digital presence.
- Stack: plain HTML, CSS, JavaScript ES modules and Canvas. No Phaser.

## Values that are still starting points

Every number in `src/sim/config.js` is a first value from GAME_DESIGN §4. They are tuned in M1 against gates B1–B6, by changing config only.
