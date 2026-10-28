import { useEffect, useState } from 'react';
import { Check, X, RefreshCw, Layers, ShieldCheck } from 'lucide-react';
import {
  mergeDecisions,
  normalizeSuiAddress,
  suiToMist,
  validDate,
} from '../../shared/subsense.mjs';
import { api, loadConnections, recallDecisions } from './api';
import type { Connections, Verification } from './api';
import type { Network } from '../../shared/subsense.mjs';
import type { Workspace } from './workspace';
import { Badge, Button, Field, Notice, SectionHeading, fieldClass } from './ui';
import CredentialsVault from './CredentialsVault';
import { useWalletAccess } from './WalletAccess';

export type Commit = (change: (w: Workspace) => Workspace) => boolean;
type Health = { status: string; message?: string; note?: string };
export default function ConnectionsView({
  workspace,
  commit,
  locked,
  onBusy,
  onConfig,
}: {
  workspace: Workspace;
  commit: Commit;
  locked: boolean;
  onBusy: (v: boolean) => void;
  onConfig: (config: Connections) => void;
}) {
  const { session } = useWalletAccess();
  const [config, setConfig] = useState<Connections>();
  const [health, setHealth] = useState<{ tatum: Health; walrus: Health }>();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState(
    'Subscription renewal decisions, value, client work, reasons to keep or cancel',
  );
  const [payment, setPayment] = useState({
    serviceId: workspace.subscriptions[0]?.id ?? '',
    digest: '',
    recipient: '',
    payer: '',
    amountSui: '',
    paidOn: new Date().toISOString().slice(0, 10),
  });
  const [verification, setVerification] = useState<Verification>();
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<{
    address: string;
    amountSui: string;
    network: Network;
  }>();
  const networkLabel = config?.networkLabel ?? 'Loading network…';
  useEffect(() => {
    let active = true;
    loadConnections()
      .then((c) => {
        if (active) {
          setConfig(c);
          onConfig(c);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [onConfig, session.credentialsConfigured]);
  async function run(name: string, task: () => Promise<void>) {
    setBusy(name);
    onBusy(true);
    setMessage('');
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      onBusy(false);
    }
  }
  async function refreshConfiguration() {
    const next = await loadConnections();
    setConfig(next);
    onConfig(next);
    setHealth(undefined);
    setVerification(undefined);
    setBalance(undefined);
  }
  const stateLabel = (configured: boolean | undefined, result?: Health) =>
    result?.status === 'reachable'
      ? 'Reachable'
      : result?.status === 'error'
        ? 'Test failed'
        : configured === undefined
          ? 'Loading configuration…'
          : configured
            ? 'Configured · untested'
            : 'Not configured';
  return (
    <div className="space-y-3xl">
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-lg border-b border-secondary pb-xl">
        <div>
          <p className="text-sm font-medium">Optional infrastructure</p>
          <p className="mt-xs text-xs text-tertiary">
            Signed wallet login isolates your keys. Mainnet operations require a
            verified vault connection.
          </p>
        </div>
        <Badge tone={config?.network === 'testnet' ? 'warning' : 'gray'}>
          Target network · Sui {networkLabel}
        </Badge>
      </div>
      <CredentialsVault
        onChanged={refreshConfiguration}
        onBusy={(value) => {
          setBusy(value ? 'vault' : '');
          onBusy(value);
        }}
      />
      <div className="grid gap-2xl md:grid-cols-2">
        {(['tatum', 'walrus'] as const).map((provider) => (
          <section
            key={provider}
            className="flex flex-col rounded-xl border border-primary bg-secondary p-2xl"
          >
            <div className="flex items-center gap-lg">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary bg-primary text-fg-secondary">
                {provider === 'tatum' ? (
                  <ShieldCheck size={20} aria-hidden="true" />
                ) : (
                  <Layers size={20} aria-hidden="true" />
                )}
              </span>
              <div>
                <h2 className="text-md font-semibold">
                  {provider === 'tatum' ? 'Tatum' : 'Walrus Memory'}
                </h2>
                <p className="mt-xs text-xs text-tertiary">
                  {provider === 'tatum'
                    ? 'Native SUI payment evidence'
                    : 'Decision storage & recall'}
                </p>
              </div>
            </div>
            <p className="mb-xl mt-xl text-sm text-tertiary">
              {provider === 'tatum'
                ? `Read-only ${networkLabel} GraphQL balance and payment checks. Wallet login never authorizes a transfer.`
                : `Explicit uploads through the ${networkLabel} Memory SDK. Reachability does not prove account access or a completed write.`}
            </p>
            <p className="mb-xl break-all font-mono text-xs text-quaternary">
              {provider === 'tatum'
                ? config?.tatumEndpoint
                : config?.walrusEndpoint}
            </p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-md border-t border-primary pt-xl">
              <span className="text-xs text-tertiary">Provider status</span>
              <Badge
                tone={
                  health?.[provider].status === 'reachable'
                    ? 'success'
                    : health?.[provider].status === 'error'
                      ? 'error'
                      : 'gray'
                }
              >
                {stateLabel(
                  provider === 'tatum'
                    ? config?.tatumConfigured
                    : config?.walrusConfigured,
                  health?.[provider],
                )}
              </Badge>
            </div>
            {health?.[provider].message && (
              <p className="mt-lg text-sm text-error-primary">
                {health[provider].message}
              </p>
            )}
            {health?.[provider].note && (
              <p className="mt-lg text-xs text-tertiary">
                {health[provider].note}
              </p>
            )}
          </section>
        ))}
      </div>
      <Button
        disabled={
          Boolean(busy) ||
          !config?.walletAuthenticated ||
          !session.credentialsConfigured
        }
        onClick={() =>
          run('health', async () => {
            if (!config) throw new Error('Load configuration first.');
            setHealth(
              await api('/connections/test', { network: config.network }),
            );
          })
        }
      >
        <RefreshCw size={16} aria-hidden="true" />
        {busy === 'health' ? 'Testing…' : 'Refresh & test connections'}
      </Button>
      <section className="rounded-xl border border-secondary bg-primary p-2xl space-y-xl">
        <SectionHeading
          title="Read a native SUI balance"
          description={`TATUM · SUI ${networkLabel.toUpperCase()}`}
        />
        <p className="text-sm text-tertiary">
          A real, read-only API check. Does not link a wallet or save financial evidence.
        </p>
        <form
          className="flex flex-col gap-lg sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setBalance(undefined);
            run('balance', async () => {
              if (!config) throw new Error('Load configuration first.');
              normalizeSuiAddress(address.trim());
              setBalance(
                await api('/wallets/balance', {
                  address: address.trim(),
                  network: config.network,
                }),
              );
            });
          }}
        >
          <div className="flex-1">
            <Field label="Sui address">
              <input
                className={fieldClass}
                required
                maxLength={66}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setBalance(undefined);
                }}
                placeholder="0x…"
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={
              Boolean(busy) ||
              !config?.tatumConfigured ||
              !config?.walletAuthenticated ||
              !session.credentialsConfigured
            }
          >
            {busy === 'balance' ? 'Reading…' : 'Read SUI balance'}
          </Button>
        </form>
        {balance && (
          <Notice>
            {balance.amountSui} SUI ·{' '}
            {balance.network === 'testnet'
              ? 'Testnet (test assets only)'
              : 'Mainnet'}{' '}
            · {balance.address}
          </Notice>
        )}
        {config?.network === 'testnet' && (
          <a
            className="inline-block text-sm text-brand-primary underline focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="https://faucet.sui.io/"
            target="_blank"
            rel="noreferrer"
          >
            Open Sui faucet (request Testnet SUI yourself)
          </a>
        )}
      </section>
      <div className="grid items-start gap-2xl xl:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-secondary bg-primary p-2xl space-y-xl">
          <div>
            <SectionHeading
              title="Recall decision context"
              description="WALRUS MEMORY"
            />
            <p className="mt-sm text-sm text-tertiary">
              Validated SubSense memories from this profile feed the same
              recommendation engine. Search returns up to 50 relevant results,
              not an exhaustive account inventory.
            </p>
          </div>
          <Field label="What should SubSense remember?">
            <input
              className={fieldClass}
              required
              maxLength={500}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <p className="break-all font-mono text-xs text-quaternary">
            Profile: {workspace.profileId}
          </p>
          <Button
            disabled={
              Boolean(busy) ||
              locked ||
              workspace.sample ||
              !config?.walrusConfigured ||
              !config?.walletAuthenticated ||
              !session.credentialsConfigured ||
              !query.trim()
            }
            variant="primary"
            onClick={() =>
              run('recall', async () => {
                const id = workspace.profileId;
                if (!config) throw new Error('Load configuration first.');
                const result = await recallDecisions(
                  id,
                  query.trim(),
                  config.network,
                );
                if (
                  commit((w) =>
                    w.profileId === id
                      ? {
                          ...w,
                          decisions: mergeDecisions(
                            w.decisions,
                            result.decisions,
                          ),
                        }
                      : w,
                  )
                )
                  setMessage(
                    `Recalled ${result.retrieved} relevant ${networkLabel} ${result.retrieved === 1 ? 'decision' : 'decisions'}. Recommendations now include this context. This is not your total stored-memory count.`,
                  );
              })
            }
          >
            {busy === 'recall' ? 'Recalling…' : 'Recall from Walrus'}
          </Button>
          {workspace.sample && (
            <p className="text-xs text-tertiary">
              Start your own workspace in Settings to use real integrations.
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-xl border border-secondary bg-primary p-2xl space-y-xl">
          <div>
            <SectionHeading
              title="Verify a subscription payment"
              description={`TATUM · SUI ${networkLabel.toUpperCase()}`}
            />
            <p className="mt-sm text-sm text-tertiary">
              For services actually paid in native SUI. Match recipient net
              balance increase, amount, UTC date, and optional sender. This is
              evidence of a transfer, not proof that a vendor recognised your
              bill. USD budgeting stays separate.
            </p>
          </div>
          <form
            className="space-y-xl"
            onSubmit={(e) => {
              e.preventDefault();
              setVerification(undefined);
              run('payment', async () => {
                const id = workspace.profileId;
                if (!config) throw new Error('Load configuration first.');
                if (
                  !workspace.subscriptions.some(
                    (s) => s.id === payment.serviceId,
                  )
                )
                  throw new Error('Choose a subscription.');
                if (
                  workspace.payments.some(
                    (p) =>
                      p.digest === payment.digest.trim() &&
                      p.network === config.network,
                  )
                )
                  throw new Error(
                    'This transaction is already linked in this browser workspace.',
                  );
                normalizeSuiAddress(payment.recipient);
                if (payment.payer) normalizeSuiAddress(payment.payer);
                suiToMist(payment.amountSui);
                if (!validDate(payment.paidOn))
                  throw new Error('Enter a valid payment date.');
                const result = await api<Verification>('/payments/verify', {
                  ...payment,
                  network: config.network,
                  digest: payment.digest.trim(),
                });
                setVerification(result);
                if (
                  result.verified &&
                  result.digest &&
                  result.timestamp &&
                  result.recipient &&
                  result.amountSui &&
                  result.checkedAt
                ) {
                  const evidence = {
                    network: result.network,
                    serviceId: payment.serviceId,
                    digest: result.digest,
                    timestamp: result.timestamp,
                    recipient: result.recipient,
                    amountSui: result.amountSui,
                    checkedAt: result.checkedAt,
                    provider: 'Tatum',
                  };
                  if (
                    commit((w) =>
                      w.profileId !== id ||
                      w.payments.some(
                        (p) =>
                          p.digest === evidence.digest &&
                          p.network === evidence.network,
                      )
                        ? w
                        : { ...w, payments: [...w.payments, evidence] },
                    )
                  )
                    setMessage(
                      `Matching ${networkLabel} payment evidence saved locally. Renewal dates and vendor status were not changed. Replay protection is limited to this browser workspace.`,
                    );
                }
              });
            }}
          >
            <Field label="Subscription">
              <select
                className={fieldClass}
                required
                value={payment.serviceId}
                onChange={(e) => {
                  setVerification(undefined);
                  setPayment((p) => ({ ...p, serviceId: e.target.value }));
                }}
              >
                <option value="">Choose a service</option>
                {workspace.subscriptions.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {(
              ['digest', 'recipient', 'payer', 'amountSui', 'paidOn'] as const
            ).map((key) => (
              <Field
                key={key}
                label={
                  {
                    digest: 'Sui transaction digest',
                    recipient: 'Expected recipient address',
                    payer: 'Expected sender address (optional)',
                    amountSui: 'Expected amount (SUI, not USD)',
                    paidOn: 'Expected UTC payment date',
                  }[key]
                }
              >
                <input
                  className={fieldClass}
                  type={key === 'paidOn' ? 'date' : 'text'}
                  required={key !== 'payer'}
                  maxLength={key === 'amountSui' ? 22 : 100}
                  inputMode={key === 'amountSui' ? 'decimal' : undefined}
                  value={payment[key]}
                  onChange={(e) => {
                    setVerification(undefined);
                    setPayment((p) => ({ ...p, [key]: e.target.value }));
                  }}
                  placeholder={
                    key === 'recipient' || key === 'payer'
                      ? '0x…'
                      : key === 'amountSui'
                        ? '0.5'
                        : undefined
                  }
                />
              </Field>
            ))}
            <Button
              type="submit"
              variant="primary"
              disabled={
                Boolean(busy) ||
                locked ||
                workspace.sample ||
                !config?.tatumConfigured ||
                !config?.walletAuthenticated ||
                !session.credentialsConfigured ||
                !workspace.subscriptions.length
              }
            >
              {busy === 'payment' ? 'Checking evidence…' : 'Verify payment'}
            </Button>
          </form>
          {verification && (
            <div aria-live="polite" className="border-t border-secondary pt-xl">
              <Badge tone={verification.verified ? 'success' : 'error'}>
                {verification.verified ? 'All checks matched' : 'Not verified'}
              </Badge>
              <ul className="mt-lg space-y-md">
                {verification.checks.map((c) => (
                  <li
                    className="flex items-center gap-md text-sm text-secondary"
                    key={c.label}
                  >
                    {c.passed ? (
                      <Check
                        size={16}
                        className="text-fg-success-primary shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <X
                        size={16}
                        className="text-fg-error-primary shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      {c.label} · {c.passed ? 'passed' : 'failed'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workspace.payments.length > 0 && (
            <div className="border-t border-secondary pt-xl">
              <h3 className="text-sm font-semibold">Locally linked evidence</h3>
              {workspace.payments.map((p) => (
                <p
                  className="mt-md break-all text-xs text-tertiary"
                  key={`${p.network}:${p.digest}`}
                >
                  {workspace.subscriptions.find((s) => s.id === p.serviceId)
                    ?.name ?? 'Archived service'}{' '}
                  ·{' '}
                  {p.network === 'testnet'
                    ? 'Testnet (testing only)'
                    : 'Mainnet'}{' '}
                  · {p.amountSui} SUI · {p.digest}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
