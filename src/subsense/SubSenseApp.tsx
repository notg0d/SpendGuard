import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Brain,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Unplug,
  LogOut,
  Wallet,
  Sparkles,
} from 'lucide-react';
import {
  daysUntil,
  monthlyCents,
  nextRenewal,
  recommend,
  summarize,
  memoryReceipts,
  decisionReceipt,
  withDecisionReceipt,
} from '../../shared/subsense.mjs';
import { checkMemory, uploadDecision, loadConnections } from './api';
import { shortWallet, useWalletAccess } from './WalletAccess';
import type { Connections } from './api';
import type { Decision, Subscription, Workspace } from './workspace';
import { dateLabel, money, readWorkspace, saveWorkspace } from './workspace';
import ConnectionsView from './ConnectionsView';
import type { Commit } from './ConnectionsView';
import SettingsView from './SettingsView';
import OverviewView from './OverviewView';
import AssistantView from './AssistantView';
import {
  ReviewForm,
  SubscriptionForm,
  actionLabels,
  actionTone,
} from './forms';
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  ServiceAvatar,
  SectionHeading,
  fieldClass,
} from './ui';

type View =
  | 'overview'
  | 'subscriptions'
  | 'renewals'
  | 'journal'
  | 'assistant'
  | 'connections'
  | 'settings';
const pages = [
  {
    id: 'overview' as const,
    label: 'Overview',
    icon: LayoutDashboard,
    description:
      'Your recurring spend, with the context to make better decisions.',
  },
  {
    id: 'subscriptions' as const,
    label: 'Subscriptions',
    icon: ListChecks,
    description: 'One honest inventory of your recurring commitments.',
  },
  {
    id: 'renewals' as const,
    label: 'Renewal reviews',
    icon: CalendarClock,
    description: 'Decide before you renew, with context from past decisions.',
  },
  {
    id: 'journal' as const,
    label: 'Decision journal',
    icon: Brain,
    description: 'Your reasons today become better recommendations tomorrow.',
  },
  {
    id: 'assistant' as const,
    label: 'AI assistant',
    icon: Sparkles,
    description: 'Ask, explain, plan, and search your context. You stay in control.',
  },
  {
    id: 'connections' as const,
    label: 'Connections',
    icon: Unplug,
    description: 'Real integrations, explicit consent, visible evidence.',
  },
  {
    id: 'settings' as const,
    label: 'Settings',
    icon: Settings,
    description: 'Your budget, your workspace, your control.',
  },
];
const renewalLabel = (service: Subscription) => {
  const days = daysUntil(service.renewsOn);
  return days < 0
    ? `${Math.abs(days)}d overdue`
    : days === 0
      ? 'Today'
      : `In ${days}d`;
};

