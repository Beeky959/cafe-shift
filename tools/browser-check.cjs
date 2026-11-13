/**
 * Browser check: loads the game from the local static server in a headless
 * browser and plays it with real mouse, touch and keyboard input at desktop
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
      for (const c of layout.chips) check(c.h >= 36 && c.r <= layout.inner[0] + 0.5, 'an action chip is too small or off screen');
      for (const h of layout.hud) check(h.l >= 0 && h.r <= layout.inner[0] + 0.5, 'a HUD item is cut off');
      check(layout.caption.b <= layout.inner[1] + 0.5, "Byte's caption is off screen");

      // ---- C. Play with real input.
      await activate('#overlay-button');
      check((await phase()) === 'playing', 'did not start');
      check(!(await page.isVisible('#overlay')), 'overlay still shown while playing');
      await until("s.guests.some((x) => x.state === 'waiting')", 'first guest at the counter');

      // No input is lost: with the clock held still, 100 presses on valid
      // targets become exactly 100 commands. (The prototype dropped taps.)
      await page.evaluate(() => window.cafeShift.setSpeed(0));
      await page.waitForTimeout(60);
      const heldAt = await game('g.pendingCount()');
      // Presses alternate between two targets and are spaced so that the 80 ms
      // same-target debounce, which is intended, does not apply.
      for (let i = 0; i < 100; i++) {
        await pressArea(i % 2 === 0 ? 'machine' : 'case');
        await page.waitForTimeout(55);
      }
      const accepted = (await game('g.pendingCount()')) - heldAt;
      check(accepted === 100, `100 presses produced ${accepted} commands`);
      await page.evaluate(() => window.cafeShift.setSpeed(1));
      // Only the first of each is acted on; the rest are refused as duplicates. Clear them.
      await until("s.owner.action !== null", 'the held presses to be applied');
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { const s = window.cafeShift.state(); if (s.owner.action || s.owner.queue.length) document.getElementById(s.owner.queue.length ? 'chip-1' : 'chip-0').click(); });
        await page.waitForTimeout(120);
      }
      await until("s.owner.action === null && s.owner.queue.length === 0", 'the task list to be cleared');
      check((await game("s.dishes.filter((d) => d.holder.kind === 'rack').length")) === 5, 'clearing the task list did not return the dishes');

      // A tap that can do nothing sends no command and says why.
      const logBefore = await game('g.commandLog().length');
      await pressArea('sink');
      await page.waitForTimeout(150);
      check((await page.textContent('#byte-text')).includes('Nothing to wash'), 'no explanation for a refused tap');
      check((await game('g.commandLog().length')) === logBefore, 'a refused tap still sent a command');

      // Pointer: start a latte. A near miss, 10 scene units outside the machine, still counts.
      const machine = scene.HIT_AREAS.find((a) => a.id === 'machine');
      await pressScene(machine.x - 10, machine.y + machine.h / 2);
      await until("s.owner.action && s.owner.action.kind === 'brewStart' || s.machine.slots[0].state !== 'empty'", 'near-miss tap on the machine');

      // Cancel through the action strip while it is still in progress, if we were quick enough.
      const cancelled = await game("s.owner.action && s.owner.action.kind === 'brewStart'");
      if (cancelled) {
        await activate('#chip-0');
        await until('s.owner.action === null', 'cancel from the action strip');
        check((await game("s.dishes.filter((d) => d.holder.kind === 'rack').length")) === 5, 'cancel did not return the dish');
        check((await game("s.machine.slots[0].state")) === 'empty', 'cancel left the machine busy');
      }

      // Keyboard on desktop, pointer elsewhere: brew for real this time.
      if (!vp.touch) {
        // C cancels the current action.
        await page.keyboard.press('2');
        await until("s.owner.action && s.owner.action.kind === 'plate'", 'key 2 starts plating');
        await page.keyboard.press('c');
        await until('s.owner.action === null', 'key C cancels');
        check((await game('s.pass.dishId')) === null, 'cancelled plating still produced a croissant');
        await page.keyboard.press('1');
        await until("s.machine.slots[0].state !== 'empty' || (s.owner.action && s.owner.action.kind === 'brewStart')", 'key 1 starts a latte');
      } else {
        await page.waitForTimeout(120);
        await pressArea('machine');
      }
      await until("s.machine.slots[0].state === 'ready'", 'latte ready');

      // Pause freezes the shift.
      if (!vp.touch) await page.keyboard.press('p');
      else await activate('#pause-button');
      check((await phase()) === 'paused', 'did not pause');
      const frozen = await game('s.tick');
      await page.waitForTimeout(300);
      check((await game('s.tick')) === frozen, 'the shift kept running while paused');
      check(await page.isVisible('#overlay'), 'pause overlay is not shown');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-2-paused.png`) });
      await activate('#overlay-button');
      check((await phase()) === 'playing', 'did not resume');

      // Serve the first latte guest: a real button on desktop (focus, then Enter), a tap on touch.
      const spotIndex = await game("s.spots.findIndex((id) => { const x = s.guests.find((q) => q.id === id); const sp = s.schedule.find((q) => q.id === id); return x && sp && x.state === 'waiting' && sp.order === 'latte'; })");
      check(spotIndex >= 0, 'no latte guest is waiting');
      const coinsBefore = await game('s.economy.wallet');
      if (!vp.touch) {
        await page.focus(`#target-spot-${spotIndex}`);
        await page.waitForTimeout(250);
        check((await page.getAttribute(`#target-spot-${spotIndex}`, 'aria-label')).includes('Press to hand over'), 'target button is not labelled with its action');
        await page.keyboard.press('Enter');
      } else {
        await pressArea(`spot-${spotIndex}`);
      }
      await until(`s.economy.wallet > ${coinsBefore}`, 'payment after hand-over');
      check((await page.textContent('#hud-coins')) === String(await game('s.economy.wallet')), 'HUD coins differ from the state');
      check((await page.textContent('#chip-0')) !== '', 'action strip is empty');
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-3-playing.png`) });

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
      if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-4-results.png`) });

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
      console.log(`${vp.name}: scene ${Math.round(layout.canvas.w)}x${Math.round(layout.canvas.h)}, smallest target ${Math.round(Math.min(...layout.targets.map((t) => Math.min(t.w, t.h))))} px, ` +
        `played by ${vp.touch ? 'touch' : 'mouse and keyboard'}, ${final.log.length} command batches replayed, final ${final.digest}`);
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
