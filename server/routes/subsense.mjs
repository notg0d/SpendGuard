import { Router } from 'express';
import {
  memoryClient,
  profileNamespace,
  submitMemory,
  memoryStatus,
  recallMemories,
} from '../subsense-memory.mjs';
import {
  queryTatum,
  validatePaymentInput,
  verifyPayment,
  readSuiBalance,
} from '../subsense-tatum.mjs';
import {
  text,
  validateDecision,
  normalizeSuiAddress,
} from '../../shared/subsense.mjs';
import { networkConfig, requireNetwork } from '../subsense-network.mjs';

export function requireWalletSession(req, res, next) {
  // Only the wallet router may establish this server-side request property.
  if (req.walletSession) return next();
  return res.status(401).json({
    message:
      'Sign in with your Sui wallet, then unlock your encrypted vault in Connections.',
  });
}

export function createSubSenseRouter(deps = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const run =
    (fn, validate = () => {}) =>
    async (req, res) => {
      try {
        validate(req);
      } catch (error) {
        return res
          .status(400)
          .json({ message: error.message || 'Invalid request.' });
      }
      try {
        await fn(req, res);
      } catch (error) {
        res.status(502).json({
          message: error.message || 'The integration request failed.',
        });
      }
    };
  router.get(
    '/config',
    run((req, res) => {
      const config = networkConfig();
      res.json({
        tatumConfigured: Boolean(req.walletSession?.credentials),
        walrusConfigured: Boolean(req.walletSession?.client),
        walletAuthenticated: Boolean(req.walletSession),
        authMode: 'wallet',
        network: config.network,
        networkLabel: config.label,
        tatumEndpoint: config.tatumUrl,
        walrusEndpoint: config.walrusUrl,
        transport: 'GraphQL',
      });
    }),
  );
  router.use(requireWalletSession);
  router.use((req, res, next) => {
    try {
      requireNetwork(req.body?.network);
      next();
    } catch (error) {
      res.status(409).json({ message: error.message });
    }
  });
  router.post(
    '/connections/test',
    run(async (_req, res) => {
      const results = await Promise.allSettled([
        Promise.resolve().then(() =>
          (deps.queryTatum ?? queryTatum)(
            'query SubSenseHealth { __typename }',
          ),
        ),
        Promise.resolve().then(() =>
          (
            deps.memoryHealth ?? (async () => (await memoryClient()).health())
          )(),
        ),
      ]);
      res.json({
        network: networkConfig().network,
        tatum:
          results[0].status === 'fulfilled'
            ? { status: 'reachable' }
            : { status: 'error', message: results[0].reason.message },
        walrus:
          results[1].status === 'fulfilled'
            ? {
                status: 'reachable',
                note: 'Relayer health does not prove delegate access or successful writes.',
              }
            : { status: 'error', message: results[1].reason.message },
      });
    }),
  );
  router.post(
    '/memories',
    run(
      async (req, res) => {
        const { profileId, decision } = req.body ?? {};
        const result = await (deps.submitMemory ?? submitMemory)(
          profileId,
          decision,
        );
        res.status(202).json(result);
      },
      (req) => {
        profileNamespace(req.body?.profileId);
        const decision = validateDecision(req.body?.decision);
        if (decision.demo)
          throw new Error('Sample decisions cannot be uploaded.');
        if (Date.parse(decision.at) > Date.now() + 300000)
          throw new Error('A decision cannot be dated in the future.');
      },
    ),
  );
  router.post(
    '/memories/status',
    run(
      async (req, res) => {
        res.json(
          await (deps.memoryStatus ?? memoryStatus)(
            req.body?.profileId,
            req.body?.jobId,
          ),
        );
      },
      (req) => {
        profileNamespace(req.body?.profileId);
        if (
          typeof req.body?.jobId !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,160}$/.test(req.body.jobId)
        )
          throw new Error('Invalid memory job ID.');
      },
    ),
  );
  router.post(
    '/memories/recall',
    run(
      async (req, res) => {
        const query = text(req.body?.query, 'Recall query', 500);
        res.json(
          await (deps.recallMemories ?? recallMemories)(
            req.body?.profileId,
            query,
          ),
        );
      },
      (req) => {
        profileNamespace(req.body?.profileId);
        text(req.body?.query, 'Recall query', 500);
      },
    ),
  );
  router.post(
    '/wallets/balance',
    run(
      async (req, res) => {
        res.json(
          await readSuiBalance(req.body.address, deps.queryTatum ?? queryTatum),
        );
      },
      (req) => normalizeSuiAddress(req.body?.address),
    ),
  );
  router.post(
    '/payments/verify',
    run(
      async (req, res) => {
        res.json(await (deps.verifyPayment ?? verifyPayment)(req.body));
      },
      (req) => validatePaymentInput(req.body),
    ),
  );
  return router;
}

export default createSubSenseRouter();
