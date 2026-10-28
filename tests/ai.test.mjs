import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { openRouterRequest, verifyOpenRouter, validateAIInput, runAI } from '../server/subsense-ai.mjs';
import { DEFAULT_CHAT_MODEL, CHAT_MODELS, EMBEDDING_MODEL } from '../shared/ai.mjs';
import { createWalletRouter } from '../server/routes/wallet.mjs';
import { createSessionStore, SESSION_COOKIE } from '../server/subsense-sessions.mjs';
import { credentialGuard } from '../server/credential-guard.mjs';
import { encryptVault, decryptVault, validateVaultCredentials } from '../src/subsense/vault.ts';
import { validateUserCredentials } from '../server/subsense-connect.mjs';

const credentials = { network: 'mainnet', tatumKey: '', memwalKey: '', accountId: '', openrouterKey: 'test-only-openrouter-private-key', chatModel: DEFAULT_CHAT_MODEL };
const service = { id: 'design', name: 'Design service', category: 'Design', costCents: 1500,
  cadence: 'monthly', renewsOn: '2026-11-01', usage: 'rare', importance: 'essential', workRelated: true,
  notes: 'Used for client handoffs', status: 'active' };
const decision = { app: 'subsense', version: 1, id: 'design-review', serviceId: service.id, serviceName: service.name,
  category: service.category, costCents: 1500, cadence: 'monthly', action: 'keep', value: 'essential',
  reason: 'Clients require handoffs', at: '2026-10-20T12:00:00.000Z', demo: false };
const body = { network: 'mainnet', mode: 'ask', consent: true, query: 'Why keep this service?', budgetCents: 10000,
  subscriptions: [service], decisions: [decision] };
const completed = (answer = 'Client handoffs explain the essential protection.') => ({ choices: [{ finish_reason: 'stop',
  message: { role: 'assistant', content: JSON.stringify({ answer,
    sourceIds: ['subscription:design', 'decision:design-review', 'invented-id'] }) } }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } });
const embedding = (index, axis = 0) => ({ index, embedding: Array.from({ length: 256 }, (_, i) => i === axis ? 1 : 0) });

test('free AI-only credentials encrypt and retired provider keys cannot be reinterpreted', async () => {
  assert.deepEqual(validateVaultCredentials(credentials), credentials);
  assert.deepEqual(validateUserCredentials(credentials), credentials);
  const serialized = await encryptVault('0x3', 'test-only-long-password', credentials);
  assert.ok(!serialized.includes(credentials.openrouterKey));
  assert.deepEqual(await decryptVault('0x3', 'test-only-long-password', serialized), credentials);
  for (const invalid of [{ ...credentials, chatModel: 'custom-endpoint' }, { ...credentials, openrouterKey: 'bad\nkey' },
    { ...credentials, network: 'testnet' }, { ...credentials, tatumKey: 'partial-tatum-private' },
    { ...credentials, openrouterKey: '' }, { ...credentials, openaiKey: 'legacy-private-key' },
    { ...credentials, chatModel: DEFAULT_CHAT_MODEL.replace(':free', '') }]) {
    assert.throws(() => validateVaultCredentials(invalid));
    assert.throws(() => validateUserCredentials(invalid));
  }
});

