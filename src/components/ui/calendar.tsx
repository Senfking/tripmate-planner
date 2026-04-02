import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { DayPicker, CaptionProps, useNavigation } from "react-day-picker";
import { format, setMonth, setYear } from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function DropdownCaption({ displayMonth }: CaptionProps) {
  const { goToMonth } = useNavigation();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);

  return (
    <div className="flex items-center justify-center gap-1.5 pt-1">
      <div className="relative">
        <select
          value={displayMonth.getMonth()}
          onChange={(e) => goToMonth(setMonth(displayMonth, parseInt(e.target.value)))}
          className="appearance-none cursor-pointer h-8 rounded-lg bg-accent/60 pl-2.5 pr-6 text-sm font-medium text-foreground border-0 outline-none focus:ring-2 focus:ring-primary/30 hover:bg-accent transition-colors"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="relative">
        <select
          value={displayMonth.getFullYear()}
          onChange={(e) => goToMonth(setYear(displayMonth, parseInt(e.target.value)))}
          className="appearance-none cursor-pointer h-8 rounded-lg bg-accent/60 pl-2.5 pr-6 text-sm font-medium text-foreground border-0 outline-none focus:ring-2 focus:ring-primary/30 hover:bg-accent transition-colors"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  showMonthYearDropdowns?: boolean;
};

function Calendar({ className, classNames, showOutsideDays = true, showMonthYearDropdowns, ...props }: CalendarProps) {
  const customComponents = showMonthYearDropdowns
    ? {
        Caption: DropdownCaption,
        IconLeft: ({ ..._props }: any) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }: any) => <ChevronRight className="h-4 w-4" />,
      }
    : {
        IconLeft: ({ ..._props }: any) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }: any) => <ChevronRight className="h-4 w-4" />,
      };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={customComponents}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
