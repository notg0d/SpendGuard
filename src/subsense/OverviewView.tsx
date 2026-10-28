import {
  ArrowRight,
  Brain,
  CalendarClock,
  Layers,
  ListChecks,
} from 'lucide-react';
import {
  daysUntil,
  monthlyCents,
  recommend,
  summarize,
  memoryReceipts,
} from '../../shared/subsense.mjs';
import type { Subscription, Workspace } from './workspace';
import { dateLabel, money } from './workspace';
import { actionLabels, actionTone } from './forms';
import { Badge, Button, SectionHeading, ServiceAvatar } from './ui';

export default function OverviewView({
  workspace,
  locked,
  onReview,
  onNavigate,
}: {
  workspace: Workspace;
  locked: boolean;
  onReview: (service: Subscription) => void;
  onNavigate: (
    view: 'subscriptions' | 'renewals' | 'journal' | 'settings',
  ) => void;
}) {
  const totals = summarize(workspace.subscriptions, workspace.budgetCents);
  const active = workspace.subscriptions.filter((s) => s.status === 'active');
  const ordered = [...active].sort((a, b) =>
    a.renewsOn.localeCompare(b.renewsOn),
  );
  const advice = (s: Subscription) =>
    recommend(s, workspace.decisions, { overBudget: totals.headroom < 0 });
  const learned = active.filter((s) => advice(s).changed);
  const candidates = active.filter((s) => advice(s).action !== 'keep');
  const due = active.filter(
    (s) => daysUntil(s.renewsOn) >= 0 && daysUntil(s.renewsOn) <= 7,
  );
  const overdue = active.filter((s) => daysUntil(s.renewsOn) < 0);
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
  const categories = [...new Set(active.map((s) => s.category))]
    .map((name) => ({
      name,
      amount: active
        .filter((s) => s.category === name)
        .reduce((sum, s) => sum + monthlyCents(s), 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <>
      <section
        aria-label="Spending summary"
        className="overflow-hidden rounded-xl border border-primary bg-secondary"
      >
        <div className="grid lg:grid-cols-2">
          <div className="p-2xl md:p-3xl">
            <div className="flex items-center gap-md">
              <p className="text-sm font-medium text-secondary">
                Monthly commitment
              </p>
              <span className="text-xs text-tertiary">USD</span>
            </div>
            <p className="mt-md break-words text-heading-md font-semibold tracking-tight tabular-nums md:text-heading-lg">
              {money(totals.monthly)}
              <span className="ml-md whitespace-nowrap text-sm font-regular text-tertiary">
                / month
              </span>
            </p>
            <p className="mt-lg text-xs text-tertiary">
              {money(totals.annual)} annual equivalent · {totals.active} active
              subscriptions
            </p>
          </div>
          <div className="border-t border-primary p-2xl md:p-3xl lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-lg">
              <div>
                <p className="text-sm font-medium text-secondary">
                  Budget headroom
                </p>
                <p
                  className={`mt-md text-heading-xs font-semibold tabular-nums ${totals.headroom < 0 ? 'text-error-primary' : 'text-primary'}`}
                >
                  {money(totals.headroom)}
                </p>
              </div>
              <Button
                variant="quiet"
                aria-label="Edit budget: monthly USD"
                onClick={() => onNavigate('settings')}
              >
                Edit budget <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-xl flex flex-wrap items-center justify-between gap-sm text-xs text-tertiary">
              <span>
                {money(totals.monthly)} of {money(workspace.budgetCents)}
              </span>
              <span className={totals.headroom < 0 ? 'text-error-primary' : ''}>
                {Math.round(totals.utilization * 100)}% committed
                {totals.headroom < 0 ? ' · over budget' : ''}
              </span>
            </div>
            <div
              className="mt-md h-2 overflow-hidden rounded-full bg-tertiary"
              role="progressbar"
              aria-label="Monthly budget committed"
              aria-valuenow={Math.min(
                100,
                Math.round(totals.utilization * 100),
              )}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${Math.round(totals.utilization * 100)}% committed`}
            >
              <div
                className={`h-full rounded-full ${totals.headroom < 0 ? 'bg-error-primary' : 'bg-brand-solid'}`}
                style={{ width: `${Math.min(100, totals.utilization * 100)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-primary">
          {[
            {
              label: 'Renewing within 7 days',
              value: due.length,
              note: `${overdue.length} overdue dates to update`,
              icon: CalendarClock,
            },
            {
              label: 'Worth a closer look',
              value: candidates.length,
              note: 'Based on usage, value & context',
              icon: ListChecks,
            },
            {
              label: 'Decisions remembered',
              value: workspace.decisions.length,
              note: `${learned.length} ${learned.length === 1 ? 'recommendation' : 'recommendations'} changed`,
              icon: Brain,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-start gap-lg border-r border-primary p-lg last:border-r-0 sm:p-xl md:px-3xl"
            >
              <stat.icon
                size={18}
                className="mt-xs hidden shrink-0 text-fg-tertiary sm:block"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs text-tertiary">{stat.label}</p>
                <p className="mt-sm text-xl font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-xs hidden text-xs text-tertiary sm:block">
                  {stat.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-2xl xl:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-secondary bg-primary xl:col-span-2">
          <div className="border-b border-secondary px-2xl py-xl">
            <SectionHeading
              title="Next renewals"
              description="Your next decision, before the next charge."
              action={
                <Button variant="quiet" onClick={() => onNavigate('renewals')}>
                  View all <ArrowRight size={16} aria-hidden="true" />
                </Button>
              }
            />
          </div>
          <div className="px-2xl">
            {ordered.length ? (
              ordered.slice(0, 4).map((s) => {
                const r = advice(s);
                const days = daysUntil(s.renewsOn);
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-lg border-b border-secondary py-xl last:border-b-0"
                  >
                    <ServiceAvatar name={s.name} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">
                        {s.name}
                      </p>
                      <p className="mt-xs text-xs text-tertiary">
                        {dateLabel(s.renewsOn)} ·{' '}
                        {days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? 'Today'
                            : `In ${days}d`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {money(s.costCents)}
                      </p>
                      <p className="mt-xs text-xs text-tertiary">
                        / {s.cadence === 'annual' ? 'year' : 'month'}
                      </p>
                    </div>
                    <div className="flex w-full items-center justify-between gap-lg sm:w-auto">
                      <Badge tone={actionTone(r.action)}>
                        {actionLabels[r.action]}
                      </Badge>
                      <Button
                        variant="quiet"
                        aria-label={`Review ${s.name}`}
                        disabled={locked}
                        onClick={() => onReview(s)}
                      >
                        Review <ArrowRight size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-3xl">
                <p className="text-sm text-tertiary">
                  No active subscriptions yet. Add one to build your renewal
                  queue.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-secondary bg-primary p-2xl">
          <SectionHeading
            title="Spending by category"
            description="Monthly equivalents · active services only"
          />
          <div className="mt-2xl space-y-xl">
            {categories.length ? (
              categories.map((category, index) => (
                <div key={category.name}>
                  <div className="flex items-center justify-between gap-lg text-xs">
                    <span className="text-secondary">{category.name}</span>
                    <span className="font-medium tabular-nums">
                      {money(category.amount)}
                    </span>
                  </div>
                  <div className="mt-md h-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${index === 0 ? 'bg-brand-solid' : 'bg-tertiary'}`}
                      style={{
                        width: `${totals.monthly ? (category.amount / totals.monthly) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-tertiary">
                Your category breakdown appears when you add an active service.
              </p>
            )}
          </div>
          <div className="mt-2xl flex items-center justify-between gap-lg border-t border-secondary pt-xl text-xs">
            <span className="text-tertiary">Monthly total</span>
            <span className="font-semibold tabular-nums">
              {money(totals.monthly)}
            </span>
          </div>
          <Button
            variant="quiet"
            className="mt-lg w-full"
            onClick={() => onNavigate('subscriptions')}
          >
            Manage subscriptions <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-secondary bg-primary">
        <div className="border-b border-secondary px-2xl py-xl">
          <SectionHeading
            title="What your memory changed"
            description="Usage is one signal. Your reasons complete the picture."
            action={
              <Button variant="quiet" onClick={() => onNavigate('journal')}>
                Decision journal <ArrowRight size={16} aria-hidden="true" />
              </Button>
            }
          />
        </div>
        <div className="grid lg:grid-cols-3">
          <div className="space-y-xl p-2xl lg:col-span-2">
            {learned.length ? (
              learned.slice(0, 3).map((s) => {
                const r = advice(s);
                return (
                  <div
                    key={s.id}
                    className="border-b border-secondary pb-xl last:border-b-0 last:pb-none"
                  >
                    <div className="flex flex-wrap items-center gap-md">
                      <span className="mr-sm text-sm font-semibold">
                        {s.name}
                      </span>
                      <Badge>
                        {actionLabels[r.baselineAction]} without memory
                      </Badge>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-fg-tertiary"
                        aria-hidden="true"
                      />
                      <Badge tone={actionTone(r.action)}>
                        {actionLabels[r.action]} with context
                      </Badge>
                      {r.evidence[0]?.demo && (
                        <Badge tone="warning">Sample example</Badge>
                      )}
                    </div>
                    <p className="mt-lg break-words border-l-2 border-secondary pl-lg text-sm text-tertiary">
                      “{r.evidence[0]?.reason}”
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="flex items-start gap-lg">
                <Brain
                  size={20}
                  className="shrink-0 text-fg-secondary"
                  aria-hidden="true"
                />
                <p className="text-sm text-tertiary">
                  Save a renewal decision with your rationale. When it changes
                  later advice, your before-and-after comparison appears here.
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-secondary bg-secondary p-2xl lg:border-l lg:border-t-0">
            <div className="flex items-center gap-md text-xs font-medium text-secondary">
              <Layers
                size={16}
                className="shrink-0 text-fg-secondary"
                aria-hidden="true"
              />{' '}
              MEMORY EVIDENCE
            </div>
            <p className="mt-lg text-heading-xs font-semibold tabular-nums">
              {mainnetCount}
              <span className="ml-md text-sm font-regular text-tertiary">
                confirmed Mainnet blobs · {testnetCount} Testnet blobs (testing
                only)
              </span>
            </p>
            <p className="mt-lg text-xs text-tertiary">
              Unique receipts in this workspace, not an account-wide total.
              Sample and pending decisions never count.
            </p>
            <p className="mt-xl text-xs text-secondary">
              Walrus uploads and AI context sharing require explicit requests.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
