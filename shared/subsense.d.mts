export type Category =
  | 'Productivity'
  | 'Design'
  | 'AI & development'
  | 'Entertainment'
  | 'Storage'
  | 'Education'
  | 'Other';
export type Action = 'keep' | 'downgrade' | 'cancel' | 'review';
export type Value = 'essential' | 'useful' | 'not-worth-it' | 'unsure';
export type Network = 'testnet' | 'mainnet';
export interface MemoryProvenance {
  network: Network;
  storage: 'pending' | 'testnet' | 'mainnet' | 'error';
  jobId?: string;
  blobId?: string;
  syncError?: string;
}
export interface Subscription {
  id: string;
  name: string;
  category: Category;
  costCents: number;
  cadence: 'monthly' | 'annual';
  renewsOn: string;
  usage: 'frequent' | 'occasional' | 'rare' | 'unused';
  importance: 'essential' | 'useful' | 'optional';
  status: 'active' | 'paused' | 'cancelled';
  workRelated: boolean;
  notes: string;
}
export interface Decision {
  app: 'subsense';
  version: 1;
  id: string;
  serviceId: string;
  serviceName: string;
  category: Category;
  action: Action;
  value: Value;
  reason: string;
  costCents: number;
  cadence: 'monthly' | 'annual';
  at: string;
  demo: boolean;
  storage?: 'local' | 'pending' | 'testnet' | 'mainnet' | 'error';
  network?: Network;
  receipts?: MemoryProvenance[];
  jobId?: string;
  blobId?: string;
  syncError?: string;
}
export function memoryReceipts(decision: Decision): MemoryProvenance[];
export function decisionReceipt(
  decision: Decision,
  network: Network,
): MemoryProvenance | undefined;
export function withDecisionReceipt(
  decision: Decision,
  receipt: MemoryProvenance,
): Decision;
export interface Recommendation {
  action: Action;
  baselineAction: Action;
  reasons: string[];
  evidence: Decision[];
  changed: boolean;
  confidence: string;
}
export const CATEGORIES: Category[];
export const ACTIONS: Action[];
export const VALUES: Value[];
export function text(
  value: unknown,
  label: string,
  max?: number,
  required?: boolean,
): string;
export function validDate(value: unknown): boolean;
export function dollarsToCents(value: string | number): number;
export function validateSubscription(input: unknown): Subscription;
export function validateDecision(input: unknown): Decision;
export function monthlyCents(
  service: Pick<Subscription, 'costCents' | 'cadence'>,
): number;
export function daysUntil(date: string, now?: Date): number;
export function nextRenewal(
  date: string,
  cadence: Subscription['cadence'],
  now?: Date,
): string;
export function summarize(
  subscriptions: Subscription[],
  budgetCents: number,
): {
  active: number;
  monthly: number;
  annual: number;
  headroom: number;
  utilization: number;
};
export function recommend(
  service: Subscription,
  decisions?: Decision[],
  context?: { now?: Date; overBudget?: boolean },
): Recommendation;
export function mergeDecisions(
  local: Decision[],
  incoming: Decision[],
): Decision[];
export function suiToMist(value: string): bigint;
export function normalizeSuiAddress(value: string): string;
