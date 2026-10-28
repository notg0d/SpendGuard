import type { Decision } from './workspace';
import type { Network } from '../../shared/subsense.mjs';
export interface Connections {
  tatumConfigured: boolean;
  walrusConfigured: boolean;
  openaiConfigured?: boolean;
  chatModel?: string;
  embeddingModel?: string;
  walletAuthenticated: boolean;
  network: Network;
  networkLabel: string;
  tatumEndpoint: string;
  walrusEndpoint: string;
  transport: string;
  authMode?: 'wallet';
}
export interface MemoryReceipt {
  storage: 'pending' | 'testnet' | 'mainnet' | 'error';
  network: Network;
  jobId: string;
  blobId?: string;
  message?: string;
  stage?: string;
}
export interface Verification {
  network: Network;
  verified: boolean;
  checks: { label: string; passed: boolean }[];
  digest?: string;
  timestamp?: string;
  recipient?: string;
  amountSui?: string;
  sender?: string;
  checkedAt?: string;
  provider?: string;
}
let walletAddress = '';
export function setApiWallet(address: string) {
  walletAddress = address;
}
export interface WalletSession {
  authenticated: boolean;
  network: 'mainnet';
  walletAddress?: string;
  expiresAt?: string;
  credentialsConfigured?: boolean;
  vaultUnlocked?: boolean;
  openaiConfigured?: boolean;
}
export async function api<T>(
  path: string,
  body?: unknown,
  options: { wallet?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const expected = options.wallet ?? walletAddress;
  if (expected !== walletAddress)
    throw new Error('Wallet changed. Retry with the current wallet.');
  options.signal?.throwIfAborted();
  const response = await fetch(`/api/subsense${path}`, {
    credentials: 'same-origin',
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(expected ? { 'X-SubSense-Wallet': expected } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (expected !== walletAddress)
    throw new Error(
      'Wallet changed during the request. No result was applied.',
    );
  if (response.status === 401)
    window.dispatchEvent(new Event('subsense-session-expired'));
  if (!response.ok)
    throw new Error(result.message ?? `Request failed (${response.status}).`);
  const requested = (body as { network?: Network } | undefined)?.network;
  if (requested && result.network !== requested)
    throw new Error(
      'Provider response network mismatch. No evidence was saved.',
    );
  return result;
}
export const loadConnections = () => api<Connections>('/config');
export const uploadDecision = (
  profileId: string,
  decision: Decision,
  network: Network,
) => api<MemoryReceipt>('/memories', { profileId, decision, network });
export const checkMemory = (
  profileId: string,
  jobId: string,
  network: Network,
) => api<MemoryReceipt>('/memories/status', { profileId, jobId, network });
export const recallDecisions = (
  profileId: string,
  query: string,
  network: Network,
) =>
  api<{
    decisions: Decision[];
    retrieved: number;
    bounded: boolean;
    network: Network;
  }>('/memories/recall', { profileId, query, network });
