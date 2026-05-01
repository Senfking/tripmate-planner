## 1. Shrink placeholder text only

The user means the gray sample text inside empty inputs/textareas — not the typed value. Tailwind exposes a `placeholder:` variant for this.

Add to both shadcn primitives:

- `src/components/ui/textarea.tsx` base classes → add `placeholder:text-[12px] placeholder:leading-snug`
- `src/components/ui/input.tsx` base classes → add `placeholder:text-[12px]`

This shrinks the example text (e.g. "e.g. no tourist traps, no early mornings…") without changing what the user types. The typed-value font size stays at the current 14px. The `sm` variant already overrides placeholder size and stays as-is.

This applies app-wide automatically — every textarea and input across trip builder, expenses, bookings, comments, etc.

## 2. Move "describe your trip" into the hero

Today the hero is a small centered title + subtitle, and "Or describe your trip in your own words" is a buried collapsible at the bottom. Promote it.

New hero structure (replaces lines ~143-154):

```text
┌──────────────────────────────────────┐
│   [Junto AI badge]                   │
│                                      │
│   Plan your trip                     │  (display heading)
│   Tell us where, or describe your    │  (subtitle, slightly bigger)
│   dream trip in your own words       │
│                                      │
│   ┌────────────────────────────────┐ │
│   │ Describe your dream trip…      │ │  (free-text textarea, 3 rows)
│   │ (e.g. "10 days in Japan with   │ │  inline, always visible
│   │  my partner, food + temples,   │ │
│   │  no early mornings")           │ │
│   └────────────────────────────────┘ │
│       Skip the form below if you do  │  (helper, when filled)
└──────────────────────────────────────┘
```

Visual treatment:
- Hero gets a soft gradient background (`bg-gradient-to-b from-primary/5 to-transparent`) + rounded card feel, so it reads as one cohesive block instead of bare text
- "Plan your trip" title stays bold but slightly smaller to make room
- The free-text textarea sits inside the hero, full width, with subtle border and warm focus ring
- Below the hero, a small divider with text: "Or build it step by step ↓"
- The required card (destination/dates) and quick picks follow as today
- The old "Or describe your trip in your own words" collapsible at the bottom is **removed** (it's now in the hero)
- The `freeText` state and `onGenerate` payload stay identical — only the UI moves

When `freeText` has content, show the helper "We'll prioritize this over the chips below" right under the textarea.

## 3. Unify the remaining optional headings

Only one collapsible remains at the bottom now: "What DON'T you want? (optional)". Rename to **"Anything to avoid? (optional)"** — matches the conversational voice of the new hero copy. Trigger styling stays consistent with existing patterns.

## Files

- `src/components/ui/textarea.tsx` — add `placeholder:text-[12px] placeholder:leading-snug` to base
- `src/components/ui/input.tsx` — add `placeholder:text-[12px]` to base
- `src/components/trip-builder/PremiumTripInput.tsx` — redesign hero with embedded free-text textarea + gradient background; remove the bottom free-text collapsible; rename remaining collapsible to "Anything to avoid?"
