export interface SuiTelemetry {
  mock?: boolean
  epoch: string
  referenceGasPrice: string
  totalTransactions: string
  epochStartTimestampMs?: number
  epochDurationMs?: string
  systemState?: string
  warning?: string
}

export interface SuiAccountData {
  mock?: boolean
  address: string
  balances: Array<{ coinType: string; coinObjectCount: number; totalBalance: string }>
  liquidSui: string
  objectsCount: number
  recentTxCount: number
  winRate: number
}

export interface SuiTxVerification {
  mock?: boolean
  digest: string
  status: string
  confirmed: boolean
  sender?: string
  recipient?: string
  amount?: string
  gasUsed?: string
  timestamp?: number
  data?: unknown
}

export async function fetchSuiTelemetry(): Promise<SuiTelemetry> {
  const res = await fetch('/api/tatum/sui/telemetry')
  if (!res.ok) throw new Error('Failed to fetch Sui telemetry')
  return res.json()
}

export async function fetchSuiAccount(address: string): Promise<SuiAccountData> {
  const res = await fetch(`/api/tatum/sui/account/${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error('Failed to query Sui account')
  return res.json()
}

export async function verifySuiTx(digest: string): Promise<SuiTxVerification> {
  const res = await fetch(`/api/tatum/sui/tx/${encodeURIComponent(digest)}`)
  if (!res.ok) throw new Error('Failed to verify Sui transaction')
  return res.json()
}
