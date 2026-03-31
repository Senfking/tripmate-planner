import { useGlobalExpenses } from "@/hooks/useGlobalExpenses";
import { Link } from "react-router-dom";
import { Wallet, ArrowRight, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/settlementCalc";
import { cn } from "@/lib/utils";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";

const Expenses = () => {
  const { data, isLoading } = useGlobalExpenses();
  const { overallNet = 0, currency = "EUR", trips = [] } = data ?? {};
  const hasExpenses = trips.length > 0;

  const subtitle = (() => {
    if (isLoading) return "Loading…";
    if (!hasExpenses) return "Track shared costs across all your trips";
    if (Math.abs(overallNet) < 0.01) return "All settled up across your trips";
    return `${trips.length} trip${trips.length !== 1 ? "s" : ""} with open balances`;
  })();

  if (isLoading) {
    return (
      <div className="min-h-[calc(100dvh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
        <TabHeroHeader title="Expenses" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Centered balance display
  const balanceDisplay = (
    <div className="mt-3 flex flex-col items-center">
      <div className="flex items-center gap-2">
        {hasExpenses && Math.abs(overallNet) >= 0.01 && (
          overallNet > 0
            ? <TrendingUp className="h-5 w-5 text-emerald-300" />
            : <TrendingDown className="h-5 w-5 text-orange-300" />
        )}
        {hasExpenses && Math.abs(overallNet) < 0.01 && (
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
        )}
        <p className="text-[34px] font-extrabold text-white tracking-tight leading-none">
          {!hasExpenses || Math.abs(overallNet) < 0.01
            ? "€0"
            : formatCurrency(Math.abs(overallNet), currency)}
        </p>
      </div>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-white/50 mt-1.5">
        {!hasExpenses || Math.abs(overallNet) < 0.01
          ? "All settled"
          : overallNet > 0
          ? "You're owed"
          : "You owe"}
      </p>
    </div>
  );

  return (
    <div className="min-h-[calc(100dvh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Expenses" subtitle={subtitle}>
        {balanceDisplay}
      </TabHeroHeader>

      {!hasExpenses ? (
        <div className="flex flex-col items-center justify-center pt-20 text-center px-4 mt-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <Wallet className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">No expenses yet</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            Add expenses inside your trips to track who owes what.
          </p>
        </div>
      ) : (
        <div className="space-y-2 px-4 mt-4 pb-24">
          {trips.map((trip) => (
            <Link
              key={trip.tripId}
              to={`/app/trips/${trip.tripId}/expenses`}
              className="group flex items-center gap-3 bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 active:scale-[0.98] transition-transform"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground truncate">
                  {trip.tripEmoji ?? "✈️"} {trip.tripName}
                </p>
                <p className={cn(
                  "text-sm font-medium mt-0.5",
                  trip.net > 0 ? "text-emerald-600" : trip.net < 0 ? "text-orange-600" : "text-muted-foreground"
                )}>
                  {Math.abs(trip.net) < 0.01
                    ? "Settled"
                    : `${trip.net > 0 ? "+" : "-"}${formatCurrency(Math.abs(trip.net), trip.currency)}`}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Expenses;
