// @ts-check
/**
 * Master manifest of every sound and dialogue entry in the game.
 *
 * SOUND STATUS VALUES:
 *   'ready'       — file exists in public/audio/
 *   'pending'     — ElevenLabs generation approved but not yet run
 *   'placeholder' — synthesized via Web Audio API (no file needed)
 *   'missing'     — file not yet produced; audio skipped gracefully
 */

/**
 * @typedef {'ready' | 'pending' | 'placeholder' | 'missing'} AssetStatus
 *
 * @typedef {object} SoundEntry
 * @property {string} id
 * @property {string} [file]       Path under /public/audio/
 * @property {AssetStatus} status
 * @property {string} category
 * @property {boolean} [loop]
 * @property {number} defaultVolume  0–1
 * @property {string} [variationGroup]
 * @property {string} trigger        Human-readable when this plays
 * @property {string} [license]
 * @property {string} [duration]
 * @property {string} [elevenLabsPrompt]  Used by generate-voices.mjs
 *
 * @typedef {object} DialogueEntry
 * @property {string} id
 * @property {'customer' | 'byte' | 'owner'} speaker
 * @property {string} voiceId        ElevenLabs voice ID or 'synth'
 * @property {string} [file]         Path under /public/audio/
 * @property {AssetStatus} status
 * @property {string} text           Subtitle text
 * @property {string} intent         e.g. 'order_espresso'
 * @property {string[]} validStates  Game phases where this may play
 * @property {string} triggerEvent   Sim event that may trigger this
 * @property {number} priority       1 = highest
 * @property {number} cooldownMs     Minimum ms before same line repeats
 * @property {string[]} [requires]   Gameplay flags that must be true
 * @property {string} [followUp]     id of a response dialogue entry
 */

// ---- Voice casting ----
// Map voice role → ElevenLabs voice ID.
// Replace with real IDs from your ElevenLabs project once generated.
export const VOICE_CAST = Object.freeze({
  customerA: 'PENDING_ELEVENLABS_ID_A',  // Friendly, upbeat
  customerB: 'PENDING_ELEVENLABS_ID_B',  // Relaxed, casual
  customerC: 'PENDING_ELEVENLABS_ID_C',  // Busy, direct
  customerD: 'PENDING_ELEVENLABS_ID_D',  // Warm, conversational
  customerE: 'PENDING_ELEVENLABS_ID_E',  // Distinct returning customer
  byte:      'PENDING_ELEVENLABS_ID_BYTE',
  owner:     'PENDING_ELEVENLABS_ID_OWNER',
});

