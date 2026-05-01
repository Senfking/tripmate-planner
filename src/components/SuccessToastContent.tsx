import { Check, X } from "lucide-react";
import { toast } from "sonner";

// Success toast body — visual twin of ErrorToastContent.
// Premium, intentional, Junto-styled.

const TEAL = "#0D9488";
const TOAST_FONT = "'IBM Plex Sans', Inter, system-ui, sans-serif";

interface Props {
  toastId?: string | number;
  title: string;
  description?: string;
}

export function SuccessToastContent({ toastId, title, description }: Props) {
  const dismiss = () => {
    if (toastId !== undefined) toast.dismiss(toastId);
  };

  return (
    <div
      className="w-full rounded-2xl border border-gray-100 overflow-hidden"
      role="status"
      style={{
        minWidth: 0,
        fontFamily: TOAST_FONT,
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        boxShadow:
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 24px 48px -16px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(13, 148, 136, 0.10)" }}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" style={{ color: TEAL }} strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className="text-[13.5px] font-semibold tracking-[-0.005em] leading-snug break-words"
            style={{ color: "#0F172A" }}
          >
            {title}
          </p>
          {description && (
            <p
              className="mt-0.5 text-[12px] leading-relaxed break-words"
              style={{ color: "#64748B" }}
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 -m-1 transition-colors"
          style={{ color: "#94A3B8" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
