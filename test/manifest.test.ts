// test/manifest.test.ts — the install-time manifest must parse with the
// bundled SDK. Regression: `"secret": false` on integration settings used
// to fail install with "not a valid extension manifest" (the SDK schema
// allows only `secret: true` or an absent key).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseManifest } from '@openchamber/sdk/schemas';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package.json parses as a valid extension manifest', () => {
  const result = parseManifest(pkg);
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 500));
});
