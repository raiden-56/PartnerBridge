import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/shared/motion-provider";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { StaticPreviewGuard } from "@/components/demo/static-preview-guard";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "PartnerBridge — Great Businesses Grow Better Together", template: "%s · PartnerBridge" },
  description:
    "Discover trusted business partners, unlock new opportunities and build meaningful collaborations with companies around the world.",
  applicationName: "PartnerBridge",
  appleWebApp: { capable: true, title: "PartnerBridge", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "PartnerBridge",
    description: "The B2B partnership marketplace — discover, connect, negotiate and collaborate.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#172554",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh font-sans">
        {publicEnv.staticPreview && <StaticPreviewGuard />}
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
        {/* No service worker / install prompt on the static read-only preview. */}
        {!publicEnv.staticPreview && <PwaProvider />}
      </body>
    </html>
  );
}
