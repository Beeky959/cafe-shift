# GAME_DESIGN.md — Byte Builds: Café Shift

All numbers are starting values to be tuned with scripted players before any human plays (see BUILD_PLAN.md). All coins, moods and customer behaviour are fictional.

## 1. Design position, and where I disagree with the brief

| Brief assumption | Position | Reason |
|---|---|---|
| Five task types make the café "lively" | **Changed.** Tasks must feed each other | Five independent one-tap tasks are a checklist. The audit shows this is the prototype's core problem |
| Information requests "interrupt normal operations" | **Kept, but they must cost the owner time and a counter spot** | In the prototype they cost two taps and pay coins, so nothing is interrupted |
| TapIt is "discovered and installed" | **Kept, with three corrections** | Hidden until the shop; no free loan; it competes with another upgrade |
| "Animated robot companion and guide" | **Scoped down.** Byte reacts and points; he does not do tasks or narrate | A helper who plays for you removes the game; a narrator becomes noise |
| Purchasing upgrades, plural | **Three upgrades total** | Enough for two real choices in a five-minute game |
| "Levels" | **Three shifts, one café, about five minutes** | Short and polished, as the brief prefers |
| Art beyond the prototype | **Not for the first release.** Keep procedural shapes, animate with code | No asset plan before quality is proven |
| Website questions | **Added** as a fifth topic | The brief lists it; the prototype has only four |

## 2. The core mechanic: one owner, one pair of hands

The player controls the café owner. The owner does **one thing at a time**, and every task takes time. The scarce resource is the owner's seconds, and the game is deciding what to spend them on.

- **Input:** tap the thing. A tap is context-sensitive and queues one action. Up to two further taps wait in a visible queue. Tapping a queued action's chip removes it; tapping the current action's chip cancels it (rules in §3a).
- There is no request list and no station panel. Everything is in the scene.

### The chain that links the tasks

```
serve a drink → uses a clean dish → guest sits at a clean table → guest leaves a tip
      ↑                                     ↓
 clean dishes ← wash ← dirty dish returns   table is now dirty → wipe → table usable
```

- **Dishes are a hard limit.** No clean dish, no service.
- **Tables are a soft limit.** No clean table: the guest drinks standing, leaves sooner and leaves no tip.
- **The machine runs unattended.** Starting a brew takes a moment; the brew itself does not need the owner. This is the main skill: start something, then use the wait.

## 3. Customer journey

| State | What happens | Leaves this state when |
|---|---|---|
| Arriving | Walks in from the door | Reaches a free counter spot (3 spots). If all are taken, waits at the door (max 2); beyond that, walks past |
| Waiting | Order bubble: latte, or croissant. Patience drains | Receives the order, or patience runs out |
| Asking (some guests) | After being served, stays in the spot with a "?" and a topic icon. Patience drains | Owner answers, or patience runs out |
| At the stand (stand installed, some guests) | Gives up the counter spot at once, walks to the stand, waits if it is busy, taps | The tap finishes |
| Seated | Walks to a clean table, consumes | Timer ends |
| Standing | No clean table; consumes at the side | Shorter timer ends |
| Leaving happy | Drops the dish at the return shelf, leaves a tip if seated | Off screen |
| Leaving unhappy | Patience ran out. Frown, mood penalty | Off screen |

Every question is asked at the counter, straight after the guest is served. There are no questions on the way out. *(Corrected after review: exit questions needed a second claim on a counter spot and had no defined behaviour when the counter was full.)*

A guest who is asking occupies a counter spot. The next guest cannot order until that spot frees. That is the interruption, and it is visible.

## 3a. Ownership and release rules

Every dish, guest, counter spot and table has exactly one holder at any tick. *(Added after review.)*

**Dishes**

*(Corrected in the final M0 fixes: a reserved holder and the complete transition list.)*

| Holder | Meaning | Mirrored by |
|---|---|---|
| Rack | Clean and available | Nothing |
| Reserved | Taken from the rack and in the owner's hands for the current start-brew or plate action | That action's reserved dish |
| Machine slot | Under a brewing or ready latte | The slot's dish |
| Pastry pass, holds one | Under a plated croissant | The pass's dish |
| Guest | With a guest who has been served | The guest's dish |
| Sink | Dirty | Nothing |

These are the only permitted moves:

| # | From → to | When |
|---|---|---|
| D1 | Rack → reserved | A start-brew or plate action starts |
| D2 | Reserved → machine slot | Start-brew completes |
| D3 | Reserved → pass | Plating completes |
| D4 | Reserved → rack | That action is cancelled, or the shift ends during it |
| D5 | Machine slot → guest | Hand-over of that latte completes |
| D6 | Pass → guest | Hand-over of that croissant completes |
| D7 | Guest → sink | The guest leaves for any reason: finished, out of patience while asking, or settled at shift end |
| D8 | Sink → rack | The wash of that dish completes |
| D9 | Machine slot or pass → rack | Shift end only: unserved items are discarded |

