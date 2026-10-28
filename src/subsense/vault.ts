import { normalizeSuiAddress } from '../../shared/subsense.mjs';
import { validateAI, LEGACY_AI_MESSAGE } from '../../shared/ai.mjs';

export interface UserCredentials {
  network: 'mainnet';
  tatumKey: string;
  memwalKey: string;
  accountId: string;
  openrouterKey?: string;
  chatModel?: string;
}
interface EncryptedVault {
  version: 1;
  network: 'mainnet';
  wallet: string;
  iterations: 600000;
  salt: string;
  iv: string;
  ciphertext: string;
}
const ITERATIONS = 600000;
const prefix = 'subsense_credential_vault_v1:';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: string, max: number) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid encrypted vault.');
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
const walletKey = (wallet: string) => prefix + normalizeSuiAddress(wallet);
const additionalData = (wallet: string) =>
  new TextEncoder().encode(
    `subsense:vault:1:mainnet:${normalizeSuiAddress(wallet)}`,
  );
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (password.length < 12 || password.length > 256)
    throw new Error('Use a vault password of 12–256 characters.');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export function validateVaultCredentials(input: unknown): UserCredentials {
  const value = input as UserCredentials;
  if (!value || value.network !== 'mainnet')
    throw new Error('Only Mainnet credentials are accepted.');
  const ai = validateAI(value);
  const blockchain = Boolean(value.tatumKey || value.memwalKey || value.accountId);
  if (!blockchain) {
    if (!ai.openrouterKey) throw new Error('Add OpenRouter credentials or a complete Mainnet connection.');
    return { network: 'mainnet', tatumKey: '', memwalKey: '', accountId: '', ...ai };
  }
  if (
    !value ||
    value.network !== 'mainnet' ||
    typeof value.tatumKey !== 'string' ||
    value.tatumKey.length < 12 ||
    value.tatumKey.length > 512 ||
    !/^[\x21-\x7e]+$/.test(value.tatumKey) ||
    typeof value.memwalKey !== 'string' ||
    value.memwalKey.length > 160 ||
    !(
      /^(0x)?[0-9a-fA-F]{64}$/.test(value.memwalKey) ||
      /^suiprivkey1[0-9a-z]+$/.test(value.memwalKey)
    )
  )
    throw new Error(
      'Enter a Mainnet Tatum API key and an Ed25519 MemWal delegate private key. Never enter an owner wallet private key.',
    );
  return {
    network: 'mainnet',
    tatumKey: value.tatumKey,
    memwalKey: value.memwalKey,
    accountId: normalizeSuiAddress(value.accountId),
    ...ai,
  };
}
export async function encryptVault(
  wallet: string,
  password: string,
  credentials: UserCredentials,
): Promise<string> {
  const value = validateVaultCredentials(credentials);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(wallet) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    version: 1,
    network: 'mainnet',
    wallet: normalizeSuiAddress(wallet),
    iterations: ITERATIONS,
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  } satisfies EncryptedVault);
}
export async function decryptVault(
  wallet: string,
  password: string,
  serialized: string,
): Promise<UserCredentials> {
  if (serialized.length > 8192)
    throw new Error('Encrypted vault is too large.');
  let decrypted: unknown;
  try {
    const value = JSON.parse(serialized) as EncryptedVault;
    if (
      value.version !== 1 ||
      value.network !== 'mainnet' ||
      value.wallet !== normalizeSuiAddress(wallet) ||
      value.iterations !== ITERATIONS
    )
      throw new Error('Invalid vault.');
    const salt = decode(value.salt, 24);
    const iv = decode(value.iv, 16);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error('Invalid vault.');
    const key = await derive(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(wallet) },
      key,
      decode(value.ciphertext, 8000),
    );
    decrypted = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error(
      'Vault could not be unlocked. Check the password and wallet; the saved vault was not changed.',
    );
  }
  if ((decrypted as { openaiKey?: unknown })?.openaiKey) throw new Error(LEGACY_AI_MESSAGE);
  return validateVaultCredentials(decrypted);
}
export function readVault(wallet: string) {
  return localStorage.getItem(walletKey(wallet));
}
export function writeVault(wallet: string, encrypted: string) {
  localStorage.setItem(walletKey(wallet), encrypted);
}
export function forgetVault(wallet: string) {
  localStorage.removeItem(walletKey(wallet));
}
