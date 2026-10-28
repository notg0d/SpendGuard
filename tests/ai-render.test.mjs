import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { freshWorkspace } from '../src/subsense/workspace.ts';

test('AI screens render with consent off, no automatic requests and no sample-loading control', async () => {
  const result = await build({ stdin: { contents: `
    export { default as Assistant } from './src/subsense/AssistantView.tsx';
    export { default as Vault } from './src/subsense/CredentialsVault.tsx';
    export { default as Settings } from './src/subsense/SettingsView.tsx';
  `, resolveDir: process.cwd() }, bundle: true, packages: 'external', platform: 'node',
    format: 'esm', jsx: 'automatic', write: false, plugins: [{ name: 'test-wallet-context', setup(builder) {
      builder.onResolve({ filter: /^\.\/WalletAccess$/ }, () => ({ path: 'test-wallet', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
        "export const useWalletAccess = () => ({ session: { authenticated: true, walletAddress: '0x3', network: 'mainnet' }, refresh: async()=>{}, lock: async()=>{} });" }));
      builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
    } }],
  });
  const module = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Rendering must never call providers'); };
    const workspace = freshWorkspace();
    const html = renderToString(createElement(module.Assistant, { workspace, onBusy() {}, onConnections() {}, locked: false }));
    assert.match(html, /Open Connections/); assert.match(html, /No context yet/);
    assert.match(html, /Semantic search/); assert.match(html, /Explain decisions/); assert.match(html, /Plan renewals/);
    assert.match(html, /type="checkbox"[^>]*disabled/);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Ask OpenAI/);
    const vault = renderToString(createElement(module.Vault, { onChanged: async () => {}, onBusy() {} }));
    assert.match(vault, /OpenAI API key \(optional\)/); assert.match(vault, /AI-only setup/);
    assert.doesNotMatch(vault, /name="openaiKey"[^>]*value="sk-/);
    const settings = renderToString(createElement(module.Settings, { workspace, commit() {}, replace() {}, locked: false, busy: false, wallet: '0x3' }));
    assert.doesNotMatch(settings, /Load sample workspace/);
  } finally { globalThis.fetch = original; }
});
