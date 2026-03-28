

# Collapsible Step-by-Step Decisions Tab

## Overview

Wrap the three existing sections (Vibe Board, Where & When, Preferences) in collapsible accordion-style cards with step numbers, status badges, and unlock gating logic. Content inside each section stays unchanged.

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/TripHome.tsx` | Edit | Replace flat rendering of VibeBoard + WhereWhenSection with new `DecisionsFlow` component |
| `src/components/decisions/DecisionsFlow.tsx` | Create | Orchestrator: three collapsible step sections with expand/collapse state, unlock logic, status computation |
| `src/components/decisions/StepSection.tsx` | Create | Reusable collapsible card: step number circle, title, status badge, chevron, smooth animation |
| `src/hooks/useVibeBoard.ts` | No change | Already exposes `myResponses`, `respondentCount` needed for gating |

## How It Works

### StepSection Component
- Props: `stepNumber`, `title`, `subtitle?`, `status` (badge text + variant), `isExpanded`, `onToggle`, `isLocked?`, `lockMessage?`, `activeBorder?`, `children`
- Renders a white card with subtle border; teal circle with step number on the left
- Right side: status badge + animated chevron (▼/▶)
- Collapsible body uses CSS `grid-template-rows: 0fr → 1fr` transition for smooth animation
- When `isLocked`, header shows lock icon + lockMessage instead of status badge, and children are not rendered
- When `activeBorder` is true, border becomes teal 1.5px

### DecisionsFlow Component
- Receives `tripId`, `myRole`, `memberCount`, and relevant vibe data from TripHome
- Manages `expandedSections` state (Set of step keys)
- Computes section states:

**Step 1 — Vibe Board:**
- `hasSubmitted` = myResponses.length > 0
- Default expanded if not submitted; auto-collapse when submitted
- Status: "✅ Done" if submitted, "In progress" if not
- Collapsed summary: user's top answers from myResponses (e.g. "Full send 🔥 · Fair split ⚖️")

**Step 2 — Where & When:**
- `vibeRatio` = respondentCount / memberCount
- `isUnlocked` = vibeRatio >= 0.5 OR manually skipped by admin
- `manuallySkipped` local state toggled by "Skip" link (owner/admin only)
- When locked: show lock icon + "Waiting for X more members to share their vibe" + Skip link for admin
- When unlocked + no confirmed plan: auto-expand, status "In progress", active teal border
- When confirmed: auto-collapse, status "✅ Confirmed", summary "Barcelona · Jun 5–8"

**Step 3 — Preferences:**
- Always available, default collapsed
- Title: "③ Preferences · Optional"
- Status: "X questions" if polls exist, "Add one" if empty

### TripHome Changes
- In the `decisions` TabsContent, replace the direct `<VibeBoard>` + `<WhereWhenSection>` with `<DecisionsFlow>` passing through all needed props
- The VibeBoard and WhereWhenSection components render as children inside their respective StepSection — no internal changes

## Visual Design
- Step number: 28px teal circle with white number, left-aligned
- Status badges: small rounded pill — green for done/confirmed, muted for in-progress
- Chevron: `ChevronDown` with `rotate-0` → `rotate-[-90deg]` transition when collapsed
- Card: `bg-white rounded-xl border shadow-sm p-4`
- Active section: `border-primary border-[1.5px]`
- Locked section: slightly `opacity-70`
- Animation: `transition-all duration-300 ease-in-out` on the grid-rows wrapper

## No Database Changes Required
All data (myResponses, respondentCount, memberCount, hasConfirmed, leadingCombo) is already available from existing hooks.

