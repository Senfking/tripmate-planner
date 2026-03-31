import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  peeking?: boolean;
  onPeekTap?: () => void;
  onDismiss: () => void;
  onRespond: (status: string) => void;
  isPending: boolean;
}

const STATUS_ORDER: Record<string, number> = {
  going: 0, maybe: 1, pending: 2, not_going: 3,
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  going: { label: "Going ✓", className: "bg-[#0D9488]/10 text-[#0D9488]" },
  maybe: { label: "Maybe", className: "bg-amber-100 text-amber-700" },
  not_going: { label: "Can't make it", className: "bg-muted text-muted-foreground" },
  pending: { label: "Invited", className: "bg-muted text-muted-foreground" },
};

const PEEKING_MESSAGES = [
  "We both know your weekend is free, just say yes",
  "Still pretending you have plans? Cute",
  "FOMO is already winning, just admit it loser",
  "The group chat is side-eyeing you hard rn",
  "Your plants have more of a social life than you",
  "Say yes or we're replacing you with someone fun",
];

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  peeking,
  onPeekTap,
  onDismiss,
  onRespond,
  isPending,
}: AttendanceInviteOverlayProps) {
  const [successState, setSuccessState] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [closing, setClosing] = useState(false);

  // Rotating messages
  const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * PEEKING_MESSAGES.length));
  const [messageFade, setMessageFade] = useState(1);

  useEffect(() => {
    if (!peeking || open) return;
    const interval = setInterval(() => {
      setMessageFade(0);
      setTimeout(() => {
        setMessageIndex((i) => (i + 1) % PEEKING_MESSAGES.length);
        setMessageFade(1);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, [peeking, open]);

  // Reset success state when opening
  useEffect(() => {
    if (open) {
      setSuccessState(false);
      setShowConfetti(false);
      setClosing(false);
    }
  }, [open]);

  const isVisible = open || peeking || closing;
  if (!isVisible) return null;

  const sortedMembers = [...members]
    .sort((a, b) => {
      // Current user always first
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      return (STATUS_ORDER[a.attendance_status] ?? 9) - (STATUS_ORDER[b.attendance_status] ?? 9);
    });

  const dateStr = formatDateRange(startDate, endDate);

  const handleDismiss = () => {
    onDismiss();
  };

  const handleRespond = (status: string) => {
    onRespond(status);

    if (status === "going") {
      setShowConfetti(true);
      setTimeout(() => setSuccessState(true), 400);
      setTimeout(() => setClosing(true), 1900);
      setTimeout(() => {
        setClosing(false);
        setSuccessState(false);
        setShowConfetti(false);
        onDismiss();
      }, 2350);
    } else {
      handleDismiss();
    }
  };

  // The sheet is always rendered at full height.
  // When "peeking", we translate it down so only the top strip is visible.
  // When "open", translateY(0) shows the full sheet.
  const isFull = open || closing;

  // Peeking shows: message banner (44px) + avatar row (52px) = 96px visible above bottom nav
  const peekHeight = 96;
  const peekTranslate = `calc(100% - ${peekHeight}px)`;

  const goingMembers = members.filter(
    (m) => m.attendance_status === "going" || m.attendance_status === "maybe"
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[59] bg-black/50"
        style={{
          opacity: isFull && !closing ? 1 : 0,
          pointerEvents: isFull && !closing ? "auto" : "none",
          transition: "opacity 0.45s ease",
        }}
        onClick={isFull && !closing ? handleDismiss : undefined}
      />

      {/* Single full-height sheet — translated when peeking */}
      <div
        className="fixed inset-0 z-[60] flex flex-col"
        style={{
          transform: isFull ? "translateY(0)" : `translateY(${peekTranslate})`,
          transition: "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: isFull ? "auto" : "none",
        }}
      >
        {/* Peeking top strip — message + avatars */}
        <div
          className={cn(
            "shrink-0 rounded-t-2xl overflow-hidden",
            !isFull && "animate-peek-bounce cursor-pointer"
          )}
          style={{
            background: "linear-gradient(135deg, #0D9488, #0369a1)",
            boxShadow: !isFull ? "0 -4px 20px rgba(13,148,136,0.3)" : "none",
            pointerEvents: "auto",
          }}
          onClick={!isFull ? (e) => { e.stopPropagation(); onPeekTap?.(); } : undefined}
        >
          {/* Message row */}
          <div className="flex items-center justify-center px-4 text-[13px] font-semibold text-white" style={{ height: 44 }}>
            <span style={{ opacity: messageFade, transition: "opacity 0.3s ease" }}>
              👀&nbsp; {PEEKING_MESSAGES[messageIndex]}
            </span>
          </div>
          {/* Avatar row — visible when peeking, collapses when full */}
          <div
            className="flex items-center gap-2 px-4 overflow-hidden"
            style={{
              maxHeight: isFull ? 0 : 52,
              paddingTop: isFull ? 0 : 4,
              paddingBottom: isFull ? 0 : 10,
              opacity: isFull ? 0 : 1,
              transition: "max-height 0.4s cubic-bezier(0.32, 0.72, 0, 1), padding 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease",
            }}
          >
            <div className="flex items-center -space-x-1.5">
              {goingMembers.slice(0, 6).map((m) => (
                <Avatar key={m.user_id} className="h-8 w-8 ring-2 ring-white/30">
                  {m.profile?.avatar_url && (
                    <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                  )}
                  <AvatarFallback className="bg-white/20 text-white text-[10px] font-medium">
                    {getInitial(m.profile?.display_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {goingMembers.length > 0 && (
              <span className="text-[12px] text-white/80 font-medium">
                {goingMembers.length} going
              </span>
            )}
          </div>
        </div>

        {/* Full overlay body — hero + content */}
        <div className="flex-1 flex flex-col bg-card overflow-hidden">
          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:text-white transition-colors"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 44px + 12px)",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Hero */}
          <div className="relative w-full" style={{ minHeight: "45%" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary" />
            <img src={coverPhoto} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)" }}
            />
            <div className="absolute bottom-6 left-5 right-5">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-white/70">
                You're invited to join
              </p>
              <h1 className="text-[26px] font-bold text-white leading-tight mt-1">{tripName}</h1>
              {dateStr && <p className="text-[13px] text-white/70 mt-1">{dateStr}</p>}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 rounded-t-3xl -mt-4 relative bg-card px-5 pt-5 pb-8 overflow-y-auto">
            {successState ? (
              <div className="flex flex-col items-center justify-center py-16 animate-success-fade-in">
                {showConfetti && (
                  <div className="confetti-burst">
                    {[...Array(8)].map((_, i) => (
                      <span key={i} className={`confetti-dot confetti-dot-${i}`} />
                    ))}
                  </div>
                )}
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0D9488]/10">
                  <Check className="h-8 w-8 text-[#0D9488]" />
                </div>
                <p className="mt-4 text-xl font-bold text-foreground">You're in! 🎉</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Who's joining
                </p>
                <div className="space-y-1 mb-6">
                  {sortedMembers.map((m) => {
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
                          {m.user_id === currentUserId && <span className="text-muted-foreground font-normal"> (You)</span>}
                        </span>
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", badge.className)}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                  {sortedMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">You're the first one here!</p>
                  )}
                </div>

                <div className="space-y-2 mt-auto">
                  <button
                    onClick={() => handleRespond("going")}
                    disabled={isPending}
                    className="w-full rounded-2xl text-[16px] font-bold text-white transition-colors active:scale-[0.97]"
                    style={{ background: "#0D9488", height: 52 }}
                  >
                    ✈️  I'm going!
                  </button>
                  <button
                    onClick={() => handleRespond("maybe")}
                    disabled={isPending}
                    className="w-full rounded-2xl text-[15px] font-semibold transition-colors active:scale-[0.97]"
                    style={{ height: 48, border: "2px solid #0D9488", color: "#0D9488", background: "transparent" }}
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
    </>
  );
}
