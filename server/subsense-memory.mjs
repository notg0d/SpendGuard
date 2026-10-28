import { MemWal } from '@mysten-incubation/memwal';
import { text, validateDecision } from '../shared/subsense.mjs';
import { networkConfig } from './subsense-network.mjs';

export const WALRUS_MAINNET = 'https://relayer.memory.walrus.xyz';
let cached;
let credentials;

export function profileNamespace(profileId, network = networkConfig().network) {
  networkConfig(network);
  if (
    typeof profileId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      profileId,
    )
  )
    throw new Error('Invalid workspace profile.');
  // Keep the original Mainnet namespace so existing memories remain accessible.
  return `subsense-${network === 'testnet' ? 'testnet-' : ''}${profileId.toLowerCase()}`;
}

export async function memoryClient(
  network = networkConfig().network,
  fetcher = fetch,
  create = (options) => MemWal.create(options),
) {
  const config = networkConfig(network);
  const key = process.env.MEMWAL_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId)
    throw new Error(
      'Configure MEMWAL_KEY and MEMWAL_ACCOUNT_ID on the server.',
    );
  const identity = `${network}:${key}:${accountId}`;
  if (!cached || credentials !== identity) {
    // The SDK obtains its chain settings from /config; fail closed on a wrong-chain relayer.
    let response;
    try {
      response = await fetcher(`${config.walrusUrl}/config`, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      const code = error.cause?.code ?? error.code;
      if (code === 'ERR_TLS_CERT_ALTNAME_INVALID')
        throw new Error(
          `Walrus ${config.label} relayer has a TLS hostname mismatch: its certificate does not cover ${new URL(config.walrusUrl).hostname}. Contact Walrus for a working ${config.label} endpoint or retry later. Certificate verification remains enabled; no Mainnet fallback was attempted.`,
        );
      if (
        [
          'CERT_HAS_EXPIRED',
          'DEPTH_ZERO_SELF_SIGNED_CERT',
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          'SELF_SIGNED_CERT_IN_CHAIN',
        ].includes(code)
      )
        throw new Error(
          `Walrus ${config.label} TLS certificate could not be verified. Check the provider endpoint and local trusted certificates; certificate verification remains enabled.`,
        );
      if (
        error.name === 'TimeoutError' ||
        ['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(code)
      )
        throw new Error(
          `Walrus ${config.label} relayer connection timed out. Retry later; no network fallback was attempted.`,
        );
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
        throw new Error(
          `Walrus ${config.label} relayer hostname could not be resolved. Check DNS or provider availability.`,
        );
      throw new Error(
        `Could not connect securely to the Walrus ${config.label} relayer. Check provider availability and your network/proxy settings.`,
      );
    }
    if (!response.ok)
      throw new Error(
        `Walrus ${config.label} config returned HTTP ${response.status}.`,
      );
    const remote = await response.json();
    if (remote.network !== network)
      throw new Error(
        'Walrus relayer network mismatch. No fallback is allowed.',
      );
    cached?.destroy();
    cached = create({
      key,
      accountId,
      serverUrl: config.walrusUrl,
      namespace: `subsense-${network}`,
      requestTimeoutMs: 20000,
      recallTimeoutMs: 20000,
      preflightTimeoutMs: 8000,
    });
    credentials = identity;
  }
  return cached;
}

export async function submitMemory(
  profileId,
  input,
  client,
  network = networkConfig().network,
) {
  const namespace = profileNamespace(profileId, network);
  const decision = validateDecision(input);
  // Demo examples are local teaching material, never silently uploaded for qualification.
  if (decision.demo)
    throw new Error(
      'Sample decisions cannot be uploaded. Create your own decision first.',
    );
  if (Date.parse(decision.at) > Date.now() + 300000)
    throw new Error('A decision cannot be dated in the future.');
  const job = await signedMemoryOperation(network, async () =>
    (client ?? (await memoryClient(network))).remember(
      JSON.stringify(decision),
      namespace,
      { idempotencyKey: `${namespace}:${decision.id}`, dedupe: true },
    ),
  );
  if (typeof job?.job_id !== 'string' || !job.job_id)
    throw new Error('The relayer did not return a memory job.');
  return { storage: 'pending', jobId: job.job_id, namespace, network };
}

export async function memoryStatus(
  profileId,
  jobId,
  client,
  network = networkConfig().network,
) {
  const namespace = profileNamespace(profileId, network);
  if (typeof jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(jobId))
    throw new Error('Invalid memory job ID.');
  const job = await signedMemoryOperation(network, async () =>
    (client ?? (await memoryClient(network))).getRememberStatus(jobId),
  );
  if (job.namespace !== namespace)
    throw new Error(
      'This job does not belong to this workspace, or is no longer available.',
    );
  if (job.status === 'done' && typeof job.blob_id === 'string' && job.blob_id)
    return { storage: network, jobId, blobId: job.blob_id, namespace, network };
  if (job.status === 'failed' || job.status === 'not_found')
    return {
      storage: 'error',
      network,
      jobId,
      message:
        'The memory job failed or expired. Recall before resubmitting to avoid duplicates.',
    };
  return { storage: 'pending', jobId, stage: job.status, network };
}

export async function recallMemories(
  profileId,
  query,
  client,
  network = networkConfig().network,
) {
  const namespace = profileNamespace(profileId, network);
  query = text(query, 'Recall query', 500);
  const result = await signedMemoryOperation(network, async () =>
    (client ?? (await memoryClient(network))).recall({
      query,
      limit: 50,
      namespace,
    }),
  );
  const decisions = [];
  for (const hit of (Array.isArray(result.results) ? result.results : []).slice(
    0,
    50,
  )) {
    try {
      if (
        typeof hit.text !== 'string' ||
        hit.text.length > 6000 ||
        typeof hit.blob_id !== 'string' ||
        !hit.blob_id
      )
        continue;
      const decision = validateDecision(JSON.parse(hit.text));
      if (decision.demo) continue;
      decisions.push({
        ...decision,
        storage: network,
        network,
        blobId: hit.blob_id,
      });
    } catch {
      /* Unrelated/freeform memories are data, never instructions. */
    }
  }
  return {
    decisions,
    retrieved: decisions.length,
    bounded: true,
    namespace,
    network,
  };
}

async function signedMemoryOperation(network, operation) {
  try {
    return await operation();
  } catch (error) {
    if (
      error.status === 401 &&
      error.serverCode !== 'ERR_TIMESTAMP_OUT_OF_BOUNDS'
    ) {
      const failure = new Error(
        `Walrus ${networkConfig(network).label} rejected account/delegate authentication (401). Check the account object ID and registered delegate in Connections, then reconnect your vault. A wallet address is not a MemWal account ID. For server-only diagnostics, SubSense loads .env, not .env.local; npm run diagnose:walrus checks those separate diagnostic credentials.`,
      );
      failure.status = 401;
      failure.serverCode = 'AUTH_REJECTED';
      throw failure;
    }
    throw error;
  }
}
