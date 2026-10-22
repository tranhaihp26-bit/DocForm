import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareImportedFileBundle,
  commitImportedFileBundle,
  commitTemplateOrPilotReplacement,
  commitVersionRestore,
  createInitialImportSessionState,
  type ImportSessionState,
} from "../src/utils/importSessionLifecycle.ts";
import { parseLocalFile } from "../src/utils/localFileImport.ts";
import type { DocumentState, Version } from "../src/App.tsx";
import type { PartitionProposal, ReviewProposal } from "../src/shared/schemas/document.schema.ts";

function makeSyntheticFile(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  return new File([bytes], name, { type: "text/plain" });
}

test("Task 2.1: A -> B replacement with identical block-0 IDs clears all source-bound state from A", async () => {
  const fileA = makeSyntheticFile(
    "VanBan_A.txt",
    [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 10/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "KẾ HOẠCH",
      "V/v Kiểm tra an toàn luồng hàng hải đợt A",
      "Điều 1. Nội dung công việc của tài liệu A.",
      "GIÁM ĐỐC",
      "Nguyễn Văn A",
    ].join("\n")
  );

  const fileB = makeSyntheticFile(
    "VanBan_B.txt",
    [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 25/QĐ-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "Hải Phòng, ngày 18 tháng 10 năm 2026",
      "QUYẾT ĐỊNH",
      "V/v Ban hành quy chế điều độ tàu đợt B",
      "Điều 1. Nội dung quyết định của tài liệu B.",
      "GIÁM ĐỐC",
      "Trần Văn B",
    ].join("\n")
  );

  const parsedA = await parseLocalFile(fileA, "administrative");
  const bundleA = prepareImportedFileBundle(parsedA, "state");

  let state: ImportSessionState = createInitialImportSessionState(bundleA.doc, "state", bundleA.originalSnapshot);
  state = commitImportedFileBundle(state, bundleA);

  // Verify A has block-0
  assert.ok(state.reviewBlocks.some((b) => b.id === "block-0"), "Source A must contain block-0");
  assert.ok(state.originalSnapshot?.sourceHash, "Source A must have a sourceHash");
  const hashA = state.originalSnapshot!.sourceHash!;

  // Simulate user editing block-0 in A, receiving AI partition proposals and history on A
  const fakePropA: PartitionProposal = {
    id: "prop-a-block-0",
    sourceBlockId: "block-0",
    currentRole: "header",
    suggestedRole: "metadata",
    exactQuote: "KẾ HOẠCH",
    reason: "Đề xuất của tệp A",
    confidence: "high",
    status: "pending",
    regime: "administrative",
  };
  const fakeReviewPropA: ReviewProposal = {
    id: "rev-a-1",
    type: "format",
    target: "referenceNumber",
    label: "Đề xuất A",
    original: "Số: 10/KH-HTMB",
    suggested: "Số: 10/KH-HTMB",
    reason: "Reason A",
    confidence: "high",
  };

  state = {
    ...state,
    userModifiedBlockIds: ["block-0"],
    partitionProposals: [fakePropA],
    verifiedPartitionProposalIds: new Set(["prop-a-block-0"]),
    partitionHistory: [state.reviewBlocks.map((b) => ({ ...b }))],
    partitionCheckNotice: "Đã hoàn thành kiểm tra AI trên tệp A.",
    partitionCheckSource: "gemini_ai",
    acceptedProposalIds: new Set([fakeReviewPropA.id]),
    reviewProposals: [fakeReviewPropA],
  };

  // Now import File B (which also produces block-0)
  const parsedB = await parseLocalFile(fileB, "administrative");
  const bundleB = prepareImportedFileBundle(parsedB, state.standardType);
  assert.ok(bundleB.reviewBlocks.some((b) => b.id === "block-0"), "Source B must also contain block-0");

  const nextState = commitImportedFileBundle(state, bundleB);

  // Assert all source-bound state belongs to B or is cleanly reset
  assert.equal(nextState.uploadedFileName, "VanBan_B.txt");
  assert.notEqual(nextState.originalSnapshot?.sourceHash, hashA, "Source hash must update to B");
  assert.equal(nextState.originalSnapshot?.fileName, "VanBan_B.txt");
  assert.deepEqual(nextState.userModifiedBlockIds, [], "userModifiedBlockIds from A must be cleared");
  assert.deepEqual(nextState.partitionProposals, [], "partitionProposals from A must be cleared");
  assert.equal(nextState.verifiedPartitionProposalIds.size, 0, "verifiedPartitionProposalIds from A must be cleared");
  assert.deepEqual(nextState.partitionHistory, [], "partitionHistory from A must be cleared");
  assert.equal(nextState.partitionCheckNotice, "", "partitionCheckNotice from A must be cleared");
  assert.equal(nextState.partitionCheckSource, "unverified", "partitionCheckSource must reset to unverified");
  assert.equal(nextState.acceptedProposalIds.size, 0, "acceptedProposalIds from A must be cleared");
  assert.ok(
    !nextState.reviewProposals.some((p) => p.id === "rev-a-1"),
    "Review proposals from A must not remain in B"
  );
  assert.ok(
    nextState.doc.bodyHtml.includes("tài liệu B") && !nextState.doc.bodyHtml.includes("tài liệu A"),
    "Document body must strictly belong to B"
  );
});

