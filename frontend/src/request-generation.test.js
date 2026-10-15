import { describe, expect, it } from 'vitest';

import { createRequestGeneration } from './request-generation.js';

describe('createRequestGeneration', () => {
  it('invalidates a pending deanonymization result when the session changes', () => {
    const generation = createRequestGeneration();
    const pendingDeanonymization = generation.advance();

    generation.advance();

    expect(generation.isCurrent(pendingDeanonymization)).toBe(false);
  });

  it('captures the active generation for a request started in the current session', () => {
    const generation = createRequestGeneration();

    expect(generation.capture()).toBe(0);
    generation.advance();
    expect(generation.capture()).toBe(1);
  });
});
