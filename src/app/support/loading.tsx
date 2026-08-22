import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonListCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonBar className="h-7 w-40" />
      <SkeletonListCard rows={5} />
    </AppShellSkeleton>
  );
}
