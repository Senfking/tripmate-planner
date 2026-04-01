import { useState, useRef, useEffect, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";

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
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setRotation(0);
      // Pre-select winner
      const idx = Math.floor(Math.random() * options.length);
      setWinnerIdx(idx);
    }
  }, [open, options.length]);

  const spin = () => {
    if (phase !== "idle" || options.length === 0) return;
    setPhase("spinning");

    // Calculate target rotation so pointer (top) lands on winner segment
    // Pointer is at top (0°/360°). Segment i occupies [i*segAngle, (i+1)*segAngle] from -90° offset
    // We rotate clockwise. To land on segment winnerIdx, the middle of that segment needs to be at top.
    const segMiddle = winnerIdx * segAngle + segAngle / 2;
    // We want (rotation mod 360) such that the segment is at top (0° = top)
    // Since CSS rotates the wheel and pointer is at top, we need rotation = -(segMiddle) + full spins
    const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full spins
    const targetRotation = fullSpins * 360 + (360 - segMiddle);
    setRotation(targetRotation);

    setTimeout(() => {
      setPhase("done");
    }, 3200);
  };

  const handleAccept = () => {
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
        <div
          className="w-full h-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: phase === "spinning"
              ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
              : "none",
          }}
        >
          <canvas
            ref={canvasRef}
            width={260}
            height={260}
            className="w-full h-full"
          />
        </div>
      </div>

      {phase === "idle" && (
        <button
          onClick={spin}
          className="mt-4 text-sm font-medium text-[#0D9488] underline decoration-dotted underline-offset-4 hover:text-[#0D9488]/80 transition-colors"
        >
          Tap to spin ✨
        </button>
      )}

      {phase === "done" && (
        <div className="relative mt-4 text-center w-full">
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
