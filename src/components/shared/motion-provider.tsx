"use client";

import { MotionConfig } from "framer-motion";
import { TooltipProvider } from "@/components/ui/overlays";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </MotionConfig>
  );
}
