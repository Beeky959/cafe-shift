// @ts-check
/**
 * Type definitions for the simulation. This module has no runtime content.
 * Import types with: `@import { SimState } from './types.js'`
 */

/** @typedef {'latte' | 'croissant'} OrderItem */

/** @typedef {'wifi' | 'menu' | 'instagram' | 'review' | 'website'} SupportedTopic */

/** @typedef {SupportedTopic | 'washroom'} QuestionTopic */

/** @typedef {'none' | 'test-stand'} PresetId */

/**
 * A question a guest will ask after being served.
 * @typedef {object} GuestQuestion
 * @property {QuestionTopic} topic
 * @property {boolean} supported True when a stand could answer it.
 */

/**
 * One scheduled guest. Fixed before the shift starts and never mutated.
 * @typedef {object} GuestSpec
 * @property {number} id Ascending in arrival order, starting at 1.
 * @property {number} arrivalTick
 * @property {OrderItem} order
 * @property {GuestQuestion | null} question
 * @property {boolean} usesStandIfPresent Fixed by the seed, whether or not a stand exists.
 * @property {number} seatTicks How long the guest stays once seated.
 * @property {number} look Appearance index for the view. No rule depends on it.
 */

/**
 * Where a dish is. Exactly one holder at any tick. `reserved` means the dish
 * has left the rack and is in the owner's hands for the action named, which
 * must be the owner's current start-brew or plate action.
 * @typedef {{ kind: 'rack' }
 *   | { kind: 'reserved', actionId: number }
 *   | { kind: 'machine', slot: number }
 *   | { kind: 'pass' }
 *   | { kind: 'guest', guestId: number }
 *   | { kind: 'sink' }} DishHolder
 */

/**
 * @typedef {object} Dish
 * @property {number} id
 * @property {DishHolder} holder
 */

/**
 * @typedef {object} MachineSlot
 * @property {'empty' | 'brewing' | 'ready'} state
 * @property {number | null} dishId Reverse reference of a dish held by this slot.
 * @property {number} ticksLeft
 * @property {number | null} claimedBy Id of the hand-over action taking this latte.
 */

/**
 * @typedef {object} Pass
 * @property {number | null} dishId Reverse reference of the plated croissant's dish.
 * @property {number | null} claimedBy Id of the hand-over action taking this croissant.
 */

/**
 * @typedef {object} Table
 * @property {number} id
 * @property {'clean' | 'occupied' | 'dirty' | 'wiping'} state
 * @property {number | null} guestId Reverse reference of a guest walking to or seated at this table.
 * @property {number | null} claimedBy Id of the wipe action working on this table.
 */

/**
 * Where a live guest is. Exactly one place at any tick, mirrored by the
 * container that lists the guest (counter spot, door queue, stand, table).
 * @typedef {{ kind: 'spot', index: number }
 *   | { kind: 'door' }
 *   | { kind: 'stand' }
 *   | { kind: 'table', tableId: number }
 *   | { kind: 'standing' }} GuestPlace
 */

/**
 * @typedef {'walkingIn' | 'waiting' | 'asking' | 'walkingToStand' | 'atStand'
 *   | 'walkingToTable' | 'seated' | 'standing'} GuestState
 */

/**
 * A guest who is in the café. Guests who have left are removed.
 * @typedef {object} LiveGuest
 * @property {number} id Matches a GuestSpec id.
 * @property {GuestState} state
 * @property {GuestPlace} place
 * @property {number | null} dishId Reverse reference of the dish this guest holds.
 * @property {number | null} attendedBy Id of the owner action targeting this guest. Patience is frozen while set.
 * @property {number} patienceLeft
 * @property {number} timerLeft Ticks left in a timed state (walking, consuming, stand use).
 * @property {boolean} tipEligible Set at hand-over: served with more than half their patience left.
 */

/** @typedef {'brewStart' | 'plate' | 'handOver' | 'answer' | 'wipe' | 'wash'} OwnerActionKind */

/**
 * What the current action has claimed without holding it. Each claim is
 * mirrored on its target (`attendedBy` or `claimedBy`).
 * @typedef {object} ActionClaims
 * @property {number | null} guestId Hand-over or answer.
 * @property {number | null} slot Start-brew (an empty slot) or hand-over (a ready latte).
 * @property {boolean} pass Plate (the empty pass) or hand-over (a ready croissant).
 * @property {number | null} tableId Wipe.
 * @property {number | null} sinkDishId Wash: the dirty dish being washed. It stays in the sink until done.
 */

