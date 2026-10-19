/**
 * Visual Word-Level Diff Utility for DocForm 30 AI Refinement
 * So sánh chi tiết từng từ, cụm từ và dấu câu giữa văn bản gốc và đề xuất tinh chỉnh của AI.
 * 
 * KIẾN TRÚC XỬ LÝ TÀI LIỆU DÀI (Hierarchical Block & Word-level Diff):
 * 1. Cắt bỏ tiền tố/hậu tố trùng lặp chung (O(N) Common Prefix/Suffix trimming).
 * 2. Phân rã văn bản theo khối đoạn (paragraph/block-level decomposition).
 * 3. So sánh cấp khối để định vị chính xác vùng thay đổi (Block LCS).
 * 4. So sánh cấp từ chi tiết chỉ trên từng cụm khối thay đổi (Word LCS).
 * 5. Tuyệt đối KHÔNG gán nhãn "unchanged" khi chạm giới hạn; luôn phản ánh trung thực thay đổi.
 */

export interface DiffToken {
  type: "unchanged" | "added" | "deleted";
  value: string;
}

export interface DiffResult {
  tokens: DiffToken[];
  inlineHtml: string;
  originalHighlightedHtml: string;
  refinedHighlightedHtml: string;
  stats: {
    addedCount: number;
    deletedCount: number;
    unchangedCount: number;
    totalOriginalWords: number;
    totalRefinedWords: number;
  };
  comparisonScope: "body_text";
  isPartial?: boolean;
  limitReason?: string;
}

/**
 * Tách một chuỗi văn bản thành danh sách token (từ, khoảng trắng, dấu câu)
 */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  // Tokenize preserving words, punctuation, spaces, and linebreaks
  const tokenRegex = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+|\s+/gu;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Chuyển HTML thành text có cấu trúc, giữ ngắt dòng giữa các đoạn thẻ block (<p>, <br>, <tr>, <th>, <td>, <h1>-<h6>, <li>)
 */
export function htmlToStructuredText(html: string): string {
  if (!html) return "";
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/blockquote>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // Unescape basic HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  return text.trim();
}

/**
 * Tách văn bản thành danh sách các đoạn (paragraphs/blocks) dựa trên dấu ngắt dòng kép
 */
export function splitIntoBlocks(text: string): string[] {
  if (!text) return [];
  return text.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 0);
}

/**
 * Tách văn bản thành danh sách câu/dòng dựa trên dấu chấm, chấm hỏi, chấm than, chấm phẩy
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  return text.split(/(?<=[.?!;\n])\s+/).filter(s => s.length > 0);
}

/**
 * Thuật toán Longest Common Subsequence (LCS) tối ưu cho mảng token có cắt tỉa tiền tố/hậu tố
 */