- **Holding and claiming are different.** A hand-over claims a ready item and a wash claims a dirty dish, but the dish stays with the machine, pass or sink until the action completes. Cancelling such an action moves nothing.
- A prepared item whose guest has gone stays where it is and goes to the next guest with the same order. Nothing spoils in the first release.
- Rack + reserved + machine + pass + guests + sink always equals the total.

**Counter spots and the door**

- A spot is claimed on the tick the guest arrives and is held through walking in, waiting and asking.
- It is released on the tick the guest is handed their order with no question for the owner, finishes being answered, or runs out of patience.
- The door queue is first in, first out, and holds two. Patience runs from arrival, including at the door. When a spot is released, the guest at the head of the door queue claims it on the same tick.
- A guest who arrives with the counter and the door both full walks past. That is counted as a lost sale and nothing else.

**Tables and the stand**

- A table is claimed when the guest leaves the counter or the stand: the lowest-numbered clean, unclaimed table. If there is none, the guest stands.
- A table becomes dirty on the tick its guest finishes. A wipe in progress claims it for the owner; cancelling returns it to dirty.
- The stand serves one guest at a time; others wait in arrival order. Waiting at the stand holds no counter spot and drains no patience.

**Guests being attended**

- A guest's patience is frozen while the owner's current action targets them, from the start of travel to completion or cancellation. A guest cannot walk out while being served.

**Owner actions**

| Action | Checked and reserved when it starts | Committed when it completes | If cancelled |
|---|---|---|---|
| Start brew | Claims an empty machine slot; reserves one clean dish (D1) | Slot is brewing with that dish (D2) | Dish back to the rack (D4); slot released |
| Plate croissant | Claims the empty pass; reserves one clean dish (D1) | Pass holds the croissant (D3) | Dish back to the rack (D4); pass released |
| Hand over | Claims the guest and the matching ready item | Dish to guest (D5 or D6); payment; guest moves on | Claims released; nothing moves; patience resumes |
| Answer | The asking guest | Guest moves on | Progress lost; patience resumes |
| Wipe | The dirty table | Table clean | Table dirty; progress lost |
| Wash | Claims one dirty dish at a time | That dish to the rack (D8); the next begins | Current dish stays in the sink; finished dishes stay clean |

- Queued actions reserve nothing. Each is checked when it starts; if it is no longer valid it is dropped and reported.
- A brew that has started on the machine cannot be cancelled.

**Abandonment**

- A waiting guest who runs out of patience holds no dish. Their spot is released on that tick. Anything already prepared for them stays for the next matching order.
- An asking guest who runs out of patience leaves with nothing owed: their dish goes to the sink (D7) and their spot is released.
- An attended guest cannot run out of patience, so the target of the owner's current action never disappears under it.
- A queued action whose target has gone is dropped when it would have started.

**End of shift**

- Doors close at the shift length: no more arrivals. Play continues until no guest is waiting, asking or at the stand, so every guest gets an outcome. *(Corrected: in the prototype, late guests could never be lost.)*
- The shift then ends in this order, on one tick:
  1. The owner's current action is cancelled (D4 for a reserved dish; every claim released) and the queue is cleared.
  2. Unserved items on the machine and the pass are discarded and their dishes return to the rack (D9).
  3. Guests still walking to a table, seated or standing are settled as happy: tips paid, dishes to the sink (D7), tables left dirty.
- Afterwards there are no guests, no actions and no claims, and every dish is in the rack or the sink. Only the wallet and upgrades carry to the next shift.

## 4. Owner actions and starting numbers

| Action | Trigger | Owner time | Notes |
|---|---|---|---|
| Start brew | Tap machine | 0.6 s | Machine then brews 3.0 s unattended. One brew at a time. A finished latte waits on the machine and blocks it |
| Plate croissant | Tap pastry case | 0.8 s | Uses a clean dish |
| Hand over | Tap waiting guest | 0.4 s | Needs the matching item ready. Payment happens here |
| Answer question | Tap asking guest | 2.5 s | No coins. Cannot be shortened |
| Wipe table | Tap dirty table | 1.8 s | Cancelling loses progress |
| Wash dishes | Tap sink | 1.0 s per dish | Continues until empty; cancelling keeps finished dishes |

| Quantity | Start value |
|---|---|
| Clean dishes | 5 |
| Tables | 3 |
| Patience at the counter | 22 s |
| Patience while asking | 14 s |
| Seated time | 8–12 s |
| Standing time | 4 s |
| Latte / croissant | 8 / 6 coins |
| Tip when seated and served with over half patience left | 3 coins |
| Guests with a question, from Shift 2 | about 1 in 2, as an exact count fixed in the schedule |
| Owner travel between stations | 0.3 s |
| Guest walk in / to a table / to the stand | 1.0 / 0.8 / 0.6 s |
| Stand tap | 1.5 s |

## 5. Prioritisation: what makes it a game

Typical moment in Shift 2: a latte is ready on the machine, one clean dish is left, a guest is asking about Wi-Fi in spot 2, a table is dirty, and two guests are waiting. Every option costs something different:

- Hand over the latte: frees the machine, earns now.
- Answer the question: earns nothing, but frees a spot before patience runs out.
- Wash: nothing now, but service stops entirely in two orders if skipped.
- Wipe: protects the next tip.

