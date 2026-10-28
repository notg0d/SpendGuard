import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  createSessionStore,
  publicOrigin,
  sessionInfo,
} from '../server/subsense-sessions.mjs';

const origin = 'https://subsense.example';
async function signedChallenge(store, pair = Ed25519Keypair.generate()) {
  const address = pair.getPublicKey().toSuiAddress();
  const challenge = store.challenge(address, origin);
  const { signature } = await pair.signPersonalMessage(
    new TextEncoder().encode(challenge.message),
  );
  return { ...challenge, signature, address };
}

test('wallet login verifies real personal-message signatures and consumes challenges once', async () => {
  const store = createSessionStore();
  try {
    const challenge = await signedChallenge(store);
    assert.match(challenge.message, /Network: sui:mainnet/);
    assert.match(challenge.message, /does not authorize a transaction/);
    const attempts = await Promise.allSettled([
      store.login(challenge.challengeId, challenge.signature, origin),
      store.login(challenge.challengeId, challenge.signature, origin),
    ]);
    assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
    const session = attempts.find((a) => a.status === 'fulfilled').value;
    assert.equal(session.wallet, challenge.address);
    assert.equal(store.get(session.token), session);
    assert.equal(sessionInfo(session).authenticated, true);
    assert.doesNotMatch(
      JSON.stringify(sessionInfo(session)),
      new RegExp(session.token),
    );
  } finally {
    store.close();
  }
});

test('wallet login rejects another signer, changed message, wrong origin and expired challenges', async () => {
  let clock = Date.now();
  const store = createSessionStore({ now: () => clock });
  try {
    const pair = Ed25519Keypair.generate();
    const challenge = await signedChallenge(store, pair);
    const wrong = await Ed25519Keypair.generate().signPersonalMessage(
      new TextEncoder().encode(challenge.message),
    );
    await assert.rejects(
      store.login(challenge.challengeId, wrong.signature, origin),
      /verified/,
    );
    const changed = await signedChallenge(store, pair);
    const changedSignature = await pair.signPersonalMessage(
      new TextEncoder().encode(changed.message + ' altered'),
    );
    await assert.rejects(
      store.login(changed.challengeId, changedSignature.signature, origin),
      /verified/,
    );
    const cross = await signedChallenge(store, pair);
    await assert.rejects(
      store.login(cross.challengeId, cross.signature, 'https://evil.example'),
      /expired or invalid/,
    );
    const expired = await signedChallenge(store, pair);
    clock += 300001;
    await assert.rejects(
      store.login(expired.challengeId, expired.signature, origin),
      /expired or invalid/,
    );
  } finally {
    store.close();
  }
});

test('session lock, logout and expiry remove user credentials and destroy clients independently', async () => {
  let clock = Date.now();
  let destroys = 0;
  const store = createSessionStore({ now: () => clock });
  try {
    const first = await signedChallenge(store);
    const a = await store.login(first.challengeId, first.signature, origin);
    const second = await signedChallenge(store);
    const b = await store.login(second.challengeId, second.signature, origin);
    for (const session of [a, b]) {
      session.credentials = { tatumKey: 'private' };
      session.client = { destroy: () => destroys++ };
    }
    store.lock(a);
    assert.equal(a.credentials, undefined);
    assert.equal(store.get(b.token).credentials.tatumKey, 'private');
    assert.equal(destroys, 1);
    store.revoke(a.token);
    assert.equal(store.get(a.token), undefined);
    clock += 1800001;
    assert.equal(store.get(b.token), undefined);
    assert.equal(b.credentials, undefined);
    assert.equal(destroys, 2);
  } finally {
    store.close();
  }
});

test('login origin requires HTTPS outside localhost and rate/capacity limits are bounded', () => {
  assert.equal(publicOrigin(origin), origin);
  assert.equal(publicOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const value of [
    'http://subsense.example',
    'https://subsense.example/path',
    'https://name:password@subsense.example',
    'https://subsense.example/',
  ])
    assert.throws(() => publicOrigin(value));
  const store = createSessionStore({ maxChallenges: 1 });
  try {
    for (let i = 0; i < 20; i++) assert.equal(store.rateLimit('local'), true);
    assert.equal(store.rateLimit('local'), false);
    store.challenge('0x2', origin);
    assert.throws(() => store.challenge('0x3', origin), /capacity/);
  } finally {
    store.close();
  }
});
