import test from 'node:test';
import assert from 'node:assert/strict';
import {
  delegatePublicKey,
  inspectMemoryAccount,
} from '../server/subsense-memory-diagnostics.mjs';
import {
  submitMemory,
  memoryStatus,
  recallMemories,
} from '../server/subsense-memory.mjs';
import { sampleWorkspace } from './fixtures/sample-workspace.mjs';

const publicKey = Buffer.alloc(32, 7);
const remote = { packageId: '0x123' };
function accountData(overrides = {}) {
  return {
    account: {
      asMoveObject: {
        contents: {
          type: { repr: '0x123::account::MemWalAccount' },
          json: {
            active: true,
            admin_quarantined: false,
            owner: 'private-owner-label',
            delegate_keys: [
              {
                public_key: publicKey.toString('base64'),
                label: 'private-device-label',
              },
            ],
            ...overrides,
          },
        },
      },
    },
    registry: {
      asMoveObject: {
        contents: { type: { repr: '0x123::account::AccountRegistry' } },
      },
    },
    deployment: { asMovePackage: { __typename: 'MovePackage' } },
  };
}

test('account diagnostics distinguish missing account from a working deployment without exposing contents', () => {
  const data = accountData();
  data.account = null;
  const result = inspectMemoryAccount(data, remote, publicKey);
  assert.equal(result.accountObjectExists, false);
  assert.equal(result.relayerRegistryExists, true);
  assert.equal(result.relayerPackageExists, true);
  assert.equal(result.configuredDelegateRegistered, null);
  assert.equal(result.active, null);
  assert.throws(
    () => inspectMemoryAccount({}, remote, publicKey),
    /incomplete/,
  );
});

test('account diagnostics compare Base64 delegate bytes, detect inactive/quarantined accounts and redact metadata', () => {
  const data = accountData();
  const result = inspectMemoryAccount(data, remote, publicKey);
  assert.equal(result.isMemWalAccount, true);
  assert.equal(result.deploymentPackageMatches, true);
  assert.equal(result.configuredDelegateRegistered, true);
  assert.equal(result.delegateCount, 1);
  assert.equal(result.comparableDelegateCount, 1);
  assert.equal(result.active, true);
  assert.equal(result.adminQuarantined, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-owner-label|private-device-label|BwcH|0x123/,
  );
  assert.equal(
    inspectMemoryAccount(accountData({ active: false }), remote, publicKey)
      .active,
    false,
  );
  assert.equal(
    inspectMemoryAccount(
      accountData({ admin_quarantined: true }),
      remote,
      publicKey,
    ).adminQuarantined,
    true,
  );
  assert.equal(
    inspectMemoryAccount(data, remote, Buffer.alloc(32, 8))
      .configuredDelegateRegistered,
    false,
  );
  assert.equal(
    inspectMemoryAccount(accountData({ delegate_keys: [] }), remote, publicKey)
      .configuredDelegateRegistered,
    false,
  );
});

test('unknown delegate layouts remain unverified; package differences are diagnostic, not proof of invalid auth', () => {
  assert.equal(
    inspectMemoryAccount(
      accountData({ delegate_keys: [{}] }),
      remote,
      publicKey,
    ).configuredDelegateRegistered,
    null,
  );
  assert.equal(
    inspectMemoryAccount(
      accountData({ delegate_keys: [{ public_key: [-1, ...publicKey] }] }),
      remote,
      publicKey,
    ).configuredDelegateRegistered,
    null,
  );
  assert.equal(
    inspectMemoryAccount(
      accountData({ delegate_keys: [{ public_key: [...publicKey] }] }),
      remote,
      publicKey,
    ).configuredDelegateRegistered,
    true,
  );
  const data = accountData();
  data.account.asMoveObject.contents.type.repr =
    '0x456::account::MemWalAccount';
  const result = inspectMemoryAccount(data, remote, publicKey);
  assert.equal(result.deploymentPackageMatches, false);
  assert.equal(result.configuredDelegateRegistered, true);
  data.account.asMoveObject.contents.type.repr = '0x2::coin::Coin';
  assert.equal(
    inspectMemoryAccount(data, remote, publicKey).isMemWalAccount,
    false,
  );
});

test('delegate derivation accepts supported seed formats and never includes bad private values in errors', () => {
  const seed = '01'.repeat(32);
  assert.deepEqual(
    delegatePublicKey(seed).toRawBytes(),
    delegatePublicKey(`0x${seed}`).toRawBytes(),
  );
  assert.equal(delegatePublicKey(seed).toRawBytes().length, 32);
  for (const value of ['secret-value', 'suiprivkey1secret-value', undefined]) {
    assert.throws(
      () => delegatePublicKey(value),
      (error) => {
        assert.doesNotMatch(error.message, /secret-value/);
        return true;
      },
    );
  }
});

test('all signed memory operations explain .env account/delegate auth rejection without echoing upstream data', async () => {
  const profile = '11111111-1111-4111-8111-111111111111';
  const decision = {
    ...sampleWorkspace().decisions[0],
    demo: false,
    storage: 'local',
  };
  const rejected = () => {
    throw Object.assign(new Error('upstream-private-detail .env.local'), {
      status: 401,
      serverCode: 'AUTH_REJECTED',
    });
  };
  const client = {
    remember: rejected,
    getRememberStatus: rejected,
    recall: rejected,
  };
  for (const operation of [
    () => submitMemory(profile, decision, client, 'testnet'),
    () => memoryStatus(profile, 'job-1', client, 'testnet'),
    () => recallMemories(profile, 'value', client, 'testnet'),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.serverCode, 'AUTH_REJECTED');
      assert.match(error.message, /Testnet.*loads .env, not .env.local/);
      assert.match(error.message, /diagnose:walrus/);
      assert.doesNotMatch(error.message, /upstream-private-detail/);
      return true;
    });
  }
  const clockError = Object.assign(new Error('Synchronize the system clock.'), {
    status: 401,
    serverCode: 'ERR_TIMESTAMP_OUT_OF_BOUNDS',
  });
  await assert.rejects(
    recallMemories(
      profile,
      'value',
      {
        recall: () => {
          throw clockError;
        },
      },
      'testnet',
    ),
    (error) => error === clockError,
  );
});
