import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MemberInfo {
  user_id: string;
  attendance_status: string;
  profile?: {
    display_name: string | null;
    avatar_url?: string | null;
  };
}

interface AttendanceInviteOverlayProps {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  startDate: string | null;
  endDate: string | null;
  coverPhoto: string;
  members: MemberInfo[];
  currentUserId: string;
  open: boolean;
  onDismiss: () => void;
  onRespond: (status: string) => void;
  isPending: boolean;
}

const STATUS_ORDER: Record<string, number> = {
  going: 0,
  maybe: 1,
  pending: 2,
  not_going: 3,
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  going: { label: "Going ✓", className: "bg-[#0D9488]/10 text-[#0D9488]" },
  maybe: { label: "Maybe", className: "bg-amber-100 text-amber-700" },
  not_going: { label: "Can't make it", className: "bg-muted text-muted-foreground" },
  pending: { label: "Invited", className: "bg-muted text-muted-foreground" },
};

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const fmt = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

export function AttendanceInviteOverlay({
  tripId,
  tripName,
  tripEmoji,
  startDate,
  endDate,
  coverPhoto,
  members,
  currentUserId,
  open,
  onDismiss,
  onRespond,
  isPending,
}: AttendanceInviteOverlayProps) {
  const [successState, setSuccessState] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [closing, setClosing] = useState(false);

  // Reset states when overlay opens
  useEffect(() => {
    if (open) {
      setSuccessState(false);
      setShowConfetti(false);
      setClosing(false);
    }
  }, [open]);

  if (!open && !closing) return null;

  const otherMembers = members
    .filter((m) => m.user_id !== currentUserId)
    .sort((a, b) => (STATUS_ORDER[a.attendance_status] ?? 9) - (STATUS_ORDER[b.attendance_status] ?? 9));

  const dateStr = formatDateRange(startDate, endDate);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onDismiss();
    }, 350);
  };

  const handleRespond = (status: string) => {
    onRespond(status);

    if (status === "going") {
      setShowConfetti(true);
      setSuccessState(true);
      setTimeout(() => {
        setClosing(true);
        setTimeout(() => {
          setClosing(false);
          setSuccessState(false);
          setShowConfetti(false);
        }, 350);
      }, 1200);
    } else {
      handleClose();
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex flex-col bg-black/50",
        closing ? "animate-overlay-out" : "animate-overlay-in"
      )}
    >
      <div
        className={cn(
          "relative flex flex-col flex-1 bg-card overflow-hidden",
          closing ? "animate-sheet-down" : "animate-sheet-up"
        )}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:text-white transition-colors"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* ─── HERO SECTION ─── */}
        <div className="relative w-full" style={{ minHeight: "45%" }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary" />
          <img
            src={coverPhoto}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Scrim */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)",
            }}
          />
          {/* Text overlay */}
          <div className="absolute bottom-6 left-5 right-5">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-white/70">
              You're invited to join
            </p>
            <h1 className="text-[26px] font-bold text-white leading-tight mt-1">{tripName}</h1>
            {dateStr && (
              <p className="text-[13px] text-white/70 mt-1">{dateStr}</p>
            )}
          </div>
        </div>

        {/* ─── CONTENT SECTION ─── */}
        <div className="flex-1 rounded-t-3xl -mt-4 relative bg-card px-5 pt-5 pb-8 overflow-y-auto">
          {successState ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center py-16">
              {showConfetti && <div className="confetti-burst" />}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0D9488]/10">
                <Check className="h-8 w-8 text-[#0D9488]" />
              </div>
              <p className="mt-4 text-xl font-bold text-foreground">You're in! 🎉</p>
            </div>
          ) : (
            <>
              {/* Who's joining */}
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Who's joining
              </p>
              <div className="space-y-1 mb-6">
                {otherMembers.map((m) => {
                  const badge = STATUS_BADGES[m.attendance_status] ?? STATUS_BADGES.pending;
                  return (
                    <div
                      key={m.user_id}
                      className={cn(
                        "flex items-center gap-3 py-2",
                        m.attendance_status === "not_going" && "opacity-50"
                      )}
                    >
                      <Avatar className="h-9 w-9">
                        {m.profile?.avatar_url && (
                          <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {getInitial(m.profile?.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-[14px] font-medium text-foreground truncate">
                        {m.profile?.display_name || "Member"}
                      </span>
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
                {otherMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">You're the first one here!</p>
                )}
              </div>

              {/* Response buttons */}
              <div className="space-y-2 mt-auto">
                <button
                  onClick={() => handleRespond("going")}
                  disabled={isPending}
                  className="w-full h-13 rounded-2xl text-[16px] font-bold text-white transition-colors active:scale-[0.97]"
                  style={{ background: "#0D9488", height: 52 }}
                >
                  ✈️  I'm going!
                </button>
                <button
                  onClick={() => handleRespond("maybe")}
                  disabled={isPending}
                  className="w-full rounded-2xl text-[15px] font-semibold transition-colors active:scale-[0.97]"
                  style={{
                    height: 48,
                    border: "2px solid #0D9488",
                    color: "#0D9488",
                    background: "transparent",
                  }}
                >
                  🤔  Maybe
                </button>
                <button
                  onClick={() => handleRespond("not_going")}
                  disabled={isPending}
                  className="w-full rounded-xl text-[14px] text-muted-foreground border border-muted transition-colors active:scale-[0.97]"
                  style={{ height: 44 }}
                >
                  ✗  Can't make it
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
