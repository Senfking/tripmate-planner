import React, { useState } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { DateRangeFilter, Period, SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";

export function FeatureAdoptionModule() {
  const [period, setPeriod] = useState<Period>("all");
  const { data, isLoading } = useAdminData("feature_adoption", { period });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>Feature Adoption</h1>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading ? <AdminSkeleton rows={8} /> : !data ? <EmptyState /> : (
        <>
          <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, marginBottom: 16 }}>
            {data.total} trips analyzed
          </div>

          <Card>
            {data.features?.map((f: any) => (
              <div key={f.name} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: sans, fontSize: 13, color: C.text }}>{f.name}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.tealLight }}>{f.pct}% ({f.count}/{f.total})</span>
                </div>
                <div style={{ background: C.elevated, borderRadius: 4, height: 8 }}>
                  <div style={{ background: C.tealLight, borderRadius: 4, height: 8, width: `${Math.min(100, parseFloat(f.pct))}%`, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </Card>

          <SectionHeader>Module Toggle Adoption</SectionHeader>
          <Card>
            {data.modules?.length ? data.modules.map((m: any) => (
              <div key={m.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: sans, fontSize: 13, color: C.text }}>{m.name}</span>
                <span style={{ fontFamily: mono, fontSize: 12, color: C.tealLight }}>{m.pct}% ({m.count})</span>
              </div>
            )) : <EmptyState message="No module data" />}
          </Card>
        </>
      )}
    </div>
  );
}
