import { describe, expect, it } from 'vitest';

import { createRequestGeneration } from './request-generation.js';

describe('createRequestGeneration', () => {
  it('invalidates an earlier request when the session changes', () => {
    const generation = createRequestGeneration();
    const officeASession = generation.advance();
    const officeBSession = generation.advance();

    expect(generation.isCurrent(officeASession)).toBe(false);
    expect(generation.isCurrent(officeBSession)).toBe(true);
  });

  it('captures the active generation for a request started in the current session', () => {
    const generation = createRequestGeneration();

    expect(generation.capture()).toBe(0);
    generation.advance();
    expect(generation.capture()).toBe(1);
  });
});
