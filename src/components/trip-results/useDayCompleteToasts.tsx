import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import React from "react";

/**
 * Fires a "Day N ready ✓" toast for each new day_number that lands in
 * `completedDays`. Ensures we only toast a given day once per session by
 * tracking what we've already shown.
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium animate-in slide-in-from-right-4 fade-in duration-300"
            style={{ backgroundColor: "#0D9488", color: "white" }}
            onClick={() => toast.dismiss(id)}
          >
            <Check className="h-4 w-4" strokeWidth={3} />
            <span>Day {n} ready</span>
          </div>
        ),
        { duration: 2500, position: "top-right" },
      );
    }
  }, [completedDays]);
}
