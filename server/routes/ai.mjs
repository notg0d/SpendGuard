import { Router } from 'express';
import { AIError, runAI, validateAIInput } from '../subsense-ai.mjs';

export function createAIRouter({ store, request }) {
  const router = Router();
  router.post('/ai/run', async (req, res) => {
    const session = req.walletSession;
    if (!session.credentials?.openaiKey)
      return res.status(409).json({ message: 'Unlock a vault containing your OpenAI key in Connections.' });
    if (session.connecting || session.aiBusy)
      return res.status(409).json({ message: 'Another credential check or AI request is in progress.' });
    let input;
    try { input = validateAIInput(req.body); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    const now = Date.now();
    if (!session.aiRate || session.aiRate.expires <= now) session.aiRate = { count: 0, expires: now + 60000 };
    if (++session.aiRate.count > 12) return res.status(429).json({ message: 'AI request limit reached. Retry in a minute.' });
    const revision = session.revision;
    const controller = new AbortController();
    session.aiController = controller;
    session.aiBusy = true;
    const abort = () => controller.abort();
    res.once('close', abort);
    try {
      const result = await runAI(input, session, { request, signal: controller.signal });
      if (!store.valid(session) || session.revision !== revision) throw new AIError('Vault locked or session expired. No result was applied.', 409);
      res.json(result);
    } catch (error) {
      if (!res.destroyed) res.status(error instanceof AIError ? error.status : 502).json({
        message: error instanceof AIError ? error.message : 'AI request failed. No workspace changes were made.',
      });
    } finally {
      res.off('close', abort);
      session.aiBusy = false;
      session.aiController = undefined;
    }
  });
  return router;
}
