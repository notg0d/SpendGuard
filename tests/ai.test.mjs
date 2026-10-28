import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { openAIRequest, verifyOpenAI, validateAIInput, runAI } from '../server/subsense-ai.mjs';
import { createWalletRouter } from '../server/routes/wallet.mjs';
import { createSessionStore, SESSION_COOKIE } from '../server/subsense-sessions.mjs';
import { credentialGuard } from '../server/credential-guard.mjs';
import { encryptVault, decryptVault, validateVaultCredentials } from '../src/subsense/vault.ts';
import { validateUserCredentials } from '../server/subsense-connect.mjs';

const credentials = { network: 'mainnet', tatumKey: '', memwalKey: '', accountId: '', openaiKey: 'test-only-openai-private-key', chatModel: 'gpt-4.1-mini' };
const service = { id: 'design', name: 'Design service', category: 'Design', costCents: 1500,
  cadence: 'monthly', renewsOn: '2026-11-01', usage: 'rare', importance: 'essential', workRelated: true,
  notes: 'Used for client handoffs', status: 'active' };
const decision = { app: 'subsense', version: 1, id: 'design-review', serviceId: service.id, serviceName: service.name,
  category: service.category, costCents: 1500, cadence: 'monthly', action: 'keep', value: 'essential',
  reason: 'Clients require handoffs', at: '2026-10-20T12:00:00.000Z', demo: false };
const body = { network: 'mainnet', mode: 'ask', consent: true, query: 'Why keep this service?', budgetCents: 10000,
  subscriptions: [service], decisions: [decision] };
const completed = (answer = 'Client handoffs explain the essential protection.') => ({ status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer,
    sourceIds: ['subscription:design', 'decision:design-review', 'invented-id'] }) }] }], usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 } });
const embedding = (index, axis = 0) => ({ index, embedding: Array.from({ length: 256 }, (_, i) => i === axis ? 1 : 0) });

test('OpenAI-only credentials encrypt and legacy Mainnet vaults remain compatible', async () => {
  assert.deepEqual(validateVaultCredentials(credentials), credentials);
  assert.deepEqual(validateUserCredentials(credentials), credentials);
  const serialized = await encryptVault('0x3', 'test-only-long-password', credentials);
  assert.ok(!serialized.includes(credentials.openaiKey));
  assert.deepEqual(await decryptVault('0x3', 'test-only-long-password', serialized), credentials);
  for (const invalid of [{ ...credentials, chatModel: 'custom-endpoint' }, { ...credentials, openaiKey: 'bad\nkey' },
    { ...credentials, network: 'testnet' }, { ...credentials, tatumKey: 'partial-tatum-private' },
    { ...credentials, openaiKey: '' }]) {
    assert.throws(() => validateVaultCredentials(invalid));
    assert.throws(() => validateUserCredentials(invalid));
  }
});

