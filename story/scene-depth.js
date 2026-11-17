const smooth = value => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

// Signed distance from the reading stop. Reversing scroll retraces the same plane.
export function sceneDepth(offset) {
  const distance = Math.max(180, 1050 - offset * 1300);
  return {
    distance,
    scale: 1050 / distance,
    opacity: smooth((offset + 1.15) / .95) * (1 - smooth((offset - .10) / .66)),
  };
}
