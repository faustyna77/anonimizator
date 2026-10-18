import { describe, expect, it } from 'vitest';

import {
  createLoadingResource,
  createReadyResource,
  createResourceError,
  isEmptyResource,
} from './panel-resource-state.js';

describe('panel resource state', () => {
  it.each(['documents', 'office rules'])('keeps %s loading distinct from an empty collection', (_resourceName) => {
    const resource = createLoadingResource();

    expect(resource).toEqual({ status: 'loading', data: [] });
    expect(isEmptyResource(resource)).toBe(false);
  });

  it.each(['documents', 'office rules'])('keeps a %s read error distinct from an empty collection', (_resourceName) => {
    const resource = createResourceError('Read failed');

    expect(resource).toEqual({ status: 'error', data: [], error: 'Read failed' });
    expect(isEmptyResource(resource)).toBe(false);
  });

  it.each(['documents', 'office rules'])('shows empty only after a successful empty %s response', (_resourceName) => {
    const resource = createReadyResource([]);

    expect(resource).toEqual({ status: 'ready', data: [] });
    expect(isEmptyResource(resource)).toBe(true);
  });

  it.each(['documents', 'office rules'])('retains ready %s data for rendering', (resourceName) => {
    const data = [{ id: `${resourceName}-1` }];
    const resource = createReadyResource(data);

    expect(resource).toEqual({ status: 'ready', data });
    expect(isEmptyResource(resource)).toBe(false);
  });
});