The design is working when a player who handles the most urgent thing and uses brew time well clearly beats a player who handles things in arrival order. BUILD_PLAN.md turns that into a numeric gate.

## 6. Shifts, earnings, upgrades, difficulty

| Shift | Length | Introduces | Then |
|---|---|---|---|
| 1 "Soft open" | 60 s | Brew, serve, tables, dishes. No questions | Shop A |
| 2 "Word gets out" | 75 s | More guests. Questions begin | Shop B |
| 3 "The rush" | 75 s | **Same guests and same questions as Shift 2**, plus about 15% more orders | Results |

- **Shop A** offers Second brew head (two brews at once) and Bigger dish rack (+3 dishes). Shift 1 earnings afford one.
- **Shop B** offers the TapIt stand and whichever Shop A upgrade was not bought. Shift 2 earnings afford one.
- Skipping TapIt is a legitimate, viable run. There is no loan and no free stand.
- Arrivals are scripted per shift from a fixed seed, so runs are reproducible and testable.
- **No fail state.** Each shift ends with 1–3 stars from the shift score.
- **Three separate money figures.** *(Corrected after review: the first draft used one figure for both spending and score, which penalised buying anything.)*

  | Figure | Definition | Changes when |
  |---|---|---|
  | Gross earnings | All coins received: sales plus tips | A guest pays or tips. Never decreases |
  | Wallet | Starting wallet + gross earnings − coins spent in shops | A guest pays or tips; a purchase is made |
  | Score | Per shift: gross earnings + a mood bonus of up to 30 coins scaled by guest mood. Run score is the sum | Only at the end of a shift |

  Spending never lowers the score. The purchase decision is real because the wallet covers one item per shop.
- **The like-for-like stand comparison** (same guests, stand off and on) exists only in automated tests and the M5 slice, through a test-only preset. In the campaign the stand cannot exist before Shift 3.
- **Guest mood**, never "rating" or "reviews", so the game does not imply TapIt changes review scores.

## 7. Byte

Byte floats in the café and has a one-line caption strip. Rules:

1. **Teach once.** One line the first time each mechanic appears. Never again in that run.
2. **Point, don't tell.** When something is neglected past a threshold (for example no clean dishes for 4 s), Byte drifts toward it and looks at it. Text only if it is still ignored 4 s later.
3. **Rate limit.** At most one text hint every 12 s, and the same hint at most twice per shift.
4. **Never narrate routine actions.** The prototype's "Pulling espresso…" goes.
5. **Never block.** After the first 10 seconds of Shift 1, Byte never pauses play.
6. **React silently.** Expressions carry most of his feedback (see TECH_BLUEPRINT.md).
7. Byte does not perform café tasks.

## 8. TapIt experience

### Discovery
The stand is absent from the scene, the HUD and all text until the end of Shift 2. The Shift 2 summary shows the player's own figure: "You spent 23 s answering questions about Wi-Fi, the menu, Instagram, reviews and your website." Byte then says one line, and the stand appears in Shop B beside an operational upgrade. The player has just lived the problem; the stand is the answer to it, offered as an option.

### In the café
- Buying it plays a short placement: the owner sets the stand at the end of the counter, outside the three service spots.
- A guest with a supported question walks to the stand, takes out a phone and taps it. The phone shows a small branded page with five link icons; the one they wanted highlights; a tick appears; they carry on to a table or the door.
- This costs no owner time and no counter spot.
- **About 3 in 4** guests with a question use the stand. The rest still ask the owner.
- **One question type is never handled by the stand:** "Where's the washroom?" It keeps the stand's scope honest.
- Tapping the stand as the player shows a short description. It never resolves a request.
- The stand earns no coins and creates no mood by itself.

### What the player gets
Owner seconds and counter spots. Those are the two primary measures of the stand, in tests and on screen *(corrected after review; coins are no longer a primary measure)*:

1. **Owner time answering questions**, in seconds.
2. **Counter-spot time held by asking guests**, in seconds.

Guests who walked past a full counter and gross earnings are shown as context only and are never attributed to the stand. In the campaign the results screen shows the two primary figures for Shift 2 and Shift 3 per question guest, labelled as different shifts. If the player skipped the stand, the same figures are shown without comment.

### What the game must never show
- Orders or payments through the stand.
- Review scores, follower counts or sales rising because of the stand.
- Every guest using it.
- A real-world claim drawn from a game number. The prototype's footer wording and "simulated scenario" phrasing are kept.

## 9. Art direction

The prototype's flat, outlined, procedural shapes are within reach and already look coherent. For the first release: same style, same palette, animated by code (movement, squash and stretch, simple swaps of eyes and mouths). No sprite sheets, no generated art, no new characters. Request icons are drawn shapes, not emoji, so they look the same on every device.

## 10. Explicitly out of scope for the first release

Multiple cafés, staff hiring, menu expansion, recipes with several steps, day/night, save games, leaderboards, accounts, analytics, purchasable cosmetics, any AI-generated dialogue.
