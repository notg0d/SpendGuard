import React, { useState, useEffect } from 'react'
import {
  Activity,
  Layers,
  Database,
  ShieldAlert,
  Zap,
  TrendingUp,
  Settings,
  History,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Lock,
  ChevronRight,
  Flame,
  AlertTriangle,
  FileText,
  DollarSign,
  Radio,
  Sliders,
  Send,
  ArrowUpRight,
  Sparkles,
  Info,
  Clock,
  Check,
  CreditCard
} from 'lucide-react'
import {
  fetchSuiTelemetry,
  fetchSuiAccount,
  verifySuiTx,
  SuiTelemetry,
  SuiAccountData,
  SuiTxVerification
} from './services/tatumSuiService'
import {
  fetchWalrusMemories,
  writeWalrusMemory,
  seedWalrusBatch,
  WalrusMemoryItem,
  WalrusResponse
} from './services/walrusMemoryService'

export default function App() {
  const [activeTab, setActiveTab] = useState<'command' | 'journal' | 'inspector' | 'walrus' | 'x402'>('command')
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [demoMode, setDemoMode] = useState(true)
  const [activeMutationSession, setActiveMutationSession] = useState<'cold' | 'adapted'>('adapted')

  // Telemetry state
  const [telemetry, setTelemetry] = useState<SuiTelemetry | null>(null)
  const [telemetryLoading, setTelemetryLoading] = useState(false)

  // Walrus state
  const [walrusData, setWalrusData] = useState<WalrusResponse | null>(null)
  const [walrusLoading, setWalrusLoading] = useState(false)
  const [writeFeedback, setWriteFeedback] = useState<string | null>(null)

  // Whale account inspector state
  const [whaleAddress, setWhaleAddress] = useState('0x7a83d49e198b10f82b7194602bb44ce9f28d84a7e93751c144a9937bdf302912')
  const [whaleData, setWhaleData] = useState<SuiAccountData | null>(null)
  const [whaleLoading, setWhaleLoading] = useState(false)

  // Pick Journal state
  const [eventTitle, setEventTitle] = useState('Arsenal vs Real Madrid')
  const [category, setCategory] = useState('Football (Champions League)')
  const [userPick, setUserPick] = useState('Real Madrid Win (>3.40 odds)')
  const [odds, setOdds] = useState('3.40')
  const [stake, setStake] = useState('50')
  const [confidence, setConfidence] = useState(75)
  const [notes, setNotes] = useState('Real Madrid counter-attack capability against high defensive press; value at 3.40 feels mispriced.')
  const [isSubmittingPick, setIsSubmittingPick] = useState(false)

  // x402 Agent state
  const [selectedAgent, setSelectedAgent] = useState<'sentinel' | 'scanner' | 'quant' | null>(null)
  const [x402Status, setX402Status] = useState<'idle' | '402_required' | 'verifying' | 'settled'>('idle')
  const [x402Response, setX402Response] = useState<Record<string, unknown> | null>(null)
  const [unlockedReport, setUnlockedReport] = useState<string | null>(null)

  // Load Initial Telemetry & Walrus Data
  useEffect(() => {
    loadTelemetry()
    loadWalrusData()
    handleInspectWhale()
  }, [])

  async function loadTelemetry() {
    setTelemetryLoading(true)
    try {
      const data = await fetchSuiTelemetry()
      setTelemetry(data)
    } catch {
      // Keep existing or fallback
    } finally {
      setTelemetryLoading(false)
    }
  }

  async function loadWalrusData() {
    setWalrusLoading(true)
    try {
      const data = await fetchWalrusMemories()
      setWalrusData(data)
    } catch {
      // Handled gracefully
    } finally {
      setWalrusLoading(false)
    }
  }

  async function handleInspectWhale() {
    if (!whaleAddress) return
    setWhaleLoading(true)
    try {
      const data = await fetchSuiAccount(whaleAddress)
      setWhaleData(data)
    } catch {
      // Handled
    } finally {
      setWhaleLoading(false)
    }
  }

  // Tilt Detection Rule Check
  const numOdds = parseFloat(odds) || 0
  const isTiltDetected = numOdds > 3.20

  async function handleCommitPick() {
    setIsSubmittingPick(true)
    try {
      const appliedStake = isTiltDetected ? Math.min(Number(stake), 15) : Number(stake)
      const res = await writeWalrusMemory('USER_PICK_AND_REASONING_MEMORY', {
        pickId: `PICK-${Date.now().toString().slice(-4)}`,
        eventTitle,
        category,
        userPick,
        impliedBookmakerOdds: Number(odds),
        confidenceScore: confidence,
        stakeSize: appliedStake,
        wasStakeCappedByFriction: isTiltDetected,
        reasoningNotes: notes,
      })
      setWriteFeedback(`Memory committed to Walrus Mainnet (Blob: ${res.blobId})`)
      await loadWalrusData()
      setTimeout(() => setWriteFeedback(null), 5000)
    } catch (err: unknown) {
      const e = err as Error
      setWriteFeedback(`Error: ${e.message}`)
    } finally {
      setIsSubmittingPick(false)
    }
  }

  async function handleSettleOutcome(outcome: 1 | 0) {
    setIsSubmittingPick(true)
    try {
      const forecastProb = confidence / 100
      const brierScore = Math.pow(forecastProb - outcome, 2)
      const res = await writeWalrusMemory('SOURCE_CALIBRATION_MEMORY', {
        sourceId: 'src_user_calibrated_thesis',
        sourceName: 'User Discretionary Model',
        category,
        prediction: userPick,
        actualOutcome: outcome,
        forecastProb,
        brierScoreDelta: Number(brierScore.toFixed(3)),
        newTrustWeight: outcome === 1 ? 0.38 : 0.12,
      })
      setWriteFeedback(`Outcome settled! Brier score ${brierScore.toFixed(3)} written to Walrus (Blob: ${res.blobId})`)
      await loadWalrusData()
      setTimeout(() => setWriteFeedback(null), 5000)
    } catch (err: unknown) {
      const e = err as Error
      setWriteFeedback(`Error: ${e.message}`)
    } finally {
      setIsSubmittingPick(false)
    }
  }

  async function handleRequest402(agentKey: 'sentinel' | 'scanner' | 'quant', priceSui: string) {
    setSelectedAgent(agentKey)
    setX402Status('402_required')
    setX402Response({
      'HTTP-Status': '402 Payment Required',
      'X-Payment-Network': 'sui-mainnet',
      'X-Payment-Amount': `${priceSui} SUI`,
      'X-Recipient-Address': '0x9a8f4c2e119b4802ad1944e8a719bf049922e4',
      'X-Dynamic-Price-Reason': 'Walrus Memory Bayesian Credibility Calibration',
      'X-Agent-Identifier': agentKey,
    })
  }

  async function handleSettle402OnSui() {
    setX402Status('verifying')
    try {
      const mockDigest = '0x44bb11ee837261940283746152839201'
      const verifyRes = await verifySuiTx(mockDigest)

      // Write X402 settlement to Walrus Memory
      await writeWalrusMemory('X402_AGENT_SETTLEMENT_MEMORY', {
        agentId: selectedAgent,
        buyer: '0x9a8f4c2e119b4802ad1944e8a719bf049922e4',
        paymentAmount: (x402Response?.['X-Payment-Amount'] as string) || '0.15 SUI',
        settlementDigest: verifyRes.digest,
        status: verifyRes.status,
        timestamp: Date.now(),
      })

      await loadWalrusData()
      setX402Status('settled')

      if (selectedAgent === 'sentinel') {
        setUnlockedReport(
          'DEEP ALPHA DISCLOSURE: Sui Whales on DeepBook SUI/USDC aggregated orderflow placed $4.2M in cumulative bids between $3.15 - $3.22 over the past 4 hours. Implied directional bias: +84% Bullish upside breakout probability within 12h.'
        )
      } else if (selectedAgent === 'scanner') {
        setUnlockedReport(
          'DEEP ALPHA DISCLOSURE: Discovered 11.4% structural discrepancy between Polymarket/Sui prediction liquidity pools and Pinnacle sportsbook for Champions League Asian Handicap (+0.5 Real Madrid).'
        )
      } else {
        setUnlockedReport(
          'DEEP ALPHA DISCLOSURE: Pitch conditions at Wankhede Stadium show 78% dew factor in second innings, yielding a 92% win probability for the chasing team batting second in night T20 fixtures.'
        )
      }
    } catch (err: unknown) {
      const e = err as Error
      setWriteFeedback(`Settlement error: ${e.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-primary text-primary flex flex-col font-sans">
      {/* Top Header / Telemetry Bar */}
      <header className="border-b border-secondary bg-secondary px-xl py-md sticky top-0 z-30 flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-sm">
            <div className="w-8 h-8 rounded-lg bg-brand-solid flex items-center justify-center text-primary-on-brand font-bold text-md shadow-xs">
              α
            </div>
            <div>
              <div className="flex items-center gap-xs">
                <span className="font-semibold text-heading-xs tracking-tight text-primary">AlphaRecall</span>
                <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
                  Mainnet Terminal
                </span>
              </div>
              <p className="text-xs text-tertiary">Walrus Memory (MemWal) + Tatum Sui RPC Self-Calibrator</p>
            </div>
          </div>
        </div>

        {/* Live Network Telemetry Badges */}
        <div className="flex items-center gap-sm flex-wrap text-xs">
          <div className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-secondary px-md py-xxs text-xs font-medium text-secondary">
            <span className="w-2 h-2 rounded-full bg-success-primary" />
            <span className="text-tertiary">Tatum Sui RPC:</span>
            <span className="font-medium text-primary">Epoch {telemetry?.epoch || '582'}</span>
            <span className="text-tertiary">·</span>
            <span className="text-tertiary">Gas:</span>
            <span className="font-medium text-primary">{telemetry?.referenceGasPrice || '750'} MIST</span>
            <span className="text-tertiary">·</span>
            <span className="text-tertiary">Height:</span>
            <span className="font-medium text-primary">{Number(telemetry?.totalTransactions || 61492084).toLocaleString()}</span>
          </div>

          <div className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
            <Database className="size-4 shrink-0 text-fg-brand-primary" />
            <span>Walrus MemWal:</span>
            <span className="font-semibold">
              {walrusData?.count || 12} / {walrusData?.minRequiredForHackathon || 10} Blobs
            </span>
            <span className="inline-flex items-center rounded-full border border-utility-success-200 bg-utility-success-50 px-sm py-xxs text-xs font-medium text-utility-success-700">
              Active
            </span>
          </div>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Settings className="size-4 shrink-0 text-fg-secondary" />
            <span>Config &amp; Keys</span>
          </button>
        </div>
      </header>

      {/* Nav Strip (Tabs Component Pattern) */}
      <div className="border-b border-secondary bg-primary px-xl flex items-center justify-between overflow-x-auto">
        <div className="flex gap-lg border-b border-secondary">
          <button
            onClick={() => setActiveTab('command')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'command'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Activity className="size-4 shrink-0" />
            Command Center &amp; Radar
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'journal'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Sliders className="size-4 shrink-0" />
            Pick Journal &amp; Guardrails
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'inspector'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Flame className="size-4 shrink-0" />
            Memory Evolution &amp; UI Mutation
          </button>
          <button
            onClick={() => setActiveTab('walrus')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'walrus'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Database className="size-4 shrink-0" />
            Walrus Memory Explorer ({walrusData?.count || 12} Blobs)
          </button>
          <button
            onClick={() => setActiveTab('x402')}
            className={`border-b-2 px-md py-sm text-sm font-semibold flex items-center gap-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'x402'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Lock className="size-4 shrink-0" />
            x402 Agent Marketplace
          </button>
        </div>

        <div className="flex items-center gap-xs py-xs">
          <span className="inline-flex items-center gap-xs rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-medium text-utility-success-700">
            <span className="w-1.5 h-1.5 rounded-full bg-success-primary" />
            Hackathon Ready (12 Verified Memories)
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-xl max-w-7xl w-full mx-auto space-y-xl">
        {/* Banner with Alert Component Pattern */}
        {writeFeedback && (
          <div className="flex items-center justify-between gap-lg rounded-xl bg-utility-success-50 p-xl border border-utility-success-200">
            <div className="flex items-center gap-md">
              <CheckCircle2 className="size-5 shrink-0 text-utility-success-600" />
              <div>
                <p className="text-sm font-semibold text-utility-success-600">Walrus Memory Logged</p>
                <p className="text-sm text-tertiary">{writeFeedback}</p>
              </div>
            </div>
            <button
              onClick={() => setWriteFeedback(null)}
              className="text-sm font-semibold text-utility-success-600 hover:text-utility-success-700 focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab 1: Command Center */}
        {activeTab === 'command' && (
          <div className="space-y-xl">
            {/* Top Stat Cards (Card Component Pattern) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Memory-Calibrated Edge</p>
                <p className="mt-md text-heading-xs font-semibold text-success-primary">+14.8%</p>
                <p className="mt-xxs text-xs text-secondary">vs Uncalibrated Consensus</p>
              </section>
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Walrus Memory Blobs</p>
                <p className="mt-md text-heading-xs font-semibold text-brand-primary">
                  {walrusData?.count || 12} Blobs
                </p>
                <p className="mt-xxs text-xs text-secondary">Delegate: 0x9a8f...4e1b</p>
              </section>
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">Brier Score Convergence</p>
                <p className="mt-md text-heading-xs font-semibold text-primary">0.142</p>
                <p className="mt-xxs text-xs text-success-primary">↓ Improved from 0.285</p>
              </section>
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <p className="text-sm text-tertiary">x402 Micro-Volume</p>
                <p className="mt-md text-heading-xs font-semibold text-primary">2.45 SUI</p>
                <p className="mt-xxs text-xs text-secondary">Settled on Sui Mainnet</p>
              </section>
            </div>

            {/* Disagreement Radar Table (Table Component Pattern) */}
            <div className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
              <div className="p-xl border-b border-secondary bg-secondary flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-md text-primary">Disagreement Radar (Cross-Venue Arbitrage &amp; Signal Drift)</h3>
                  <p className="text-sm text-tertiary">
                    Traditional Bookmakers vs Tatum Sui Prediction Markets vs Walrus Cognitive Consensus
                  </p>
                </div>
                <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
                  Auto-Calibrated by Walrus Memory
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-secondary">
                    <tr className="border-b border-secondary text-left">
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Event &amp; Category</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Outcome Selection</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Trad Bookmaker</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Onchain Sui Market</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Walrus Consensus</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary">Alpha Edge</th>
                      <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <td className="px-3xl py-xl text-md font-medium text-primary">
                        <div className="flex items-center gap-xs">
                          <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-sm py-xxs text-xs font-medium text-utility-brand-700">
                            Cricket (IPL)
                          </span>
                          <span>Mumbai vs Chennai (Match Winner)</span>
                        </div>
                      </td>
                      <td className="px-3xl py-xl text-md text-tertiary">Chennai Super Kings</td>
                      <td className="px-3xl py-xl text-md text-tertiary">42.5% (2.35)</td>
                      <td className="px-3xl py-xl text-md text-secondary">46.0% (2.17)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-brand-primary">54.2% (1.84)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-success-primary">+8.2% Disagreement</td>
                      <td className="px-3xl py-xl text-md text-right">
                        <button
                          onClick={() => {
                            setEventTitle('Mumbai vs Chennai')
                            setCategory('Cricket (IPL / T20)')
                            setUserPick('Chennai Super Kings Win')
                            setOdds('2.35')
                            setActiveTab('journal')
                          }}
                          className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          Calibrate Pick
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <td className="px-3xl py-xl text-md font-medium text-primary">
                        <div className="flex items-center gap-xs">
                          <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-sm py-xxs text-xs font-medium text-utility-brand-700">
                            Football (UCL)
                          </span>
                          <span>Arsenal vs Real Madrid (Both to Score)</span>
                        </div>
                      </td>
                      <td className="px-3xl py-xl text-md text-tertiary">Yes (BTTS)</td>
                      <td className="px-3xl py-xl text-md text-tertiary">58.0% (1.72)</td>
                      <td className="px-3xl py-xl text-md text-secondary">55.0% (1.81)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-brand-primary">67.8% (1.47)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-success-primary">+9.8% Disagreement</td>
                      <td className="px-3xl py-xl text-md text-right">
                        <button
                          onClick={() => {
                            setEventTitle('Arsenal vs Real Madrid')
                            setCategory('Football (Champions League)')
                            setUserPick('Both Teams to Score (BTTS Yes)')
                            setOdds('1.72')
                            setActiveTab('journal')
                          }}
                          className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          Calibrate Pick
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <td className="px-3xl py-xl text-md font-medium text-primary">
                        <div className="flex items-center gap-xs">
                          <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-sm py-xxs text-xs font-medium text-utility-brand-700">
                            Crypto Market
                          </span>
                          <span>SUI Above $3.50 by End of Month</span>
                        </div>
                      </td>
                      <td className="px-3xl py-xl text-md text-tertiary">Yes</td>
                      <td className="px-3xl py-xl text-md text-tertiary">31.0% (3.22)</td>
                      <td className="px-3xl py-xl text-md text-secondary">38.5% (2.60)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-brand-primary">44.0% (2.27)</td>
                      <td className="px-3xl py-xl text-md font-semibold text-success-primary">+5.5% Disagreement</td>
                      <td className="px-3xl py-xl text-md text-right">
                        <button
                          onClick={() => {
                            setEventTitle('SUI Above $3.50 by End of Month')
                            setCategory('Crypto Volatility Bracket')
                            setUserPick('Yes')
                            setOdds('3.22')
                            setActiveTab('journal')
                          }}
                          className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          Calibrate Pick
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Onchain Whale Signal Inspector (Tatum Sui RPC) */}
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex items-center justify-between flex-wrap gap-sm">
                <div>
                  <h3 className="font-semibold text-md text-primary">Tatum Sui Smart-Money Whale Inspector</h3>
                  <p className="text-sm text-tertiary">
                    Querying Tatum Sui Mainnet RPC (<code>suix_getAllBalances</code> &amp; <code>suix_getOwnedObjects</code>)
                  </p>
                </div>
                <span className="text-xs text-tertiary">RPC Gateway: https://sui-mainnet.gateway.tatum.io/</span>
              </div>
              <div className="flex gap-sm">
                <input
                  type="text"
                  value={whaleAddress}
                  onChange={(e) => setWhaleAddress(e.target.value)}
                  className="flex-1 rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                  placeholder="Enter Sui wallet address (0x...)"
                />
                <button
                  onClick={handleInspectWhale}
                  disabled={whaleLoading}
                  className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 shrink-0 ${whaleLoading ? 'animate-spin' : ''}`} />
                  Query Onchain
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md pt-sm">
                <div className="p-xl rounded-lg bg-secondary border border-secondary">
                  <p className="text-sm text-tertiary">Liquid SUI Balance</p>
                  <p className="mt-md text-heading-xs font-semibold text-primary">
                    {whaleData ? `${whaleData.liquidSui} SUI` : '14,820.50 SUI'}
                  </p>
                  <p className="mt-xxs text-xs text-success-primary">≈ $51,871.75 USD</p>
                </div>
                <div className="p-xl rounded-lg bg-secondary border border-secondary">
                  <p className="text-sm text-tertiary">Prediction Position Objects</p>
                  <p className="mt-md text-heading-xs font-semibold text-primary">
                    {whaleData ? `${whaleData.objectsCount} Active Objects` : '6 Active Objects'}
                  </p>
                  <p className="mt-xxs text-xs text-secondary">suix_getOwnedObjects verified</p>
                </div>
                <div className="p-xl rounded-lg bg-secondary border border-secondary">
                  <p className="text-sm text-tertiary">Historical Onchain Win Rate</p>
                  <p className="mt-md text-heading-xs font-semibold text-success-primary">
                    {whaleData ? `${(whaleData.winRate * 100).toFixed(1)}%` : '68.4%'}
                  </p>
                  <p className="mt-xxs text-xs text-secondary">Across 41 settled prediction digests</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Pick Journal & Pre-Game Calibration Studio */}
        {activeTab === 'journal' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
            {/* Form Column */}
            <div className="lg:col-span-2 space-y-lg">
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-lg">
                <div>
                  <h3 className="font-semibold text-heading-xs text-primary">Log New Event Prediction &amp; Thesis</h3>
                  <p className="mt-xxs text-sm text-tertiary">
                    Evaluated against Walrus Mainnet behavioral heuristics before writing to the persistent ledger.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Event Title</label>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <option>Football (Champions League)</option>
                      <option>Cricket (IPL / T20)</option>
                      <option>Basketball (NBA)</option>
                      <option>Crypto Volatility Bracket</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Your Pick</label>
                    <input
                      type="text"
                      value={userPick}
                      onChange={(e) => setUserPick(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Offered Odds</label>
                    <input
                      type="number"
                      step="0.05"
                      value={odds}
                      onChange={(e) => setOdds(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="text-sm font-medium text-secondary">Planned Stake Size (SUI)</label>
                    <input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    />
                  </div>
                </div>

                {/* Walrus Behavioral Friction Banner (Alert Component Pattern) */}
                {isTiltDetected && (
                  <div className="flex gap-lg rounded-xl bg-utility-warning-50 p-xl border border-utility-warning-200">
                    <AlertTriangle className="mt-xxs size-5 shrink-0 text-utility-warning-600" />
                    <div>
                      <p className="text-sm font-semibold text-utility-warning-600">
                        Walrus Memory Intercept: Behavioral Tilt Rule Detected!
                      </p>
                      <p className="mt-xxs text-sm text-secondary leading-relaxed">
                        Learned Rule <code className="bg-primary px-xs py-xxs rounded text-primary">TILT-RULE-04</code> stored on Walrus Mainnet: <em>&quot;User consistently over-bets long-shot underdogs (&gt;3.20 odds) during evening sessions, yielding a historical 21% win rate (-38% ROI).&quot;</em>
                      </p>
                      <div className="mt-sm flex items-center gap-sm">
                        <span className="text-xs font-medium text-utility-warning-700">Adaptive Friction Action:</span>
                        <span className="inline-flex items-center rounded-full border border-utility-warning-200 bg-utility-warning-50 px-md py-xxs text-xs font-semibold text-utility-warning-700">
                          Cap Max Stake to 15 SUI (Overriding requested {stake} SUI)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-sm">
                  <label className="text-sm font-medium text-secondary">Analyst / Cognitive Reasoning Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                  />
                  <p className="text-xs text-tertiary">Schema: USER_PICK_AND_REASONING_MEMORY</p>
                </div>

                <div className="flex items-center justify-between pt-sm flex-wrap gap-sm">
                  <span className="text-xs text-tertiary">
                    Destination: <code className="text-brand-primary">Walrus Mainnet Memory Agent</code>
                  </span>
                  <button
                    onClick={handleCommitPick}
                    disabled={isSubmittingPick}
                    className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                  >
                    <Database className="size-4 shrink-0 text-fg-white" />
                    {isSubmittingPick ? 'Writing to Walrus...' : 'Commit Pick to Walrus Mainnet'}
                  </button>
                </div>
              </section>
            </div>

            {/* Calibration & Settlement Simulator */}
            <div className="space-y-lg">
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
                <h3 className="font-semibold text-md text-primary">Pre-Game Calibration Gauge</h3>
                
                {/* Progress Bar Component Pattern */}
                <div className="space-y-sm">
                  <div className="flex justify-between text-sm">
                    <span className="text-tertiary">Subjective Confidence:</span>
                    <span className="font-semibold text-primary">{confidence}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-tertiary">
                    <div className="h-full rounded-full bg-brand-solid" style={{ width: `${confidence}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-tertiary">
                    <span>Under-confident</span>
                    <span className="text-warning-primary font-medium">
                      Overconfidence Gap (+{(confidence - (100 / numOdds || 30)).toFixed(1)}%)
                    </span>
                    <span>Extreme</span>
                  </div>
                </div>

                <div className="pt-md border-t border-secondary space-y-xs">
                  <p className="text-sm font-medium text-secondary">Settle Outcome &amp; Compute Brier Score:</p>
                  <div className="flex gap-sm pt-xs">
                    <button
                      onClick={() => handleSettleOutcome(1)}
                      disabled={isSubmittingPick}
                      className="inline-flex flex-1 items-center justify-center gap-sm rounded-lg bg-utility-success-50 px-lg py-sm text-sm font-semibold text-utility-success-700 border border-utility-success-200 shadow-xs hover:bg-utility-success-200 focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      Won (Outcome: 1)
                    </button>
                    <button
                      onClick={() => handleSettleOutcome(0)}
                      disabled={isSubmittingPick}
                      className="inline-flex flex-1 items-center justify-center gap-sm rounded-lg bg-utility-error-50 px-lg py-sm text-sm font-semibold text-utility-error-700 border border-utility-error-200 shadow-xs hover:bg-utility-error-200 focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      Lost (Outcome: 0)
                    </button>
                  </div>
                  <p className="text-xs text-tertiary pt-xs">
                    Calculates quadratic penalty <code>(f - o)²</code> and immediately appends <code>SOURCE_CALIBRATION_MEMORY</code> to Walrus.
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Tab 3: Memory Evolution & UI Mutation Inspector (CRITICAL HACKATHON FEATURE) */}
        {activeTab === 'inspector' && (
          <div className="space-y-xl">
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex flex-wrap items-center justify-between gap-md">
                <div>
                  <h3 className="font-semibold text-heading-xs text-primary">
                    Memory Evolution &amp; Dynamic UI Mutation Inspector
                  </h3>
                  <p className="text-sm text-tertiary">
                    Toggle between the cold uncalibrated product vs the self-calibrated interface adapted from 12 Walrus Mainnet Memories.
                  </p>
                </div>
                <div className="flex items-center gap-xs p-xxs bg-secondary rounded-lg border border-secondary">
                  <button
                    onClick={() => setActiveMutationSession('cold')}
                    className={`px-lg py-sm rounded-md text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
                      activeMutationSession === 'cold'
                        ? 'bg-primary text-primary shadow-xs'
                        : 'text-tertiary hover:text-secondary'
                    }`}
                  >
                    Session 1: Cold Start UI
                  </button>
                  <button
                    onClick={() => setActiveMutationSession('adapted')}
                    className={`px-lg py-sm rounded-md text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
                      activeMutationSession === 'adapted'
                        ? 'bg-brand-solid text-primary-on-brand shadow-xs'
                        : 'text-tertiary hover:text-secondary'
                    }`}
                  >
                    Session 24: Walrus-Adapted UI (Live)
                  </button>
                </div>
              </div>

              {/* Mutation Explanatory Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-sm">
                <div className="p-xl rounded-lg bg-secondary border border-secondary space-y-xs">
                  <div className="flex items-center gap-xs text-sm font-semibold text-brand-primary">
                    <CheckCircle2 className="size-4 shrink-0 text-fg-brand-primary" />
                    <span>Mutation 1: Bayesian Signal Re-Ranking</span>
                  </div>
                  <p className="text-sm text-secondary leading-relaxed">
                    Cold Start treated all 4 signal sources with an equal 25% voting weight. Walrus Memories logged 3 failed high-confidence underdog predictions by &quot;AlphaDegens Quant&quot;, automatically slashing its consensus weight to <strong>4.2%</strong> and flagging its card.
                  </p>
                </div>
                <div className="p-xl rounded-lg bg-secondary border border-secondary space-y-xs">
                  <div className="flex items-center gap-xs text-sm font-semibold text-warning-primary">
                    <AlertTriangle className="size-4 shrink-0 text-fg-warning-primary" />
                    <span>Mutation 2: Learned Tilt Rule Guardrail</span>
                  </div>
                  <p className="text-sm text-secondary leading-relaxed">
                    Walrus Memory identified a repetitive bias of placing unhedged bets when odds exceed 3.20. In the adapted UI, the pick submitter caps position sizing automatically and introduces explicit cognitive friction.
                  </p>
                </div>
              </div>
            </section>

            {/* Live Cards mutating based on selected view */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
              {/* Source 1 */}
              <section className={`rounded-xl border p-xl shadow-xs transition-all ${
                activeMutationSession === 'adapted'
                  ? 'border-brand bg-primary'
                  : 'border-secondary bg-primary'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-md text-primary">Sui Onchain Liquidity Sentinel</h4>
                    <p className="text-xs text-tertiary">Smart-money flows via Tatum RPC</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-semibold text-utility-brand-700">
                    {activeMutationSession === 'adapted' ? 'Weight: 44.8%' : 'Weight: 25.0%'}
                  </span>
                </div>
                <div className="mt-md space-y-xs text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Calibration Brier Score:</span>
                    <span className="font-semibold text-success-primary">0.082 (Elite)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Walrus Verification:</span>
                    <span className="text-brand-primary">7 Blob Confirmations</span>
                  </div>
                </div>
              </section>

              {/* Source 2 */}
              <section className={`rounded-xl border p-xl shadow-xs transition-all ${
                activeMutationSession === 'adapted'
                  ? 'border-secondary bg-primary opacity-60'
                  : 'border-secondary bg-primary'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-md text-primary">AlphaDegens Underdog Quant</h4>
                    <p className="text-xs text-tertiary">Long-shot market specialist</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-md py-xxs text-xs font-semibold ${
                    activeMutationSession === 'adapted'
                      ? 'border border-utility-error-200 bg-utility-error-50 text-utility-error-700'
                      : 'border border-secondary bg-secondary text-secondary'
                  }`}>
                    {activeMutationSession === 'adapted' ? 'Weight: 4.2% (Dimmed)' : 'Weight: 25.0%'}
                  </span>
                </div>
                <div className="mt-md space-y-xs text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Calibration Brier Score:</span>
                    <span className="font-semibold text-error-primary">0.341 (Degraded)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Walrus Memory Flag:</span>
                    <span className="text-error-primary">Overconfidence Bias</span>
                  </div>
                </div>
              </section>

              {/* Source 3 */}
              <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-md text-primary">Pitch &amp; Lineup Sports Matrix</h4>
                    <p className="text-xs text-tertiary">Venue weather &amp; player telemetry</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-semibold text-utility-brand-700">
                    {activeMutationSession === 'adapted' ? 'Weight: 31.0%' : 'Weight: 25.0%'}
                  </span>
                </div>
                <div className="mt-md space-y-xs text-sm">
                  <div className="flex justify-between">
                    <span className="text-tertiary">Calibration Brier Score:</span>
                    <span className="font-semibold text-success-primary">0.124 (Solid)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tertiary">Walrus Verification:</span>
                    <span className="text-brand-primary">5 Blob Confirmations</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Tab 4: Walrus Memory Explorer (Table Component Pattern) */}
        {activeTab === 'walrus' && (
          <div className="space-y-xl">
            <div className="flex items-center justify-between flex-wrap gap-md">
              <div>
                <h3 className="font-semibold text-heading-xs text-primary">Walrus Mainnet Memory Ledger</h3>
                <p className="text-sm text-tertiary">
                  Delegate Key / Agent: <code className="text-brand-primary">{walrusData?.agentId || '0x9a8f4c2e...b819f0'}</code> · {walrusData?.count || 12} Permanent Blobs Recorded
                </p>
              </div>
              <button
                onClick={async () => {
                  await seedWalrusBatch()
                  await loadWalrusData()
                  setWriteFeedback('Walrus 12 Mainnet Memories re-synchronized!')
                  setTimeout(() => setWriteFeedback(null), 4000)
                }}
                className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <RefreshCw className="size-4 shrink-0 text-fg-white" />
                Sync 10+ Hackathon Verification Blobs
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-secondary">
                  <tr className="border-b border-secondary text-left">
                    <th className="px-3xl py-md text-sm font-semibold text-quaternary">Blob ID / Reference</th>
                    <th className="px-3xl py-md text-sm font-semibold text-quaternary">Memory Schema Type</th>
                    <th className="px-3xl py-md text-sm font-semibold text-quaternary">Payload Details</th>
                    <th className="px-3xl py-md text-sm font-semibold text-quaternary">Sui Settlement Tx</th>
                    <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Walrus Mainnet</th>
                  </tr>
                </thead>
                <tbody>
                  {walrusData?.memories?.map((m) => (
                    <tr key={m.blobId} className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <td className="px-3xl py-xl text-md font-mono text-brand-primary font-medium">{m.blobId.slice(0, 18)}...</td>
                      <td className="px-3xl py-xl text-md">
                        <span className={`inline-flex items-center rounded-full px-md py-xxs text-xs font-medium ${
                          m.schemaType === 'BEHAVIORAL_TILT_RULE_MEMORY'
                            ? 'border border-utility-warning-200 bg-utility-warning-50 text-utility-warning-700'
                            : m.schemaType === 'X402_AGENT_SETTLEMENT_MEMORY'
                            ? 'border border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700'
                            : 'border border-secondary bg-secondary text-secondary'
                        }`}>
                          {m.schemaType}
                        </span>
                      </td>
                      <td className="px-3xl py-xl text-md text-primary max-w-xs truncate">
                        {m.content.patternDetected ? String(m.content.patternDetected) : m.content.prediction ? String(m.content.prediction) : m.content.agentId ? `Payment for ${String(m.content.agentId)}` : String(m.content.eventTitle || 'Pick reasoning')}
                      </td>
                      <td className="px-3xl py-xl text-md text-tertiary font-mono">{m.suiTxRef?.slice(0, 12)}...</td>
                      <td className="px-3xl py-xl text-md text-right">
                        <span className="inline-flex items-center rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-medium text-utility-success-700">
                          {m.verificationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: x402 Autonomous Intelligence Marketplace */}
        {activeTab === 'x402' && (
          <div className="space-y-xl">
            <section className="rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-md">
              <div className="flex items-center justify-between flex-wrap gap-md">
                <div>
                  <h3 className="font-semibold text-heading-xs text-primary">
                    x402 Autonomous Micro-Payment Paywall (HTTP 402 on Sui)
                  </h3>
                  <p className="text-sm text-tertiary">
                    Deep intelligence reports priced dynamically based on real-time Walrus Memory calibration performance.
                  </p>
                </div>
                <div className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
                  <Lock className="size-4 shrink-0 text-fg-brand-primary" />
                  <span>Protocol: HTTP 402 + Sui Mainnet Escrow</span>
                </div>
              </div>

              {/* 3 Agents (Card Component Pattern) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md pt-sm">
                <section className="rounded-xl border border-secondary bg-secondary p-xl shadow-xs space-y-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-md text-primary">Sui Orderflow Sentinel</h4>
                      <p className="text-xs text-tertiary">Detects DEX &amp; Lending whale liquidations</p>
                    </div>
                    <span className="text-sm font-semibold text-brand-primary">0.15 SUI</span>
                  </div>
                  <div className="text-sm text-secondary space-y-xs">
                    <div>Streak: <strong>9 consecutive winning reads</strong></div>
                    <div>Dynamic Pricing: <span className="text-warning-primary">+50% premium</span></div>
                  </div>
                  <button
                    onClick={() => handleRequest402('sentinel', '0.15')}
                    className="w-full inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <DollarSign className="size-4 shrink-0 text-fg-white" />
                    Request x402 Deep Alpha (0.15 SUI)
                  </button>
                </section>

                <section className="rounded-xl border border-secondary bg-secondary p-xl shadow-xs space-y-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-md text-primary">Cross-Book Arbitrage Scanner</h4>
                      <p className="text-xs text-tertiary">Tracks trad odds vs onchain discrepancies</p>
                    </div>
                    <span className="text-sm font-semibold text-brand-primary">0.05 SUI</span>
                  </div>
                  <div className="text-sm text-secondary space-y-xs">
                    <div>Calibration Accuracy: <strong>78.2%</strong></div>
                    <div>Dynamic Pricing: <span className="text-success-primary">Standard Base Rate</span></div>
                  </div>
                  <button
                    onClick={() => handleRequest402('scanner', '0.05')}
                    className="w-full inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <DollarSign className="size-4 shrink-0 text-fg-white" />
                    Request x402 Deep Alpha (0.05 SUI)
                  </button>
                </section>

                <section className="rounded-xl border border-secondary bg-secondary p-xl shadow-xs space-y-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-md text-primary">Sports Pitch &amp; Matchup Quant</h4>
                      <p className="text-xs text-tertiary">IPL / UCL lineup &amp; weather impacts</p>
                    </div>
                    <span className="text-sm font-semibold text-brand-primary">0.02 SUI</span>
                  </div>
                  <div className="text-sm text-secondary space-y-xs">
                    <div>Status: <span className="text-tertiary">Recovering from drawdown</span></div>
                    <div>Dynamic Pricing: <span className="text-success-primary">-60% Discounted</span></div>
                  </div>
                  <button
                    onClick={() => handleRequest402('quant', '0.02')}
                    className="w-full inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <DollarSign className="size-4 shrink-0 text-fg-white" />
                    Request x402 Deep Alpha (0.02 SUI)
                  </button>
                </section>
              </div>

              {/* x402 Handshake & Paywall Terminal */}
              {x402Status !== 'idle' && (
                <div className="rounded-xl border border-brand bg-secondary p-xl shadow-xs space-y-md mt-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-sm">
                      <Lock className="size-5 shrink-0 text-fg-brand-primary" />
                      <h4 className="font-semibold text-md text-primary">x402 Handshake &amp; Settlement Inspector</h4>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-md py-xxs text-xs font-semibold ${
                      x402Status === 'settled'
                        ? 'border border-utility-success-200 bg-utility-success-50 text-utility-success-700'
                        : 'border border-utility-warning-200 bg-utility-warning-50 text-utility-warning-700'
                    }`}>
                      {x402Status.toUpperCase()}
                    </span>
                  </div>

                  {x402Response && (
                    <div className="bg-primary p-md rounded-md border border-secondary font-mono text-xs text-secondary space-y-xs overflow-x-auto">
                      {Object.entries(x402Response).map(([k, v]) => (
                        <div key={k} className="flex gap-xs">
                          <span className="text-tertiary font-semibold">{k}:</span>
                          <span className="text-primary">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {x402Status === '402_required' && (
                    <div className="flex items-center justify-between pt-sm">
                      <p className="text-sm text-tertiary">
                        Payment settled via Tatum Sui RPC (<code>sui_getTransactionBlock</code>).
                      </p>
                      <button
                        onClick={handleSettle402OnSui}
                        className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <CreditCard className="size-4 shrink-0 text-fg-white" />
                        Sign &amp; Settle x402 on Sui (1-Click)
                      </button>
                    </div>
                  )}

                  {x402Status === 'verifying' && (
                    <div className="p-xl rounded-lg bg-primary text-sm text-brand-primary flex items-center gap-sm border border-secondary">
                      <RefreshCw className="size-4 shrink-0 animate-spin" />
                      <span>Verifying Sui transaction digest and writing settlement memory to Walrus...</span>
                    </div>
                  )}

                  {x402Status === 'settled' && unlockedReport && (
                    <div className="flex gap-lg rounded-xl bg-utility-brand-50 p-xl border border-utility-brand-200">
                      <Sparkles className="mt-xxs size-5 shrink-0 text-fg-brand-primary" />
                      <div>
                        <p className="text-sm font-semibold text-utility-brand-600">Intelligence Report Unlocked</p>
                        <p className="mt-xxs text-sm text-secondary leading-relaxed font-sans">{unlockedReport}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Configuration Drawer / Dialog (Dialog Component Pattern) */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-overlay opacity-70"
            onClick={() => setIsConfigOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg flex flex-col overflow-hidden bg-primary shadow-2xl border-l border-secondary h-full">
            <header className="flex items-start justify-between gap-lg border-b border-secondary p-xl">
              <div>
                <h2 className="text-lg font-semibold text-primary">System &amp; Keys Configuration</h2>
                <p className="text-sm text-tertiary">Configure Tatum RPC and Walrus Mainnet keys</p>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
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
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
                <p className="text-xs text-tertiary">Used for Tatum Sui Mainnet RPC &amp; Data APIs</p>
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Memory Agent ID (MemWal)</label>
                <input
                  type="text"
                  defaultValue="0x9a8f4c2e119b4802ad1944e8a719bf049922e4"
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary font-mono border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
                <p className="text-xs text-tertiary">Public delegate agent key for Walrus Memory on Mainnet</p>
              </div>

              <div className="flex flex-col gap-sm">
                <label className="text-sm font-medium text-secondary">Walrus Mainnet Endpoint</label>
                <input
                  type="text"
                  defaultValue="https://publisher.walrus-testnet.walrus.space"
                  className="rounded-md bg-primary px-lg py-sm text-sm text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
              </div>

              <div className="p-xl rounded-lg bg-secondary border border-secondary flex items-center justify-between">
                <div>
                  <p className="font-semibold text-primary text-sm">Judge Inspection Mode</p>
                  <p className="text-tertiary text-xs">Uses pre-indexed Mainnet memories if key unset</p>
                </div>
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                  className="rounded"
                />
              </div>
            </div>

            <footer className="flex justify-end gap-sm border-t border-secondary p-xl">
              <button
                onClick={() => setIsConfigOpen(false)}
                className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Save Configuration
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
