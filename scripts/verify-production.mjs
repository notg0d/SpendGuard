import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Isolated ephemeral-port smoke test: no credentials, no upstream calls, no writes.
const child = spawn(process.execPath, ['server/index.mjs', '--production'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: '0',
    SUBSENSE_NETWORK: 'mainnet',
    SUBSENSE_PUBLIC_ORIGIN: 'http://localhost:3000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Production server did not start.')),
      15000,
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Production server exited (${code}). ${output}`));
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on :(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
  });
  const root = `http://127.0.0.1:${port}`;
  const page = await fetch(root);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('SubSense'));
  assert.ok(!html.includes('/@vite/client'));
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(root + asset)).status, 200);
  const config = await fetch(root + '/api/subsense/config');
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  const configuration = await config.json();
  assert.equal(configuration.authMode, 'wallet');
  assert.equal(configuration.walletAuthenticated, false);
  assert.equal('privateAccessConfigured' in configuration, false);
  assert.equal(configuration.network, 'mainnet');
  assert.equal(configuration.tatumConfigured, false);
  assert.equal(configuration.walrusConfigured, false);
  assert.equal(configuration.openaiConfigured, false);
  assert.equal(
    (await (await fetch(root + '/api/subsense/auth/session')).json())
      .authenticated,
    false,
  );
  const protectedRead = (origin) =>
    fetch(root + '/api/subsense/wallets/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ network: 'mainnet', address: '0x2' }),
    });
  assert.equal((await protectedRead('http://localhost:3000')).status, 401);
  assert.equal((await protectedRead('https://evil.example')).status, 403);
  assert.equal((await fetch(root + '/api/tatum/legacy')).status, 404);
  const bad = await fetch(root + '/api/subsense/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(bad.status, 400);
  assert.ok((await bad.json()).message.includes('Invalid JSON'));
  const large = await fetch(root + '/api/subsense/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(33000) }),
  });
  assert.equal(large.status, 413);
  const aiBody = (size) => fetch(root + '/api/subsense/ai/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ network: 'mainnet', text: 'x'.repeat(size) }),
  });
  assert.equal((await aiBody(40000)).status, 401); // AI-specific parser, still wallet-gated.
  assert.equal((await aiBody(200000)).status, 413);
  // SPA fallbacks may return HTML, but development modules must not be served.
  assert.ok(
    (await (await fetch(root + '/@vite/client')).text()).includes('<html'),
  );
  console.log(
    'Production smoke test passed: built assets, Mainnet wallet authentication/origin gates, disabled legacy/dev routes, JSON errors, and body limits.',
  );
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
}
