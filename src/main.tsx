import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { trackEvent } from "@/lib/analytics";

// Global error listeners — fire-and-forget, never block
window.addEventListener("unhandledrejection", (event) => {
  trackEvent("app_error", {
    type: "unhandled_promise_rejection",
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack?.slice(0, 500),
    route: window.location.pathname,
    severity: "high",
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
});

createRoot(document.getElementById("root")!).render(<App />);

// Service worker registration — only in production, not in iframes or preview hosts
if ("serviceWorker" in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
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
      navigator.serviceWorker.register("/service-worker.js").then((reg) => {
        // Detect new waiting service worker
        const emitWaiting = (sw: ServiceWorker) => {
          window.dispatchEvent(new CustomEvent("sw-waiting", { detail: sw }));
        };
        if (reg.waiting) emitWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              emitWaiting(newSW);
            }
          });
        });
      }).catch(() => {});
    });
  }
}
