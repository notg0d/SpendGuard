import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  createSessionStore,
  SESSION_COOKIE,
} from '../server/subsense-sessions.mjs';
import { createWalletRouter } from '../server/routes/wallet.mjs';
import { credentialGuard } from '../server/credential-guard.mjs';
import { api, setApiWallet } from '../src/subsense/api.ts';

test('locking or revoking during connection verification never installs credentials', async () => {
  for (const action of ['lock', 'revoke', 'expire']) {
    let clock = Date.now();
    const store = createSessionStore({ now: () => clock });
    const pair = Ed25519Keypair.generate();
    const wallet = pair.getPublicKey().toSuiAddress();
    const origin = 'http://localhost:3000';
    const challenge = store.challenge(wallet, origin);
    const { signature } = await pair.signPersonalMessage(
      new TextEncoder().encode(challenge.message),
    );
    const session = await store.login(challenge.challengeId, signature, origin);
    let started,
      finish,
      destroyed = 0;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const app = express();
    app.use(express.json());
    app.use(credentialGuard);
    app.use(
      '/api/subsense',
      createWalletRouter({
        store,
        origin,
        connect: async () => {
          started();
          await pending;
          return { destroy: () => destroyed++ };
        },
      }),
    );
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = fetch(
        `http://127.0.0.1:${server.address().port}/api/subsense/connections/configure`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: `${SESSION_COOKIE}=${session.token}`,
            'X-SubSense-Wallet': wallet,
          },
          body: JSON.stringify({
            network: 'mainnet',
            tatumKey: 'test-only-provider-key',
            memwalKey: '01'.repeat(32),
            accountId: '0x2',
          }),
        },
      );
      await ready;
      if (action === 'lock') store.lock(session);
      else if (action === 'revoke') store.revoke(session.token);
      else clock += 1800001;
      finish();
      assert.equal((await response).status, 401);
      assert.equal(session.credentials, undefined);
      assert.equal(session.client, undefined);
      assert.equal(destroyed, 1);
    } finally {
      finish();
      store.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('client cleanup failure cannot keep credentials or prevent revocation', async () => {
  const store = createSessionStore();
  try {
    const pair = Ed25519Keypair.generate();
    const challenge = store.challenge(
      pair.getPublicKey().toSuiAddress(),
      'http://localhost:3000',
    );
    const { signature } = await pair.signPersonalMessage(
      new TextEncoder().encode(challenge.message),
    );
    const session = await store.login(
      challenge.challengeId,
      signature,
      'http://localhost:3000',
    );
    session.credentials = { tatumKey: 'test-only-private' };
    session.client = {
      destroy() {
        throw new Error('cleanup failed');
      },
    };
    store.revoke(session.token);
    assert.equal(store.get(session.token), undefined);
    assert.equal(session.credentials, undefined);
    assert.equal(session.client, undefined);
  } finally {
    store.close();
  }
});

test('API rejects wallet switches before sending keys and ignores stale responses', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    setApiWallet('0x3');
    globalThis.fetch = async () => {
      calls++;
      throw new Error('must not send');
    };
    await assert.rejects(
      api(
        '/connections/configure',
        { network: 'mainnet', tatumKey: 'private' },
        { wallet: '0x2' },
      ),
      /Wallet changed/,
    );
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      api(
        '/connections/configure',
        {},
        { wallet: '0x3', signal: cancelled.signal },
      ),
      /abort/i,
    );
    assert.equal(calls, 0);
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers['X-SubSense-Wallet'], '0x3');
      setApiWallet('0x4');
      return new Response(JSON.stringify({ message: 'old session expired' }), {
        status: 401,
      });
    };
    // There is no window in this Node test: a stale response must not dispatch expiry.
    await assert.rejects(api('/auth/session'), /No result was applied/);
  } finally {
    globalThis.fetch = originalFetch;
    setApiWallet('');
  }
});

test('response redaction preserves binary assets and captured keys after provider lock', async () => {
  const app = express();
  app.use(credentialGuard);
  const bytes = Buffer.from([0, 128, 255, 13, 10]);
  app.get('/binary', (_req, res) =>
    res.type('application/octet-stream').send(bytes),
  );
  app.get('/locked', (_req, res) => {
    res.locals.walletSecrets = ['captured-test-only-secret'];
    res.json({ message: 'upstream captured-test-only-secret' });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const root = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(
      Buffer.from(await (await fetch(root + '/binary')).arrayBuffer()),
      bytes,
    );
    assert.equal(
      (await (await fetch(root + '/locked')).json()).message,
      'upstream [REDACTED]',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
