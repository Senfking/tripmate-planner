/**
 * Display-time title-casing for destination strings.
 *
 * Behaviour:
 *  - If input is empty/null, returns input unchanged.
 *  - If input contains ANY uppercase letter, returns input unchanged
 *    (assume the producer already cased it intentionally — e.g. "iPhone",
 *    "New York", AI-generated trip titles).
 *  - Otherwise, capitalises the first letter of each whitespace-separated
 *    word and the first letter following hyphens / apostrophes (so
 *    "san francisco" → "San Francisco", "côte d'azur" → "Côte D'Azur").
 *
 * Never mutate DB values — only call at render time.
 */
export function toTitleCase<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  const str = value as string;
  if (/[A-Z]/.test(str)) return value;
  const cased = str.replace(/([^\s\-'’]+)/g, (word) =>
    word.charAt(0).toLocaleUpperCase() + word.slice(1),
  );
  return cased as T;
}
