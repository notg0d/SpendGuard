import { Router } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createSessionStore,
  cookieToken,
  sessionInfo,
  SESSION_COOKIE,
  publicOrigin,
} from '../subsense-sessions.mjs';
import {
  validateUserCredentials,
  connectUserCredentials,
} from '../subsense-connect.mjs';
import { createSubSenseRouter } from './subsense.mjs';
import { networkConfig } from '../subsense-network.mjs';
import { queryTatum } from '../subsense-tatum.mjs';
import { verifyOpenRouter } from '../subsense-ai.mjs';
import { EMBEDDING_MODEL } from '../../shared/ai.mjs';
import { createAIRouter } from './ai.mjs';
import {
  submitMemory,
  memoryStatus,
  recallMemories,
} from '../subsense-memory.mjs';

export function createWalletRouter({
  store = createSessionStore(),
  origin,
  connect = connectUserCredentials,
  query = queryTatum,
  verifyAI = verifyOpenRouter,
  aiRequest,
} = {}) {
  const router = Router();
  const context = new AsyncLocalStorage();
  const getOrigin = () => publicOrigin(origin);
  const cookieOptions = () => ({
    httpOnly: true,
    secure: getOrigin().startsWith('https:'),
    sameSite: 'strict',
    path: '/api/subsense',
    maxAge: 30 * 60 * 1000,
  });
  const read = (req) => {
    const session = store.get(cookieToken(req));
    return session && req.get('x-subsense-wallet') === session.wallet
      ? session
      : undefined;
  };
  const handler = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch {
      res.status(401).json({
        message:
          'Wallet sign-in failed. Request a fresh challenge and sign with the connected wallet.',
      });
    }
  };
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use((req, res, next) => {
    if (
      req.method !== 'GET' &&
      (req.get('origin') !== getOrigin() ||
        (req.get('sec-fetch-site') &&
          !['same-origin', 'none'].includes(req.get('sec-fetch-site'))))
    )
      return res.status(403).json({
        message:
          'Request origin rejected. Open the configured SubSense origin.',
      });
    next();
  });
  router.get('/auth/session', (req, res) => res.json(sessionInfo(read(req))));
  router.get('/config', (req, res) => {
    const session = read(req);
    const config = networkConfig('mainnet');
    res.json({
      network: 'mainnet',
      networkLabel: 'Mainnet',
      authMode: 'wallet',
      tatumConfigured: Boolean(session?.credentials?.tatumKey && session?.client),
      walrusConfigured: Boolean(session?.client),
      aiConfigured: Boolean(session?.credentials?.openrouterKey),
      chatModel: session?.credentials?.chatModel,
      embeddingModel: EMBEDDING_MODEL,
      walletAuthenticated: Boolean(session),
      tatumEndpoint: config.tatumUrl,
      walrusEndpoint: config.walrusUrl,
      transport: 'GraphQL',
    });
  });
  router.post(
    '/auth/challenge',
    handler((req, res) => {
      if (!store.rateLimit(req.ip))
        return res
          .status(429)
          .json({ message: 'Too many sign-in attempts. Retry in a minute.' });
      if (req.body?.network !== 'mainnet')
        return res
          .status(409)
          .json({ message: 'SubSense wallet login is Mainnet only.' });
      res.json(store.challenge(req.body?.address, getOrigin()));
    }),
  );
  router.post(
    '/auth/login',
    handler(async (req, res) => {
      if (!store.rateLimit(req.ip))
        return res
          .status(429)
          .json({ message: 'Too many sign-in attempts. Retry in a minute.' });
      if (req.body?.network !== 'mainnet')
        return res
          .status(409)
          .json({ message: 'SubSense wallet login is Mainnet only.' });
      const session = await store.login(
        req.body?.challengeId,
        req.body?.signature,
        getOrigin(),
      );
      store.revoke(cookieToken(req));
      res.cookie(SESSION_COOKIE, session.token, cookieOptions());
      res.json(sessionInfo(session));
    }),
  );
  router.post('/auth/logout', (req, res) => {
    store.revoke(cookieToken(req));
    const { maxAge, ...clearOptions } = cookieOptions();
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.json({ authenticated: false, network: 'mainnet' });
  });
  router.use((req, res, next) => {
    const session = read(req);
    if (!session)
      return res.status(401).json({
        message:
          'Sign in with your Sui wallet. The session is missing, expired, or belongs to another wallet.',
      });
    if (req.body?.network !== 'mainnet')
      return res.status(409).json({
        message:
          'Only Mainnet operations are enabled. Refresh before retrying.',
      });
    req.walletSession = session;
    res.locals.walletSecrets = [
      session.credentials?.tatumKey,
      session.credentials?.memwalKey,
      session.credentials?.openrouterKey,
    ];
    context.run(session, next);
  });
  router.post('/connections/lock', (req, res) => {
    store.lock(req.walletSession);
    res.json(sessionInfo(req.walletSession));
  });
  router.post('/connections/configure', async (req, res) => {
    const session = req.walletSession;
    if (session.connecting || session.aiBusy)
      return res
        .status(409)
        .json({ message: 'A connection check is already in progress.' });
    let credentials;
    try {
      credentials = validateUserCredentials(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const revision = session.revision;
    session.connecting = true;
    let client;
    try {
      if (credentials.openrouterKey) await verifyAI(credentials);
      if (credentials.tatumKey) client = await connect(session.wallet, credentials);
      if (!store.valid(session) || revision !== session.revision) {
        client?.destroy();
        client = undefined;
        return res.status(401).json({
          message:
            'Session expired or locked during the connection check. Sign in and unlock again.',
        });
      }
      store.lock(session);
      session.credentials = credentials;
      session.client = client;
      res.json({
        ...sessionInfo(session),
        note: client
          ? 'Mainnet account ownership, delegate registration and signed metadata access verified. No memories uploaded.'
          : 'OpenRouter key and free model listings verified. No inference requests made.',
      });
    } catch (error) {
      client?.destroy();
      // Do not propagate upstream bodies. Scrub known submitted secrets as defense in depth.
      const message = [credentials.tatumKey, credentials.memwalKey, credentials.openrouterKey].filter(Boolean).reduce(
        (text, secret) => text.split(secret).join('[REDACTED]'),
        error.message ?? 'Connection check failed.',
      );
      res.status(502).json({ message });
    } finally {
      session.connecting = false;
    }
  });
  router.use(createAIRouter({ store, request: aiRequest }));
  const session = () => {
    const value = context.getStore();
    if (!value || !store.valid(value))
      throw new Error('Wallet session expired. Sign in again.');
    if (!value.credentials || !value.client)
      throw new Error(
        'Unlock your encrypted vault and verify the Mainnet connection first.',
      );
    return value;
  };
  router.use(
    createSubSenseRouter({
      queryTatum: (document, variables) =>
        query(
          document,
          variables,
          fetch,
          'mainnet',
          session().credentials.tatumKey,
        ),
      memoryHealth: () => session().client.health(),
      submitMemory: (profile, decision) =>
        submitMemory(profile, decision, session().client, 'mainnet'),
      memoryStatus: (profile, job) =>
        memoryStatus(profile, job, session().client, 'mainnet'),
      recallMemories: (profile, query) =>
        recallMemories(profile, query, session().client, 'mainnet'),
      verifyPayment: async (input) => {
        const { validatePaymentInput, checkPaymentEvidence, PAYMENT_QUERY } =
          await import('../subsense-tatum.mjs');
        const expected = validatePaymentInput(input);
        const result = await query(
          PAYMENT_QUERY,
          { digest: expected.digest },
          fetch,
          'mainnet',
          session().credentials.tatumKey,
        );
        return checkPaymentEvidence(result.transaction, expected, 'mainnet');
      },
    }),
  );
  return router;
}

export default createWalletRouter();
