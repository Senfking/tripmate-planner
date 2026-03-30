import { useGlobalExpenses } from "@/hooks/useGlobalExpenses";
import { Link } from "react-router-dom";
import { Wallet, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/settlementCalc";
import { cn } from "@/lib/utils";

const Expenses = () => {
  const { data, isLoading } = useGlobalExpenses();

  if (isLoading) {
    return (
      <div className="min-h-[calc(100dvh-10rem)] bg-[#F1F5F9] px-4 pb-24 pt-6">
        <div className="h-7 w-28 rounded-lg skeleton-shimmer mb-4" />
        <div className="h-[100px] rounded-[14px] skeleton-shimmer mb-4" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  const { overallNet = 0, currency = "EUR", trips = [] } = data ?? {};
  const hasExpenses = trips.length > 0;

  return (
    <div className="min-h-[calc(100dvh-10rem)] bg-[#F1F5F9] px-4 pb-24 pt-6 overflow-x-hidden">
      <h1 className="mb-4 text-[22px] font-bold text-foreground">Expenses</h1>

      {!hasExpenses ? (
        <div className="flex flex-col items-center justify-center pt-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <Wallet className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">No expenses yet</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            Add expenses inside your trips to track who owes what.
          </p>
        </div>
      ) : (
        <>
          {/* Overall balance hero */}
          <div className="bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-4 text-center">
            {Math.abs(overallNet) < 0.01 ? (
              <div className="flex flex-col items-center gap-1">
                <CheckCircle2 className="h-8 w-8 text-[#0D9488]" />
                <p className="text-lg font-bold text-[#0D9488] mt-1">You're all settled up</p>
              </div>
            ) : overallNet > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">You are owed</p>
                <p className="text-2xl font-bold text-[#0D9488] mt-0.5">
                  {formatCurrency(overallNet, currency)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">You owe</p>
                <p className="text-2xl font-bold text-[#EF4444] mt-0.5">
                  {formatCurrency(Math.abs(overallNet), currency)}
                </p>
              </>
            )}
          </div>

          {/* Per-trip breakdown */}
          <div className="space-y-2">
            {trips.map((trip) => (
              <div
                key={trip.tripId}
                className="bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 flex items-center gap-3"
              >
                <span className="text-xl">{trip.tripEmoji ?? "✈️"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground truncate">
                    {trip.tripName}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      trip.net > 0.005
                        ? "text-[#0D9488]"
                        : trip.net < -0.005
                        ? "text-[#EF4444]"
                        : "text-muted-foreground"
                    )}
                  >
                    {trip.net > 0.005
                      ? `Owed ${formatCurrency(trip.net, trip.currency)}`
                      : trip.net < -0.005
                      ? `Owe ${formatCurrency(Math.abs(trip.net), trip.currency)}`
                      : "Settled"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 gap-1 text-xs" asChild>
                  <Link to={`/app/trips/${trip.tripId}/expenses`}>
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Expenses;
