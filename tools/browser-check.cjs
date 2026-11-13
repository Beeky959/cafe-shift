/**
 * Optional development check: loads the page from the local static server in a
 * headless browser at desktop size and at 360x640, and fails on any console
 * error, uncaught exception, failed request, page scroll or wrong fingerprint.
 *
 * Needs Playwright to be resolvable by Node. It is not a project dependency.
 *   node tools/browser-check.cjs [screenshot-folder]
 *   CHROME_PATH=/path/to/chrome   use an installed browser instead of Playwright's
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const VIEWPORTS = [
  { name: 'desktop-1280x800', width: 1280, height: 800, scale: 1, touch: false },
  { name: 'phone-360x640', width: 360, height: 640, scale: 3, touch: true },
];
const EXPECTED = { none: 'e07c41c9965d475a', 'test-stand': '0a0524c5953d3344' };

async function main() {
  const { chromium } = require('playwright');
  const { startServer } = await import(pathToFileURL(path.join(__dirname, 'serve.mjs')).href);
  const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const server = await startServer(0);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const failures = [];
  const fail = (where, what) => failures.push(`${where}: ${what}`);

  try {
    for (const vp of VIEWPORTS) {
      for (const [query, preset] of [['', 'none'], ['?preset=test-stand', 'test-stand']]) {
        const where = `${vp.name}${query}`;
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.scale,
          hasTouch: vp.touch,
          isMobile: vp.touch,
        });
        const page = await context.newPage();
        const requests = [];
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(where, `console ${m.type()}: ${m.text()}`); });
        page.on('pageerror', (e) => fail(where, `uncaught: ${e.message}`));
        page.on('requestfailed', (r) => fail(where, `request failed: ${r.url()}`));
        page.on('response', (r) => {
          requests.push(`${r.status()} ${new URL(r.url()).pathname}`);
          if (r.status() >= 400) fail(where, `HTTP ${r.status()}: ${r.url()}`);
          if (!r.url().startsWith(server.url)) fail(where, `non-local request: ${r.url()}`);
        });

        await page.goto(server.url + query, { waitUntil: 'load' });
        await page.waitForSelector('#status[data-ready="true"]', { timeout: 5000 });
        const m = await page.evaluate(() => {
          const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));
          const box = canvas.getBoundingClientRect();
          const status = document.getElementById('status');
          const pixel = canvas.getContext('2d').getImageData(2, 2, 1, 1).data;
          return {
            digest: status.dataset.digest,
            problems: status.dataset.problems,
            css: [box.width, box.height],
            backing: [canvas.width, canvas.height],
            dpr: window.devicePixelRatio,
            scrollW: document.documentElement.scrollWidth,
            scrollH: document.documentElement.scrollHeight,
            inner: [window.innerWidth, window.innerHeight],
            painted: pixel[3] === 255,
          };
        });

        if (m.digest !== EXPECTED[preset]) fail(where, `fingerprint ${m.digest}, expected ${EXPECTED[preset]}`);
        if (m.problems !== '0') fail(where, `rule check reported ${m.problems} problem(s)`);
        if (Math.abs(m.css[0] / m.css[1] - 4 / 3) > 0.01) fail(where, `scene is not 4:3 (${m.css})`);
        if (m.scrollW > m.inner[0] || m.scrollH > m.inner[1]) fail(where, `page scrolls (${m.scrollW}x${m.scrollH} in ${m.inner})`);
        const ratio = Math.min(m.dpr, 2);
        if (Math.abs(m.backing[0] - m.css[0] * ratio) > 1) fail(where, `backing store ${m.backing} does not match ${m.css} x ${ratio}`);
        if (!m.painted) fail(where, 'scene was not drawn');
        if (vp.width === 360 && Math.round(m.css[0]) !== 360) fail(where, `scene is ${m.css[0]} px wide, expected 360`);
        if (requests.some((r) => r.includes('/legacy/'))) fail(where, 'the page loaded something from legacy/');

        console.log(`${where}: scene ${m.css.map(Math.round).join('x')} css, ${m.backing.join('x')} backing, fingerprint ${m.digest}`);
        console.log(`  requests: ${requests.join(', ')}`);
        if (shots && query === '') await page.screenshot({ path: path.join(shots, `${vp.name}.png`) });
        await context.close();
      }
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
