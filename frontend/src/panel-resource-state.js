export function createLoadingResource() {
  return { status: 'loading', data: [] };
}

export function createReadyResource(data) {
  return { status: 'ready', data };
}

export function createResourceError(error) {
  return { status: 'error', data: [], error };
}

export function isEmptyResource(resource) {
  return resource.status === 'ready' && resource.data.length === 0;
}
