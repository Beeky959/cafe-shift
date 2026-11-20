import { createInitialState, digest, runShift } from '../src/sim/index.js';
import { createPlayer } from '../test/support/players.js';
console.log('none:', digest(createInitialState()));
console.log('test-stand:', digest(createInitialState({ preset: 'test-stand' })));
const r = runShift({}, createPlayer('priority'));
console.log('replay events:', digest(r.events));
console.log('replay state:', digest(r.state));
