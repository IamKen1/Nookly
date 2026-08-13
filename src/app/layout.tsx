import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import SWRProvider from "@/components/SWRProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nookly — Point of Sale for the Modern Drugstore",
  description:
    "Nookly is a multi-branch, cloud-based POS built for drugstores and pharmacies: inventory, prescriptions, official receipts, and sales analytics — all in one subscription.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SWRProvider>
          <ImpersonationBanner />
          {children}
        </SWRProvider>
      </body>
    </html>
  );
}