// ---- Sound Effects ----
/** @type {readonly SoundEntry[]} */
export const SOUNDS = Object.freeze([
  // Coffee
  { id: 'coffee_grind',    category: 'coffee',   status: 'placeholder', defaultVolume: 0.7, trigger: 'brewStart action',         elevenLabsPrompt: 'Close-up coffee grinder grinding beans, mechanical whir, dry grinding sound, 2 seconds, no music or voices.' },
  { id: 'espresso_start',  category: 'coffee',   status: 'placeholder', defaultVolume: 0.8, trigger: 'brewStarted event',         elevenLabsPrompt: 'Professional espresso machine pump activating, mechanical click then steady pump hum, 1 second.' },
  { id: 'espresso_loop',   category: 'coffee',   status: 'placeholder', defaultVolume: 0.65, loop: true, trigger: 'during espresso extraction', elevenLabsPrompt: 'Continuous espresso extraction loop, steady pump and flow, warm close-up recording, 3 seconds seamless loop, no voices.' },
  { id: 'espresso_stop',   category: 'coffee',   status: 'placeholder', defaultVolume: 0.6, trigger: 'extraction ends',           elevenLabsPrompt: 'Espresso machine pump stopping, mechanical click and pressure release, 1 second.' },
  { id: 'espresso_pour',   category: 'coffee',   status: 'placeholder', defaultVolume: 0.55, trigger: 'cup fill animates',        elevenLabsPrompt: 'Dark espresso liquid pouring into a ceramic cup, close-up trickle, 1.5 seconds, no music.' },
  { id: 'steam_wand',      category: 'coffee',   status: 'placeholder', defaultVolume: 0.65, loop: true, trigger: 'mocha/latte brew', elevenLabsPrompt: 'Steam wand texturing milk in stainless pitcher, smooth hiss and gentle bubbling, 2 second loop, no speech.' },
  { id: 'cup_pickup',      category: 'coffee',   status: 'placeholder', defaultVolume: 0.5, trigger: 'player picks up drink',     elevenLabsPrompt: 'Ceramic coffee cup lifted from counter, soft ceramic scrape, under 0.5 seconds.' },
  { id: 'cup_place',       category: 'coffee',   status: 'placeholder', defaultVolume: 0.5, trigger: 'cup placed on counter',     elevenLabsPrompt: 'Ceramic cup placed gently on wooden counter, soft thud, under 0.5 seconds.' },
  { id: 'cup_clink',       category: 'coffee',   status: 'placeholder', defaultVolume: 0.4, trigger: 'ambience variation',        elevenLabsPrompt: 'Two ceramic cups clink gently together in a café, brief and soft, under 0.4 seconds.' },
  { id: 'coffee_perfect',  category: 'coffee',   status: 'placeholder', defaultVolume: 0.7, trigger: 'perfect espresso grade',    elevenLabsPrompt: 'Short pleasant chime, warm and satisfying, café quality-confirmation sound, 0.8 seconds, no voices.' },
  { id: 'coffee_weak',     category: 'coffee',   status: 'placeholder', defaultVolume: 0.5, trigger: 'weak espresso grade',       elevenLabsPrompt: 'Subtle descending soft tone, gentle disappointment cue, 0.6 seconds, no voices.' },
  { id: 'coffee_bitter',   category: 'coffee',   status: 'placeholder', defaultVolume: 0.5, trigger: 'bitter espresso grade',     elevenLabsPrompt: 'Short low buzz or dissonant cue, brief over-extraction feedback, 0.6 seconds, no voices.' },
  // Pastry
  { id: 'oven_open',       category: 'pastry',   status: 'placeholder', defaultVolume: 0.6, trigger: 'bakeLoad/bakeUnload action', elevenLabsPrompt: 'Metal oven door opening in a café kitchen, hinged creak and slight whoosh of warm air, 1 second.' },
  { id: 'oven_close',      category: 'pastry',   status: 'placeholder', defaultVolume: 0.6, trigger: 'bakeLoad/bakeUnload complete', elevenLabsPrompt: 'Metal oven door closing shut, solid metallic clunk, 0.6 seconds.' },
  { id: 'oven_hum',        category: 'pastry',   status: 'placeholder', defaultVolume: 0.3, loop: true, trigger: 'oven baking state', elevenLabsPrompt: 'Commercial oven running hum, low frequency electric warmth, 4 second seamless loop, no voices.' },
  { id: 'oven_timer',      category: 'pastry',   status: 'placeholder', defaultVolume: 0.75, trigger: 'bakeReady event',          elevenLabsPrompt: 'Kitchen oven timer ding, warm and clear bell, 0.8 seconds, no voices.' },
  { id: 'pastry_tray',     category: 'pastry',   status: 'placeholder', defaultVolume: 0.55, trigger: 'bakeLoad action',          elevenLabsPrompt: 'Metal baking tray slid into oven, slight rattle, 0.7 seconds.' },
  { id: 'pastry_rustle',   category: 'pastry',   status: 'placeholder', defaultVolume: 0.4, trigger: 'pastry handled',            elevenLabsPrompt: 'Fresh pastry handled with paper bag, light crinkling, 0.5 seconds.' },
  // Dishes
  { id: 'faucet_on',       category: 'dishes',   status: 'placeholder', defaultVolume: 0.6, trigger: 'wash action starts',        elevenLabsPrompt: 'Kitchen faucet turned on, water begins flowing, 0.8 seconds.' },
  { id: 'water_loop',      category: 'dishes',   status: 'placeholder', defaultVolume: 0.5, loop: true, trigger: 'during wash',   elevenLabsPrompt: 'Running water in café sink, steady close-up flow, 3 second seamless loop, no voices.' },
  { id: 'scrub_loop',      category: 'dishes',   status: 'placeholder', defaultVolume: 0.45, loop: true, trigger: 'active washing', elevenLabsPrompt: 'Sponge scrubbing a ceramic dish in soapy water, rhythmic and close-up, 2 second loop.' },
  { id: 'faucet_off',      category: 'dishes',   status: 'placeholder', defaultVolume: 0.5, trigger: 'wash action ends',          elevenLabsPrompt: 'Kitchen faucet turned off, water stops, 0.5 seconds.' },
  { id: 'dish_rack',       category: 'dishes',   status: 'placeholder', defaultVolume: 0.5, trigger: 'dishWashed event',          elevenLabsPrompt: 'Clean ceramic dish placed in a metal drying rack, brief clink, 0.5 seconds.' },
  // Customers / door
  { id: 'door_bell',       category: 'customers', status: 'placeholder', defaultVolume: 0.65, trigger: 'guestArrived event',      elevenLabsPrompt: 'Small café entrance bell chime as door opens, single clear ding, 0.8 seconds.' },
  { id: 'footsteps',       category: 'customers', status: 'placeholder', defaultVolume: 0.35, trigger: 'guest walking to counter', elevenLabsPrompt: 'Two or three light footsteps on a wooden floor, casual café pace, 1 second, no voices.' },
  { id: 'payment_beep',    category: 'customers', status: 'placeholder', defaultVolume: 0.6, trigger: 'itemHandedOver event',      elevenLabsPrompt: 'Modern payment terminal confirmation beep, single clean tone, 0.4 seconds.' },
  { id: 'customer_leave',  category: 'customers', status: 'placeholder', defaultVolume: 0.3, trigger: 'guestLeftHappy event',      elevenLabsPrompt: 'Café door closing softly as customer leaves, quiet click, 0.6 seconds.' },
  // TapIt
  { id: 'tapit_nfc',       category: 'tapit',    status: 'placeholder', defaultVolume: 0.6, trigger: 'standAnswered event',        elevenLabsPrompt: 'Short soft NFC tap confirmation tone, modern and minimal, 0.3 seconds, no voices.' },
  { id: 'tapit_qr',        category: 'tapit',    status: 'placeholder', defaultVolume: 0.55, trigger: 'QR scan on stand',          elevenLabsPrompt: 'Quick camera shutter or digital scan blip, subtle tech sound, 0.4 seconds.' },
  { id: 'tapit_page',      category: 'tapit',    status: 'placeholder', defaultVolume: 0.5, trigger: 'TapIt page opens',           elevenLabsPrompt: 'Short soft digital chime, page loaded confirmation, modern and pleasant, 0.5 seconds.' },
  // UI
  { id: 'ui_upgrade',      category: 'ui',       status: 'placeholder', defaultVolume: 0.75, trigger: 'upgrade purchased',         elevenLabsPrompt: 'Satisfying purchase confirmation chime, warm and positive, 0.9 seconds.' },
  { id: 'ui_mission_pass', category: 'ui',       status: 'placeholder', defaultVolume: 0.8, trigger: 'mission passed',             elevenLabsPrompt: 'Short triumphant café-style fanfare, light and joyful, 2 seconds, no voices.' },
  { id: 'ui_mission_fail', category: 'ui',       status: 'placeholder', defaultVolume: 0.65, trigger: 'mission failed',            elevenLabsPrompt: 'Short descending musical cue, gentle disappointment, 1.5 seconds, no voices.' },
  { id: 'ui_reject',       category: 'ui',       status: 'placeholder', defaultVolume: 0.5, trigger: 'tapRejected event',          elevenLabsPrompt: 'Brief low buzzer, subtle action-not-available sound, 0.3 seconds.' },
  // Ambience
  { id: 'amb_room_quiet',  category: 'ambience', status: 'placeholder', defaultVolume: 0.25, loop: true, trigger: 'quiet café', elevenLabsPrompt: 'Quiet café room tone, distant ventilation, very faint ambience, 8 second seamless loop, no voices.' },
  { id: 'amb_room_busy',   category: 'ambience', status: 'placeholder', defaultVolume: 0.35, loop: true, trigger: 'busy café', elevenLabsPrompt: 'Busy café ambience, multiple customers murmuring quietly, distant ceramic sounds, 10 second loop, no intelligible words.' },
  { id: 'amb_chatter_a',   category: 'ambience', status: 'placeholder', defaultVolume: 0.2, trigger: 'random ambient',            variationGroup: 'chatter', elevenLabsPrompt: 'Short snippet of quiet background café conversation, 2–3 seconds, no intelligible words, warm room echo.' },
  { id: 'amb_chatter_b',   category: 'ambience', status: 'placeholder', defaultVolume: 0.18, trigger: 'random ambient',           variationGroup: 'chatter', elevenLabsPrompt: 'Different snippet of quiet café chatter, 2 seconds, no words audible, natural.' },
  { id: 'amb_clink_a',     category: 'ambience', status: 'placeholder', defaultVolume: 0.3, trigger: 'random ambient',             variationGroup: 'clink', elevenLabsPrompt: 'Single ceramic cup clink, far away, 0.3 seconds.' },
  { id: 'amb_clink_b',     category: 'ambience', status: 'placeholder', defaultVolume: 0.25, trigger: 'random ambient',            variationGroup: 'clink', elevenLabsPrompt: 'Two distant ceramic cups clinking together, gentle, 0.4 seconds.' },
  { id: 'amb_footstep',    category: 'ambience', status: 'placeholder', defaultVolume: 0.15, trigger: 'random ambient',            variationGroup: 'footstep', elevenLabsPrompt: 'Distant light footsteps on wooden café floor, 2 steps, 0.6 seconds.' },
  // Music
  { id: 'music_cafe',      category: 'music',    status: 'missing',     defaultVolume: 0.4, loop: true, trigger: 'throughout shift', license: 'PENDING — requires licensed lo-fi café track or ElevenLabs music generation approval.' },
]);

