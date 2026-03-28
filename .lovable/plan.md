

# Vibe Board Feature (Updated)

## Overview
Collaborative "vibe check" at the top of the Decisions tab. Members privately answer 5 questions; group sees only aggregates with alignment badges and a summary sentence.

## Database

### Migration 1: vibe_responses table + trips columns

**New table: `vibe_responses`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| trip_id | uuid NOT NULL | FK to trips |
| user_id | uuid NOT NULL | |
| question_key | text NOT NULL | energy, budget, accommodation, length, musthave |
| answer_value | text NOT NULL | |
| created_at | timestamptz | default now() |

- Partial unique index on `(trip_id, user_id, question_key)` WHERE `question_key != 'musthave'`
- Trigger to enforce max 2 rows per user for `question_key = 'musthave'`

**New columns on `trips`:**
- `vibe_board_active` boolean default false
- `vibe_board_locked` boolean default false

**RLS on `vibe_responses`:**
- INSERT: `user_id = auth.uid() AND is_trip_member(trip_id, auth.uid())`
- UPDATE: same
- DELETE: same
- SELECT: own rows only (`user_id = auth.uid() AND is_trip_member(...)`)

### Migration 2: get_vibe_aggregates function

Security-definer function returning `(question_key, answer_value, count)` — checks `is_trip_member` internally. No user_ids exposed.

Also: a helper `get_vibe_respondent_count(_trip_id)` returning the count of distinct users who responded.

## New Files

| File | Purpose |
|------|---------|
| `src/components/vibe/VibeBoard.tsx` | Main container |
| `src/components/vibe/VibeQuestion.tsx` | Pill-option row per question |
| `src/components/vibe/VibeSummary.tsx` | Bar charts, badges, summary sentence |
| `src/hooks/useVibeBoard.ts` | Queries + mutations |

## Modified Files

| File | Change |
|------|--------|
| `src/pages/TripHome.tsx` | Decisions tab renders `<VibeBoard>` instead of placeholder |

## UI States

1. **Inactive** — Organiser sees "Activate Vibe Board" button; members see nothing
2. **Active, unanswered** — 5 question rows with tappable pills; selecting saves via upsert
3. **Active, answered** — Selected pills highlighted (teal gradient); changeable. "X of Y responded" counter
4. **Active, 2+ responses** — Summary section appears below questions: mini bar charts, Aligned/Discuss badges, auto-generated sentence
5. **Locked, had answered** — Pills disabled showing user's selections; summary is final read-only record
6. **Locked, never answered** — Questions section hidden (no blank pills); summary shown in read-only mode with a note "You didn't submit answers before the board was locked." Member still sees the full group summary (bar charts, badges, sentence)

## Privacy
- Individual answers never exposed — only aggregates via `get_vibe_aggregates`
- Users can read their own rows for pill highlight state
- Organiser sees aggregates only

## Locking
- Only owner/admin can lock (button in VibeBoard header)
- Once locked: inserts/updates blocked client-side (pills disabled); summary is final
- The check on lock uses the `vibe_board_locked` column on trips — the trigger/RLS doesn't need to enforce it since the UI prevents changes, but upsert mutations should also check `vibe_board_locked` before writing

## Summary Sentence Logic
Pick majority answer per question, compose: e.g. "Looks like a chill trip with a lean budget — but accommodation needs a chat." For musthave: Aligned if top answer appears in ≥70% of members' selections; otherwise Discuss.

