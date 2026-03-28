import { CalendarDays } from "lucide-react";

const Itinerary = () => (
  <div className="flex flex-col items-center justify-center gap-4 p-8 pt-24 text-center">
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
      <CalendarDays className="h-10 w-10 text-primary" />
    </div>
    <h1 className="text-2xl font-bold text-foreground">Itinerary</h1>
    <p className="max-w-sm text-muted-foreground">Build your day-by-day travel plan together.</p>
  </div>
);

export default Itinerary;
