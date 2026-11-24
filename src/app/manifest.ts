import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PartnerBridge — B2B Partnership Platform",
    short_name: "PartnerBridge",
    description: "Discover business partners, manage partnership requests and collaborate in shared workspaces.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#172554",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Partnership requests", url: "/dashboard/requests", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", url: "/dashboard/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Discover companies", url: "/dashboard/discover", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
