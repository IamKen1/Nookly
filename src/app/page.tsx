import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/marketing/Nav";
import Hero from "@/components/marketing/Hero";
import Features from "@/components/marketing/Features";
import HowItWorks from "@/components/marketing/HowItWorks";
import PricingSection from "@/components/marketing/PricingSection";
import Faq from "@/components/marketing/Faq";
import FinalCta from "@/components/marketing/FinalCta";
import Footer from "@/components/marketing/Footer";

export default async function Home() {
  const [session, plans] = await Promise.all([
    getSession(),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const isAuthenticated = Boolean(session);

  return (
    <div className="flex flex-1 flex-col bg-white">
      <Nav isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <Hero isAuthenticated={isAuthenticated} />
        <Features />
        <HowItWorks />
        <PricingSection
          isAuthenticated={isAuthenticated}
          plans={plans.map((p) => ({
            code: p.code,
            name: p.name,
            tagline: p.tagline ?? "",
            priceMonthly: Number(p.priceMonthly),
            priceYearly: Number(p.priceYearly),
            features: Array.isArray(p.features) ? (p.features as string[]) : [],
          }))}
        />
        <Faq />
        <FinalCta isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  );
}
