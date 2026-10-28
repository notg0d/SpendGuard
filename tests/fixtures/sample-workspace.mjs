// Legacy sample data exists only as a regression fixture, never in the app bundle.
import { freshWorkspace } from '../../src/subsense/workspace.ts';
export function sampleWorkspace() {
  const subscriptions = [
    ['figma', 'Figma', 'Design', 1500, 'monthly', 'rare', 'optional', true],
    ['notion', 'Notion', 'Productivity', 1000, 'monthly', 'frequent', 'essential', true],
    ['netflix', 'Netflix', 'Entertainment', 1549, 'monthly', 'unused', 'optional', false],
    ['copilot', 'GitHub Copilot', 'AI & development', 1000, 'monthly', 'frequent', 'useful', true],
    ['spotify', 'Spotify', 'Entertainment', 1099, 'monthly', 'frequent', 'useful', false],
    ['dropbox', 'Dropbox', 'Storage', 11988, 'annual', 'occasional', 'useful', true],
  ].map(([id, name, category, costCents, cadence, usage, importance, workRelated]) => ({
    id, name, category, costCents, cadence, usage, importance, workRelated,
    renewsOn: '2026-11-01', notes: 'Test-only legacy subscription context.', status: 'active',
  }));
  return { ...freshWorkspace(), sample: true, budgetCents: 6500, subscriptions,
    decisions: [{ app: 'subsense', version: 1, id: 'sample-figma-context', serviceId: 'figma',
      serviceName: 'Figma', category: 'Design', costCents: 1500, cadence: 'monthly', action: 'keep', value: 'essential',
      reason: 'Clients require Figma for handoffs. Low usage does not mean low value.',
      at: new Date(Date.now() - 3 * 86400000).toISOString(), demo: true, storage: 'local' }],
  };
}
