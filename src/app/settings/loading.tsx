import AppShellSkeleton from "@/components/app/AppShellSkeleton";
import { SkeletonBar, SkeletonFormCard } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShellSkeleton>
      <SkeletonBar className="h-7 w-32" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBar key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <SkeletonFormCard fields={4} />
    </AppShellSkeleton>
  );
}
