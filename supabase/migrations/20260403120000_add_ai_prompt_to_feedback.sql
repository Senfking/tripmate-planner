-- Add ai_prompt column for storing Claude-generated Lovable prompts
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ai_prompt text;
