import { MemWal } from '@mysten-incubation/memwal';
import { networkConfig } from './subsense-network.mjs';
import { queryTatum } from './subsense-tatum.mjs';
import {
  MEMORY_ACCOUNT_QUERY,
  delegatePublicKey,
  inspectMemoryAccount,
} from './subsense-memory-diagnostics.mjs';
import { normalizeSuiAddress } from '../shared/subsense.mjs';
import { validateAI } from '../shared/ai.mjs';

export function validateUserCredentials(input) {
  if (!input || input.network !== 'mainnet')
    throw new Error('Only Mainnet credentials are accepted.');
  const ai = validateAI(input);
  if (!input.tatumKey && !input.memwalKey && !input.accountId) {
    if (!ai.openrouterKey) throw new Error('Add OpenRouter credentials or a complete Mainnet connection.');
    return { network: 'mainnet', tatumKey: '', memwalKey: '', accountId: '', ...ai };
  }
  const key = input.tatumKey;
  if (
    typeof key !== 'string' ||
    key.length < 12 ||
    key.length > 512 ||
    !/^[\x21-\x7e]+$/.test(key)
  )
    throw new Error('Enter a valid Mainnet Tatum API key.');
  delegatePublicKey(input.memwalKey); // Format/algorithm check, without echoing the input.
  return {
    tatumKey: key,
    memwalKey: input.memwalKey,
    accountId: normalizeSuiAddress(input.accountId),
    network: 'mainnet',
    ...ai,
  };
}

export async function connectUserCredentials(
  wallet,
  credentials,
  {
    fetcher = fetch,
    query = queryTatum,
    createClient = (options) => MemWal.create(options),
  } = {},
) {
  const config = networkConfig('mainnet');
  const response = await fetcher(`${config.walrusUrl}/config`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Walrus Mainnet configuration returned HTTP ${response.status}.`,
    );
  const remote = await response.json();
  if (remote.network !== 'mainnet')
    throw new Error('Walrus relayer network mismatch. No fallback is allowed.');
  const data = await query(
    MEMORY_ACCOUNT_QUERY,
    {
      account: credentials.accountId,
      registry: normalizeSuiAddress(remote.registryId),
      package: normalizeSuiAddress(remote.packageId),
    },
    fetcher,
    'mainnet',
    credentials.tatumKey,
  );
  const diagnostic = inspectMemoryAccount(
    data,
    remote,
    delegatePublicKey(credentials.memwalKey).toRawBytes(),
  );
  if (
    !diagnostic.relayerRegistryExists ||
    !diagnostic.registryIsMemWalRegistry ||
    !diagnostic.relayerPackageExists
  )
    throw new Error(
      'Mainnet deployment could not be verified. Retry when provider indexing is available.',
    );
  if (
    diagnostic.accountObjectExists !== true ||
    diagnostic.isMemWalAccount !== true
  )
    throw new Error(
      'No Mainnet MemWal account was verified at this ID. Use your account object ID, not a wallet address.',
    );
  const contents = data.account.asMoveObject.contents;
  const registryType = data.registry.asMoveObject.contents.type.repr;
  if (
    normalizeSuiAddress(contents.type.repr.split('::')[0]) !==
    normalizeSuiAddress(registryType.split('::')[0])
  )
    throw new Error('This account belongs to a different MemWal deployment.');
  let owner;
  try {
    owner = normalizeSuiAddress(contents.json?.owner);
  } catch {
    throw new Error('MemWal account ownership could not be verified.');
  }
  if (owner !== normalizeSuiAddress(wallet))
    throw new Error('Connect the Sui wallet that owns this MemWal account.');
  if (diagnostic.active !== true || diagnostic.adminQuarantined === true)
    throw new Error(
      'This MemWal account is inactive or quarantined. Resolve that with the account owner.',
    );
  if (diagnostic.configuredDelegateRegistered !== true)
    throw new Error(
      'This delegate is not verified on your MemWal account. The owner must register its public key first.',
    );
  const client = createClient({
    key: credentials.memwalKey,
    accountId: credentials.accountId,
    serverUrl: config.walrusUrl,
    namespace: 'subsense-mainnet',
    requestTimeoutMs: 20000,
    recallTimeoutMs: 20000,
    preflightTimeoutMs: 8000,
  });
  try {
    await client.listNamespaces({ limit: 1 }); // Signed metadata-only auth check, never an upload/recall.
    return client;
  } catch (error) {
    client.destroy();
    if (error.status === 401)
      throw new Error(
        'Mainnet relayer rejected this account/delegate. Check registration and account activation before retrying.',
      );
    throw new Error(
      'Signed MemWal connection check failed. Check provider availability and try again.',
    );
  }
}
