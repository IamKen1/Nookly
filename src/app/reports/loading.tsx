import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonStatCards } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonBar className="h-7 w-32" />
      <SkeletonStatCards count={3} />
      <SkeletonBar className="mt-6 h-72 w-full rounded-2xl" />
    </AppShellSkeleton>
  );
}
