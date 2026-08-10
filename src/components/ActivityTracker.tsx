import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

/**
 * Behavioural analytics: page views + time-on-platform.
 *
 * Emits two event types into `analytics_events`:
 *  - `page_view`    { route, path, session_id }        on every route change
 *  - `session_ping` { route, session_id, seconds: 60 } every 60s while the
 *                                                      tab is visible
 *
 * Time spent is derived admin-side as (ping count x 60s), which is accurate
 * to the minute and naturally excludes backgrounded tabs. Routes are
 * normalised (UUIDs/tokens -> :id) so aggregation is meaningful.
 */

const PING_INTERVAL_MS = 60_000;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function normalizeRoute(pathname: string): string {
  return pathname
    .replace(UUID_RE, ":id")
    // long opaque tokens (share links, invites, join codes)
    .replace(/\/[A-Za-z0-9_-]{16,}/g, "/:token")
    .replace(/\/$/, "") || "/";
}

function getSessionId(): string {
  const KEY = "junto_session_id";
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export default function ActivityTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const routeRef = useRef(location.pathname);

  routeRef.current = normalizeRoute(location.pathname);

  // Page views
  useEffect(() => {
    const route = normalizeRoute(location.pathname);
    trackEvent(
      "page_view",
      { route, path: location.pathname, session_id: getSessionId() },
      user?.id,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  // Heartbeat — one ping per visible minute, attributed to the current route
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      trackEvent(
        "session_ping",
        { route: routeRef.current, session_id: getSessionId(), seconds: 60 },
        user?.id,
      );
    };
    const timer = window.setInterval(tick, PING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  return null;
}
