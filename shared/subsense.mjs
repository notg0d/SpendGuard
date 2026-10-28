// Pure, shared product logic. No network access, clocks hidden in rules, or vendor actions.
export const CATEGORIES = [
  'Productivity',
  'Design',
  'AI & development',
  'Entertainment',
  'Storage',
  'Education',
  'Other',
];
export const ACTIONS = ['keep', 'downgrade', 'cancel', 'review'];
export const VALUES = ['essential', 'useful', 'not-worth-it', 'unsure'];
const DAY = 86400000;

export function text(value, label, max = 500, required = true) {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new Error(
      `${label} is required and must be at most ${max} characters.`,
    );
  return value.trim();
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function dollarsToCents(value) {
  const input = String(value).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(input))
    throw new Error(
      'Enter a non-negative USD amount with at most two decimal places.',
    );
  const [whole, fraction = ''] = input.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function validateSubscription(input) {
  if (!input || typeof input !== 'object')
    throw new Error('Invalid subscription.');
  const id = text(input.id, 'Subscription ID', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid subscription ID.');
  const name = text(input.name, 'Service name', 80);
  if (!CATEGORIES.includes(input.category))
    throw new Error('Choose a valid category.');
  if (
    !Number.isSafeInteger(input.costCents) ||
    input.costCents < 0 ||
    input.costCents > 999999999
  )
    throw new Error('Invalid subscription price.');
  if (!['monthly', 'annual'].includes(input.cadence))
    throw new Error('Choose a billing cycle.');
  if (!validDate(input.renewsOn))
    throw new Error('Enter a valid renewal date.');
  if (!['frequent', 'occasional', 'rare', 'unused'].includes(input.usage))
    throw new Error('Choose your usage.');
  if (!['essential', 'useful', 'optional'].includes(input.importance))
    throw new Error('Choose an importance.');
  if (!['active', 'paused', 'cancelled'].includes(input.status))
    throw new Error('Invalid subscription status.');
  if (typeof input.workRelated !== 'boolean')
    throw new Error('Choose whether this supports work.');
  return {
    id,
    name,
    category: input.category,
    costCents: input.costCents,
    cadence: input.cadence,
    renewsOn: input.renewsOn,
    usage: input.usage,
    importance: input.importance,
    status: input.status,
    workRelated: input.workRelated,
    notes: text(input.notes ?? '', 'Notes', 800, false),
  };
}

export function validateDecision(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    input.app !== 'subsense' ||
    input.version !== 1
  )
    throw new Error('Not a SubSense decision.');
  const id = text(input.id, 'Decision ID', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid decision ID.');
  const serviceId = text(input.serviceId, 'Service ID', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(serviceId))
    throw new Error('Invalid service ID.');
  const serviceName = text(input.serviceName, 'Service name', 80);
  if (
    !CATEGORIES.includes(input.category) ||
    !ACTIONS.includes(input.action) ||
    !VALUES.includes(input.value)
  )
    throw new Error('Invalid decision category, action, or value.');
  if (
    !Number.isSafeInteger(input.costCents) ||
    input.costCents < 0 ||
    input.costCents > 999999999 ||
    !['monthly', 'annual'].includes(input.cadence)
  )
    throw new Error('Invalid decision price.');
  if (
    typeof input.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input.at) ||
    !validDate(input.at.slice(0, 10)) ||
    !Number.isFinite(Date.parse(input.at))
  )
    throw new Error('Invalid decision timestamp. Use an ISO UTC timestamp.');
  if (
    new Date(input.at).toISOString() !==
    (input.at.includes('.') ? input.at : input.at.replace('Z', '.000Z'))
  )
    throw new Error('Invalid decision timestamp.');
  return {
    app: 'subsense',
    version: 1,
    id,
    serviceId,
    serviceName,
    category: input.category,
    action: input.action,
    value: input.value,
    reason: text(input.reason, 'Decision rationale', 800),
    costCents: input.costCents,
    cadence: input.cadence,
    at: new Date(input.at).toISOString(),
    demo: input.demo === true,
  };
}

export function monthlyCents(service) {
  return service.cadence === 'annual'
    ? Math.round(service.costCents / 12)
    : service.costCents;
}

export function daysUntil(date, now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - today) / DAY);
}

export function nextRenewal(date, cadence, now = new Date()) {
  const parts = date.split('-').map(Number);
  let year = parts[0];
  let month = parts[1] - 1;
  const day = parts[2];
  for (let step = 0; step < 1200; step++) {
    if (cadence === 'annual') year += 1;
    else if (++month > 11) {
      month = 0;
      year += 1;
    }
    const capped = Math.min(
      day,
      new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    );
    const result = new Date(Date.UTC(year, month, capped))
      .toISOString()
      .slice(0, 10);
    if (daysUntil(result, now) > 0) return result;
  }
  throw new Error('Renewal date is too far in the past.');
}

export function summarize(subscriptions, budgetCents) {
  const active = subscriptions.filter((s) => s.status === 'active');
  const monthly = active.reduce((sum, s) => sum + monthlyCents(s), 0);
  return {
    active: active.length,
    monthly,
    annual: active.reduce(
      (sum, s) =>
        sum + (s.cadence === 'annual' ? s.costCents : s.costCents * 12),
      0,
    ),
    headroom: budgetCents - monthly,
    utilization: budgetCents > 0 ? monthly / budgetCents : 0,
  };
}