test('OpenRouter transport authenticates key, verifies free catalogs without inference and suppresses upstream secrets', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: url.endsWith('/key') ? { is_management_key: false } :
      [{ id: DEFAULT_CHAT_MODEL, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format', 'structured_outputs'] },
        { id: EMBEDDING_MODEL, pricing: { prompt: '0', completion: '0' } }] }));
  };
  await verifyOpenRouter(credentials, { fetcher });
  assert.deepEqual(calls.map((c) => c.url), ['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/embeddings/models']);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${credentials.openrouterKey}`);
  await assert.rejects(verifyOpenRouter(credentials, { fetcher: async () => new Response('{"data":{}}') }), /model/);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
      fetcher: async () => new Response(credentials.openrouterKey, { status }),
    }), (error) => !error.message.includes(credentials.openrouterKey) && error.status === (status === 429 ? 429 : 502));
  }
  await assert.rejects(openRouterRequest('https://evil.example', credentials.openrouterKey, {}, { fetcher }), /Invalid/);
  await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, { fetcher: async () => new Response('x'.repeat(4000001)) }), /safety limit/);
  await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: 'paid-model' }, { fetcher }), /free models/);
  await openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL, provider: { max_price: { prompt: 100 } } }, { fetcher });
  const sent = JSON.parse(calls.at(-1).options.body);
  assert.equal(sent.provider.allow_fallbacks, false);
  assert.equal(sent.provider.data_collection, 'deny');
  assert.deepEqual(sent.provider.max_price, { prompt: '0', completion: '0', request: '0', image: '0' });
});

test('OpenRouter errors distinguish routing, privacy, output, account and outages without disclosing upstream text', async () => {
  const scenarios = [
    [400, 'REQUEST_REJECTED'], [401, 'KEY_REJECTED'], [402, 'ACCOUNT_LIMIT'], [403, 'ACCESS_BLOCKED'],
    [404, 'NO_FREE_ENDPOINT'], [408, 'PROVIDER_TIMEOUT'], [413, 'CONTEXT_TOO_LARGE'],
    [422, 'REQUEST_REJECTED'], [429, 'FREE_QUOTA'], [500, 'PROVIDER_UNAVAILABLE'],
    [502, 'PROVIDER_UNAVAILABLE'], [503, 'NO_FREE_ENDPOINT'], [504, 'PROVIDER_TIMEOUT'],
    [524, 'PROVIDER_TIMEOUT'], [529, 'PROVIDER_BUSY'],
    [404, 'PRIVACY_BLOCKED', 'No endpoints found that match your data policy.'],
    [404, 'OUTPUT_UNSUPPORTED', 'No endpoints found that support structured output.'],
    [503, 'OUTPUT_UNSUPPORTED', 'No providers support all requested parameters.'],
    [503, 'PROVIDER_BUSY', 'Busy', { error_type: 'provider_overloaded' }],
    [403, 'CONTENT_BLOCKED', 'Flagged', { error_type: 'content_policy_violation' }],
    [403, 'ACCOUNT_LIMIT', 'Budget exceeded', { limit_source: 'openrouter_key_limit' }],
    [400, 'CONTEXT_TOO_LARGE', 'Too long', { error_type: 'context_length_exceeded' }],
  ];
  for (const [status, code, message = 'Private upstream error', metadata = {}] of scenarios) {
    let calls = 0;
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
      fetcher: async () => {
        calls++;
        return new Response(JSON.stringify({ error: { code: status,
          message: `${message} ${credentials.openrouterKey} ${service.notes}`,
          metadata: { ...metadata, raw: credentials.openrouterKey, flagged_input: service.notes } },
          user_id: 'private-provider-user', id: 'private-request-id' }), { status });
      },
    }), (error) => {
      assert.deepEqual(error.diagnostic, { code, upstreamStatus: status });
      assert.equal(error.status, code === 'FREE_QUOTA' ? 429 : 502);
      assert.match(error.message, new RegExp(`OpenRouter HTTP ${status}`));
      assert.match(error.message, /No automatic retry or paid fallback/);
      for (const secret of [credentials.openrouterKey, service.notes, 'private-provider-user', 'private-request-id'])
        assert.ok(!JSON.stringify(error).includes(secret) && !error.message.includes(secret));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('malformed, oversized and unreadable OpenRouter error bodies are bounded and fall back to HTTP classification', async () => {
  for (const content of ['', '<html>Private gateway error</html>', 'x'.repeat(16385)]) {
    await assert.rejects(openRouterRequest('embeddings', credentials.openrouterKey, { model: EMBEDDING_MODEL }, {
      fetcher: async () => new Response(content, { status: 503 }),
    }), (error) => error.diagnostic?.code === 'NO_FREE_ENDPOINT' && error.diagnostic.upstreamStatus === 503);
  }
  let pulls = 0, cancelled = false;
  await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
    fetcher: async () => new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(16385)); },
      cancel() { cancelled = true; },
    }), { status: 400 }),
  }), (error) => error.diagnostic?.code === 'REQUEST_REJECTED');
  assert.equal(cancelled, true); assert.ok(pulls <= 2);
  await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
    fetcher: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(credentials.openrouterKey)); } }), { status: 502 }),
  }), (error) => error.diagnostic?.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes(credentials.openrouterKey));
});

test('OpenRouter HTTP-200 error envelopes and choice errors cannot become advice or embeddings', async () => {
  for (const path of ['chat/completions', 'embeddings']) {
    for (const envelope of [
      { error: { code: 429, message: credentials.openrouterKey } },
      { choices: [{ finish_reason: 'error', error: { code: 429, message: credentials.openrouterKey } }] },
      { choices: completed().choices, error: { code: 429, message: credentials.openrouterKey } },
    ]) {
      await assert.rejects(openRouterRequest(path, credentials.openrouterKey, {
        model: path === 'embeddings' ? EMBEDDING_MODEL : DEFAULT_CHAT_MODEL,
      }, { fetcher: async () => new Response(JSON.stringify(envelope)) }), (error) => {
        assert.equal(error.status, 429);
        assert.deepEqual(error.diagnostic, { code: 'FREE_QUOTA', upstreamStatus: 200 });
        assert.ok(!error.message.includes(credentials.openrouterKey));
        return true;
      });
    }
  }
  for (const code of [credentials.openrouterKey, null, 999999, 200])
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
      fetcher: async () => new Response(JSON.stringify({ error: { code, message: credentials.openrouterKey } })),
    }), (error) => error.diagnostic?.code === 'PROVIDER_UNAVAILABLE');
});

test('both inference transports enforce decimal-string zero caps and retain strict privacy and output routing', async () => {
  for (const path of ['chat/completions', 'embeddings']) {
    let calls = 0;
    await openRouterRequest(path, credentials.openrouterKey, {
      model: path === 'embeddings' ? EMBEDDING_MODEL : DEFAULT_CHAT_MODEL,
      provider: { data_collection: 'allow', allow_fallbacks: true, require_parameters: false, max_price: { request: '100' } },
      ...(path === 'chat/completions' ? { response_format: { type: 'json_schema' } } : {}),
    }, { fetcher: async (_url, options) => {
      calls++;
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.provider, { allow_fallbacks: false, require_parameters: true, data_collection: 'deny',
        max_price: { prompt: '0', completion: '0', request: '0', image: '0' } });
      if (path === 'chat/completions') assert.equal(payload.response_format.type, 'json_schema');
      assert.equal(options.redirect, 'error');
      return new Response('{}');
    } });
    assert.equal(calls, 1);
  }
});

test('demo privacy opt-in is strictly boolean and still requires separate request consent', async () => {
  assert.equal(validateAIInput(body).allowDataCollection, false);
  assert.equal(validateAIInput({ ...body, allowDataCollection: false }).allowDataCollection, false);
  assert.equal(validateAIInput({ ...body, allowDataCollection: true }).allowDataCollection, true);
  assert.equal(validateAIInput({ ...body, provider: { data_collection: 'allow' } }).allowDataCollection, false);
  for (const allowDataCollection of ['true', 1, null, {}, []]) {
    assert.throws(() => validateAIInput({ ...body, allowDataCollection }), /privacy option/);
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
      allowDataCollection, fetcher: async () => assert.fail('Invalid privacy choice must not send'),
    }), /privacy choice/);
  }
  assert.throws(() => validateAIInput({ ...body, consent: false, allowDataCollection: true }), /Confirm sharing/);
  await assert.rejects(openRouterRequest('models', credentials.openrouterKey, undefined, {
    allowDataCollection: true, fetcher: async () => assert.fail('Catalog checks cannot opt in'),
  }), /privacy choice/);
});

test('demo opt-in reaches both transports once, preserves all free-only constraints and never sticks to a session', async () => {
  const session = { credentials };
  for (const mode of ['ask', 'explain', 'plan', 'search']) {
    const policies = [];
    const request = (path, key, payload, options) => openRouterRequest(path, key, payload, {
      ...options, fetcher: async (_url, fetchOptions) => {
        const sent = JSON.parse(fetchOptions.body);
        policies.push(sent.provider.data_collection);
        assert.equal(sent.provider.allow_fallbacks, false);
        assert.equal(sent.provider.require_parameters, true);
        assert.deepEqual(sent.provider.max_price, { prompt: '0', completion: '0', request: '0', image: '0' });
        assert.equal(sent.model, mode === 'search' ? EMBEDDING_MODEL : DEFAULT_CHAT_MODEL);
        assert.equal(sent.allowDataCollection, undefined);
        for (const field of ['models', 'plugins', 'tools', 'route']) assert.equal(sent[field], undefined);
        if (mode !== 'search') assert.equal(sent.response_format.type, 'json_schema');
        return new Response(JSON.stringify(mode === 'search'
          ? { data: sent.input.map((_, index) => embedding(index)) } : completed()));
      },
    });
    for (const allowDataCollection of [false, true, false]) {
      const result = await runAI(validateAIInput({ ...body, mode, allowDataCollection }), session, { request });
      assert.equal(result.dataCollection, allowDataCollection ? 'allow' : 'deny');
      assert.equal(session.allowDataCollection, undefined);
      assert.equal(session.credentials.allowDataCollection, undefined);
    }
    assert.deepEqual(policies, ['deny', 'allow', 'deny']);
  }
});

test('embedding cache entries stay separate across strict and demo-data requests', async () => {
  const session = { credentials };
  const lengths = [];
  const request = async (_path, _key, payload, options) => {
    lengths.push(payload.input.length);
    assert.equal(payload.provider.data_collection, options.allowDataCollection ? 'allow' : 'deny');
    return { data: payload.input.map((_, index) => embedding(index)) };
  };
  for (const allowDataCollection of [false, true, false, true])
    await runAI(validateAIInput({ ...body, mode: 'search', allowDataCollection }), session, { request });
  assert.deepEqual(lengths, [3, 3, 1, 1]);
  assert.equal(session.aiCache.size, 4);
});

test('privacy errors after demo opt-in explain that account policies cannot be overridden and do not retry', async () => {
  let calls = 0;
  await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
    allowDataCollection: true, fetcher: async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: 404,
        message: `No endpoints found that match your data policy. ${credentials.openrouterKey}` } }), { status: 404 });
    },
  }), (error) => {
    assert.equal(error.diagnostic.code, 'PRIVACY_BLOCKED');
    assert.match(error.message, /cannot override account Privacy/);
    assert.doesNotMatch(error.message, /has not relaxed/);
    assert.ok(!error.message.includes(credentials.openrouterKey));
    return true;
  });
  assert.equal(calls, 1);
});

test('transport cancellation and timeout errors never disclose abort reasons or retry', async () => {
  for (const reason of [new Error(credentials.openrouterKey), new DOMException('Private timeout detail', 'TimeoutError')]) {
    const controller = new AbortController();
    controller.abort(reason);
    let calls = 0;
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey, { model: DEFAULT_CHAT_MODEL }, {
      signal: controller.signal, fetcher: async () => { calls++; assert.fail('Aborted requests must not send'); },
    }), (error) => {
      assert.match(error.message, reason.name === 'TimeoutError' ? /timed out/ : /interrupted/);
      assert.ok(!error.message.includes(credentials.openrouterKey));
      assert.ok(!error.message.includes('Private timeout detail'));
      return true;
    });
    assert.equal(calls, 0);
  }
});

test('AI validation requires consent, bounds context, strips keys and remote proof, rejects demo data', () => {
  for (const invalid of [{ ...body, consent: false }, { ...body, query: 'x'.repeat(1001) },
    { ...body, subscriptions: Array(101).fill(service) }, { ...body, subscriptions: [service, service] },
    { ...body, subscriptions: [], decisions: [] }, { ...body, budgetCents: -1 },
    { ...body, decisions: [{ ...decision, demo: true }] }, { ...body, mode: 'pay' }])
    assert.throws(() => validateAIInput(invalid));
  const validated = validateAIInput({ ...body, openrouterKey: 'secret', wallet: 'owner', payments: ['proof'],
    decisions: [{ ...decision, receipts: [{ network: 'testnet', blobId: 'historical' }], storage: 'mainnet' }],
    subscriptions: [{ ...service, tatumKey: 'secret' }] });
  assert.doesNotMatch(JSON.stringify(validated), /secret|historical|receipts|payments|owner|storage/);
});

test('free catalog verification fails closed on changed prices, missing capabilities or management keys', async () => {
  for (const scenario of ['paid-chat', 'paid-embedding', 'missing-price', 'request-fee', 'no-schema', 'management']) {
    let inference = 0;
    const fetcher = async (url) => {
      if (!['key', 'models', 'embeddings/models'].some((path) => url.endsWith('/' + path))) inference++;
      if (url.endsWith('/key')) return new Response(JSON.stringify({ data: { is_management_key: scenario === 'management' } }));
      const isEmbedding = url.endsWith('/embeddings/models');
      return new Response(JSON.stringify({ data: [{ id: isEmbedding ? EMBEDDING_MODEL : DEFAULT_CHAT_MODEL,
        supported_parameters: scenario === 'no-schema' ? ['response_format'] : ['response_format', 'structured_outputs'],
        pricing: scenario === 'missing-price' ? {} : { prompt: scenario === (isEmbedding ? 'paid-embedding' : 'paid-chat') ? '0.01' : '0',
          completion: '0', ...(scenario === 'request-fee' ? { request: '0.1' } : {}) } }] }));
    };
    await assert.rejects(verifyOpenRouter(credentials, { fetcher }), /free|management/);
    assert.equal(inference, 0);
  }
});

test('transport rejects fallback arrays, plugins and tools before any provider call', async () => {
  for (const field of ['models', 'plugins', 'tools', 'route']) {
    await assert.rejects(openRouterRequest('chat/completions', credentials.openrouterKey,
      { model: DEFAULT_CHAT_MODEL, [field]: ['paid-model'] }, { fetcher: async () => assert.fail('Must not send') }), /disabled/);
  }
  await assert.rejects(openRouterRequest('embeddings', credentials.openrouterKey,
    { model: 'paid-embedding' }, { fetcher: async () => assert.fail('Must not send') }), /free models/);
});

test('decrypting a retired-provider vault preserves ciphertext and gives explicit replacement instructions', async () => {
  const password = 'test-only-long-password';
  const envelope = JSON.parse(await encryptVault('0x3', password, credentials));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(envelope.salt, 'base64'),
    iterations: envelope.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(`subsense:vault:1:mainnet:${envelope.wallet}`) }, key,
    new TextEncoder().encode(JSON.stringify({ ...credentials, openrouterKey: undefined, openaiKey: 'test-only-retired-key', chatModel: 'retired-model' })));
  const saved = JSON.stringify({ ...envelope, iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') });
  await assert.rejects(decryptVault('0x3', password, saved), /retired AI provider.*Replace credentials.*not changed/);
  assert.doesNotMatch(saved, /test-only-retired-key/);
  await assert.rejects(decryptVault('0x3', 'incorrect-long-password', saved), /could not be unlocked/);
});

test('every free chat model returns validated advice and rejects malformed/refused/tool output', async () => {
  for (const model of CHAT_MODELS) {
    await runAI(validateAIInput(body), { credentials: { ...credentials, chatModel: model } }, {
      request: async (_path, _key, payload) => {
        assert.equal(payload.model, model);
        assert.equal(payload.response_format.type, model.includes('flint') ? 'json_object' : 'json_schema');
        return completed();
      },
    });
  }
  const invalid = [null, {}, { answer: 'ok', sourceIds: 'not-array' }, { answer: 'ok', sourceIds: [], execute: 'pay' },
    { answer: 'ok', sourceIds: [123] }, { answer: 'ok', sourceIds: Array(101).fill('x') }, { answer: '', sourceIds: [] }];
  for (const advice of invalid) await assert.rejects(runAI(validateAIInput(body), { credentials }, {
    request: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(advice) } }] }),
  }), /invalid advice/);
  for (const message of [{ content: 'not-json' }, { content: '{}', tool_calls: [{}] }, { refusal: 'Refused', content: '{}' }])
    await assert.rejects(runAI(validateAIInput(body), { credentials }, {
      request: async () => ({ choices: [{ finish_reason: 'stop', message }] }),
    }), /usable advice|did not finish/);
});

test('AI advice uses authoritative rules, no tools or paid fallback and only supplied references', async () => {
  for (const mode of ['ask', 'explain', 'plan']) {
    let calls = 0;
    const result = await runAI(validateAIInput({ ...body, mode }), { credentials }, {
      request: async (path, key, payload) => {
        calls++;
        assert.equal(path, 'chat/completions'); assert.equal(key, credentials.openrouterKey);
        assert.equal(payload.tools, undefined); assert.equal(payload.models, undefined);
        assert.equal(payload.provider.allow_fallbacks, false); assert.equal(payload.provider.max_price.prompt, '0');
        assert.equal(payload.max_tokens, 1800);
        const input = JSON.parse(payload.messages[1].content);
        assert.equal(input.deterministicTotals.monthly, 1500);
        assert.equal(input.deterministicRules[0].action, 'keep');
        assert.equal(input.task, mode);
        assert.match(payload.messages[0].content, /untrusted/);
        assert.ok(!payload.messages[1].content.includes(credentials.openrouterKey));
        return completed();
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.sources.map((s) => s.id), ['subscription:design', 'decision:design-review']);
    assert.equal(result.totals.headroom, 8500);
    assert.equal(result.network, 'mainnet');
  }
  await assert.rejects(runAI(validateAIInput(body), { credentials }, { request: async () => ({ choices: [{ finish_reason: 'length' }] }) }), /did not finish/);
  await assert.rejects(runAI(validateAIInput(body), { credentials: {} }), /Unlock/);
  await assert.rejects(runAI(validateAIInput({ ...body, query: credentials.openrouterKey }), { credentials }, {
    request: async () => { throw new Error('Must not send secrets'); },
  }), /credential/);
});

test('semantic search validates vectors, ranks context, reuses wallet-session cache and invalidates edits', async () => {
  const session = { credentials };
  let inputLengths = [];
  const request = async (path, _key, payload) => {
    assert.equal(path, 'embeddings'); assert.equal(payload.model, EMBEDDING_MODEL);
    assert.equal(payload.dimensions, undefined); assert.equal(payload.provider.max_price.prompt, '0');
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

test('native embedding dimensions are bounded, cache changes fail closed and vectors stay session-bounded', async () => {
  const input = validateAIInput({ ...body, mode: 'search' });
  const session = { credentials };
  const response = (dimensions) => async (_path, _key, payload) => ({ data: payload.input.map((_, index) => ({ index,
    embedding: Array.from({ length: dimensions }, (_, i) => i === 0 ? 1 : 0) })) });
  await runAI(input, session, { request: response(1024) });
  assert.ok([...session.aiCache.values()].every((v) => v instanceof Float32Array && v.length === 1024));
  await assert.rejects(runAI(input, session, { request: response(2048) }), /dimensions changed/);
  assert.equal(session.aiCache.size, 0);
  await runAI(input, session, { request: response(2048) });
  for (let i = 0; i < 301; i++) session.aiCache.set(`unused-${i}`, new Float32Array(2048));
  await runAI(input, session, { request: response(2048) });
  assert.equal(session.aiCache.size, 300);
  for (const dimensions of [0, 4097])
    await assert.rejects(runAI(input, { credentials }, { request: response(dimensions) }), /invalid embeddings/);
  for (const data of [[null, null, null], [embedding(0), embedding(0), embedding(2)],
    [embedding(0), { index: 1, embedding: [1] }, embedding(2)],
    [{ index: 0, embedding: Array(256).fill(1e7) }, embedding(1), embedding(2)]])
    await assert.rejects(runAI(input, { credentials }, { request: async () => ({ data }) }), /invalid embeddings/);
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
    assert.equal((await post('/connections/configure', { ...credentials, openaiKey: 'retired-private-key' })).status, 400);
    assert.equal(verifying, 1); assert.equal(sessions[0].credentials.openrouterKey, credentials.openrouterKey);
    const info = await (await fetch(base + '/config', { headers: headers(sessions[0]) })).json();
    assert.equal(info.aiConfigured, true); assert.equal(info.tatumConfigured, false); assert.equal(info.walrusConfigured, false);
    assert.equal((await post('/ai/run', { ...body, network: 'testnet' })).status, 409);
    assert.equal((await post('/ai/run', body, sessions[0], { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/ai/run', body, sessions[0], { 'X-SubSense-Wallet': sessions[1].wallet })).status, 401);
    assert.equal((await post('/ai/run', { ...body, consent: false })).status, 400);
    assert.equal((await post('/ai/run', body, sessions[1])).status, 409);
    assert.equal(paidCalls, 0);
    const answer = await (await post('/ai/run', body)).text();
    assert.ok(!answer.includes(credentials.openrouterKey)); assert.match(answer, /REDACTED/);
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

test('authenticated AI route returns only safe provider diagnostics and releases the busy gate after failure', async () => {
  const store = createSessionStore();
  const origin = 'http://localhost:3000';
  const pair = Ed25519Keypair.generate();
  const challenge = store.challenge(pair.getPublicKey().toSuiAddress(), origin);
  const signed = await pair.signPersonalMessage(new TextEncoder().encode(challenge.message));
  const session = await store.login(challenge.challengeId, signed.signature, origin);
  session.credentials = credentials;
  let status = 404;
  const policies = [];
  const app = express(); app.use(express.json()); app.use(credentialGuard);
  app.use('/api/subsense', createWalletRouter({ store, origin, aiRequest: (path, key, payload, options) => {
    policies.push(payload.provider.data_collection);
    return openRouterRequest(path, key, payload, { ...options, fetcher: async () => status === 200
      ? new Response(JSON.stringify(completed()))
      : new Response(JSON.stringify({ error: { code: status,
        message: `No endpoints found that match your data policy. ${key}`,
        metadata: { raw: key, flagged_input: service.notes } } }), { status }) });
    },
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const post = (input = body) => fetch(`http://127.0.0.1:${server.address().port}/api/subsense/ai/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
      Cookie: `${SESSION_COOKIE}=${session.token}`, 'X-SubSense-Wallet': session.wallet }, body: JSON.stringify(input),
  });
  try {
    const response = await post();
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.deepEqual(result.diagnostic, { code: 'PRIVACY_BLOCKED', upstreamStatus: 404 });
    assert.match(result.message, /has not relaxed/);
    assert.deepEqual(Object.keys(result).sort(), ['diagnostic', 'message']);
    assert.ok(!JSON.stringify(result).includes(credentials.openrouterKey));
    assert.ok(!JSON.stringify(result).includes(service.notes));
    assert.equal(session.aiBusy, false); assert.equal(session.aiController, undefined);
    status = 200;
    assert.equal((await post({ ...body, allowDataCollection: true, consent: false })).status, 400);
    assert.equal((await post({ ...body, allowDataCollection: 'true' })).status, 400);
    const optedIn = await (await post({ ...body, allowDataCollection: true })).json();
    assert.equal(optedIn.dataCollection, 'allow');
    assert.equal((await post()).status, 200);
    assert.deepEqual(policies, ['deny', 'allow', 'deny']);
  } finally { store.close(); await new Promise((resolve) => server.close(resolve)); }
});
