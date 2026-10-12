export function createRequestGeneration() {
  let current = 0;

  return {
    advance() {
      current += 1;
      return current;
    },
    capture() {
      return current;
    },
    isCurrent(generation) {
      return generation === current;
    },
  };
}
