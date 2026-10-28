import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Developer-side setup only, never called by the preview server.
const example = new URL('../.env.example', import.meta.url);
const target = new URL('../.env', import.meta.url);
const template = await readFile(example, 'utf8');
try {
  await writeFile(target, template, { flag: 'wx', mode: 0o600 });
  console.log(
    `Created ${fileURLToPath(target)} for Mainnet. No provider credentials were generated.`,
  );
  console.log(
    'Set your exact public origin if needed, restart npm run dev, then sign in with a Sui wallet and set up the encrypted browser vault.',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log(
    '.env already exists and was not modified. Use .env.example to add missing settings; never overwrite your existing credentials.',
  );
}
