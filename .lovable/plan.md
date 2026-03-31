

# Updated Plan Detail: Not-Going Member Opacity

**Change to Part 1 (AttendanceInviteOverlay) — Member Roster rendering:**

Members with `attendance_status === 'not_going'` should render their entire row at `opacity-50`. This applies to the avatar, display name, and status badge together.

Implementation: wrap each member row in a container and conditionally apply `opacity-50` when status is `not_going`.

```tsx
<div className={cn("flex items-center gap-3 py-2", m.attendance_status === "not_going" && "opacity-50")}>
```

Same treatment applies to the avatar row in the **Global Decisions attendance card** (Part 4) — but since that only shows "going" members, no change needed there.

No other changes to the previously approved plan.

