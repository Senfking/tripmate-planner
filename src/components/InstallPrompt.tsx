import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

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

  /* ── Android / Chrome native prompt banner ── */
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

  /* ── Manual install tip (browser-aware) ── */
  const isInStandaloneMode = window.matchMedia("(display-mode: standalone)").matches;
  if (isInStandaloneMode || iosDismissed) return null;

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edg/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isSamsungBrowser = /samsungbrowser/i.test(ua);

  let instruction: React.ReactNode;

  if (isIOS && isSafari) {
    instruction = (
      <>Tap the share icon (<IOSShareIcon className="inline h-3.5 w-3.5 align-text-bottom text-foreground" />) at the bottom of Safari, then tap <span className="font-medium text-foreground">"Add to Home Screen"</span>.</>
    );
  } else if (isIOS && isChrome) {
    instruction = (
      <>Tap the share icon (<IOSShareIcon className="inline h-3.5 w-3.5 align-text-bottom text-foreground" />) at the top right, then tap <span className="font-medium text-foreground">"Add to Home Screen"</span>.</>
    );
  } else if (isAndroid && isSamsungBrowser) {
    instruction = (
      <>Tap the menu icon at the bottom, then tap <span className="font-medium text-foreground">"Add page to"</span> → <span className="font-medium text-foreground">"Home screen"</span>.</>
    );
  } else if (isAndroid && isChrome) {
    instruction = (
      <>Tap the three-dot menu (<span className="font-medium text-foreground">⋮</span>) at the top right, then tap <span className="font-medium text-foreground">"Add to Home screen"</span>.</>
    );
  } else if (isAndroid && isFirefox) {
    instruction = (
      <>Tap the three-dot menu, then tap <span className="font-medium text-foreground">"Install"</span> or <span className="font-medium text-foreground">"Add to Home screen"</span>.</>
    );
  } else if (isIOS) {
    // iOS but unknown browser
    instruction = (
      <>Open your browser menu and look for <span className="font-medium text-foreground">"Add to Home Screen"</span> or <span className="font-medium text-foreground">"Install app"</span>.</>
    );
  } else {
    // Don't show manual tip on desktop or unknown non-mobile browsers
    return null;
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 rounded-xl border bg-card p-4 shadow-lg md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Get the full app experience</p>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
            {instruction}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1.5">
            This is a browser setting — not a button inside the app.
          </p>
        </div>
        <button onClick={handleIOSDismiss} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
