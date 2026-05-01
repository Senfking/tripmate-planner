// Strips emoji and pictographic characters from AI-generated text so titles
// and themes stay mature/premium. Junto design system: no emojis in UI.
//
// Covers both presentational emoji (e.g. 🌋) and extended pictographs
// (e.g. ✈, ☀ — single-codepoint symbols Gen-AI loves to sprinkle in).
// Also collapses any whitespace/punctuation gaps left behind so we don't
// end up with strings like "Tokyo  : Neon" after stripping.
const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
// Variation selectors / zero-width joiners that emoji sequences often carry.
const EMOJI_MODIFIER_RE = /[\u{FE0E}\u{FE0F}\u{200D}]/gu;

export function stripEmoji(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(EMOJI_RE, "")
    .replace(EMOJI_MODIFIER_RE, "")
    // Collapse "word  ,  word" / " : " gaps left by removed emoji.
    .replace(/\s+([,;:!?.])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
