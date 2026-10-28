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
import {
  connectUserCredentials,
  validateUserCredentials,
} from '../server/subsense-connect.mjs';
import { credentialGuard } from '../server/credential-guard.mjs';

const owner = Ed25519Keypair.fromSecretKey(Buffer.alloc(32, 3));
const delegate = Ed25519Keypair.fromSecretKey(Buffer.alloc(32, 4));
const wallet = owner.getPublicKey().toSuiAddress();
const credentials = {
  network: 'mainnet',
  tatumKey: 'test-only-mainnet-tatum-key',
  memwalKey: '04'.repeat(32),
  accountId: '0x2',
};
const deployment = {
  network: 'mainnet',
  packageId: '0x123',
  registryId: '0x456',
};
function accountData() {
  return {
    account: {
      asMoveObject: {
        contents: {
          type: { repr: '0x123::account::MemWalAccount' },
          json: {
            owner: wallet,
            active: true,
            admin_quarantined: false,
            delegate_keys: [
              {
                public_key: Buffer.from(
                  delegate.getPublicKey().toRawBytes(),
                ).toString('base64'),
              },
            ],
          },
        },
      },
    },
    registry: {
      asMoveObject: {
        contents: { type: { repr: '0x123::account::AccountRegistry' } },
      },
    },
    deployment: { asMovePackage: {} },
  };
}

test('Mainnet connection checks owner, deployment, activation and delegate before signed metadata access', async () => {
  let data = accountData();
  let created = 0;
  let metadata = 0;
  const deps = {
    fetcher: async (url, options) => {
      assert.equal(url, 'https://relayer.memory.walrus.xyz/config');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(deployment));
    },
    query: async (_document, variables, _fetch, network, key) => {
      assert.equal(network, 'mainnet');
      assert.equal(key, credentials.tatumKey);
      assert.equal(variables.account, credentials.accountId);
      return data;
    },
    createClient: (options) => {
      created++;
      assert.equal(options.key, credentials.memwalKey);
      assert.equal(options.serverUrl, 'https://relayer.memory.walrus.xyz');
      return {
        listNamespaces: async ({ limit }) => {
          assert.equal(limit, 1);
          metadata++;
        },
        destroy() {},
      };
    },
  };
  assert.ok(await connectUserCredentials(wallet, credentials, deps));
  assert.equal(created, 1);
  assert.equal(metadata, 1);
  const variants = [
    [
      (d) => {
        d.account = null;
      },
      /No Mainnet MemWal account/,
    ],
    [
      (d) => {
        d.account.asMoveObject.contents.json.owner = '0x5';
      },
      /owns this MemWal/,
    ],
    [
      (d) => {
        d.account.asMoveObject.contents.json.active = false;
      },
      /inactive/,
    ],
    [
      (d) => {
        d.account.asMoveObject.contents.json.admin_quarantined = true;
      },
      /quarantined/,
    ],
    [
      (d) => {
        d.account.asMoveObject.contents.json.delegate_keys = [];
      },
      /delegate is not verified/,
    ],
    [
      (d) => {
        d.account.asMoveObject.contents.type.repr =
          '0x789::account::MemWalAccount';
      },
      /different MemWal deployment/,
    ],
  ];
  for (const [mutate, pattern] of variants) {
    data = accountData();
    mutate(data);
    await assert.rejects(
      connectUserCredentials(wallet, credentials, deps),
      pattern,
    );
  }
  assert.equal(created, 1);
  await assert.rejects(
    connectUserCredentials(wallet, credentials, {
      ...deps,
      fetcher: async () =>
        new Response(JSON.stringify({ ...deployment, network: 'testnet' })),
    }),
    /network mismatch/,
  );
  assert.throws(
    () => validateUserCredentials({ ...credentials, network: 'testnet' }),
    /Mainnet/,
  );
});

