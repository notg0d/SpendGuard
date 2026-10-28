import { randomBytes, randomUUID } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { normalizeSuiAddress } from '../shared/subsense.mjs';

export const SESSION_COOKIE = 'subsense_wallet_session';
const CHALLENGE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 30 * 60 * 1000;

export function publicOrigin(
  value = process.env.SUBSENSE_PUBLIC_ORIGIN ?? 'http://localhost:3000',
) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (!local && url.protocol !== 'https:') ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.origin !== value
  )
    throw new Error(
      'SUBSENSE_PUBLIC_ORIGIN must be an exact HTTPS origin (HTTP is allowed only on localhost).',
    );
  return url.origin;
}

export function createSessionStore({
  now = Date.now,
  maxSessions = 500,
  maxChallenges = 1000,
} = {}) {
  const challenges = new Map();
  const sessions = new Map();
  const rates = new Map();
  function lock(session) {
    session.revision++;
    const client = session.client;
    session.client = undefined;
    session.credentials = undefined;
    session.aiController?.abort();
    session.aiCache?.clear();
    try {
      client?.destroy();
    } catch {
      /* Revocation must succeed even if SDK cleanup fails. */
    }
  }
  function revoke(id) {
    const session = sessions.get(id);
    if (session) lock(session);
    sessions.delete(id);
  }
  function sweep() {
    for (const [id, item] of challenges)
      if (item.expires <= now()) challenges.delete(id);
    for (const [id, item] of sessions) if (item.expires <= now()) revoke(id);
    for (const [id, item] of rates) if (item.expires <= now()) rates.delete(id);
  }
  const timer = setInterval(sweep, 30000);
  timer.unref();
  return {
    rateLimit(ip) {
      sweep();
      const current = rates.get(ip) ?? { count: 0, expires: now() + 60000 };
      if (rates.size >= 2000 && !rates.has(ip)) return false;
      current.count++;
      rates.set(ip, current);
      return current.count <= 20;
    },
    challenge(address, origin) {
      sweep();
      if (challenges.size >= maxChallenges)
        throw new Error('Sign-in capacity reached. Retry later.');
      const wallet = normalizeSuiAddress(address);
      const id = randomUUID();
      const expires = now() + CHALLENGE_TTL;
      const message = [
        'SubSense wallet sign-in',
        `URI: ${origin}`,
        'Network: sui:mainnet',
        `Wallet: ${wallet}`,
        `Nonce: ${randomBytes(32).toString('hex')}`,
        `Issued at: ${new Date(now()).toISOString()}`,
        `Expires at: ${new Date(expires).toISOString()}`,
        'This signs you in for 30 minutes. It does not authorize a transaction or transfer.',
      ].join('\n');
      challenges.set(id, { wallet, origin, message, expires });
      return {
        challengeId: id,
        message,
        expiresAt: new Date(expires).toISOString(),
        network: 'mainnet',
      };
    },
    async login(id, signature, origin) {
      sweep();
      const challenge = challenges.get(id);
      challenges.delete(id); // One attempt only, including concurrent/failed verification.
      if (
        !challenge ||
        challenge.origin !== origin ||
        challenge.expires <= now()
      )
        throw new Error(
          'Sign-in challenge expired or invalid. Request a new one.',
        );
      if (typeof signature !== 'string' || signature.length > 8192)
        throw new Error('Invalid wallet signature.');
      try {
        await verifyPersonalMessageSignature(
          new TextEncoder().encode(challenge.message),
          signature,
          { address: challenge.wallet },
        );
      } catch {
        throw new Error(
          'Wallet signature could not be verified. Use a supported Sui wallet and try again.',
        );
      }
      // Verification may await external checks for some wallet signature schemes.
      sweep();
      if (challenge.expires <= now())
        throw new Error('Sign-in challenge expired. Try again.');
      if (sessions.size >= maxSessions)
        throw new Error('Session capacity reached. Retry later.');
      const token = randomBytes(32).toString('base64url');
      const session = {
        token,
        wallet: challenge.wallet,
        expires: now() + SESSION_TTL,
        revision: 0,
      };
      sessions.set(token, session);
      return session;
    },
    get(token) {
      sweep();
      return sessions.get(token);
    },
    lock,
    revoke,
    valid(session) {
      return sessions.get(session.token) === session && session.expires > now();
    },
    close() {
      clearInterval(timer);
      for (const token of sessions.keys()) revoke(token);
    },
  };
}

export function cookieToken(req) {
  const values = (req.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim());
  const matches = values.filter((value) =>
    value.startsWith(`${SESSION_COOKIE}=`),
  );
  if (matches.length !== 1) return undefined;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[a-zA-Z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function sessionInfo(session) {
  return {
    authenticated: Boolean(session),
    network: 'mainnet',
    ...(session
      ? {
          walletAddress: session.wallet,
          expiresAt: new Date(session.expires).toISOString(),
          credentialsConfigured: Boolean(session.credentials && session.client),
          vaultUnlocked: Boolean(session.credentials),
          aiConfigured: Boolean(session.credentials?.openrouterKey),
        }
      : {}),
  };
}
