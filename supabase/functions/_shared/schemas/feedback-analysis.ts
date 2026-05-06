// Zod schema for the JSON Anthropic returns from analyze-feedback. Output
// gets written straight to feedback.ai_summary / ai_severity / ai_category /
// ai_fix, so reject malformed responses before persistence.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const FeedbackAnalysisSchema = z
  .object({
    summary: z.string().max(2000),
    severity: z.enum(["low", "medium", "high", "critical"]),
    ai_category: z.string().max(120),
    fix: z.string().max(2000).nullable(),
  })
  .strict();

export type FeedbackAnalysis = z.infer<typeof FeedbackAnalysisSchema>;
