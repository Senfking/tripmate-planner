import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, X, Loader2, Sparkles, Upload, Share, Smartphone, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getRecentErrors } from "@/lib/errorBuffer";
import { showErrorToast } from "@/lib/supabaseErrors";
import {
  OPEN_FEEDBACK_EVENT,
  type FeedbackErrorContext,
  type OpenFeedbackOptions,
} from "@/lib/feedbackEvents";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Category = "bug" | "suggestion";
type Step = "type" | "describe" | "success";

export function FeedbackWidget() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analyzingScreenshot, setAnalyzingScreenshot] = useState(false);
  const [screenshotHint, setScreenshotHint] = useState<string | null>(null);
  const [screenshotAnalysisFailed, setScreenshotAnalysisFailed] = useState(false);
  const [isAppScreenshot, setIsAppScreenshot] = useState(true);
  const [screenshotHintRating, setScreenshotHintRating] = useState<'up' | 'down' | null>(null);
  const [pwaHintOpen, setPwaHintOpen] = useState(false);
  const [errorContext, setErrorContext] = useState<FeedbackErrorContext | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Draggable vertical tab state - vertical drag only
  const [tabY, setTabY] = useState<number | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startY: number;
    startPosY: number;
  }>({ dragging: false, moved: false, startY: 0, startPosY: 0 });
  const fabRef = useRef<HTMLButtonElement>(null);

  const TAB_HEIGHT = 90;

  const getDefaultY = useCallback(() => {
    return Math.round(window.innerHeight * 0.45);
  }, []);

  useEffect(() => {
    setTabY(getDefaultY());
    const onResize = () => {
      setTabY((prev) => {
        if (prev == null) return getDefaultY();
        return Math.min(prev, window.innerHeight - TAB_HEIGHT);
      });
    };
    window.addEventListener("resize", onResize);

    // Track mobile keyboard via visualViewport
    const vv = window.visualViewport;
    const updateKeyboard = () => {
      if (vv) {
        // On iOS, vv.height shrinks when the keyboard opens.
        // vv.offsetTop accounts for the viewport being scrolled up.
        const kbH = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setKeyboardHeight(kbH);
      }
    };
    // iOS fires both "resize" and "scroll" on visualViewport when the keyboard opens
    vv?.addEventListener("resize", updateKeyboard);
    vv?.addEventListener("scroll", updateKeyboard);

    return () => {
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", updateKeyboard);
      vv?.removeEventListener("scroll", updateKeyboard);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [getDefaultY]);

  const clampY = (y: number) =>
    Math.max(60, Math.min(y, window.innerHeight - TAB_HEIGHT - 20));

  const handlePointerDown = (e: React.PointerEvent) => {
    const d = dragRef.current;
    d.moved = false;
    d.startY = e.clientY;
    d.startPosY = tabY ?? 0;
    d.dragging = true;
    fabRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    setTabY(clampY(d.startPosY + dy));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.dragging) {
      d.dragging = false;
      fabRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for global "open feedback" requests fired from the error toast's
  // "Send to support" button. The error context is stashed and attached to
  // the feedback row's metadata on submit so the user doesn't have to retype
  // anything technical. Declared before the `!user` early return to keep
  // hook order stable across renders.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenFeedbackOptions>).detail || {};
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      const cat: Category = detail.category ?? "bug";
      setCategory(cat);
      setStep("describe");
      if (detail.prefill) setMessage(detail.prefill);
      if (detail.errorContext) setErrorContext(detail.errorContext);
      setOpen(true);
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, handler);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handler);
  }, []);

  if (!user) return null;

  const reset = () => {
    setStep("type");
    setCategory(null);
    setMessage("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setSubmitting(false);
    setAnalyzingScreenshot(false);
    setScreenshotHint(null);
    setScreenshotAnalysisFailed(false);
    setIsAppScreenshot(true);
    setScreenshotHintRating(null);
    setPwaHintOpen(false);
    setErrorContext(null);
  };

  const clearResetTimer = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const handleOpen = () => {
    clearResetTimer();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    // After successful submission, reset immediately
    if (step === "success") {
      reset();
    } else {
      // Keep state for 5 minutes so user can resume
      clearResetTimer();
      resetTimerRef.current = setTimeout(() => {
        reset();
        resetTimerRef.current = null;
      }, 5 * 60 * 1000);
    }
  };

  const selectCategory = (cat: Category) => {
    setCategory(cat);
    setStep("describe");
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** Resize image to max 1024px on longest side and return { base64, mediaType } */
  const compressImage = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve({
          base64: dataUrl.split(",")[1],
          mediaType: "image/jpeg",
        });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });

  const hintRef = useRef<HTMLDivElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Blur the file input immediately to dismiss the iOS keyboard/accessory bar
    if (fileRef.current) fileRef.current.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setScreenshotFile(file);
    setScreenshotHint(null);
    setScreenshotAnalysisFailed(false);
    setIsAppScreenshot(true);
    setScreenshotHintRating(null);
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);

    setAnalyzingScreenshot(true);
    try {
      // Compress to ~1024px JPEG to stay within edge function body limits
      const { base64, mediaType } = await compressImage(file);

      const { data, error } = await supabase.functions.invoke("analyze-feedback", {
        body: {
          action: "describe_screenshot",
          image_base64: base64,
          media_type: mediaType,
          route: window.location.pathname,
        },
      });

      if (error) {
        console.error("Screenshot analysis error:", error);
        setScreenshotAnalysisFailed(true);
        return;
      }

      // Handle data being a string (some Supabase client versions don't auto-parse)
      const parsed = typeof data === "string" ? JSON.parse(data) : data;

      if (parsed?.hint) {
        setScreenshotHint(parsed.hint);
        // Scroll the hint into view after a short delay for render
        setTimeout(() => {
          hintRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      } else {
        setScreenshotAnalysisFailed(true);
      }
      if (parsed?.is_app_screenshot === false) {
        setIsAppScreenshot(false);
      }
    } catch (err) {
      console.error("Screenshot analysis failed:", err);
      setScreenshotAnalysisFailed(true);
    } finally {
      setAnalyzingScreenshot(false);
    }
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    setScreenshotHint(null);
    setScreenshotAnalysisFailed(false);
    setIsAppScreenshot(true);
    setScreenshotHintRating(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTextareaFocus = () => {
    // Wait for the keyboard to finish animating before scrolling
    setTimeout(() => {
      if (isMobile && scrollRef.current && textareaRef.current) {
        // Inside the drawer, scroll the scrollable container so the textarea is visible
        const container = scrollRef.current;
        const textarea = textareaRef.current;
        const containerRect = container.getBoundingClientRect();
        const textareaRect = textarea.getBoundingClientRect();
        const offset = textareaRect.top - containerRect.top - containerRect.height / 3;
        container.scrollBy({ top: offset, behavior: "smooth" });
      } else {
        textareaRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 350);
  };

  const handleSubmit = async () => {
    if (!category || !message.trim()) return;
    setSubmitting(true);

    try {
      let screenshotUrl: string | null = null;

      if (screenshotFile) {
        const ext = screenshotFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("feedback-screenshots")
          .upload(path, screenshotFile);
        if (!uploadErr) {
          // Generate a signed URL (valid for 1 year) so the admin dashboard can display it
          const { data: signedData } = await supabase.storage
            .from("feedback-screenshots")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          screenshotUrl = signedData?.signedUrl ?? path;
        }
      }

      // Build the metadata payload: recent error context (from the in-memory
      // ring buffer) + environment hints. Helps admins triage bug reports
      // without asking users to paste console output.
      const recentErrors = getRecentErrors();
      const displayMode =
        typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
          ? "standalone"
          : "browser";
      const metadata = {
        recent_errors: recentErrors,
        route: window.location.pathname,
        display_mode: displayMode,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
        screenshot_hint: screenshotHint,
        captured_at: new Date().toISOString(),
        // Set when the user opened the widget from an error toast's
        // "Send to support" button — ground-truth error context that may
        // not appear in `recent_errors` (the toast captures errors from
        // call sites that don't push to the in-memory buffer).
        error_context: errorContext ?? null,
      };

      // Base payload — the columns that have always existed on `feedback`.
      // `metadata` is layered on top via `insertPayload` and stripped on the
      // metadata-missing fallback so feedback keeps working if the
      // 20260426114007 migration hasn't been applied to this env yet.
      const basePayload = {
        user_id: user.id,
        body: message.trim(),
        category,
        route: window.location.pathname,
        app_version: (import.meta as any).env?.VITE_APP_VERSION ?? "1.0.0",
        screenshot_url: screenshotUrl,
        status: "new",
        rating: 0,
        hint_rating: screenshotHintRating,
      };
      let insertPayload: Record<string, unknown> = { ...basePayload, metadata };

      // Retry insert up to 3 times with exponential backoff to handle transient failures.
      // On a "metadata column doesn't exist" error (PGRST204 / 42703 / message
      // mentioning the metadata column), drop metadata and retry — this lets
      // feedback keep working if the new migration hasn't shipped to this
      // env yet, at the cost of losing error context for that one submission.
      let inserted: { id: string } | null = null;
      let insertErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase
          .from("feedback")
          .insert(insertPayload as any)
          .select("id")
          .single();

        inserted = result.data;
        insertErr = result.error;

        if (!insertErr && inserted) break;

        const errMsg = (insertErr?.message ?? "").toLowerCase();
        const errCode = insertErr?.code;
        const isMissingMetadata =
          ("metadata" in insertPayload) &&
          (errCode === "PGRST204" ||
            errCode === "42703" ||
            (errMsg.includes("metadata") &&
              (errMsg.includes("schema cache") || errMsg.includes("does not exist") || errMsg.includes("column"))));
        if (isMissingMetadata) {
          // Migration hasn't been applied — drop metadata and try once more
          // immediately (don't waste the backoff window on a known-cause failure).
          // eslint-disable-next-line no-console
          console.warn(
            "[feedback] metadata column missing, retrying without it. Apply migration 20260426114007.",
          );
          const { metadata: _drop, ...withoutMetadata } = insertPayload;
          insertPayload = withoutMetadata;
          continue;
        }

        // Wait before retrying (500ms, 1500ms)
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }

      if (insertErr || !inserted) {
        console.error("Feedback insert failed after retries:", insertErr);
        // Surface the real error — code/status/message/hint — via the rich
        // toast UI. No more opaque "Something went wrong" with no path to
        // diagnosis.
        showErrorToast(
          insertErr,
          insertErr?.message?.includes("row-level security")
            ? "Permission error — please log out and back in."
            : "Couldn't send feedback. Tap details for the reason.",
        );
        setSubmitting(false);
        return;
      }

      setStep("success");

      // Fire admin notification (push/WhatsApp) via submit-feedback-alert.
      //
      // We previously called check-admin-alerts directly from the client,
      // but that function is now locked behind verify_jwt + an internal
      // service-role-key bearer check (see
      // supabase/functions/check-admin-alerts/index.ts) — anonymous JWTs
      // and ordinary user JWTs are rejected. submit-feedback-alert is the
      // authenticated, rate-limited (3 / 10 min / user) gateway that
      // re-derives the user from their JWT, validates feedback ownership,
      // reads body/category from the DB (NOT request body), and inserts
      // the admin_notifications row + Twilio.
      //
      // Submit-time analyze-feedback invocation removed earlier; admin AI
      // enrichment runs server-side via the trg_analyze_new_feedback
      // AFTER INSERT trigger.
      try {
        const { data: alertData } = await supabase.functions.invoke("submit-feedback-alert", {
          body: { feedback_id: inserted.id },
        });
        if (alertData?.whatsapp_error) {
          console.warn("Admin alert WhatsApp failed:", alertData.whatsapp_error);
        } else if (alertData?.error === "rate_limited") {
          // User hit the per-user cap. Feedback row is still in the DB —
          // admin will see it via the dashboard, just without a Twilio.
          console.warn("Admin alert rate-limited:", alertData);
        }
      } catch (e) {
        console.warn("submit-feedback-alert invoke failed:", e);
      }
    } catch (err: any) {
      console.error("Feedback submission error:", err);
      showErrorToast(err, "Couldn't send feedback. Tap details for the reason.");
    } finally {
      setSubmitting(false);
    }
  };

  const textareaPlaceholder = (() => {
    if (!isAppScreenshot && screenshotFile) {
      return "Maybe describe the actual Junto issue this time? 😅";
    }
    return category === "bug"
      ? "Describe what you expected vs what actually happened..."
      : "Describe your idea and why it would help...";
  })();

  const content = (
    <div
      ref={scrollRef}
      className="px-1"
      style={{
        overflowY: "auto",
        maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - 140px - ${keyboardHeight}px)`,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {step === "type" && (
        <div>
          <p className="text-sm text-muted-foreground mb-5 text-center">Junto is in early development. Things can go wrong and we fix them fast. Your input shapes what we build next.</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { cat: "bug" as Category, icon: "🐛", title: "Report a bug", sub: "Something isn't working" },
              { cat: "suggestion" as Category, icon: "💡", title: "Suggest a feature", sub: "An idea to make Junto better" },
            ]).map((item) => (
              <button
                key={item.cat}
                onClick={() => selectCategory(item.cat)}
                className="flex flex-col items-center text-center gap-1.5 rounded-xl border p-4 transition-colors hover:border-teal-500 hover:bg-teal-500/5"
                style={{ borderColor: "#E5E7EB" }}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.sub}</span>
              </button>
            ))}
          </div>

          {/* PWA install hint */}
          <div className="mt-6 rounded-xl border border-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setPwaHintOpen((v) => !v)}
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground w-full px-3.5 py-3"
            >
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">Junto works best added to your home screen</span>
              <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-200 ${pwaHintOpen ? "rotate-180" : ""}`} />
            </button>
            {pwaHintOpen && (
              <div className="px-3.5 pb-3 -mt-0.5 space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Junto isn't a native app yet. For the best experience, add it to your home screen:
                </p>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Share className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> in Safari</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 mt-0.5 text-[10px] leading-none">⋮</span>
                  <span>Or tap the <strong>menu</strong> in Chrome</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "describe" && (
        <div>
          <button
            onClick={() => setStep("type")}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <label className="text-sm font-medium mb-2 block">
            {category === "bug" ? "What happened?" : "What's your idea?"}
          </label>

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onFocus={handleTextareaFocus}
            placeholder={textareaPlaceholder}
            className="min-h-[100px] text-[15px]"
            style={{ borderRadius: 10, padding: 12, borderColor: "#E5E7EB" }}
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Screenshot card - bugs & suggestions */}
          {(category === "bug" || category === "suggestion") && (
            <>
              {!screenshotFile ? (
                <div
                  className="mt-3"
                  style={{
                    background: "rgba(13,148,136,0.06)",
                    border: "1px solid rgba(13,148,136,0.2)",
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" style={{ color: "#0D9488" }} />
                    <span className="text-xs font-semibold" style={{ color: "#0D9488" }}>Junto AI</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload a screenshot and Junto AI will take a look. No promises.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
                    style={{
                      border: "1px solid #0D9488",
                      color: "#0D9488",
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Upload screenshot
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-center gap-3">
                    {screenshotPreview && (
                      <img
                        src={screenshotPreview}
                        alt="Screenshot"
                        className="w-[60px] h-[60px] rounded-lg object-cover border shrink-0"
                      />
                    )}
                    {!analyzingScreenshot && (
                      <button onClick={removeScreenshot} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {analyzingScreenshot && (
                    <p className="text-xs animate-pulse mt-2" style={{ color: "#0D9488" }}>
                      Junto AI is squinting at your screenshot...
                    </p>
                  )}
                  {screenshotAnalysisFailed && !analyzingScreenshot && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      Junto AI couldn't analyze the screenshot - no worries, just describe the issue below.
                    </p>
                  )}
                  {screenshotHint && !analyzingScreenshot && (
                    <div ref={hintRef} className="mt-2">
                      <p className="text-xs text-muted-foreground italic">
                        💡 Junto AI spotted: {screenshotHint}
                      </p>
                      {/* Thumbs up/down - only for app screenshots */}
                      {isAppScreenshot && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">Was this helpful?</span>
                          <button
                            type="button"
                            onClick={() => setScreenshotHintRating((v) => v === "up" ? null : "up")}
                            className={`p-1 rounded transition-colors ${screenshotHintRating === "up" ? "text-teal-600 bg-teal-500/10" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenshotHintRating((v) => v === "down" ? null : "down")}
                            className={`p-1 rounded transition-colors ${screenshotHintRating === "down" ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || submitting}
            className="w-full mt-4"
            style={{ backgroundColor: "#0D9488" }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send feedback"}
          </Button>
        </div>
      )}

      {step === "success" && (
        <div className="text-center">
          <p className="text-5xl">🚀</p>
          <p className="font-bold text-[22px] mt-3">Got it.</p>

          <div
            className="mt-3 text-left"
            style={{
              background: "rgba(13,148,136,0.06)",
              border: "1px solid rgba(13,148,136,0.15)",
              borderRadius: 12,
              padding: 14,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <p className="whitespace-pre-line text-foreground">
              Oliver reads every single one of these. Seriously, he's a bit obsessive about it. You'll probably see changes soon.
            </p>
          </div>

          <button
            onClick={handleClose}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );

  const title = step === "type" ? "Share feedback" : step === "describe" ? (category === "bug" ? "Report a bug" : "Suggest a feature") : "";

  const fabClick = () => {
    if (!dragRef.current.moved) handleOpen();
    dragRef.current.moved = false;
  };

  return (
    <>
      {/* Vertical side tab - right edge, draggable vertically */}
      {tabY != null && (
        <button
          ref={fabRef}
          onClick={fabClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="fixed z-40 select-none touch-none"
          style={{
            right: 0,
            top: tabY,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            transformOrigin: "center center",
            background: "linear-gradient(180deg, #0D9488 0%, #0F766E 100%)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "14px 7px",
            borderRadius: "0 10px 10px 0",
            boxShadow: "2px 2px 12px rgba(0,0,0,0.12)",
            cursor: "pointer",
          }}
          aria-label="Send feedback"
        >
          Feedback
        </button>
      )}

      {isMobile ? (
        <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }} repositionInputs={false}>
          <DrawerContent className="flex flex-col" style={{ maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - 20px - ${keyboardHeight}px)`, transition: "max-height 0.15s ease-out" }}>
            <DrawerHeader className="shrink-0">
              <DrawerTitle>{title || "Feedback"}</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto flex-1 min-h-0">{content}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
          <DialogContent className="max-w-[440px]">
            <DialogHeader>
              <DialogTitle>{title || "Feedback"}</DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