export function computeLcsDiff(
  tokensA: string[],
  tokensB: string[],
  options?: { maxMatrixCells?: number; depth?: number }
): { tokens: DiffToken[]; isPartial?: boolean; limitReason?: string } {
  const currentDepth = options?.depth ?? 0;
  const m = tokensA.length;
  const n = tokensB.length;

  if (m === 0 && n === 0) return { tokens: [] };
  if (m === 0) return { tokens: tokensB.map(t => ({ type: "added" as const, value: t })) };
  if (n === 0) return { tokens: tokensA.map(t => ({ type: "deleted" as const, value: t })) };

  // 1. Cắt tỉa tiền tố chung (Common Prefix Optimization)
  let prefixLen = 0;
  while (prefixLen < m && prefixLen < n && tokensA[prefixLen] === tokensB[prefixLen]) {
    prefixLen++;
  }

  // 2. Cắt tỉa hậu tố chung (Common Suffix Optimization)
  let suffixLen = 0;
  while (
    suffixLen < m - prefixLen &&
    suffixLen < n - prefixLen &&
    tokensA[m - 1 - suffixLen] === tokensB[n - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefixTokens: DiffToken[] = tokensA.slice(0, prefixLen).map(t => ({ type: "unchanged" as const, value: t }));
  const suffixTokens: DiffToken[] = tokensA.slice(m - suffixLen).map(t => ({ type: "unchanged" as const, value: t }));

  const midA = tokensA.slice(prefixLen, m - suffixLen);
  const midB = tokensB.slice(prefixLen, n - suffixLen);

  if (midA.length === 0 && midB.length === 0) {
    return { tokens: [...prefixTokens, ...suffixTokens] };
  }
  if (midA.length === 0) {
    return {
      tokens: [
        ...prefixTokens,
        ...midB.map(t => ({ type: "added" as const, value: t })),
        ...suffixTokens,
      ]
    };
  }
  if (midB.length === 0) {
    return {
      tokens: [
        ...prefixTokens,
        ...midA.map(t => ({ type: "deleted" as const, value: t })),
        ...suffixTokens,
      ]
    };
  }

  const midM = midA.length;
  const midN = midB.length;
  const maxCells = options?.maxMatrixCells ?? 4_000_000;

  // 3. Nếu phần giữa vẫn quá lớn, chia nhỏ tiếp theo câu trước khi chạy DP
  if (midM * midN > maxCells) {
    // Nếu độ sâu đệ quy đã đạt giới hạn (>= 2): dừng đệ quy an toàn, gán toàn bộ midA là deleted, midB là added
    if (currentDepth >= 2) {
      return {
        tokens: [
          ...prefixTokens,
          ...midA.map(t => ({ type: "deleted" as const, value: t })),
          ...midB.map(t => ({ type: "added" as const, value: t })),
          ...suffixTokens,
        ],
        isPartial: true,
        limitReason: "Độ sâu phân rã đệ quy đạt giới hạn (>= 2 cấp) trên khối văn bản lớn",
      };
    }

    const textMidA = midA.join("");
    const textMidB = midB.join("");
    const sentencesA = splitIntoSentences(textMidA);
    const sentencesB = splitIntoSentences(textMidB);

    if (sentencesA.length > 1 || sentencesB.length > 1) {
      const sentenceDiff = computeBlockLcs(sentencesA, sentencesB);
      const subTokens: DiffToken[] = [];
      let anyPartial = false;
      let reason: string | undefined;

      for (const item of sentenceDiff) {
        if (item.type === "unchanged") {
          subTokens.push(...tokenizeWords(item.value || "").map(t => ({ type: "unchanged" as const, value: t })));
        } else if (item.type === "cluster") {
          const cA = tokenizeWords(item.valuesA.join(" "));
          const cB = tokenizeWords(item.valuesB.join(" "));

          // Kiểm tra xem bài toán con có thực sự thu nhỏ hay không
          const isIdenticalProblem =
            (item.valuesA.length === sentencesA.length && item.valuesB.length === sentencesB.length) ||
            (cA.length * cB.length >= midM * midN);

          if (isIdenticalProblem || currentDepth >= 1) {
            // Nếu không thu nhỏ hoặc đã ở depth >= 1, không được đệ quy mù quáng
            if (cA.length * cB.length > maxCells) {
              subTokens.push(
                ...cA.map(t => ({ type: "deleted" as const, value: t })),
                ...cB.map(t => ({ type: "added" as const, value: t }))
              );
              anyPartial = true;
              reason = "Cụm câu quá dài và khác biệt hoàn toàn (> 4 triệu phép tính), chưa thể phân rã chi tiết từng từ";
            } else {
              // cA.length * cB.length <= maxCells, chạy DP trực tiếp ở depth 99 (không split sentences nữa)
              const directRes = computeLcsDiff(cA, cB, { maxMatrixCells: maxCells, depth: 99 });
              subTokens.push(...directRes.tokens);
              if (directRes.isPartial) {
                anyPartial = true;
                reason = directRes.limitReason;
              }
            }
          } else {
            const res = computeLcsDiff(cA, cB, { maxMatrixCells: maxCells, depth: currentDepth + 1 });
            subTokens.push(...res.tokens);
            if (res.isPartial) {
              anyPartial = true;
              reason = res.limitReason;
            }
          }
        }
      }

      return {
        tokens: [...prefixTokens, ...subTokens, ...suffixTokens],
        isPartial: anyPartial,
        limitReason: reason,
      };
    }

    // Nếu là một khối liên tục không thể chia câu và vượt quá ngưỡng an toàn:
    // TUYỆT ĐỐI KHÔNG gán nhãn "unchanged"! Đánh dấu toàn bộ là thay đổi (xóa cũ, thêm mới)
    return {
      tokens: [
        ...prefixTokens,
        ...midA.map(t => ({ type: "deleted" as const, value: t })),
        ...midB.map(t => ({ type: "added" as const, value: t })),
        ...suffixTokens,
      ],
      isPartial: true,
      limitReason: "Khối văn bản quá dài liên tục (> 4 triệu phép tính) chưa thể phân rã chi tiết từng từ",
    };
  }

  // 4. Bảng tính DP LCS tối ưu bộ nhớ
  const dp: number[][] = Array.from({ length: midM + 1 }, () => new Array(midN + 1).fill(0));

  for (let i = 0; i < midM; i++) {
    for (let j = 0; j < midN; j++) {
      if (midA[i] === midB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Truy vết ngược để tạo diff tokens
  const midDiff: DiffToken[] = [];
  let i = midM;
  let j = midN;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
      midDiff.unshift({ type: "unchanged", value: midA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      midDiff.unshift({ type: "added", value: midB[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      midDiff.unshift({ type: "deleted", value: midA[i - 1] });
      i--;
    }
  }

  return {
    tokens: [...prefixTokens, ...midDiff, ...suffixTokens],
  };
}

/**
 * Phân tích so sánh cấp khối (Block-level LCS)
 */
interface BlockDiffItem {
  type: "unchanged" | "cluster";
  value?: string;
  valuesA: string[];
  valuesB: string[];
}

function computeBlockLcs(blocksA: string[], blocksB: string[]): BlockDiffItem[] {
  const m = blocksA.length;
  const n = blocksB.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) return [{ type: "cluster", valuesA: [], valuesB: blocksB }];
  if (n === 0) return [{ type: "cluster", valuesA: blocksA, valuesB: [] }];

  // 1. Cắt tỉa tiền tố chung ở cấp block
  let prefixLen = 0;
  while (prefixLen < m && prefixLen < n && blocksA[prefixLen] === blocksB[prefixLen]) {
    prefixLen++;
  }

  // 2. Cắt tỉa hậu tố chung ở cấp block
  let suffixLen = 0;
  while (
    suffixLen < m - prefixLen &&
    suffixLen < n - prefixLen &&
    blocksA[m - 1 - suffixLen] === blocksB[n - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const items: BlockDiffItem[] = [];
  for (let k = 0; k < prefixLen; k++) {
    items.push({
      type: "unchanged",
      value: blocksA[k],
      valuesA: [blocksA[k]],
      valuesB: [blocksB[k]],
    });
  }

  const midBlocksA = blocksA.slice(prefixLen, m - suffixLen);
  const midBlocksB = blocksB.slice(prefixLen, n - suffixLen);
  const midM = midBlocksA.length;
  const midN = midBlocksB.length;

  if (midM === 0 && midN === 0) {
    // Chỉ có prefix & suffix
  } else if (midM === 0) {
    items.push({ type: "cluster", valuesA: [], valuesB: midBlocksB });
  } else if (midN === 0) {
    items.push({ type: "cluster", valuesA: midBlocksA, valuesB: [] });
  } else if (midM * midN > 1_000_000) {
    // An toàn: Nếu số lượng block ở giữa quá lớn (> 1 triệu cell ma trận), gom thành cluster tránh tràn RAM
    items.push({ type: "cluster", valuesA: midBlocksA, valuesB: midBlocksB });
  } else {
    // Bảng DP cho khối ở giữa
    const dp: number[][] = Array.from({ length: midM + 1 }, () => new Array(midN + 1).fill(0));

    for (let i = 0; i < midM; i++) {
      for (let j = 0; j < midN; j++) {
        if (midBlocksA[i] === midBlocksB[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Truy vết ngược
    const rawMatches: Array<{ aIdx: number; bIdx: number }> = [];
    let i = midM;
    let j = midN;

    while (i > 0 && j > 0) {
      if (midBlocksA[i - 1] === midBlocksB[j - 1]) {
        rawMatches.unshift({ aIdx: i - 1, bIdx: j - 1 });
        i--;
        j--;
      } else if (dp[i][j - 1] >= dp[i - 1][j]) {
        j--;
      } else {
        i--;
      }
    }

    // Gom cụm khối thành các item
    let lastA = 0;
    let lastB = 0;

    for (const match of rawMatches) {
      if (match.aIdx > lastA || match.bIdx > lastB) {
        items.push({
          type: "cluster",
          valuesA: midBlocksA.slice(lastA, match.aIdx),
          valuesB: midBlocksB.slice(lastB, match.bIdx),
        });
      }
      items.push({
        type: "unchanged",
        value: midBlocksA[match.aIdx],
        valuesA: [midBlocksA[match.aIdx]],
        valuesB: [midBlocksB[match.bIdx]],
      });
      lastA = match.aIdx + 1;
      lastB = match.bIdx + 1;
    }

    if (lastA < midM || lastB < midN) {
      items.push({
        type: "cluster",
        valuesA: midBlocksA.slice(lastA, midM),
        valuesB: midBlocksB.slice(lastB, midN),
      });
    }
  }

  // Thêm suffix
  for (let k = m - suffixLen; k < m; k++) {
    items.push({
      type: "unchanged",
      value: blocksA[k],
      valuesA: [blocksA[k]],
      valuesB: [blocksB[k]],
    });
  }

  return items;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tính toán Visual Diff toàn diện giữa hai đoạn HTML/văn bản
 * Sử dụng giải thuật phân cấp: Đoạn (Block) -> Cụm thay đổi -> Từ (Word)
 */
export function computeVisualDiff(originalHtml: string, refinedHtml: string): DiffResult {
  const textA = htmlToStructuredText(originalHtml);
  const textB = htmlToStructuredText(refinedHtml);

  // Trường hợp cả hai trống
  if (!textA && !textB) {
    return {
      tokens: [],
      inlineHtml: '<p className="text-slate-400 italic">Văn bản trống.</p>',
      originalHighlightedHtml: '<p className="text-slate-400 italic">Văn bản trống.</p>',
      refinedHighlightedHtml: '<p className="text-slate-400 italic">Văn bản trống.</p>',
      stats: {
        addedCount: 0,
        deletedCount: 0,
        unchangedCount: 0,
        totalOriginalWords: 0,
        totalRefinedWords: 0,
      },
      comparisonScope: "body_text",
    };
  }

  const blocksA = splitIntoBlocks(textA);
  const blocksB = splitIntoBlocks(textB);

  const blockDiffItems = computeBlockLcs(blocksA, blocksB);

  const diffTokens: DiffToken[] = [];
  let isPartial = false;
  let limitReason: string | undefined;

  for (let idx = 0; idx < blockDiffItems.length; idx++) {
    const item = blockDiffItems[idx];
    const isLast = idx === blockDiffItems.length - 1;

    if (item.type === "unchanged" && item.value !== undefined) {
      const tokens = tokenizeWords(item.value);
      for (const t of tokens) {
        diffTokens.push({ type: "unchanged", value: t });
      }
      if (!isLast) {
        diffTokens.push({ type: "unchanged", value: "\n\n" });
      }
    } else {
      // Cụm khối có thay đổi: so sánh token chi tiết bên trong cụm
      const textClusterA = item.valuesA.join("\n\n");
      const textClusterB = item.valuesB.join("\n\n");

      const tokensA = tokenizeWords(textClusterA);
      const tokensB = tokenizeWords(textClusterB);

      const res = computeLcsDiff(tokensA, tokensB);
      diffTokens.push(...res.tokens);

      if (res.isPartial) {
        isPartial = true;
        limitReason = res.limitReason;
      }

      if (!isLast) {
        diffTokens.push({ type: "unchanged", value: "\n\n" });
      }
    }
  }

  let addedCount = 0;
  let deletedCount = 0;
  let unchangedCount = 0;

  // 1. Tạo inlineHtml (Visual Diff kết hợp cả thêm và xóa)
  const inlineParts: string[] = [];
  for (const token of diffTokens) {
    const isWord = /[\p{L}\p{N}]+/u.test(token.value);
    const escaped = escapeHtml(token.value).replace(/\n/g, "<br/>");

    if (token.type === "deleted") {
      if (isWord) deletedCount++;
      inlineParts.push(
        `<del class="bg-rose-100 text-rose-700 line-through px-1 py-0.5 rounded mx-0.5 border border-rose-200 select-all" title="Nội dung gốc đã xóa/thay thế">${escaped}</del>`
      );
    } else if (token.type === "added") {
      if (isWord) addedCount++;
      inlineParts.push(
        `<ins class="bg-emerald-100 text-emerald-800 font-semibold no-underline px-1 py-0.5 rounded mx-0.5 border border-emerald-200 select-all" title="Nội dung đã sửa đổi/bổ sung">${escaped}</ins>`
      );
    } else {
      if (isWord) unchangedCount++;
      inlineParts.push(escaped);
    }
  }

  // 2. Tạo originalHighlightedHtml (Cột trái: Gốc với highlight từ bị xóa/thay đổi)
  const originalParts: string[] = [];
  for (const token of diffTokens) {
    if (token.type === "added") continue;
    const escaped = escapeHtml(token.value).replace(/\n/g, "<br/>");
    if (token.type === "deleted") {
      originalParts.push(
        `<span class="bg-rose-100 text-rose-700 line-through px-0.5 rounded font-medium">${escaped}</span>`
      );
    } else {
      originalParts.push(escaped);
    }
  }

  // 3. Tạo refinedHighlightedHtml (Cột phải: Mới với highlight từ được thêm/sửa)
  const refinedParts: string[] = [];
  for (const token of diffTokens) {
    if (token.type === "deleted") continue;
    const escaped = escapeHtml(token.value).replace(/\n/g, "<br/>");
    if (token.type === "added") {
      refinedParts.push(
        `<span class="bg-emerald-100 text-emerald-800 font-semibold px-0.5 rounded border-b border-emerald-400">${escaped}</span>`
      );
    } else {
      refinedParts.push(escaped);
    }
  }

  const allTokensA = tokenizeWords(textA);
  const allTokensB = tokenizeWords(textB);

  return {
    tokens: diffTokens,
    inlineHtml: inlineParts.join(""),
    originalHighlightedHtml: originalParts.join(""),
    refinedHighlightedHtml: refinedParts.join(""),
    stats: {
      addedCount,
      deletedCount,
      unchangedCount,
      totalOriginalWords: allTokensA.filter(t => /[\p{L}\p{N}]+/u.test(t)).length,
      totalRefinedWords: allTokensB.filter(t => /[\p{L}\p{N}]+/u.test(t)).length,
    },
    comparisonScope: "body_text",
    isPartial,
    limitReason,
  };
}
