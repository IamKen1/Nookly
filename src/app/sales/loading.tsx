import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonTableCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-7 w-24" />
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="mt-2 h-5 w-24" />
        </div>
      </div>
      <SkeletonTableCard cols={6} rows={7} />
    </AppShellSkeleton>
  );
}
