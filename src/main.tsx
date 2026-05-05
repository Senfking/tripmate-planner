// SW update: silent activation, no page reload on tab switch
import { initSentry } from "@/lib/sentry";

// Initialize Sentry as the very first thing so early-boot errors are captured.
// No-op when VITE_SENTRY_DSN isn't set (dev/local).
initSentry();

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { trackEvent } from "@/lib/analytics";
import { pushError } from "@/lib/errorBuffer";

// Global error listeners - fire-and-forget, never block
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || String(event.reason);
  if (/Edge function returned 429:.*anon_limit|"code"\s*:\s*"anon_limit"|signup_required/i.test(message)) {
    event.preventDefault();
    return;
  }
  trackEvent("app_error", {
    type: "unhandled_promise_rejection",
    message,
    stack: event.reason?.stack?.slice(0, 500),
    route: window.location.pathname,
    severity: "high",
  });
  pushError({
    source: "unhandled_rejection",
    name: event.reason?.name || "UnhandledRejection",
    message: message?.slice(0, 300) ?? null,
    route: window.location.pathname,
  });
});

window.addEventListener("error", (event) => {
  trackEvent("app_error", {
    type: "uncaught_exception",
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    route: window.location.pathname,
    severity: "high",
  });
  pushError({
    source: "uncaught_exception",
    name: "Error",
    message: event.message?.slice(0, 300) ?? null,
    route: window.location.pathname,
    extra: { filename: event.filename, line: event.lineno },
  });
});

createRoot(document.getElementById("root")!).render(<App />);

// Service worker registration - only in production, not in iframes or preview hosts
if ("serviceWorker" in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return false;
    }
  })();

  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  if (isPreviewHost || isInIframe) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).then((reg) => {
        let lastSwCheck = 0;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && Date.now() - lastSwCheck > 3600000) {
            lastSwCheck = Date.now();
            reg.update().catch(() => {});
          }
        });
      }).catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
    });
  }
}
