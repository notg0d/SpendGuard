import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

test('wallet login renders with required Mainnet contexts and performs no browser RPC', async () => {
  const result = await build({
    entryPoints: ['src/App.tsx'],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    write: false,
    plugins: [
      {
        name: 'external-esm-urls',
        setup(builder) {
          builder.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.kind === 'entry-point') return;
            return { path: import.meta.resolve(args.path), external: true };
          });
        },
      },
    ],
  });
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('Rendering must not fetch blockchain data.');
    };
    const html = renderToString(createElement(module.default));
    assert.match(html, /Sui Mainnet/);
    assert.match(html, /Welcome to your workspace/);
    assert.match(html, /Checking session/);
    assert.doesNotMatch(html, /Your encrypted credential vault/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
