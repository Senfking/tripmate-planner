import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type TemplateRow = {
  slug: string;
  destination: string;
  duration_days: number;
  category: string;
  cached_at: string | null;
  cached_from_trip_id: string | null;
};

type CandidatePlan = {
  id: string;
  created_at: string;
  trip_id: string | null;
  result: any;
};

export default function AdminTemplates() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [promoteFor, setPromoteFor] = useState<TemplateRow | null>(null);

  const refresh = async () => {
    setFetching(true);
    const { data, error } = await (supabase as any)
      .from("trip_templates")
      .select("slug,destination,duration_days,category,cached_at,cached_from_trip_id")
      .order("category", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as TemplateRow[]);
    }
    setFetching(false);
  };

  useEffect(() => {
    if (user && isAdminUser(user.id)) refresh();
  }, [user]);

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!user || !isAdminUser(user.id)) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/app/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Trip templates</h1>
          <Button variant="ghost" size="sm" onClick={refresh} className="ml-auto">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>

        {fetching ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Days</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Cached</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{r.slug}</td>
                    <td className="px-4 py-3">{r.destination}</td>
                    <td className="px-4 py-3">{r.duration_days}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                    <td className="px-4 py-3">
                      {r.cached_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {format(new Date(r.cached_at), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => setPromoteFor(r)}>
                        Promote trip to cache
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {promoteFor && (
        <PromoteDialog
          template={promoteFor}
          onClose={() => setPromoteFor(null)}
          onPromoted={async () => {
            setPromoteFor(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function PromoteDialog({
  template,
  onClose,
  onPromoted,
}: {
  template: TemplateRow;
  onClose: () => void;
  onPromoted: () => void;
}) {
  const [plans, setPlans] = useState<CandidatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch recent plans, then filter client-side for matching destination —
      // RLS prevents server-side ILIKE on jsonb without an admin function.
      const { data, error } = await (supabase as any)
        .from("ai_trip_plans")
        .select("id,created_at,trip_id,result")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        toast.error(error.message);
      } else {
        const needle = template.destination.toLowerCase();
        const filtered = (data ?? []).filter((p: any) => {
          const name: string | undefined = p.result?.destinations?.[0]?.name;
          return name && name.toLowerCase().includes(needle);
        });
        setPlans(filtered as CandidatePlan[]);
      }
      setLoading(false);
    })();
  }, [template.destination]);

  const handlePromote = async (planId: string) => {
    setSubmitting(true);
    const { error } = await (supabase as any).rpc("admin_promote_plan_to_template", {
      _slug: template.slug,
      _plan_id: planId,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Template cache updated");
    onPromoted();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Promote a trip to {template.slug} cache</DialogTitle>
          <DialogDescription>
            Pick a recent AI plan whose destination matches "{template.destination}".
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No matching plans found in the last 50 generations.
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.result?.trip_title || p.result?.destinations?.[0]?.name || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.created_at), "MMM d, yyyy · HH:mm")} · {p.id.slice(0, 8)}
                  </p>
                </div>
                <Button size="sm" disabled={submitting} onClick={() => handlePromote(p.id)}>
                  Promote
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
