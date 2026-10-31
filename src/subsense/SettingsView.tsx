import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  Settings,
  ShieldCheck,
  FolderSync,
  SlidersHorizontal,
} from 'lucide-react';
import { dollarsToCents } from '../../shared/subsense.mjs';
import {
  downloadBackup,
  freshWorkspace,
  rawBackup,
  validateWorkspace,
} from './workspace';
import type { Workspace } from './workspace';
import type { Commit } from './ConnectionsView';
import { Choices } from './forms';
import { Button, Field, Modal, Notice, fieldClass } from './ui';

export default function SettingsView({
  workspace,
  commit,
  replace,
  locked,
  busy,
  wallet,
}: {
  workspace: Workspace;
  commit: Commit;
  replace: (w: Workspace) => boolean;
  locked: boolean;
  busy: boolean;
  wallet: string;
}) {
  const [budget, setBudget] = useState(
    (workspace.budgetCents / 100).toFixed(2),
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [replacement, setReplacement] = useState<Workspace>();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="grid items-start gap-2xl xl:grid-cols-2">
      {error && (
        <div className="xl:col-span-2">
          <Notice error>{error}</Notice>
        </div>
      )}
      {message && (
        <div className="xl:col-span-2">
          <Notice>{message}</Notice>
        </div>
      )}
      <section className="ss-panel p-3xl space-y-xl xl:col-span-2">
        <h2 className="flex items-center gap-md text-md font-semibold">
          <SlidersHorizontal
            size={18}
            className="shrink-0 text-fg-secondary"
            aria-hidden="true"
          />
          Budget & appearance
        </h2>
        <form
          className="flex flex-col items-stretch gap-lg sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            try {
              const cents = dollarsToCents(budget);
              if (cents <= 0)
                throw new Error('Budget must be greater than zero.');
              if (commit((w) => ({ ...w, budgetCents: cents })))
                setMessage('Monthly USD budget updated.');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <div className="flex-1">
            <Field label="Monthly budget (USD)">
              <input
                className={fieldClass}
                inputMode="decimal"
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" disabled={locked || busy}>
            Save budget
          </Button>
        </form>
        <p className="text-xs text-tertiary">
           Set what you’d like to spend each month. Yearly subscriptions are divided by 12 to make them easier to compare. This isn’t your bank balance.
        </p>
        <Choices
          label="Appearance"
          disabled={locked || busy}
          value={workspace.theme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => commit((w) => ({ ...w, theme }))}
        />
      </section>
      <section className="ss-panel p-3xl space-y-xl">
        <h2 className="flex items-center gap-md text-md font-semibold">
          <FolderSync
            size={18}
            className="shrink-0 text-fg-secondary"
            aria-hidden="true"
          />
          Keep a copy of your data
        </h2>
        <p className="text-sm text-tertiary">
          Your subscriptions and decisions are saved only in this browser. Download a backup before clearing browser data or switching devices. It contains your financial notes, so keep it private.
        </p>
        <div className="flex flex-wrap gap-lg">
          <Button
            onClick={() => {
              try {
                downloadBackup(JSON.stringify(workspace, null, 2));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Download size={16} aria-hidden="true" />
            Download backup
          </Button>
          <Button disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            Restore backup
          </Button>
        </div>
        <details className="ss-disclosure"><summary>Data recovery & older backups</summary><div className="ss-disclosure-body"><div className="flex flex-wrap gap-lg">
          <Button
            onClick={() => {
              try {
                downloadBackup(rawBackup(wallet), 'subsense-raw-recovery.json');
                setMessage(
                  'Raw backup downloaded. You can now replace the damaged workspace after reviewing the file.',
                );
              } catch {
                setError('Browser storage could not be accessed.');
              }
            }}
          >
            Export raw recovery
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              try {
                setReplacement(
                  validateWorkspace(JSON.parse(rawBackup()), true),
                );
              } catch {
                setError(
                  'No readable legacy workspace was found. Its original storage was not changed.',
                );
              }
            }}
          >
            Import previous browser workspace
          </Button>
        </div></div></details>
        <input
          ref={file}
          className="hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Choose workspace backup"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (!selected) return;
            setError('');
            try {
              if (selected.size > 2000000)
                throw new Error('Backup must be smaller than 2 MB.');
              setReplacement(
                validateWorkspace(JSON.parse(await selected.text()), true),
              );
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
        <p className="text-xs text-tertiary">
           Restoring replaces your current list; it doesn’t merge the two. Online save receipts and payment checks must be refreshed after restoring.
        </p>
      </section>
      <section className="ss-panel p-3xl space-y-xl">
        <h2 className="flex items-center gap-md text-md font-semibold">
          <Settings
            size={18}
            className="shrink-0 text-fg-secondary"
            aria-hidden="true"
          />
          {workspace.sample ? 'Make it yours' : 'Start fresh'}
        </h2>
        <p className="text-sm text-tertiary">
          {workspace.sample
            ? 'You are exploring labelled sample services and decisions. Start empty to track your own subscriptions and use real integrations.'
            : 'Clear this list and start a new one. Download your current backup first — you’ll need it to return to this list and its online decisions.'}
        </p>
        <div className="flex flex-wrap gap-lg">
          <Button
            disabled={busy}
            variant="primary"
            onClick={() =>
              setReplacement({ ...freshWorkspace(), theme: workspace.theme })
            }
          >
            Start my own workspace
          </Button>
        </div>
        <details className="ss-disclosure"><summary>Account details</summary><div className="ss-disclosure-body text-xs text-tertiary"><p className="break-all">Sign-in wallet: {wallet}</p><p className="break-all">Workspace ID: {workspace.profileId}</p><p>Wallet sign-in uses Sui Mainnet. This doesn’t connect a bank account or authorise payments.</p></div></details>
      </section>
      <section className="ss-panel p-3xl xl:col-span-2">
        <h2 className="flex items-center gap-md text-md font-semibold">
          <ShieldCheck
            size={18}
            className="shrink-0 text-fg-secondary"
            aria-hidden="true"
          />
          Privacy & limitations
        </h2>
        <ul className="mt-xl grid gap-xl text-sm text-tertiary md:grid-cols-2">
          <li>
            You add prices, dates and usage yourself. We never connect to your bank, pay bills or cancel services. Suggestions can be wrong and aren’t financial advice.
          </li>
          <li>
            Uploading a decision sends its service, price, and rationale to the
            Walrus Memory relayer. The relayer processes plaintext for
            embeddings and encryption; stored blobs are encrypted. Use synthetic
            data in public demos.
          </li>
          <li>
            Your connection keys are password-protected. Your subscription list and notes are not encrypted — anyone with access to this browser may be able to read them. Signing in with a wallet doesn’t make browser storage private.
          </li>
          <li>
            AI requests explicitly send your question and selected subscriptions
            or decisions to OpenRouter and its model provider. Only free models are enabled. No automatic
            requests, external actions, or persistent AI chat history.
          </li>
          <li>
            We remember your reasons for six months. A price increase above 10% prompts a fresh look. Services you mark as essential won’t be suggested for cancellation just because you use them less.
          </li>
        </ul>
      </section>
      {replacement && (
        <Modal
          title="Replace this browser workspace?"
          subtitle="Export your current data first. This cannot be undone without a backup."
          onClose={() => setReplacement(undefined)}
        >
          <div className="space-y-xl">
            <p className="text-sm text-secondary">
              The replacement contains {replacement.subscriptions.length}{' '}
              subscriptions and {replacement.decisions.length}{' '}
              {replacement.sample ? 'sample' : 'local'} decisions. Remote
              memories are not deleted.
              {locked &&
                ' This will overwrite the unreadable saved workspace. Download raw recovery first.'}
            </p>
            <div className="flex justify-end gap-lg">
              <Button onClick={() => setReplacement(undefined)}>
                Keep current
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!replace(replacement)) return;
                  setReplacement(undefined);
                  setBudget((replacement.budgetCents / 100).toFixed(2));
                  setMessage('Workspace replaced.');
                }}
              >
                Replace workspace
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
