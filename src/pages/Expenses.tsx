import { DollarSign } from "lucide-react";

const Expenses = () => (
  <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center px-8 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
      <DollarSign className="h-8 w-8 text-primary" />
    </div>
    <h1 className="mt-5 text-[22px] font-bold text-foreground">Your Balance</h1>
    <p className="mt-3 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">
      Your net balance across all trips at a glance. See who you owe and who owes you — without opening each trip individually.
    </p>
    <span className="mt-5 inline-flex rounded-full border border-primary/30 px-3.5 py-1 text-xs font-medium text-primary">
      Coming soon
    </span>
  </div>
);

export default Expenses;
