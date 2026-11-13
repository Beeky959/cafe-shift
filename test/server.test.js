// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../tools/serve.mjs';

test('the static server serves the entry point and modules with correct types', async () => {
  const server = await startServer(0);
  try {
    const page = await fetch(server.url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(await page.text(), /<script type="module" src="src\/main\.js">/);

    const module = await fetch(new URL('src/sim/index.js', server.url));
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type') ?? '', /^text\/javascript/);

    const css = await fetch(new URL('src/styles.css', server.url));
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
  } finally {
    await server.close();
  }
});

test('the static server refuses missing files, other methods and paths outside the project', async () => {
  const server = await startServer(0);
  try {
    assert.equal((await fetch(new URL('nope.js', server.url))).status, 404);
    assert.equal((await fetch(server.url, { method: 'POST' })).status, 405);
    const escape = await fetch(`${server.url}..%2f..%2f..%2fetc%2fpasswd`);
    assert.ok(escape.status === 403 || escape.status === 404);
    assert.doesNotMatch(await escape.text(), /root:/);
  } finally {
    await server.close();
  }
});
