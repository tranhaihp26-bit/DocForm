import type { PartitionProposal, SourceBlock } from "./schemas/document.schema.ts";
import { checkProposalValidityBeforeApply, type PartitionProposalContext } from "./partitionValidation.ts";

export interface PartitionBatchApplication {
  nextBlocks: SourceBlock[];
  appliedProposalIds: string[];
  skipped: Array<{ proposalId: string; reason: string }>;
  modifiedBlockIds: string[];
}

/** Revalidate each pending suggestion against the result of the prior accepted change. */
export function applyPartitionProposalBatch(
  proposals: PartitionProposal[],
  currentBlocks: SourceBlock[],
  currentRegime: "administrative" | "party",
  userModifiedBlockIds: string[] = [],
  verifiedProposalIds: ReadonlySet<string> = new Set<string>(),
  currentContext?: PartitionProposalContext,
): PartitionBatchApplication {
  let nextBlocks = currentBlocks.map(block => ({ ...block }));
  const modified = new Set(userModifiedBlockIds);
  const appliedProposalIds: string[] = [];
  const skipped: PartitionBatchApplication["skipped"] = [];

  for (const proposal of proposals.filter(candidate => candidate.status === "pending")) {
    const proposalId = proposal.id || `prop-part-${proposal.sourceBlockId}`;
    if (proposal.requiresUserVerification && !verifiedProposalIds.has(proposalId)) {
      skipped.push({ proposalId, reason: "Thiếu xác nhận đối chiếu nguồn/ô bảng." });
      continue;
    }
    const validity = checkProposalValidityBeforeApply(proposal, nextBlocks, currentRegime, [...modified], currentContext);
    if (!validity.valid) {
      skipped.push({ proposalId, reason: validity.reason || "Đề xuất đã hết hiệu lực." });
      continue;
    }

    nextBlocks = nextBlocks.map(block => block.id === proposal.sourceBlockId
      ? { ...block, role: proposal.suggestedRole }
      : block,
    );
    modified.add(proposal.sourceBlockId);
    appliedProposalIds.push(proposalId);
  }

  return { nextBlocks, appliedProposalIds, skipped, modifiedBlockIds: [...modified] };
}
