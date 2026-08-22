// POS doesn't use AppShell (its own full-screen header, no sidebar), so this
// mirrors PosClient's actual chrome instead of the shared AppShellSkeleton.
export default function Loading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between bg-emerald-700 px-4 text-white">
        <div className="h-4 w-24 animate-pulse rounded bg-white/20" />
        <div className="flex items-center gap-1.5">
          <div className="h-7 w-24 animate-pulse rounded-lg bg-white/10" />
          <div className="h-7 w-24 animate-pulse rounded-lg bg-white/10" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-gray-200 bg-white p-3 shadow-sm md:p-4">
            <div className="h-10 w-full animate-pulse rounded-xl bg-gray-100" />
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-7 w-20 shrink-0 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-2.5">
                  <div className="mb-2 aspect-square animate-pulse rounded-lg bg-gray-100" />
                  <div className="mb-1.5 h-3 animate-pulse rounded bg-gray-100" />
                  <div className="mb-2 h-3 w-2/3 animate-pulse rounded bg-gray-100" />
                  <div className="h-7 animate-pulse rounded-lg bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden h-full w-80 shrink-0 border-l border-gray-200 bg-white md:block xl:w-96" />
      </div>
    </div>
  );
}
