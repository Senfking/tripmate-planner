import { Vote } from "lucide-react";

const Decisions = () => (
  <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center px-8 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
      <Vote className="h-8 w-8 text-primary" />
    </div>
    <h1 className="mt-5 text-[22px] font-bold text-foreground">Decisions</h1>
    <p className="mt-3 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">
      All your pending votes across every trip — in one place. Destination votes, date options, preference polls — see what needs your input without opening each trip.
    </p>
    <span className="mt-5 inline-flex rounded-full border border-primary/30 px-3.5 py-1 text-xs font-medium text-primary">
      Coming soon
    </span>
  </div>
);

export default Decisions;
