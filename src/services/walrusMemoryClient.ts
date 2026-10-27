import { getGatewayConfig } from '../config/gatewayConfig'

export interface WalrusMemoryRecord {
  id: string
  key: string
  namespace: string
  value: Record<string, unknown>
  createdAt: number
  suiTxRef?: string
}

export async function checkWalrusHealth(): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const config = getGatewayConfig()
  const target = `${config.memwalServerUrl.replace(/\/+$/, '')}/health`

  const res = await fetch('/api/walrus/relayer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: target,
      method: 'GET',
    }),
  })

  const data = await res.json().catch(() => ({ status: res.status }))
  return {
    ok: res.ok,
    status: res.status,
    body: data,
  }
}

export async function fetchWalrusMemories(): Promise<WalrusMemoryRecord[]> {
  const res = await fetch('/api/walrus')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to fetch Walrus memories (${res.status}): ${err.message || res.statusText}`)
  }
  const json = await res.json()
  const rawList = json.memories || []

  return rawList.map((m: Record<string, unknown>) => ({
    id: String(m.blobId || m.id || ''),
    key: String(m.schemaType || m.key || 'SPEND_POLICY_MEMORY'),
    namespace: 'spendguard-production',
    value: (m.content || m.value || {}) as Record<string, unknown>,
    createdAt: Number(m.timestamp || Date.now()),
    suiTxRef: m.suiTxRef ? String(m.suiTxRef) : undefined,
  }))
}

export async function writeWalrusSpendRule(
  key: string,
  ruleData: Record<string, unknown>,
  suiTxRef?: string
): Promise<{ success: boolean; blobId: string }> {
  const res = await fetch('/api/walrus/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaType: key,
      content: ruleData,
      suiTxRef,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to commit memory to Walrus (${res.status}): ${err.message || res.statusText}`)
  }

  return res.json()
}
