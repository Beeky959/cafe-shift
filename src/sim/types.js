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
 * Where a dish is. Exactly one holder at any tick.
 * @typedef {{ kind: 'rack' }
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
 * @property {number | null} dishId
 * @property {number} ticksLeft
 */

/**
 * @typedef {object} Table
 * @property {number} id
 * @property {'clean' | 'occupied' | 'dirty' | 'wiping'} state
 * @property {number | null} guestId
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
 * @property {null} action Current action. Always null in M0; defined in M1.
 * @property {never[]} queue Queued actions. Always empty in M0; defined in M1.
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
 * @property {never[]} guests Live guests. Always empty at tick 0; defined in M1.
 * @property {number[]} doorQueue
 * @property {(number | null)[]} spots Guest id per counter spot.
 * @property {Table[]} tables
 * @property {Dish[]} dishes
 * @property {{ slots: MachineSlot[] }} machine
 * @property {{ dishId: number | null }} pass
 * @property {Stand} stand
 * @property {Owner} owner
 * @property {Economy} economy
 * @property {Metrics} metrics
 */

export {};
