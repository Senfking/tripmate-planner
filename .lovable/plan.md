

# Grey out non-adopted proposals

## Change: `ProposalCard.tsx` only

Add a `hasAdopted` prop. When `hasAdopted` is true and `proposal.adopted` is false, the card gets:
- `opacity-50` wrapper styling
- A small muted label: "Another plan was adopted" (below the creator line)
- Reaction buttons disabled
- Adopt button already hidden (existing logic handles this)

Pass `hasAdopted` from `WhereWhenSection.tsx` — already computed there as `const hasAdopted = proposals.some(p => p.adopted)`.

## Files changed

| File | Change |
|------|--------|
| `src/components/decisions/ProposalCard.tsx` | Add `hasAdopted` prop; apply greyed-out styling + label for non-adopted cards when another is adopted |
| `src/components/decisions/WhereWhenSection.tsx` | Pass `hasAdopted` prop to each `ProposalCard` |