test("Task 2.2: invalid B failure during parse or preparation leaves A intact (no half-A half-B state)", async () => {
  const fileA = makeSyntheticFile(
    "HopLe_A.txt",
    [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 11/BC-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "BÁO CÁO",
      "V/v Báo cáo công tác an toàn hàng hải",
      "Nội dung báo cáo của tài liệu A.",
    ].join("\n")
  );

  const parsedA = await parseLocalFile(fileA, "administrative");
  const bundleA = prepareImportedFileBundle(parsedA, "state");
  let state = createInitialImportSessionState(bundleA.doc, "state", bundleA.originalSnapshot);
  state = commitImportedFileBundle(state, bundleA);

  // Add user edits and history to A
  const snapshotBeforeInvalidB: ImportSessionState = {
    ...state,
    userModifiedBlockIds: ["block-0"],
    partitionHistory: [state.reviewBlocks.map((b) => ({ ...b }))],
    partitionCheckNotice: "Phiên A đang hoạt động",
    partitionCheckSource: "gemini_ai",
  };

  // Case 1: Corrupted DOCX file B fails in parseLocalFile
  const corruptedDocxB = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], "Hong_B.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await assert.rejects(
    async () => {
      const parsedB = await parseLocalFile(corruptedDocxB, "administrative");
      prepareImportedFileBundle(parsedB, snapshotBeforeInvalidB.standardType);
    },
    /DOCX|hợp lệ|hỏng/i,
    "Corrupted DOCX B must throw before commit"
  );

  // Case 2: Malformed parsed payload fails in prepareImportedFileBundle before any state commit
  assert.throws(
    () => {
      prepareImportedFileBundle({
        ...parsedA,
        filename: "Hong_Cau_Truc_B.docx",
        structured: null as any,
      }, "state");
    },
    /structured|không hợp lệ|bóc tách/i,
    "Missing structured payload in B must throw during bundle preparation before any React setState"
  );

  // Because commitImportedFileBundle was never reached, snapshotBeforeInvalidB remains 100% untouched
  assert.equal(snapshotBeforeInvalidB.uploadedFileName, "HopLe_A.txt");
  assert.equal(snapshotBeforeInvalidB.originalSnapshot?.sourceHash, parsedA.sourceHash);
  assert.deepEqual(snapshotBeforeInvalidB.userModifiedBlockIds, ["block-0"]);
  assert.equal(snapshotBeforeInvalidB.partitionHistory.length, 1);
  assert.ok(snapshotBeforeInvalidB.doc.bodyHtml.includes("tài liệu A"));
});

