import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonHeader, SkeletonTableCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonHeader actionCount={1} />
      <SkeletonTableCard cols={4} rows={6} />
    </AppShellSkeleton>
  );
}
