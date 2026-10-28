import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dollarsToCents,
  validateSubscription,
  validateDecision,
  monthlyCents,
  summarize,
  recommend,
  nextRenewal,
  validDate,
  suiToMist,
  normalizeSuiAddress,
  mergeDecisions,
} from '../shared/subsense.mjs';

const service = {
  id: 'design',
  name: 'Design Studio',
  category: 'Design',
  costCents: 2400,
  cadence: 'monthly',
  renewsOn: '2026-11-01',
  usage: 'rare',
  importance: 'optional',
  status: 'active',
  workRelated: true,
  notes: '',
};
const now = new Date('2026-10-28T12:00:00Z');
const decision = {
  app: 'subsense',
  version: 1,
  id: 'decision-1',
  serviceId: 'design',
  serviceName: 'Design Studio',
  category: 'Design',
  costCents: 2400,
  cadence: 'monthly',
  action: 'keep',
  value: 'essential',
  reason: 'Required for client handoffs even when I only use it once a month.',
  at: '2026-10-27T12:00:00Z',
  demo: false,
};

test('USD parsing uses integer cents and rejects exponent/negative/extra precision', () => {
  assert.equal(dollarsToCents('19.99'), 1999);
  assert.equal(dollarsToCents('0'), 0);
  for (const input of ['-1', '1e3', '1.001', '', 'Infinity'])
    assert.throws(() => dollarsToCents(input));
});
test('subscription validation returns an allowlisted copy', () => {
  assert.deepEqual(
    validateSubscription({ ...service, injected: 'ignored' }),
    service,
  );
  assert.throws(() => validateSubscription({ ...service, costCents: NaN }));
  assert.throws(() =>
    validateSubscription({ ...service, renewsOn: '2026-02-30' }),
  );
  assert.throws(() => validateSubscription({ ...service, workRelated: 'yes' }));
});
test('annual budgets use monthly equivalents; inactive services do not count', () => {
  assert.equal(monthlyCents({ costCents: 12000, cadence: 'annual' }), 1000);
  assert.deepEqual(
    summarize(
      [service, { ...service, id: 'archived', status: 'cancelled' }],
      2000,
    ),
    {
      active: 1,
      monthly: 2400,
      annual: 28800,
      headroom: -400,
      utilization: 1.2,
    },
  );
});
test('feedback visibly changes recommendations without changing subscription facts', () => {
  assert.equal(recommend(service, [], { now }).action, 'downgrade');
  const learned = recommend(service, [decision], { now });
  assert.equal(learned.action, 'keep');
  assert.equal(learned.changed, true);
  assert.equal(learned.evidence[0].id, decision.id);
  assert.equal(service.importance, 'optional');
});
test('explicit protection overrides cancellation memories', () => {
  const result = recommend(
    { ...service, importance: 'essential' },
    [{ ...decision, value: 'not-worth-it', action: 'cancel' }],
    { now, overBudget: true },
  );
  assert.equal(result.action, 'keep');
  assert.ok(result.reasons.some((r) => r.includes('over budget')));
});
test('price rises require a fresh review; older and unrelated memories do not apply', () => {
  assert.equal(
    recommend({ ...service, costCents: 3000 }, [decision], { now }).action,
    'review',
  );
  assert.equal(
    recommend(service, [{ ...decision, at: '2025-01-01T00:00:00Z' }], { now })
      .action,
    'downgrade',
  );
  assert.equal(
    recommend(
      service,
      [{ ...decision, serviceId: 'other', serviceName: 'Other' }],
      { now },
    ).action,
    'downgrade',
  );
});
test('latest feedback wins regardless of array order; future memories are ignored', () => {
  const recent = {
    ...decision,
    id: 'new',
    value: 'not-worth-it',
    action: 'cancel',
    at: '2026-10-28T11:00:00Z',
  };
  assert.equal(
    recommend(service, [decision, recent], { now }).action,
    'cancel',
  );
  assert.equal(
    recommend(service, [{ ...decision, at: '2027-01-01T00:00:00Z' }], { now })
      .action,
    'downgrade',
  );
});
test('memory validation rejects foreign records and strips invented receipts', () => {
  assert.throws(() => validateDecision({ ...decision, app: 'other' }));
  assert.equal(
    validateDecision({ ...decision, storage: 'mainnet', blobId: 'made-up' })
      .blobId,
    undefined,
  );
});
test('renewal advancing handles month ends and leap years without timezone shifts', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(
    nextRenewal('2026-01-31', 'monthly', new Date('2026-02-01T12:00:00Z')),
    '2026-02-28',
  );
  assert.equal(
    nextRenewal('2024-02-29', 'annual', new Date('2024-03-01T12:00:00Z')),
    '2025-02-28',
  );
});
test('SUI precision is exact, positive, and independent from USD', () => {
  assert.equal(suiToMist('0.000000001'), 1n);
  assert.equal(suiToMist('100000000000.123456789'), 100000000000123456789n);
  assert.throws(() => suiToMist('0'));
  assert.throws(() => suiToMist('1.0000000001'));
  assert.equal(normalizeSuiAddress('0x2'), `0x${'2'.padStart(64, '0')}`);
  assert.throws(() => normalizeSuiAddress('0xzz'));
});
test('recall merges by decision ID rather than duplicating learning records', () => {
  const result = mergeDecisions(
    [{ ...decision, storage: 'local' }],
    [{ ...decision, storage: 'mainnet', blobId: 'receipt' }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].storage, 'mainnet');
});
