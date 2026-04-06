

## Plan: Proportional shared cost splitting for line items

### Files to change

1. **Migration SQL** — Add `is_shared` column to `expense_line_items`
2. **`src/hooks/useLineItemClaims.ts`** — Update `LineItemRow` interface to include `is_shared`; update `saveLineItems` to accept and persist `is_shared`; auto-detect shared items by name pattern
3. **`src/components/expenses/ItemSplitPanel.tsx`** — Add `is_shared` to `LineItem` interface; add toggle for shared flag on each item; hide member assignment avatars for shared items; show "Shared cost" badge; update `computeItemSplits` with proportional logic
4. **`src/components/expenses/LineItemClaimList.tsx`** — Split items into claimable vs shared sections; hide "Mine" button for shared items; show "split proportionally" label; update `perPersonTotals` calculation with proportional shared cost distribution
5. **`src/components/expenses/ExpenseFormModal.tsx`** — Pass `is_shared` through when creating line items; initialize `is_shared` from auto-detection on scan results

### Database change

```sql
ALTER TABLE public.expense_line_items
  ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
```

No new RLS policies needed — existing policies cover the column.

### Auto-detection logic

In `saveLineItems`, before inserting, check each item name against `/tax|vat|service.?charge|tip|gratuity|surcharge/i`. If matched, set `is_shared = true`.

### Creator toggle (ItemSplitPanel)

Each item row gets a small icon button (e.g. a "share" or "link" icon) that toggles `is_shared` on/off. Shared items show a distinct badge ("Shared cost") and hide member avatars since they can't be assigned.

### Updated calculation (both panels)

```
1. Separate items into claimable vs shared
2. For claimable items: claimed → split among claimants; unclaimed → split equally among all
3. Sum each person's claimable total → gives their "item subtotal"
4. Compute each person's proportion = their item subtotal / sum of all item subtotals
5. Distribute shared costs proportionally using those percentages
6. Final total = item subtotal + proportional share of shared costs
```

Edge case: if all items are shared (no claimable items), shared costs split equally among all members.

### Collaborative claiming view (LineItemClaimList)

- Render two sections: "Claim your items" (non-shared) and "Shared costs — split proportionally" (shared items, no Mine button, just display)
- Per-person summary includes the proportional shared cost breakdown

