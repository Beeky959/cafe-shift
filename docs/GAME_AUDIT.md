# GAME_AUDIT.md — Byte Builds: Café Shift V0.2

**Audited:** `byte-cafe-shift-v2.html` (44.9 KB, 181 lines, one file, no dependencies) and the reference screenshot.
**Method:** full read of the source; the game's own script run headlessly in Node with scripted players of different speeds; the page run in headless Chrome at 360×740, 412×915 and 1440×900.
**Not done:** no test on a physical phone, no test in Safari or Firefox, no human playtest.

Evidence tags: **[code]** read in the source (line numbers given) · **[run]** measured by running it · **[inferred]** reasoned, not yet verified.

## Verdict

The prototype is a clean, honest, dependency-free proof of concept with a pleasant look. It is not yet a management game: there is nothing to manage, because every request is resolved by one or two taps and a player who acts once every three seconds loses nobody. Its architecture is fine for a 135-line script and unsuitable to grow, because simulation, drawing, UI and audio call each other directly.

## 1. Worth preserving

| What | Where | Why keep it |
|---|---|---|
| Procedural canvas art: café, Byte, customers, plants, stand | L105–162 | No asset pipeline, consistent style, already reads well on desktop |
| Zero dependencies, no network, no storage | whole file | Meets the no-backend, no-cost constraints as is |
| Auto-pause on tab hide, Escape to pause, frame-time clamp | L168, L173–176 | Correct, and commonly forgotten |
| Scripted arrival schedule | L47–51 | Deterministic, so it can be tested and balanced |
| Honest copy: fictional prices, "does not promise more reviews", "not every guest will" | L41, L71, L73, L78 | Already meets the no-unsupported-claims constraint |
| Not every guest uses the stand (3 in 4) | L75 | Believable, and avoids overclaiming |
| Event-delegated input, focus rings, HTML escaping | L61, L172 | Sound basics |
| Oscillator sound effects, off by default | L57 | No audio files needed |

## 2. Game-loop weaknesses

1. **No difficulty. [run]** Scripted players that serve the most urgent request:

   | Player speed | Day 1 | Day 2 | Day 3 | Lost in whole run |
   |---|---|---|---|---|
   | One action every 1.5 s | 7/7 served | 11/11 | 12/12 | 0 |
   | One action every 3 s | 7/7 | 11/11 | 11/12, 1 still waiting | 0 |
   | One action every 5 s | 5/7 | 7/11 | 7/12 | 1 |
   | Never touches the game | 0/7 | 0/11 | 5/12 via stand | 16 |

   The queue never exceeded 3 for the first two players.
2. **Late customers cannot be lost. [code + run]** Patience is 23–25 s and shifts are 43–49 s, and `endDay` clears the queue without penalty (L67). On Day 1, three of seven customers arrive too late to ever leave unhappy.
3. **No prioritisation. [code]** The only contention is one preparation at a time (L82). Cleaning is one tap and pays 9 coins; a latte is two taps plus 1.7 s and pays 16. Nothing a player does now changes what is possible later.
4. **Digital questions do not interrupt anything. [code]** They cost two taps and no time (L90–93), the same effort as serving a pastry, and they pay 5 coins. The problem TapIt is supposed to solve is not felt.
5. **Buying TapIt makes the result worse. [run]** Same player, same speed, final shift: 12 served either way, mood 100% either way, 357 coins without the stand and 272 with it. A stand-resolved request pays 1 coin instead of 5 (L78). The only gain is five fewer taps across the shift.
6. **The upgrade choice is not a choice. [run + code]** A full-service player reaches the shop with 246 coins; all three upgrades cost 142. A player with under 65 coins is offered the stand free (L71). Coins have no use after the shop, and `score` is accumulated but never shown (L77).
7. **The stand's headline statistic can be inflated. [code + run]** With the stand installed, the player can tap it to resolve any selected digital request, and that counts as a visitor self-serving (L85). In the idle run, a player who served nobody and accepted the free stand was told "Your TapIt stand helped 5 visitors".
8. **The before/after comparison is not like-for-like. [code]** Day 2 self-serve is always 0 because the stand cannot exist yet, and Day 3 has an extra request (L49–50, L73).
9. **Mood has no consequence. [code]** It floors at 5 and only changes the end headline (L73, L79).
10. **Prepared stock carries over between days. [run]** `startDay` does not reset it (L66), so a fast player starts Day 3 with 3 lattes and 3 pastries ready.

## 3. Missing task states and edge cases

