import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { trackEvent } from "@/lib/analytics";

// Global error listeners - fire-and-forget, never block
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
        // Proactively check for updates when the user returns to the app
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        });
      }).catch((err) => {
        console.error("[SW] Registration failed:", err);
      });

      // Auto-reload when a new SW takes control (skipWaiting was called)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    });
  }
}
