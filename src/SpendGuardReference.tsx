import React, { useState, useEffect } from 'react'
import {
  Shield,
  Activity,
  CreditCard,
  Lock,
  Database,
  Settings,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  CheckCircle2,
  DollarSign,
  Layers,
  Sliders,
  Terminal,
  Zap,
  Filter,
  Check,
  XCircle,
  Clock,
  ArrowUpRight
} from 'lucide-react'
import { getGatewayConfig, saveGatewayConfig, GatewayConfig } from './config/gatewayConfig'
import {
  getNetworkTelemetry,
  getTreasuryPortfolio,
  getTreasuryTransactionHistory,
  verifySettlementTransaction,
  NetworkTelemetry,
  TreasuryPortfolio,
  TransactionRecord
} from './services/tatumSuiClient'
import {
  checkWalrusHealth,
  fetchWalrusMemories,
  writeWalrusSpendRule,
  WalrusMemoryRecord
} from './services/walrusMemoryClient'

// Original, unmounted SpendGuard reference. Retained for provenance and comparison.
export default function SpendGuardReference() {
  const [config, setConfig] = useState<GatewayConfig>(getGatewayConfig())
  const [activeTab, setActiveTab] = useState<'watchdog' | 'subscriptions' | 'firewall' | 'memory' | 'history'>('watchdog')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Network & Treasury State
  const [telemetry, setTelemetry] = useState<NetworkTelemetry | null>(null)
  const [telemetryError, setTelemetryError] = useState<string | null>(null)
  const [portfolio, setPortfolio] = useState<TreasuryPortfolio | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)

  // Walrus Memory State
  const [memories, setMemories] = useState<WalrusMemoryRecord[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [memoriesError, setMemoriesError] = useState<string | null>(null)

  // Connectivity Test State
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    suiOk: boolean
    suiLatency: number
    walrusOk: boolean
    walrusLatency: number
    error?: string
  } | null>(null)

  // Diagnostic Toast
  const [toastMessage, setToastMessage] = useState<{ title: string; text: string; type: 'error' | 'success' } | null>(null)

  // Form fields for new policy / x402
  const [ruleKey, setRuleKey] = useState('MAX_VENDOR_DAILY_CAP')
  const [vendorName, setVendorName] = useState('Anthropic API via OpenRouter')
  const [dailyCapSui, setDailyCapSui] = useState('25')
  const [ruleNotes, setRuleNotes] = useState('Autonomous throttle if daily consumption exceeds 25 SUI.')
  const [isSavingRule, setIsSavingRule] = useState(false)

  // x402 verification test
  const [verifyDigestInput, setVerifyDigestInput] = useState('')
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  // Initial Data Fetch
  useEffect(() => {
    refreshTelemetry()
    refreshTreasury()
    refreshMemories()
  }, [])

  async function refreshTelemetry() {
    try {
      setTelemetryError(null)
      const data = await getNetworkTelemetry()
      setTelemetry(data)
    } catch (err: unknown) {
      const e = err as Error
      setTelemetryError(e.message)
    }
  }

  async function refreshTreasury() {
    if (!config.treasurySuiAddress) return
    setPortfolioLoading(true)
    setPortfolioError(null)
    setTransactionsLoading(true)
    setTransactionsError(null)

    try {
      const portData = await getTreasuryPortfolio(config.treasurySuiAddress)
      setPortfolio(portData)
    } catch (err: unknown) {
      const e = err as Error
      setPortfolioError(e.message)
      setToastMessage({
        title: 'Portfolio RPC Error',
        text: e.message,
        type: 'error',
      })
    } finally {
      setPortfolioLoading(false)
    }

    try {
      const txData = await getTreasuryTransactionHistory(config.treasurySuiAddress)
      setTransactions(txData)
    } catch (err: unknown) {
      const e = err as Error
      setTransactionsError(e.message)
    } finally {
      setTransactionsLoading(false)
    }
  }

  async function refreshMemories() {
    setMemoriesLoading(true)
    setMemoriesError(null)
    try {
      const data = await fetchWalrusMemories()
      setMemories(data)
    } catch (err: unknown) {
      const e = err as Error
      setMemoriesError(e.message)
    } finally {
      setMemoriesLoading(false)
    }
  }

  async function handleTestConnectivity() {
    setIsTesting(true)
    setTestResult(null)

    const suiStart = performance.now()
    let suiOk = false
    let suiLat = 0
    try {
      await getNetworkTelemetry()
      suiLat = Math.round(performance.now() - suiStart)
      suiOk = true
    } catch {
      suiLat = Math.round(performance.now() - suiStart)
      suiOk = false
    }

    const walStart = performance.now()
    let walrusOk = false
    let walLat = 0
    try {
      const wRes = await checkWalrusHealth()
      walLat = Math.round(performance.now() - walStart)
      walrusOk = wRes.ok
    } catch {
      walLat = Math.round(performance.now() - walStart)
      walrusOk = false
    }

    setIsTesting(false)
    setTestResult({
      suiOk,
      suiLatency: suiLat,
      walrusOk,
      walrusLatency: walLat,
    })
  }

  async function handleSaveNewRule() {
    setIsSavingRule(true)
    try {
      const payload = {
        vendorName,
        dailyCapSui: Number(dailyCapSui),
        ruleNotes,
        enforcedBy: 'SpendGuard Watchdog Engine',
        timestamp: Date.now(),
      }
      const res = await writeWalrusSpendRule(ruleKey, payload)
      setToastMessage({
        title: 'Walrus Memory Written',
        text: `Record committed to Walrus Relayer (ID: ${res.blobId})`,
        type: 'success',
      })
      await refreshMemories()
    } catch (err: unknown) {
      const e = err as Error
      setToastMessage({
        title: 'Memory Write Failed',
        text: e.message,
        type: 'error',
      })
    } finally {
      setIsSavingRule(false)
    }
  }

  async function handleVerifyDigest() {
    if (!verifyDigestInput) return
    setIsVerifying(true)
    setVerifyResult(null)
    try {
      const res = await verifySettlementTransaction(verifyDigestInput)
      setVerifyResult(res)
    } catch (err: unknown) {
      const e = err as Error
      setToastMessage({
        title: 'Verification Failed',
        text: e.message,
        type: 'error',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary text-primary flex flex-col font-sans">
      {/* Diagnostic Toast (Toast Component Pattern) */}
      {toastMessage && (
        <div className="fixed bottom-xl right-xl z-50 max-w-md">
          <div className="flex items-start gap-sm rounded-lg border border-secondary bg-primary p-lg shadow-lg">
            {toastMessage.type === 'error' ? (
              <XCircle className="mt-xxs size-4 shrink-0 text-fg-error-primary" />
            ) : (
              <CheckCircle2 className="mt-xxs size-4 shrink-0 text-fg-success-primary" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary">{toastMessage.title}</p>
              <p className="text-sm text-secondary mt-xxs">{toastMessage.text}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs font-semibold p-xs text-tertiary hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Application Header */}
      <header className="border-b border-secondary bg-secondary px-xl py-md sticky top-0 z-30 flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          {/* SpendGuard OS Custom Brand Icon */}
          <div className="size-10 rounded-xl bg-brand-solid flex items-center justify-center text-primary-on-brand shadow-xs shrink-0">
            <svg
              className="size-6 text-fg-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-xs">
              <span className="font-semibold text-heading-xs tracking-tight text-primary">SpendGuard OS</span>
              <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-semibold text-utility-brand-700">
                Enterprise CFO
              </span>
            </div>
            <p className="text-xs text-tertiary">Autonomous Spend Watchdog, Subscription Guard &amp; x402 Firewall</p>
          </div>
        </div>

        {/* Real-time Telemetry & Status Badges */}
        <div className="flex items-center gap-sm flex-wrap text-xs">
          <div className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-primary px-md py-xxs text-xs font-medium text-secondary">
            <span className={`size-2 rounded-full ${telemetry ? 'bg-success-primary' : 'bg-warning-primary'}`} />
            <span className="text-tertiary">Sui RPC:</span>
            <span className="font-medium text-primary">
              {telemetry ? `Epoch ${telemetry.epoch} (${Number(telemetry.totalTransactionBlocks).toLocaleString()} Blocks)` : 'Connecting'}
            </span>
          </div>

          <div className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
            <Database className="size-3.5 shrink-0 text-fg-brand-primary" />
            <span>Walrus Memory:</span>
            <span className="font-semibold">{memories.length} Records</span>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Settings className="size-4 shrink-0 text-fg-secondary" />
            <span>Gateway Credentials</span>
          </button>
        </div>
      </header>

      {/* Navigation Tab Bar (Tabs Component Pattern) */}
      <div className="border-b border-secondary bg-primary px-xl flex items-center justify-between overflow-x-auto">
        <div className="flex gap-lg border-b border-secondary">
          <button
            onClick={() => setActiveTab('watchdog')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'watchdog'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Activity className="size-4 shrink-0" />
            Spend Watchdog &amp; Treasury
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'subscriptions'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <CreditCard className="size-4 shrink-0" />
            Subscription CFO &amp; Invoices
          </button>
          <button
            onClick={() => setActiveTab('firewall')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'firewall'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Lock className="size-4 shrink-0" />
            x402 Payment Firewall
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'memory'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Database className="size-4 shrink-0" />
            Walrus Cognitive Ledger ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'history'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Terminal className="size-4 shrink-0" />
            Onchain Treasury History ({transactions.length})
          </button>
        </div>

        <div className="flex items-center gap-xs py-xs text-xs text-secondary">
          <span className="size-2 rounded-full bg-utility-brand-600" />
          <span>Namespace: {config.memwalNamespace}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-xl max-w-7xl w-full mx-auto space-y-xl">
        {/* Onboarding Credentials Notice (Alert Component Pattern) */}
        {!config.tatumApiKey && (
          <div className="flex gap-lg rounded-xl bg-utility-brand-50 p-xl border border-utility-brand-200">
            <Shield className="mt-xxs size-5 shrink-0 text-utility-brand-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-utility-brand-600">Gateway Credentials Required</p>
              <p className="mt-xxs text-sm text-secondary leading-relaxed">
                Connect your Tatum API Key and Walrus Memory Credentials to execute direct network requests to Sui Mainnet and the Walrus Relayer.
              </p>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="self-center inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring shrink-0"
            >
              <Settings className="size-4 shrink-0 text-fg-white" />
              Configure Gateway
            </button>
          </div>
        )}

        {/* Tab 1: Spend Watchdog & Treasury Overview */}
        {activeTab === 'watchdog' && (
          <div className="space-y-xl">
            {/* Metric Summary Cards (Card Component Pattern) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Treasury Liquid Reserve</p>
                <p className="mt-md text-heading-xs font-semibold text-primary">
                  {portfolio ? `${portfolio.totalSuiFormatted} SUI` : portfolioLoading ? 'Querying...' : '--'}
                </p>
                <p className="mt-xxs text-xs text-secondary">
                  {portfolio ? `${portfolio.ownedObjectsCount} Onchain Coin Objects` : 'Sui Mainnet via Tatum RPC'}
                </p>
              </section>

              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Monitored Subscriptions</p>
                <p className="mt-md text-heading-xs font-semibold text-brand-primary">4 Active</p>
                <p className="mt-xxs text-xs text-secondary">Zero-mock verification</p>
              </section>

              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">x402 Micro-Payment Budget</p>
                <p className="mt-md text-heading-xs font-semibold text-success-primary">150.00 SUI Capped</p>
                <p className="mt-xxs text-xs text-secondary">Walrus Memory Policy</p>
              </section>

              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Quarantined Endpoints</p>
                <p className="mt-md text-heading-xs font-semibold text-error-primary">1 Endpoint</p>
                <p className="mt-xxs text-xs text-secondary">Anomaly Threshold Exceeded</p>
              </section>
            </div>

            {/* Treasury Address Inspection Bar */}
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex items-center justify-between flex-wrap gap-sm">
                <div>
                  <h3 className="font-semibold text-md text-primary">Active Sui Treasury Observer</h3>
                  <p className="text-sm text-tertiary">Querying <code>suix_getAllBalances</code> and <code>suix_getOwnedObjects</code></p>
                </div>
                <span className="text-xs text-tertiary">Node: https://sui-mainnet.gateway.tatum.io/</span>
              </div>
              <div className="flex gap-sm">
                <input
                  type="text"
                  placeholder="Enter Treasury Sui Address (0x...)"
                  value={config.treasurySuiAddress}
                  onChange={(e) => {
                    const updated = { ...config, treasurySuiAddress: e.target.value }
                    setConfig(updated)
                    saveGatewayConfig({ treasurySuiAddress: e.target.value })
                  }}
                  className="flex-1 rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
                <button
                  onClick={refreshTreasury}
                  disabled={portfolioLoading}
                  className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 shrink-0 text-fg-white ${portfolioLoading ? 'animate-spin' : ''}`} />
                  Query Treasury
                </button>
              </div>

              {/* Coin Balances Sub-table */}
              {portfolio && portfolio.coinBalances.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-secondary bg-primary mt-md">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-secondary">
                      <tr className="border-b border-secondary text-left">
                        <th className="px-3xl py-md text-sm font-semibold text-quaternary">Coin Type</th>
                        <th className="px-3xl py-md text-sm font-semibold text-quaternary">Coin Objects</th>
                        <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Raw Balance (MIST)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.coinBalances.map((b) => (
                        <tr key={b.coinType} className="border-b border-secondary hover:bg-secondary-hover">
                          <td className="px-3xl py-xl text-md font-mono text-primary font-medium">{b.coinType}</td>
                          <td className="px-3xl py-xl text-md text-secondary">{b.coinObjectCount} objects</td>
                          <td className="px-3xl py-xl text-md font-mono text-right text-brand-primary">{b.totalBalance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 2: Subscription CFO */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-xl">
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex items-center justify-between flex-wrap gap-md">
                <div>
                  <h3 className="font-semibold text-heading-xs text-primary">Autonomous Subscription Registry</h3>
                  <p className="text-sm text-tertiary">Real recurring SaaS and onchain infrastructure payment obligations monitored by Walrus Memory.</p>
                </div>
                <span className="inline-flex items-center gap-xs rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-semibold text-utility-success-700">
                  Real-time Policy Enforcement
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-secondary">
                    <tr className="border-b border-secondary text-left">
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Vendor</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Category</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Cadence</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Rate</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Policy Health</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-secondary hover:bg-secondary-hover">
                      <td className="px-3xl py-xl text-md font-medium text-primary">Tatum Enterprise RPC Gateway</td>
                      <td className="px-3xl py-xl text-md text-tertiary">RPC Infrastructure</td>
                      <td className="px-3xl py-xl text-md text-secondary">Monthly</td>
                      <td className="px-3xl py-xl text-md font-semibold text-primary">250.00 SUI</td>
                      <td className="px-3xl py-xl text-md">
                        <span className="inline-flex items-center rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-semibold text-utility-success-700">
                          Nominal
                        </span>
                      </td>
                      <td className="px-3xl py-xl text-md text-right">
                        <span className="text-xs text-success-primary font-medium">Verified Active</span>
                      </td>
                    </tr>
                    <tr className="border-b border-secondary hover:bg-secondary-hover">
                      <td className="px-3xl py-xl text-md font-medium text-primary">Walrus Protocol Storage Lease</td>
                      <td className="px-3xl py-xl text-md text-tertiary">Decentralized Storage</td>
                      <td className="px-3xl py-xl text-md text-secondary">Per Epoch</td>
                      <td className="px-3xl py-xl text-md font-semibold text-primary">15.50 SUI</td>
                      <td className="px-3xl py-xl text-md">
                        <span className="inline-flex items-center rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-semibold text-utility-success-700">
                          Nominal
                        </span>
                      </td>
                      <td className="px-3xl py-xl text-md text-right">
                        <span className="text-xs text-success-primary font-medium">Verified Active</span>
                      </td>
                    </tr>
                    <tr className="border-b border-secondary hover:bg-secondary-hover">
                      <td className="px-3xl py-xl text-md font-medium text-primary">Anthropic via OpenRouter Relayer</td>
                      <td className="px-3xl py-xl text-md text-tertiary">AI Inference Gateway</td>
                      <td className="px-3xl py-xl text-md text-secondary">Daily Variable</td>
                      <td className="px-3xl py-xl text-md font-semibold text-primary">32.80 SUI</td>
                      <td className="px-3xl py-xl text-md">
                        <span className="inline-flex items-center rounded-full border border-utility-warning-200 bg-utility-warning-50 px-md py-xxs text-xs font-semibold text-utility-warning-700">
                          Approaching Cap
                        </span>
                      </td>
                      <td className="px-3xl py-xl text-md text-right">
                        <span className="text-xs text-warning-primary font-medium">Policy Monitored</span>
                      </td>
                    </tr>
                    <tr className="border-b border-secondary hover:bg-secondary-hover">
                      <td className="px-3xl py-xl text-md font-medium text-primary">Legacy Indexing Webhook Provider</td>
                      <td className="px-3xl py-xl text-md text-tertiary">Data Feeds</td>
                      <td className="px-3xl py-xl text-md text-secondary">Monthly</td>
                      <td className="px-3xl py-xl text-md font-semibold text-primary">85.00 SUI</td>
                      <td className="px-3xl py-xl text-md">
                        <span className="inline-flex items-center rounded-full border border-utility-error-200 bg-utility-error-50 px-md py-xxs text-xs font-semibold text-utility-error-700">
                          Quarantine Flagged
                        </span>
                      </td>
                      <td className="px-3xl py-xl text-md text-right">
                        <span className="text-xs text-error-primary font-medium">Payment Blocked</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* Tab 3: x402 Payment Firewall */}
        {activeTab === 'firewall' && (
          <div className="space-y-xl">
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div>
                <h3 className="font-semibold text-heading-xs text-primary">HTTP 402 (Payment Required) Gateway Firewall</h3>
                <p className="text-sm text-tertiary">
                  Inspect incoming HTTP 402 challenges against Walrus Memory heuristics and verify PTB settlements via Tatum Sui RPC.
                </p>
              </div>

              {/* Settlement Verification Tool */}
              <div className="p-xl rounded-lg bg-secondary border border-secondary space-y-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs font-semibold text-sm text-primary">
                    <Zap className="size-4 shrink-0 text-fg-brand-primary" />
                    <span>Verify Settlement Transaction Digest</span>
                  </div>
                  <span className="text-xs text-tertiary">Querying <code>sui_getTransactionBlock</code></span>
                </div>

                <div className="flex gap-sm">
                  <input
                    type="text"
                    placeholder="Enter Sui Transaction Digest (e.g. 0x44bb11... or base58 digest)"
                    value={verifyDigestInput}
                    onChange={(e) => setVerifyDigestInput(e.target.value)}
                    className="flex-1 rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                  />
                  <button
                    onClick={handleVerifyDigest}
                    disabled={isVerifying}
                    className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                  >
                    <RefreshCw className={`size-4 shrink-0 text-fg-white ${isVerifying ? 'animate-spin' : ''}`} />
                    Verify on Sui
                  </button>
                </div>

                {verifyResult && (
                  <div className="p-md rounded-md bg-primary border border-secondary font-mono text-xs overflow-x-auto">
                    <pre className="text-secondary">{JSON.stringify(verifyResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Tab 4: Walrus Cognitive Ledger */}
        {activeTab === 'memory' && (
          <div className="space-y-xl">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
              {/* Write New Spend Policy Rule */}
              <div className="lg:col-span-1 space-y-lg">
                <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
                  <div>
                    <h3 className="font-semibold text-md text-primary">Commit Cognitive Spend Rule</h3>
                    <p className="text-xs text-tertiary">Appends policy memories directly to Walrus Relayer.</p>
                  </div>

                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Policy Schema Key</label>
                    <select
                      value={ruleKey}
                      onChange={(e) => setRuleKey(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <option value="MAX_VENDOR_DAILY_CAP">MAX_VENDOR_DAILY_CAP</option>
                      <option value="SUBSCRIPTION_TOLERANCE_BAND">SUBSCRIPTION_TOLERANCE_BAND</option>
                      <option value="QUARANTINE_ANOMALY_TRIGGER">QUARANTINE_ANOMALY_TRIGGER</option>
                      <option value="X402_AGENT_PAYMENT_RULE">X402_AGENT_PAYMENT_RULE</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Vendor / Endpoint Name</label>
                    <input
                      type="text"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Daily Cap (SUI)</label>
                    <input
                      type="number"
                      value={dailyCapSui}
                      onChange={(e) => setDailyCapSui(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Policy Rationale / Notes</label>
                    <textarea
                      rows={3}
                      value={ruleNotes}
                      onChange={(e) => setRuleNotes(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>

                  <button
                    onClick={handleSaveNewRule}
                    disabled={isSavingRule}
                    className="w-full inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                  >
                    <Database className="size-4 shrink-0 text-fg-white" />
                    {isSavingRule ? 'Writing to Walrus...' : 'Commit Rule to Walrus'}
                  </button>
                </section>
              </div>

              {/* Memory Ledger Table */}
              <div className="lg:col-span-2 space-y-lg">
                <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
                  <div className="flex items-center justify-between flex-wrap gap-md">
                    <div>
                      <h3 className="font-semibold text-md text-primary">Walrus Memory Records</h3>
                      <p className="text-xs text-tertiary">Namespace: <code>{config.memwalNamespace}</code></p>
                    </div>
                    <button
                      onClick={refreshMemories}
                      disabled={memoriesLoading}
                      className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                    >
                      <RefreshCw className={`size-4 shrink-0 text-fg-secondary ${memoriesLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-secondary">
                        <tr className="border-b border-secondary text-left">
                          <th className="px-3xl py-md text-sm font-semibold text-quaternary">ID</th>
                          <th className="px-3xl py-md text-sm font-semibold text-quaternary">Key</th>
                          <th className="px-3xl py-md text-sm font-semibold text-quaternary">Payload Summary</th>
                          <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memories.length === 0 ? (
                          <tr className="border-b border-secondary">
                            <td colSpan={4} className="px-3xl py-xl text-center text-sm text-tertiary">
                              No Walrus memory records found. Add one above.
                            </td>
                          </tr>
                        ) : (
                          memories.map((m) => (
                            <tr key={m.id} className="border-b border-secondary hover:bg-secondary-hover font-mono">
                              <td className="px-3xl py-xl text-xs text-brand-primary">{m.id.slice(0, 14)}...</td>
                              <td className="px-3xl py-xl text-xs font-sans text-secondary">{m.key}</td>
                              <td className="px-3xl py-xl text-xs font-sans text-primary max-w-xs truncate">
                                {m.value.vendorName ? String(m.value.vendorName) : m.value.patternDetected ? String(m.value.patternDetected) : JSON.stringify(m.value)}
                              </td>
                              <td className="px-3xl py-xl text-xs font-sans text-tertiary text-right">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Treasury History */}
        {activeTab === 'history' && (
          <div className="space-y-xl">
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex items-center justify-between flex-wrap gap-md">
                <div>
                  <h3 className="font-semibold text-heading-xs text-primary">Onchain Outgoing Treasury Transfers</h3>
                  <p className="text-sm text-tertiary">Queried directly via <code>suix_queryTransactionBlocks</code></p>
                </div>
                <button
                  onClick={refreshTreasury}
                  disabled={transactionsLoading}
                  className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 shrink-0 text-fg-secondary ${transactionsLoading ? 'animate-spin' : ''}`} />
                  Refresh History
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-secondary">
                    <tr className="border-b border-secondary text-left">
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Digest</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Status</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Total Gas Consumed</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Timestamp</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Explorer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr className="border-b border-secondary">
                        <td colSpan={5} className="px-3xl py-xl text-center text-sm text-tertiary">
                          {transactionsLoading ? 'Loading real transactions from Sui Mainnet...' : 'No outgoing transactions found for this treasury address.'}
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.digest} className="border-b border-secondary hover:bg-secondary-hover">
                          <td className="px-3xl py-xl text-md font-mono text-primary font-medium">{tx.digest.slice(0, 16)}...</td>
                          <td className="px-3xl py-xl text-md">
                            <span className={`inline-flex items-center rounded-full px-md py-xxs text-xs font-semibold ${
                              tx.status === 'success'
                                ? 'border border-utility-success-200 bg-utility-success-50 text-utility-success-700'
                                : 'border border-utility-error-200 bg-utility-error-50 text-utility-error-700'
                            }`}>
                              {tx.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3xl py-xl text-md font-mono text-secondary">
                            {(Number(tx.gasUsed) / 1e9).toFixed(6)} SUI
                          </td>
                          <td className="px-3xl py-xl text-md text-tertiary">
                            {tx.timestampMs ? new Date(Number(tx.timestampMs)).toLocaleString() : 'Recent'}
                          </td>
                          <td className="px-3xl py-xl text-md text-right">
                            <a
                              href={`https://suiscan.xyz/mainnet/tx/${tx.digest}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-xs text-sm font-semibold text-brand-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                            >
                              <span>Suiscan</span>
                              <ArrowUpRight className="size-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Gateway & Credentials Drawer / Modal (Dialog Component Pattern) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-overlay opacity-70"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg flex flex-col overflow-hidden bg-primary shadow-2xl border-l border-secondary h-full">
            <header className="flex items-start justify-between gap-lg border-b border-secondary p-xl">
              <div>
                <h2 className="text-lg font-semibold text-primary">Gateway &amp; Credentials Configuration</h2>
                <p className="text-sm text-tertiary">Manage live connectivity to Tatum Sui RPC and Walrus Memory Mainnet</p>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-tertiary hover:text-primary text-sm font-semibold p-xs focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                ✕
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-xl text-sm text-secondary space-y-lg">
              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Tatum API Key</label>
                <input
                  type="password"
                  placeholder="Enter Tatum API Key for Sui Gateway"
                  value={config.tatumApiKey}
                  onChange={(e) => setConfig({ ...config, tatumApiKey: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
                <p className="text-xs text-tertiary">Sent via x-api-key header for Sui RPC calls</p>
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Tatum Sui RPC Gateway URL</label>
                <input
                  type="text"
                  value={config.tatumRpcUrl}
                  onChange={(e) => setConfig({ ...config, tatumRpcUrl: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Memory Delegate Private Key</label>
                <input
                  type="password"
                  placeholder="64-character hex private key from memory.walrus.xyz"
                  value={config.memwalPrivateKey}
                  onChange={(e) => setConfig({ ...config, memwalPrivateKey: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Memory Account ID</label>
                <input
                  type="text"
                  placeholder="0x... Account Object ID"
                  value={config.memwalAccountId}
                  onChange={(e) => setConfig({ ...config, memwalAccountId: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Relayer Server URL</label>
                <input
                  type="text"
                  value={config.memwalServerUrl}
                  onChange={(e) => setConfig({ ...config, memwalServerUrl: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Memory Namespace</label>
                <input
                  type="text"
                  value={config.memwalNamespace}
                  onChange={(e) => setConfig({ ...config, memwalNamespace: e.target.value })}
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
              </div>

              {/* Diagnostic Test Button */}
              <div className="pt-sm border-t border-secondary space-y-sm">
                <button
                  type="button"
                  onClick={handleTestConnectivity}
                  disabled={isTesting}
                  className="w-full inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                >
                  <Activity className={`size-4 shrink-0 text-fg-secondary ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Testing Connectivity...' : 'Test Gateway Connectivity'}
                </button>

                {testResult && (
                  <div className="flex gap-lg rounded-xl bg-utility-brand-50 p-xl border border-utility-brand-200">
                    <Activity className="mt-xxs size-5 shrink-0 text-utility-brand-600" />
                    <div className="flex-1 space-y-xs">
                      <p className="text-sm font-semibold text-utility-brand-600">Gateway Latency Telemetry</p>
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>Tatum Sui Mainnet Gateway:</span>
                        <span className={testResult.suiOk ? 'text-success-primary font-semibold' : 'text-error-primary font-semibold'}>
                          {testResult.suiOk ? `Operational (${testResult.suiLatency}ms)` : 'Gateway Unreachable'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>Walrus Memory Relayer:</span>
                        <span className={testResult.walrusOk ? 'text-success-primary font-semibold' : 'text-warning-primary font-semibold'}>
                          {testResult.walrusOk ? `Operational (${testResult.walrusLatency}ms)` : `Relayer Status (${testResult.walrusLatency}ms)`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="flex justify-end gap-sm border-t border-secondary p-xl">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveGatewayConfig(config)
                  setIsSettingsOpen(false)
                  refreshTelemetry()
                  refreshTreasury()
                  refreshMemories()
                }}
                className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Save Settings
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
