import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { normalizeSuiAddress } from '../shared/subsense.mjs';

// Read-only, owner-run diagnostics. Never return account contents, keys or addresses.
export const MEMORY_ACCOUNT_QUERY = `query SubSenseMemoryAccountDiagnostic(
  $account: SuiAddress!, $registry: SuiAddress!, $package: SuiAddress!
) {
  account: object(address: $account) {
    asMoveObject { contents { type { repr } json } }
  }
  registry: object(address: $registry) {
    asMoveObject { contents { type { repr } } }
  }
  deployment: object(address: $package) { asMovePackage { __typename } }
}`;

export function delegatePublicKey(key) {
  if (typeof key !== 'string' || !key)
    throw new Error('Configure MEMWAL_KEY in .env.');
  if (!key.startsWith('suiprivkey1') && !/^(0x)?[0-9a-fA-F]{64}$/.test(key))
    throw new Error(
      'MEMWAL_KEY must be a 32-byte hex or Ed25519 Sui private key.',
    );
  try {
    return Ed25519Keypair.fromSecretKey(
      key.startsWith('suiprivkey1')
        ? key
        : Buffer.from(key.replace(/^0x/, ''), 'hex'),
    ).getPublicKey();
  } catch {
    throw new Error('MEMWAL_KEY is not a valid Ed25519 private key.');
  }
}

export function inspectMemoryAccount(data, remote, publicKey) {
  if (
    !data ||
    !['account', 'registry', 'deployment'].every((name) =>
      Object.hasOwn(data, name),
    )
  )
    throw new Error(
      'Account diagnostic response is incomplete. No account conclusion can be drawn.',
    );
  const contents = data.account?.asMoveObject?.contents;
  const value = contents?.json;
  const type = contents?.type?.repr;
  const delegates = value?.delegate_keys;
  const expected = Buffer.from(publicKey);
  if (expected.length !== 32)
    throw new Error('Expected a 32-byte delegate public key.');
  let comparable = 0;
  let matched = false;
  if (Array.isArray(delegates))
    for (const delegate of delegates) {
      const raw = delegate?.public_key;
      // GraphQL MoveValue.json encodes vector<u8> as Base64, not hex.
      const bytes =
        typeof raw === 'string'
          ? Buffer.from(raw, 'base64')
          : Array.isArray(raw) &&
              raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
            ? Buffer.from(raw)
            : null;
      if (bytes?.length === 32) {
        comparable++;
        if (expected.equals(bytes)) matched = true;
      }
    }
  return {
    accountObjectExists:
      data.account === null ? false : data.account ? true : null,
    isMemWalAccount:
      typeof type === 'string'
        ? type.endsWith('::account::MemWalAccount')
        : contents
          ? null
          : false,
    deploymentPackageMatches:
      typeof type === 'string'
        ? normalizeSuiAddress(type.split('::')[0]) ===
          normalizeSuiAddress(remote.packageId)
        : null,
    relayerRegistryExists: Boolean(data.registry),
    registryIsMemWalRegistry:
      data.registry?.asMoveObject?.contents?.type?.repr?.endsWith(
        '::account::AccountRegistry',
      ) ?? false,
    relayerPackageExists: Boolean(data.deployment?.asMovePackage),
    active: typeof value?.active === 'boolean' ? value.active : null,
    adminQuarantined:
      typeof value?.admin_quarantined === 'boolean'
        ? value.admin_quarantined
        : null,
    delegateCount: Array.isArray(delegates) ? delegates.length : null,
    comparableDelegateCount: comparable,
    configuredDelegateRegistered: matched
      ? true
      : Array.isArray(delegates) && comparable === delegates.length
        ? false
        : null,
  };
}
