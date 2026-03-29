import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Settlement, formatCurrency } from "@/lib/settlementCalc";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettleConfirmDrawer } from "./SettleConfirmDrawer";

interface Props {
  settlements: Settlement[];
  currency: string;
  onSettle: (data: {
    title: string;
    amount: number;
    currency: string;
    category: string;
    incurred_on: string;
    payer_id: string;
    notes: string;
    splits: { user_id: string; share_amount: number }[];
  }) => void;
}

export function SettleUpSection({ settlements, currency, onSettle }: Props) {
  const { user } = useAuth();
  const [confirmSettlement, setConfirmSettlement] = useState<Settlement | null>(null);

  if (settlements.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Settle Up
        </h3>
        <div className="space-y-2">
          {settlements.map((s, i) => {
            const iAmDebtor = s.from === user?.id;
            const iAmCreditor = s.to === user?.id;

            return (
              <div
                key={i}
                className={`rounded-lg border p-2.5 ${
                  iAmDebtor
                    ? "border-l-[3px] border-l-teal-400 bg-teal-50/30 dark:bg-teal-950/20"
                    : iAmCreditor
                    ? "border-l-[3px] border-l-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm min-w-0">
                    {iAmDebtor ? (
                      <span>
                        You owe <span className="font-medium">{s.toName}</span>
                      </span>
                    ) : iAmCreditor ? (
                      <span>
                        <span className="font-medium">{s.fromName}</span>
                        <ArrowRight className="inline h-3.5 w-3.5 mx-1 text-muted-foreground" />
                        You
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        <span className="truncate max-w-[80px] inline-block align-bottom">{s.fromName}</span>
                        <ArrowRight className="inline h-3.5 w-3.5 mx-1" />
                        <span className="truncate max-w-[80px] inline-block align-bottom">{s.toName}</span>
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-sm whitespace-nowrap">
                    {formatCurrency(s.amount, currency)}
                  </span>
                </div>

                {(iAmDebtor || iAmCreditor) && (
                  <div className="flex justify-end mt-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-xs gap-1.5 ${
                        iAmDebtor
                          ? "border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/40"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      }`}
                      onClick={() => setConfirmSettlement(s)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {iAmDebtor ? "I paid this" : "Mark as received"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <SettleConfirmDrawer
        settlement={confirmSettlement}
        currency={currency}
        onOpenChange={(open) => { if (!open) setConfirmSettlement(null); }}
        onConfirm={(data) => {
          onSettle(data);
          setConfirmSettlement(null);
        }}
      />
    </>
  );
}
