import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { X, Check, ZoomIn } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface CoverCropOverlayProps {
  imageSrc: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function CoverCropOverlay({ imageSrc, onSave, onCancel, saving }: CoverCropOverlayProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    await new Promise((resolve) => { img.onload = resolve; });

    // Output at hero aspect ratio (roughly 16:7 at 220px height)
    const outputW = Math.min(1200, croppedAreaPixels.width);
    const outputH = Math.round(outputW * (220 / 390)); // match hero ratio
    canvas.width = outputW;
    canvas.height = outputH;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0, 0, outputW, outputH,
    );

    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/jpeg", 0.9);
  }, [croppedAreaPixels, imageSrc, onSave]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <button onClick={onCancel} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
          <X className="h-4 w-4 text-white" />
        </button>
        <span className="text-white text-sm font-medium">Adjust cover photo</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary disabled:opacity-50"
        >
          <Check className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={390 / 220}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={false}
          style={{
            containerStyle: { background: "#000" },
            cropAreaStyle: { border: "2px solid rgba(255,255,255,0.5)" },
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-4 bg-black"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <ZoomIn className="h-4 w-4 text-white/60 shrink-0" />
        <Slider
          value={[zoom]}
          min={1}
          max={3}
          step={0.05}
          onValueChange={([v]) => setZoom(v)}
          className="flex-1"
        />
      </div>
    </div>
  );
}
