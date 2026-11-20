# M1_RESULTS.md — headless simulation

Milestone M1 of `BUILD_PLAN.md`: the café's rules with no visuals. No stand behaviour, no animation, no extra shifts.

## What was built

| Area | Where |
|---|---|
| One tick of the rules, in the eight-phase order of TECH_BLUEPRINT §3 | `src/sim/step.js` |
| Brewing and serving: start-brew, unattended brew, plating, hand-over, payment | `step.js`, transitions D1–D6 |
| Dishwashing and table cleaning: one dish at a time, wipe with lost progress on cancel | `step.js`, transitions D7–D8 |
| Guests: arrival, three counter spots, door queue of two, walking past, patience, seating or standing, tips, departures | `step.js` |
| Manual questions: a served guest may ask about Wi-Fi, the menu, Instagram, reviews, the website or the washroom; they hold the counter spot until the owner answers or their patience ends | `step.js` |
| Prioritisation: one action at a time, a queue of two, cancel and unqueue | `step.js`, `resolveTap` |
| End of shift: doors close, every guest gets an outcome, nothing left held | `step.js`, transition D9 |
| Deterministic play and replay | `src/sim/replay.js` |
| Four scripted players and gates B1–B4 | `test/support/players.js`, `tools/balance.mjs` |

## Balance gates on the shipped shift (default seed)

| Player | Served | Unhappy | Tips | Gross coins | Score | Owner busy |
|---|---|---|---|---|---|---|
| Idle | 0 of 14 | 14 | 0 | 0 | 0 | 0% |
| Arrival-order, 1 action/s | 13 of 14 | 1 | 3 | 108 | 136 | 59% |
| Priority, 1 action/s | 14 of 14 | 0 | 10 | 144 | 174 | 88% |
| Fast priority, 1 action/0.7 s | 14 of 14 | 0 | 10 | 144 | 174 | 89% |

| Gate | Result |
|---|---|
| B1 Idle loses at least 60% of guests | **Pass**: 100% |
| B2 Arrival-order serves at least 50% | **Pass**: 93% |
| B3 Priority earns at least 20% more than arrival-order | **Pass**: 144 against 108, 33% more |
| B4 Fast priority serves everyone, busy at least 70% | **Pass**: 14 of 14, none unhappy, busy 89% |

B5 and B6 need the stand and belong to M4.

### The same gates on 20 other seeds, for context

| Gate | Holds on |
|---|---|
| B1 | 20 of 20 |
| B2 | 20 of 20 |
| B3 | 17 of 20; smallest margin 18% |
| B4 | 19 of 20 |

A test requires B3 and B4 to hold on at least 15 of these 20, so the default seed is not a lucky one.

## Config changes made to pass the gates

Only `src/sim/config.js` was tuned; no mechanic was added.

| Value | Before | After | Why |
|---|---|---|---|
| Tip | 3 coins | 4 coins | B3 passed on the default seed at 22% but on only 3 of 20 other seeds |
| Tip threshold | Served with over 50% of patience left | Over 35% | At this load a well-played shift still served many guests below half patience, so good play was not being rewarded |

New config values that were previously implicit: `queueMax` (2) and `tipPatienceFraction`.

## Tests

- **Rules:** 25 tests in `test/step.test.js`, one behaviour each, with exact tick counts.
- **Invariants:** `checkInvariants` runs after every tick of every rule test, every scripted-player run and every fuzz run.
- **Fuzz:** more than 10,000 random commands, valid and invalid, across several shifts. Every dish move is checked against the permitted transitions.
- **Determinism:** the same seed and commands give identical events and state; a recorded run replays exactly; one full run is pinned by fingerprint.
- **Mutation check (not part of the suite):** ten deliberate rule bugs were injected one at a time into a copy; the suite failed on all ten.

## Risks and things to know before M2

1. **Careless play is punished mostly through tips, not lost guests.** The arrival-order player still serves 13 of 14. The difference between good and naive play is 36 coins, of which 28 come from tips. Whether that *feels* like prioritisation is a question for the M5 playtest (gate H4), and the first thing to revisit if it does not.
2. **The shift is near its capacity.** With 16 guests instead of 14, the fast player could no longer serve everyone on most seeds. There is little room to add pressure by adding guests; the machine, not the owner, is the limit.
3. **The scripted players are approximations.** They use only what a person can see, but a person will play differently. The gates show the rules allow the intended outcomes; they do not show people will find them.
4. **A tap is judged when it is made.** The machine cannot be tapped while a finished latte is still sitting on it, even though it will be free a moment later. This follows TECH_BLUEPRINT §6 and may feel strict in play; M2 will show.
5. **Questions include two topics beyond the four in the M1 brief:** the website (from the original brief) and the washroom (the one question no stand will answer, needed for M4). In M1 all six are answered the same way.
6. **A late find, kept on purpose:** a guest handed their order on the very tick the shift ends is settled on that tick, so their dish goes from the machine to the sink in one step. The fuzz test found this; it is legal (D5 then D7) and is now listed in the test.
