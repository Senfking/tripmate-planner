import { useState } from "react";
import { AlertCircle, ChevronDown, Copy, Check, X, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { requestOpenFeedback } from "@/lib/feedbackEvents";

// Rich error toast body. Used by showErrorToast (sonner via toast.custom)
// and by the Radix Toaster when an error toast carries a structured payload.
//
// UX:
//   - Friendly title prominently
//   - "Show details" affordance below
//   - On tap, expands a panel:
//       · For regular users: only a "Send to support" button (the error
//         context is attached automatically through requestOpenFeedback).
//       · For admins: full technical detail (code/status/route/timestamp/
//         message/hint), plus Copy-JSON for fast triage.
//
// Mobile-first: the surrounding sonner Toaster handles safe-area top
// (see src/components/ui/sonner.tsx), so this body does not need its own
// safe-area math. Width comes from the parent toast container.

const TEAL = "#0D9488";
const TEAL_DARK = "#0F766E";
const TOAST_FONT = "'IBM Plex Sans', Inter, system-ui, sans-serif";

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

  // Always allow expanding so the user can reach "Send to support". Admins
  // additionally see the technical panel inside the expanded view.
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
      className="w-full rounded-2xl border border-destructive/30 bg-background shadow-lg overflow-hidden"
      role="alert"
      style={{ minWidth: 0, fontFamily: TOAST_FONT }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground break-words leading-snug">
            {friendly}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -m-0.5 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/60 px-3 py-2.5 space-y-2.5">
            {/* User-facing summary — plain sans, not mono. */}
            <p className="text-[12px] text-muted-foreground leading-relaxed break-words">
              Something went wrong on our end. If this keeps happening, send it
              to support and we'll take a look.
            </p>

            <button
              type="button"
              onClick={sendToSupport}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{
                background: `linear-gradient(180deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
              }}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              Send to support
            </button>

            {isAdmin && hasTechnicalDetails && details && (
              <div className="pt-2 mt-1 border-t border-border/60 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[color:var(--admin-label,#6B7280)]">
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
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-0.5">
                      Message
                    </p>
                    <p className="text-[11px] text-foreground break-words whitespace-pre-wrap font-mono">
                      {details.message}
                    </p>
                  </div>
                )}
                {details.hint && (
                  <div className="pt-1">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-0.5">
                      Hint
                    </p>
                    <p className="text-[11px] text-foreground break-words whitespace-pre-wrap font-mono">
                      {details.hint}
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 hover:bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition-colors"
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
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 w-12 shrink-0">
        {label}
      </span>
      <span className="text-foreground break-words font-mono">{String(value)}</span>
    </div>
  );
}
