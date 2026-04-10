import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  dateRange: DateRange | undefined;
  source: string | null;
  flexible: boolean;
  flexibleDuration: number;
  onDateChange: (r: DateRange | undefined) => void;
  onFlexibleChange: (v: boolean) => void;
  onDurationChange: (d: number) => void;
};

const DURATIONS = [3, 5, 7, 10, 14];

export function StepDates({ dateRange, source, flexible, flexibleDuration, onDateChange, onFlexibleChange, onDurationChange }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16">
      <h2 className="text-2xl font-bold text-foreground mb-1">When are you going?</h2>
      {source && (
        <p className="text-xs text-muted-foreground mb-4">{source}</p>
      )}
      {!source && <div className="mb-4" />}

      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium text-foreground">I'm flexible on dates</span>
        <Switch checked={flexible} onCheckedChange={onFlexibleChange} />
      </div>

      {flexible ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">How many days?</p>
          <div className="flex flex-wrap gap-3">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => onDurationChange(d)}
                className={cn(
                  "h-14 px-6 rounded-xl font-semibold text-lg border transition-all",
                  flexibleDuration === d
                    ? "text-primary-foreground border-transparent shadow-md"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={flexibleDuration === d ? { background: "var(--gradient-primary)" } : undefined}
              >
                {d}{d === 14 ? "+" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <DateRangePicker
          value={dateRange}
          onChange={onDateChange}
          className="w-full"
        />
      )}
    </div>
  );
}