export default function SubSenseApp() {
  const { session, logout } = useWalletAccess();
  const wallet = session.walletAddress!;
  const [loaded] = useState(() => readWorkspace(wallet));
  const [workspace, setWorkspace] = useState(loaded.workspace);
  const current = useRef(workspace);
  const [warning, setWarning] = useState(loaded.warning ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<View>(
    (session.vaultUnlocked ?? session.credentialsConfigured) ? 'overview' : 'connections',
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [editing, setEditing] = useState<Subscription | 'new'>();
  const [reviewing, setReviewing] = useState<Subscription>();
  const [uploading, setUploading] = useState<Decision>();
  const [advancing, setAdvancing] = useState<Subscription>();
  const [busy, setBusy] = useState(false);
  const [connections, setConnections] = useState<Connections>();
  useEffect(() => {
    loadConnections()
      .then(setConnections)
      .catch((e) => setError(e.message));
  }, [session.credentialsConfigured, session.openaiConfigured, session.vaultUnlocked]);
  const network = connections?.network;
  const networkLabel = connections?.networkLabel ?? 'Network not loaded';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.theme = workspace.theme;
    document.documentElement.style.colorScheme = workspace.theme;
  }, [workspace.theme]);
  const commit: Commit = (change) => {
    if (warning) {
      setError(
        'Saved data is locked to prevent overwriting it. Export raw recovery and replace the workspace in Settings first.',
      );
      return false;
    }
    try {
      const next = change(current.current);
      if (
        next.subscriptions.length > 200 ||
        next.decisions.length > 2000 ||
        next.payments.length > 200
      )
        throw new Error(
          'Workspace limit reached. Export a backup and start a new workspace.',
        );
      saveWorkspace(next, wallet);
      current.current = next;
      setWorkspace(next);
      setError('');
      return true;
    } catch (e) {
      setError(
        `Could not save: ${(e as Error).message}. Export a backup before leaving this page.`,
      );
      return false;
    }
  };
  function replace(w: Workspace) {
    try {
      saveWorkspace(w, wallet);
      current.current = w;
      setWorkspace(w);
      setWarning('');
      setError('');
      setSearch('');
      setPage(0);
      return true;
    } catch {
      setError(
        'Workspace replacement could not be saved. Browser storage may be full or unavailable.',
      );
      return false;
    }
  }
  function navigate(v: View) {
    if (busy) return;
    setView(v);
    setMobileNav(false);
    setPage(0);
    setSearch('');
    setMessage('');
    setError('');
  }
  const totals = summarize(workspace.subscriptions, workspace.budgetCents);
  const active = workspace.subscriptions.filter((s) => s.status === 'active');
  const ordered = [...active].sort((a, b) =>
    a.renewsOn.localeCompare(b.renewsOn),
  );
  const candidates = ordered.filter(
    (s) => recommend(s, workspace.decisions).action !== 'keep',
  );
  const mainnetCount = new Set(
    workspace.decisions
      .flatMap(memoryReceipts)
      .filter((r) => r.storage === 'mainnet' && r.blobId)
      .map((r) => r.blobId),
  ).size;
  const testnetCount = new Set(
    workspace.decisions
      .flatMap(memoryReceipts)
      .filter((r) => r.storage === 'testnet' && r.blobId)
      .map((r) => r.blobId),
  ).size;
  const filtered = workspace.subscriptions.filter(
    (s) =>
      (status === 'all' || s.status === status) &&
      `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const journal = [...workspace.decisions]
    .filter((d) =>
      `${d.serviceName} ${d.reason}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const pageCount = Math.ceil(
    (view === 'journal' ? journal.length : filtered.length) / 8,
  );
  const selectedPage = pages.find((p) => p.id === view)!;
  const recommendation = (s: Subscription) =>
    recommend(s, workspace.decisions, { overBudget: totals.headroom < 0 });
  function reviewSaved(d: Decision) {
    const ok = commit((w) => ({ ...w, decisions: [d, ...w.decisions] }));
    if (ok)
      setMessage(
        `${d.serviceName}: decision saved ${d.demo ? 'as a sample' : 'locally'}. Future reviews now use your context.`,
      );
    return ok;
  }
  async function remoteDecision(d: Decision, submit: boolean) {
    const id = workspace.profileId;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!network)
        throw new Error('Open Connections and load the active network first.');
      const existing = decisionReceipt(d, network);
      if (!submit && !existing?.jobId)
        throw new Error('No pending job on this network.');
      const receipt = submit
        ? await uploadDecision(id, d, network)
        : await checkMemory(id, existing!.jobId!, network);
      const saved = commit((w) =>
        w.profileId === id
          ? {
              ...w,
              decisions: w.decisions.map((old) =>
                old.id === d.id
                  ? withDecisionReceipt(old, {
                      ...receipt,
                      syncError: receipt.message,
                    })
                  : old,
              ),
            }
          : w,
      );
      if (!saved) {
        setMessage(
          `The relayer returned ${receipt.storage}. Recovery job ID: ${receipt.jobId}. Browser saving failed; record this job ID before retrying.`,
        );
        setUploading(undefined);
        return;
      }
      if (receipt.storage === 'mainnet' || receipt.storage === 'testnet')
        setMessage(
          `Walrus confirmed completion and a ${networkLabel} blob receipt. Testnet receipts never count toward Mainnet eligibility.`,
        );
      else if (receipt.storage === 'error')
        setError(
          receipt.message ?? 'Memory upload failed. Recall before retrying.',
        );
      else
        setMessage(
          `The ${networkLabel} memory job is pending. Check its status later; it is not yet confirmed.`,
        );
      setUploading(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function RenewalRow({ service }: { service: Subscription }) {
    const r = recommendation(service);
    return (
      <div className="flex flex-col gap-lg border-b border-secondary py-lg last:border-b-0 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-lg">
          <ServiceAvatar name={service.name} />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{service.name}</p>
            <p className="mt-xxs text-xs text-tertiary">
              {dateLabel(service.renewsOn)} · {renewalLabel(service)} ·{' '}
              {money(service.costCents)} /{' '}
              {service.cadence === 'annual' ? 'yr' : 'mo'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-lg">
          <Badge tone={actionTone(r.action)}>{actionLabels[r.action]}</Badge>
          <Button
            disabled={Boolean(warning)}
            onClick={() => setReviewing(service)}
          >
            Review
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }
  const navigation = (infrastructure: boolean) => (
    <nav
      aria-label={
        infrastructure ? 'Infrastructure navigation' : 'Main navigation'
      }
      className="space-y-xs"
    >
      {pages
        .filter(
          (p) => ['connections', 'settings'].includes(p.id) === infrastructure,
        )
        .map((p) => (
          <button
            key={p.id}
            disabled={busy}
            onClick={() => navigate(p.id)}
            aria-current={view === p.id ? 'page' : undefined}
            className={`flex w-full items-center gap-lg rounded-lg border px-lg py-lg text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 ${view === p.id ? 'border-secondary bg-secondary text-primary' : 'border-transparent text-tertiary hover:bg-primary-hover hover:text-secondary'}`}
          >
            <p.icon size={18} className="shrink-0" aria-hidden="true" />
            <span>{p.label}</span>
            {p.id === 'renewals' && candidates.length > 0 && (
              <span
                aria-label={`${candidates.length} worth reviewing`}
                className="ml-auto rounded-md bg-tertiary px-sm text-xs text-secondary"
              >
                {candidates.length}
              </span>
            )}
          </button>
        ))}
    </nav>
  );
  const pagination =
    pageCount > 1 ? (
      <div className="flex flex-wrap items-center justify-between gap-lg border-t border-secondary px-2xl py-xl">
        <p className="text-xs text-tertiary">
          Page {page + 1} of {pageCount}
        </p>
        <div className="flex items-center gap-md">
          <Button
            disabled={page === 0}
            aria-label="Previous page"
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </Button>
          <Button
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    ) : null;
  return (
    <div className="min-h-screen bg-primary text-primary">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:z-50 focus:bg-primary focus:p-xl"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-secondary bg-primary p-xl lg:flex">
        <div className="flex items-center justify-between px-lg pb-4xl pt-lg">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              navigate('overview');
            }}
            className="flex items-center gap-md rounded-md focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-solid text-fg-white">
              <Brain size={20} className="shrink-0" aria-hidden="true" />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              SubSense
            </span>
          </a>
        </div>
        <p className="px-lg pb-lg text-xs font-medium tracking-wider text-tertiary">
          WORKSPACE
        </p>
        {navigation(false)}
        <p className="mt-3xl px-lg pb-lg text-xs font-medium tracking-wider text-tertiary">
          INFRASTRUCTURE
        </p>
        {navigation(true)}
        <div className="mt-auto px-lg pt-4xl">
          <div className="border-t border-secondary pt-xl">
            <div className="flex items-center gap-sm text-sm font-medium text-secondary">
              <ShieldCheck
                size={17}
                className="shrink-0 text-fg-secondary"
                aria-hidden="true"
              />
              {workspace.sample
                ? 'Sample workspace'
                : 'Browser-local workspace'}
            </div>
            <p className="mt-sm text-xs text-tertiary">
              Manual tracking. Nothing moves without you.
            </p>
            <p className="mt-xl text-xs text-tertiary">
              Built with Tatum + Walrus
            </p>
          </div>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex items-center justify-between gap-lg border-b border-secondary bg-primary px-xl py-md md:px-3xl lg:px-4xl">
          <div className="flex items-center gap-md">
            <Button
              variant="quiet"
              className="lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </Button>
            <span className="hidden text-xs text-tertiary sm:inline">
              Workspace <span className="mx-md text-tertiary">/</span>{' '}
              <span className="font-medium text-secondary">
                {selectedPage.label}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-md">
            <Badge tone="brand">Mainnet</Badge>
            <span className="hidden items-center gap-sm text-xs text-secondary md:flex">
              <Wallet size={16} className="shrink-0" aria-hidden="true" />
              {shortWallet(wallet)}
            </span>
            <Button
              variant="quiet"
              disabled={Boolean(warning) || busy}
              aria-label={`Switch to ${workspace.theme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={() =>
                commit((w) => ({
                  ...w,
                  theme: w.theme === 'dark' ? 'light' : 'dark',
                }))
              }
            >
              {workspace.theme === 'dark' ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="quiet"
              disabled={busy}
              aria-label="Sign out and clear backend credentials"
              onClick={() =>
                logout().catch(() =>
                  setError(
                    'Sign-out request failed. Backend credentials expire with the session; refresh and try again.',
                  ),
                )
              }
            >
              <LogOut size={18} className="shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main
          id="workspace-main"
          className="mx-auto max-w-7xl space-y-2xl p-xl md:p-3xl lg:p-4xl"
        >
          <div className="flex flex-col justify-between gap-xl sm:flex-row sm:items-center">
            <div>
              <h1 className="text-heading-xs font-semibold tracking-tight">
                {selectedPage.label}
              </h1>
              <p className="mt-sm text-sm text-tertiary">
                {selectedPage.description}
              </p>
            </div>
            {['overview', 'subscriptions', 'renewals'].includes(view) && (
              <Button
                disabled={Boolean(warning) || busy}
                variant="primary"
                onClick={() => setEditing('new')}
              >
                <Plus size={18} aria-hidden="true" />
                Add subscription
              </Button>
            )}
          </div>
          {warning && (
            <Notice error>
              <p>{warning}</p>
              <Button className="mt-lg" onClick={() => navigate('settings')}>
                Open recovery settings
              </Button>
            </Notice>
          )}
          {workspace.sample && view !== 'settings' && (
            <div className="flex flex-col justify-between gap-md border-b border-secondary pb-xl sm:flex-row sm:items-center">
              <p className="flex items-center gap-md text-xs text-tertiary">
                <ShieldCheck
                  size={16}
                  className="shrink-0 text-fg-tertiary"
                  aria-hidden="true"
                />
                Sample workspace · Local examples, not Mainnet memories.
              </p>
              <Button
                variant="quiet"
                className="self-end"
                onClick={() => navigate('settings')}
              >
                Make it yours
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {view === 'overview' && (
            <OverviewView
              workspace={workspace}
              locked={Boolean(warning)}
              onReview={setReviewing}
              onNavigate={navigate}
            />
          )}
          {view === 'subscriptions' && (
            <section className="min-w-0 overflow-hidden rounded-xl border border-secondary bg-primary">
              <div className="border-b border-secondary px-2xl py-xl">
                <SectionHeading
                  title="Your subscriptions"
                  description={`${workspace.subscriptions.length} services · ${totals.active} active · ${money(totals.monthly)} / month`}
                  action={<Badge>{filtered.length} results</Badge>}
                />
              </div>
              <div className="grid items-end gap-lg border-b border-secondary bg-secondary p-2xl sm:grid-cols-2">
                <Field label="Search subscriptions">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-lg top-1/2 -translate-y-1/2 shrink-0 text-fg-quaternary"
                      aria-hidden="true"
                    />
                    <input
                      className={`${fieldClass} pl-4xl`}
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Name or category"
                    />
                  </div>
                </Field>
                <Field label="Provider status">
                  <select
                    className={fieldClass}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </div>
              {filtered.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-left text-sm">
                    <caption className="sr-only">
                      Subscription inventory. Prices are in USD.
                    </caption>
                    <thead className="sticky top-0 z-10 border-b border-secondary bg-secondary text-xs text-tertiary">
                      <tr>
                        {[
                          'Service',
                          'Monthly equivalent',
                          'Next renewal',
                          'Usage & status',
                          'Actions',
                        ].map((h) => (
                          <th
                            scope="col"
                            className={`px-2xl py-lg font-semibold ${h === 'Monthly equivalent' || h === 'Actions' ? 'text-right' : ''}`}
                            key={h}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(page * 8, page * 8 + 8).map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-secondary last:border-b-0 hover:bg-primary-hover"
                        >
                          <td className="px-2xl py-xl">
                            <div className="flex items-center gap-lg">
                              <ServiceAvatar name={s.name} />
                              <div>
                                <p
                                  className="max-w-xs truncate font-semibold"
                                  title={s.name}
                                >
                                  {s.name}
                                </p>
                                <p className="mt-xs text-xs text-tertiary">
                                  {s.category}
                                  {s.workRelated ? ' · Work' : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-2xl py-xl text-right tabular-nums">
                            <p className="font-medium">
                              {money(monthlyCents(s))}
                            </p>
                            <p className="mt-xs text-xs text-tertiary">
                              {money(s.costCents)} /{' '}
                              {s.cadence === 'annual' ? 'year' : 'month'}
                            </p>
                          </td>
                          <td className="px-2xl py-xl text-secondary">
                            {dateLabel(s.renewsOn)}
                            <p className="mt-xs text-xs text-tertiary">
                              {s.status === 'active'
                                ? renewalLabel(s)
                                : 'Not counted in budget'}
                            </p>
                          </td>
                          <td className="px-2xl py-xl">
                            <div className="flex items-center gap-sm">
                              <Badge
                                tone={
                                  s.status === 'active' ? 'success' : 'gray'
                                }
                              >
                                {s.status}
                              </Badge>
                              {s.importance === 'essential' && (
                                <ShieldCheck
                                  size={16}
                                  className="text-fg-secondary"
                                  aria-label="Protected essential service"
                                />
                              )}
                            </div>
                            <p className="mt-xs text-xs text-tertiary">
                              {s.usage} use
                            </p>
                          </td>
                          <td className="px-2xl py-xl">
                            <div className="flex justify-end gap-sm">
                              <Button
                                variant="quiet"
                                disabled={Boolean(warning)}
                                aria-label={`Edit ${s.name}`}
                                onClick={() => setEditing(s)}
                              >
                                Edit
                              </Button>
                              {s.status === 'active' && (
                                <Button
                                  variant="quiet"
                                  disabled={Boolean(warning)}
                                  aria-label={`Review ${s.name}`}
                                  onClick={() => setReviewing(s)}
                                >
                                  Review
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3xl text-center">
                  <h3 className="text-md font-semibold">
                    {workspace.subscriptions.length
                      ? 'No matching subscriptions'
                      : 'Your subscription list starts here'}
                  </h3>
                  <p className="mt-md text-sm text-tertiary">
                    {workspace.subscriptions.length
                      ? 'Try another name or status filter.'
                      : 'Add your first service, price, and renewal date.'}
                  </p>
                </div>
              )}
              {pagination}
            </section>
          )}
          {view === 'renewals' &&
            (ordered.length ? (
              <div className="space-y-2xl">
                <div className="flex flex-wrap items-center justify-between gap-lg rounded-xl border border-primary bg-secondary p-2xl">
                  <div>
                    <p className="text-sm font-semibold">
                      {ordered.length} active renewals
                    </p>
                    <p className="mt-xs text-xs text-tertiary">
                      Review a recommendation. You always make the final call.
                    </p>
                  </div>
                  <Badge tone={candidates.length ? 'warning' : 'gray'}>
                    {candidates.length} worth reviewing
                  </Badge>
                </div>
                {ordered.map((s) => {
                  const r = recommendation(s);
                  return (
                    <section
                      key={s.id}
                      className="rounded-xl border border-secondary bg-primary p-2xl"
                    >
                      <RenewalRow service={s} />
                      <p className="mt-xl text-xs font-medium uppercase tracking-wider text-tertiary">
                        Recommendation signals
                      </p>
                      <div className="flex flex-wrap gap-md pt-lg">
                        <Badge>{r.confidence}</Badge>
                        {r.evidence.length > 0 && (
                          <Badge
                            tone={r.evidence[0].demo ? 'warning' : 'brand'}
                          >
                            {r.evidence[0].demo
                              ? 'Sample context'
                              : r.evidence[0].storage === 'mainnet' ||
                                  r.evidence[0].storage === 'testnet'
                                ? `${r.evidence[0].storage === 'mainnet' ? 'Mainnet' : 'Testnet'} context`
                                : 'Local context'}
                          </Badge>
                        )}
                      </div>
                      <ul className="mt-lg space-y-sm text-sm text-tertiary">
                        {r.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                      {r.evidence[0] && (
                        <blockquote className="mt-xl break-words border-l-2 border-secondary pl-lg text-xs text-tertiary">
                          Remembered rationale: “{r.evidence[0].reason}”
                        </blockquote>
                      )}
                      {daysUntil(s.renewsOn) <= 0 && (
                        <Button
                          className="mt-xl"
                          disabled={Boolean(warning)}
                          onClick={() => setAdvancing(s)}
                        >
                          I renewed · update next date
                        </Button>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <Empty title="No renewals to review">
                Add an active subscription to start making informed decisions.
              </Empty>
            ))}
          {view === 'journal' && (
            <>
              <div className="grid overflow-hidden rounded-xl border border-primary bg-secondary sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Browser-local decisions',
                    value: workspace.decisions.filter(
                      (d) => !memoryReceipts(d).length && !d.demo,
                    ).length,
                  },
                  {
                    label: 'Uploads pending',
                    value: workspace.decisions
                      .flatMap(memoryReceipts)
                      .filter((r) => r.storage === 'pending').length,
                  },
                  { label: 'Unique Mainnet blobs', value: mainnetCount },
                  { label: 'Unique Testnet blobs', value: testnetCount },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="border-b border-primary p-2xl last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                  >
                    <p className="text-xs text-tertiary">{stat.label}</p>
                    <p className="mt-md text-heading-xs font-semibold tabular-nums">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
              <Field label="Search decision context">
                <input
                  className={fieldClass}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Service or rationale"
                />
              </Field>
              <p className="text-xs text-tertiary">
                {workspace.decisions.filter((d) => d.demo).length} sample
                decisions · Mainnet count is workspace-scoped, not account-wide.
                Walrus uploads are explicit. Active upload target:{' '}
                {networkLabel}. Testnet does not count toward Mainnet
                eligibility.
              </p>
              {journal.length ? (
                <div className="space-y-xl">
                  {journal.slice(page * 8, page * 8 + 8).map((d) => (
                    <article
                      key={d.id}
                      className="rounded-xl border border-secondary bg-primary p-2xl"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-lg">
                        <div className="flex flex-wrap items-center gap-md">
                          <ServiceAvatar name={d.serviceName} />
                          <h2 className="break-words text-sm font-semibold">
                            {d.serviceName}
                          </h2>
                          <Badge tone={actionTone(d.action)}>
                            {d.action === 'cancel'
                              ? 'Plan to cancel'
                              : actionLabels[d.action]}
                          </Badge>
                          {!memoryReceipts(d).length && (
                            <Badge tone={d.demo ? 'warning' : 'gray'}>
                              {d.demo ? 'Sample · local' : 'Browser local'}
                            </Badge>
                          )}
                          {memoryReceipts(d).map((r) => (
                            <Badge
                              key={r.network}
                              tone={
                                r.storage === r.network
                                  ? r.network === 'testnet'
                                    ? 'warning'
                                    : 'success'
                                  : r.storage === 'error'
                                    ? 'error'
                                    : 'gray'
                              }
                            >
                              {r.network === 'testnet' ? 'Testnet' : 'Mainnet'}{' '}
                              ·{' '}
                              {r.storage === r.network
                                ? 'confirmed'
                                : r.storage === 'pending'
                                  ? 'pending'
                                  : 'failed'}
                            </Badge>
                          ))}
                        </div>
                        <time
                          className="text-xs text-quaternary"
                          dateTime={d.at}
                        >
                          {new Date(d.at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-xl whitespace-pre-wrap break-words border-l-2 border-secondary pl-lg text-sm text-secondary">
                        {d.reason}
                      </p>
                      <p className="mt-lg text-xs text-tertiary">
                        Value: {d.value.split('-').join(' ')} ·{' '}
                        {money(d.costCents)} /{' '}
                        {d.cadence === 'annual' ? 'year' : 'month'}
                      </p>
                      {memoryReceipts(d).map((r) => (
                        <div key={r.network}>
                          <p className="mt-md break-all font-mono text-xs text-quaternary">
                            {r.network === 'testnet' ? 'Testnet' : 'Mainnet'} ·{' '}
                            {r.blobId
                              ? `Walrus blob: ${r.blobId}`
                              : `Job: ${r.jobId ?? 'Unavailable'}`}
                          </p>
                          {r.syncError && (
                            <p className="mt-md text-sm text-error-primary">
                              {r.syncError}
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-lg empty:hidden">
                        {!d.demo &&
                          (!network ||
                            ![network, 'pending'].includes(
                              decisionReceipt(d, network)?.storage ?? '',
                            )) && (
                            <Button
                              className="mt-xl"
                              disabled={
                                Boolean(warning) ||
                                busy ||
                                workspace.sample ||
                                !connections?.walrusConfigured ||
                                !connections?.walletAuthenticated ||
                                !session.credentialsConfigured
                              }
                              onClick={() => setUploading(d)}
                            >
                              Upload to Walrus · {networkLabel}
                            </Button>
                          )}
                        {network &&
                          decisionReceipt(d, network)?.jobId &&
                          decisionReceipt(d, network)?.storage !== network && (
                            <Button
                              className="mt-xl"
                              disabled={
                                Boolean(warning) ||
                                busy ||
                                !session.credentialsConfigured ||
                                !connections?.walrusConfigured ||
                                !connections?.walletAuthenticated
                              }
                              onClick={() => remoteDecision(d, false)}
                            >
                              {busy ? 'Checking…' : 'Check upload status'}
                            </Button>
                          )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="No decisions recorded yet">
                  Review a subscription and explain your choice. Your next
                  recommendation will remember it.
                </Empty>
              )}
              {pagination}
            </>
          )}
          {view === 'connections' && (
            <ConnectionsView
              workspace={workspace}
              commit={commit}
              locked={Boolean(warning)}
              onBusy={setBusy}
              onConfig={setConnections}
            />
          )}
          {view === 'assistant' && (
            <AssistantView workspace={workspace} connections={connections}
              locked={Boolean(warning)} onBusy={setBusy} onConnections={() => navigate('connections')} />
          )}
          {view === 'settings' && (
            <SettingsView
              workspace={workspace}
              commit={commit}
              replace={replace}
              locked={Boolean(warning)}
              busy={busy}
              wallet={wallet}
            />
          )}
          <footer className="border-t border-secondary pt-xl text-xs text-quaternary">
            SubSense · Manual tracking, explainable rules, and memories you
            control. Not financial advice.
          </footer>
        </main>
      </div>
      {mobileNav && (
        <Modal
          title="SubSense navigation"
          subtitle={
            workspace.sample ? 'Sample workspace' : 'Browser-local workspace'
          }
          onClose={() => setMobileNav(false)}
        >
          {navigation(false)}
          <p className="my-xl text-xs font-medium text-tertiary">
            INFRASTRUCTURE
          </p>
          {navigation(true)}
        </Modal>
      )}
      {editing && (
        <SubscriptionForm
          service={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSave={(s) => {
            const ok = commit((w) => ({
              ...w,
              subscriptions: w.subscriptions.some((old) => old.id === s.id)
                ? w.subscriptions.map((old) => (old.id === s.id ? s : old))
                : [...w.subscriptions, s],
            }));
            if (ok) setMessage(`${s.name} saved.`);
            return ok;
          }}
        />
      )}
      {reviewing && (
        <ReviewForm
          service={reviewing}
          recommendation={recommendation(reviewing)}
          sample={workspace.sample}
          onClose={() => setReviewing(undefined)}
          onSave={reviewSaved}
        />
      )}
      {uploading && (
        <Modal
          title={`Upload ${uploading.serviceName} decision?`}
          subtitle={`This sends one decision to the Walrus ${networkLabel} relayer.`}
          onClose={() => {
            if (!busy) setUploading(undefined);
          }}
        >
          <div className="space-y-xl">
            <p className="text-sm text-secondary">
              You are sending the service name, category, price, decision, and
              the following rationale. The relayer processes plaintext for
              embedding/encryption. Stored blobs are encrypted. This is not
              automatic synchronisation.
            </p>
            <blockquote className="border-l-2 border-secondary pl-xl text-sm text-tertiary">
              {uploading.reason}
            </blockquote>
            <p className="text-xs text-tertiary">
              Do not upload secrets or sensitive client details. An accepted job
              remains pending until the relayer confirms completion. If an
              earlier request timed out, recall first before retrying.
            </p>
            <div className="flex justify-end gap-lg">
              <Button disabled={busy} onClick={() => setUploading(undefined)}>
                Keep local
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => remoteDecision(uploading, true)}
              >
                {busy ? 'Submitting…' : `Confirm ${networkLabel} upload`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {advancing && (
        <Modal
          title={`Confirm ${advancing.name} renewed`}
          onClose={() => setAdvancing(undefined)}
        >
          <div className="space-y-xl">
            <p className="text-sm text-secondary">
              Only continue if you confirmed renewal with the provider. This
              updates your manually tracked date to{' '}
              {nextRenewal(advancing.renewsOn, advancing.cadence)}. It does not
              make a payment or verify billing.
            </p>
            <div className="flex justify-end gap-lg">
              <Button onClick={() => setAdvancing(undefined)}>Back</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (
                    commit((w) => ({
                      ...w,
                      subscriptions: w.subscriptions.map((s) =>
                        s.id === advancing.id
                          ? {
                              ...s,
                              renewsOn: nextRenewal(s.renewsOn, s.cadence),
                            }
                          : s,
                      ),
                    }))
                  ) {
                    setMessage(
                      'Next renewal date updated from your confirmation.',
                    );
                    setAdvancing(undefined);
                  }
                }}
              >
                Confirm & update date
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
