

# Seed "Carine's Wedding — Brazil May 2025" Test Trip

## Approach
Execute all data inserts via the database insert tool in sequence. No schema changes needed — all tables already exist.

## Execution Order

1. **Insert trip** — Create trip record with name, emoji 💍, dates May 22–31, settlement_currency EUR. `trip_code` auto-generates via trigger. Capture the generated trip ID.

2. **Insert trip_members** — Oliver (owner) + JuntoB (member) using their known user IDs.

3. **Insert trip_route_stops** (3 rows) — Rio May 22–27, Iguazu May 28–29, Florianópolis May 29–31. `route_locked` stays false.

4. **Insert trip_proposals** (4 rows) — Rio, Iguazu, Florianópolis, Buenos Aires with creators and notes per spec.

5. **Insert proposal_reactions** — Up/down votes for each proposal per spec.

6. **Insert proposal_date_options** (4 rows) — One date range per proposal.

7. **Insert date_option_votes** — Yes/no/maybe votes per user per date option.

8. **Insert polls** (3 rows) — Three preference polls, all status "open".

9. **Insert poll_options** (7 rows) — Options for each poll.

10. **Insert votes** — Cast votes where specified (Oliver on all 3 polls Q1+Q2, JuntoB on Q1 only).

11. **Insert itinerary_items** (~25 rows) — All 10 days of activities with correct dates, times, locations, statuses, and created_by.

12. **Insert attachments** (3 rows) — Hotel link, Iguazu tour link, Airbnb link.

13. **Insert expenses** (9 rows) — With correct amounts, currencies, categories, payers, dates.

14. **Insert expense_splits** (18 rows) — Equal splits between Oliver and JuntoB for each expense.

15. **Insert comment** (1 row) — "TEST DATA — remove before production" on the first itinerary item.

16. **Report back** — Show the new trip ID and auto-generated trip code.

## Technical Notes
- All inserts use service-role or direct psql to bypass RLS (since we're inserting on behalf of specific users)
- User IDs: Oliver = `1d5b21fe-f74c-429b-8d9d-938a4f295013`, JuntoB = `faa40b9a-a94d-43ba-8f6a-ad00855899b1`
- No UI or code changes
- Vibe board left empty (no vibe_responses)

