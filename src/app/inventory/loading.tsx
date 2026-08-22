import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonHeader, SkeletonTableCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonHeader />
      <SkeletonTableCard cols={5} rows={7} />
    </AppShellSkeleton>
  );
}
