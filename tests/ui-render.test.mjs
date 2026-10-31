import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { freshWorkspace } from '../src/subsense/workspace.ts';

const screens = build({
  stdin: { contents: `
    export { default as App } from './src/subsense/SubSenseApp.tsx';
    export { default as Overview } from './src/subsense/OverviewView.tsx';
    export { default as Connections } from './src/subsense/ConnectionsView.tsx';
    export { SubscriptionForm } from './src/subsense/forms.tsx';
  `, resolveDir: process.cwd() },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  plugins: [{ name: 'isolated-wallet-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/WalletAccess$/ }, () => ({ path: 'wallet-fixture', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const shortWallet = () => 'Test wallet';
      export const useWalletAccess = () => ({ session: { authenticated: true, walletAddress: '0x3', network: 'mainnet', credentialsConfigured: false, vaultUnlocked: false }, logout: async()=>{}, refresh: async()=>{}, lock: async()=>{} });
    ` }));
    builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
}).then((result) => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')));

test('new users land on Home without provider setup or technical status chrome', async () => {
  const { App } = await screens;
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.localStorage = { getItem: () => null };
    globalThis.fetch = async () => { throw new Error('Rendering must not call a provider.'); };
    const html = renderToString(createElement(App));
    assert.match(html, /A little clarity, every month/);
    assert.match(html, /Add your first subscription/);
    assert.match(html, /Your monthly spending/);
    assert.match(html, /aria-label="Mobile navigation"/);
    assert.doesNotMatch(html, /Mainnet|GraphQL|blobs|INFRASTRUCTURE|Tatum Mainnet API key/);
    assert.match(html, /Saved on this device/);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test('overview uses actual subscription totals and excludes inactive subscriptions', async () => {
  const { Overview } = await screens;
  const workspace = freshWorkspace();
  workspace.subscriptions = [
    { id: 'a', name: 'Monthly service', category: 'Productivity', costCents: 1000, cadence: 'monthly', usage: 'frequent', importance: 'useful', status: 'active', renewsOn: '2027-01-01', workRelated: false, notes: '' },
    { id: 'b', name: 'Yearly service', category: 'Design', costCents: 12000, cadence: 'annual', usage: 'rare', importance: 'useful', status: 'active', renewsOn: '2027-01-02', workRelated: false, notes: '' },
    { id: 'c', name: 'Paused service', category: 'Other', costCents: 99999, cadence: 'monthly', usage: 'unused', importance: 'optional', status: 'paused', renewsOn: '2027-01-03', workRelated: false, notes: '' },
  ];
  const html = renderToString(createElement(Overview, { workspace, locked: false, onReview() {}, onNavigate() {}, onAdd() {} }));
  assert.match(html, /\$20\.00/);
  assert.match(html, /\$240\.00/);
  assert.match(html, /\$80\.00/);
  assert.match(html, /aria-valuenow="20"/);
  assert.match(html, /aria-label="Design: \$10\.00, Productivity: \$10\.00"|aria-label="Productivity: \$10\.00, Design: \$10\.00"/);
  assert.doesNotMatch(html, /Paused service|Mainnet|blobs/);
});

test('subscription form exposes the basics and collapses optional usage questions', async () => {
  const { SubscriptionForm } = await screens;
  const html = renderToString(createElement(SubscriptionForm, { onSave() {}, onClose() {} }));
  assert.match(html, /Service name/);
  assert.match(html, /Price \(USD\)/);
  assert.match(html, /How often do you pay/);
  assert.match(html, /<details class="ss-disclosure"><summary>Help me decide what to keep/);
  assert.match(html, /aria-describedby=/);
  assert.doesNotMatch(html, /self-reported|Provider status|bank connection/);
});

test('optional features explain benefits before mounting credential setup', async () => {
  const { Connections } = await screens;
  const html = renderToString(createElement(Connections, { workspace: freshWorkspace(), commit() {}, locked: false, onBusy() {}, onConfig() {} }));
  assert.match(html, /Set up AI help/);
  assert.match(html, /Set up online memory/);
  assert.match(html, /<details class="ss-disclosure"><summary>Online memory &amp; payment tools/);
  assert.doesNotMatch(html, /Your connection keys|Tatum Mainnet API key|MemWal delegate private key/);
});
