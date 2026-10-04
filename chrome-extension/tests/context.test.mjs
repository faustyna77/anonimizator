import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedAiUrl } from '../src/context.mjs';

test('allows only active pages under the local AI application path', () => {
  assert.equal(isAllowedAiUrl('http://127.0.0.1:5173/'), true);
  assert.equal(isAllowedAiUrl('http://127.0.0.1:5173/chat'), true);
  assert.equal(isAllowedAiUrl('http://127.0.0.1:5173.evil.test/'), false);
  assert.equal(isAllowedAiUrl('https://127.0.0.1:5173/'), false);
  assert.equal(isAllowedAiUrl('http://example.test/'), false);
  assert.equal(isAllowedAiUrl(undefined), false);
});
