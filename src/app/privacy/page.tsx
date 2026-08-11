import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import { getSession } from "@/lib/session";

export const metadata = { title: "Privacy Policy — Nookly" };

export default async function PrivacyPage() {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col bg-white">
      <Nav isAuthenticated={Boolean(session)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-zinc mt-8 max-w-none space-y-6 text-sm leading-relaxed text-zinc-700">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900">1. What we collect</h2>
            <p>
              When you sign up, we collect your pharmacy&apos;s name, address, and contact number, and your name,
              email, and username as the workspace owner. As you use Nookly, your workspace stores the data you
              enter — products, staff accounts, sales, customers, and prescription records — scoped exclusively to
              your workspace.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">2. How we use it</h2>
            <p>
              We use this information to operate your workspace, process your plan-change requests, respond to
              support tickets, and send operational emails (e.g. low-stock alerts, daily summaries) if you enable
              them. We do not sell your data or your customers&apos; data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">3. Tenant isolation</h2>
            <p>
              Nookly is multi-tenant software: every workspace&apos;s data is logically separated and every request
              is scoped to the signed-in workspace. Nookly&apos;s platform administrators can access workspace data
              only through an internally audited process (every access is logged) for support and billing purposes
              — never for any other reason.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">4. Sensitive information</h2>
            <p>
              Prescription and customer health information you store in Nookly is treated as sensitive personal
              information under the Philippine Data Privacy Act of 2012. You act as the personal information
              controller for your customers&apos; data; Nookly acts as a personal information processor on your
              behalf.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">5. Data retention &amp; deletion</h2>
            <p>
              We retain your workspace data for as long as your account is active. If you close your workspace, you
              may request export or deletion of your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">6. Security</h2>
            <p>
              Passwords are hashed, sessions are signed and expire, and the platform&apos;s administrative console is
              access-controlled separately from normal login. No system is perfectly secure, but we take reasonable
              measures to protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">7. Your rights</h2>
            <p>
              You may request access to, correction of, or deletion of personal information we hold about you as an
              account holder by contacting us through the in-app support system.
            </p>
          </section>

          <p className="text-xs text-zinc-400">
            This policy covers Nookly the platform. Your own privacy notice to your customers is your
            responsibility as the business operating the workspace.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
