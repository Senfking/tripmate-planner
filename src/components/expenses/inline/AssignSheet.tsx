import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { MemberProfile } from "@/hooks/useExpenses";
import { ClaimRow } from "@/hooks/useLineItemClaims";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function claimQty(c: ClaimRow): number {
  return typeof c.claimed_quantity === "number" ? c.claimed_quantity : 1;
}
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Order members so current user is first, labeled (You). */
function sortMembers(members: MemberProfile[], currentUserId?: string) {
  const me = members.filter((m) => m.userId === currentUserId);
  const others = members.filter((m) => m.userId !== currentUserId);
  return [...me, ...others];
}

/** Friendly fallback when RLS blocks an assignment for another user. */
function isPermissionError(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("permission") || e?.code === "42501";
}

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemQuantity: number;
  members: MemberProfile[];
  claims: ClaimRow[];
  currentUserId?: string;
}

interface SingleProps extends BaseProps {
  mode: "single";
  /** Toggle (insert/delete) a claim for a given user. */
  onToggleForUser: (userId: string) => Promise<void>;
}

interface MultiProps extends BaseProps {
  mode: "multi";
  /** Set claim quantity for a given user (0 removes). */
  onSetQuantityForUser: (userId: string, quantity: number) => Promise<void>;
}

export function AssignSheet(props: SingleProps | MultiProps) {
  const { open, onOpenChange, itemName, members, currentUserId } = props;
  const ordered = sortMembers(members, currentUserId);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[60vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="text-base">
            {props.mode === "single" ? "Who had this?" : "Split this item"}
          </DrawerTitle>
          <p className="text-xs text-muted-foreground truncate">{itemName}</p>
        </DrawerHeader>

        <div className="overflow-y-auto px-2 pb-2">
          <ul className="divide-y divide-border/60">
            {ordered.map((m) => (
              <li key={m.userId}>
                {props.mode === "single" ? (
                  <SingleRow
                    member={m}
                    isMe={m.userId === currentUserId}
                    isClaimed={props.claims.some((c) => c.user_id === m.userId)}
                    onToggle={() => props.onToggleForUser(m.userId)}
                  />
                ) : (
                  <MultiRow
                    member={m}
                    isMe={m.userId === currentUserId}
                    serverQty={
                      props.claims.find((c) => c.user_id === m.userId)
                        ? claimQty(props.claims.find((c) => c.user_id === m.userId)!)
                        : 0
                    }
                    itemQuantity={props.itemQuantity}
                    totalClaimedExcludingMember={props.claims
                      .filter((c) => c.user_id !== m.userId)
                      .reduce((s, c) => s + claimQty(c), 0)}
                    onCommit={(qty) => props.onSetQuantityForUser(m.userId, qty)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        {props.mode === "multi" && (
          <MultiFooter claims={props.claims} itemQuantity={props.itemQuantity} />
        )}
      </DrawerContent>
    </Drawer>
  );
}

/* ──────── Single-quantity row: avatar + name + checkbox ──────── */

function SingleRow({
  member, isMe, isClaimed, onToggle,
}: {
  member: MemberProfile;
  isMe: boolean;
  isClaimed: boolean;
  onToggle: () => Promise<void>;
}) {
  const [optimistic, setOptimistic] = useState(isClaimed);
  const [busy, setBusy] = useState(false);

  // Sync if external state changes & no in-flight toggle
  useEffect(() => { if (!busy) setOptimistic(isClaimed); }, [isClaimed, busy]);

  const handleClick = async () => {
    const prev = optimistic;
    setOptimistic(!prev);
    setBusy(true);
    try {
      await onToggle();
    } catch (e: any) {
      setOptimistic(prev);
      if (!isMe && isPermissionError(e)) {
        toast.error("Can't assign for others — ask them to claim it themselves");
      } else {
        toast.error(friendlyErrorMessage(e, "Couldn't update"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex items-center gap-3 w-full py-3 px-2 min-h-[44px] hover:bg-muted/40 rounded-md transition-colors text-left"
    >
      <Avatar className="h-8 w-8 shrink-0">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
          {getInitials(member.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm truncate">
        {member.displayName}{isMe ? " (You)" : ""}
      </span>
      <Checkbox
        checked={optimistic}
        // The button parent handles toggling; checkbox is purely visual.
        onCheckedChange={() => { /* parent handles */ }}
        className="pointer-events-none"
      />
    </button>
  );
}

/* ──────── Multi-quantity row: avatar + name + per-member stepper ──────── */

function MultiRow({
  member, isMe, serverQty, itemQuantity, totalClaimedExcludingMember, onCommit,
}: {
  member: MemberProfile;
  isMe: boolean;
  serverQty: number;
  itemQuantity: number;
  totalClaimedExcludingMember: number;
  onCommit: (qty: number) => Promise<void>;
}) {
  const [localQty, setLocalQty] = useState(serverQty);
  const lastConfirmedRef = useRef(serverQty);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!pendingRef.current && timerRef.current === null) {
      setLocalQty(serverQty);
      lastConfirmedRef.current = serverQty;
    }
  }, [serverQty]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const maxForMember = Math.max(0, itemQuantity - totalClaimedExcludingMember);

  const scheduleCommit = useCallback((next: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      pendingRef.current = true;
      try {
        await onCommit(next);
        lastConfirmedRef.current = next;
      } catch (e: any) {
        setLocalQty(lastConfirmedRef.current);
        if (!isMe && isPermissionError(e)) {
          toast.error("Can't assign for others — ask them to claim it themselves");
        } else {
          toast.error(friendlyErrorMessage(e, "Couldn't update claim"));
        }
      } finally {
        pendingRef.current = false;
      }
    }, 500);
  }, [onCommit, isMe]);

  const bump = (delta: number) => {
    setLocalQty((curr) => {
      const next = Math.max(0, Math.min(maxForMember, curr + delta));
      if (next === curr) return curr;
      scheduleCommit(next);
      return next;
    });
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-2 min-h-[48px]">
      <Avatar className="h-8 w-8 shrink-0">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
          {getInitials(member.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm truncate">
        {member.displayName}{isMe ? " (You)" : ""}
      </span>
      <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
        <button
          type="button"
          disabled={localQty <= 0}
          onClick={() => bump(-1)}
          aria-label={`Decrease for ${member.displayName}`}
          className={cn(
            "h-9 w-10 flex items-center justify-center transition-colors",
            localQty <= 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80",
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className={cn(
          "h-9 w-9 flex items-center justify-center text-[13px] font-semibold tabular-nums border-x border-border bg-background",
          localQty > 0 ? "text-primary" : "text-muted-foreground",
        )}>{localQty}</span>
        <button
          type="button"
          disabled={localQty >= maxForMember}
          onClick={() => bump(1)}
          aria-label={`Increase for ${member.displayName}`}
          className={cn(
            "h-9 w-10 flex items-center justify-center transition-colors",
            localQty >= maxForMember ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function MultiFooter({ claims, itemQuantity }: { claims: ClaimRow[]; itemQuantity: number }) {
  const total = claims.reduce((s, c) => s + claimQty(c), 0);
  return (
    <div className="border-t border-border px-4 py-3 text-center">
      <p className="text-xs font-medium text-muted-foreground tabular-nums">
        {total} of {itemQuantity} assigned
      </p>
    </div>
  );
}
