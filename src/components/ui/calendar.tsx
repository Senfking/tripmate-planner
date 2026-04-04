import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { DayPicker, CaptionProps, useNavigation } from "react-day-picker";
import { setMonth, setYear } from "date-fns";

import { cn } from "@/lib/utils";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type PickerStep = "days" | "year" | "month";

function SteppedCaption({ displayMonth }: CaptionProps) {
  const { goToMonth } = useNavigation();
  const [step, setStep] = React.useState<PickerStep>("days");
  const [pendingYear, setPendingYear] = React.useState(displayMonth.getFullYear());
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);

  React.useEffect(() => {
    setPendingYear(displayMonth.getFullYear());
  }, [displayMonth]);

  if (step === "year") {
    return (
      <div className="space-y-2 pb-1">
        <p className="text-center text-xs font-medium text-muted-foreground">Select year</p>
        <div className="grid grid-cols-3 gap-1.5 px-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { setPendingYear(y); setStep("month"); }}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                y === displayMonth.getFullYear()
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === "month") {
    return (
      <div className="space-y-2 pb-1">
        <p className="text-center text-xs font-medium text-muted-foreground">{pendingYear}</p>
        <div className="grid grid-cols-3 gap-1.5 px-1">
          {MONTH_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                goToMonth(setMonth(setYear(displayMonth, pendingYear), i));
                setStep("days");
              }}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                i === displayMonth.getMonth() && pendingYear === displayMonth.getFullYear()
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center pt-1 relative items-center">
      <button
        type="button"
        onClick={() => setStep("year")}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-medium hover:bg-accent transition-colors"
      >
        {MONTH_SHORT[displayMonth.getMonth()]} {displayMonth.getFullYear()}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-white dark:bg-card rounded-xl", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          "inline-flex items-center justify-center",
          "h-8 w-8 bg-transparent rounded-full border border-border/40 p-0",
          "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "h-9 w-9 text-center text-sm p-0 relative",
          "[&:has([aria-selected].day-range-end)]:rounded-r-xl",
          "[&:has([aria-selected].day-outside)]:bg-primary/5",
          "[&:has([aria-selected])]:bg-primary/10",
          "first:[&:has([aria-selected])]:rounded-l-xl",
          "last:[&:has([aria-selected])]:rounded-r-xl",
          "focus-within:relative focus-within:z-20",
        ),
        day: cn(
          "h-9 w-9 p-0 font-normal rounded-xl transition-colors",
          "hover:bg-primary/10 hover:text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1",
          "aria-selected:opacity-100",
        ),
        day_range_end: "day-range-end",
        day_selected: cn(
          "bg-primary text-primary-foreground",
          "hover:bg-primary hover:text-primary-foreground",
          "focus:bg-primary focus:text-primary-foreground",
          "rounded-xl",
        ),
        day_today: "bg-primary/12 text-foreground font-medium",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-primary/5 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: SteppedCaption,
        IconLeft: ({ ..._props }: any) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }: any) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
