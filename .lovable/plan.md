

## Updated Plan: Show "All settled ✓" When No Settlements

### Change

**`src/components/expenses/ExpensesTab.tsx`** — one edit in the Settle Up section area (lines 92–97):

- Remove the conditional hiding of `SettleUpSection` when `settlements.length === 0`
- Always render the Settle Up section header
- When `settlements.length === 0`: show a static card with the section title and "All settled ✓" in green text (using `CheckCircle2` icon), with no expandable content
- When `settlements.length > 0`: render the existing `SettleUpSection` as-is with a count badge

This will be incorporated into the collapsible sections work from the approved plan — the "all settled" state becomes the permanent visible state of a non-collapsible header when there are zero settlements.

**`src/components/expenses/SettleUpSection.tsx`** — no changes needed (the `settlements.length === 0` early return can stay since the parent will handle the empty case before rendering this component).

### What it looks like

```text
┌─────────────────────────────────────────┐
│  Settle Up    All settled ✓             │
└─────────────────────────────────────────┘
```

- "All settled ✓" in green (`text-emerald-600`) with a small check icon
- No collapsible trigger or content when empty — just the header row

