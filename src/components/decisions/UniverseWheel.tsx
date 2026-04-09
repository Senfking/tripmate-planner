import { useState, useRef, useEffect, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const SEGMENT_COLORS = [
  "hsl(174 40% 88%)",
  "hsl(174 30% 78%)",
  "hsl(200 20% 85%)",
  "hsl(174 25% 82%)",
  "hsl(210 15% 88%)",
  "hsl(174 35% 75%)",
  "hsl(195 20% 82%)",
  "hsl(174 20% 90%)",
];

const CONFETTI_COLORS = [
  "hsl(174 62% 47%)",
  "hsl(174 40% 65%)",
  "hsl(0 0% 100%)",
  "hsl(174 50% 80%)",
  "hsl(174 30% 55%)",
];

const SPIN_DURATION_MS = 4500;
const SPIN_EASING = "cubic-bezier(0.25, 0.1, 0.1, 1.0)";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: { id: string; label: string }[];
  onAccept: (optionId: string) => void;
};

export function UniverseWheel({ open, onOpenChange, options, onAccept }: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [winnerIdx, setWinnerIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLDivElement>(null);

  const segAngle = 360 / options.length;

  // Draw wheel
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || options.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    ctx.clearRect(0, 0, size, size);

    options.forEach((opt, i) => {
      const startAngle = (i * segAngle - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * segAngle - 90) * (Math.PI / 180);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + (endAngle - startAngle) / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "hsl(174 40% 25%)";
      ctx.font = `bold ${Math.max(10, Math.min(13, 160 / options.length))}px system-ui, sans-serif`;
      const label = opt.label.length > 14 ? opt.label.slice(0, 12) + "…" : opt.label;
      ctx.fillText(label, r - 12, 4);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.strokeStyle = "hsl(174 40% 80%)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [options, segAngle]);

  // Draw when canvas mounts or options change
  useEffect(() => {
    if (open) {
      // Small delay to ensure canvas is in DOM after drawer/dialog animation
      const t = setTimeout(() => drawWheel(), 50);
      return () => clearTimeout(t);
    }
  }, [open, drawWheel]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setWinnerIdx(Math.floor(Math.random() * options.length));
      // Reset wheel rotation without transition
      const el = wheelRef.current;
      if (el) {
        el.style.transition = "none";
        el.style.transform = "rotate(0deg)";
      }
    }
  }, [open, options.length]);

  const spin = () => {
    if (phase !== "idle" || options.length === 0) return;
    trackEvent("fortune_wheel_spun", { option_count: options.length });
    setPhase("spinning");

    // Random position within the winning segment (10%-90% through it)
    const segmentOffset = segAngle * (0.1 + Math.random() * 0.8);
    const targetAngleInSegment = winnerIdx * segAngle + segmentOffset;

    // 8-10 full spins ensure ~2.5s+ at full speed before the easing decelerates
    const fullSpins = 8 + Math.floor(Math.random() * 3);
    const targetRotation = fullSpins * 360 + (360 - targetAngleInSegment);

    // Apply rotation directly on the DOM element - no React re-render
    const el = wheelRef.current;
    if (el) {
      el.style.transition = `transform ${SPIN_DURATION_MS}ms ${SPIN_EASING}`;
      // Force reflow so the transition starts from the current (0) position
      el.getBoundingClientRect();
      el.style.transform = `rotate(${targetRotation}deg)`;
    }
  };

  // Listen for the CSS transition to end, then flip to "done"
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === "transform" && phase === "spinning") {
        setPhase("done");
      }
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, [phase]);

  const handleAccept = () => {
    trackEvent("fortune_wheel_accepted", { winner: options[winnerIdx]?.label });
    onAccept(options[winnerIdx].id);
    onOpenChange(false);
  };

  const content = (
    <div className="flex flex-col items-center px-2 pb-6">
      <p className="text-[17px] font-semibold text-center mb-4">
        {phase === "done" ? "✨ The Universe has spoken ✨" : "✨ The Universe is deciding..."}
      </p>

      {/* Wheel container */}
      <div className="relative w-[260px] h-[260px] mx-auto">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 text-[#0D9488] text-xl">
          ▼
        </div>
        <div ref={wheelRef} className="w-full h-full">
          <canvas
            ref={canvasRef}
            width={260}
            height={260}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Fixed-height result area - prevents layout shift */}
      <div style={{ minHeight: 130 }} className="w-full flex flex-col items-center justify-start mt-4">
        {phase === "idle" && (
          <button
            onClick={spin}
            className="text-sm font-medium text-[#0D9488] underline decoration-dotted underline-offset-4 hover:text-[#0D9488]/80 transition-colors"
          >
            Tap to spin ✨
          </button>
        )}

        {/* Reserve space during spin so container stays stable */}
        {phase === "spinning" && (
          <div style={{ visibility: "hidden" }} aria-hidden="true" className="text-center w-full">
            <p className="text-sm text-muted-foreground">The universe chose:</p>
            <p className="text-[20px] font-bold mt-1">&nbsp;</p>
            <div className="h-10 mt-4" />
          </div>
        )}

        {phase === "done" && (
          <div className="relative text-center w-full animate-fade-in-card">
            {/* Confetti */}
            <div ref={confettiRef} className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute rounded-full animate-confetti-burst"
                  style={{
                    width: `${6 + Math.random() * 4}px`,
                    height: `${6 + Math.random() * 4}px`,
                    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    left: `${50 + (Math.random() - 0.5) * 60}%`,
                    top: "50%",
                    animationDelay: `${Math.random() * 0.3}s`,
                    animationDuration: `${0.8 + Math.random() * 0.6}s`,
                  }}
                />
              ))}
            </div>

            <p className="text-sm text-muted-foreground">The universe chose:</p>
            <p className="text-[20px] font-bold text-[#0D9488] mt-1">
              {options[winnerIdx]?.label}
            </p>

            <Button
              onClick={handleAccept}
              className="w-full mt-4 bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
              style={{ background: "var(--gradient-primary, #0D9488)" }}
            >
              Accept the universe's wisdom 🙏
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="sr-only">Universe Wheel</DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="sr-only">Universe Wheel</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
