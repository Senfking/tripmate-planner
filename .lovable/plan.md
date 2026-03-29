

## Plan: Implement Expenses Tab

### Database Migration

- Add `category` (text, default `'other'`) to `expenses`
- Add `itinerary_item_id` (uuid, nullable, references itinerary_items) to `expenses`
- Add `settlement_currency` (text, default `'EUR'`) to `trips`

### Files to Create

1. **`src/lib/settlementCalc.ts`** — Pure functions: `calcNetBalances`, `calcSettlements` (greedy algorithm), currency conversion helper

2. **`src/hooks/useExpenses.ts`** — Data hook
   - Fetch expenses + splits for trip
   - Fetch trip members with profiles
   - CRUD: addExpense (insert expense + splits), updateExpense, deleteExpense
   - Exchange rates from Frankfurter API, cached with long staleTime
   - Settlement currency read from trip row; update mutation — **any trip member** can change it (no owner/admin check)

3. **`src/components/expenses/SettlementCurrencyPicker.tsx`** — Compact "Settle in: EUR ▾" popover
   - Common currencies (EUR, USD, GBP, CHF, THB, JPY, AUD, SGD) + custom text input
   - **Any trip member** can change — no role restriction
   - Updates `trips.settlement_currency`

4. **`src/components/expenses/ExpenseFormModal.tsx`** — Drawer on mobile, dialog on desktop
   - Title, Amount, Currency (common + custom), Category select, Date picker
   - Paid by (member dropdown, default current user)
   - Split between (member checkboxes, default all), Equal/Custom toggle
   - Link to itinerary item (optional, grouped by day)
   - Notes
   - On save: insert expense + expense_splits

5. **`src/components/expenses/ExpenseCard.tsx`** — Expandable card
   - Category icon (Lucide) + title, dual currency display, paid by, date, category badge, itinerary link badge
   - Expand: split breakdown per member, Edit/Delete buttons
   - Any member can edit/delete own expenses; owner/admin can edit/delete any

6. **`src/components/expenses/BalancesSummary.tsx`** — Pinned at top
   - Section 1: Net balances per member (green/red/grey), current user first with "You" badge
   - Section 2: Settle-up transactions via greedy algorithm

7. **`src/components/expenses/ExpensesTab.tsx`** — Main tab
   - Settlement currency picker, Balances summary, Add expense button, Expense list (date desc)
   - Exchange rate warning banner if fetch fails

### Files to Modify

8. **`src/pages/TripHome.tsx`** — Render `ExpensesTab` instead of placeholder, pass `tripId`

### Key Details

- Exchange rates: `useQuery` to `api.frankfurter.app/latest?base={settlementCurrency}`, fallback 1:1 with warning
- Mobile: drawers per memory preference
- Categories: Food & Drink, Transport, Accommodation, Activities, Shopping, Other — each with Lucide icon
- Currency formatting: `Intl.NumberFormat`
- Settlement currency picker: **no role restriction** — any authenticated trip member can update (it's a display preference)
- RLS on `trips` already allows any member to update, so no policy changes needed