export function recommend(service, decisions = [], context = {}) {
  const now = context.now ?? new Date();
  let baselineAction = 'review';
  const reasons = [];
  if (service.importance === 'essential') {
    baselineAction = 'keep';
    reasons.push('You have explicitly protected this service as essential.');
  } else if (service.usage === 'unused') {
    baselineAction = 'cancel';
    reasons.push(
      'You reported no recent use. Consider cancellation before renewal.',
    );
  } else if (service.usage === 'rare') {
    baselineAction = 'downgrade';
    reasons.push(
      'You reported rare use. Check whether a lower-cost plan would cover your needs.',
    );
  } else if (service.usage === 'frequent') {
    baselineAction = 'keep';
    reasons.push(
      'You reported frequent use; this service appears to earn its place.',
    );
  } else {
    reasons.push('Occasional use needs a value check before another renewal.');
  }
  const name = service.name.trim().toLowerCase();
  const evidence = decisions
    .filter((d) => {
      const age = now.getTime() - Date.parse(d.at);
      return (
        (d.serviceId === service.id ||
          d.serviceName.trim().toLowerCase() === name) &&
        age >= 0 &&
        age <= 180 * DAY
      );
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 1);
  let action = baselineAction;
  const last = evidence[0];
  if (last && service.importance !== 'essential') {
    const priceChanged = monthlyCents(service) > monthlyCents(last) * 1.1;
    if (priceChanged) {
      action = 'review';
      reasons.unshift(
        'The monthly-equivalent price is more than 10% above your last decision. Recheck value instead of blindly repeating it.',
      );
    } else if (last.action === 'review' || last.value === 'unsure') {
      action = 'review';
      reasons.unshift(
        'Your latest feedback left the value unresolved. Revisit it before renewal.',
      );
    } else if (last.value === 'essential') {
      action = 'keep';
      reasons.unshift(
        'Your latest feedback says this service is essential at a comparable price.',
      );
    } else if (last.value === 'not-worth-it') {
      action = 'cancel';
      reasons.unshift(
        'Your latest feedback says this service was not worth its cost.',
      );
    } else {
      action = last.action;
      reasons.unshift(
        'Your latest decision supplies context that usage alone misses.',
      );
    }
  }
  if (last) reasons.push(`You said: “${last.reason}”`);
  if (context.overBudget)
    reasons.push(
      'Your workspace is over budget. This recommendation does not change the budget or cancel anything automatically.',
    );
  return {
    action,
    baselineAction,
    reasons,
    evidence,
    changed: action !== baselineAction,
    confidence: last ? 'User-informed' : 'Early signal',
  };
}

export function memoryReceipts(decision) {
  if (decision.demo) return [];
  const map = new Map();
  const candidates = [
    ...(Array.isArray(decision.receipts) ? decision.receipts : []),
    {
      network:
        decision.network ??
        (decision.storage === 'testnet' ? 'testnet' : 'mainnet'),
      storage: decision.storage,
      jobId: decision.jobId,
      blobId: decision.blobId,
      syncError: decision.syncError,
    },
  ];
  for (const r of candidates) {
    if (
      !r ||
      !['testnet', 'mainnet'].includes(r.network) ||
      !['pending', 'error', r.network].includes(r.storage)
    )
      continue;
    const jobId =
      typeof r.jobId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(r.jobId)
        ? r.jobId
        : undefined;
    const blobId =
      r.storage === r.network &&
      typeof r.blobId === 'string' &&
      r.blobId.length > 0 &&
      r.blobId.length <= 200
        ? r.blobId
        : undefined;
    if (
      (r.storage === r.network && !blobId) ||
      (r.storage === 'pending' && !jobId)
    )
      continue;
    map.set(r.network, {
      network: r.network,
      storage: r.storage,
      jobId,
      blobId,
      syncError:
        typeof r.syncError === 'string' ? r.syncError.slice(0, 500) : undefined,
    });
  }
  return [...map.values()];
}

export function decisionReceipt(decision, network) {
  return memoryReceipts(decision).find((r) => r.network === network);
}

export function withDecisionReceipt(decision, receipt) {
  const candidate = {
    ...decision,
    ...receipt,
    jobId: receipt.jobId,
    blobId: receipt.blobId,
    syncError: receipt.syncError,
    receipts: memoryReceipts(decision),
  };
  return { ...candidate, receipts: memoryReceipts(candidate) };
}

export function mergeDecisions(local, incoming) {
  const map = new Map(local.map((d) => [d.id, d]));
  for (const d of incoming) {
    // Only a server-confirmed receipt supplied by the API adapter upgrades storage.
    const old = map.get(d.id);
    const merged = old
      ? {
          ...old,
          ...d,
          jobId: d.jobId,
          blobId: d.blobId,
          syncError: d.syncError,
          receipts: memoryReceipts(old),
        }
      : d;
    map.set(d.id, { ...merged, receipts: memoryReceipts(merged) });
  }
  return [...map.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function suiToMist(value) {
  if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,9})?$/.test(value))
    throw new Error('Enter SUI with at most nine decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
  if (amount <= 0n) throw new Error('SUI amount must be greater than zero.');
  return amount;
}

export function normalizeSuiAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value))
    throw new Error('Enter a valid Sui address.');
  return `0x${value.slice(2).toLowerCase().padStart(64, '0')}`;
}
