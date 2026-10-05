import assert from 'node:assert/strict';
import test from 'node:test';

import { statusMessageForDocumentResult } from '../src/document-status.mjs';

test('maps upload and download outcomes to safe Polish status messages', () => {
  assert.equal(
    statusMessageForDocumentResult({ ok: true }),
    'Pobrano zanonimizowany wynik. Załącz go ręcznie do lokalnej aplikacji AI.',
  );
  assert.equal(statusMessageForDocumentResult({ ok: false, code: 'UNAUTHORIZED' }), 'Sesja wygasła. Zaloguj się ponownie.');
  assert.equal(statusMessageForDocumentResult({ ok: false, code: 'FORBIDDEN' }), 'Nie masz dostępu do anonimizacji dla tej kancelarii.');
  assert.equal(
    statusMessageForDocumentResult({ ok: false, code: 'PROCESSING_FAILED' }),
    'Nie udało się przetworzyć dokumentu. Sprawdź plik, a dla PDF warstwę tekstową.',
  );
  assert.equal(
    statusMessageForDocumentResult({ ok: false, code: 'NETWORK_ERROR' }),
    'Nie można połączyć się z usługą anonimizacji. Spróbuj ponownie.',
  );
  assert.equal(
    statusMessageForDocumentResult({ ok: false, code: 'private document content' }),
    'Nie udało się wykonać żądania. Spróbuj ponownie.',
  );
});
