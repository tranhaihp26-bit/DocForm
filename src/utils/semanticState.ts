import type {
  AlignedAiObservation,
  FullTextSemanticObservation,
  ParserObservation,
  SemanticDecision,
  SemanticDecisionStatus,
  SemanticState,
} from "../shared/semanticDocument.ts";
import type { FullTextReviewCoverage } from "../shared/fullDocumentTextProtocol.ts";
import {
  reconcileFullTextSemantics,
  reconcileSemantics,
  type SemanticReconciliationContext,
} from "./semanticReconciliation.ts";

export type SemanticChange =
  | { kind: "source_replaced"; next: SemanticReconciliationContext }
  | { kind: "partition_approval_changed"; next: SemanticReconciliationContext }
  | { kind: "source_block_edited"; blockId: string; next: SemanticReconciliationContext }
  | { kind: "appendix_moved"; appendixId: string; next: SemanticReconciliationContext }
  | { kind: "semantic_decision_changed"; unitId: string; next: SemanticReconciliationContext };

export interface SemanticApprovalContextKeyInput {
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  regime: "state" | "party";
  documentType: string;
}

export interface PersistedUserSemanticDecision {
  contextKey: string;
  status: "user_confirmed" | "rejected";
  evidenceFingerprint?: string;
}

export function isPersistedUserSemanticDecisionCurrent(
  saved: PersistedUserSemanticDecision,
  state: SemanticState,
  contextKey: string,
  unitId: string,
): boolean {
  if (saved.contextKey !== contextKey || !state.observations.some(item => item.unit.id === unitId)) return false;
  const currentEvidence = state.decisions[unitId]?.evidenceFingerprint;
  if (saved.evidenceFingerprint) return saved.evidenceFingerprint === currentEvidence;
  // Legacy local-only decisions remain usable, but cannot authorize a newer text-AI review.
  return state.fullTextCoverage === undefined;
}

