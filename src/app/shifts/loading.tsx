import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonStatCards, SkeletonTableCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonBar className="h-7 w-56" />
      <SkeletonStatCards count={4} />
      <SkeletonTableCard cols={7} rows={6} />
    </AppShellSkeleton>
  );
}
