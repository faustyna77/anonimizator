import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('manifest limits MV3 capabilities to the local AI pilot and required endpoints', async () => {
  const manifest = JSON.parse(await readFile(path.join(extensionDirectory, 'manifest.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage', 'downloads']);
  assert.deepEqual(manifest.host_permissions, [
    'http://127.0.0.1:5173/*',
    'https://anonimizator.fly.dev/*',
    'https://*.supabase.co/*',
  ]);
  assert.equal('content_scripts' in manifest, false);
  assert.equal('web_accessible_resources' in manifest, false);
  assert.equal('optional_permissions' in manifest, false);

  const serialized = JSON.stringify(manifest);
  for (const forbiddenCapability of ['<all_urls>', 'clipboardWrite', 'tabs', 'scripting', 'injected.js', 'content.js']) {
    assert.equal(serialized.includes(forbiddenCapability), false, `manifest must not include ${forbiddenCapability}`);
  }
});
