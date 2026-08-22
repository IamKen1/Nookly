import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonStatCards } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <div>
        <SkeletonBar className="h-7 w-64" />
        <SkeletonBar className="mt-2 h-4 w-40" />
        <SkeletonStatCards count={4} />
        <div className="mt-8 flex gap-3">
          <SkeletonBar className="h-10 w-32 rounded-full" />
          <SkeletonBar className="h-10 w-40 rounded-full" />
        </div>
      </div>
    </AppShellSkeleton>
  );
}
