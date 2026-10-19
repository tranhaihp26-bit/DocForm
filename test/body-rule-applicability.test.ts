import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { 
  resolveRuleApplicability, 
  BODY_RULES_CATALOG 
} from "../src/canonical/bodyRuleApplicability.ts";

describe("Task 6: Body Rule Applicability & Two Regimes Scope", () => {
  it("ND30: Thụt đầu dòng chấp nhận cả 1.0cm và 1.27cm (567 đến 720 dxa), quy định là mandatory_legal", () => {
    const spec = BODY_RULES_CATALOG["ND30-BODY-FIRST-LINE-INDENT"];
    assert.ok(spec);
    assert.equal(spec.regime, "administrative");
    assert.equal(spec.category, "mandatory_legal");
    assert.ok(spec.descriptionVi.includes("1.0cm") && spec.descriptionVi.includes("1.27cm"));

    const app = resolveRuleApplicability("ND30-BODY-FIRST-LINE-INDENT", "administrative", "QUYET_DINH", "body");
    assert.equal(app.status, "applies");
    assert.equal(app.category, "mandatory_legal");
  });

  it("HD05: Thân bài văn bản Đảng là 14-15pt, dãn dòng exact 18-22pt, không áp chéo sang ND30", () => {
    const fontSpec = BODY_RULES_CATALOG["HD05-BODY-FONT-SIZE"];
    const lineSpec = BODY_RULES_CATALOG["HD05-BODY-LINE-SPACING"];
    assert.equal(fontSpec.regime, "party");
    assert.equal(lineSpec.regime, "party");

    // Thử áp dụng rule Đảng cho văn bản Hành chính (ND30) -> phải trả not_applicable
    const appPartyInAdmin = resolveRuleApplicability("HD05-BODY-FONT-SIZE", "administrative", "CONG_VAN", "body");
    assert.equal(appPartyInAdmin.status, "not_applicable");
    assert.ok(appPartyInAdmin.reason.includes("Đảng (HD05)"));

    // Áp dụng đúng cho Đảng -> applies
    const appPartyInParty = resolveRuleApplicability("HD05-BODY-FONT-SIZE", "party", "CONG_VAN", "body");
    assert.equal(appPartyInParty.status, "applies");
    assert.equal(appPartyInParty.category, "mandatory_legal");
  });

  it("Ô bảng biểu KHÔNG tự động kế thừa rule thụt đầu dòng hay cỡ chữ của đoạn thân bài", () => {
    // Đoạn thân bài áp dụng rule thụt đầu dòng
    const appPara = resolveRuleApplicability("ND30-BODY-FIRST-LINE-INDENT", "administrative", "QUYET_DINH", "body");
    assert.equal(appPara.status, "applies");

    // Ô bảng biểu trong thân bài KHÔNG áp dụng rule thụt đầu dòng đoạn văn
    const appCell = resolveRuleApplicability("ND30-BODY-FIRST-LINE-INDENT", "administrative", "QUYET_DINH", "body", "body_data");
    assert.equal(appCell.status, "not_applicable");
    assert.ok(appCell.reason.includes("không áp dụng cho ô bảng biểu"));
  });

  it("Thiết lập viền bảng là aesthetic_preset, KHÔNG biến thành lỗi pháp lý (mandatory_legal)", () => {
    const borderSpec = BODY_RULES_CATALOG["ND30-TABLE-BORDER-PRESET"];
    assert.ok(borderSpec);
    assert.equal(borderSpec.category, "aesthetic_preset");
    assert.notEqual(borderSpec.category, "mandatory_legal");

    const app = resolveRuleApplicability("ND30-TABLE-BORDER-PRESET", "administrative", "BAO_CAO", "body", "body_data");
    assert.equal(app.status, "applies");
    assert.equal(app.category, "aesthetic_preset");
  });

  it("Phân biệt ký hiệu: ND30 bắt buộc 'Số: ' có dấu hai chấm, HD05 dùng 'Số ' không dấu hai chấm", () => {
    // Không suy số văn bản từ chữ 'số' trong tên cơ quan
    const isAgencyNameWithSo = /^(Sở\s+GTVT|Sở\s+Nội\s+vụ|Cơ\s+số)/i.test("Sở GTVT tỉnh Quảng Ninh");
    assert.ok(isAgencyNameWithSo);

    const partyRefPattern = /^Số\s+\d+/i;
    const adminRefPattern = /^Số:\s*\d+/i;

    assert.ok(partyRefPattern.test("Số 12-NQ/TW"));
    assert.ok(!partyRefPattern.test("Số: 12-NQ/TW"));

    assert.ok(adminRefPattern.test("Số: 125/QĐ-UBND"));
    assert.ok(!adminRefPattern.test("Số 125/QĐ-UBND"));
  });
});
