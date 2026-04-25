import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NavixAI — Real-Time Collaborative Threat Intelligence for Logistics",
  description:
    "A web-based platform where vehicles dynamically share risk signals, enabling real-time detection of suspicious events and automatic rerouting of nearby vehicles through a shared intelligence network.",
  keywords: [
    "NavixAI",
    "threat intelligence",
    "logistics security",
    "vehicle tracking",
    "real-time rerouting",
    "collaborative intelligence",
  ],
  authors: [{ name: "NavixAI" }],
  openGraph: {
    title: "NavixAI — Real-Time Collaborative Threat Intelligence",
    description:
      "Dynamic risk signal sharing for logistics fleets. Real-time detection and automatic rerouting.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-amoled text-text-primary antialiased">{children}</body>
    </html>
  );
}
