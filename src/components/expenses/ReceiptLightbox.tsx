import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ZoomIn, ZoomOut } from "lucide-react";
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

  useEffect(() => {
    if (open) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [open]);

  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDistance.current = getDistance(e.touches[0], e.touches[1]);
      lastCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistance.current != null) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const ratio = dist / lastDistance.current;
      setScale((s) => Math.min(5, Math.max(0.5, s * ratio)));
      lastDistance.current = dist;

      if (lastCenter.current) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setTranslate((t) => ({
          x: t.x + (cx - lastCenter.current!.x),
          y: t.y + (cy - lastCenter.current!.y),
        }));
        lastCenter.current = { x: cx, y: cy };
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastDistance.current = null;
    lastCenter.current = null;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] max-h-[100dvh] w-screen h-[100dvh] p-0 border-none bg-black/95 [&>button]:hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setScale((s) => Math.min(5, s * 1.5))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Image container */}
        <div
          ref={containerRef}
          className="flex items-center justify-center w-full h-full overflow-hidden touch-none"
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
        >
          <img
            src={imageUrl}
            alt="Receipt"
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: lastDistance.current != null ? "none" : "transform 0.2s ease",
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
