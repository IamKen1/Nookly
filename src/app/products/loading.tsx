import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonHeader, SkeletonTableCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonHeader actionCount={2} />
      <SkeletonBar className="mt-6 h-10 w-full rounded-lg" />
      <SkeletonTableCard cols={5} rows={7} />
    </AppShellSkeleton>
  );
}
