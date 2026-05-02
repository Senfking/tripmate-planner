import { useState, useMemo, useCallback } from "react";
import {
  format,
  addMonths,
  startOfMonth,
  startOfDay,
  isSameDay,
  isBefore,
  isAfter,
  differenceInCalendarDays,
  getDay,
  getDaysInMonth,
  setYear,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
};

const MAX_TRIP_DAYS = 30;
const TEAL = "#0D9488";
const TEAL_BG_LIGHT = "rgba(13, 148, 136, 0.15)";
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type MonthCell = { date: Date | null; inPast: boolean };

function buildMonthGrid(monthDate: Date, today: Date): MonthCell[] {
  const first = startOfMonth(monthDate);
  const leading = getDay(first);
  const days = getDaysInMonth(monthDate);
  const cells: MonthCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ date: null, inPast: false });
  for (let d = 1; d <= days; d++) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
    cells.push({ date, inPast: isBefore(date, today) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, inPast: false });
  return cells;
}

type CalendarBodyProps = {
  draft: DateRange | undefined;
  onSelect: (d: Date) => void;
  warning: string | null;
};

function SingleMonthCalendar({ draft, onSelect, warning }: CalendarBodyProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(today));
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const from = draft?.from ? startOfDay(draft.from) : undefined;
  const to = draft?.to ? startOfDay(draft.to) : undefined;

  const cells = useMemo(() => buildMonthGrid(viewMonth, today), [viewMonth, today]);

  const isInRange = (d: Date) => {
    if (!from || !to) return false;
    return (
      (isAfter(d, from) || isSameDay(d, from)) &&
      (isBefore(d, to) || isSameDay(d, to))
    );
  };

  const goPrev = () => setViewMonth((m) => addMonths(m, -1));
  const goNext = () => setViewMonth((m) => addMonths(m, 1));

  const viewYear = viewMonth.getFullYear();
  const currentYear = today.getFullYear();
  // 6 years: current + next 5
  const years = Array.from({ length: 6 }, (_, i) => currentYear + i);

  const handleYearPick = (y: number) => {
    setViewMonth(setYear(viewMonth, y));
    setYearPickerOpen(false);
  };

  return (
    <div className="relative w-full rounded-2xl bg-white dark:bg-card border border-border overflow-hidden">
      {warning && (
        <div className="px-4 py-2 text-xs text-center font-medium text-destructive bg-destructive/10 border-b border-destructive/20">
          {warning}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-2">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous month"
          className="h-11 w-11 inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          style={{ color: TEAL }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setYearPickerOpen((v) => !v)}
          className="min-h-[44px] px-3 rounded-lg text-base font-semibold text-foreground hover:bg-muted transition-colors"
          aria-label="Select year"
        >
          {format(viewMonth, "MMMM yyyy")}
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Next month"
          className="h-11 w-11 inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          style={{ color: TEAL }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-3 pb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-[11px] font-medium text-muted-foreground text-center h-6 flex items-center justify-center"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1 px-3 pb-4">
        {cells.map((cell, ci) => {
          if (!cell.date) return <div key={ci} className="h-11" />;
          const d = cell.date;
          const disabled = cell.inPast;
          const isFrom = from && isSameDay(d, from);
          const isTo = to && isSameDay(d, to);
          const isEndpoint = isFrom || isTo;
          const inRange = isInRange(d) && !isEndpoint;
          const singleEndpoint = from && to && isSameDay(from, to);

          return (
            <button
              key={ci}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelect(d)}
              className={cn(
                "relative h-11 flex items-center justify-center text-sm transition-colors",
                disabled && "text-muted-foreground/40 cursor-not-allowed",
                !disabled && !isEndpoint && !inRange && "text-foreground"
              )}
            >
              {inRange && (
                <span
                  className="absolute inset-y-1 left-0 right-0"
                  style={{ background: TEAL_BG_LIGHT }}
                />
              )}
              {isFrom && to && !singleEndpoint && (
                <span
                  className="absolute inset-y-1 left-1/2 right-0"
                  style={{ background: TEAL_BG_LIGHT }}
                />
              )}
              {isTo && from && !singleEndpoint && (
                <span
                  className="absolute inset-y-1 left-0 right-1/2"
                  style={{ background: TEAL_BG_LIGHT }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 h-10 w-10 flex items-center justify-center rounded-full",
                  isEndpoint && "text-white font-semibold",
                  !disabled && !isEndpoint && "hover:bg-muted"
                )}
                style={isEndpoint ? { background: TEAL } : undefined}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Year picker overlay — tap outside the grid to close */}
      {yearPickerOpen && (
        <div
          className="absolute inset-0 z-20 bg-white dark:bg-card flex flex-col"
          onClick={() => setYearPickerOpen(false)}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Select year</span>
            <button
              type="button"
              onClick={() => setYearPickerOpen(false)}
              aria-label="Close year picker"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div
            className="grid grid-cols-3 gap-2 px-3 pb-3"
            onClick={(e) => e.stopPropagation()}
          >
            {years.map((y) => {
              const selected = y === viewYear;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => handleYearPick(y)}
                  className={cn(
                    "h-11 rounded-xl text-sm font-semibold transition-colors",
                    selected
                      ? "text-white shadow-sm"
                      : "text-foreground/80 hover:bg-[#0D9488]/10 hover:text-[#0D9488]"
                  )}
                  style={selected ? { background: TEAL } : undefined}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = "Pick dates",
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const [warning, setWarning] = useState<string | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setDraft(value);
      setWarning(null);
    }
    setOpen(isOpen);
  };

  const commit = useCallback(
    (range: DateRange | undefined) => {
      onChange(range);
      setOpen(false);
      setWarning(null);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (d: Date) => {
      setWarning(null);

      // No start yet, or both already set → start a fresh range.
      if (!draft?.from || (draft.from && draft.to)) {
        setDraft({ from: d, to: undefined });
        return;
      }

      // Tapping a day before current `from` resets the start.
      if (isBefore(d, draft.from)) {
        setDraft({ from: d, to: undefined });
        return;
      }

      // Same day as `from` → one-day trip, commit & close.
      if (isSameDay(d, draft.from)) {
        commit({ from: draft.from, to: draft.from });
        return;
      }

      const span = differenceInCalendarDays(d, draft.from) + 1;
      if (span > MAX_TRIP_DAYS) {
        setWarning(`Maximum trip length is ${MAX_TRIP_DAYS} days`);
        return;
      }

      // Valid end date → commit & close.
      commit({ from: draft.from, to: d });
    },
    [draft, commit]
  );

  const handleClear = () => {
    setDraft(undefined);
    commit(undefined);
  };

  const label =
    value?.from && value?.to
      ? `${format(value.from, "MMM d")} — ${format(value.to, "MMM d")}`
      : value?.from
      ? `${format(value.from, "MMM d")} — …`
      : placeholder;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "justify-start text-left font-normal min-h-[44px]",
        !value?.from && "text-muted-foreground",
        className
      )}
    >
      <CalendarDays className="h-4 w-4 mr-2 shrink-0" />
      {label}
    </Button>
  );

  const showEndHint = !!draft?.from && !draft?.to;

  const pickerBody = (
    <div className="flex flex-col" style={{ width: isMobile ? "100%" : 340 }}>
      <SingleMonthCalendar draft={draft} onSelect={handleSelect} warning={warning} />
      {showEndHint && (
        <p className="text-[12px] text-muted-foreground text-center px-2 pt-2 leading-snug">
          Pick an end date — or tap the same day for a one-day trip
        </p>
      )}
      <div className="flex items-center justify-start px-1 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-xs gap-1 text-muted-foreground"
          disabled={!value?.from && !draft?.from}
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-2">
        <div onClick={() => handleOpen(!open)}>{trigger}</div>
        {open && <div>{pickerBody}</div>}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-2 z-[200]" align="start">
        {pickerBody}
      </PopoverContent>
    </Popover>
  );
}
