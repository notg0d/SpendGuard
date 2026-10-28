import '../server/proxy-bootstrap.mjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { memoryClient } from '../server/subsense-memory.mjs';
import { queryTatum } from '../server/subsense-tatum.mjs';
import { networkConfig } from '../server/subsense-network.mjs';
import { normalizeSuiAddress } from '../shared/subsense.mjs';
import {
  MEMORY_ACCOUNT_QUERY,
  delegatePublicKey,
  inspectMemoryAccount,
} from '../server/subsense-memory-diagnostics.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const names = [
  'SUBSENSE_NETWORK',
  'MEMWAL_KEY',
  'MEMWAL_ACCOUNT_ID',
  'TATUM_API_KEY',
];
const inherited = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
const file = existsSync(envPath) ? dotenv.parse(readFileSync(envPath)) : {};
dotenv.config({ path: envPath, quiet: true });
const secrets = [...names, 'SUBSENSE_ACCESS_TOKEN']
  .flatMap((name) => [process.env[name], file[name]])
  .filter((value) => value && value !== 'testnet' && value !== 'mainnet');
const safe = (value) =>
  secrets.reduce((s, key) => s.split(key).join('[REDACTED]'), String(value));
let client;
try {
  const config = networkConfig();
  const account = normalizeSuiAddress(process.env.MEMWAL_ACCOUNT_ID);
  const pub = delegatePublicKey(process.env.MEMWAL_KEY);
  const response = await fetch(`${config.walrusUrl}/config`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Relayer /config returned HTTP ${response.status}.`);
  const remote = await response.json();
  if (remote.network !== config.network)
    throw new Error('Relayer network mismatch. No fallback is allowed.');
  const data = await queryTatum(
    MEMORY_ACCOUNT_QUERY,
    {
      account,
      registry: normalizeSuiAddress(remote.registryId),
      package: normalizeSuiAddress(remote.packageId),
    },
    fetch,
    config.network,
  );
  const diagnostic = inspectMemoryAccount(data, remote, pub.toRawBytes());
  const serverTime = Date.parse(response.headers.get('date'));
  console.log(
    safe(
      JSON.stringify(
        {
          network: config.network,
          differingInheritedOverrides: names.filter(
            (name) =>
              inherited[name] !== undefined &&
              file[name] !== undefined &&
              inherited[name] !== file[name],
          ),
          ...diagnostic,
          accountIdIsDelegateWalletAddress: account === pub.toSuiAddress(),
          clockWithinFiveMinuteWindow: Number.isFinite(serverTime)
            ? Math.abs(Date.now() - serverTime) < 300000
            : null,
        },
        null,
        2,
      ),
    ),
  );
  if (
    !diagnostic.relayerRegistryExists ||
    !diagnostic.registryIsMemWalRegistry ||
    !diagnostic.relayerPackageExists
  )
    throw new Error(
      'Relayer deployment lookup is incomplete. Check provider indexing/availability before changing credentials.',
    );
  if (diagnostic.accountObjectExists === false)
    throw new Error(
      `MEMWAL_ACCOUNT_ID was not found on ${config.label}. Use the existing ${config.label} MemWal account object ID, not a wallet address or an ID from another network. Very recent accounts may need time to index.`,
    );
  if (diagnostic.isMemWalAccount !== true)
    throw new Error(
      'The configured object could not be verified as a MemWal account. Check its object ID.',
    );
  if (diagnostic.active !== true || diagnostic.adminQuarantined === true)
    throw new Error(
      'Account activation could not be verified, or it is quarantined. Resolve this through the account owner before retrying.',
    );
  if (diagnostic.configuredDelegateRegistered !== true)
    throw new Error(
      'The configured delegate could not be verified in this account. Use its registered delegate, or have the owner explicitly register the intended public key.',
    );
  // Metadata only: no embedding, uploads, blob retrieval or SEAL decryption.
  client = await memoryClient(config.network);
  await client.listNamespaces({ limit: 1 });
  console.log(
    'Signed metadata read: authorized. Memory upload/recall remains a separate test.',
  );
} catch (error) {
  console.error(safe(error.message));
  process.exitCode = 1;
} finally {
  client?.destroy();
}
