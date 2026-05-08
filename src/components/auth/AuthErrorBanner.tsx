import { AlertCircle } from "lucide-react";

interface Props {
  /** Already-friendly message. Pass null/undefined to hide. */
  message: string | null | undefined;
  /** Optional className for layout overrides (margins, etc). */
  className?: string;
  /** Visual variant — "dark" for dark backgrounds (modal/landing), "light" for cards. */
  variant?: "dark" | "light";
}

/**
 * Accessible inline error block for auth forms. aria-live="polite" so
 * screen readers announce updates without interrupting. Sized to remain
 * fully visible at 375px viewport width.
 */
export function AuthErrorBanner({ message, className, variant = "light" }: Props) {
  if (!message) return null;
  const isDark = variant === "dark";
  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-snug",
        isDark
          ? "bg-red-500/15 text-red-200 ring-1 ring-red-400/20"
          : "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
        className ?? "",
      ].join(" ")}
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-[1px]" aria-hidden="true" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}
