import { useState, useRef } from "react";
import { MessageSquare, ChevronLeft, X, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const reset = () => {
    setStep("type");
    setCategory(null);
    setMessage("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setAiMessage(null);
    setAiLoading(false);
    setSubmitting(false);
  };

  const handleOpen = () => {
    reset();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const selectCategory = (cat: Category) => {
    setCategory(cat);
    setStep("describe");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileRef.current) fileRef.current.value = "";
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
          const { data: urlData } = supabase.storage
            .from("feedback-screenshots")
            .getPublicUrl(path);
          screenshotUrl = urlData.publicUrl;
        }
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("feedback")
        .insert({
          user_id: user.id,
          body: message.trim(),
          category,
          route: window.location.pathname,
          app_version: (import.meta as any).env?.VITE_APP_VERSION ?? "1.0.0",
          screenshot_url: screenshotUrl,
          status: "new",
          rating: 0,
        })
        .select("id")
        .single();

      setStep("success");
      setAiLoading(true);

      if (!insertErr && inserted) {
        try {
          const { data: aiData } = await supabase.functions.invoke("analyze-feedback", {
            body: {
              feedbackId: inserted.id,
              category,
              message: message.trim(),
              route: window.location.pathname,
            },
          });
          if (aiData?.user_message) {
            setAiMessage(aiData.user_message);
          } else {
            setAiMessage("We read every message and use it to shape what we build next.\n— The Junto team");
          }
        } catch {
          setAiMessage("We read every message and use it to shape what we build next.\n— The Junto team");
        }
      } else {
        setAiMessage("We read every message and use it to shape what we build next.\n— The Junto team");
      }
    } catch {
      setAiMessage("We read every message and use it to shape what we build next.\n— The Junto team");
      setStep("success");
    } finally {
      setAiLoading(false);
      setSubmitting(false);
    }
  };

  const content = (
    <div className="px-1">
      {step === "type" && (
        <div>
          <p className="text-sm text-muted-foreground mb-5 text-center">Junto is in early development — things can go wrong and we fix them fast. Your input shapes what we build next.</p>
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              category === "bug"
                ? "Describe what you expected vs what actually happened..."
                : "Describe your idea and why it would help..."
            }
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

          {!screenshotFile ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 text-sm flex items-center gap-1"
              style={{ color: "#0D9488" }}
            >
              📎 Attach screenshot (optional)
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              {screenshotPreview && (
                <img
                  src={screenshotPreview}
                  alt="Screenshot"
                  className="w-[60px] h-[60px] rounded-lg object-cover border"
                />
              )}
              <button onClick={removeScreenshot} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
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
          <p className="text-4xl">✅</p>
          <p className="font-bold text-[18px] mt-4">Thanks for sharing ✨</p>

          <div
            className="mt-3 text-left text-sm leading-relaxed"
            style={{
              background: "rgba(13,148,136,0.06)",
              border: "1px solid rgba(13,148,136,0.15)",
              borderRadius: 12,
              padding: 14,
              lineHeight: 1.6,
            }}
          >
            {aiLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ) : (
              <p className="whitespace-pre-line">{aiMessage}</p>
            )}
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

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={handleOpen}
        className="fixed z-40 bottom-24 right-4 md:bottom-16 md:right-6 flex items-center justify-center w-11 h-11 rounded-full bg-white transition-colors hover:bg-teal-50 hover:border-teal-500"
        style={{
          border: "1px solid #E5E7EB",
          boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        }}
        aria-label="Send feedback"
      >
        <MessageSquare className="h-[18px] w-[18px]" style={{ color: "#0D9488" }} />
      </button>

      {/* Modal */}
      {isMobile ? (
        <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{title || "Feedback"}</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">{content}</div>
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
