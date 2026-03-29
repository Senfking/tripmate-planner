import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const ACCEPT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

interface Props {
  onUpload: (file: File) => void;
  isPending: boolean;
}

export function FileUploadZone({ onUpload, isPending }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPT_TYPES.includes(file.type)) {
        return;
      }
      onUpload(file);
    },
    [onUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 bg-muted/30"
      }`}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground text-center">
        Drag & drop a file here, or
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>
      <p className="text-xs text-muted-foreground">PDF, JPG, PNG</p>
      {isPending && <Progress value={80} className="h-2 w-full max-w-xs" />}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