- **No dishwashing, no cups, no seating. [code]** Tables are scenery; "clean the table" is a customer request, not a consequence of anyone sitting.
- **Customers have two states: waiting or gone. [code]** No arriving, ordering, receiving, consuming, leaving or reacting.
- **A preparation cannot be cancelled, and one in progress is silently discarded at shift end. [code]** L67.
- **Misleading toast. [code]** Tapping "Brew to serve" while a pastry is packing shows "Brewing coffee…" although nothing was started (L96 overwrites the refusal from L82).
- **Byte's guidance is overwritten. [code]** Every brew replaces his line with "Pulling espresso…" for 3 s (L82), which wipes the 9-second tutorial line on the first tap.
- **The orange button on a digital ticket only shows a toast. [code]** L99.
- **Sixth and later customers are invisible in the scene. [code + run]** Only five are drawn (L153); the idle run reached eight.
- **The clock cannot show a minute. [code]** It is formatted as `0:SS` (L100).
- **Currency is "$" in the HUD and "coins" everywhere else. [code]** L100.
- **TapIt is visible from the first second. [code]** The station button, the header tag, and a toast naming the shop (L15, L34, L84), although the intro says it "doesn't appear until you choose it".
- **The Wi-Fi sign reads "ask at till". [code]** Tapping it nonetheless answers the Wi-Fi question (L125).

## 4. Animation and rendering limits

- **Animation is not tied to task state. [code]** Everything that moves is a sine bob, a blinking glow, a progress bar or floating text. There is no serving, cleaning or reaction animation; the owner never moves; Byte's bubble is a constant.
- **Customers teleport. [code]** Position is the queue index (L153), so when one leaves the rest jump left.
- **The draw function changes game state. [code]** It filters `s.pulse` (L161). Floating text uses wall-clock time, so it keeps fading while paused.
- **Brew duration is defined twice. [code]** Once for the simulation (L82) and once for the progress bar, selected by comparing a title string (L157).
- **The whole static scene is redrawn every frame. [code]** That includes three radial gradients and roughly a hundred paths. No slowdown was measured **[run]**: 16.7 ms median with 4× CPU throttling in headless Chrome on a server. Phone performance and battery cost are untested.
- **Fixed 960×540 backing store, no device-pixel-ratio handling. [code]** Soft on high-density screens **[inferred]**.
- **`roundRect` is used for almost every shape. [code]** L105. Browsers older than roughly 2022–23 will throw and show a blank scene **[inferred]**.

## 5. Mobile interaction problems

Measured at 360×740 **[run]**:

1. **Taps on request buttons are frequently lost.** The ticket list is rebuilt from scratch about every 220 ms (L101, L167). If a rebuild lands between press and release, the click is dropped. Registered taps: 9 of 15 with a 60 ms press, 6 of 15 at 120 ms, 4 of 15 at 200 ms. This is the most serious defect found, and it also affects desktop.
2. **The scene and the controls are never on screen together.** The canvas ends at y=394; the station buttons start at y=931 in a 740-high viewport; the page is 1,412 px tall. On a phone the game is played in a button list and the café is decoration.
3. **The station buttons move under the thumb.** They sit below the ticket list, so they shifted 220 px when the queue grew from 3 to 5.
4. **The canvas is stretched.** Below 420 px the stage switches to 16:10 while the canvas stays 16:9 (CSS `.stage`), so the scene is drawn about 11% too tall.
5. **In-scene targets and text are too small.** The canvas is 338 px wide, a scale of 0.35. Station hit circles become 34–53 px across, customers 34 px, and 9–12 px canvas text becomes 3–4 px.
6. **The instruction pill covers the customers.** Visible in the phone screenshot.
7. **Accessibility. [code]** The ticket list is an `aria-live` region rebuilt four times a second, and keyboard focus inside it is destroyed on each rebuild.

## 6. Simplification opportunities

- Replace "select a request, then tap the matching station" with one context-sensitive tap on the thing itself. That removes the selection state, the ticket panel and the duplicate station panel.
- Delete unused state: `score`, `lost`, `shownSecond`, and the `C` palette (L55, L104).
- Put every tunable number in one table. They are currently spread across L47–54, L70, L75 and L82.
- Draw the static background once to an offscreen canvas.
- Unminify. The CSS is one 6.9 KB line and JS lines run to about 2,000 characters, which makes review and diffs impractical.

## 7. Dependencies and performance risks

- **Dependencies:** none. No fonts, images, scripts or network calls.
- **Performance:** no problem measured on desktop-class hardware. The risk is unverified phone performance once real animation is added.
- **Platform variance [inferred]:** emoji are used as game art (request bubbles, the review card), so they render differently per operating system, and `ui-rounded` falls back to different fonts.

## 8. Architecture assessment

One closure, one mutable state object, and functions that mix rules, DOM writes, toasts, speech and sound. `finishTask` (L77–78) does all five. That is proportionate for a prototype. It blocks three things the brief requires: animation that follows task state, automated testing of rules, and tuning difficulty without playing by hand. The headless runs in this audit were only possible by stubbing the entire DOM.

**Conclusion:** keep the art, the copy, the pause handling and the scheduling idea. Rebuild the rules as a separate simulation and redesign the loop. Engine choice is covered in TECH_BLUEPRINT.md; the defects above are design and structure problems, and none is caused by the lack of an engine.