test("Task 2.3: switching to template/Pilot or restoring a version clears stale source bindings and never exposes wrong source download", async () => {
  const fileA = makeSyntheticFile(
    "TepGoc_A.txt",
    [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 19/TB-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "THÔNG BÁO",
      "Nội dung thông báo từ tệp A.",
    ].join("\n")
  );

  const parsedA = await parseLocalFile(fileA, "administrative");
  const bundleA = prepareImportedFileBundle(parsedA, "state");
  let state = createInitialImportSessionState(bundleA.doc, "state", bundleA.originalSnapshot);
  state = commitImportedFileBundle(state, bundleA);

  // Capture a version while on A (with its own originalSnapshot & reviewBlocks)
  const versionFromA: Version = {
    id: "v_from_a",
    timestamp: "10:00:00 19/10/2026",
    title: "Phiên bản từ tệp A",
    data: { ...state.doc },
    standardType: state.standardType,
    originalSnapshot: state.originalSnapshot,
    reviewBlocks: state.reviewBlocks,
    structuredImport: state.structuredImport,
    uploadedBlocks: state.uploadedBlocks,
    uploadedFileName: state.uploadedFileName,
    uploadedFileType: state.uploadedFileType,
    rawText: state.rawText,
  };

  // Capture a legacy version without source identity (e.g. pre-existing draft or template edit)
  const legacyVersionWithoutSource: Version = {
    id: "v_legacy_no_source",
    timestamp: "09:00:00 19/10/2026",
    title: "Phiên bản cũ không có liên kết tệp gốc",
    data: {
      ...state.doc,
      bodyHtml: "<p>Nội dung phiên bản cũ không có tệp gốc</p>",
    },
    standardType: "state",
  };

  // 1. Switch from File A to a Template / Pilot document
  const templateDoc: DocumentState = {
    ...state.doc,
    documentType: "NGHỊ QUYẾT",
    bodyHtml: "<p>Nội dung từ mẫu Nghị quyết</p>",
  };
  const templateSnapshot = {
    sourceType: "system_template" as const,
    fileName: "Mẫu Nghị quyết",
    fileType: "template" as const,
    sourceId: "nq_dang",
    uploadedAt: new Date().toISOString(),
    bodyHtml: templateDoc.bodyHtml,
    rawText: "Nội dung từ mẫu Nghị quyết",
  };

  const stateAfterTemplate = commitTemplateOrPilotReplacement(state, {
    doc: templateDoc,
    standardType: "party",
    originalSnapshot: templateSnapshot,
  });

  assert.equal(stateAfterTemplate.originalSnapshot?.sourceType, "system_template");
  assert.equal(stateAfterTemplate.originalSnapshot?.sourceHash, undefined, "Template must not carry A's sourceHash");
  assert.equal(stateAfterTemplate.structuredImport, null, "Template must clear A's structuredImport");
  assert.deepEqual(stateAfterTemplate.uploadedBlocks, [], "Template must clear A's uploadedBlocks");
  assert.deepEqual(stateAfterTemplate.reviewBlocks, [], "Template must clear A's reviewBlocks");
  assert.equal(stateAfterTemplate.uploadedFileType, null, "Template must clear A's uploadedFileType");
  assert.deepEqual(stateAfterTemplate.partitionProposals, [], "Template must clear A's partitionProposals");
  assert.deepEqual(stateAfterTemplate.userModifiedBlockIds, [], "Template must clear A's userModifiedBlockIds");

  // 2. Restore versionFromA -> restores A's known source snapshot and blocks cleanly
  const stateRestoredA = commitVersionRestore(stateAfterTemplate, versionFromA);
  assert.equal(stateRestoredA.originalSnapshot?.sourceHash, parsedA.sourceHash, "Version with known source restores its own sourceHash");
  assert.equal(stateRestoredA.uploadedFileName, "TepGoc_A.txt");

  // 3. Restore legacyVersionWithoutSource while A is active -> MUST NOT expose A's sourceHash!
  const stateRestoredLegacy = commitVersionRestore(stateRestoredA, legacyVersionWithoutSource);
  assert.equal(
    stateRestoredLegacy.originalSnapshot,
    null,
    "Restoring a version without its own source identity must set originalSnapshot to null rather than keeping A's source blob link"
  );
  assert.equal(stateRestoredLegacy.uploadedFileType, null);
  assert.equal(stateRestoredLegacy.uploadedFileName, "");
  assert.deepEqual(stateRestoredLegacy.partitionProposals, []);
  assert.deepEqual(stateRestoredLegacy.userModifiedBlockIds, []);
  assert.deepEqual(stateRestoredLegacy.partitionHistory, []);
});
