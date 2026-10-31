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
  CalendarDays,
  Check,
  Sparkles,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { normalizeSuiAddress } from '../../shared/subsense.mjs';
import { api, setApiWallet } from './api';
import type { WalletSession } from './api';
import { Brand, Button, Modal, Notice } from './ui';

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
    <div className="min-h-screen bg-secondary p-lg text-primary md:p-3xl">
      <main className="mx-auto grid min-h-screen max-w-7xl gap-2xl lg:min-h-0 lg:grid-cols-2">
        <section className="ss-login-art hidden lg:flex">
          <div className="ss-orbit" aria-hidden="true" />
          <div className="relative z-10"><Brand inverse /></div>
          <div className="relative z-10 pb-5xl pt-7xl md:py-8xl">
            <p className="mb-xl text-sm ss-sidebar-muted">Less guesswork. More peace of mind.</p>
            <h1 className="max-w-lg text-heading-md font-medium tracking-tight md:text-heading-lg">A little clarity.<br />Every month.</h1>
            <p className="mt-xl max-w-sm text-sm ss-sidebar-muted">Know what you’re paying for, see what’s renewing, and make room for what matters.</p>
            <div className="mt-5xl space-y-xl">
              {[
                { icon: CalendarDays, title: 'No more surprise renewals', detail: 'Your next dates, in one simple view.' },
                { icon: Sparkles, title: 'Keep what’s worth it', detail: 'Suggestions that learn from your choices.' },
                { icon: Check, title: 'Always your decision', detail: 'We never pay or cancel on your behalf.' },
              ].map((item) => <div key={item.title} className="flex items-start gap-lg"><span className="ss-login-step"><item.icon size={16} aria-hidden="true" /></span><div><p className="text-sm font-medium">{item.title}</p><p className="mt-xs text-xs ss-sidebar-muted">{item.detail}</p></div></div>)}
            </div>
          </div>
          <p className="relative z-10 mt-auto text-xs ss-sidebar-muted">Your subscriptions. Your priorities. Your space.</p>
        </section>
        <section className="flex flex-col justify-center rounded-4xl border border-secondary bg-primary px-2xl py-5xl md:px-7xl">
          <div className="mx-auto w-full max-w-sm space-y-2xl">
          <div className="pb-xl lg:hidden"><Brand /></div>
          <span className="ss-stat-icon"><Wallet size={24} aria-hidden="true" /></span>
          <div>
            <h2 className="text-heading-xs font-medium">
              Welcome to your workspace
            </h2>
            <p className="mt-md text-sm text-tertiary">
              Use your Sui wallet to sign in. Then add your first subscription — no other setup needed.
            </p>
          </div>
          <ol className="flex items-center gap-lg text-xs" aria-label="Sign-in progress">
            <li className={`flex items-center gap-md ${address ? 'text-brand-primary' : 'text-secondary'}`}><span className="flex size-6 items-center justify-center rounded-full bg-utility-brand-50 text-brand-primary">{address ? <Check size={13} aria-hidden="true" /> : '1'}</span>Connect wallet</li>
            <li className="h-px flex-1 bg-tertiary" aria-hidden="true" />
            <li className={`flex items-center gap-md ${address ? 'text-secondary' : 'text-tertiary'}`}><span className="flex size-6 items-center justify-center rounded-full bg-secondary">2</span>Confirm sign-in</li>
          </ol>
          {error && <Notice error>{error}</Notice>}
          {address && (
            <p className="break-all text-sm text-secondary">
              Wallet connected: {shortWallet(address)}
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
                ? 'Confirm in your wallet…'
                : isConnecting
                  ? 'Connecting…'
                  : address
                    ? 'Confirm sign-in'
                    : 'Connect wallet'}
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
          <div className="space-y-lg border-t border-secondary pt-xl text-xs text-tertiary">
            <p className="flex items-start gap-md">
              <ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
              Sign-in is free. It doesn’t give us permission to spend your money.
            </p>
            <p className="flex items-start gap-md">
              <LockKeyhole size={16} className="shrink-0" aria-hidden="true" />
              We’ll never ask for your recovery phrase or wallet private key.
            </p>
            <p>Your subscription list stays in this browser. Download a backup in Settings to keep a copy.</p>
          </div>
          <details className="ss-disclosure"><summary>New to wallet sign-in?</summary><div className="ss-disclosure-body text-xs text-tertiary"><p>A wallet is your sign-in method, not a bank connection. You need a Sui Mainnet-compatible wallet, such as Slush.</p><p>First connect it, then approve a one-time sign-in message. No payment or transaction is made.</p></div></details>
          </div>
        </section>
      </main>
      {chooser && (
        <Modal
          title="Choose your wallet"
          subtitle="Next, you’ll confirm a free sign-in message in your wallet."
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
