function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        <div className="h-3 w-44 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-5 w-16 rounded-full bg-muted animate-pulse shrink-0" />
    </div>
  );
}

function SkeletonPlanCard() {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-4 flex items-center gap-3">
      <div className="h-[80px] w-[80px] rounded-xl bg-muted animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        <div className="h-3 w-48 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="pb-12 px-4 md:max-w-[700px] md:mx-auto md:px-8 flex flex-col gap-3">
      {/* Quick actions skeleton */}
      <div className="flex items-center justify-center gap-6 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
            <div className="h-2.5 w-10 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <SkeletonPlanCard />
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
