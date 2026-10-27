export interface GatewayConfig {
  tatumApiKey: string
  tatumRpcUrl: string
  memwalPrivateKey: string
  memwalAccountId: string
  memwalAgentId: string
  memwalServerUrl: string
  memwalNamespace: string
  treasurySuiAddress: string
}

const STORAGE_KEY = 'spendguard_gateway_config'

export function getGatewayConfig(): GatewayConfig {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {}
  const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const parsed = stored ? JSON.parse(stored) : {}

  return {
    tatumApiKey: parsed.tatumApiKey || env.VITE_TATUM_API_KEY || '',
    tatumRpcUrl: parsed.tatumRpcUrl || env.VITE_TATUM_RPC_URL || 'https://sui-mainnet.gateway.tatum.io/',
    memwalPrivateKey: parsed.memwalPrivateKey || env.VITE_MEMWAL_PRIVATE_KEY || '',
    memwalAccountId: parsed.memwalAccountId || env.VITE_MEMWAL_ACCOUNT_ID || '',
    memwalAgentId: parsed.memwalAgentId || env.VITE_MEMWAL_AGENT_ID || '',
    memwalServerUrl: parsed.memwalServerUrl || env.VITE_MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
    memwalNamespace: parsed.memwalNamespace || env.VITE_MEMWAL_NAMESPACE || 'spendguard-production',
    treasurySuiAddress: parsed.treasurySuiAddress || env.VITE_TREASURY_SUI_ADDRESS || '0x7a83d49e198b10f82b7194602bb44ce9f28d84a7e93751c144a9937bdf302912',
  }
}

export function saveGatewayConfig(config: Partial<GatewayConfig>): GatewayConfig {
  const current = getGatewayConfig()
  const updated = { ...current, ...config }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }
  return updated
}