// ---- Dialogue ----
/** @type {readonly DialogueEntry[]} */
export const DIALOGUE = Object.freeze([
  // A — Coffee orders
  { id: 'ord_esp_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Hey! Could I get an espresso, please?", intent: 'order_espresso', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_esp_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "One espresso to go.", intent: 'order_espresso', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_esp_03', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "I'll keep it simple. Espresso, please.", intent: 'order_espresso', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_lat_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "One latte for me, thanks.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_lat_02', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Could you make me a latte?", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_lat_03', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "I think I'll go with a latte.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_moc_01', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "I'll take a mocha.", intent: 'order_mocha', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_moc_02', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Hey there! I'll have a mocha today.", intent: 'order_mocha', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_cof_01', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Morning! Just a coffee, please.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_cof_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Coffee sounds perfect right now.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  // B — Pastry only
  { id: 'ord_pas_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Just a croissant, please.", intent: 'order_croissant', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_pas_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Hey, got any croissants left?", intent: 'order_croissant', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_pas_03', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "I'll skip the coffee. Just a pastry.", intent: 'order_croissant', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_pas_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "That croissant looks good. I'll take one.", intent: 'order_croissant', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  { id: 'ord_pas_05', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Just one fresh croissant for me.", intent: 'order_croissant', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 15000 },
  // C — Coffee and pastry combos
  { id: 'ord_combo_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "One latte and a croissant, please.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 20000 },
  { id: 'ord_combo_02', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "I'll grab a mocha and a croissant.", intent: 'order_mocha', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 20000 },
  { id: 'ord_combo_03', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Coffee and something sweet sounds good.", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 20000 },
  { id: 'ord_combo_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "I'll have an espresso. Oh, and a croissant!", intent: 'order_espresso', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 20000 },
  { id: 'ord_combo_05', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "One coffee and a croissant, thanks!", intent: 'order_latte', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 2, cooldownMs: 20000 },
  // D — Wi-Fi
  { id: 'q_wifi_01', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Hey, what's the Wi-Fi password?", intent: 'question_wifi', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_wifi_02', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Do you guys have free Wi-Fi?", intent: 'question_wifi', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_wifi_03', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "I'm trying to get some work done. Do you have Wi-Fi?", intent: 'question_wifi', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_wifi_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "Sorry, how do I connect to your Wi-Fi?", intent: 'question_wifi', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_wifi_05', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Is the guest Wi-Fi available?", intent: 'question_wifi', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  // E — Website / menu
  { id: 'q_web_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Do you guys have a website?", intent: 'question_website', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_web_02', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Where can I find your online menu?", intent: 'question_menu', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_web_03', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Can I check the menu on my phone?", intent: 'question_menu', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_web_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "Is your menu available online?", intent: 'question_menu', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_web_05', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Hey, do you have a digital menu?", intent: 'question_menu', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  // F — Social / review
  { id: 'q_soc_01', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Are you guys on Instagram?", intent: 'question_instagram', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_soc_02', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "What's your Instagram handle?", intent: 'question_instagram', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_soc_03', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "I'd love to follow your café. What's your Instagram?", intent: 'question_instagram', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_rev_01', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "Do you have a Google review link?", intent: 'question_review', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 25000 },
  { id: 'q_rev_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Where can I leave a review?", intent: 'question_review', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 25000 },
  { id: 'q_wc_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Excuse me, where's the washroom?", intent: 'question_washroom', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  { id: 'q_wc_02', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Do you have a bathroom I can use?", intent: 'question_washroom', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 20000 },
  // G — Waiting and reactions
  { id: 'react_thanks_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Thanks! That looks great.", intent: 'reaction_served', validStates: ['playing'], triggerEvent: 'itemHandedOver', priority: 3, cooldownMs: 10000 },
  { id: 'react_thanks_02', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Perfect, just what I needed.", intent: 'reaction_served', validStates: ['playing'], triggerEvent: 'itemHandedOver', priority: 3, cooldownMs: 10000 },
  { id: 'react_thanks_03', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Oh, that smells amazing!", intent: 'reaction_served_coffee', validStates: ['playing'], triggerEvent: 'itemHandedOver', priority: 3, cooldownMs: 12000 },
  { id: 'react_thanks_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "That was quick! Thank you.", intent: 'reaction_served', validStates: ['playing'], triggerEvent: 'itemHandedOver', priority: 3, cooldownMs: 10000 },
  { id: 'react_thanks_05', speaker: 'customer', voiceId: VOICE_CAST.customerE, status: 'pending', text: "I'll definitely be back.", intent: 'reaction_served', validStates: ['playing'], triggerEvent: 'guestLeftHappy', priority: 3, cooldownMs: 20000 },
  { id: 'react_wait_01',  speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "Hey, is my order almost ready?", intent: 'reaction_waiting', validStates: ['playing'], triggerEvent: 'guestWaiting', priority: 2, cooldownMs: 15000 },
  { id: 'react_wait_02',  speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Sorry, I've been waiting a while.", intent: 'reaction_waiting', validStates: ['playing'], triggerEvent: 'guestWaiting', priority: 2, cooldownMs: 15000 },
  { id: 'react_leave_01', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "I think I have to go. Sorry.", intent: 'reaction_leaving', validStates: ['playing'], triggerEvent: 'guestLeftUnhappy', priority: 2, cooldownMs: 10000 },
  // H — TapIt discovery
  { id: 'tapit_disc_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Hey, what's this little orange stand?", intent: 'tapit_discovery', validStates: ['playing'], triggerEvent: 'guestToStand', priority: 2, cooldownMs: 30000, requires: ['tapit_present'] },
  { id: 'tapit_disc_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "Wait, can I just tap my phone?", intent: 'tapit_discovery', validStates: ['playing'], triggerEvent: 'guestUsingStand', priority: 2, cooldownMs: 30000, requires: ['tapit_present'] },
  { id: 'tapit_disc_03', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Oh, there's a QR code too!", intent: 'tapit_discovery', validStates: ['playing'], triggerEvent: 'guestUsingStand', priority: 3, cooldownMs: 30000, requires: ['tapit_present'] },
  { id: 'tapit_done_01', speaker: 'customer', voiceId: VOICE_CAST.customerA, status: 'pending', text: "Nice! The menu's right here.", intent: 'tapit_resolved', validStates: ['playing'], triggerEvent: 'standAnswered', priority: 3, cooldownMs: 20000, requires: ['tapit_present'] },
  { id: 'tapit_done_02', speaker: 'customer', voiceId: VOICE_CAST.customerB, status: 'pending', text: "That was easy. Thanks!", intent: 'tapit_resolved', validStates: ['playing'], triggerEvent: 'standAnswered', priority: 3, cooldownMs: 20000, requires: ['tapit_present'] },
  { id: 'tapit_done_03', speaker: 'customer', voiceId: VOICE_CAST.customerD, status: 'pending', text: "Oh, the Wi-Fi details are on this page.", intent: 'tapit_resolved_wifi', validStates: ['playing'], triggerEvent: 'standAnswered', priority: 3, cooldownMs: 25000, requires: ['tapit_present'] },
  { id: 'tapit_done_04', speaker: 'customer', voiceId: VOICE_CAST.customerC, status: 'pending', text: "Your Instagram's here too. Cool!", intent: 'tapit_resolved', validStates: ['playing'], triggerEvent: 'standAnswered', priority: 3, cooldownMs: 25000, requires: ['tapit_present'] },
  // I — Byte
  { id: 'byte_arrival',    speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Another customer! Let's get moving.", intent: 'byte_rush', validStates: ['playing'], triggerEvent: 'guestArrived', priority: 3, cooldownMs: 20000 },
  { id: 'byte_perfect',    speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Perfect espresso! Nicely done.", intent: 'byte_praise', validStates: ['playing'], triggerEvent: 'actionCompleted', priority: 2, cooldownMs: 30000 },
  { id: 'byte_long_pull',  speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Careful, that extraction's running long!", intent: 'byte_warning', validStates: ['playing'], triggerEvent: 'actionCompleted', priority: 1, cooldownMs: 20000 },
  { id: 'byte_impatient',  speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "That customer's getting impatient.", intent: 'byte_warning', validStates: ['playing'], triggerEvent: 'guestWaiting', priority: 1, cooldownMs: 15000 },
  { id: 'byte_croissant',  speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Those croissants won't prepare themselves!", intent: 'byte_hint', validStates: ['playing'], triggerEvent: 'actionStarted', priority: 3, cooldownMs: 30000 },
  { id: 'byte_wifi_q',     speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Another Wi-Fi question? Interesting.", intent: 'byte_comment', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 4, cooldownMs: 45000 },
  { id: 'byte_time_q',     speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "We've spent a lot of time answering questions today.", intent: 'byte_comment', validStates: ['playing'], triggerEvent: 'questionAnswered', priority: 4, cooldownMs: 60000 },
  { id: 'byte_tapit_hint', speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Hey, look! TapIt can help with that.", intent: 'byte_tapit', validStates: ['playing'], triggerEvent: 'guestAsked', priority: 2, cooldownMs: 60000, requires: ['tapit_present'] },
  { id: 'byte_tapit_win',  speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "One less interruption. Back to making coffee!", intent: 'byte_tapit', validStates: ['playing'], triggerEvent: 'standAnswered', priority: 3, cooldownMs: 30000, requires: ['tapit_present'] },
  { id: 'byte_happy',      speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "Nice work! Another happy customer.", intent: 'byte_praise', validStates: ['playing'], triggerEvent: 'guestLeftHappy', priority: 4, cooldownMs: 25000 },
  { id: 'byte_shift_end',  speaker: 'byte', voiceId: VOICE_CAST.byte, status: 'pending', text: "That's the shift! Let's see how we did.", intent: 'byte_summary', validStates: ['ended'], triggerEvent: 'shiftEnded', priority: 1, cooldownMs: 999999 },
]);

/** @param {string} id @returns {SoundEntry | undefined} */
export const getSound = (id) => SOUNDS.find((s) => s.id === id);

/** @param {string} id @returns {DialogueEntry | undefined} */
export const getDialogue = (id) => DIALOGUE.find((d) => d.id === id);

/** @param {string} intent @param {string} order @returns {readonly DialogueEntry[]} */
export function dialogueForOrder(intent, order) {
  const intentKey = `order_${order}`;
  return DIALOGUE.filter((d) => d.speaker === 'customer' && d.intent === intentKey);
}

/** @param {string} topic @returns {readonly DialogueEntry[]} */
export function dialogueForQuestion(topic) {
  const intentKey = `question_${topic}`;
  return DIALOGUE.filter((d) => d.speaker === 'customer' && d.intent === intentKey);
}
