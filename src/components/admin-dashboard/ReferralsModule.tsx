import React from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";

export function ReferralsModule() {
  const { data: leaderboard, isLoading: ll } = useAdminData("referral_leaderboard");
  const { data: chain, isLoading: cl } = useAdminData("referral_chain");

  return (
    <div>
      <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 24 }}>Referrals</h1>

      <SectionHeader>Leaderboard</SectionHeader>
      {ll ? <AdminSkeleton rows={10} /> : !leaderboard?.length ? <EmptyState message="No referrals yet" /> : (
        <Card>
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
              {["User", "Code", "Referred", "Conversion %"].map(h => (
                <th key={h} style={{ textAlign: h === "User" ? "left" : "right", padding: 8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {leaderboard.map((r: any, i: number) => (
                <tr key={r.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 8, color: C.text }}>{i + 1}. {r.display_name}</td>
                  <td style={{ padding: 8, color: C.muted, textAlign: "right", fontFamily: mono, fontSize: 11 }}>{r.referral_code}</td>
                  <td style={{ padding: 8, color: C.tealLight, textAlign: "right", fontFamily: mono }}>{r.referred_count}</td>
                  <td style={{ padding: 8, color: parseFloat(r.conversion_pct) > 50 ? C.green : C.amber, textAlign: "right", fontFamily: mono }}>{r.conversion_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionHeader>Referral Chain</SectionHeader>
      {cl ? <AdminSkeleton rows={10} /> : !chain?.length ? <EmptyState message="No referred users yet" /> : (
        <Card>
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
              {["New User", "Joined", "Referred By", "Days to Trip"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: 8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {chain.map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 8, color: C.text }}>{r.display_name || "-"}</td>
                  <td style={{ padding: 8, color: C.muted, fontFamily: mono, fontSize: 11 }}>{r.created_at?.slice(0, 10)}</td>
                  <td style={{ padding: 8, color: C.text }}>{r.referred_by_name}</td>
                  <td style={{ padding: 8, color: r.days_to_first_trip !== null ? C.tealLight : C.muted, fontFamily: mono }}>
                    {r.days_to_first_trip !== null ? `${r.days_to_first_trip}d` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
