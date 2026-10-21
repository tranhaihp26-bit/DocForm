import JSZip from "jszip";
import type { DocumentFormatType, ImportFidelityManifest } from "../shared/schemas/document.schema.ts";
import { assessExportSafety } from "../shared/importFidelity.ts";
import { composeDocumentFormatData, type DocumentComposerSnapshot } from "./documentComposer.ts";
import { generateND30DocxUint8Array } from "./docxExport.ts";
import { verifyCandidateExportFidelity, type CandidateExportVerificationResult } from "./tableRoundtrip.ts";
import { verifyCandidateContentFidelity, type ContentFidelityResult } from "./candidateContentFidelity.ts";
import { extractOoxmlEvidenceFromXml } from "../canonical/ruleEngine.ts";
import { canonicalWorkspaceValue, confirmedRemovedTableIds, freezeWorkspaceValue, hasWorkspaceApproval, workspaceInvariantErrors, type WorkspaceSnapshot, type WorkspaceState } from "./workspaceState.ts";
import { isTransformedMetadataTable } from "./sourceTableInventory.ts";
import { hasProfileHeaderShapeLines, hasReplaceableHeaderShapeLines } from "./sourceHeaderShapes.ts";
import { hasStampedHoaTieuHeader } from "./hoaTieuHeaderStamp.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../canonical/hd05/companyHeaderHD05.ts";

