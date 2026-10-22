import type { AppendixDocument, SourceBlock } from "../../src/shared/schemas/document.schema.ts";

export const SOURCE_SHA = "a".repeat(64);

export function paragraph(id: string, index: number, text: string, role: SourceBlock["role"] = "body"): SourceBlock {
  return { id, index, kind: "paragraph", text, role, confidence: "high", isConfirmed: true };
}

export function tableBlock(id: string, index: number, role: SourceBlock["role"] = "body"): SourceBlock {
  return {
    id, index, kind: "table", text: "synthetic table", role,
    tableModel: {
      tableId: `table-${id}`, rowsCount: 2, columnsCount: 2, gridColumnsTwips: [1000, 1000], tableWidthTwips: 2000,
      widthType: "dxa", alignment: "center", hasBorders: true,
      rows: [
        { rowIndex: 0, isHeader: true, cantSplit: false, cells: [
          { cellId: `${id}-c0`, rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "synthetic heading", paragraphs: [{ text: "synthetic heading" }] },
          { cellId: `${id}-c1`, rowIndex: 0, colIndex: 1, gridColumn: 1, gridSpan: 1, text: "synthetic value", paragraphs: [{ text: "synthetic value" }] },
        ] },
        { rowIndex: 1, isHeader: false, cantSplit: false, cells: [
          { cellId: `${id}-c2`, rowIndex: 1, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "synthetic row", paragraphs: [{ text: "synthetic row" }] },
          { cellId: `${id}-c3`, rowIndex: 1, colIndex: 1, gridColumn: 1, gridSpan: 1, text: "synthetic data", paragraphs: [{ text: "synthetic data" }] },
        ] },
      ],
    },
  };
}

export function appendix(id: string, block: SourceBlock, title = "Phụ lục tổng hợp"): AppendixDocument {
  return { id, title, html: `<p>${block.text}</p>`, blocks: [block], sourceBlockIds: [block.id], extractionStatus: "needs_review" };
}

export const semanticContext = {
  sourceSha256: SOURCE_SHA,
  sourceGeneration: 3,
  partitionFingerprint: "partition-synthetic-2",
  workingRevision: 4,
  regime: "state" as const,
  documentType: "BIÊN BẢN" as const,
};
