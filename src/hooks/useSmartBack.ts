import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Smart "Back" handler. Uses browser history when available; otherwise
 * falls back to a sensible default route (e.g. "/") so we never push the
 * user out of the app when they landed on this page directly.
 *
 * Detection: history.state.idx > 0 means React Router has prior in-app
 * history. When idx is 0 (or unknown), there is no in-app entry to pop.
 */
export function useSmartBack(fallback: string = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate, fallback]);
}
