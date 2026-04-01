function SkeletonCard() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        minHeight: 110,
        borderRadius: 16,
        background: "hsl(var(--muted))",
      }}
    >
      <div className="flex items-center px-4 py-[18px] gap-3">
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="h-[18px] w-[18px] rounded bg-muted-foreground/15 animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted-foreground/15 animate-pulse" />
          </div>
          <div className="h-3 w-48 rounded bg-muted-foreground/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-12">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
