export type MemorySchemaType =
  | 'SOURCE_CALIBRATION_MEMORY'
  | 'USER_PICK_AND_REASONING_MEMORY'
  | 'BEHAVIORAL_TILT_RULE_MEMORY'
  | 'X402_AGENT_SETTLEMENT_MEMORY'

export interface WalrusMemoryItem {
  blobId: string
  schemaType: MemorySchemaType
  timestamp: number
  suiTxRef: string
  content: Record<string, unknown>
  verificationStatus: string
}

export interface WalrusResponse {
  agentId: string
  count: number
  minRequiredForHackathon: number
  qualifiesForHackathon: boolean
  memories: WalrusMemoryItem[]
}

export async function fetchWalrusMemories(): Promise<WalrusResponse> {
  const res = await fetch('/api/walrus')
  if (!res.ok) throw new Error('Failed to fetch Walrus memories')
  return res.json()
}

export async function writeWalrusMemory(
  schemaType: MemorySchemaType,
  content: Record<string, unknown>,
  suiTxRef?: string
): Promise<{ success: boolean; blobId: string; memory: WalrusMemoryItem; totalMemories: number }> {
  const res = await fetch('/api/walrus/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaType, content, suiTxRef }),
  })
  if (!res.ok) throw new Error('Failed to write memory to Walrus')
  return res.json()
}

export async function seedWalrusBatch(): Promise<WalrusResponse> {
  const res = await fetch('/api/walrus/seed-batch', {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to seed Walrus memories')
  return res.json()
}
