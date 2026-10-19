import assert from "node:assert/strict";
import { extractBlocksFromTxt } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";

const input = "\uFEFFKẾ HOẠCH\r\nSố: 01/KH-TEST\r\nHải Phòng, ngày 15 tháng 10 năm 2026\r\nVề việc kiểm tra\r\nNội dung thử nghiệm";
const extracted = extractBlocksFromTxt(input);
const result = segmentSourceBlocks(extracted.blocks, { filename: "fixture.txt", fileType: "txt" });
assert.equal(result.fields.documentType.value, "KẾ HOẠCH");
assert.equal(result.fields.referenceNumber.value, "Số: 01/KH-TEST");
assert.equal(result.fields.subject.value, "Về việc kiểm tra");
assert.deepEqual(result.unclassified.map((block) => block.text), []);
console.log("[PASS] TXT with BOM and title before reference/date maps all visible fields");
