// Last-resort destination extraction from free_text.
//
// When parseIntent's primary tool call returns destination="" /
// named_destinations=[] AND a focused recovery LLM call also fails to
// surface a place, we fall back to a conservative regex pass over the
// raw free_text. This is NOT general-purpose NER — it matches a narrow
// set of preposition+placename forms that are unambiguous in
// trip-builder-style prompts ("X days in <City>", "trip to <City>",
// "<City>, <Country>").
//
// Capitalization is required: "in dubai" won't match (the user is
// writing in prose; trip prompts virtually always capitalize the place
// name). This avoids false-positives on common nouns.
//
// Returns the longest-looking match — picking the rightmost capture
// wins when multiple patterns trigger because trip prompts conventionally
// lead with day-count / group-size and place the destination after.

const DESTINATION_PATTERNS: ReadonlyArray<RegExp> = [
  // "<N> day(s)/week(s) in <City>" — covers "6 days in Dubai", "2 weeks in Tokyo".
  /(?:\d+\s+)?(?:days?|weeks?|nights?)\s+in\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/,
  // "weekend in <City>", "long weekend in <City>".
  /\bweekend\s+in\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/,
  // "trip / holiday / vacation / getaway to|in <City>".
  /\b(?:trip|holiday|vacation|getaway|escape|honeymoon|anniversary)\s+(?:to|in)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/i,
  // "visiting / exploring / going to / flying to <City>".
  /\b(?:visiting|exploring|going\s+to|flying\s+to|heading\s+to)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/i,
  // "<City>, <Country>" — capture city only.
  /([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\s*,\s+[A-Z][a-zA-Z]/,
  // "in <City>" anywhere — last resort, lowest priority.
  /\bin\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/,
];

// Words that look like place names (capitalized) but are noise in trip
// prompts. Used to filter false positives from the regex pass. Lowercase
// keys for case-insensitive comparison.
const STOPWORDS: ReadonlySet<string> = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "spring", "summer", "autumn", "fall", "winter",
  "michelin", "airbnb", "uber",
  "beach", "rooftop", "club", "spa", "hotel", "ryokan", "hostel",
  "trip", "holiday", "vacation", "getaway", "honeymoon", "anniversary",
  "weekend", "week", "day", "days", "weeks", "night", "nights",
  "friends", "family", "couple", "solo", "group",
]);

export function extractDestinationFromTextRegex(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  for (const re of DESTINATION_PATTERNS) {
    const m = trimmed.match(re);
    if (!m || !m[1]) continue;
    const candidate = m[1].trim();
    if (candidate.length < 2 || candidate.length > 60) continue;
    // Reject when ALL whitespace-separated tokens are stopwords. A multi-
    // word match like "Beach Club" should not be treated as a destination,
    // but "New Beach" (rare but real placename pattern) is allowed because
    // "New" isn't a stopword.
    const tokens = candidate.split(/\s+/);
    const allStop = tokens.every((t) => STOPWORDS.has(t.toLowerCase()));
    if (allStop) continue;
    return candidate;
  }
  return null;
}
