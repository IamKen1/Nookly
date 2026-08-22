// Shared building blocks for route loading.tsx fallbacks. Shaped like the
// real content (table rows, stat cards, form fields) instead of a bare
// spinner, so the transition feels like the page is arriving, not resetting.

export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-100 ${className}`} />;
}

export function SkeletonHeader({ actionCount = 0 }: { actionCount?: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <SkeletonBar className="h-7 w-40" />
        <SkeletonBar className="mt-2 h-4 w-56" />
      </div>
      {actionCount > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actionCount }).map((_, i) => (
            <SkeletonBar key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}

export function SkeletonStatCards({ count }: { count: 2 | 3 | 4 }) {
  const gridClass = count === 2 ? "grid-cols-2" : count === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4";
  return (
    <div className={`mt-8 grid gap-4 ${gridClass}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-6">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="mt-2 h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableCard({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonBar key={i} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-zinc-50">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonBar key={c} className={`h-4 ${c === 0 ? "w-32" : "w-16"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonListCard({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white divide-y divide-zinc-50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-4 py-4">
          <SkeletonBar className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <SkeletonBar className="h-4 w-1/3" />
            <SkeletonBar className="mt-2 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonFormCard({ fields = 4 }: { fields?: number }) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="mt-2 h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
