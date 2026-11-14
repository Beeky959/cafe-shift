/**
 * Browser check: loads the game from the local static server in a headless
 * browser and serves orders by hand with real mouse, touch and keyboard input,
 * including a real drag, at desktop
 * size, at 360x640 and on a phone held sideways. Fails on any console error,
 * uncaught exception, failed or non-local request, page scroll, undersized
 * touch target, or a result that differs from the same commands replayed in
 * Node.
 *
 * Playwright is a development dependency (installed by `npm ci`). It also
 * needs a browser: run `npx playwright install chromium` once, or set
 * CHROME_PATH to an installed Chrome or Chromium.
 *   node tools/browser-check.cjs [screenshot-folder]
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const VIEWPORTS = [
  { name: 'desktop-1280x800', width: 1280, height: 800, scale: 1, touch: false },
  { name: 'phone-360x640', width: 360, height: 640, scale: 3, touch: true },
  { name: 'phone-landscape-640x360', width: 640, height: 360, scale: 3, touch: true },
];

const here = (...parts) => pathToFileURL(path.join(__dirname, '..', ...parts)).href;

async function main() {
  const { chromium } = require('playwright');
  const { startServer } = await import(here('tools', 'serve.mjs'));
  const sim = await import(here('src', 'sim', 'index.js'));
  const scene = await import(here('src', 'view', 'scene.js'));
  const players = await import(here('test', 'support', 'players.js'));
  const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;

  const expectedInitial = sim.digest(sim.createInitialState());
  const expectedAutoplay = sim.digest(sim.runShift({}, players.createPlayer('priority')).state);

  const server = await startServer(0);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const failures = [];

  try {
    for (const vp of VIEWPORTS) {
      const fail = (what) => failures.push(`${vp.name}: ${what}`);
      const check = (ok, what) => { if (!ok) fail(what); };
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.scale,
        hasTouch: vp.touch,
        isMobile: vp.touch,
      });
      const page = await context.newPage();
      const requests = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`uncaught: ${e.message}`));
      page.on('requestfailed', (r) => fail(`request failed: ${r.url()}`));
      page.on('response', (r) => {
        requests.push(new URL(r.url()).pathname);
        if (r.status() >= 400) fail(`HTTP ${r.status()}: ${r.url()}`);
        if (!r.url().startsWith(server.url)) fail(`non-local request: ${r.url()}`);
      });

      const game = (expr) => page.evaluate(`(() => { const g = window.cafeShift; const s = g.state(); return (${expr}); })()`);
      const until = (expr, what, timeout = 15000) =>
        page.waitForFunction(`(() => { const g = window.cafeShift; const s = g.state(); return (${expr}); })()`, null, { timeout }).catch(() => fail(`timed out waiting: ${what}`));
      const phase = () => page.getAttribute('#app', 'data-phase');
      /** Presses a point given in scene units, with the device's own kind of pointer. */
      const pressScene = async (x, y) => {
        const box = await page.locator('#scene').boundingBox();
        const px = box.x + (x / scene.SCENE_WIDTH) * box.width;
        const py = box.y + (y / scene.SCENE_HEIGHT) * box.height;
        if (vp.touch) await page.touchscreen.tap(px, py);
        else await page.mouse.click(px, py);
      };
      const pressArea = (id) => {
        const c = scene.centreOf(scene.HIT_AREAS.find((a) => a.id === id));
        return pressScene(c.x, c.y);
      };
      const activate = (selector) => (vp.touch ? page.tap(selector) : page.click(selector));

      // ---- A. Load.
      await page.goto(`${server.url}?debug`, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.cafeShift) && document.getElementById('app').dataset.initialDigest);
      check((await phase()) === 'intro', 'does not start on the intro');
      check(await page.isVisible('#overlay'), 'intro overlay is not shown');
      check((await page.getAttribute('#app', 'data-initial-digest')) === expectedInitial, 'starting state differs from Node');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-1-intro.png`) });

      // ---- B. Layout.
      const layout = await page.evaluate(() => {
        const rect = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const canvas = document.getElementById('scene');
        return {
          canvas: rect(canvas),
          backing: [canvas.width, canvas.height],
          dpr: window.devicePixelRatio,
          inner: [window.innerWidth, window.innerHeight],
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          targets: [...document.querySelectorAll('.target')].map((el) => ({ id: el.id, ...rect(el) })),
          chips: [...document.querySelectorAll('.chip')].map((el) => rect(el)),
          hud: [...document.querySelectorAll('.hud > *')].map((el) => rect(el)),
          caption: rect(document.querySelector('.caption')),
        };
      });
      check(layout.scroll[0] <= layout.inner[0] && layout.scroll[1] <= layout.inner[1], `page scrolls (${layout.scroll} in ${layout.inner})`);
      check(Math.abs(layout.canvas.w / layout.canvas.h - 4 / 3) < 0.01, `scene is not 4:3 (${layout.canvas.w}x${layout.canvas.h})`);
      check(Math.abs(layout.backing[0] - layout.canvas.w * Math.min(layout.dpr, 2)) <= 1, 'backing store does not match the display size');
      check(layout.canvas.l >= 0 && layout.canvas.r <= layout.inner[0] + 0.5 && layout.canvas.b <= layout.inner[1] + 0.5, 'scene is partly off screen');
      if (vp.width === 360) check(Math.round(layout.canvas.w) === 360, `scene is ${layout.canvas.w} px wide, expected 360`);
      check(layout.targets.length === scene.HIT_AREAS.length, `${layout.targets.length} target buttons`);
      for (const t of layout.targets) check(t.w >= 48 && t.h >= 48, `${t.id} is ${Math.round(t.w)}x${Math.round(t.h)} px, under 48`);
      for (const c of layout.chips) check(c.h >= 40 && c.r <= layout.inner[0] + 0.5, `an action chip is ${Math.round(c.h)} px tall or off screen`);
      const railCards = await page.evaluate(() => [...document.querySelectorAll('.card')].map((el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, r: b.right, b: b.bottom }; }));
      check(railCards.length === 5, `${railCards.length} rail cards`);
      for (const c of railCards) check(c.w >= 44 && c.h >= 44 && c.r <= layout.inner[0] + 0.5 && c.b <= layout.inner[1] + 0.5, `a rail card is ${Math.round(c.w)}x${Math.round(c.h)} px or off screen`);
      for (const h of layout.hud) check(h.l >= 0 && h.r <= layout.inner[0] + 0.5, 'a HUD item is cut off');
      check(layout.caption.b <= layout.inner[1] + 0.5, "Byte's caption is off screen");

      // ---- C. Serve by hand with real input: pick the order, make it, carry it over.
      const cdp = vp.touch ? await context.newCDPSession(page) : null;
      const toScreen = async (id) => {
        const box = await page.locator('#scene').boundingBox();
        const c = scene.centreOf(scene.HIT_AREAS.find((a) => a.id === id));
        return { x: box.x + (c.x / scene.SCENE_WIDTH) * box.width, y: box.y + (c.y / scene.SCENE_HEIGHT) * box.height };
      };
      /** A real drag from one target to another: mouse on desktop, a finger on touch. */
      const drag = async (fromId, toId) => {
        const from = await toScreen(fromId);
        const to = await toScreen(toId);
        const steps = 10;
        const at = (i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
        if (cdp) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
          for (let i = 1; i <= steps; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] });
            await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          for (let i = 1; i <= steps; i++) {
            await page.mouse.move(at(i).x, at(i).y);
            await page.waitForTimeout(16);
          }
          await page.mouse.up();
        }
      };
      const cardData = (slot, key) => page.getAttribute(`#card-${slot}`, `data-${key}`);
      /** The first guest waiting at the counter with nothing made for them: { id, slot, order, station }. */
      const nextOrder = () =>
        page.evaluate(() => {
          const s = window.cafeShift.state();
          for (const [slot, id] of s.spots.entries()) {
            const g = s.guests.find((x) => x.id === id);
            const spec = s.schedule.find((x) => x.id === id);
            if (g && spec && g.state === 'waiting' && g.attendedBy === null) return { id, slot, order: spec.order, station: spec.order === 'latte' ? 'machine' : 'case' };
          }
          return null;
        });
      const itemReadyExpr = (order) => (order === 'latte' ? "s.machine.slots[0].state === 'ready'" : 's.pass.dishId !== null');

      await activate('#overlay-button');
      check((await phase()) === 'playing', 'did not start');
      check(!(await page.isVisible('#overlay')), 'overlay still shown while playing');
      await until("s.guests.some((x) => x.state === 'waiting')", 'first guest at the counter');

      // A station does nothing until an order is picked, and says so. No command is sent.
      await pressArea('machine');
      await page.waitForTimeout(150);
      check((await page.textContent('#byte-text')).includes('Pick an order first'), 'no explanation for pressing a station with no order picked');
      check((await game('g.commandLog().length')) === 0 && (await game('g.pendingCount()')) === 0, 'a refused press still sent a command');

      // No input is lost: with the clock held still, 100 presses are all handled.
      // (The prototype dropped taps.) Presses alternate between two targets and are
      // spaced so that the intended 80 ms same-target debounce does not apply.
      await page.evaluate(() => window.cafeShift.setSpeed(0));
      await page.waitForTimeout(60);
      const handledBefore = await game('g.inputCount()');
      for (let i = 0; i < 100; i++) {
        await pressArea(i % 2 === 0 ? 'spot-0' : 'table-1');
        await page.waitForTimeout(55);
      }
      const handled = (await game('g.inputCount()')) - handledBefore;
      check(handled === 100, `100 presses, ${handled} handled`);
      check((await game('g.pendingCount()')) === 0, 'selecting an order or pressing a clean table sent a command');
      await page.evaluate(() => window.cafeShift.setSpeed(1));

      // 1. Pick the order: press the guest in the scene.
      const first = await nextOrder();
      check(first !== null, 'no order to pick');
      await pressArea(`spot-${first.slot}`);
      check((await game('g.selected()')) === first.id, 'pressing a guest did not select their ticket');
      check((await cardData(first.slot, 'selected')) === 'yes', 'the selected ticket is not marked on the rail');
      check((await page.textContent(`#card-${first.slot} .card-num`)) === String(first.id), 'the ticket number is not the guest number');

      // 2. Make it at the right station (a near miss, 10 scene units outside, still counts).
      const station = scene.HIT_AREAS.find((a) => a.id === first.station);
      await pressScene(station.x - 10, station.y + station.h / 2);
      await until("s.owner.action !== null || s.machine.slots[0].state !== 'empty' || s.pass.dishId !== null", 'the order to be started');

      // Cancelling returns everything; then start it again for real.
      if (await game("s.owner.action !== null && (s.owner.action.kind === 'brewStart' || s.owner.action.kind === 'plate')")) {
        if (vp.touch) await activate('#chip-0');
        else await page.keyboard.press('c');
        await until('s.owner.action === null', 'cancel');
        check((await game("s.dishes.filter((d) => d.holder.kind === 'rack').length")) === 5, 'cancel did not return the dish');
        check((await cardData(first.slot, 'status')) === 'new', 'a cancelled order is not shown as new again');
        // Past the 80 ms same-target debounce: the check can press faster than a person.
        await page.waitForTimeout(120);
        await pressArea(`spot-${first.slot}`);
        await page.waitForTimeout(120);
        await pressArea(first.station);
      }
      await until(itemReadyExpr(first.order), 'the item to be ready');
      await page.waitForTimeout(250);
      check((await cardData(first.slot, 'status')) === 'ready', `ticket shows "${await cardData(first.slot, 'status')}" when its item is ready`);

      // Pause freezes the shift.
      if (!vp.touch) await page.keyboard.press('p');
      else await activate('#pause-button');
      check((await phase()) === 'paused', 'did not pause');
      const frozen = await game('s.tick');
      const frozenClock = await game('g.anim().now()');
      await page.waitForTimeout(300);
      check((await game('s.tick')) === frozen, 'the shift kept running while paused');
      check((await game('g.anim().now()')) === frozenClock, 'animations kept moving while paused');
      check(await page.isVisible('#overlay'), 'pause overlay is not shown');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-2-paused.png`) });
      await activate('#overlay-button');
      check((await phase()) === 'playing', 'did not resume');

      // 3. Deliver by dragging the item from the station to the guest.
      await drag(first.station, `spot-${first.slot}`);
      await until('s.economy.wallet > 0', 'payment after a dragged delivery');
      check((await page.textContent('#hud-coins')) === String(await game('s.economy.wallet')), 'HUD coins differ from the state');
      check((await page.textContent(`#card-${first.slot} .card-receipt`)).startsWith('Paid +'), 'the completed transaction is not shown on the ticket');
      check((await game('g.carrying()')) === null && (await game('g.selected()')) === null, 'interface state was not cleared after delivery');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-3-delivered.png`) });

      // 4. A question is a different thing from an order, and costs counter time.
      if (await game(`s.guests.some((x) => x.id === ${first.id} && x.state === 'asking')`)) {
        check((await cardData(first.slot, 'kind')) === 'question', 'a question is shown as an order');
        check((await page.getAttribute(`#card-${first.slot}`, 'aria-label')).includes('a question, not an order'), 'the question card does not say it is a question');
        check((await page.textContent('#byte-text')).includes('question'), 'Byte did not react to the question');
        check((await page.textContent('#hud-questions')) === '0s', 'questions time did not start at zero');
        // Answer it: the rail card on touch, the spot's number key on desktop.
        if (vp.touch) await activate(`#card-${first.slot}`);
        else await page.keyboard.press(String(4 + first.slot));
        await until('s.metrics.ownerTicks.answer >= s.timing.answer', 'the question to be answered');
        await page.waitForTimeout(100);
        check((await page.textContent('#hud-questions')) === '3s', `questions time shows ${await page.textContent('#hud-questions')}`);
      } else {
        fail('the first guest of the default shift should have asked a question');
      }

      // 5. The accessible equivalent, with no dragging: pick, make, pick up, deliver.
      await until("s.spots.some((id) => { const x = s.guests.find((q) => q.id === id); return x && x.state === 'waiting' && x.attendedBy === null; })", 'a second order');
      const second = await nextOrder();
      const stationKey = second.station === 'machine' ? '1' : '2';
      const served = await game('s.metrics.guests.served');
      if (!vp.touch) {
        await page.keyboard.press(String(4 + second.slot)); // pick the order
        check((await game('g.selected()')) === second.id, 'the number key did not select the ticket');
        await page.keyboard.press(stationKey); // make it
        await until(itemReadyExpr(second.order), 'the second item');
        await page.focus(`#target-${second.station}`); // a real, labelled button
        await page.waitForTimeout(250);
        check((await page.getAttribute(`#target-${second.station}`, 'aria-label')).includes('Press to pick up'), 'the station button is not labelled with picking up');
        await page.keyboard.press('Enter');
        check((await game('g.carrying()')) === second.order, 'Enter on the station did not pick the item up');
        await page.keyboard.press('Escape'); // put it back, without pausing
        check((await game('g.carrying()')) === null && (await phase()) === 'playing', 'Escape did not put the item back');
        await page.waitForTimeout(120); // past the same-target debounce
        await page.keyboard.press(stationKey);
        check((await game('g.carrying()')) === second.order, 'the station key did not pick the item up');
        await page.keyboard.press(String(4 + second.slot)); // deliver
      } else {
        await activate(`#card-${second.slot}`); // pick the order on the rail
        check((await game('g.selected()')) === second.id, 'the rail card did not select the ticket');
        await pressArea(second.station);
        await until(itemReadyExpr(second.order), 'the second item');
        await pressArea(second.station); // tap to pick up
        check((await game('g.carrying()')) === second.order, 'a tap on the station did not pick the item up');
        await page.waitForTimeout(60);
        check((await page.getAttribute('#app', 'data-carrying')) === second.order, 'the page does not show an item is being carried');
        await pressArea(`spot-${second.slot}`); // tap the guest to deliver
      }
      await until(`s.metrics.guests.served > ${served}`, 'the second delivery');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-4-second.png`) });

      // ---- D. Let the scripted player finish the shift, quickly.
      await page.evaluate(async () => {
        const m = await import('/test/support/players.js');
        window.cafeShift.setAutoplayer(m.createPlayer('priority'));
        window.cafeShift.setSpeed(60);
      });
      await page.waitForFunction(() => document.getElementById('app').dataset.phase === 'ended', null, { timeout: 30000 }).catch(() => fail('the shift did not end'));
      check(await page.isVisible('#overlay'), 'results are not shown');
      const final = await page.evaluate(() => {
        const s = window.cafeShift.state();
        return {
          digest: document.getElementById('app').dataset.finalDigest,
          log: window.cafeShift.commandLog(),
          happy: s.metrics.guests.leftHappy,
          guests: s.schedule.length,
          gross: s.economy.grossEarnings,
          score: s.economy.score,
          text: document.getElementById('overlay-body').textContent,
          time: document.getElementById('hud-time').textContent,
        };
      });
      check(final.text.includes(`${final.happy} of ${final.guests} guests left happy`), 'results do not match the state (guests)');
      check(final.text.includes(`${final.gross} coins earned`) && final.text.includes(`Score: ${final.score}`), 'results do not match the state (coins)');
      check(final.time === 'Closed', 'clock does not show the shift is over');
      check(final.text.includes('question'), 'results do not report the time spent on questions');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-5-results.png`) });

      // ---- E. The session is reproducible: the same commands replayed in Node give the same state.
      const replayed = sim.replay({}, final.log);
      check(sim.digest(replayed.state) === final.digest, 'the browser session cannot be reproduced from its command log');
      check(sim.checkInvariants(replayed.state).length === 0, 'the final state breaks an invariant');

      // ---- F. Play again starts a fresh shift; left alone, the scripted player gets the same result as in Node.
      await page.evaluate(async () => {
        const m = await import('/test/support/players.js');
        window.cafeShift.setSpeed(0);
        window.cafeShift.setAutoplayer(m.createPlayer('priority'));
      });
      await activate('#overlay-button');
      check((await phase()) === 'playing', 'play again did not start');
      check((await game('s.tick')) === 0 && (await game('s.economy.wallet')) === 0, 'play again did not reset the shift');
      await page.evaluate(() => window.cafeShift.setSpeed(60));
      await page.waitForFunction(() => document.getElementById('app').dataset.phase === 'ended', null, { timeout: 30000 }).catch(() => fail('the second shift did not end'));
      check((await page.getAttribute('#app', 'data-final-digest')) === expectedAutoplay, 'scripted play in the browser differs from Node');

      check(!requests.some((r) => r.includes('/legacy/')), 'the page loaded something from legacy/');
      check(!requests.some((r) => r.includes('tapit')), 'the game loaded the TapIt components');
      const draw = await game('g.drawStats()');
      console.log(`${vp.name}: scene ${Math.round(layout.canvas.w)}x${Math.round(layout.canvas.h)}, smallest target ${Math.round(Math.min(...layout.targets.map((t) => Math.min(t.w, t.h))))} px, ` +
        `played by ${vp.touch ? 'touch' : 'mouse and keyboard'}, ${final.log.length} command batches replayed, final ${final.digest}, ` +
        `draw ${draw.mean.toFixed(2)} ms mean / ${draw.p95.toFixed(2)} ms p95`);
      await context.close();
    }
    // ---- G. Reduced motion: the game still plays, with nothing failing.
    {
      const fail = (what) => failures.push(`reduced-motion: ${what}`);
      const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(`uncaught: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') fail(`console error: ${m.text()}`); });
      await page.goto(`${server.url}?debug`, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.cafeShift));
      if (!(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))) fail('reduced motion was not applied');
      await page.tap('#overlay-button');
      await page.evaluate(async () => {
        const m = await import('/test/support/players.js');
        window.cafeShift.setAutoplayer(m.createPlayer('priority'));
        window.cafeShift.setSpeed(60);
      });
      await page.waitForFunction(() => document.getElementById('app').dataset.phase === 'ended', null, { timeout: 30000 }).catch(() => fail('the shift did not end'));
      if (shots) await page.screenshot({ path: path.join(shots, 'reduced-motion-results.png') });
      console.log('reduced-motion: played a full shift');
      await context.close();
    }

    // ---- H. Performance on a phone-sized screen with the processor slowed four times.
    {
      const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await page.goto(`${server.url}?debug`, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.cafeShift));
      await page.tap('#overlay-button');
      await page.evaluate(async () => {
        const m = await import('/test/support/players.js');
        window.cafeShift.setAutoplayer(m.createPlayer('priority'));
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const frames = await page.evaluate(() => new Promise((done) => {
        const times = [];
        let last = performance.now();
        const step = (now) => {
          times.push(now - last);
          last = now;
          if (times.length < 300) requestAnimationFrame(step);
          else done(times.slice(30).sort((a, b) => a - b));
        };
        requestAnimationFrame(step);
      }));
      const draw = await page.evaluate(() => window.cafeShift.drawStats());
      const p95 = frames[Math.floor(frames.length * 0.95)];
      console.log(`performance, 360x640 at 4x slower CPU: frame interval median ${frames[Math.floor(frames.length / 2)].toFixed(1)} ms, p95 ${p95.toFixed(1)} ms; draw ${draw.mean.toFixed(2)} ms mean, ${draw.p95.toFixed(2)} ms p95`);
      if (draw.p95 > 16.7) failures.push(`performance: drawing takes ${draw.p95.toFixed(1)} ms at p95 on a slowed phone-sized screen, over one frame`);
      await context.close();
    }

    // ---- I. The TapIt components page loads on its own, without errors.
    {
      const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
      const page = await context.newPage();
      page.on('pageerror', (e) => failures.push(`tapit-preview: uncaught: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') failures.push(`tapit-preview: console error: ${m.text()}`); });
      await page.goto(`${server.url}tapit-preview.html`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      if (shots) await page.screenshot({ path: path.join(shots, 'tapit-preview.png') });
      console.log('tapit-preview: loaded');
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length})`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nBrowser check passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
