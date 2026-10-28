import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshWorkspace,
  validateWorkspace,
  readWorkspace,
  saveWorkspace,
  rawBackup,
} from '../src/subsense/workspace.ts';
import { sampleWorkspace } from './fixtures/sample-workspace.mjs';

test('sample workspace is realistic but never contains Mainnet claims', () => {
  const w = sampleWorkspace();
  assert.equal(w.sample, true);
  assert.equal(w.subscriptions.length, 6);
  assert.ok(
    w.decisions.every((d) => d.demo && d.storage === 'local' && !d.blobId),
  );
  assert.deepEqual(validateWorkspace(w).subscriptions, w.subscriptions);
});
test('backup imports strip receipts and payment evidence while preserving recall profile', () => {
  const w = sampleWorkspace();
  w.sample = false;
  w.decisions[0] = {
    ...w.decisions[0],
    demo: false,
    storage: 'mainnet',
    blobId: 'blob',
    jobId: 'job',
  };
  w.payments.push({
    network: 'mainnet',
    serviceId: 'figma',
    digest: 'digest',
    recipient: '0x2',
    amountSui: '0.5',
    timestamp: '2026-10-27T12:00:00Z',
    checkedAt: '2026-10-27T12:00:00Z',
    provider: 'Tatum',
  });
  const imported = validateWorkspace(w, true);
  assert.equal(imported.profileId, w.profileId);
  assert.equal(imported.decisions[0].storage, 'local');
  assert.equal(imported.decisions[0].blobId, undefined);
  assert.equal(imported.payments.length, 0);
});
test('backup validation rejects broken profiles, duplicate IDs, and invalid dates', () => {
  const w = sampleWorkspace();
  assert.throws(() => validateWorkspace({ ...w, profileId: '-'.repeat(36) }));
  assert.throws(() =>
    validateWorkspace({
      ...w,
      subscriptions: [w.subscriptions[0], w.subscriptions[0]],
    }),
  );
  assert.throws(() => validateWorkspace({ ...w, budgetCents: -1 }));
  assert.throws(() =>
    validateWorkspace({
      ...w,
      decisions: [{ ...w.decisions[0], at: '2026-02-30T12:00:00.000Z' }],
    }),
  );
});
test('unreadable browser data is preserved for raw recovery, valid state round-trips', () => {
  const old = globalThis.localStorage;
  let saved = '{broken-json';
  globalThis.localStorage = {
    getItem: () => saved,
    setItem: (_key, value) => {
      saved = value;
    },
  };
  try {
    assert.ok(readWorkspace().warning);
    assert.equal(readWorkspace().workspace.sample, false);
    assert.equal(readWorkspace().workspace.subscriptions.length, 0);
    assert.equal(rawBackup(), '{broken-json');
    const w = freshWorkspace();
    saveWorkspace(w);
    assert.deepEqual(readWorkspace().workspace, w);
    saved = null;
    const empty = readWorkspace().workspace;
    assert.equal(empty.sample, false);
    assert.deepEqual(empty.subscriptions, []);
    assert.deepEqual(empty.decisions, []);
    assert.equal(saved, null);
  } finally {
    if (old === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = old;
  }
});
