
Goal: fix invite links so they stop resolving to the editor/private preview and only generate a truly shareable app URL.

What I found
- `src/components/InviteModal.tsx` already uses `window.location.origin`.
- In the editor/preview environment, that is not a reliable public app URL.
- This project is currently not published (`published_url: null`), so incognito users are being sent through Lovable login for the private preview. That means the current problem is not the token logic — it is the base URL/deployment context.

Files I will change
- `src/components/InviteModal.tsx`
- `src/lib/appUrl.ts` (new)

Plan
1. Add a small `getShareableAppOrigin()` helper to centralize invite-link base URL logic.
2. In that helper, detect when the app is running inside the editor/private preview and avoid using that origin as a share link.
3. Update `InviteModal.tsx` to build invite links via the helper instead of raw `window.location.origin`.
4. If there is no real public app URL available, prevent generating a misleading link and show a friendly message that invite links require a published/public app URL to work in incognito.
5. Keep all existing invite behavior unchanged otherwise: same modal, same token generation, same DB insert, same redemption flow, same styling.

Technical notes
- No database or auth-flow changes are needed.
- The real issue is that private preview links are not publicly accessible, so even a “correct” preview URL will still send incognito users to a login gate.
- This fix will stop the app from producing broken share links and make the behavior match the actual deployment state.