test('OpenAI transport pins provider, checks model access without inference and suppresses upstream secrets', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'text-embedding-3-small' }] }));
  };
  await verifyOpenAI(credentials, { fetcher });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${credentials.openaiKey}`);
  await assert.rejects(verifyOpenAI(credentials, { fetcher: async () => new Response('{"data":[]}') }), /model/);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(openAIRequest('responses', credentials.openaiKey, {}, {
      fetcher: async () => new Response(credentials.openaiKey, { status }),
    }), (error) => !error.message.includes(credentials.openaiKey) && error.status === (status === 429 ? 429 : 502));
  }
  await assert.rejects(openAIRequest('https://evil.example', credentials.openaiKey, {}, { fetcher }), /Invalid/);
  await assert.rejects(openAIRequest('responses', credentials.openaiKey, {}, { fetcher: async () => new Response('x'.repeat(4000001)) }), /safety limit/);
});

test('AI validation requires consent, bounds context, strips keys and remote proof, rejects demo data', () => {
  for (const invalid of [{ ...body, consent: false }, { ...body, query: 'x'.repeat(1001) },
    { ...body, subscriptions: Array(101).fill(service) }, { ...body, subscriptions: [service, service] },
    { ...body, subscriptions: [], decisions: [] }, { ...body, budgetCents: -1 },
    { ...body, decisions: [{ ...decision, demo: true }] }, { ...body, mode: 'pay' }])
    assert.throws(() => validateAIInput(invalid));
  const validated = validateAIInput({ ...body, openaiKey: 'secret', wallet: 'owner', payments: ['proof'],
    decisions: [{ ...decision, receipts: [{ network: 'testnet', blobId: 'historical' }], storage: 'mainnet' }],
    subscriptions: [{ ...service, tatumKey: 'secret' }] });
  assert.doesNotMatch(JSON.stringify(validated), /secret|historical|receipts|payments|owner|storage/);
});

test('AI advice uses authoritative rules, no tools/store and only supplied source references', async () => {
  for (const mode of ['ask', 'explain', 'plan']) {
    let calls = 0;
    const result = await runAI(validateAIInput({ ...body, mode }), { credentials }, {
      request: async (path, key, payload) => {
        calls++;
        assert.equal(path, 'responses'); assert.equal(key, credentials.openaiKey);
        assert.equal(payload.store, false); assert.equal(payload.tools, undefined);
        assert.equal(payload.max_output_tokens, 1800);
        const input = JSON.parse(payload.input);
        assert.equal(input.deterministicTotals.monthly, 1500);
        assert.equal(input.deterministicRules[0].action, 'keep');
        assert.equal(input.task, mode);
        assert.match(payload.instructions, /untrusted/);
        assert.ok(!payload.input.includes(credentials.openaiKey));
        return completed();
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.sources.map((s) => s.id), ['subscription:design', 'decision:design-review']);
    assert.equal(result.totals.headroom, 8500);
    assert.equal(result.network, 'mainnet');
  }
  await assert.rejects(runAI(validateAIInput(body), { credentials }, { request: async () => ({ status: 'incomplete' }) }), /did not finish/);
  await assert.rejects(runAI(validateAIInput(body), { credentials: {} }), /Unlock/);
  await assert.rejects(runAI(validateAIInput({ ...body, query: credentials.openaiKey }), { credentials }, {
    request: async () => { throw new Error('Must not send secrets'); },
  }), /credential/);
});

test('semantic search validates vectors, ranks context, reuses wallet-session cache and invalidates edits', async () => {
  const session = { credentials };
  let inputLengths = [];
  const request = async (path, _key, payload) => {
    assert.equal(path, 'embeddings'); assert.equal(payload.model, 'text-embedding-3-small');
    assert.equal(payload.dimensions, 256);
    inputLengths.push(payload.input.length);
    return { data: payload.input.map((_, i) => embedding(i, i === 1 ? 1 : 0)), usage: { total_tokens: 24 } };
  };
  const input = validateAIInput({ ...body, mode: 'search' });
  const result = await runAI(input, session, { request });
  assert.equal(result.matches[0].id, 'decision:design-review');
  assert.equal(result.matches[0].score, 1);
  await runAI(input, session, { request });
  await runAI(validateAIInput({ ...body, mode: 'search', subscriptions: [{ ...service, notes: 'Edited context' }] }), session, { request });
  assert.deepEqual(inputLengths, [3, 1, 2]);
  await runAI(input, { credentials }, { request });
  assert.equal(inputLengths.at(-1), 3);
  await assert.rejects(runAI(input, session, { request: async () => ({ data: [{ ...embedding(0), embedding: [NaN] }] }) }), /invalid embeddings/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runAI(input, session, { request, signal: controller.signal }), /abort/i);
});

test('wallet AI routes gate identity/origin/network/consent, isolate keys, rate-limit and abort on lock', async () => {
  const store = createSessionStore();
  const origin = 'http://localhost:3000';
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const pair = Ed25519Keypair.generate();
    const challenge = store.challenge(pair.getPublicKey().toSuiAddress(), origin);
    const signed = await pair.signPersonalMessage(new TextEncoder().encode(challenge.message));
    sessions.push(await store.login(challenge.challengeId, signed.signature, origin));
  }
  let paidCalls = 0, connects = 0, verifying = 0;
  let hold, release, started;
  const app = express(); app.use(express.json()); app.use(credentialGuard);
  app.use('/api/subsense', createWalletRouter({ store, origin,
    connect: async () => { connects++; throw new Error('Must not need MemWal'); },
    verifyAI: async () => { verifying++; },
    aiRequest: async (_path, key, _body, { signal }) => {
      paidCalls++;
      if (hold) { started(); await hold; }
      signal.throwIfAborted();
      return completed(`Safe answer ${key}`); // Redaction regression.
    },
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/subsense`;
  const headers = (session) => ({ 'Content-Type': 'application/json', Origin: origin,
    Cookie: `${SESSION_COOKIE}=${session.token}`, 'X-SubSense-Wallet': session.wallet });
  const post = (path, data, session = sessions[0], extra = {}) => fetch(base + path, {
    method: 'POST', headers: { ...(session ? headers(session) : { 'Content-Type': 'application/json', Origin: origin }), ...extra }, body: JSON.stringify(data),
  });
  try {
    assert.equal((await post('/ai/run', body, null)).status, 401);
    assert.equal((await post('/ai/run', body)).status, 409);
    assert.equal((await post('/connections/configure', credentials)).status, 200);
    assert.equal(verifying, 1); assert.equal(connects, 0); assert.equal(paidCalls, 0);
    const info = await (await fetch(base + '/config', { headers: headers(sessions[0]) })).json();
    assert.equal(info.openaiConfigured, true); assert.equal(info.tatumConfigured, false); assert.equal(info.walrusConfigured, false);
    assert.equal((await post('/ai/run', { ...body, network: 'testnet' })).status, 409);
    assert.equal((await post('/ai/run', body, sessions[0], { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/ai/run', body, sessions[0], { 'X-SubSense-Wallet': sessions[1].wallet })).status, 401);
    assert.equal((await post('/ai/run', { ...body, consent: false })).status, 400);
    assert.equal((await post('/ai/run', body, sessions[1])).status, 409);
    assert.equal(paidCalls, 0);
    const answer = await (await post('/ai/run', body)).text();
    assert.ok(!answer.includes(credentials.openaiKey)); assert.match(answer, /REDACTED/);
    assert.equal(paidCalls, 1);
    for (let i = 0; i < 11; i++) assert.equal((await post('/ai/run', body)).status, 200);
    assert.equal((await post('/ai/run', body)).status, 429);
    assert.equal(paidCalls, 12);
    sessions[0].aiRate = undefined;
    hold = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { started = resolve; });
    const pending = post('/ai/run', body); await ready;
    assert.equal((await post('/ai/run', body)).status, 409);
    assert.equal((await post('/connections/configure', credentials)).status, 409);
    const signal = sessions[0].aiController.signal;
    sessions[0].aiCache = new Map([['hash', [1]]]);
    assert.equal((await post('/connections/lock', { network: 'mainnet' })).status, 200);
    assert.equal(signal.aborted, true); assert.equal(sessions[0].aiCache.size, 0);
    assert.equal(sessions[0].credentials, undefined);
    release(); assert.equal((await pending).status, 502);
    assert.equal((await post('/ai/run', body)).status, 409);
    assert.equal((await post('/connections/configure', credentials, sessions[1])).status, 200);
    assert.equal((await post('/ai/run', body, sessions[1])).status, 200);
    store.revoke(sessions[1].token);
    assert.equal((await post('/ai/run', body, sessions[1])).status, 401);
  } finally {
    release?.(); store.close(); await new Promise((resolve) => server.close(resolve));
  }
});
