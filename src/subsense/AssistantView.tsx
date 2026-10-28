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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AIResult>();
  const operation = useRef<AbortController>();
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    setResult(undefined); setConsent(false); setSelected(new Set());
  }, [workspace.profileId, workspace.subscriptions, workspace.decisions, workspace.budgetCents]);
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
        network: 'mainnet', mode, query, consent, budgetCents: workspace.budgetCents,
        subscriptions: workspace.subscriptions.filter((s) => activeIds.has(`subscription:${s.id}`)),
        decisions: workspace.decisions.filter((d) => !d.demo && activeIds.has(`decision:${d.id}`)),
      }, { wallet, signal: controller.signal });
      if (!controller.signal.aborted) setResult(response);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      operation.current = undefined;
      if (!controller.signal.aborted) { setBusy(false); onBusy(false); setConsent(false); }
    }
  }
  return (
    <div className="space-y-2xl">
      {!ready && <Notice>
        Add your OpenRouter API key to the encrypted vault in Connections to enable free AI.
        <Button className="mt-lg" onClick={onConnections}>Open Connections</Button>
      </Notice>}
      {workspace.sample && <Notice>Start an empty workspace in Settings before using personal AI context.</Notice>}
      <section className="space-y-xl rounded-xl border border-secondary bg-primary p-2xl">
        <SectionHeading title="Your context, your question" description="EXPLICIT REQUESTS · NO AUTONOMOUS ACTIONS"
          action={<Badge tone={ready ? 'success' : 'gray'}>{ready ? 'Free AI ready' : 'AI locked'}</Badge>} />
        <form className="space-y-xl" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Choices label="What would you like to do?" value={mode} disabled={disabled}
            options={[{ value: 'ask', label: 'Ask a question' }, { value: 'explain', label: 'Explain decisions' },
              { value: 'plan', label: 'Plan renewals' }, { value: 'search', label: 'Semantic search' }]}
            onChange={(value) => { setMode(value); setResult(undefined); setConsent(false); }} />
          <Field label={mode === 'search' ? 'Search your selected context' : 'Your question or goal'}>
            <textarea className={fieldClass} rows={3} maxLength={1000} required disabled={disabled}
              placeholder={mode === 'search' ? 'Which services help me with client handoffs?' : 'What should I review before my next renewals?'}
              value={query} onChange={(e) => { setQuery(e.target.value); setConsent(false); setResult(undefined); }} />
          </Field>
          <div className="space-y-lg border-t border-secondary pt-xl">
            <div className="flex flex-wrap items-center justify-between gap-lg">
              <h2 className="text-sm font-semibold">Context to share · {activeIds.size} / 100 selected</h2>
              <Button disabled={disabled || !selected.size} onClick={() => { setSelected(new Set()); setConsent(false); }}>Clear selection</Button>
            </div>
            <p className="text-xs text-tertiary">
              Select specific records. Names, prices, dates, usage, importance, notes and reasons in selected
              records are sent to OpenRouter and its model provider; AI advice also includes your {money(workspace.budgetCents)} planning budget.
              Wallet addresses, API keys, payment evidence and Walrus receipts are not context.
              Recall remote memories in Connections first if you want to select them here.
            </p>
            {records.length ? <div className="max-h-80 overflow-y-auto divide-y divide-secondary">
              {records.map((record) => <label key={record.id} className="flex cursor-pointer items-start gap-lg py-lg">
                <input type="checkbox" className="mt-xxs size-4 shrink-0 rounded-xs border border-primary bg-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                  checked={activeIds.has(record.id)} disabled={disabled || (!activeIds.has(record.id) && activeIds.size >= 100)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelected((old) => { const next = new Set(old); checked ? next.add(record.id) : next.delete(record.id); return next; });
                    setConsent(false); setResult(undefined);
                  }} />
                <span className="min-w-0 space-y-xs">
                  <span className="block break-words text-sm font-medium text-secondary">{record.label} · {record.detail}</span>
                  <span className="block break-words text-xs text-tertiary">{record.content || 'No notes.'}</span>
                </span>
              </label>)}
            </div> : <p className="text-sm text-tertiary">No context yet. Add a subscription or record a decision to get started.</p>}
          </div>
          <label className="flex items-start gap-lg text-sm text-secondary">
            <input type="checkbox" className="mt-xxs size-4 shrink-0 rounded-xs border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              checked={consent} disabled={disabled || !ready || !activeIds.size} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to send this question and selected context to OpenRouter and its model provider for this free-model request.</span>
          </label>
          <p className="text-xs text-tertiary">
            Answers use {connections?.chatModel ?? 'the vault’s selected free chat model'}; search uses free Nemotron 3.5 Embed 1B.
            Routing excludes providers that collect data, but provider privacy policies still apply. Free quotas apply; no paid fallbacks, tools or automatic retries.
            Search caches embeddings only in the temporary session; locking clears them. Results are not saved.
          </p>
          <Button type="submit" variant="primary" disabled={disabled || !ready || !consent || !query.trim() || !activeIds.size}>
            {mode === 'search' ? <Search size={16} className="shrink-0" aria-hidden="true" /> : <Sparkles size={16} className="shrink-0" aria-hidden="true" />}
            {busy ? 'Working…' : mode === 'search' ? 'Search context' : 'Ask assistant'}
          </Button>
        </form>
      </section>
      {error && <Notice error>{error}</Notice>}
      <section className="space-y-xl rounded-xl border border-secondary bg-primary p-2xl" aria-live="polite" aria-busy={busy}>
        <SectionHeading title={mode === 'search' ? 'Semantic matches' : 'AI response'} description="SUGGESTIONS, NOT VERIFIED EVIDENCE" />
        {busy ? <p className="text-sm text-tertiary">Processing your explicit request. Nothing in your workspace will change.</p>
          : !result ? <p className="text-sm text-tertiary">Your result will appear here. Budget rules remain available without AI.</p>
          : <>
            {result.answer && <p className="whitespace-pre-wrap break-words text-sm text-secondary">{result.answer}</p>}
            {result.totals && <p className="text-xs text-tertiary">Selected subscriptions: {money(result.totals.monthly)} / month · {money(result.totals.headroom)} budget headroom. Not a full-workspace total unless all services are selected.</p>}
            {result.matches?.map((match) => <article key={match.id} className="space-y-sm border-t border-secondary pt-xl">
              <h3 className="break-words text-sm font-semibold">{match.label}</h3>
              <p className="text-xs text-tertiary">{match.kind} · similarity {match.score.toFixed(3)} (not confidence or proof)</p>
              <p className="break-words text-sm text-secondary">{match.excerpt || 'No notes.'}</p>
            </article>)}
            {Boolean(result.sources?.length) && <div className="border-t border-secondary pt-xl">
              <h3 className="text-sm font-medium">Context references</h3>
              <ul className="mt-sm space-y-xs text-xs text-tertiary">{result.sources!.map((source) => <li className="break-words" key={source.id}>{source.label} · {source.kind}</li>)}</ul>
            </div>}
            <p className="text-xs text-tertiary">{result.model} · {result.contextCount} selected records · {result.usage?.total_tokens ?? ((result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0))} reported tokens. Free-model quota applies. Advice may be wrong; review it yourself.</p>
            <Button onClick={() => setResult(undefined)}>Clear result</Button>
          </>}
      </section>
    </div>
  );
}