export interface ExportCandidateSnapshot extends DocumentComposerSnapshot { workspace?: WorkspaceState; /** Explicit UI override provenance participates in the cache identity. */ docTypeOverride?: unknown }
export interface ExportCandidate {
  readonly instanceId: string;
  readonly key: string;
  readonly revision: number;
  readonly formatData: DocumentFormatType;
  /** Defensive copy: consumers cannot mutate the bytes held by the validated instance. */
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly documentXml: string;
  readonly evidence: ReturnType<typeof extractOoxmlEvidenceFromXml>;
  readonly tableFidelity: CandidateExportVerificationResult;
  readonly contentFidelity: ContentFidelityResult;
  readonly exportSafety: ReturnType<typeof assessExportSafety>;
  readonly profileHeaderLines: number;
  /** A generated, readable DOCX may be downloaded even when fidelity checks warn. */
  readonly downloadable: boolean;
  readonly safe: boolean;
  readonly blockers: readonly string[];
}
/** The entire input is included, including provenance, partition approval, overrides and ledger. */
export function exportCandidateKey(snapshot: ExportCandidateSnapshot): string {
  return canonicalWorkspaceValue(snapshot);
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export type CandidateByteGenerator = (formatData: DocumentFormatType) => Promise<Uint8Array>;
/** One generation only. Every gate and evidence extractor consumes precisely these bytes. */
export async function prepareExportCandidate(input: ExportCandidateSnapshot, generateBytes: CandidateByteGenerator = generateND30DocxUint8Array): Promise<ExportCandidate> {
  const snapshot = structuredClone(input);
  const key = exportCandidateKey(snapshot);
  const blockers: string[] = [];
  const working = snapshot.workspace ? snapshot as WorkspaceSnapshot : null;
  if (working) {
    blockers.push(...workspaceInvariantErrors(working));
    if (!hasWorkspaceApproval(working)) blockers.push("partition_not_approved");
  } else if (snapshot.structuredImport || snapshot.reviewBlocks.length || snapshot.uploadedBlocks?.length || ["docx", "txt", "paste"].includes(snapshot.doc.importMetadata?.sourceType ?? "")) blockers.push("workspace_approval_required");
  const formatData = composeDocumentFormatData(snapshot);
  const manifest = working?.workspace.source?.fidelityManifest ?? snapshot.structuredImport?.importFidelityManifest;
  for (const html of [snapshot.doc.bodyHtml, ...(snapshot.doc.appendices ?? []).map(a => a.html), ...(snapshot.doc.unclassified ?? []).map(b => b.html ?? "")]) {
    if (/<(?:img|svg|object|embed|iframe|video|audio|canvas)\b/i.test(html)) blockers.push("unsupported_working_media");
  }
  const sourceBlocks = working?.workspace.source?.blocks ?? (snapshot.reviewBlocks.length ? snapshot.reviewBlocks : snapshot.structuredImport?.blocks ?? snapshot.uploadedBlocks ?? []);
  const removed = new Set(working ? confirmedRemovedTableIds(working) : []);
  const tables = { ...formatData.importedTables };
  const replacedHeaderShapeBlocks: typeof sourceBlocks = [];
  for (const block of sourceBlocks) {
    const reviewedBlock = snapshot.reviewBlocks.find(reviewed => reviewed.id === block.id);
    const effectiveMetadataBlock = reviewedBlock ? { ...block, role: reviewedBlock.role, tableModel: reviewedBlock.tableModel ?? block.tableModel } : block;
    if (block.kind === "table" && !block.tableModel) blockers.push(`unsupported_source_table_model:${block.id}`);
    if (/<(?:w:)?(?:drawing|pict|object|fldSimple|fldChar)\b/i.test(block.rawXml ?? "")) {
      const selectedProfile = formatData.regime === "administrative" ? COMPANY_HEADER_PROFILE_ID : COMPANY_HEADER_HD05_PROFILE_ID;
      if (formatData.headerProfile === selectedProfile && isTransformedMetadataTable(effectiveMetadataBlock, manifest, snapshot.structuredImport?.fields) &&
          hasReplaceableHeaderShapeLines(block.rawXml ?? "")) replacedHeaderShapeBlocks.push(block);
      else blockers.push(`unsupported_source_ooxml:${block.id}`);
    }
    if (/<(?:img|svg|object|embed|iframe|video|audio|canvas)\b/i.test(block.html ?? "")) blockers.push(`unsupported_source_media:${block.id}`);
    if (!block.tableModel) continue;
    const tableId = block.tableModel.tableId || block.id;
    if (removed.has(tableId)) continue;
    const roles = new Set([snapshot.reviewBlocks.find(b => b.id === block.id)?.role ?? block.role ?? "unclassified",
      ...(working?.workspace.partition.cells.filter(c => c.sourceBlockId === block.id).map(c => c.role) ?? [])]);
    if (roles.size !== 1) { blockers.push(`unsupported_source_table_role:${tableId}`); continue; }
    const effectiveBlock = { ...block, role: [...roles][0] };
    if (isTransformedMetadataTable(effectiveBlock, manifest, snapshot.structuredImport?.fields)) continue;
    if (!["body", "appendix", "unclassified"].includes([...roles][0])) blockers.push(`unsupported_source_table_role:${tableId}`);
    if (!tables[tableId]) tables[tableId] = block.tableModel;
  }
  for (const [id, model] of Object.entries(tables)) if (removed.has(model.tableId || id)) delete tables[id];
  formatData.importedTables = Object.keys(tables).length ? tables : undefined;
  // Expected order follows the validated working revision, including explicit move transactions.
  // Source manifest order remains immutable and is never rewritten to bless a generated file.
  const physicalOrder: string[] = [];
  const canonicalTables: typeof tables = {};
  const htmlParts = [formatData.bodyHtml, ...(formatData.appendices ?? []).map(a => a.html), ...(formatData.unclassified ?? []).map(b => b.html ?? "")];
  for (const html of htmlParts) for (const tag of (html ?? "").match(/<table\b[^>]*>/gi) ?? []) {
    const htmlId = tag.match(/data-source-table-id\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!htmlId) continue;
    const model = tables[htmlId], id = model?.tableId || htmlId;
    if (physicalOrder.includes(id)) blockers.push(`duplicate_working_table_id:${id}`);
    physicalOrder.push(id);
    if (model) canonicalTables[id] = model;
  }
  for (const [alias, model] of Object.entries(tables)) {
    const id = model.tableId || alias;
    if (!canonicalTables[id]) canonicalTables[id] = tables[id] ?? model;
  }
  const inventoryIds = [...new Set([...(manifest?.tableIds ?? []).map(id => tables[id]?.tableId || id), ...Object.keys(canonicalTables)])].filter(id => !removed.has(id));
  const inventorySet = new Set(inventoryIds);
  const expectedOrder = [...new Set([...physicalOrder.filter(id => inventorySet.has(id)), ...inventoryIds])];
  const expectedManifest: ImportFidelityManifest | undefined = manifest || inventoryIds.length ? {
    ...(manifest ? structuredClone(manifest) : { sourceKind: working?.workspace.source ? "uploaded_docx" as const : "scratch" as const, sourceBlockIds: sourceBlocks.map(b => b.id), unsupportedFeatures: [] }),
    tableIds: expectedOrder,
  } : undefined;
  const approvedNewTableIds = working?.workspace.ledger.filter(e => e.action === "add" && e.kind === "table").flatMap(e => e.addedTableIds?.length ? e.addedTableIds : [e.targetId]);
  const generatedBytes = new Uint8Array(await generateBytes(formatData));
  const digest = await sha256(generatedBytes);
  const tableFidelity = await verifyCandidateExportFidelity(generatedBytes, canonicalTables, expectedManifest,
    {
      ...(approvedNewTableIds ? { approvedNewTableIds } : {}),
      companyNd30TableFormat: formatData.regime === "administrative" && formatData.headerProfile === COMPANY_HEADER_PROFILE_ID,
    });
  let xml = "";
  let settingsXml = "";
  try {
    const zip = await JSZip.loadAsync(generatedBytes);
    xml = await zip.file("word/document.xml")?.async("string") ?? "";
    settingsXml = await zip.file("word/settings.xml")?.async("string") ?? "";
  } catch { blockers.push("candidate_unpack_failed"); }
  if (!xml) blockers.push("candidate_document_missing");
  const profileSelected = formatData.headerProfile === (formatData.regime === "administrative" ? COMPANY_HEADER_PROFILE_ID : COMPANY_HEADER_HD05_PROFILE_ID);
  const profileShapesPresent = hasProfileHeaderShapeLines(xml, formatData.regime) &&
    hasStampedHoaTieuHeader(xml, settingsXml, formatData);
  if (profileSelected && !profileShapesPresent) blockers.push("profile_header_not_stamped");
  for (const block of replacedHeaderShapeBlocks) if (replacedHeaderShapeBlocks.length !== 1 || !profileShapesPresent)
    blockers.push(`unsupported_source_ooxml:${block.id}`);
  const profileHeaderLines = replacedHeaderShapeBlocks.length === 1 && profileShapesPresent
    ? formatData.regime === "administrative" ? 2 : 1 : 0;
  const contentFidelity = verifyCandidateContentFidelity(xml, formatData);
  const exportSafety = assessExportSafety(manifest, { candidateFidelityResult: tableFidelity, roundtripVerified: tableFidelity.safe });
  const evidence = extractOoxmlEvidenceFromXml(xml, formatData.regime);
  const candidate = {
    instanceId: crypto.randomUUID(), key, revision: working?.workspace.workingRevision ?? 0,
    formatData: freezeWorkspaceValue(formatData), get bytes() { return new Uint8Array(generatedBytes); }, sha256: digest,
    documentXml: xml, evidence: freezeWorkspaceValue(evidence), tableFidelity: freezeWorkspaceValue(tableFidelity),
    contentFidelity: freezeWorkspaceValue(contentFidelity), exportSafety: freezeWorkspaceValue(exportSafety),
    profileHeaderLines,
    downloadable: generatedBytes.length > 0 && Boolean(xml) && !blockers.includes("candidate_unpack_failed") &&
      !contentFidelity.violations.some(violation => violation.code === "content_invalid_xml"),
    safe: blockers.length === 0 && tableFidelity.safe && contentFidelity.safe && exportSafety.decision === "allow",
    blockers: Object.freeze([...new Set(blockers)]),
  };
  return Object.freeze(candidate);
}

/** Per-document-session manager. Late results return null and cannot replace a newer candidate. */
export function createExportCandidateManager(generateBytes: CandidateByteGenerator = generateND30DocxUint8Array) {
  let generation = 0;
  let current: ExportCandidate | null = null;
  let pending: { key: string; promise: Promise<ExportCandidate | null> } | null = null;
  return {
    get current() { return current; },
    invalidate() { generation++; current = null; pending = null; },
    prepare(input: ExportCandidateSnapshot): Promise<ExportCandidate | null> {
      const snapshot = structuredClone(input), key = exportCandidateKey(snapshot);
      if (current?.key === key) return Promise.resolve(current);
      if (pending?.key === key) return pending.promise;
      const ticket = ++generation;
      current = null;
      const promise = prepareExportCandidate(snapshot, generateBytes).then(result => {
        if (ticket !== generation) return null;
        current = result; pending = null; return result;
      }, error => { if (ticket === generation) pending = null; throw error; });
      pending = { key, promise }; return promise;
    },
    isCurrent(candidate: ExportCandidate, snapshot: ExportCandidateSnapshot) {
      return current === candidate && candidate.key === exportCandidateKey(snapshot);
    },
  };
}
