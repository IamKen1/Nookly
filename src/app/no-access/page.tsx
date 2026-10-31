import { requireSession } from "@/lib/require-session";
import LogoutButton from "@/components/app/LogoutButton";

// Shown when a role has every module unticked in Settings > User Access.
export default async function NoAccessPage() {
  await requireSession();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-zinc-900">No access yet</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Your account doesn&apos;t have access to any part of Nookly. Ask the workspace owner to turn on the modules you need in Settings › User Access.
        </p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
