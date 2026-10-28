import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  encryptVault,
  decryptVault,
  readVault,
  writeVault,
  forgetVault,
} from '../src/subsense/vault.ts';
import {
  rawBackup,
  readWorkspace,
  saveWorkspace,
  freshWorkspace,
} from '../src/subsense/workspace.ts';

const credentials = {
  network: 'mainnet',
  tatumKey: 'test-only-tatum-private',
  memwalKey: '01'.repeat(32),
  accountId: '0x2',
};
const password = 'a-strong-test-only-password';

test('credential vault encrypts with fresh nonces and authenticates password, wallet, network and ciphertext', async () => {
  const encrypted = await encryptVault('0x3', password, credentials);
  const repeated = await encryptVault('0x3', password, credentials);
  assert.notEqual(encrypted, repeated);
  assert.ok(!encrypted.includes(credentials.tatumKey));
  assert.ok(!encrypted.includes(credentials.memwalKey));
  assert.ok(!encrypted.includes(password));
  const result = await decryptVault('0x3', password, encrypted);
  assert.equal(result.tatumKey, credentials.tatumKey);
  assert.equal(result.memwalKey, credentials.memwalKey);
  await assert.rejects(
    decryptVault('0x3', 'wrong-but-long-password', encrypted),
    /could not be unlocked/,
  );
  await assert.rejects(
    decryptVault('0x4', password, encrypted),
    /could not be unlocked/,
  );
  for (const [key, value] of [
    ['network', 'testnet'],
    ['iterations', 1],
    ['ciphertext', 'AAAA'],
  ]) {
    await assert.rejects(
      decryptVault(
        '0x3',
        password,
        JSON.stringify({ ...JSON.parse(encrypted), [key]: value }),
      ),
      /could not be unlocked/,
    );
  }
  const native = {
    ...credentials,
    memwalKey: Ed25519Keypair.fromSecretKey(Buffer.alloc(32, 1)).getSecretKey(),
  };
  assert.equal(
    (
      await decryptVault(
        '0x3',
        password,
        await encryptVault('0x3', password, native),
      )
    ).memwalKey,
    native.memwalKey,
  );
  await assert.rejects(encryptVault('0x3', 'short', credentials), /password/);
  await assert.rejects(
    encryptVault('0x3', password, { ...credentials, network: 'testnet' }),
    /Mainnet/,
  );
});

test('wallet-scoped browser vaults and workspaces are separate and legacy storage remains untouched', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    },
  });
  try {
    writeVault('0x3', 'encrypted-a');
    writeVault('0x4', 'encrypted-b');
    assert.equal(readVault('0x3'), 'encrypted-a');
    forgetVault('0x3');
    assert.equal(readVault('0x3'), null);
    assert.equal(readVault('0x4'), 'encrypted-b');
    const legacy = freshWorkspace();
    saveWorkspace(legacy);
    const a = freshWorkspace();
    saveWorkspace(a, '0x3');
    const b = freshWorkspace();
    saveWorkspace(b, '0x4');
    assert.equal(readWorkspace('0x3').workspace.profileId, a.profileId);
    assert.equal(readWorkspace('0x4').workspace.profileId, b.profileId);
    assert.equal(JSON.parse(rawBackup()).profileId, legacy.profileId);
    assert.ok(!rawBackup('0x3').includes('encrypted-a'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
