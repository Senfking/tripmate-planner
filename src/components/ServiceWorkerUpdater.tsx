import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

/**
 * Listens for a waiting service worker and shows an update banner.
 * Only visible in standalone (installed PWA) mode.
 */
export function ServiceWorkerUpdater() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  useEffect(() => {
    if (!isStandalone || !("serviceWorker" in navigator)) return;

    // Check if there's already a waiting worker
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setWaitingSW(reg.waiting);
      }
    });

    // Listen for custom event dispatched from main.tsx
    const handler = (e: Event) => {
      setWaitingSW((e as CustomEvent).detail as ServiceWorker);
    };
    window.addEventListener("sw-waiting", handler);
    return () => window.removeEventListener("sw-waiting", handler);
  }, [isStandalone]);

  const handleUpdate = useCallback(() => {
    if (!waitingSW) return;
    waitingSW.postMessage({ type: "SKIP_WAITING" });
    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, [waitingSW]);

  if (!waitingSW || dismissed || !isStandalone) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-between gap-3 bg-secondary px-4 py-2 text-secondary-foreground text-sm shadow-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <span className="font-medium">New version available</span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpdate}
          className="rounded-md bg-secondary-foreground/15 px-3 py-1 text-xs font-semibold hover:bg-secondary-foreground/25 transition-colors"
        >
          Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-md hover:bg-secondary-foreground/15 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
