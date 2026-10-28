// Must stay first — ESM runs every import before the body, so a setGlobalDispatcher()
// call further down lands after ./routes/* have made their module-scope calls.
import './proxy-bootstrap.mjs';
// Second, before any ./routes/* read the key at module load: this applies
// /creds/creds.json onto process.env, so `process.env.TATUM_API_KEY` is set on
// the controller path (which delivers the key as a file, not an env var) and
// stays live across the rotation push. A no-op where the key is already in env.
import './credentials-store.mjs';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
import subsenseRoutes from './routes/wallet.mjs';
import { credentialGuard } from './credential-guard.mjs';
import { networkConfig } from './subsense-network.mjs';
import { publicOrigin } from './subsense-sessions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
if (networkConfig().network !== 'mainnet') throw new Error('Wallet-first SubSense is Mainnet only. Set SUBSENSE_NETWORK=mainnet.');
publicOrigin(); // HTTPS is required outside localhost; never trust an arbitrary Host header.

// Run from the project root. The preview-sidecar starts this server with CWD=/,
// but tooling that resolves paths from the CWD — notably Tailwind's `content`
// globs — must see the project files, or it silently generates no utilities
// (unstyled preview). `vite build` already runs from here; this makes dev match.
process.chdir(root);

const app = express();
app.disable('x-powered-by');
// This app does not accept nested query strings or URL-encoded form bodies.
app.set('query parser', 'simple');
const defaultJson = express.json({ limit: '32kb', inflate: false });
const aiJson = express.json({ limit: '192kb', inflate: false });
app.use((req, res, next) =>
  (req.path === '/api/subsense/ai/run' ? aiJson : defaultJson)(req, res, next),
);

// Redact the Tatum API key from every response before it leaves the process.
app.use(credentialGuard);

app.use('/api/subsense', subsenseRoutes);
// Retired reference APIs are not part of SubSense; reject unknown API paths.
app.use('/api', (_req, res) =>
  res.status(404).json({ message: 'API route not found.' }),
);
app.use('/api', (error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res
    .status(status)
    .json({
      message:
        status === 413
          ? 'Request body is too large.'
          : status < 500
            ? 'Invalid JSON request body or unsupported encoding.'
            : 'The server could not handle this request.',
    });
});

const server = createHttpServer(app);

const production =
  process.env.NODE_ENV === 'production' ||
  process.argv.includes('--production');
if (production) {
  // Public demos serve built assets, never Vite's development filesystem/editor routes.
  app.use(express.static(path.join(root, 'dist'), { index: false }));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(root, 'dist', 'index.html')),
  );
} else {
  // All Vite config is inline — no vite.config.js needed, no temp files written.
  // cacheDir points to /tmp so dep pre-bundling works on read-only node_modules mounts.
  const vite = await createViteServer({
    root,
    configFile: false,
    cacheDir: '/tmp/vite',
    plugins: [react()],
    server: {
      middlewareMode: true,
      hmr: { server },
      // Allow any Host — the preview is served on a per-project subdomain this file
      // cannot know. Must be the boolean `true` or an array; the string 'all' is
      // iterated per-character and silently blocks everything (no warning, no error).
      // NB: Vite's 403 body says to add the host to vite.config.js — that does not apply
      // here, `configFile: false` means any vite.config.js is silently ignored.
      allowedHosts: true,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const port = process.env.PORT ?? 3000;
server.listen(port, () => {
  console.log(`preview-sidecar listening on :${server.address().port}`);
});
