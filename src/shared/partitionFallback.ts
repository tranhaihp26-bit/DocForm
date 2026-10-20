import type { PartitionProposal, SourceBlock } from "./schemas/document.schema.ts";

/** Local deterministic partition suggestions; this does not call or depend on AI. */
export function analyzePartitionFallback(
  blocks: SourceBlock[],
  regime: "administrative" | "party",
  userModifiedBlockIds: string[] = [],
): PartitionProposal[] {
  const userSet = new Set(userModifiedBlockIds);
  const proposals: PartitionProposal[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (userSet.has(block.id)) continue;

    const currentRole = block.role || "unclassified";
    const text = (block.text || "").trim();
    const upper = text.toUpperCase();

    if (regime === "party" && /^[-–—_*~]{3,40}$/.test(text) && currentRole !== "separator") {
      proposals.push({
        id: `fb-sep-${block.id}`,
        sourceBlockId: block.id,
        currentRole,
        suggestedRole: "separator",
        exactQuote: text,
        reason: "Dấu gạch nối '-----' phân cách thể thức Đảng (HD05), cần đặt là separator để tránh lẫn vào thân bài",
        confidence: "high",
        status: "pending",
        regime,
        source: "rule_fallback",
      });
      continue;
    }

    if (block.kind === "table" && block.tableData && block.tableData.length > 0 && currentRole === "body") {
      const numCols = block.tableShape?.columns || block.tableData[0]?.length || 1;
      const combinedText = block.text.toUpperCase();
      const hasSigKeywords =
        (combinedText.includes("THƯ KÝ") && combinedText.includes("TRƯỞNG ĐOÀN")) ||
        combinedText.includes("CHỦ TỊCH") || combinedText.includes("GIÁM ĐỐC") ||
        combinedText.includes("NGƯỜI LẬP BIÊN BẢN");

      if (numCols >= 2 && hasSigKeywords && idx >= Math.floor(blocks.length * 0.5)) {
        const quote = combinedText.includes("THƯ KÝ") ? "THƯ KÝ" : (block.tableData[0][0] || text.slice(0, 30));
        proposals.push({
          id: `fb-sig-${block.id}`,
          sourceBlockId: block.id,
          currentRole,
          suggestedRole: "signature",
          fieldKey: "signTitle",
          exactQuote: quote,
          reason: "Bảng ở cuối văn bản chứa các chức danh ký kết (biên bản / phân công ký), không phải bảng dữ liệu thân bài",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 7,
          requiresUserVerification: true,
          source: "rule_fallback",
        });
        continue;
      }
    }

    if (idx < 5 && currentRole === "body") {
      if (regime === "party" && upper.includes("ĐẢNG CỘNG SẢN VIỆT NAM")) {
        proposals.push({
          id: `fb-hdr-${block.id}`,
          sourceBlockId: block.id,
          currentRole,
          suggestedRole: "header",
          fieldKey: "nationalHeader1",
          exactQuote: "ĐẢNG CỘNG SẢN VIỆT NAM",
          reason: "Tiêu đề Đảng ở đầu văn bản thuộc vùng header",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 1,
          source: "rule_fallback",
        });
      } else if (regime === "administrative" && upper.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM")) {
        proposals.push({
          id: `fb-hdr-${block.id}`,
          sourceBlockId: block.id,
          currentRole,
          suggestedRole: "header",
          fieldKey: "nationalHeader1",
          exactQuote: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
          reason: "Quốc hiệu NĐ 30 ở đầu văn bản thuộc vùng header",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 1,
          source: "rule_fallback",
        });
      }
    }
  }

  return proposals;
}
