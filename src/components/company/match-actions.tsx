"use client";

import { EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/shared/use-action";
import { dismissRecommendationAction, refreshRecommendationsAction } from "@/actions/marketplace";

export function MatchActions({ dismissId }: { dismissId?: string }) {
  const refresh = useAction(refreshRecommendationsAction);
  const dismiss = useAction(dismissRecommendationAction);
  if (dismissId)
    return (
      <Button size="sm" variant="ghost" className="ml-auto text-slate-500" loading={dismiss.pending} onClick={() => dismiss.run(dismissId)}>
        <EyeOff /> Not relevant
      </Button>
    );
  return (
    <Button variant="outline" loading={refresh.pending} onClick={() => refresh.run()}>
      <RefreshCw /> Recalculate matches
    </Button>
  );
}
