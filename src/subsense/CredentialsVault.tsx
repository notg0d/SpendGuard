import { useEffect, useRef, useState } from 'react';
import { Download, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from './api';
import {
  decryptVault,
  encryptVault,
  forgetVault,
  readVault,
  validateVaultCredentials,
  writeVault,
} from './vault';
import type { UserCredentials } from './vault';
import { CHAT_MODELS, CHAT_MODEL_LABELS, DEFAULT_CHAT_MODEL } from '../../shared/ai.mjs';
import { Choices } from './forms';
import { downloadBackup } from './workspace';
import { useWalletAccess } from './WalletAccess';
import {
  Badge,
  Button,
  Field,
  Modal,
  Notice,
  SectionHeading,
  fieldClass,
} from './ui';

export default function CredentialsVault({
  onChanged,
  onBusy,
  feature = 'ai',
}: {
  onChanged: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  feature?: 'ai' | 'memory';
}) {
  const { session, refresh, lock } = useWalletAccess();
  const wallet = session.walletAddress!;
  const [saved, setSaved] = useState(() => {
    try {
      return readVault(wallet);
    } catch {
      return null;
    }
  });
  const [credentials, setCredentials] = useState<UserCredentials>({
    network: 'mainnet',
    tatumKey: '',
    memwalKey: '',
    accountId: '',
    openrouterKey: '',
    chatModel: DEFAULT_CHAT_MODEL,
  });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [editing, setEditing] = useState(false);
  const [restored, setRestored] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController>();
  useEffect(() => () => operation.current?.abort(), []);
  const hasConnection = Boolean(session.vaultUnlocked ?? session.credentialsConfigured);
  const blockchain = Boolean(credentials.tatumKey || credentials.memwalKey || credentials.accountId);
  const creating = !restored && (!saved || editing);
  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    onBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      operation.current = undefined;
      if (!controller.signal.aborted) {
        setBusy(false);
        onBusy(false);
        setPassword('');
        setConfirmation('');
        setCredentials({
          network: 'mainnet',
          tatumKey: '',
          memwalKey: '',
          accountId: '',
        });
      }
    }
  }
  async function connect() {
    if (creating && password !== confirmation)
      throw new Error('Vault passwords do not match.');
    const value = creating
      ? validateVaultCredentials(credentials)
      : await decryptVault(wallet, password, restored ?? saved!);
    // Save ciphertext only. No plaintext key, vault password or wallet signature is persisted.
    const encrypted = creating
      ? await encryptVault(wallet, password, value)
      : (restored ?? saved!);
    const signal = operation.current!.signal;
    signal.throwIfAborted();
    const result = await api<{ note: string }>('/connections/configure', value, { wallet, signal });
    signal.throwIfAborted();
    if (creating || restored) {
      try {
        writeVault(wallet, encrypted);
      } catch {
        await lock();
        throw new Error(
          'Connection verified, but the encrypted vault could not be saved. Backend keys were removed.',
        );
      }
      setSaved(encrypted);
      setRestored(undefined);
      setEditing(false);
    }
    await refresh();
    await onChanged();
    setMessage(result.note);
  }
  return (
    <section className="ss-panel space-y-xl p-3xl">
      <SectionHeading
        title="Your connection keys"
        description="Password-protected on this device"
        action={
          <Badge tone={hasConnection ? 'success' : 'gray'}>
            {hasConnection
               ? 'Connected'
              : saved
                 ? 'Saved · locked'
                 : 'Not connected yet'}
          </Badge>
        }
      />
      <p className="text-sm text-tertiary">
        Connection keys let SubSense use these optional services. A separate password protects them in this browser. Never enter your wallet recovery phrase or owner private key.
      </p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {hasConnection && !editing && !restored ? (
        <div className="space-y-lg">
          <div className="flex items-start gap-lg border-t border-secondary pt-xl">
            <ShieldCheck
              size={20}
              className="shrink-0 text-fg-success-primary"
              aria-hidden="true"
            />
            <p className="text-sm text-secondary">
               {session.credentialsConfigured ? 'Online memory is connected. ' : ''}
               {session.aiConfigured ? 'Your AI assistant is ready. ' : ''}
               You still choose when to share information. These connections expire after 30 minutes.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await lock();
                await onChanged();
                setMessage(
                  'Backend credentials removed. Your encrypted browser vault is still saved.',
                );
              })
            }
          >
            <LockKeyhole size={16} aria-hidden="true" />
             Lock connections
          </Button>
        </div>
      ) : (
        <form
          className="space-y-xl"
          onSubmit={(event) => {
            event.preventDefault();
            run(connect);
          }}
        >
          {creating && (
            <div className="space-y-xl">
              <Field label="OpenRouter API key (optional)" hint="For AI help. Skip this if you only want online memory.">
                <input className={fieldClass} type="password" autoComplete="off"
                  maxLength={512} value={credentials.openrouterKey ?? ''} disabled={busy}
                  placeholder="Paste your OpenRouter key"
                  onChange={(e) => setCredentials((v) => ({ ...v, openrouterKey: e.target.value }))} />
              </Field>
              <p className="text-xs text-tertiary">Get a key from <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-brand-primary underline focus-visible:ring-2 focus-visible:ring-focus-ring">OpenRouter</a>. We only use free models; free usage limits and availability still apply. Leave the online memory fields empty for AI-only setup.</p>
              <details className="ss-disclosure"><summary>Choose a different AI model <span className="text-xs text-tertiary">(optional)</span></summary><div className="ss-disclosure-body">
                <Choices label="Assistant model" disabled={busy} value={credentials.chatModel ?? DEFAULT_CHAT_MODEL}
                  options={CHAT_MODELS.map((model) => ({ value: model, label: CHAT_MODEL_LABELS[model] }))}
                  onChange={(chatModel) => setCredentials((v) => ({ ...v, chatModel }))} />
                <p className="text-xs text-tertiary">Search uses free Nemotron 3.5 Embed 1B. Setup checks your key and available free models without sending an AI question.</p>
              </div></details>
              <details className="ss-disclosure" open={feature === 'memory' ? true : undefined}><summary>Online memory connection <span className="text-xs text-tertiary">(advanced)</span></summary><div className="ss-disclosure-body grid gap-xl md:grid-cols-2">
              <p className="text-xs text-tertiary md:col-span-2">You need an existing Walrus Memory Mainnet account and registered delegate owned by your connected wallet. Fill in all three fields below. These are service credentials, not your wallet’s private key.</p>
              <Field label="Tatum Mainnet API key">
                <input
                  className={fieldClass}
                  type="password"
                  required={blockchain}
                  autoComplete="off"
                  maxLength={512}
                  value={credentials.tatumKey}
                  onChange={(e) =>
                    setCredentials((v) => ({ ...v, tatumKey: e.target.value }))
                  }
                />
              </Field>
              <Field label="MemWal delegate private key">
                <input
                  className={fieldClass}
                  type="password"
                  required={blockchain}
                  autoComplete="off"
                  maxLength={160}
                  value={credentials.memwalKey}
                  onChange={(e) =>
                    setCredentials((v) => ({ ...v, memwalKey: e.target.value }))
                  }
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="MemWal Mainnet account object ID">
                  <input
                    className={fieldClass}
                    required={blockchain}
                    autoComplete="off"
                    placeholder="0x… (account object ID, not your wallet address)"
                    maxLength={66}
                    value={credentials.accountId}
                    onChange={(e) =>
                      setCredentials((v) => ({
                        ...v,
                        accountId: e.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              </div></details>
            </div>
          )}
          <div className="grid gap-xl md:grid-cols-2">
            <Field
              label={
                 creating ? 'Create a connection password' : 'Your connection password'
              }
            >
              <input
                className={fieldClass}
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete={creating ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {creating && (
               <Field label="Confirm password">
                <input
                  className={fieldClass}
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
            )}
          </div>
          <p className="text-xs text-tertiary">
            Choose a unique password with at least 12 characters and keep it safe — we can’t recover it. Your password stays in this browser. Connecting securely sends the service keys to the app’s server, not the password (local development may use HTTP).
          </p>
          <div className="flex flex-wrap gap-lg">
            <Button type="submit" variant="primary" disabled={busy}>
              <LockKeyhole size={16} aria-hidden="true" />
              {busy
                 ? 'Securing & checking…'
                : creating
                   ? 'Save & connect'
                   : 'Unlock connections'}
            </Button>
            {(editing || restored) && (
              <Button
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setRestored(undefined);
                  setPassword('');
                  setConfirmation('');
                  setCredentials({
                    network: 'mainnet',
                    tatumKey: '',
                    memwalKey: '',
                    accountId: '',
                  });
                }}
              >
                Cancel replacement
              </Button>
            )}
          </div>
        </form>
      )}
      <details className="ss-disclosure"><summary>Backups & connection security</summary><div className="ss-disclosure-body">
        <div className="flex flex-wrap gap-lg">
          {saved && (
            <>
              <Button
                disabled={busy}
                onClick={() => {
                  setRestored(undefined);
                  setEditing(true);
                  setPassword('');
                  setConfirmation('');
                  setError('');
                  setMessage(
                    'The saved vault is replaced only after the new connection is verified.',
                  );
                }}
              >
                 Change connection keys
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  try {
                    downloadBackup(saved, 'subsense-encrypted-vault.json');
                  } catch {
                    setError('Could not export the encrypted vault.');
                  }
                }}
              >
                <Download size={16} aria-hidden="true" />
                Export encrypted vault
              </Button>
              <Button disabled={busy} onClick={() => setDeleting(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Forget saved vault
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => file.current?.click()}>
            Restore encrypted vault
          </Button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Choose encrypted vault backup"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (!selected) return;
            try {
              if (selected.size > 8192)
                throw new Error('Vault backup must be smaller than 8 KB.');
              const text = await selected.text();
              // Keep a restored vault in memory until password/wallet authentication succeeds.
              setRestored(text);
              setEditing(false);
              setPassword('');
              setConfirmation('');
              setCredentials({
                network: 'mainnet',
                tatumKey: '',
                memwalKey: '',
                accountId: '',
              });
              setError('');
              setMessage(
                'Backup loaded for unlock. Enter its password; the saved browser vault is not replaced until verification succeeds.',
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        <p className="text-xs text-tertiary">
          AES-256-GCM encryption with PBKDF2-SHA-256. No server-side persistence
          or cross-device sync. Workspace backups do not contain keys.
          Encryption protects saved keys at rest, not an unlocked browser from
          malicious scripts or extensions.
        </p>
        <p className="text-xs text-tertiary">
          Account creation and delegate registration must already be completed
          on Mainnet by the connected owner wallet. Those on-chain actions can
          require SUI gas; this app will not perform them automatically.
        </p>
      </div></details>
      {deleting && (
        <Modal
          title="Forget this saved credential vault?"
          subtitle="Export the encrypted vault first if you need it later."
          onClose={() => setDeleting(false)}
        >
          <div className="space-y-xl">
            <p className="text-sm text-tertiary">
              This removes the encrypted keys from this browser and clears the
              backend connection. It does not revoke the delegate on-chain or
              delete Walrus memories.
            </p>
            <div className="flex justify-end gap-lg">
              <Button disabled={busy} onClick={() => setDeleting(false)}>
                Keep vault
              </Button>
              <Button
                disabled={busy}
                variant="primary"
                onClick={() =>
                  run(async () => {
                    await lock();
                    forgetVault(wallet);
                    setSaved(null);
                    setRestored(undefined);
                    setEditing(false);
                    setDeleting(false);
                    await onChanged();
                    setMessage(
                      'Encrypted vault forgotten. Remote memories and delegate registration are unchanged.',
                    );
                  })
                }
              >
                Forget vault
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