/**
 * The owner's current action.
 * @typedef {object} OwnerAction
 * @property {number} id
 * @property {OwnerActionKind} kind
 * @property {'travelling' | 'working'} phase
 * @property {number} ticksLeft
 * @property {string} zone Station the action takes place at.
 * @property {number | null} reservedDishId Dish taken from the rack by a start-brew or plate action.
 * @property {ActionClaims} claims
 */

/**
 * A queued action. It reserves and claims nothing until it starts.
 * @typedef {object} QueuedAction
 * @property {number} id
 * @property {OwnerActionKind} kind
 * @property {number | null} guestId
 * @property {number | null} tableId
 */

/**
 * @typedef {object} Stand
 * @property {boolean} installed
 * @property {number | null} userId
 * @property {number[]} queue Guest ids waiting for the stand, in arrival order.
 */

/**
 * @typedef {object} Owner
 * @property {string} zone Station the owner is at.
 * @property {OwnerAction | null} action
 * @property {QueuedAction[]} queue
 * @property {number} nextActionId
 */

/**
 * Three separate money figures. Spending never lowers the score.
 * @typedef {object} Economy
 * @property {number} startingWallet
 * @property {number} grossEarnings All coins received. Never decreases.
 * @property {number} spent Coins spent in shops.
 * @property {number} wallet startingWallet + grossEarnings - spent.
 * @property {number} score Set only at the end of a shift.
 */

/**
 * @typedef {object} Metrics
 * @property {{ brewStart: number, plate: number, handOver: number, answer: number, wipe: number, wash: number, travel: number, idle: number }} ownerTicks
 * @property {{ waiting: number, asking: number }} spotTicks
 * @property {number} allSpotsFullTicks
 * @property {{ served: number, leftHappy: number, leftUnhappy: number, walkedPast: number }} guests
 * @property {number} tips Number of tips received.
 */

/**
 * Every duration the rules use, in whole ticks.
 * @typedef {object} Timing
 * @property {number} travel
 * @property {number} brewStart
 * @property {number} brew
 * @property {number} plate
 * @property {number} handOver
 * @property {number} answer
 * @property {number} wipe
 * @property {number} washPerDish
 * @property {number} walkIn
 * @property {number} walkToTable
 * @property {number} walkToStand
 * @property {number} standUse
 * @property {number} counterPatience
 * @property {number} askingPatience
 * @property {number} standingConsume
 * @property {number} shiftLength
 */

/**
 * The whole simulation state: plain JSON-serialisable data, no functions,
 * no DOM, no clock.
 * @typedef {object} SimState
 * @property {number} version
 * @property {number} seed
 * @property {string} shiftId
 * @property {PresetId} preset
 * @property {number} tick
 * @property {'ready' | 'open' | 'closing' | 'ended'} phase
 * @property {number} nextEventSeq
 * @property {Timing} timing
 * @property {GuestSpec[]} schedule
 * @property {number} nextArrivalIndex
 * @property {LiveGuest[]} guests Guests in the café. Empty at tick 0.
 * @property {number[]} doorQueue
 * @property {(number | null)[]} spots Guest id per counter spot.
 * @property {Table[]} tables
 * @property {Dish[]} dishes
 * @property {{ slots: MachineSlot[] }} machine
 * @property {Pass} pass
 * @property {Stand} stand
 * @property {Owner} owner
 * @property {Economy} economy
 * @property {Metrics} metrics
 */

/**
 * Something the player can tap. Guests are targeted through the counter spot
 * they occupy, never directly.
 * @typedef {{ kind: 'machine' }
 *   | { kind: 'case' }
 *   | { kind: 'sink' }
 *   | { kind: 'spot', index: number }
 *   | { kind: 'table', tableId: number }} Target
 */

/**
 * Player input for one tick.
 * @typedef {{ type: 'tap', target: Target }
 *   | { type: 'cancel' }
 *   | { type: 'unqueue', actionId: number }} Command
 */

/**
 * A fact reported by the step function. `tick` and `seq` order events totally.
 * @typedef {{ tick: number, seq: number, type: string, [detail: string]: string | number | boolean | null }} SimEvent
 */

export {};