test('wallet API uses verified HttpOnly sessions, rejects token fallback/CSRF/Testnet, and isolates user keys', async () => {
  const store = createSessionStore();
  const origin = 'https://subsense.example';
  let reads = [];
  let destroys = 0;
  const app = express();
  app.use(express.json());
  app.use(credentialGuard);
  app.use(
    '/api/subsense',
    createWalletRouter({
      store,
      origin,
      connect: async (_wallet, values) => ({
        health: async () => {
          if (values.accountId.endsWith('0002'))
            throw new Error(`private upstream ${values.memwalKey}`);
        },
        destroy: () => destroys++,
      }),
      query: async (_document, variables, _fetch, network, key) => {
        assert.equal(network, 'mainnet');
        reads.push(key);
        return {
          address: {
            address: variables.address,
            balance: { totalBalance: '1000000000' },
          },
        };
      },
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/subsense`;
  const post = (path, body, auth = {}, requestOrigin = origin) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: requestOrigin,
        ...auth,
      },
      body: JSON.stringify(body),
    });
  async function login(pair) {
    const address = pair.getPublicKey().toSuiAddress();
    const challenge = await (
      await post('/auth/challenge', { address, network: 'mainnet' })
    ).json();
    const signed = await pair.signPersonalMessage(
      new TextEncoder().encode(challenge.message),
    );
    const response = await post('/auth/login', {
      challengeId: challenge.challengeId,
      signature: signed.signature,
      network: 'mainnet',
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/subsense/);
    const info = await response.json();
    assert.equal(info.walletAddress, address);
    assert.ok(!JSON.stringify(info).includes(SESSION_COOKIE));
    return { Cookie: cookie.split(';')[0], 'X-SubSense-Wallet': address };
  }
  try {
    const anonymous = await (await fetch(base + '/config')).json();
    assert.equal(anonymous.network, 'mainnet');
    assert.equal(anonymous.tatumConfigured, false);
    assert.equal(
      (
        await post(
          '/wallets/balance',
          { network: 'mainnet', address: '0x2' },
          { Authorization: 'Bearer test-only-app-token-123456789' },
        )
      ).status,
      401,
    );
    const a = await login(owner);
    const b = await login(Ed25519Keypair.fromSecretKey(Buffer.alloc(32, 5)));
    assert.equal(
      (await post('/connections/configure', credentials, a)).status,
      200,
    );
    assert.equal(
      (
        await post(
          '/connections/configure',
          {
            ...credentials,
            accountId: '0x3',
            tatumKey: 'another-user-mainnet-key',
          },
          b,
        )
      ).status,
      200,
    );
    const readBody = { network: 'mainnet', address: '0x2' };
    assert.equal(
      (await post('/wallets/balance', { ...readBody, network: 'testnet' }, a))
        .status,
      409,
    );
    assert.equal(
      (await post('/wallets/balance', readBody, a, 'https://evil.example'))
        .status,
      403,
    );
    assert.equal(
      (
        await post('/wallets/balance', readBody, {
          ...a,
          'X-SubSense-Wallet': b['X-SubSense-Wallet'],
        })
      ).status,
      401,
    );
    assert.equal(reads.length, 0);
    const results = await Promise.all([
      post('/wallets/balance', readBody, a),
      post('/wallets/balance', readBody, b),
    ]);
    assert.ok(results.every((response) => response.status === 200));
    assert.deepEqual(
      reads.sort(),
      [credentials.tatumKey, 'another-user-mainnet-key'].sort(),
    );
    const health = await post('/connections/test', { network: 'mainnet' }, a);
    const text = await health.text();
    assert.ok(!text.includes(credentials.memwalKey));
    assert.match(text, /REDACTED/);
    assert.equal(
      (await post('/connections/lock', { network: 'mainnet' }, a)).status,
      200,
    );
    assert.equal(
      (await (await fetch(base + '/config', { headers: a })).json())
        .walrusConfigured,
      false,
    );
    assert.equal((await post('/wallets/balance', readBody, b)).status, 200);
    assert.equal(
      (await post('/auth/logout', { network: 'mainnet' }, b)).status,
      200,
    );
    assert.equal((await post('/wallets/balance', readBody, b)).status, 401);
    assert.equal(destroys, 2);
  } finally {
    store.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
