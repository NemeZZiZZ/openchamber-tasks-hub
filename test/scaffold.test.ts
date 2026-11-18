// test/scaffold.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('manifest declares sessions+prompt+service and settings fields', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.deepEqual(pkg.openchamber.contributes.capabilities, ['sessions', 'prompt']);
  assert.ok(pkg.openchamber.contributes.service.entry.endsWith('service/main.js'));
  const ids = pkg.openchamber.contributes.integration.settings.map((s: any) => s.id);
  for (const id of ['github-token', 'gitlab-token', 'gitlab-server', 'repos']) assert.ok(ids.includes(id));
});
