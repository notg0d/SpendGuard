import { isValidTransactionDigest } from '@mysten/sui/utils';
import { networkConfig } from './subsense-network.mjs';
import {
  normalizeSuiAddress,
  suiToMist,
  validDate,
} from '../shared/subsense.mjs';

// Tatum /_methods advertises this HTTP GraphQL interface. Shape checked against
// @mysten/sui/src/graphql/generated/schema.graphql, not legacy JSON-RPC guesses.
export const TATUM_SUI_GRAPHQL = 'https://sui-mainnet.gateway.tatum.io/graphql';
export const PAYMENT_QUERY = `query SubSensePayment($digest: String!) {
  transaction(digest: $digest) {
    digest sender { address }
    effects {
      status timestamp
      balanceChanges(first: 100) {
        nodes { amount owner { address } coinType { repr } }
        pageInfo { hasNextPage }
      }
    }
  }
}`;

export function validatePaymentInput(input) {
  if (!input || !isValidTransactionDigest(input.digest))
    throw new Error('Enter a valid base58 Sui transaction digest.');
  const recipient = normalizeSuiAddress(input.recipient);
  const payer = input.payer ? normalizeSuiAddress(input.payer) : null;
  suiToMist(input.amountSui);
  if (!validDate(input.paidOn))
    throw new Error('Enter the expected payment date.');
  return {
    digest: input.digest,
    recipient,
    payer,
    amountSui: input.amountSui,
    paidOn: input.paidOn,
  };
}

export function checkPaymentEvidence(
  tx,
  expected,
  network = networkConfig().network,
) {
  const config = networkConfig(network);
  if (!tx)
    return {
      verified: false,
      network: config.network,
      checks: [{ label: 'Transaction exists', passed: false }],
    };
  const effects = tx.effects;
  const changes = effects?.balanceChanges;
  let received = 0n;
  let validChanges = Array.isArray(changes?.nodes);
  for (const change of validChanges ? changes.nodes : []) {
    try {
      const type = change.coinType?.repr;
      if (
        typeof type !== 'string' ||
        typeof change.amount !== 'string' ||
        !/^-?\d+$/.test(change.amount)
      )
        throw new Error('Malformed balance change.');
      const owner = normalizeSuiAddress(change.owner?.address);
      const native = /^0x0*2::sui::SUI$/.test(type);
      if (native && owner === expected.recipient)
        received += BigInt(change.amount);
    } catch {
      validChanges = false;
    }
  }
  let payerMatches = false;
  try {
    payerMatches =
      !expected.payer ||
      normalizeSuiAddress(tx.sender?.address) === expected.payer;
  } catch {
    /* Missing sender fails closed. */
  }
  const timestamp = effects?.timestamp;
  const checks = [
    {
      label: 'Exact transaction digest',
      passed: tx.digest === expected.digest,
    },
    { label: 'Successful execution', passed: effects?.status === 'SUCCESS' },
    {
      label: 'Complete balance-change evidence',
      passed: validChanges && changes?.pageInfo?.hasNextPage === false,
    },
    {
      label: 'Recipient received the exact native SUI amount',
      passed: received === suiToMist(expected.amountSui),
    },
    {
      label: 'Expected UTC payment date',
      passed:
        typeof timestamp === 'string' &&
        Number.isFinite(Date.parse(timestamp)) &&
        new Date(timestamp).toISOString().slice(0, 10) === expected.paidOn,
    },
    ...(expected.payer
      ? [{ label: 'Expected transaction sender', passed: payerMatches }]
      : []),
  ];
  return {
    verified: checks.every((c) => c.passed),
    checks,
    digest: tx.digest,
    timestamp: timestamp ?? null,
    recipient: expected.recipient,
    amountSui: expected.amountSui,
    sender: tx.sender?.address ?? null,
    network: config.network,
    chain: config.chain,
    provider: 'Tatum',
    transport: 'GraphQL',
    checkedAt: new Date().toISOString(),
  };
}

export async function queryTatum(
  query,
  variables = {},
  fetcher = fetch,
  network = networkConfig().network,
  key = process.env.TATUM_API_KEY,
) {
  const config = networkConfig(network);
  if (!key)
    throw new Error(
      'Configure TATUM_API_KEY on the server before verifying payments.',
    );
  const response = await fetcher(config.tatumUrl, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok)
    throw new Error(
      `Tatum returned HTTP ${response.status}. Check key scope, access, and service availability.`,
    );
  const result = await response.json();
  if (result.errors?.length || !result.data)
    throw new Error(
      'Tatum GraphQL did not return complete data. Confirm gateway schema and access.',
    );
  return result.data;
}

export async function verifyPayment(input, network = networkConfig().network) {
  const expected = validatePaymentInput(input);
  const data = await queryTatum(
    PAYMENT_QUERY,
    { digest: expected.digest },
    fetch,
    network,
  );
  return checkPaymentEvidence(data.transaction, expected, network);
}

// Shape checked against the installed Sui GraphQL schema: Address.balance and Balance.totalBalance.
export const BALANCE_QUERY = `query SubSenseBalance($address: SuiAddress!) {
  address(address: $address) { address balance(coinType: "0x2::sui::SUI") { totalBalance } }
}`;

export async function readSuiBalance(address, query = queryTatum) {
  const normalized = normalizeSuiAddress(address);
  const config = networkConfig();
  const data = await query(BALANCE_QUERY, { address: normalized });
  const value = data.address?.balance?.totalBalance;
  if (
    data.address?.address !== normalized ||
    typeof value !== 'string' ||
    !/^\d+$/.test(value)
  )
    throw new Error('Tatum did not return complete native SUI balance data.');
  const mist = BigInt(value);
  const amountSui = `${mist / 1000000000n}.${(mist % 1000000000n).toString().padStart(9, '0')}`;
  return {
    address: normalized,
    amountSui,
    balanceMist: value,
    network: config.network,
    provider: 'Tatum',
    checkedAt: new Date().toISOString(),
  };
}