export function semanticApprovalContextKey(context: SemanticApprovalContextKeyInput): string {
  return stable({ sourceSha256: context.sourceSha256, sourceGeneration: context.sourceGeneration,
    partitionFingerprint: context.partitionFingerprint, regime: context.regime,
    documentType: context.documentType.trim().toLocaleUpperCase("vi-VN") });
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function decisionFingerprint(decisions: Record<string, SemanticDecision>): string {
  return stable(Object.keys(decisions).sort().map(id => decisions[id]));
}

function revision(
  context: SemanticReconciliationContext,
  decisions: Record<string, SemanticDecision>,
  evidence?: unknown,
): SemanticState["revision"] {
  const fingerprintMaterial = evidence === undefined
    ? { context, decisionFingerprint: decisionFingerprint(decisions) }
    : { context, decisionFingerprint: decisionFingerprint(decisions), evidence };
  return { version: 1, ...context, fingerprint: stable(fingerprintMaterial) };
}

function semanticEvidence(fullTextAiObservations?: FullTextSemanticObservation[], fullTextCoverage?: FullTextReviewCoverage) {
  return fullTextAiObservations === undefined && fullTextCoverage === undefined
    ? undefined
    : { fullTextAiObservations: fullTextAiObservations ?? [], fullTextCoverage: fullTextCoverage ?? null };
}

export function createSemanticState(
  local: ParserObservation[],
  ai: AlignedAiObservation[],
  context: SemanticReconciliationContext,
): SemanticState {
  const reconciled = reconcileSemantics(local, ai, context);
  const decisions = Object.fromEntries(reconciled.map(item => [item.unitId, {
    unitId: item.unitId,
    status: item.status === "auto_confirmed" ? "auto_confirmed" : item.status,
    reason: item.reason,
    decidedBy: item.status === "auto_confirmed" ? "policy" : "policy",
    sourceSha256: item.sourceSha256,
    sourceGeneration: item.sourceGeneration,
    partitionFingerprint: item.partitionFingerprint,
    workingRevision: item.workingRevision,
    evidenceFingerprint: item.evidenceFingerprint,
  } satisfies SemanticDecision]));
  const state: SemanticState = { revision: revision(context, decisions), observations: structuredClone(local),
    aiObservations: structuredClone(ai), decisions, decisionFingerprint: decisionFingerprint(decisions) };
  return state;
}

export function createFullTextSemanticState(
  local: ParserObservation[],
  ai: FullTextSemanticObservation[],
  coverage: FullTextReviewCoverage,
  context: SemanticReconciliationContext,
): SemanticState {
  const reconciled = reconcileFullTextSemantics(local, ai, context);
  const decisions = Object.fromEntries(reconciled.map(item => [item.unitId, {
    unitId: item.unitId,
    status: item.status,
    reason: item.reason,
    decidedBy: "policy",
    sourceSha256: item.sourceSha256,
    sourceGeneration: item.sourceGeneration,
    partitionFingerprint: item.partitionFingerprint,
    workingRevision: item.workingRevision,
    evidenceFingerprint: item.evidenceFingerprint,
  } satisfies SemanticDecision]));
  const fullTextAiObservations = structuredClone(ai);
  const fullTextCoverage = structuredClone(coverage);
  const state: SemanticState = {
    revision: revision(context, decisions, semanticEvidence(fullTextAiObservations, fullTextCoverage)),
    observations: structuredClone(local),
    aiObservations: [],
    fullTextAiObservations,
    fullTextCoverage,
    decisions,
    decisionFingerprint: decisionFingerprint(decisions),
  };
  return state;
}

export function applyUserSemanticDecision(
  input: SemanticState,
  unitId: string,
  status: "user_confirmed" | "rejected",
  expectedRevisionFingerprint: string,
): SemanticState {
  if (input.revision.fingerprint !== expectedRevisionFingerprint) throw new Error("stale_semantic_revision");
  const observation = input.observations.find(item => item.unit.id === unitId);
  if (!observation) throw new Error("semantic_unit_not_found");
  if (observation.sourceSha256 !== input.revision.sourceSha256 || observation.sourceGeneration !== input.revision.sourceGeneration ||
      observation.partitionFingerprint !== input.revision.partitionFingerprint || observation.workingRevision !== input.revision.workingRevision) {
    throw new Error("stale_semantic_evidence");
  }
  const decisions = structuredClone(input.decisions);
  decisions[unitId] = {
    unitId, status, reason: status === "user_confirmed" ? "Người dùng xác nhận nhãn và bằng chứng nguồn." : "Người dùng từ chối nhãn đề xuất.",
    decidedBy: "user", sourceSha256: input.revision.sourceSha256, sourceGeneration: input.revision.sourceGeneration,
    partitionFingerprint: input.revision.partitionFingerprint, workingRevision: input.revision.workingRevision,
    evidenceFingerprint: stable({ sourceHash: observation.sourceSha256, unit: observation.unit }),
  };
  const next = { ...structuredClone(input), decisions, decisionFingerprint: decisionFingerprint(decisions),
    revision: revision(input.revision, decisions, semanticEvidence(input.fullTextAiObservations, input.fullTextCoverage)) };
  return next;
}

export function invalidateSemanticState(input: SemanticState, change: SemanticChange): SemanticState {
  const nextContext = change.next;
  const contextChanged = change.kind === "source_replaced" || change.kind === "partition_approval_changed";
  const affected = (unitId: string, decision: SemanticDecision): boolean => {
    const observation = input.observations.find(item => item.unit.id === unitId);
    if (!observation) return true;
    if (contextChanged) return true;
    if (change.kind === "source_block_edited") return observation.unit.sourceBlockIds.includes(change.blockId);
    if (change.kind === "appendix_moved") return observation.unit.appendixId === change.appendixId;
    if (change.kind === "semantic_decision_changed") return unitId === change.unitId;
    return decision.sourceSha256 !== nextContext.sourceSha256 || decision.sourceGeneration !== nextContext.sourceGeneration ||
      decision.partitionFingerprint !== nextContext.partitionFingerprint;
  };
  const decisions: Record<string, SemanticDecision> = {};
  for (const [id, decision] of Object.entries(input.decisions)) {
    if (affected(id, decision)) continue;
    decisions[id] = { ...decision, sourceSha256: nextContext.sourceSha256, sourceGeneration: nextContext.sourceGeneration,
      partitionFingerprint: nextContext.partitionFingerprint, workingRevision: nextContext.workingRevision };
  }
  const invalidatesObservation = (observation: ParserObservation): boolean => {
    if (contextChanged) return true;
    if (change.kind === "source_block_edited") return observation.unit.sourceBlockIds.includes(change.blockId);
    if (change.kind === "appendix_moved") return observation.unit.appendixId === change.appendixId;
    return false;
  };
  const observations = input.observations.filter(item => !invalidatesObservation(item)).map(item => ({ ...item, sourceSha256: nextContext.sourceSha256,
    sourceGeneration: nextContext.sourceGeneration, partitionFingerprint: nextContext.partitionFingerprint,
    workingRevision: nextContext.workingRevision }));
  const aiObservations = input.aiObservations.filter(item => {
    if (contextChanged) return false;
    const local = input.observations.find(obs => obs.unit.id === item.unitId);
    return Boolean(local && !invalidatesObservation(local));
  });
  const fullTextAiObservations = (input.fullTextAiObservations ?? []).filter(item => {
    if (contextChanged) return false;
    if (change.kind === "source_block_edited") return item.sourceBlockId !== change.blockId;
    if (change.kind === "appendix_moved") return item.appendixId !== change.appendixId;
    return true;
  });
  const fullTextCoverage = change.kind === "source_replaced" ? undefined : input.fullTextCoverage;
  const state: SemanticState = {
    revision: revision(nextContext, decisions, semanticEvidence(fullTextAiObservations, fullTextCoverage)),
    observations,
    aiObservations,
    ...(input.fullTextAiObservations !== undefined ? { fullTextAiObservations } : {}),
    ...(fullTextCoverage ? { fullTextCoverage } : {}),
    decisions,
    decisionFingerprint: decisionFingerprint(decisions),
  };
  return state;
}

export function semanticDecisionIsCurrent(
  decision: SemanticDecision | undefined,
  context: SemanticReconciliationContext,
): boolean {
  return Boolean(decision && (decision.status === "user_confirmed" || decision.status === "auto_confirmed") &&
    decision.sourceSha256 === context.sourceSha256 && decision.sourceGeneration === context.sourceGeneration &&
    decision.partitionFingerprint === context.partitionFingerprint && decision.workingRevision === context.workingRevision);
}

export function semanticDecisionLabel(status: SemanticDecisionStatus): string {
  return ({ unreviewed: "Chưa duyệt", auto_confirmed: "Khớp tự động", user_confirmed: "Đã xác nhận", rejected: "Đã từ chối",
    needs_review: "Chờ duyệt", unsupported: "Chưa hỗ trợ" })[status];
}
