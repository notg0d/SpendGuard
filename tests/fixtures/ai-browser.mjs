// Optional LOCAL-ONLY browser fixture. Never imported by the runtime server.
// Serves the real production app and wallet router, with an unfunded generated
// signing wallet and mocked provider calls. Run after npm run build.
import express from 'express';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createWalletRouter } from '../../server/routes/wallet.mjs';
import { createSessionStore } from '../../server/subsense-sessions.mjs';
import { credentialGuard } from '../../server/credential-guard.mjs';

const origin = 'http://localhost:3100';
const seed = Array.from({ length: 32 }, (_, i) => 160 + i);
const bundle = await build({ stdin: { contents: `
  import { registerWallet } from '@mysten/wallet-standard';
  import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
  const pair = Ed25519Keypair.fromSecretKey(new Uint8Array(${JSON.stringify(seed)}));
  const account = { address: pair.getPublicKey().toSuiAddress(), publicKey: pair.getPublicKey().toRawBytes(),
    chains: ['sui:mainnet'], features: ['sui:signPersonalMessage'] };
  let connected = false;
  const listeners = new Set();
  const wallet = { version: '1.0.0', name: 'SubSense generated TEST wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    chains: ['sui:mainnet'], get accounts() { return connected ? [account] : []; },
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => { connected = true;
        for (const fn of listeners) fn({ accounts: [account] }); return { accounts: [account] }; } },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => { connected = false;
        for (const fn of listeners) fn({ accounts: [] }); } },
      'standard:events': { version: '1.0.0', on: (_event, fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
      'sui:signPersonalMessage': { version: '1.1.0', signPersonalMessage: async ({ message }) => pair.signPersonalMessage(message) },
    }
  };
  registerWallet(wallet);
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const stats = { inference: 0, verify: 0, modes: [], contextCounts: [] };
const store = createSessionStore();
const app = express(); app.use(express.json({ limit: '192kb', inflate: false })); app.use(credentialGuard);
app.get('/__test/stats', (_req, res) => res.json(stats));
app.get('/__test/wallet.js', (_req, res) => res.type('application/javascript').send(bundle.outputFiles[0].text));
app.use('/api/subsense', createWalletRouter({ store, origin,
  connect: async () => { throw new Error('No live Mainnet provider operations in this fixture.'); },
  verifyAI: async (credentials) => {
    if (credentials.openaiKey !== 'test-only-browser-openai-key') throw new Error('Use the synthetic test key only.');
    stats.verify++;
  },
  aiRequest: async (path, _key, body) => {
    stats.inference++;
    if (path === 'embeddings') return { data: body.input.map((_, index) => ({ index,
      embedding: Array.from({ length: 256 }, (_, i) => i === 0 ? 1 : 0) })), usage: { total_tokens: 42 } };
    const input = JSON.parse(body.input);
    stats.modes.push(input.task); stats.contextCounts.push(input.documents.length);
    return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      answer: 'MOCK provider response: client handoffs explain your essential service. Review renewals manually; nothing was changed.',
      sourceIds: input.documents.map((d) => d.id),
    }) }] }], usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } };
  },
}));
app.use(express.static('dist', { index: false }));
const html = (await readFile('dist/index.html', 'utf8')).replace('<head>', '<head><script src="/__test/wallet.js"></script>');
app.get('*', (_req, res) => res.type('html').send(html));
const server = app.listen(3100, '127.0.0.1', () => console.log(`LOCAL MOCK browser fixture on ${origin}; PID ${process.pid}`));
const stop = () => { store.close(); server.close(() => process.exit(0)); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
