import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* ── iOS Share icon (↑□) ── */
function IOSShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <rect x="4" y="11" width="16" height="10" rx="2" />
    </svg>
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("junto_install_dismissed") === "true");
  const [iosDismissed, setIosDismissed] = useState(() => localStorage.getItem("junto_ios_tip_dismissed") === "true");

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("junto_install_dismissed", "true");
  };

  const handleIOSDismiss = () => {
    setIosDismissed(true);
    localStorage.setItem("junto_ios_tip_dismissed", "true");
  };

  /* ── Android / Chrome banner ── */
  if (deferredPrompt && !dismissed) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
        <Download className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Install Junto</p>
          <p className="text-xs text-muted-foreground">Add to your home screen for the best experience</p>
        </div>
        <Button size="sm" onClick={handleInstall}>Install</Button>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  /* ── iOS Safari tip ── */
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia("(display-mode: standalone)").matches;
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);

  if (isIOS && isSafari && !isInStandaloneMode && !iosDismissed) {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-50 flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
        <IOSShareIcon className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Add Junto to your home screen</p>
          <p className="text-xs text-muted-foreground">
            Tap <IOSShareIcon className="inline h-3.5 w-3.5 align-text-bottom" /> Share → Add to Home Screen
          </p>
        </div>
        <button onClick={handleIOSDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
