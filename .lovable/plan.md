

# Updated Plan: Add Empty State to Where & When Section

## Addition to existing plan

In `WhereWhenSection.tsx`, when the sorted proposals list is empty, render a centered empty state instead of the destination cards:

- Muted text: "No plans suggested yet. Be the first to suggest a destination! 🌍"
- The "+ Suggest a destination" button centered below it
- Wrapped in a `text-center py-8` container for spacing

This replaces the current "No suggestions yet — be the first!" text with a more prominent, centered layout that includes the action button inline.

No other changes to the approved plan — everything else (database, cards, banner, confirm flow, permissions, preferences) remains as specified.

## File impact

| File | Change |
|------|--------|
| `src/components/decisions/WhereWhenSection.tsx` | Add empty state block when `proposals.length === 0` with centered text + suggest button |

