# M2_RESULTS.md — playable interface

Milestone M2 of `BUILD_PLAN.md`: the M1 simulation connected to a café scene that can be played. No stand behaviour, no advanced animation, no extra shifts, no new mechanics. Nothing under `src/sim/` was changed.

## What was built

| Requested | What it is | Where |
|---|---|---|
| Clickable, touch-friendly stations | Nine fixed targets: machine, pastry case, sink, three counter spots, three tables. Chosen on `pointerdown`, with a 6 px near-miss tolerance at 360 px | `src/view/scene.js`, `src/main.js` |
| Customer selection and task controls | Guests are selected through the counter spot they stand in. One tap does the thing that makes sense there: hand over, answer, brew, plate, wash, wipe | `resolveTap`, `src/game.js` |
| Progress indicators | Brew bar and READY sign on the machine; a work bar above the owner; a wipe bar and fading marks on the table; dirty and clean dish counts at the sink | `src/view/renderer.js` |
| Patience and order information | A bubble over each waiting guest shows a cup or croissant, or a question mark with a picture of the topic; the bar under it turns amber, then red | `renderer.js` |
| Earnings, shift timer, task queue | HUD with time, coins, happy and lost; a strip with the current action and the next two, each tappable to cancel | `src/ui/dom.js` |
| Responsive layout | One 4:3 scene. Full width in portrait, capped on desktop, beside the strip and caption on a phone held sideways | `src/styles.css` |
| Keyboard-accessible controls | Number keys 1–9, C to cancel, P or Escape to pause. Every target is also a real button reachable with Tab, with a spoken description of its state and action | `main.js`, `dom.js`, `src/ui/labels.js` |
| Basic Byte messages | Each thing taught once, as it first happens; reminders limited to two each, twelve seconds apart; no narration of routine actions | `src/ui/byte.js` |
| Intro, pause and results | One overlay, updated in place. The shift pauses by itself when the page is hidden | `game.js` |

A tap that can do nothing sends no command: the target flashes red and Byte's line says why.

## Determinism is preserved

- The game loop is the only code that advances the simulation; a test forbids the view and the interface from calling it.
- The loop runs fixed 1/30 s ticks, so the result does not depend on frame rate.
- **Checked in the browser:** after a session played with real mouse, touch or keyboard input, the recorded commands are replayed in Node and must give the identical final state. A second shift left to the scripted player must match the same player run in Node.

## Checks

| Check | Result |
|---|---|
| Automated tests | 98 of 98 |
| Typecheck | Passed |
| Legacy verification | Unchanged |
| Balance gates B1–B4 | Unchanged from M1 |
| Browser check, 1280×800, mouse and keyboard | Passed |
| Browser check, 360×640, touch | Passed |
| Browser check, 640×360, touch | Passed |

What the browser check asserts at each size: no console errors or warnings, no failed or outside requests, no page scroll, a 4:3 scene, every target button at least 48 px, HUD and caption fully on screen, 100 presses giving exactly 100 commands, a refused tap explained without a command, a near-miss tap accepted, cancel from the strip and from the keyboard, pause freezing the clock, a guest served and paid, results matching the state, and the replay comparisons above.

Smallest target measured: 51 px at 360×640, 59 px at 640×360, 122 px at 1280×800.

## Not done, on purpose

- **Animation.** Figures slide along the simulation's own timers and otherwise stand still. Guests disappear when they leave. That is M3.
- **The stand, the shop, more shifts, sound.** Later milestones.

## Risks and things to look for when you play

1. **Tested in headless Chrome only.** Not on a physical phone, and not in Safari or Firefox. Touch feel, text size and performance on a real device are unverified.
2. **Guests cross in front of each other** as they walk to the counter, and for a moment two bubbles can overlap.
3. **Strictness of taps.** A guest cannot be tapped until their order is ready, and the machine cannot be tapped while a finished latte is still on it. The refusal is explained each time, but it may feel fussy.
4. **Pace.** The shift was balanced with scripted players. Whether 75 seconds with 14 guests feels busy, frantic or slow to a person is the main thing this milestone exists to find out.
5. **Reading the scene at phone size.** The topic pictures in question bubbles are about 13 px across on a 360 px screen.
6. **Byte's lines are few and plain.** They explain; they do not yet have much character.
