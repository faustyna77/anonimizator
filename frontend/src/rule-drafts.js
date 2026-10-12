export function createRuleDraft(kind) {
  return {
    kind,
    pattern: '',
    marker_label: '',
    enabled: true,
  };
}

export function createRuleDrafts() {
  return {
    phrase: createRuleDraft('phrase'),
    regex: createRuleDraft('regex'),
  };
}

export function resetRuleDrafts() {
  return createRuleDrafts();
}
