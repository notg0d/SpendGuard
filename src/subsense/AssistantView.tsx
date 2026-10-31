import { useEffect, useRef, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { api } from './api';
import type { Connections } from './api';
import type { Workspace } from './workspace';
import { money } from './workspace';
import { useWalletAccess } from './WalletAccess';
import { Choices } from './forms';
import { Badge, Button, Field, Notice, SectionHeading, fieldClass } from './ui';

type Source = { id: string; label: string; kind: string };
type AIResult = {
  network: 'mainnet'; mode: string; model: string; answer?: string;
  dataCollection: 'allow' | 'deny';
  sources?: Source[]; matches?: (Source & { excerpt: string; score: number })[];
  contextCount: number; usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
  totals?: { monthly: number; headroom: number };
};

export default function AssistantView({ workspace, connections, locked, onBusy, onConnections }: {
  workspace: Workspace; connections?: Connections; locked: boolean;
  onBusy: (busy: boolean) => void; onConnections: () => void;
}) {
  const { session } = useWalletAccess();
  const wallet = session.walletAddress!;
  const [mode, setMode] = useState('ask');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [consent, setConsent] = useState(false);
  const [allowDataCollection, setAllowDataCollection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AIResult>();
  const operation = useRef<AbortController>();
  const resetConsent = () => { setConsent(false); setAllowDataCollection(false); };
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    setResult(undefined); resetConsent(); setSelected(new Set());
  }, [workspace.profileId, workspace.subscriptions, workspace.decisions, workspace.budgetCents,
    wallet, locked, connections?.aiConfigured, connections?.chatModel, session.vaultUnlocked]);
  const records = [
    ...workspace.subscriptions.map((s) => ({ id: `subscription:${s.id}`, label: s.name, detail: `${money(s.costCents)} / ${s.cadence}`, content: s.notes })),
    ...workspace.decisions.filter((d) => !d.demo).sort((a, b) => b.at.localeCompare(a.at))
      .map((d) => ({ id: `decision:${d.id}`, label: d.serviceName, detail: `${d.action} · ${d.at.slice(0, 10)}`, content: d.reason })),
  ];
  const activeIds = new Set(records.filter((r) => selected.has(r.id)).map((r) => r.id));
  const ready = Boolean(connections?.aiConfigured);
  const disabled = busy || locked || workspace.sample;
  async function submit() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); onBusy(true); setError(''); setResult(undefined);
    try {
      const response = await api<AIResult>('/ai/run', {
        network: 'mainnet', mode, query, consent, allowDataCollection, budgetCents: workspace.budgetCents,
        subscriptions: workspace.subscriptions.filter((s) => activeIds.has(`subscription:${s.id}`)),
        decisions: workspace.decisions.filter((d) => !d.demo && activeIds.has(`decision:${d.id}`)),
      }, { wallet, signal: controller.signal });
      if (!controller.signal.aborted) setResult(response);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      operation.current = undefined;
      if (!controller.signal.aborted) { setBusy(false); onBusy(false); resetConsent(); }
    }
  }
  return (
    <div className="grid items-start gap-2xl xl:grid-cols-3">
      {!ready && <div className="xl:col-span-3"><Notice>
        Want some AI help? Connect your free OpenRouter account in Optional features. You can draft a question here first.
        <Button className="mt-lg" onClick={onConnections}>Set up AI help</Button>
      </Notice></div>}
      {workspace.sample && <div className="xl:col-span-3"><Notice>Start your own workspace in Settings before sharing information with AI.</Notice></div>}
      <section className="ss-panel space-y-xl p-3xl xl:col-span-2">
        <SectionHeading title="What can I help you with?" description="Ask a question. You stay in control."
          action={<Badge tone={ready ? 'success' : 'gray'}>{ready ? 'Ready' : 'Setup needed'}</Badge>} />
        <form className="space-y-xl" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Choices label="What would you like to do?" value={mode} disabled={disabled}
            options={[{ value: 'ask', label: 'Ask a question' }, { value: 'explain', label: 'Explain decisions' },
              { value: 'plan', label: 'Plan renewals' }, { value: 'search', label: 'Find a decision' }]}
            onChange={(value) => { setMode(value); setResult(undefined); resetConsent(); }} />
          <Field label={mode === 'search' ? '1. What are you looking for?' : '1. What’s on your mind?'}>
            <textarea className={fieldClass} rows={3} maxLength={1000} required disabled={disabled}
              placeholder={mode === 'search' ? 'Which services help me with client handoffs?' : 'What should I review before my next renewals?'}
              value={query} onChange={(e) => { setQuery(e.target.value); resetConsent(); setResult(undefined); }} />
          </Field>
          <div className="flex flex-wrap gap-md">{['Where could I cut costs?', 'Help me plan my next renewals'].map((prompt) => <Button key={prompt} variant="quiet" className="text-xs" disabled={disabled} onClick={() => { setQuery(prompt); resetConsent(); setResult(undefined); }}>{prompt}</Button>)}</div>
          <div className="space-y-lg border-t border-secondary pt-xl">
            <div className="flex flex-wrap items-center justify-between gap-lg">
              <h2 className="text-sm font-semibold">2. Choose what to share · {activeIds.size} / 100</h2>
              <Button disabled={disabled || !selected.size} onClick={() => { setSelected(new Set()); resetConsent(); }}>Clear selection</Button>
            </div>
            <p className="text-xs text-tertiary">
              Only the subscriptions and decisions you select are shared, including their names, prices, dates, usage, importance, notes and reasons. Advice also includes your {money(workspace.budgetCents)} budget. Your wallet address, keys and payment records are never included.
            </p>
            {records.length ? <div className="max-h-80 overflow-y-auto divide-y divide-secondary">
              {records.map((record) => <label key={record.id} className="flex cursor-pointer items-start gap-lg py-lg">
                <input type="checkbox" className="mt-xxs size-4 shrink-0 rounded-xs border border-primary bg-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                  checked={activeIds.has(record.id)} disabled={disabled || (!activeIds.has(record.id) && activeIds.size >= 100)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelected((old) => { const next = new Set(old); checked ? next.add(record.id) : next.delete(record.id); return next; });
                    resetConsent(); setResult(undefined);
                  }} />
                <span className="min-w-0 space-y-xs">
                  <span className="block break-words text-sm font-medium text-secondary">{record.label} · {record.detail}</span>
                  <span className="block break-words text-xs text-tertiary">{record.content || 'No notes.'}</span>
                </span>
              </label>)}
            </div> : <p className="text-sm text-tertiary">Nothing to share yet. Add a subscription or save a decision first.</p>}
          </div>
          <details className="ss-disclosure"><summary>Demo data options <span className="text-xs text-tertiary">(advanced)</span></summary><div className="ss-disclosure-body">
            <label className="flex items-start gap-lg text-sm text-secondary">
              <input type="checkbox" className="mt-xxs size-4 shrink-0 rounded-xs border border-primary bg-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-describedby="demo-privacy-hint" checked={allowDataCollection}
                disabled={disabled || !ready || !activeIds.size}
                onChange={(e) => { setAllowDataCollection(e.target.checked); setConsent(false); setResult(undefined); }} />
              <span className="min-w-0 space-y-xs">
                <span className="block font-medium">Allow data-collecting providers for this demo request · optional</span>
                <span className="block text-xs text-tertiary">I confirm this question and selected context are synthetic demo data, and accept that providers may retain or train on them. This applies to this request only.</span>
              </span>
            </label>
            <p id="demo-privacy-hint" className="text-xs text-tertiary">
              Leave this off for private data. Your OpenRouter account Privacy settings and guardrails still apply; this option cannot override them. Free-only pricing remains enforced.
            </p>
          </div></details>
          <p className="text-sm font-semibold">3. Review & send</p>
          <label className="flex items-start gap-lg text-sm text-secondary">
            <input type="checkbox" className="mt-xxs size-4 shrink-0 rounded-xs border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              checked={consent} disabled={disabled || !ready || !activeIds.size} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to share this question and the selected information with OpenRouter and its AI provider for this request.</span>
          </label>
          <p className="text-xs text-tertiary">AI can make mistakes. Nothing changes in your subscriptions unless you make the change yourself. Results aren’t saved.</p>
          <details className="ss-disclosure"><summary>How AI & privacy work</summary><div className="ss-disclosure-body text-xs text-tertiary">
            Answers use {connections?.chatModel ?? 'the vault’s selected free chat model'}; search uses free Nemotron 3.5 Embed 1B.
            {allowDataCollection ? ' Demo opt-in: data-collecting providers are permitted; they may retain or train on your submitted data.' : ' Strict default: routing excludes providers that collect data.'}
            {' '}Provider privacy policies still apply. Free quotas apply; no paid fallbacks, tools or automatic retries.
            Search caches embeddings only in the temporary session; locking clears them. Results are not saved.
          </div></details>
          <Button type="submit" variant="primary" disabled={disabled || !ready || !consent || !query.trim() || !activeIds.size}>
            {mode === 'search' ? <Search size={16} className="shrink-0" aria-hidden="true" /> : <Sparkles size={16} className="shrink-0" aria-hidden="true" />}
            {busy ? 'Working…' : mode === 'search' ? 'Find a decision' : 'Ask assistant'}
          </Button>
        </form>
      </section>
      {error && <div className="xl:col-span-3"><Notice error>{error}</Notice></div>}
      <section className="ss-panel space-y-xl p-3xl xl:sticky xl:top-xl" aria-live="polite" aria-busy={busy}>
        <SectionHeading title={mode === 'search' ? 'What we found' : 'Your answer'} description="Suggestions to help you decide" />
        {busy ? <p className="text-sm text-tertiary">Thinking it through. Your subscriptions won’t change.</p>
          : !result ? <div className="flex flex-col items-center gap-lg py-4xl text-center"><span className="ss-stat-icon"><Sparkles size={23} aria-hidden="true" /></span><p className="text-sm font-medium">Let’s make sense of it.</p><p className="text-xs text-tertiary">Ask a question and choose what to share. Your answer will appear here.</p></div>
          : <>
            <p className="text-xs text-tertiary">{result.dataCollection === 'allow'
              ? 'This result used the demo-data privacy opt-in: data-collecting providers were permitted. The option is now off for the next request.'
              : 'This result used strict privacy routing: data-collecting providers were excluded.'}</p>
            {result.answer && <p className="whitespace-pre-wrap break-words text-sm text-secondary">{result.answer}</p>}
            {result.totals && <p className="text-xs text-tertiary">Selected subscriptions: {money(result.totals.monthly)} / month · {money(result.totals.headroom)} left in your budget. This covers only the subscriptions you shared.</p>}
            {result.matches?.map((match) => <article key={match.id} className="space-y-sm border-t border-secondary pt-xl">
              <h3 className="break-words text-sm font-semibold">{match.label}</h3>
              <p className="text-xs text-tertiary">Possible match · {match.kind === 'subscription' ? 'Subscription' : 'Saved decision'}. Check whether it answers your question.</p>
              <p className="break-words text-sm text-secondary">{match.excerpt || 'No notes.'}</p>
            </article>)}
            {Boolean(result.sources?.length) && <div className="border-t border-secondary pt-xl">
              <h3 className="text-sm font-medium">Information used</h3>
              <ul className="mt-sm space-y-xs text-xs text-tertiary">{result.sources!.map((source) => <li className="break-words" key={source.id}>{source.label} · {source.kind}</li>)}</ul>
            </div>}
            <details className="ss-disclosure"><summary>Response details</summary><div className="ss-disclosure-body text-xs text-tertiary">{result.model} · {result.contextCount} selected records · {result.usage?.total_tokens ?? ((result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0))} reported tokens. Free-model quota applies. Advice may be wrong; review it yourself.</div></details>
            <Button onClick={() => setResult(undefined)}>Clear result</Button>
          </>}
      </section>
    </div>
  );
}
