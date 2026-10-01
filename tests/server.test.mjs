import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';

let serverProcess;
let baseUrl;

before(async () => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const {port} = probe.address();
  await new Promise(resolve => probe.close(resolve));

  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, PORT: String(port), OPENAI_API_KEY: ''},
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Disha server did not start for the checks.');
});

after(() => {
  serverProcess?.kill();
});

test('serves the app with English as its declared starting language', async () => {
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /id="question"/);
  assert.match(html, /id="mic"/);
});

test('reports AI availability without exposing configuration', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await response.json(), {ready: false});
});

test('sets browser security headers on app files', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
});

test('rejects a malformed origin without stopping the server', async () => {
  const response = await fetch(`${baseUrl}/api/guide`, {
    method: 'POST',
    headers: {origin: 'not a valid origin', 'content-type': 'application/json'},
    body: JSON.stringify({message: 'pension'}),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid page origin/i);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
});

test('keeps unknown routes and unsupported actions controlled', async () => {
  const missing = await fetch(`${baseUrl}/missing`);
  assert.equal(missing.status, 404);
  const unsupported = await fetch(`${baseUrl}/api/guide`, {method: 'PUT'});
  assert.equal(unsupported.status, 405);
});

