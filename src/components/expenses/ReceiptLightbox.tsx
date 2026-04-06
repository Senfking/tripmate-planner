import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
}

export function ReceiptLightbox({ open, onOpenChange, imageUrl }: Props) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastDistance = useRef<number | null>(null);
  const lastCenter = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isPinching = useRef(false);

  useEffect(() => {
    if (open) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      isPinching.current = false;
      lastDistance.current = null;
      lastCenter.current = null;
      dragStart.current = null;
    }
  }, [open]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const clampScale = (s: number) => Math.min(5, Math.max(1, s));

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      lastDistance.current = getDistance(e.touches[0], e.touches[1]);
      lastCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistance.current != null && lastCenter.current != null) {
      e.preventDefault();
      isPinching.current = true;
      const dist = getDistance(e.touches[0], e.touches[1]);
      const ratio = dist / lastDistance.current;
      setScale((s) => clampScale(s * ratio));
      lastDistance.current = dist;

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const lc = lastCenter.current;
      setTranslate((t) => ({
        x: t.x + (cx - lc.x),
        y: t.y + (cy - lc.y),
      }));
      lastCenter.current = { x: cx, y: cy };
    } else if (e.touches.length === 1 && dragStart.current && scale > 1 && !isPinching.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
    }
  }, [scale]);

  const handleTouchEnd = useCallback(() => {
    lastDistance.current = null;
    lastCenter.current = null;
    dragStart.current = null;
    // Delay clearing pinch flag so single-touch doesn't fire immediately after
    setTimeout(() => { isPinching.current = false; }, 100);
    // Snap back if scale ended below 1
    setScale((s) => {
      if (s <= 1) {
        setTranslate({ x: 0, y: 0 });
        return 1;
      }
      return s;
    });
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95"
            onClick={() => setScale((s) => clampScale(s * 1.5))}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95"
            onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden touch-none min-h-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={() => {
          if (scale > 1) {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
          } else {
            setScale(2.5);
          }
        }}
        onClick={(e) => {
          if (e.target === containerRef.current) onOpenChange(false);
        }}
      >
        <img
          src={imageUrl}
          alt="Receipt"
          className="w-full h-auto max-h-full object-contain select-none pointer-events-none"
          draggable={false}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isPinching.current ? "none" : "transform 0.2s ease",
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );
}
