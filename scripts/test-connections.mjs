import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
const base = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/subsense`;
const secrets = ['TATUM_API_KEY', 'MEMWAL_KEY', 'MEMWAL_ACCOUNT_ID']
  .map((name) => process.env[name])
  .filter(Boolean);
const safe = (value) =>
  secrets.reduce(
    (text, secret) => text.split(secret).join('[REDACTED]'),
    String(value),
  );
try {
  const configResponse = await fetch(`${base}/config`, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!configResponse.ok)
    throw new Error(`Server configuration failed (${configResponse.status}).`);
  const config = await configResponse.json();
  if (config.authMode !== 'wallet')
    throw new Error(
      'The running backend is outdated. Restart npm run dev to load wallet sign-in.',
    );
  console.log(
    'Wallet-first Mainnet mode: sign in and unlock your vault in the browser, then use Refresh & test connections. This script cannot access HttpOnly wallet-session cookies and will not use shared .env provider credentials.',
  );
} catch (error) {
  console.error(safe(error.message));
  process.exitCode = 1;
}
