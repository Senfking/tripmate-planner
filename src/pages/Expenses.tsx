import { useGlobalExpenses } from "@/hooks/useGlobalExpenses";
import { Link } from "react-router-dom";
import { Wallet, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/settlementCalc";
import { cn } from "@/lib/utils";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";

const Expenses = () => {
  const { data, isLoading, isFetching } = useGlobalExpenses();
  // Show skeleton on initial load OR when refetching without any cached data
  const showSkeleton = isLoading || (!data && isFetching);
  const { overallNet = 0, currency = "EUR", trips = [] } = data ?? {};
  const hasExpenses = trips.length > 0;

  const subtitle = (() => {
    if (showSkeleton) return "Loading…";
    if (!hasExpenses) return "Track shared costs across all your trips";
    if (Math.abs(overallNet) < 0.01) return "All settled up across your trips";
    return `${trips.length} trip${trips.length !== 1 ? "s" : ""} with open balances`;
  })();

  if (showSkeleton) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
        <TabHeroHeader title="Expenses" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  const balanceLabel = !hasExpenses || Math.abs(overallNet) < 0.01
    ? "All settled"
    : overallNet > 0
    ? "You're owed"
    : "You owe";

  // When we have cached data but are refetching, dim the numbers slightly
  const isRefreshing = isFetching && !isLoading;

  const balanceDisplay = (
    <div className="mt-3 flex flex-col items-center">
      <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/40 mb-2">
        Total balance
      </p>
      <p className={cn(
        "text-[34px] font-extrabold text-white tracking-tight leading-none transition-opacity duration-300",
        isRefreshing && "opacity-50"
      )}>
        {!hasExpenses || Math.abs(overallNet) < 0.01
          ? "€0.00"
          : formatCurrency(Math.abs(overallNet), currency)}
      </p>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
          !hasExpenses || Math.abs(overallNet) < 0.01
            ? "bg-white/10 text-white/60"
            : overallNet > 0
            ? "bg-emerald-400/15 text-emerald-200"
            : "bg-orange-400/15 text-orange-200"
        )}
      >
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          !hasExpenses || Math.abs(overallNet) < 0.01
            ? "bg-white/40"
            : overallNet > 0
            ? "bg-emerald-300"
            : "bg-orange-300"
        )} />
        {balanceLabel}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Expenses" subtitle={subtitle}>
        {balanceDisplay}
      </TabHeroHeader>

      {/* Desktop: subtle teal gradient strip */}
      <div className="hidden md:block h-1" style={{ background: "linear-gradient(90deg, #0D9488, #0891b2, transparent)" }} />

      {!hasExpenses ? (
        <div className="flex flex-col items-center justify-center pt-20 text-center px-4 mt-4 md:max-w-[900px] md:mx-auto md:px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <Wallet className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">No expenses yet</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            Add expenses inside your trips to track who owes what.
          </p>
        </div>
      ) : (
        <div className="space-y-3 px-4 mt-4 pb-24 md:max-w-[900px] md:mx-auto md:px-8">
          {/* Net balance summary */}
          <div className="text-center py-4 border-b border-border">
            <p className={cn(
              "text-[15px] font-semibold",
              Math.abs(overallNet) < 0.01
                ? "text-muted-foreground"
                : overallNet > 0
                ? "text-emerald-600"
                : "text-orange-600"
            )}>
              {Math.abs(overallNet) < 0.01
                ? "You're all settled up"
                : overallNet > 0
                ? `You're owed ${formatCurrency(Math.abs(overallNet), currency)} net across all trips`
                : `You owe ${formatCurrency(Math.abs(overallNet), currency)} net across all trips`}
            </p>
          </div>
          {trips.map((trip) => {
            const isSettled = Math.abs(trip.net) < 0.01;
            const isPositive = trip.net > 0;

            return (
              <Link
                key={trip.tripId}
                to={`/app/trips/${trip.tripId}/expenses`}
                className="group block rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] active:scale-[0.98] transition-transform"
              >
                {/* Photo header */}
                <div className="relative h-[72px] overflow-hidden">
                  <img
                    src={trip.photoUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 100%)",
                    }}
                  />
                  <div className="relative z-10 flex items-center justify-between h-full px-4">
                    <p className="text-[15px] font-bold text-white truncate">
                      {trip.tripName}
                    </p>
                    <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
                  </div>
                </div>

                {/* Balance row */}
                <div className="bg-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      isSettled ? "bg-muted-foreground/20" : isPositive ? "bg-emerald-500" : "bg-orange-500"
                    )} />
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {isSettled ? "All settled" : isPositive ? "You're owed" : "You owe"}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[17px] font-bold tabular-nums transition-opacity duration-300",
                    isRefreshing && "opacity-50",
                    isSettled
                      ? "text-muted-foreground/50"
                      : isPositive
                      ? "text-emerald-600"
                      : "text-orange-600"
                  )}>
                    {isSettled
                      ? "€0.00"
                      : `${isPositive ? "+" : "−"}${formatCurrency(Math.abs(trip.net), trip.currency)}`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Expenses;
