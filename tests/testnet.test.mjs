import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { networkConfig, requireNetwork } from '../server/subsense-network.mjs';
import {
  queryTatum,
  readSuiBalance,
  checkPaymentEvidence,
  validatePaymentInput,
} from '../server/subsense-tatum.mjs';
import {
  profileNamespace,
  submitMemory,
  memoryStatus,
  recallMemories,
  memoryClient,
} from '../server/subsense-memory.mjs';
import { createSubSenseRouter } from '../server/routes/subsense.mjs';
import {
  memoryReceipts,
  withDecisionReceipt,
  mergeDecisions,
  normalizeSuiAddress,
} from '../shared/subsense.mjs';
import {
  validateWorkspace,
} from '../src/subsense/workspace.ts';
import { sampleWorkspace } from './fixtures/sample-workspace.mjs';

const profile = '11111111-1111-4111-8111-111111111111';
const decision = {
  ...sampleWorkspace().decisions[0],
  demo: false,
  storage: 'local',
};
const digest = '11111111111111111111111111111111';
function env(values) {
  const old = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('network defaults to Mainnet, permits explicit historical networks and rejects stale requests', () => {
  const restore = env({ SUBSENSE_NETWORK: undefined });
  try {
    assert.equal(networkConfig().network, 'mainnet');
    assert.equal(
      networkConfig().tatumUrl,
      'https://sui-mainnet.gateway.tatum.io/graphql',
    );
    assert.equal(
      networkConfig().walrusUrl,
      'https://relayer.memory.walrus.xyz',
    );
    assert.equal(
      networkConfig('mainnet').tatumUrl,
      'https://sui-mainnet.gateway.tatum.io/graphql',
    );
    requireNetwork('mainnet');
    assert.throws(() => requireNetwork('testnet'), /Network changed/);
    assert.throws(() => requireNetwork(undefined), /missing/);
    for (const value of [
      '',
      'Mainnet',
      'devnet',
      '__proto__',
      'https://evil.example',
    ])
      assert.throws(() => networkConfig(value), /must be/);
    process.env.SUBSENSE_NETWORK = 'invalid';
    assert.throws(() => networkConfig(), /No network fallback/);
  } finally {
    restore();
  }
});

test('Testnet Tatum requests pin their endpoint and fail wrong key scope without fallback', async () => {
  const restore = env({
    SUBSENSE_NETWORK: 'testnet',
    TATUM_API_KEY: 'mock-testnet-key',
  });
  try {
    let calls = 0;
    await assert.rejects(
      queryTatum('query { __typename }', {}, async (url, options) => {
        calls++;
        assert.equal(url, networkConfig('testnet').tatumUrl);
        assert.equal(options.headers['x-api-key'], 'mock-testnet-key');
        assert.equal(options.redirect, 'error');
        return new Response('{}', { status: 403 });
      }),
      /HTTP 403/,
    );
    assert.equal(calls, 1);
    const result = checkPaymentEvidence(
      null,
      validatePaymentInput({
        digest,
        recipient: '0x2',
        amountSui: '0.5',
        paidOn: '2026-10-28',
      }),
    );
    assert.equal(result.network, 'testnet');
    assert.equal(result.verified, false);
  } finally {
    restore();
  }
});

test('Testnet balance reads are normalized and use exact MIST arithmetic, including zero', async () => {
  const restore = env({ SUBSENSE_NETWORK: 'testnet' });
  try {
    for (const [mist, expected] of [
      ['0', '0.000000000'],
      ['9007199254740993', '9007199.254740993'],
    ]) {
      const result = await readSuiBalance('0x2', async (query, variables) => {
        assert.match(query, /balance\(coinType: "0x2::sui::SUI"\)/);
        assert.equal(variables.address, normalizeSuiAddress('0x2'));
        return {
          address: {
            address: variables.address,
            balance: { totalBalance: mist },
          },
        };
      });
      assert.equal(result.amountSui, expected);
      assert.equal(result.network, 'testnet');
    }
    let calls = 0;
    await assert.rejects(
      readSuiBalance('bad', async () => {
        calls++;
      }),
      /Sui address/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      readSuiBalance('0x2', async () => ({
        address: { address: '0x2', balance: { totalBalance: null } },
      })),
      /complete/,
    );
  } finally {
    restore();
  }
});

test('Testnet memory namespaces and idempotency stay separate while legacy Mainnet is preserved', async () => {
  assert.equal(profileNamespace(profile, 'mainnet'), `subsense-${profile}`);
  assert.equal(
    profileNamespace(profile, 'testnet'),
    `subsense-testnet-${profile}`,
  );
  const calls = [];
  const client = {
    remember: async (...args) => {
      calls.push(args);
      return { job_id: 'job-1' };
    },
  };
  for (const network of ['testnet', 'mainnet']) {
    const result = await submitMemory(profile, decision, client, network);
    assert.equal(result.network, network);
    assert.equal(result.storage, 'pending');
  }
  assert.notEqual(calls[0][2].idempotencyKey, calls[1][2].idempotencyKey);
  assert.equal(JSON.parse(calls[0][0]).storage, undefined);
});

test('Testnet completion and recall never mint Mainnet proof and reject Mainnet jobs', async () => {
  const client = {
    getRememberStatus: async () => ({
      namespace: profileNamespace(profile, 'testnet'),
      status: 'done',
      blob_id: 'test-blob',
    }),
  };
  const result = await memoryStatus(profile, 'test-job', client, 'testnet');
  assert.equal(result.storage, 'testnet');
  assert.equal(result.network, 'testnet');
  await assert.rejects(
    memoryStatus(profile, 'test-job', client, 'mainnet'),
    /does not belong/,
  );
  const recalled = await recallMemories(
    profile,
    'subscription value',
    {
      recall: async (options) => {
        assert.equal(options.namespace, profileNamespace(profile, 'testnet'));
        return {
          results: [{ text: JSON.stringify(decision), blob_id: 'test-blob' }],
        };
      },
    },
    'testnet',
  );
  assert.equal(recalled.decisions[0].storage, 'testnet');
  assert.equal(recalled.network, 'testnet');
});

test('SDK creation is blocked when the trusted Testnet relayer reports Mainnet', async () => {
  const restore = env({
    MEMWAL_KEY: 'mock-delegate',
    MEMWAL_ACCOUNT_ID: 'mock-account',
  });
  try {
    let created = 0;
    await assert.rejects(
      memoryClient(
        'testnet',
        async (url, options) => {
          assert.equal(url, `${networkConfig('testnet').walrusUrl}/config`);
          assert.equal(options.redirect, 'error');
          return new Response(JSON.stringify({ network: 'mainnet' }));
        },
        () => {
          created++;
        },
      ),
      /network mismatch/,
    );
    assert.equal(created, 0);
  } finally {
    restore();
  }
});

test('Walrus TLS, timeout and DNS failures are actionable and never disable verification or fall back', async () => {
  const restore = env({
    MEMWAL_KEY: 'mock-delegate',
    MEMWAL_ACCOUNT_ID: 'mock-account',
  });
  try {
    for (const [code, message] of [
      [
        'ERR_TLS_CERT_ALTNAME_INVALID',
        /TLS hostname mismatch.*certificate verification remains enabled/i,
      ],
      ['CERT_HAS_EXPIRED', /TLS certificate could not be verified/],
      ['UND_ERR_CONNECT_TIMEOUT', /timed out/],
      ['ENOTFOUND', /could not be resolved/],
      ['ECONNRESET', /Could not connect securely/],
    ]) {
      let requests = 0;
      let creates = 0;
      await assert.rejects(
        memoryClient(
          'testnet',
          async (url, options) => {
            requests++;
            assert.equal(url, `${networkConfig('testnet').walrusUrl}/config`);
            assert.equal(options.redirect, 'error');
            assert.equal(options.dispatcher, undefined);
            throw new TypeError('fetch failed', {
              cause: Object.assign(new Error('mock transport failure'), {
                code,
              }),
            });
          },
          () => {
            creates++;
          },
        ),
        message,
      );
      assert.equal(requests, 1);
      assert.equal(creates, 0);
    }
  } finally {
    restore();
  }
});

test('decision merges preserve independent pending and completed receipts on both networks', () => {
  const mainnet = withDecisionReceipt(decision, {
    network: 'mainnet',
    storage: 'mainnet',
    blobId: 'main-blob',
  });
  const testnet = withDecisionReceipt(mainnet, {
    network: 'testnet',
    storage: 'pending',
    jobId: 'test-job',
  });
  assert.equal(memoryReceipts(testnet).length, 2);
  assert.equal(
    memoryReceipts(testnet).find((r) => r.network === 'testnet').blobId,
    undefined,
  );
  const merged = mergeDecisions(
    [testnet],
    [
      {
        ...decision,
        network: 'testnet',
        storage: 'testnet',
        blobId: 'test-blob',
      },
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(
    memoryReceipts(merged[0]).find((r) => r.network === 'testnet').jobId,
    undefined,
  );
  assert.deepEqual(
    memoryReceipts(merged[0]).map((r) => [r.network, r.storage, r.blobId]),
    [
      ['mainnet', 'mainnet', 'main-blob'],
      ['testnet', 'testnet', 'test-blob'],
    ],
  );
  assert.equal(memoryReceipts({ ...merged[0], demo: true }).length, 0);
});

test('workspace migration preserves old Mainnet provenance, isolates Testnet, and strips all imported proof', () => {
  const w = sampleWorkspace();
  w.sample = false;
  w.decisions = [
    { ...decision, storage: 'mainnet', blobId: 'legacy-main-blob' },
  ];
  w.payments = [
    {
      serviceId: 'figma',
      digest,
      recipient: '0x2',
      amountSui: '0.5',
      timestamp: '2026-10-28T12:00:00Z',
      checkedAt: '2026-10-28T13:00:00Z',
      provider: 'Tatum',
    },
  ];
  const migrated = validateWorkspace(w);
  assert.equal(migrated.payments[0].network, 'mainnet');
  assert.equal(memoryReceipts(migrated.decisions[0])[0].network, 'mainnet');
  migrated.decisions[0] = withDecisionReceipt(migrated.decisions[0], {
    network: 'testnet',
    storage: 'testnet',
    blobId: 'test-blob',
  });
  migrated.payments.push({ ...migrated.payments[0], network: 'testnet' });
  assert.equal(validateWorkspace(migrated).payments.length, 2);
  assert.equal(
    memoryReceipts(validateWorkspace(migrated).decisions[0]).length,
    2,
  );
  const imported = validateWorkspace(migrated, true);
  assert.equal(imported.decisions[0].storage, 'local');
  assert.equal(imported.decisions[0].receipts, undefined);
  assert.equal(imported.payments.length, 0);
  assert.equal(imported.profileId, migrated.profileId);
});

test('private API rejects missing or stale network before reads or writes and exposes read-only balance', async () => {
  const restore = env({
    SUBSENSE_NETWORK: 'testnet',
  });
  let reads = 0;
  const app = express();
  app.use(express.json());
  // Historical-network unit fixture. Mounted runtime requests use verified Mainnet sessions.
  app.use((req, _res, next) => {
    req.walletSession = { wallet: '0x2' };
    next();
  });
  app.use(
    '/api/subsense',
    createSubSenseRouter({
      queryTatum: async (_query, variables) => {
        reads++;
        return {
          address: {
            address: variables.address,
            balance: { totalBalance: '1234567890' },
          },
        };
      },
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/subsense`;
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await (await fetch(base + '/config')).json()).network,
      'testnet',
    );
    assert.equal(
      (await post('/wallets/balance', { address: '0x2', network: 'mainnet' }))
        .status,
      409,
    );
    assert.equal(
      (await post('/wallets/balance', { address: '0x2' })).status,
      409,
    );
    assert.equal(
      (
        await post('/memories', {
          profileId: profile,
          decision,
          network: 'mainnet',
        })
      ).status,
      409,
    );
    assert.equal(reads, 0);
    assert.equal(
      (
        await post('/wallets/balance', {
          address: '../bad',
          network: 'testnet',
        })
      ).status,
      400,
    );
    assert.equal(reads, 0);
    const response = await post('/wallets/balance', {
      address: '0x2',
      network: 'testnet',
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.network, 'testnet');
    assert.equal(result.amountSui, '1.234567890');
    assert.equal(reads, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});
