import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBackgroundHandler } from '../src/background-handler.mjs';
import { serializeDocumentForWorker } from '../src/document-transfer.mjs';

const extensionDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('module service worker statically loads local configuration before registering its handler', async () => {
  const source = await readFile(path.join(extensionDirectory, 'background.js'), 'utf8');

  assert.match(source, /import '\.\/config\.js';/);
  assert.doesNotMatch(source, /import\('\.\/config\.js'\)/);
});

function createChromeMock() {
  const values = {
    supabaseSession: {
      access_token: 'worker-token',
      expires_at: 2_000_000_000,
      refresh_token: 'refresh-token',
      user: { email: 'lawyer@example.test' },
    },
  };
  const downloads = [];

  return {
    storage: {
      local: {
        async setAccessLevel() {},
        async set(nextValues) { Object.assign(values, nextValues); },
        async get(key) { return Object.hasOwn(values, key) ? { [key]: values[key] } : {}; },
        async remove(key) { delete values[key]; },
      },
    },
    downloads: {
      async download(options) { downloads.push(options); return 7; },
    },
    state() { return { downloads, values: structuredClone(values) }; },
  };
}

const config = {
  backendUrl: 'https://anonimizator.fly.dev',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key',
};

function selectedPdf() {
  return new File(['pdf content'], 'brief.pdf', { type: 'application/pdf' });
}

test('serializes a selected document into a worker-safe payload without metadata fields', async () => {
  const payload = await serializeDocumentForWorker(selectedPdf());

  assert.deepEqual(Object.keys(payload).sort(), ['contentBase64', 'name', 'type']);
  assert.equal(payload.name, 'brief.pdf');
  assert.equal(payload.type, 'application/pdf');
  assert.equal('office_id' in payload, false);
});

test('service worker uploads one reconstructed file and sends the authorized result only to Chrome downloads', async () => {
  const chromeApi = createChromeMock();
  const requests = [];
  const handler = createBackgroundHandler({
    chromeApi,
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/anonymize')) {
        return Response.json({ document_id: 'document-123' });
      }
      return Response.json({ download_url: 'https://storage.example.test/temporary-result.pdf' });
    },
  });

  const result = await handler({
    type: 'ANONYMIZE_DOCUMENT',
    file: await serializeDocumentForWorker(selectedPdf()),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://anonimizator.fly.dev/anonymize');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer worker-token');
  assert.deepEqual([...requests[0].options.body.keys()], ['file']);
  assert.equal(requests[1].url, 'https://anonimizator.fly.dev/documents/document-123/anonymized-download');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer worker-token');
  assert.deepEqual(chromeApi.state().downloads, [{
    url: 'https://storage.example.test/temporary-result.pdf',
    filename: 'zanonimizowany-brief.pdf',
    saveAs: true,
  }]);
});

test('service worker clears an expired session and does not download after a 401 response', async () => {
  const chromeApi = createChromeMock();
  const handler = createBackgroundHandler({
    chromeApi,
    config,
    fetchImpl: async () => new Response('private document details', { status: 401 }),
  });

  const result = await handler({
    type: 'ANONYMIZE_DOCUMENT',
    file: await serializeDocumentForWorker(selectedPdf()),
  });

  assert.deepEqual(result, { ok: false, code: 'UNAUTHORIZED' });
  assert.deepEqual(chromeApi.state().downloads, []);
  assert.equal('supabaseSession' in chromeApi.state().values, false);
});
