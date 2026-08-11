"use client";

import { useEffect, useState } from "react";
import ProductTour, { type TourStep } from "./ProductTour";

const ALL_STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-dashboard"]',
    title: "Welcome to Nookly!",
    body: "This is your Dashboard — a quick snapshot of today's sales and stock. We'll walk through the main areas in a few short steps. Click Next to continue, or the X to skip anytime.",
  },
  {
    target: '[data-tour="nav-pos"]',
    title: "Point of Sale",
    body: "This is where you ring up sales. Click POS to open checkout — search or scan a product to add it to the cart, then tap Checkout to take payment. You'll get a printable receipt right after.",
  },
  {
    target: '[data-tour="nav-products"]',
    title: "Products",
    body: "Manage your full catalog here — add items one by one, or bulk-import from Excel. Anything you add here shows up immediately in POS, ready to sell.",
  },
  {
    target: '[data-tour="nav-inventory"]',
    title: "Inventory",
    body: "Adjust stock levels here when you receive new stock or do a count. Every adjustment is logged automatically, so you'll always be able to see what changed and when.",
  },
  {
    target: '[data-tour="nav-prescriptions"]',
    title: "Prescriptions",
    body: "This is a history of prescriptions filled at checkout — you don't create them here. They're captured automatically in POS whenever a cashier sells a prescription-only item.",
  },
  {
    target: '[data-tour="nav-sales"]',
    title: "Sales",
    body: "Every completed sale lands here. Click into any sale to reprint the receipt, process a return, or void it if something went wrong.",
  },
  {
    target: '[data-tour="nav-reports"]',
    title: "Reports",
    body: "See how you're doing over time — daily, weekly, monthly, and yearly views. When you need numbers for your bookkeeper, export straight to CSV.",
  },
  {
    target: '[data-tour="nav-users"]',
    title: "Users",
    body: "Add staff accounts here and set their role — that controls what they can see and do. Give each cashier their own login so sales are always tied to the right person.",
  },
  {
    target: '[data-tour="nav-shifts"]',
    title: "Shifts",
    body: "This is where you review cash handovers between cashiers and see the day's closing totals. Cashiers themselves start/end shifts from a button right inside POS.",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Settings",
    body: "Set up your receipt details, notification preferences, and plan here. Do this first if you haven't already — it only takes a couple of minutes.",
  },
  {
    target: '[data-tour="nav-support"]',
    title: "Need help?",
    body: "Stuck on something? Click Support and send us a message — we'll reply right in the same thread so you can track it. That's the tour! Explore at your own pace, we're here if you need us.",
  },
];

export default function OnboardingTourLoader({ role }: { role?: string }) {
  const [showTour, setShowTour] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    fetch("/api/onboarding/tour")
      .then((r) => r.json())
      .then((data) => {
        if (data.hasSeenTour) return;
        // Only include steps whose nav item actually exists for this user's role.
        const availableSteps = ALL_STEPS.filter((s) => document.querySelector(s.target));
        if (availableSteps.length > 0) {
          setSteps(availableSteps);
          setShowTour(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const finish = async () => {
    setShowTour(false);
    await fetch("/api/onboarding/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  };

  if (!showTour || steps.length === 0) return null;

  return <ProductTour steps={steps} onFinish={finish} />;
}
