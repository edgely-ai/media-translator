import type { OutputMode } from "@/types/jobs";

export const CREDIT_MULTIPLIERS: Record<OutputMode, number> = {
  subtitles: 1,
  dubbed_audio: 1.5,
  lip_sync: 3,
};

export interface CalculateCreditsInput {
  durationSeconds: number;
  targetCount: number;
  outputMode: OutputMode;
}

export function calculateCredits({
  durationSeconds,
  targetCount,
  outputMode,
}: CalculateCreditsInput): number {
  const roundedMinutes = Math.ceil(durationSeconds / 60);
  const multiplier = CREDIT_MULTIPLIERS[outputMode];

  return Math.ceil(roundedMinutes * targetCount * multiplier);
}
