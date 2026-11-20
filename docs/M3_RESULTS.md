# M3_RESULTS.md — animated café

Branch `m3-animated-cafe`, built on the M2.5 order-service experiment. The simulation (`src/sim/`) and the legacy prototype are unchanged; every animation reads the simulation's state and events and never drives them.

## What changed

### Art (`src/view/props.js`, `src/view/characters.js`)

- **Café:** panelled wall with a tiled backsplash, menu board, framed print, window with a hillside view and light falling on the floor, two hanging lamps with soft glow, plants, a door with an OPEN sign, a detailed counter with inset boards, register and gate, a PICK-UP sign on the counter front, three tables with chairs.
- **Stations:** espresso machine with a pressure gauge, group head, indicator light and cups on top; a lit pastry case; a steel sink with tap, soap and a drying rack.
- **Characters:** drawn from parts (head, hair, torso, arms, legs, shoes) so they can move. The owner wears an apron. Six guests differ in skin, hair style, clothes, height and accessories (glasses, beanie, scarf).
- **Byte:** a coherent 2D Byte with a rounded white helmet, black visor, neon-lime eyes, glowing antenna, side modules and a dark hoodie with a `</>` code symbol.
- The static scene is drawn once per screen size and reused each frame; everything interactive is drawn separately on top.

### Animation (`src/view/clips.js`, `src/view/animator.js`, `src/view/renderer.js`)

**Owner:** idle sway; walking with arm and leg swing along the simulation's own travel path, through the counter gate to reach tables; reaching up to the machine; lifting and carrying a cup or plate; handing over; scrubbing at the sink; sweeping a cloth across the table; talking a question through with an open hand and a moving mouth while answering.

**Brewing:** the machine's light comes on, a cup sits under the spout, coffee pours and the cup fills in step with the simulation's brew timer, steam rises, and on `brewReady` the light pulses and a green READY frame appears. The cup carries its ticket number.

**Dishwashing:** water runs, a few soap bubbles rise, the dish in the owner's hands is scrubbed and changes from dirty to clean, and the clean dish lands on the rack when the simulation moves it there.

**Table cleaning:** a cloth sweeps the tabletop, crumbs and rings fade with the wipe's progress, a brief shine on `tableWiped`. If cancelled, the dirt returns, matching the rule that progress is lost.

**Guests:** walk in from the door; idle with small per-person variation (a gentle bob on each guest's own rhythm, looking around, blinking); look up at the menu; tap a foot, then cross their arms, then fret as patience runs out; reach for their order; smile on `itemHandedOver`; leave happy or walk out under a grey cloud on `guestLeftUnhappy`. Departing guests are visual copies that walk to the door, so nobody vanishes, while the simulation has already removed them.

**Questions:** the bubble pops in on `guestAsked`; a guest with a digital-presence question holds up a phone; the bubble shakes when patience is nearly gone; a green tick and "2.5 s" float up on `questionAnswered`. The washroom question has no phone, since it isn't about the café online.

**Byte:** hovers and breathes, blinks, and shows happy, thinking, worried, alert, speaking and celebrating expressions driven by its reactions from M2.5. It stays worried while a guest is about to leave.

**Delivery:** the selected ticket and guest highlight; the item lifts when picked up; a dragged item follows the pointer with a shadow; guests who can take it light up; a refused press or wrong drop shakes the target's outline red and returns the item; a correct one shows the hand-off, the guest's smile, coins rising and fading, and a PAID stamp on the ticket.

**HUD:** smoothly filling patience bars, a small bump when the coins, happy or Questions counters rise and a shake when a guest is lost, and a labelled NOW tag on whichever station the owner is working at.

### TapIt visual kit (`src/view/tapit.js`, `tapit-preview.html`)

Orange (`#FF7600`) counter stand with NFC mark and QR panel, a phone approaching it, the contactless pulse, and the café's branded mobile page with Menu, Wi-Fi, Instagram, Website and Review links. **None of it appears in the game.** No guest uses a stand and nothing affects scoring. The kit can be viewed at `/tapit-preview.html` and waits for the TapIt milestone.

## How animation stays in step with the rules

1. **State picks the pose.** Each frame, every figure's clip is a pure function of the simulation state (`src/view/clips.js`).
2. **Progress comes from the simulation.** Brewing, washing, wiping, answering and walking all read the simulation's own timers; nothing has its own countdown that could drift.
3. **Effects follow events, one for one.** A completion flourish plays only on its completion event; a test checks this over whole shifts.
4. **The view never leads.** Short settles (under 0.3 s) and exit walks (under 2.4 s) are visual only and never delay a rule.
5. **Pause freezes everything,** including departing guests and effects.
6. **Reduced motion:** idle bobbing, shakes and the walk bounce are turned off; state changes still show.

## Checks

| Check | Result |
|---|---|
| Automated tests | 126 of 126 (111 from M2.5, 15 new animation tests) |
| Typecheck | Passed |
| Legacy prototype | Unchanged |
| Balance gates B1–B4 | Unchanged numbers |
| Browser check at 1280×800 (mouse and keyboard), 360×640 and 640×360 (touch) | Passed, three runs in a row |
| Browser check with reduced motion | Played a full shift |
| TapIt preview page | Loads with no errors |

The 15 new tests cover: the machine showing exactly the simulation's brew state and progress; every owner clip matching the action and phase; completion effects only after completion events over whole shifts; cancelled brews and wipes showing no completion; the dish being washed held by the owner rather than counted in the sink; pause freezing everything; departing guests walking out from where they stood; the owner following the simulation's path; impatience appearing as patience falls; the animator never changing the simulation and animating identically on replay; and Byte's face following its lines.

## Performance

Measured in headless Chrome on the build server, not on a phone.

| Situation | Draw time per frame |
|---|---|
| 1280×800 | 0.8–1.0 ms mean, 1.7–1.9 ms 95th percentile |
| 360×640 | 0.8–1.0 ms mean, 1.2–2.1 ms 95th percentile |
| 640×360 | 0.7–0.8 ms mean, 1.1–1.4 ms 95th percentile |
| 360×640 with the CPU slowed 4× | 1.8–2.0 ms mean, 4.1–4.3 ms 95th percentile; frames still every 16.7 ms |

## Known limitations

1. **Not tested on a physical phone,** or in Safari or Firefox. Touch drag, text size and performance on a real device are unverified.
2. **Procedural art, not hand-drawn sprites.** Everything is drawn with canvas shapes. This keeps poses tied to the simulation and costs nothing to load, but the ceiling is lower than illustrated sprite sheets. Swapping in sprites later would replace drawing functions, not the animation logic.
3. **Brief overlaps.** When a guest leaves and the next one steps up from the door, the two figures briefly overlap at the counter.
4. **The phone portrait layout has unused space** below Byte's caption; the scene is limited by screen width.
5. **The M2.5 questions from playtesting still stand:** press count, difficulty without pre-brewing, and whether a ticket's item should be bound to that ticket.
