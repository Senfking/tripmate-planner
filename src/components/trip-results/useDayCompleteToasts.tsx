import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import React from "react";

/**
 * Fires a "Day N ready ✓" toast for each new day_number that lands in
 * `completedDays`. Ensures we only toast a given day once per session by
 * tracking what we've already shown.
 *
 * Visual: bold teal pill, larger checkmark, scale-bounce entry, 3.2s dismiss.
 */
export function useDayCompleteToasts(completedDays: number[]) {
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const n of completedDays) {
      if (seen.current.has(n)) continue;
      seen.current.add(n);
      toast.custom(
        (id) => (
          <div
            className="flex items-center gap-2.5 px-5 py-3 rounded-full shadow-xl text-base font-semibold cursor-pointer"
            style={{
              backgroundColor: "#0D9488",
              color: "white",
              boxShadow: "0 8px 24px rgba(13, 148, 136, 0.4), 0 2px 6px rgba(0,0,0,0.1)",
              animation: "dayToastIn 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
            onClick={() => toast.dismiss(id)}
          >
            <span
              className="flex items-center justify-center h-6 w-6 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
            >
              <Check className="h-4 w-4" strokeWidth={3.5} />
            </span>
            <span>Day {n} ready</span>
            <style>{`
              @keyframes dayToastIn {
                0% { opacity: 0; transform: translateX(40px) scale(0.85); }
                60% { opacity: 1; transform: translateX(-4px) scale(1.04); }
                100% { opacity: 1; transform: translateX(0) scale(1); }
              }
            `}</style>
          </div>
        ),
        { duration: 3200, position: "top-right" },
      );
    }
  }, [completedDays]);
}
