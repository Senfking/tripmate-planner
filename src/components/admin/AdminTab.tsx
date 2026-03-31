import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";
import { Copy, Loader2, Info, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { MemberRow } from "./MemberRow";
import { DeleteTripDialog } from "./DeleteTripDialog";

interface AdminTabProps {
  tripId: string;
  myRole: string | undefined;
  tripName: string;
}

export function AdminTab({ tripId, myRole, tripName }: AdminTabProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  /* ── Members ───────────────────────────────── */
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["admin-members", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at, attendance_status")
        .eq("trip_id", tripId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      const userIds = (data || []).map((m) => m.user_id);
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { _user_ids: userIds });
      const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name]));
      return (data || []).map((m) => ({
        ...m,
        display_name: profileMap.get(m.user_id) || null,
        attendance_status: (m as any).attendance_status ?? "pending",
      }));
    },
    enabled: !!user,
  });

  const roleAction = useMutation({
    mutationFn: async ({ targetUserId, newRole }: { targetUserId: string; newRole: string }) => {
      const { data, error } = await supabase.rpc("update_member_role", {
        _trip_id: tripId,
        _target_user_id: targetUserId,
        _new_role: newRole,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members", tripId] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e.message || "Failed to update role"),
  });

  const removeMember = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc("remove_trip_member", {
        _trip_id: tripId,
        _target_user_id: targetUserId,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-members-count", tripId] });
      toast.success("Member removed");
    },
    onError: (e) => toast.error(e.message || "Failed to remove member"),
  });

  /* ── Trip settings (share permission) ──────── */
  const { data: trip } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").eq("id", tripId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const sharePermission = (trip as any)?.share_permission ?? "all";

  const updateSharePerm = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from("trips")
        .update({ share_permission: value } as any)
        .eq("id", tripId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success("Setting updated");
    },
    onError: () => toast.error("Failed to update setting"),
  });

  /* ── Trip stats ────────────────────────────── */
  const { data: stats } = useQuery({
    queryKey: ["admin-stats", tripId],
    queryFn: async () => {
      const [items, attachments, expenses] = await Promise.all([
        supabase.from("itinerary_items").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
        supabase.from("attachments").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
      ]);
      return {
        itinerary: items.count ?? 0,
        attachments: attachments.count ?? 0,
        expenses: expenses.count ?? 0,
      };
    },
    enabled: !!user,
  });

  /* ── Danger zone actions ───────────────────── */
  const [dangerOpen, setDangerOpen] = useState(false);

  const leaveTrip = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("remove_trip_member", {
        _trip_id: tripId,
        _target_user_id: user!.id,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("You left the trip");
      navigate("/app/trips");
    },
    onError: (e) => toast.error(e.message || "Failed to leave trip"),
  });

  const deleteTrip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trip deleted");
      navigate("/app/trips");
    },
    onError: () => toast.error("Failed to delete trip"),
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (membersLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Members ──────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Members</h2>
        <Card className="divide-y divide-border">
          {(members || []).map((m) => (
            <div key={m.user_id} className="px-3">
              <MemberRow
                userId={m.user_id}
                displayName={m.display_name}
                role={m.role}
                joinedAt={m.joined_at}
                attendanceStatus={m.attendance_status}
                myRole={myRole}
                myUserId={user!.id}
                onPromote={(id) => roleAction.mutate({ targetUserId: id, newRole: "admin" })}
                onDemote={(id) => roleAction.mutate({ targetUserId: id, newRole: "member" })}
                onRemove={(id) => removeMember.mutate(id)}
              />
            </div>
          ))}
        </Card>
      </section>

      {/* ── Trip Settings ────────────────────────── */}
      {isAdmin && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">Trip Settings</h2>
          <Card className="p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Who can generate share links?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls who can create invite and share links
              </p>
            </div>
            <RadioGroup
              value={sharePermission}
              onValueChange={(v) => updateSharePerm.mutate(v)}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="share-all" />
                <Label htmlFor="share-all" className="text-sm">Anyone in the trip</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admin" id="share-admin" />
                <Label htmlFor="share-admin" className="text-sm">Admins and owner only</Label>
              </div>
            </RadioGroup>
          </Card>
        </section>
      )}

      {/* ── Trip Info ────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Trip Info</h2>
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Trip Code</p>
              <p className="text-sm font-mono">{(trip as any)?.trip_code ?? "—"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => copyToClipboard((trip as any)?.trip_code || "")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm">
              {trip?.created_at ? format(new Date(trip.created_at), "MMM d, yyyy") : "—"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="text-center">
              <p className="text-lg font-semibold">{stats?.itinerary ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">Itinerary</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{stats?.attachments ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">Bookings</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{stats?.expenses ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">Expenses</p>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Danger Zone ──────────────────────────── */}
      <section>
        <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2 w-full">
            <AlertTriangle className="h-3.5 w-3.5" />
            Danger Zone
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {dangerOpen ? "collapse" : "expand"}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="border-destructive/40 p-4 space-y-3">
              {/* Leave trip — non-owners */}
              {!isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10">
                      Leave this trip
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave trip?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll lose access to this trip's data. You can rejoin later if someone invites you.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => leaveTrip.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {leaveTrip.isPending ? "Leaving…" : "Leave trip"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Delete trip — owner only */}
              {isOwner && (
                <DeleteTripDialog
                  tripName={tripName}
                  onConfirm={() => deleteTrip.mutate()}
                  isPending={deleteTrip.isPending}
                />
              )}

              {!isOwner && !isAdmin && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Only admins and owners can manage trip settings
                </p>
              )}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </div>
  );
}
