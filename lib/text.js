// Small text helpers shared across screens and pure modules (ticket 045;
// ticket 051 reuses `plural` rather than adding its own copy — see
// lib/__tests__/text.test.js).

/** `singular` when `n === 1`, `pluralForm` otherwise. */
export function plural(n, singular, pluralForm) {
  // French: 0 and 1 take the singular ("0 plante", "1 plante", "2 plantes").
  return Math.abs(n) < 2 ? singular : pluralForm;
}
