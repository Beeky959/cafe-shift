# M2_5_EXPERIMENT.md — order service by hand

A focused experiment on branch `m2.5-order-service-experiment`, made in answer to the M2 playtest. It is meant to be played and judged, not merged as is.

**Playtest feedback it answers:** controls need improvement; questions are not noticeable; Byte is not useful; above all, *"it feels like randomly clicking objects and watching tasks complete automatically."*

## 1. What changed for the player

### Serving an order (the primary experiment)

| Step | M2 | M2.5 |
|---|---|---|
| 1. Order appears | A bubble over the guest | A **numbered ticket** on a rail under the scene, and the same number on the guest's bubble |
| 2. Choose and start | Press the machine; any latte would do | **Pick the ticket** (press the guest or the card), **then the right station**. The wrong station is refused with a reason; a station with no ticket picked does nothing |
| 3. Wait | The machine brews | Unchanged: it brews unattended while you do other work. The cup on the machine carries the ticket's number |
| 4. Deliver | Press the guest; the hand-over happens | **Carry it over:** drag the item from the station to the guest, or press the station to pick it up and then press the guest. Valid guests light up green; a wrong guest is refused and the item stays in hand. `Esc` puts it back |
| 5. Result | Coins change | The guest smiles, **+coins** rises over them, the ticket is **stamped "Paid +8"**, and the coin counter pulses |

Presses for a latte: M2 needed 2 (machine, guest). M2.5 needs 4 by pressing (guest, machine, machine, guest), or 3 with a drag.

### Digital-presence questions

- **Looks different from an order.** A blue speech bubble with a phone, a question mark and the topic's picture (Wi-Fi, menu, Instagram, review star, website), against the cream ticket of an order. On the rail it is a blue, rounded card titled "Wi-Fi?", "Menu?" and so on.
- **Shows what they need.** The card's spoken label and Byte quote the question: *"What is the Wi-Fi password?"*
- **Shows why it interrupts.** The card says **"Needs 2.5 s"**. A dashed blue ring marks the counter spot they are holding. When someone is waiting at the door, the card and Byte say so. While you answer, your work bar turns blue and a phone appears beside you. A new **Questions** counter in the HUD totals the seconds you have spent answering, and the results screen repeats it.

### Byte

The tutorial script is gone. Byte now reacts to what is true in the simulation, and every line names the ticket, item or number it is about. Byte's eyes and antenna, and the caption's colour, follow the mood.

| Reacts to | Example |
|---|---|
| Urgency | "Ticket 4 is nearly out of patience and nothing is being made for them." |
| | "Ticket 2's latte is ready and they are about to leave. Carry it over!" |
| Shortage | "No clean dishes, and 3 in the sink. Nothing can be served until you wash." |
| | "A finished latte is sitting on the machine. Deliver it so the next one can brew." |
| Success | "Tip from ticket 5: quick service and a clean table." |
| Digital interruption | "Not an order, a question: "Can I see the menu online?" Answering takes 2.5 s away from the counter." |
| | "Question 3: "Where can I leave a review?" You have spent 5 s on questions so far." |
| Idle with work waiting (3 s) | "Ticket 6 wants a croissant. Pick the ticket, then the pastry case." |

Rules: urgent reactions (a guest about to leave or lost, a question) show at once and are never hidden behind a refusal message; the rest wait at least 2.5 s after the previous line; each reaction has its own cooldown, and one-off reactions are said once.

## 2. Simulation contracts

**No simulation contract was changed.** `src/sim/` is byte-identical to M1 and M2; the four balance gates give the same numbers; the pinned M1 replay test still passes.

The new interaction lives entirely in the interface (`src/ui/service.js`). Every gesture ends in one of the commands the simulation already had:

| Player gesture | Command sent |
|---|---|
| Pick a ticket | none |
| Press the right station with a ticket picked | `tap` machine / case (start-brew / plate) |
| Pick up, carry, put back | none |
| Deliver to a guest | `tap` spot (hand-over) |
| Answer a question | `tap` spot (answer) |

So the owner's time is accounted exactly as before (start-brew 0.6 s, hand-over 0.4 s, travel 0.3 s), and every session still replays exactly from its command log. Carrying an item costs the owner no simulated time: the hand-over action already includes it.

### Places where the interface is stricter than the simulation

These are deliberate for the experiment. Making any of them a rule would be a contract change and is **not** done here.

1. **Ticket tags are cosmetic.** The latte on the machine shows the ticket it was started for, but the simulation still lets any latte go to any latte guest, and the interface allows it too. If the playtest wants an item bound to its ticket, the simulation needs an item-to-guest link: a new field on the machine slot and the pass, a new rejection reason, and a new invariant.
2. **A station needs a ticket picked.** The simulation would brew a latte for nobody; the interface refuses. Pre-brewing is therefore no longer possible. The scripted players in the balance gates do pre-brew, so **B3 and B4 overstate what a person can now do** (see §4).
3. **Delivery needs the item carried first.** A press on a waiting guest now selects their ticket instead of handing over a ready item.

## 3. Checks

| Check | Result |
|---|---|
| Automated tests | 111 of 111 (98 from M2, 13 new) |
| Typecheck | Passed |
| Legacy prototype | Unchanged |
| Balance gates B1–B4 | Unchanged numbers |
| Browser check, 1280×800, mouse and keyboard | Passed, six runs in a row |
| Browser check, 360×640, touch | Passed, six runs in a row |
| Browser check, 640×360, touch | Passed, six runs in a row |

The browser check now serves orders by hand with real input at each size: a real **mouse drag** and a real **finger drag** from the station to the guest; on desktop the keyboard path (number keys, Enter on a focused station, Esc to put back); on touch the tap path (card, station, station, guest). It also checks that a station refuses with no ticket picked, that a question card says it is a question, that the Questions counter reaches 3 s after one answer, that 100 presses are all handled, that every rail card is at least 44 px, and that each session replays exactly in Node.

New automated tests: the full five-step flow; wrong station and wrong guest refusals; drag release on the right guest, the wrong guest, an empty spot and open floor; spare items after a guest leaves; questions on the rail; the interface never changing the simulation; and Byte's reactions to each of the four kinds of situation, with their exact wording and pacing.

## 4. What still needs a person to judge

1. **Does it still feel like random clicking?** This is the question the experiment exists for. The only real test is playing it.
2. **Too many presses?** Four presses (or three with a drag) per order instead of two. That may feel deliberate and satisfying, or fiddly at the pace of the shift.
3. **Is the shift now too hard?** The balance gates measure the simulation with scripted players who can pre-brew. A person can no longer pre-brew, and needs more presses. One data point: a simple scripted player using only the new presses, acting every half second, served 13 of 14 and earned 108 coins, against 144 for the M1 prioritising player. That is close to the naive M1 player, so **expect it to feel harder than M2.** If it does, the fix is to retune `src/sim/config.js` (longer patience or fewer guests), not to add mechanics.
4. **Drag on a real phone.** Dragging was tested with synthetic touch input in headless Chrome. Feel, accuracy and accidental scrolling need a real device.
5. **Are questions now unmistakable?** And does the Questions counter make the cost feel real, or is it just another number?
6. **Is Byte useful now, or just busier?** Over a full shift Byte says about 20 lines (18 in a scripted run). Whether those help or nag is a judgement call.
7. **Should the ticket tag be a rule?** See §2.1. Decide from play whether giving ticket 1's latte to ticket 2 should be allowed.

Not changed, on purpose: cleaning and dishwashing still work by a single press. They will follow the coffee pattern only if this experiment works.
