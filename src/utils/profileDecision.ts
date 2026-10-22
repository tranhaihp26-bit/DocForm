import type { SourceProfileEvidence } from "./sourceMismatch.ts";

export interface ProfileDecisionContext {
  sourceKey: string;
  regime: "state" | "party";
  sourceProfile: SourceProfileEvidence;
  chosenProfile: "company" | "generic";
}

export interface ProfileDecision extends ProfileDecisionContext {
  decidedAt: string;
}

/** A profile choice is valid only for the exact source and evidence the user saw. */
export function profileDecisionCovers(
  decision: ProfileDecision | null | undefined,
  current: ProfileDecisionContext,
): boolean {
  if (!decision || !current.sourceKey.trim()) return false;
  if (!decision.sourceKey.trim() || !Number.isFinite(Date.parse(decision.decidedAt))) return false;
  return (
    decision.sourceKey === current.sourceKey &&
    decision.regime === current.regime &&
    decision.sourceProfile === current.sourceProfile &&
    decision.chosenProfile === current.chosenProfile
  );
}
