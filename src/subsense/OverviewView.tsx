import { ArrowRight, ArrowUpRight, CalendarDays, Check, CircleDollarSign, ListChecks, Plus, Sparkles } from 'lucide-react';
import { daysUntil, monthlyCents, recommend, summarize } from '../../shared/subsense.mjs';
import type { Subscription, Workspace } from './workspace';
import { dateLabel, money } from './workspace';
import { actionLabels, actionTone } from './forms';
import { Badge, Button, SectionHeading, ServiceAvatar } from './ui';

export default function OverviewView({ workspace, locked, onReview, onNavigate, onAdd }: {
  workspace: Workspace;
  locked: boolean;
  onReview: (service: Subscription) => void;
  onNavigate: (view: 'subscriptions' | 'renewals' | 'journal' | 'settings') => void;
  onAdd: () => void;
}) {
  const totals = summarize(workspace.subscriptions, workspace.budgetCents);
  const active = workspace.subscriptions.filter((s) => s.status === 'active');
  const ordered = [...active].sort((a, b) => a.renewsOn.localeCompare(b.renewsOn));
  const advice = (s: Subscription) => recommend(s, workspace.decisions, { overBudget: totals.headroom < 0 });
  const learned = active.filter((s) => advice(s).changed);
  const candidates = active.filter((s) => advice(s).action !== 'keep');
  const due = active.filter((s) => daysUntil(s.renewsOn) >= 0 && daysUntil(s.renewsOn) <= 7);
  const overdue = active.filter((s) => daysUntil(s.renewsOn) < 0);
  const categories = [...new Set(active.map((s) => s.category))]
    .map((name) => ({ name, amount: active.filter((s) => s.category === name).reduce((sum, s) => sum + monthlyCents(s), 0) }))
    .sort((a, b) => b.amount - a.amount);
  // Keep the chart legible with at most four slices; the legend shows exact amounts.
  const chartCategories = categories.length > 4
    ? [...categories.slice(0, 3), { name: 'Other categories', amount: categories.slice(3).reduce((sum, c) => sum + c.amount, 0) }]
    : categories;
  const utilization = Math.round(totals.utilization * 100);
  let offset = 0;

  return (
    <>
      {!workspace.subscriptions.length && (
        <section className="flex flex-col items-start justify-between gap-xl rounded-3xl border border-utility-brand-200 bg-utility-brand-50 p-2xl sm:flex-row sm:items-center">
          <div className="flex items-start gap-lg">
            <span className="ss-stat-icon bg-primary"><Sparkles size={21} aria-hidden="true" /></span>
            <div><h2 className="text-md font-semibold">A clearer picture starts here</h2><p className="mt-xs text-sm text-secondary">Add a subscription. We’ll help you keep track of the cost and the next renewal.</p></div>
          </div>
          <Button variant="primary" disabled={locked} onClick={onAdd}><Plus size={17} aria-hidden="true" />Add your first subscription</Button>
        </section>
      )}

      <div className="grid gap-2xl xl:grid-cols-3">
        <section aria-label="Monthly spending" className="ss-feature-card xl:col-span-2">
          <div className="ss-feature-content">
            <div className="flex items-center justify-between gap-lg">
              <p className="flex items-center gap-md text-sm ss-sidebar-muted"><CircleDollarSign size={18} aria-hidden="true" />Your monthly spending</p>
              <span className="rounded-full border ss-feature-divider px-lg py-sm text-xs ss-sidebar-muted">USD</span>
            </div>
            <p className="mt-xl break-words text-heading-lg font-medium tracking-tight tabular-nums md:text-heading-xl">{money(totals.monthly)}<span className="ml-md text-sm font-regular ss-sidebar-muted">/ month</span></p>
            <p className="mt-sm text-xs ss-sidebar-muted">Yearly plans are spread over 12 months, so you can compare them fairly.</p>
            <div className="mt-3xl flex flex-wrap items-center justify-between gap-xl border-t ss-feature-divider pt-xl">
              <div><p className="text-xs ss-sidebar-muted">Estimated yearly cost</p><p className="mt-xs text-lg font-medium tabular-nums">{money(totals.annual)}</p></div>
              <button className="ss-feature-link" onClick={() => onNavigate('subscriptions')}>View subscriptions<ArrowUpRight size={17} aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <section className="ss-panel p-3xl" aria-label="Monthly budget">
          <div className="flex items-center justify-between gap-md"><p className="text-sm text-tertiary">{totals.headroom < 0 ? 'Over your budget' : 'Left in your budget'}</p><Button variant="quiet" aria-label="Edit monthly budget" onClick={() => onNavigate('settings')}><ArrowUpRight size={18} aria-hidden="true" /></Button></div>
          <p className={`mt-lg break-words text-heading-md font-medium tracking-tight tabular-nums ${totals.headroom < 0 ? 'text-error-primary' : ''}`}>{money(Math.abs(totals.headroom))}</p>
          <div className="mt-3xl flex justify-between gap-md text-xs text-tertiary"><span>Monthly limit</span><span className="font-medium text-secondary">{money(workspace.budgetCents)}</span></div>
          <div className="mt-lg h-2 overflow-hidden rounded-full bg-tertiary" role="progressbar" aria-label="Monthly budget used" aria-valuenow={Math.min(100, utilization)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${utilization}% of your budget used`}>
            <div className={`h-full rounded-full ${totals.headroom < 0 ? 'bg-utility-error-600' : 'bg-brand-solid'}`} style={{ width: `${Math.min(100, totals.utilization * 100)}%` }} />
          </div>
          <p className="mt-lg flex items-center gap-sm text-xs text-tertiary">{totals.headroom >= 0 && <Check size={15} className="text-fg-success-primary" aria-hidden="true" />}{utilization}% used{totals.headroom < 0 ? ' · Time to review your spending' : ' · You’re within your budget'}</p>
        </section>
      </div>

      <div className="grid grid-cols-3 gap-md sm:gap-xl" aria-label="At a glance">
        {[
          { label: 'Active subscriptions', value: totals.active, note: 'Everything you’re currently paying for', icon: ListChecks },
          { label: 'Renewing this week', value: due.length, note: `${money(due.reduce((sum, s) => sum + s.costCents, 0))} in upcoming renewals`, icon: CalendarDays },
          { label: 'Worth a second look', value: candidates.length, note: candidates.length ? 'You might find a better fit or a lower cost' : 'No changes suggested right now', icon: Sparkles },
        ].map((stat) => <section key={stat.label} className="ss-panel flex items-start gap-lg p-lg sm:p-2xl"><span className="ss-stat-icon hidden md:flex"><stat.icon size={21} aria-hidden="true" /></span><div><p className="text-xs text-tertiary">{stat.label}</p><p className="mt-sm text-heading-xs font-medium tabular-nums">{stat.value}</p><p className="mt-xs hidden text-xs text-tertiary sm:block">{stat.note}</p></div></section>)}
      </div>

      <div className="grid items-start gap-2xl xl:grid-cols-3">
        <section className="ss-panel xl:col-span-2">
          <div className="ss-panel-heading"><SectionHeading title="Upcoming renewals" description="A little planning, fewer surprises." action={<Button variant="quiet" onClick={() => onNavigate('renewals')}>See all<ArrowUpRight size={16} aria-hidden="true" /></Button>} /></div>
          {overdue.length > 0 && <p className="mx-3xl mb-md rounded-lg bg-utility-warning-50 px-lg py-md text-xs text-utility-warning-700">{overdue.length} {overdue.length === 1 ? 'date needs' : 'dates need'} updating. Confirm whether these services renewed.</p>}
          <div className="px-3xl pb-lg">
            {ordered.length ? ordered.slice(0, 4).map((s) => {
              const days = daysUntil(s.renewsOn);
              const r = advice(s);
              return <div key={s.id} className="ss-renewal-row">
                <ServiceAvatar name={s.name} />
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{s.name}</p><p className="mt-xs text-xs text-tertiary">{s.category} · {dateLabel(s.renewsOn)}{days < 0 ? ' · Update date' : days === 0 ? ' · Today' : ` · In ${days} ${days === 1 ? 'day' : 'days'}`}</p></div>
                <div className="text-right"><p className="text-sm font-medium tabular-nums">{money(s.costCents)}</p><p className="mt-xs text-xs text-tertiary">/ {s.cadence === 'annual' ? 'year' : 'month'}</p></div>
                <div className="flex w-full items-center justify-between gap-md sm:w-auto"><Badge tone={actionTone(r.action)}>{actionLabels[r.action]}</Badge><Button variant="quiet" aria-label={`Review ${s.name}`} disabled={locked} onClick={() => onReview(s)}><ArrowRight size={18} aria-hidden="true" /></Button></div>
              </div>;
            }) : <div className="flex flex-col items-center gap-lg py-4xl text-center"><span className="ss-stat-icon"><CalendarDays size={23} aria-hidden="true" /></span><p className="text-sm font-medium">No upcoming renewals yet</p><p className="max-w-xs text-xs text-tertiary">Your active subscriptions will appear here, ordered by their next renewal.</p><Button disabled={locked} onClick={onAdd}>Add a subscription<Plus size={16} aria-hidden="true" /></Button></div>}
          </div>
        </section>

        <section className="ss-panel p-3xl">
          <SectionHeading title="Where your money goes" description="Monthly spending by category" />
          <div className="ss-category-chart my-2xl" role="img" aria-label={totals.monthly ? chartCategories.map((c) => `${c.name}: ${money(c.amount)}`).join(', ') : 'No spending yet'}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" stroke="var(--color-bg-tertiary)" />{chartCategories.map((category, index) => {
              const proportion = totals.monthly ? category.amount / totals.monthly : 0;
              const start = offset;
              offset += proportion * 100;
              return <circle key={category.name} cx="50" cy="50" r="40" pathLength="100" stroke={`var(--ss-chart-${index + 1})`} strokeDasharray={`${Math.max(0, proportion * 100 - 1.2)} 100`} strokeDashoffset={-start} />;
            })}</svg>
            <div className="z-10 max-w-28 text-center"><p className="text-xs text-tertiary">Monthly total</p><p className="mt-xs break-words text-lg font-semibold tabular-nums">{money(totals.monthly)}</p></div>
          </div>
          <div className="space-y-lg">{chartCategories.length ? chartCategories.map((c, index) => <div key={c.name} className="flex items-center gap-md text-xs"><span className="ss-chart-dot" style={{ background: `var(--ss-chart-${index + 1})` }} aria-hidden="true" /><span className="min-w-0 flex-1 text-secondary">{c.name}</span><span className="font-medium tabular-nums">{money(c.amount)}</span></div>) : <p className="pb-lg text-center text-xs text-tertiary">Add an active subscription to see your breakdown.</p>}</div>
        </section>
      </div>

      <section className="ss-panel p-3xl">
        <SectionHeading title="Better advice starts with you" description="Your past choices help us understand what matters." action={<Button variant="quiet" onClick={() => onNavigate('journal')}>Your decisions<ArrowUpRight size={16} aria-hidden="true" /></Button>} />
        {learned.length ? <div className="mt-xl divide-y divide-secondary">{learned.slice(0, 3).map((s) => {
          const r = advice(s);
          return <div key={s.id} className="flex flex-col gap-lg py-xl sm:flex-row sm:items-center"><ServiceAvatar name={s.name} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{s.name}</p><p className="mt-xs break-words text-xs text-tertiary">“{r.evidence[0]?.reason}”</p></div><div className="flex flex-wrap items-center gap-md"><span className="text-xs text-tertiary">{actionLabels[r.baselineAction]} before</span><ArrowRight size={15} className="text-fg-tertiary" aria-hidden="true" /><Badge tone={actionTone(r.action)}>{actionLabels[r.action]} now</Badge>{r.evidence[0]?.demo && <Badge tone="warning">Example</Badge>}</div></div>;
        })}</div> : <div className="mt-xl flex items-start gap-lg border-t border-secondary pt-xl"><span className="ss-stat-icon"><Sparkles size={20} aria-hidden="true" /></span><div><p className="text-sm font-medium">Not every subscription is just a number.</p><p className="mt-xs text-xs text-tertiary">Tell us why you kept or reconsidered a service. When your reason changes a suggestion, you’ll see it here.</p></div></div>}
      </section>
    </>
  );
}
