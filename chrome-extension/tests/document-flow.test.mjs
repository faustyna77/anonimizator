import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DocumentClientError,
  MAX_UPLOAD_BYTES,
  createDocumentApi,
  validateDocumentUpload,
} from '../src/document-client.mjs';
import { anonymizeAndDownload } from '../src/document-flow.mjs';

const baseUrl = 'https://anonimizator.fly.dev';
const token = 'session-token';

function documentFile(name, type, size = 3) {
  return new File([new Uint8Array(size)], name, { type });
}

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

test('validates PDF and DOCX uploads locally at the 10 MiB boundary', () => {
  assert.doesNotThrow(() => validateDocumentUpload(documentFile('brief.pdf', 'application/pdf', MAX_UPLOAD_BYTES)));
  assert.doesNotThrow(() => validateDocumentUpload(documentFile(
    'brief.DOCX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    MAX_UPLOAD_BYTES,
  )));
  assert.throws(
    () => validateDocumentUpload(documentFile('brief.txt', 'text/plain')),
    { code: 'FILE_TYPE_NOT_ALLOWED' },
  );
  assert.throws(
    () => validateDocumentUpload(documentFile('brief.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1)),
    { code: 'FILE_TOO_LARGE' },
  );
});

test('uploads exactly one multipart file with the Bearer token and no client metadata', async () => {
  const file = documentFile('brief.pdf', 'application/pdf');
  let requestedUrl;
  let requestOptions;
  const api = createDocumentApi({
    baseUrl,
    getAccessToken: async () => token,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestOptions = options;
      return jsonResponse({ document_id: 'document-123' });
    },
  });

  assert.deepEqual(await api.uploadDocument(file), { document_id: 'document-123' });
  assert.equal(requestedUrl, `${baseUrl}/anonymize`);
  assert.equal(requestOptions.method, 'POST');
  assert.deepEqual(requestOptions.headers, { Authorization: `Bearer ${token}` });
  assert.equal(requestOptions.headers['Content-Type'], undefined);
  assert.ok(requestOptions.body instanceof FormData);
  assert.deepEqual([...requestOptions.body.keys()], ['file']);
  assert.equal(requestOptions.body.get('file').name, 'brief.pdf');
  assert.equal([...requestOptions.body.keys()].includes('office_id'), false);
  assert.equal(requestedUrl.includes('/upload'), false);
});

test('maps upload authorization, validation, and network failures without response content', async () => {
  const file = documentFile('brief.pdf', 'application/pdf');
  const cases = [
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [422, 'PROCESSING_FAILED'],
  ];

  for (const [status, code] of cases) {
    const api = createDocumentApi({
      baseUrl,
      getAccessToken: async () => token,
      fetchImpl: async () => new Response('private document details', { status }),
    });
    await assert.rejects(api.uploadDocument(file), { code });
  }

  const offlineApi = createDocumentApi({
    baseUrl,
    getAccessToken: async () => token,
    fetchImpl: async () => { throw new TypeError('network unavailable'); },
  });
  await assert.rejects(offlineApi.uploadDocument(file), { code: 'NETWORK_ERROR' });
});

test('maps unavailable and not-ready anonymized result responses without reading their body', async () => {
  for (const [status, code] of [[404, 'RESULT_UNAVAILABLE'], [409, 'PROCESSING']]) {
    const api = createDocumentApi({
      baseUrl,
      getAccessToken: async () => token,
      fetchImpl: async () => new Response('private document details', { status }),
    });
    await assert.rejects(api.getAnonymizedDownload('document-123'), { code });
  }
});

test('downloads only the authorized anonymized result after a successful upload', async () => {
  const calls = [];
  const api = {
    async uploadDocument(file) {
      assert.equal(file.name, 'brief.pdf');
      return { document_id: 'document-123' };
    },
    async getAnonymizedDownload(documentId) {
      assert.equal(documentId, 'document-123');
      return { download_url: 'https://storage.example.test/result.pdf' };
    },
  };

  const result = await anonymizeAndDownload({
    file: documentFile('brief.pdf', 'application/pdf'),
    api,
    downloadsApi: { async download(options) { calls.push(options); return 1; } },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    url: 'https://storage.example.test/result.pdf',
    filename: 'zanonimizowany-brief.pdf',
    saveAs: true,
  }]);
});

test('does not start a download when result access is forbidden, unavailable, or not ready', async () => {
  for (const code of ['FORBIDDEN', 'RESULT_UNAVAILABLE', 'PROCESSING']) {
    let downloads = 0;
    const api = {
      async uploadDocument() { return { document_id: 'document-123' }; },
      async getAnonymizedDownload() { throw new DocumentClientError(code); },
    };

    const result = await anonymizeAndDownload({
      file: documentFile('brief.pdf', 'application/pdf'),
      api,
      downloadsApi: { async download() { downloads += 1; } },
    });

    assert.deepEqual(result, { ok: false, code });
    assert.equal(downloads, 0);
  }
});

test('does not start a download after an unauthorized upload or download request', async () => {
  for (const failingOperation of ['uploadDocument', 'getAnonymizedDownload']) {
    let downloads = 0;
    const api = {
      async uploadDocument() {
        if (failingOperation === 'uploadDocument') throw new DocumentClientError('UNAUTHORIZED');
        return { document_id: 'document-123' };
      },
      async getAnonymizedDownload() {
        if (failingOperation === 'getAnonymizedDownload') throw new DocumentClientError('UNAUTHORIZED');
        return { download_url: 'https://storage.example.test/result.pdf' };
      },
    };

    const result = await anonymizeAndDownload({
      file: documentFile('brief.pdf', 'application/pdf'),
      api,
      downloadsApi: { async download() { downloads += 1; } },
    });

    assert.deepEqual(result, { ok: false, code: 'UNAUTHORIZED' });
    assert.equal(downloads, 0);
  }
});
