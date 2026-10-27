import { getGatewayConfig } from '../config/gatewayConfig'

export interface NetworkTelemetry {
  epoch: string
  referenceGasPrice: string
  totalTransactionBlocks: string
  systemState: string
}

export interface TreasuryPortfolio {
  ownerAddress: string
  totalSuiBalanceMist: string
  totalSuiFormatted: string
  coinBalances: Array<{ coinType: string; coinObjectCount: number; totalBalance: string }>
  ownedObjectsCount: number
}

export interface TransactionRecord {
  digest: string
  timestampMs?: string
  status: 'success' | 'failure'
  sender: string
  gasUsed: string
  netBalanceChanges: Array<{ owner: string; coinType: string; amount: string }>
}

export async function executeSuiRpc(method: string, params: unknown[] = [], id = 1): Promise<unknown> {
  const config = getGatewayConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.tatumApiKey) {
    headers['x-custom-tatum-key'] = config.tatumApiKey
  }

  const res = await fetch('/api/tatum/sui/rpc', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`RPC Request Failed (${res.status}): ${errBody.message || JSON.stringify(errBody)}`)
  }

  const json = await res.json()
  if (json.error) {
    throw new Error(`Sui RPC Error: ${json.error.message || JSON.stringify(json.error)}`)
  }

  return json.result
}

export async function getNetworkTelemetry(): Promise<NetworkTelemetry> {
  const [sysState, gasPrice, totalTx] = await Promise.all([
    executeSuiRpc('sui_getLatestSuiSystemState', [], 1),
    executeSuiRpc('sui_getReferenceGasPrice', [], 2),
    executeSuiRpc('sui_getTotalTransactionBlocks', [], 3),
  ])

  const sys = (sysState as Record<string, unknown>) || {}

  return {
    epoch: String(sys.epoch || '0'),
    referenceGasPrice: String(gasPrice || '0'),
    totalTransactionBlocks: String(totalTx || '0'),
    systemState: 'Active',
  }
}

export async function getTreasuryPortfolio(ownerAddress: string): Promise<TreasuryPortfolio> {
  const [balances, objects] = await Promise.all([
    executeSuiRpc('suix_getAllBalances', [ownerAddress], 4),
    executeSuiRpc('suix_getOwnedObjects', [ownerAddress, { filter: null, options: { showType: true, showContent: true } }], 5),
  ])

  const balanceList = (balances as Array<{ coinType: string; coinObjectCount: number; totalBalance: string }>) || []
  const suiEntry = balanceList.find((b) => b.coinType === '0x2::sui::SUI')
  const rawMist = suiEntry ? suiEntry.totalBalance : '0'
  const suiNumber = Number(BigInt(rawMist)) / 1e9

  const ownedObjs = (objects as { data?: unknown[] })?.data || []

  return {
    ownerAddress,
    totalSuiBalanceMist: rawMist,
    totalSuiFormatted: suiNumber.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    coinBalances: balanceList,
    ownedObjectsCount: ownedObjs.length,
  }
}

export async function getTreasuryTransactionHistory(ownerAddress: string): Promise<TransactionRecord[]> {
  const raw = await executeSuiRpc('suix_queryTransactionBlocks', [
    {
      filter: { FromAddress: ownerAddress },
      options: {
        showInput: true,
        showEffects: true,
        showEvents: true,
        showBalanceChanges: true,
      },
    },
    null,
    25,
    true,
  ], 6)

  const data = (raw as { data?: Array<Record<string, unknown>> })?.data || []

  return data.map((item) => {
    const effects = item.effects as { status?: { status: string }; gasUsed?: Record<string, string> }
    const gas = effects?.gasUsed
    const computationCost = BigInt(gas?.computationCost || '0')
    const storageCost = BigInt(gas?.storageCost || '0')
    const totalGas = (computationCost + storageCost).toString()

    const rawChanges = (item.balanceChanges as Array<{ owner: { AddressOwner?: string }; coinType: string; amount: string }>) || []
    const netChanges = rawChanges.map((c) => ({
      owner: c.owner?.AddressOwner || 'Unknown',
      coinType: c.coinType,
      amount: c.amount,
    }))

    return {
      digest: String(item.digest || ''),
      timestampMs: item.timestampMs ? String(item.timestampMs) : undefined,
      status: effects?.status?.status === 'success' ? 'success' : 'failure',
      sender: ownerAddress,
      gasUsed: totalGas,
      netBalanceChanges: netChanges,
    }
  })
}

export async function verifySettlementTransaction(txDigest: string): Promise<Record<string, unknown>> {
  const result = await executeSuiRpc('sui_getTransactionBlock', [
    txDigest,
    {
      showInput: true,
      showEffects: true,
      showBalanceChanges: true,
      showEvents: true,
    },
  ], 7)

  return (result as Record<string, unknown>) || {}
}
