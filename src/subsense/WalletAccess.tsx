import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SuiClientProvider,
  WalletProvider,
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from '@mysten/dapp-kit';
import {
  ArrowRight,
  Brain,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { normalizeSuiAddress } from '../../shared/subsense.mjs';
import { api, setApiWallet } from './api';
import type { WalletSession } from './api';
import { Badge, Button, Modal, Notice } from './ui';

type Access = {
  session: WalletSession;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  lock: () => Promise<void>;
};
const AccessContext = createContext<Access | undefined>(undefined);
const queryClient = new QueryClient();
// dapp-kit requires this context even when its unsafe burner wallet is disabled.
// Login uses the wallet's personal-message feature, never client-side chain RPC.
const walletNetworks = {
  mainnet: {
    network: 'mainnet' as const,
    transport: {
      async request<T>(): Promise<T> {
        throw new Error(
          'Browser RPC is disabled. Use authenticated /api/subsense routes.',
        );
      },
    },
  },
};
export const shortWallet = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export function useWalletAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error('Wallet login is required.');
  return value;
}
export default function WalletAccess({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={walletNetworks} network="mainnet">
        <WalletProvider
          autoConnect
          walletFilter={(wallet) =>
            Boolean(wallet.features['sui:signPersonalMessage'])
          }
          storageKey="subsense_connected_wallet"
          theme={null}
        >
          <WalletGate>{children}</WalletGate>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
function WalletGate({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const { currentWallet, isConnecting } = useCurrentWallet();
  const wallets = useWallets();
  const { mutateAsync: connect } = useConnectWallet();
  const { mutateAsync: disconnect } = useDisconnectWallet();
  const [session, setSession] = useState<WalletSession>({
    authenticated: false,
    network: 'mainnet',
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [error, setError] = useState('');
  const address = account ? normalizeSuiAddress(account.address) : '';
  const walletRef = useRef(address);
  const previousWallet = useRef(address);
  const generation = useRef(0);
  const authQueue = useRef(Promise.resolve());
  if (walletRef.current !== address) generation.current++;
  walletRef.current = address;
  setApiWallet(address);
  const active =
    session.authenticated &&
    session.walletAddress === address &&
    Boolean(address);
  const refresh = useCallback(async () => {
    const expected = walletRef.current;
    const version = generation.current;
    const result = await api<WalletSession>('/auth/session', undefined, {
      wallet: expected,
    });
    if (expected === walletRef.current && version === generation.current)
      setSession(result);
  }, []);
  const enqueueAuth = useCallback((task: () => Promise<void>) => {
    const result = authQueue.current.then(task, task);
    authQueue.current = result.catch(() => {});
    return result;
  }, []);
  const logout = useCallback(async () => {
    setSession({ authenticated: false, network: 'mainnet' });
    try {
      await enqueueAuth(async () => {
        await api('/auth/logout', { network: 'mainnet' });
      });
    } finally {
      await disconnect();
      setApiWallet('');
      queryClient.clear();
    }
  }, [disconnect, enqueueAuth]);
  const lock = useCallback(async () => {
    await api(
      '/connections/lock',
      { network: 'mainnet' },
      { wallet: walletRef.current },
    );
    await refresh();
  }, [refresh]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const changed =
      Boolean(previousWallet.current) && previousWallet.current !== address;
    previousWallet.current = address;
    const check = async () => {
      if (changed) {
        setSession({ authenticated: false, network: 'mainnet' });
        await api('/auth/logout', { network: 'mainnet' });
      }
      await refresh();
    };
    enqueueAuth(check)
      .catch(() => {
        if (live)
          setError(
            'Could not check the wallet session. Refresh and try again.',
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [address, refresh, enqueueAuth]);
  useEffect(() => {
    const expire = () =>
      setSession({ authenticated: false, network: 'mainnet' });
    window.addEventListener('subsense-session-expired', expire);
    const remaining = session.expiresAt
      ? Date.parse(session.expiresAt) - Date.now()
      : 0;
    const timer = active
      ? window.setTimeout(expire, Math.max(remaining, 0))
      : undefined;
    return () => {
      window.removeEventListener('subsense-session-expired', expire);
      clearTimeout(timer);
    };
  }, [active, session.expiresAt]);
  async function signIn() {
    setBusy(true);
    setError('');
    const expected = address;
    const version = generation.current;
    try {
      if (!account || !currentWallet || !account.chains.includes('sui:mainnet'))
        throw new Error('Use a Sui wallet account that supports Mainnet.');
      const feature = currentWallet.features['sui:signPersonalMessage'];
      if (!feature)
        throw new Error(
          'This wallet does not support personal-message login. Update your Sui wallet.',
        );
      const challenge = await api<{ challengeId: string; message: string }>(
        '/auth/challenge',
        { address: expected, network: 'mainnet' },
        { wallet: expected },
      );
      if (walletRef.current !== expected || generation.current !== version)
        throw new Error(
          'Wallet changed. Sign in again with the current account.',
        );
      const signed = await feature.signPersonalMessage({
        account,
        chain: 'sui:mainnet',
        message: new TextEncoder().encode(challenge.message),
      });
      await enqueueAuth(async () => {
        if (walletRef.current !== expected || generation.current !== version)
          throw new Error(
            'Wallet changed. Sign in again with the current account.',
          );
        const result = await api<WalletSession>(
          '/auth/login',
          {
            challengeId: challenge.challengeId,
            signature: signed.signature,
            network: 'mainnet',
          },
          { wallet: expected },
        );
        if (walletRef.current !== expected || generation.current !== version)
          throw new Error('Wallet changed during sign-in. Please retry.');
        if (result.walletAddress !== expected)
          throw new Error('Signed wallet did not match the login session.');
        setSession(result);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (active)
    return (
      <AccessContext.Provider value={{ session, refresh, logout, lock }}>
        <div key={address}>{children}</div>
      </AccessContext.Provider>
    );
  return (
    <div className="min-h-screen bg-primary text-primary">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-lg border-b border-secondary px-xl py-xl md:px-4xl">
        <div className="flex items-center gap-md">
          <Brain
            size={24}
            className="shrink-0 text-fg-brand-primary"
            aria-hidden="true"
          />
          <span className="text-xl font-semibold">SubSense</span>
        </div>
        <Badge tone="brand">Sui Mainnet</Badge>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-5xl px-xl py-7xl md:px-4xl lg:grid-cols-2">
        <div className="space-y-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">
            Your wallet. Your context.
          </p>
          <h1 className="text-heading-md font-semibold tracking-tight md:text-heading-lg">
            Renew with a reason.
            <br />
            Remember it with SubSense.
          </h1>
          <p className="max-w-xl text-lg text-tertiary">
            Track subscriptions, make clearer renewal decisions, and keep your
            context in Walrus Memory.
          </p>
          <ol className="space-y-xl border-t border-secondary pt-2xl text-sm text-secondary">
            {[
              [
                'Connect your Sui wallet',
                'Sign a one-time login message. No transaction or gas.',
              ],
              [
                'Unlock your private vault',
                'Your API credentials are encrypted with a separate password.',
              ],
              [
                'Choose your optional integrations',
                'OpenAI for assistance; verified MemWal Mainnet for memory uploads.',
              ],
            ].map(([title, detail], index) => (
              <li key={title} className="flex gap-lg">
                <span className="font-semibold text-tertiary">
                  0{index + 1}
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-xs text-tertiary">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <section className="space-y-xl rounded-xl border border-secondary bg-secondary p-2xl md:p-3xl">
          <Wallet
            size={28}
            className="shrink-0 text-fg-secondary"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-heading-xs font-semibold">
              Welcome to your workspace
            </h2>
            <p className="mt-md text-sm text-tertiary">
              Connect first, then sign in. We never ask for your wallet seed
              phrase or owner private key.
            </p>
          </div>
          {error && <Notice error>{error}</Notice>}
          {address && (
            <p className="break-all text-sm text-secondary">
              Connected: {shortWallet(address)}{' '}
              <span className="text-tertiary">· not yet signed in</span>
            </p>
          )}
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={busy || loading || isConnecting}
            onClick={() => (address ? signIn() : setChooser(true))}
          >
            <Wallet size={18} aria-hidden="true" />
            {loading
              ? 'Checking session…'
              : busy
                ? 'Waiting for signature…'
                : isConnecting
                  ? 'Connecting…'
                  : address
                    ? 'Sign in with wallet'
                    : 'Connect Sui wallet'}
            <ArrowRight size={18} aria-hidden="true" />
          </Button>
          {address && (
            <Button
              className="w-full justify-center"
              disabled={busy || loading}
              onClick={() =>
                logout().catch(() =>
                  setError(
                    'Could not clear the backend session. It expires after 30 minutes; refresh and retry.',
                  ),
                )
              }
            >
              <LogOut size={16} aria-hidden="true" />
              Change wallet
            </Button>
          )}
          <div className="space-y-md border-t border-secondary pt-xl text-xs text-tertiary">
            <p className="flex items-start gap-md">
              <ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
              Login is a message signature, not permission to spend funds.
            </p>
            <p className="flex items-start gap-md">
              <LockKeyhole size={16} className="shrink-0" aria-hidden="true" />
              Mainnet account creation and delegate registration may need gas
              and are never performed automatically.
            </p>
          </div>
        </section>
      </main>
      {chooser && (
        <Modal
          title="Connect a Sui wallet"
          subtitle="Choose an installed wallet. Connection does not sign you in."
          onClose={() => setChooser(false)}
        >
          <div className="space-y-lg">
            {wallets.length ? (
              wallets.map((wallet) => (
                <Button
                  key={wallet.name}
                  className="w-full justify-between"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await connect({ wallet });
                      setChooser(false);
                    } catch {
                      setError(
                        'Wallet connection was declined or failed. Try again.',
                      );
                      setChooser(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <span>{wallet.name}</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              ))
            ) : (
              <Notice>
                No Sui wallet was detected. Install a Sui wallet extension, such
                as Slush, and refresh this page.
              </Notice>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
