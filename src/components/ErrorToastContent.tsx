import { useState } from "react";
import { AlertCircle, ChevronDown, Copy, Check, X, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { requestOpenFeedback } from "@/lib/feedbackEvents";

// Rich error toast body. Used by showErrorToast (sonner via toast.custom)
// and by the Radix Toaster when an error toast carries a structured payload.
//
// Premium visual style — Linear / Vercel / Notion influenced:
//   · Off-white surface, soft layered shadow, subtle backdrop blur
//   · Tight type hierarchy in IBM Plex Sans
//   · Smooth ~250ms enter (handled by sonner)
//   · Status icon (red AlertCircle) sits next to the title
//   · Action buttons inherit Junto's teal primary
//
// Mobile-first: the surrounding sonner Toaster handles safe-area top
// (see src/components/ui/sonner.tsx), so this body does not need its own
// safe-area math. Width comes from the parent toast container.

const TEAL = "#0D9488";
const TEAL_DARK = "#0F766E";
const TOAST_FONT = "'IBM Plex Sans', Inter, system-ui, sans-serif";
const TOAST_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export interface ErrorToastDetails {
  /** PostgREST/Postgres error code, if any */
  code?: string | null;
  /** HTTP status, if any */
  status?: number | null;
  /** Underlying error name (e.g. "PostgrestError") */
  name?: string | null;
  /** Raw error message */
  message?: string | null;
  /** PostgREST hint, if any */
  hint?: string | null;
  /** Route the user was on */
  route?: string | null;
  /** Capture timestamp (ISO) */
  capturedAt?: string;
  /** Anything else worth showing — rendered as JSON */
  extra?: Record<string, unknown>;
}

interface Props {
  /** Sonner toast id, so the dismiss-X can close the toast. Optional for Radix path. */
  toastId?: string | number;
  /** The friendly, user-facing message (e.g. "Failed to add expense") */
  friendly: string;
  /** Structured technical details, if any */
  details?: ErrorToastDetails;
}

export function ErrorToastContent({ toastId, friendly, details }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isAdmin = useIsAdmin();

  const hasTechnicalDetails = details
    ? Boolean(
        details.code ||
          details.status ||
          details.message ||
          details.hint ||
          details.name ||
          details.extra,
      )
    : false;

  const fullJson = details
    ? JSON.stringify(
        {
          code: details.code ?? null,
          status: details.status ?? null,
          name: details.name ?? null,
          message: details.message ?? null,
          hint: details.hint ?? null,
          route: details.route ?? null,
          captured_at: details.capturedAt ?? new Date().toISOString(),
          extra: details.extra ?? null,
        },
        null,
        2,
      )
    : "";

  const copy = async () => {
    if (!fullJson) return;
    try {
      await navigator.clipboard?.writeText(fullJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (some webviews) — silently ignore
    }
  };

  const dismiss = () => {
    if (toastId !== undefined) toast.dismiss(toastId);
  };

  const sendToSupport = () => {
    requestOpenFeedback({
      category: "bug",
      prefill: `Saw this error: ${friendly}\n\n`,
      errorContext: details
        ? {
            friendly,
            code: details.code ?? null,
            status: details.status ?? null,
            name: details.name ?? null,
            message: details.message ?? null,
            hint: details.hint ?? null,
            route: details.route ?? null,
            capturedAt: details.capturedAt,
            extra: details.extra,
          }
        : { friendly },
    });
    dismiss();
  };

  return (
    <div
      className="w-full rounded-2xl border border-gray-100 overflow-hidden"
      role="alert"
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
          style={{ background: "rgba(220, 38, 38, 0.10)" }}
          aria-hidden
        >
          <AlertCircle className="h-3.5 w-3.5" style={{ color: "#DC2626" }} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className="text-[13.5px] font-semibold tracking-[-0.005em] leading-snug break-words"
            style={{ color: "#0F172A" }}
          >
            {friendly}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium transition-colors"
            style={{ color: expanded ? "#0F172A" : "#64748B" }}
            aria-expanded={expanded}
          >
            <ChevronDown
              className="h-3 w-3 transition-transform duration-300 ease-out"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
            {expanded ? "Hide details" : "Show details"}
          </button>
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

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className="px-3.5 py-3 space-y-3"
            style={{ borderTop: "1px solid rgba(15, 23, 42, 0.06)" }}
          >
            <p
              className="text-[12px] leading-relaxed break-words"
              style={{ color: "#64748B" }}
            >
              Something went wrong on our end. If this keeps happening, send
              it to support and we&apos;ll take a look.
            </p>

            <button
              type="button"
              onClick={sendToSupport}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{
                background: `linear-gradient(180deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
                boxShadow: "0 1px 2px rgba(13, 148, 136, 0.25)",
              }}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              Send to support
            </button>

            {isAdmin && hasTechnicalDetails && details && (
              <div
                className="pt-3 mt-1 space-y-1.5"
                style={{ borderTop: "1px solid rgba(15, 23, 42, 0.06)" }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.08em] font-semibold"
                  style={{ color: "#94A3B8" }}
                >
                  Admin · technical detail
                </p>
                <DetailRow label="Code" value={details.code ?? null} />
                <DetailRow label="Status" value={details.status ?? null} />
                <DetailRow label="Route" value={details.route ?? null} />
                <DetailRow
                  label="When"
                  value={
                    details.capturedAt
                      ? new Date(details.capturedAt).toLocaleTimeString()
                      : new Date().toLocaleTimeString()
                  }
                />
                {details.message && (
                  <div className="pt-1">
                    <p
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold mb-0.5"
                      style={{ color: "#94A3B8" }}
                    >
                      Message
                    </p>
                    <p
                      className="text-[11px] break-words whitespace-pre-wrap"
                      style={{ color: "#0F172A", fontFamily: TOAST_MONO }}
                    >
                      {details.message}
                    </p>
                  </div>
                )}
                {details.hint && (
                  <div className="pt-1">
                    <p
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold mb-0.5"
                      style={{ color: "#94A3B8" }}
                    >
                      Hint
                    </p>
                    <p
                      className="text-[11px] break-words whitespace-pre-wrap"
                      style={{ color: "#0F172A", fontFamily: TOAST_MONO }}
                    >
                      {details.hint}
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
                    style={{
                      color: "#0F172A",
                      background: "rgba(15, 23, 42, 0.04)",
                      border: "1px solid rgba(15, 23, 42, 0.06)",
                    }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy JSON
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span
        className="text-[10px] uppercase tracking-[0.08em] font-semibold w-12 shrink-0"
        style={{ color: "#94A3B8" }}
      >
        {label}
      </span>
      <span
        className="break-words"
        style={{ color: "#0F172A", fontFamily: TOAST_MONO }}
      >
        {String(value)}
      </span>
    </div>
  );
}
