import { describe, expect, it } from 'vitest';

import { createRuleDrafts, resetRuleDrafts } from './rule-drafts.js';

describe('createRuleDrafts', () => {
  it('returns empty drafts for both rule kinds', () => {
    expect(createRuleDrafts()).toEqual({
      phrase: { kind: 'phrase', pattern: '', marker_label: '', enabled: true },
      regex: { kind: 'regex', pattern: '', marker_label: '', enabled: true },
    });
  });

  it('returns fresh empty drafts when a session is cleared', () => {
    const drafts = createRuleDrafts();
    drafts.phrase.pattern = 'Jan Kowalski';

    expect(resetRuleDrafts()).toEqual({
      phrase: { kind: 'phrase', pattern: '', marker_label: '', enabled: true },
      regex: { kind: 'regex', pattern: '', marker_label: '', enabled: true },
    });
  });
});
