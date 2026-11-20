// @ts-check
/**
 * Public audio API — import from here, not from individual modules.
 *
 * Usage:
 *   import * as Audio from './audio/index.js';
 *   Audio.init();                // call on first user gesture
 *   Audio.play('sfx_button');
 *   Audio.trigger('guestArrived', { order: 'espresso' });
 */
export {
  init,
  isReady,
  play,
  startLoop,
  stopLoop,
  stopAllLoops,
  duckBackground,
  unduckBackground,
  setMaster,
  setSfx,
  setVoice,
  setMusic,
  setAmbient,
  mute,
  unmute,
  toggleMute,
  isMuted,
  getPrefs,
  handleVisibilityChange,
  dispose,
  registerFile,
} from './AudioManager.js';

export {
  start  as schedulerStart,
  stop   as schedulerStop,
  updateFromGuestCount,
  setDensity,
} from './AudioScheduler.js';

export {
  trigger,
  triggerByte,
  updateFlags,
  onSubtitleChange,
  reset  as dialogueReset,
} from './DialogueManager.js';

export { registerReadyAssets } from './ElevenLabsAssetLoader.js';
export { loadPrefs, savePrefs } from './AudioSettings.js';
