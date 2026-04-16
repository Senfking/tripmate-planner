import { ReactNode, useEffect, useRef, useState, KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wraps a click-to-edit field. Shows static `display` content; on click,
 * renders `editor`. `onCommit` is called when the user finishes (blur/Enter).
 * Briefly flashes a checkmark on successful save.
 */
interface EditableFieldProps {
  display: ReactNode;
  /** Render prop receiving helpers to wire into your editor element */
  editor: (helpers: { commit: () => void; cancel: () => void; setValid: (v: boolean) => void }) => ReactNode;
  /** Called when user wants to save. Return value indicates success. */
  onCommit: () => Promise<boolean> | boolean;
  /** Disable the entire field */
  disabled?: boolean;
  /** Visual size: 'sm' for inline cells, 'md' default */
  align?: "left" | "right";
  /** Hide the pencil affordance (e.g. read-only) */
  readOnly?: boolean;
  /** Hover/focus-visible affordance label for screen readers */
  ariaLabel?: string;
  className?: string;
}

export function EditableField({
  display, editor, onCommit, disabled, align = "left", readOnly, ariaLabel, className,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const validRef = useRef(true);

  const commit = async () => {
    if (!editing || saving) return;
    if (!validRef.current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const ok = await onCommit();
      setEditing(false);
      if (ok) {
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
      }
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => setEditing(false);

  if (readOnly) {
    return (
      <span className={cn("inline-flex items-center", align === "right" && "justify-end", className)}>
        {display}
      </span>
    );
  }

  if (editing) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 min-w-0", align === "right" && "justify-end", className)}>
        {editor({ commit, cancel, setValid: (v) => { validRef.current = v; } })}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => !disabled && setEditing(true)}
      className={cn(
        "inline-flex items-center gap-1 max-w-full min-w-0 rounded-sm cursor-text text-left",
        "hover:underline decoration-dotted underline-offset-4 decoration-muted-foreground/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        align === "right" && "justify-end",
        disabled && "opacity-60 cursor-not-allowed hover:no-underline",
        className,
      )}
    >
      <span className="min-w-0 truncate">{display}</span>
      {flash && (
        <Check className="h-3 w-3 text-primary shrink-0 animate-in fade-in zoom-in duration-150" />
      )}
    </button>
  );
}

/** Helper: handle Enter to commit, Escape to cancel, on text/number inputs */
export function useEditorKeys(commit: () => void, cancel: () => void) {
  return (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };
}

/** Auto-focus + select-all on mount */
export function useAutoFocus<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if ("select" in el) el.select();
  }, []);
  return ref;
}
