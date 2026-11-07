import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { Packer } from "docx";
import {
  COMPANY_HEADER_PROFILE_ID,
  applyCompanyProfile,
} from "../src/canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PROFILE_ID,
  applyCompanyHD05Profile,
} from "../src/canonical/hd05/companyHeaderHD05.ts";
import { type DocumentFormatType } from "../src/shared/schemas/document.schema.ts";
import { generateND30DocxDocument, postProcessDocxShapes } from "../src/utils/docxExport.ts";
import { HD05_HOA_TIEU_SETTINGS_XML, ND30_HOA_TIEU_SETTINGS_XML } from "../src/utils/hoaTieuHeaderReferenceXml.ts";
import { hasStampedHoaTieuHeader, stampHoaTieuHeader } from "../src/utils/hoaTieuHeaderStamp.ts";

function createSyntheticCompanyDocument(): DocumentFormatType {
  return applyCompanyProfile({
    regime: "administrative",
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    fontFamily: "Times New Roman",
    fontSize: 13,
    orgHeader1: "",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    locationAndDate: "Hải Phòng, ngày 01 tháng 01 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: "Số: 01/TB-HTMB",
    subject: "Về nội dung tổng hợp thử nghiệm",
    bodyHtml: "<p>Đoạn tổng hợp không chứa dữ liệu thật.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người thử nghiệm",
    recipients: "Lưu: VT.",
  });
}

function createSyntheticPartyDocument(): DocumentFormatType {
  return applyCompanyHD05Profile({
    regime: "party",
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    fontFamily: "Times New Roman",
    fontSize: 14,
    orgHeader1: "",
    orgHeader2: "",
    locationAndDate: "Hải Phòng, ngày 01 tháng 01 năm 2026",
    documentType: "NGHỊ QUYẾT",
    referenceNumber: "Số 01-NQ/ĐU",
    subject: "Về nội dung tổng hợp thử nghiệm",
    bodyHtml: "<p>Đoạn tổng hợp không chứa dữ liệu thật.</p>",
    signTitle: "BÍ THƯ",
    signName: "Người thử nghiệm",
    recipients: "Lưu: VP Đảng ủy.",
  });
}

function extractElement(xml: string, qualifiedName: string): string | null {
  const start = xml.indexOf(`<${qualifiedName}`);
  if (start < 0) return null;
  const openEnd = xml.indexOf(">", start);
  if (openEnd < 0) return null;
  if (xml.slice(start, openEnd + 1).trimEnd().endsWith("/>")) return xml.slice(start, openEnd + 1);
  const closingTag = `</${qualifiedName}>`;
  const end = xml.indexOf(closingTag, openEnd + 1);
  return end < 0 ? null : xml.slice(start, end + closingTag.length);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const profiles = [
  {
    name: "NĐ30",
    data: createSyntheticCompanyDocument(),
    expectedShape: "ND30 Plain Line 1",
    referenceSettings: ND30_HOA_TIEU_SETTINGS_XML,
  },
  {
    name: "HD05",
    data: createSyntheticPartyDocument(),
    expectedShape: "Straight Connector 1",
    referenceSettings: HD05_HOA_TIEU_SETTINGS_XML,
  },
] as const;

async function createUnstampedFixture(data: DocumentFormatType) {
  const packed = await Packer.toArrayBuffer(generateND30DocxDocument(data));
  const bytes = await postProcessDocxShapes(new Uint8Array(packed));
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const settingsXml = await zip.file("word/settings.xml")?.async("string");
  assert.ok(documentXml && settingsXml, "synthetic DOCX includes document and settings parts");
  return { bytes, zip, documentXml, settingsXml };
}

for (const profile of profiles) {
  test(`${profile.name} header stamping preserves unrelated settings and package structure`, async () => {
    const packed = await Packer.toArrayBuffer(generateND30DocxDocument(profile.data));
    const generated = await postProcessDocxShapes(new Uint8Array(packed));
    const sourceZip = await JSZip.loadAsync(generated);
    const sourceDocument = await sourceZip.file("word/document.xml")?.async("string");
    const sourceSettings = await sourceZip.file("word/settings.xml")?.async("string");
    const sourceRelationships = await sourceZip.file("word/_rels/document.xml.rels")?.async("string");
    assert.ok(sourceDocument && sourceSettings && sourceRelationships, "synthetic DOCX includes document, settings, and relationships parts");
    assert.match(sourceRelationships, /<Relationship\b/, "synthetic DOCX includes package relationships");
    assert.match(sourceDocument, /<w:sectPr\b/, "synthetic DOCX includes section properties");
    assert.ok(sourceDocument.includes(`name="${profile.expectedShape}"`), "synthetic DOCX includes the profile shape");

    const unrelatedSetting = "<w:doNotTrackMoves/>";
    assert.doesNotMatch(sourceSettings, /<w:doNotTrackMoves\b/, "synthetic setting is not already present");
    sourceZip.file("word/settings.xml", sourceSettings.replace("</w:settings>", `${unrelatedSetting}</w:settings>`));
    const settingsBeforeStamp = (await sourceZip.file("word/settings.xml")?.async("string")) ?? "";
    const input = await sourceZip.generateAsync({ type: "uint8array" });
    const inputSha = sha256(input);

    const stamped = await stampHoaTieuHeader(input, profile.data);
    assert.equal(sha256(input), inputSha, "stamping does not mutate source bytes");
    const stampedZip = await JSZip.loadAsync(stamped);
    const stampedDocument = await stampedZip.file("word/document.xml")?.async("string");
    const stampedSettings = await stampedZip.file("word/settings.xml")?.async("string");
    const stampedRelationships = await stampedZip.file("word/_rels/document.xml.rels")?.async("string");
    assert.ok(stampedDocument && stampedSettings && stampedRelationships, "stamped DOCX retains its document parts");

    const requiredShapeDefaults = extractElement(profile.referenceSettings, "w:shapeDefaults");
    assert.ok(requiredShapeDefaults, "canonical reference includes shape defaults");
    assert.equal(extractElement(stampedSettings, "w:shapeDefaults"), requiredShapeDefaults, "canonical shape defaults are available after the stamp");
    const requiredWpsFeature = extractElement(profile.referenceSettings, "wpsCustomData:typoFeatureVersion");
    if (requiredWpsFeature) assert.equal(extractElement(stampedSettings, "wpsCustomData:typoFeatureVersion"), requiredWpsFeature, "HD05 WPS feature setting remains available");
    assert.match(stampedSettings, /<w:doNotTrackMoves\/>/, "unrelated source setting is preserved");
    assert.equal(stampedRelationships, sourceRelationships, "relationship part is preserved byte-for-byte as XML text");
    assert.match(stampedDocument, /<w:sectPr\b/, "section properties survive the table stamp");
    assert.ok(stampedDocument.includes(`name="${profile.expectedShape}"`), "canonical shape survives the table stamp");
    assert.ok(stampedDocument.includes("Đoạn tổng hợp không chứa dữ liệu thật."), "unrelated body content survives the table stamp");
    assert.equal(hasStampedHoaTieuHeader(stampedDocument, stampedSettings, profile.data), true, "candidate check accepts preserved settings with the required stamp settings");

    const secondStamp = await stampHoaTieuHeader(stamped, profile.data);
    const secondZip = await JSZip.loadAsync(secondStamp);
    assert.equal(await secondZip.file("word/document.xml")?.async("string"), stampedDocument, "a second stamp leaves the document XML unchanged");
    assert.equal(await secondZip.file("word/settings.xml")?.async("string"), stampedSettings, "a second stamp leaves settings XML unchanged");
    assert.equal(await secondZip.file("word/_rels/document.xml.rels")?.async("string"), stampedRelationships, "a second stamp leaves relationships unchanged");

    let preservedSettings = stampedSettings.replace(requiredShapeDefaults, "");
    if (requiredWpsFeature) {
      const requiredWpsAlternateContent = extractElement(profile.referenceSettings, "mc:AlternateContent");
      const extensionNamespace = ' xmlns:wpsCustomData="http://www.wps.cn/officeDocument/2013/wpsCustomData"';
      assert.ok(requiredWpsAlternateContent?.includes(requiredWpsFeature), "canonical reference wraps its WPS marker in AlternateContent");
      preservedSettings = preservedSettings
        .replace(requiredWpsAlternateContent!, "")
        .replace(extensionNamespace, "");
    }
    assert.equal(preservedSettings, settingsBeforeStamp, "existing settings are unchanged except for the narrowly required header settings");
  });
}

test("header stamping does not overwrite conflicting source shape defaults", async () => {
  const profile = profiles[0];
  const packed = await Packer.toArrayBuffer(generateND30DocxDocument(profile.data));
  const generated = await postProcessDocxShapes(new Uint8Array(packed));
  const sourceZip = await JSZip.loadAsync(generated);
  const sourceDocument = await sourceZip.file("word/document.xml")?.async("string");
  const sourceSettings = await sourceZip.file("word/settings.xml")?.async("string");
  assert.ok(sourceDocument && sourceSettings, "synthetic DOCX includes document and settings parts");
  const conflictingDefaults = '<w:shapeDefaults><o:shapedefaults fillcolor="#123456"/></w:shapeDefaults>';
  sourceZip.file("word/settings.xml", sourceSettings.replace("</w:settings>", `${conflictingDefaults}</w:settings>`));
  const input = await sourceZip.generateAsync({ type: "uint8array" });
  const conflictedSettings = await (await JSZip.loadAsync(input)).file("word/settings.xml")?.async("string");
  assert.ok(conflictedSettings);

  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "stamp refuses to rewrite a document with conflicting shape defaults");
  assert.equal(hasStampedHoaTieuHeader(sourceDocument, conflictedSettings, profile.data), false, "candidate verification does not claim the conflicting settings are stamped");
});

test("commented shape defaults do not satisfy or suppress the real required setting", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const expectedShapeDefaults = extractElement(profile.referenceSettings, "w:shapeDefaults");
  assert.ok(expectedShapeDefaults);
  const commentedSettings = fixture.settingsXml.replace("</w:settings>", `<!--${expectedShapeDefaults}--></w:settings>`);
  fixture.zip.file("word/settings.xml", commentedSettings);
  const input = await fixture.zip.generateAsync({ type: "uint8array" });

  const stamped = await stampHoaTieuHeader(input, profile.data);
  const stampedZip = await JSZip.loadAsync(stamped);
  const stampedDocument = await stampedZip.file("word/document.xml")?.async("string");
  const stampedSettings = await stampedZip.file("word/settings.xml")?.async("string");
  assert.ok(stampedDocument && stampedSettings);
  const actualSettingsWithoutComments = stampedSettings.replace(/<!--[\s\S]*?-->/g, "");
  assert.equal(extractElement(actualSettingsWithoutComments, "w:shapeDefaults"), expectedShapeDefaults, "stamp adds an actual settings element after ignoring the comment decoy");
  assert.equal(hasStampedHoaTieuHeader(stampedDocument, stampedSettings, profile.data), true, "the real inserted setting passes the gate");
  assert.equal(hasStampedHoaTieuHeader(stampedDocument, commentedSettings, profile.data), false, "a comment decoy cannot pass the gate");
});

test("a canonical header table inside a comment is not stamped or accepted as a candidate", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  const validSettings = await validZip.file("word/settings.xml")?.async("string");
  assert.ok(validDocument && validSettings);
  const canonicalTable = extractElement(validDocument, "w:tbl");
  assert.ok(canonicalTable, "fixture has a header table");
  assert.ok(canonicalTable.includes('name="ND30 Plain Line 1"'), "fixture has the actual canonical header table");
  const commentOnlyDocument = validDocument.replace(canonicalTable, `<!--${canonicalTable}-->`);
  assert.notEqual(commentOnlyDocument, validDocument, "fixture moves the entire canonical header table into a comment");
  assert.doesNotMatch(commentOnlyDocument.replace(/<!--[\s\S]*?-->/g, ""), /ND30 Plain Line 1/, "the shape marker exists only inside the comment");

  const commentOnlyZip = await JSZip.loadAsync(validStamp);
  commentOnlyZip.file("word/document.xml", commentOnlyDocument);
  const input = await commentOnlyZip.generateAsync({ type: "uint8array" });
  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "stamping does not match or replace table markup inside a comment");
  assert.equal(hasStampedHoaTieuHeader(commentOnlyDocument, validSettings, profile.data), false, "candidate verification requires the actual body table element");
});

test("a foreign element with a header-like name cannot cause a content table to be stamped", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  const validSettings = await validZip.file("word/settings.xml")?.async("string");
  assert.ok(validDocument && validSettings);
  const canonicalTable = extractElement(validDocument, "w:tbl");
  assert.ok(canonicalTable);
  const foreignTable = '<w:tbl><x:node xmlns:x="urn:foreign-shape" name="ND30 Plain Line 1"/></w:tbl>';
  const foreignMarkerDocument = validDocument.replace(canonicalTable, foreignTable);
  assert.notEqual(foreignMarkerDocument, validDocument, "fixture replaces the stamped header with a content table and foreign marker");

  const foreignZip = await JSZip.loadAsync(validStamp);
  foreignZip.file("word/document.xml", foreignMarkerDocument);
  const input = await foreignZip.generateAsync({ type: "uint8array" });
  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "a foreign node name cannot make an arbitrary table eligible for stamping");
  assert.equal(hasStampedHoaTieuHeader(foreignMarkerDocument, validSettings, profile.data), false, "candidate verification ignores foreign shape-like nodes");
});

test("Word namespace rebindings on the body or direct table fail closed", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  const validSettings = await validZip.file("word/settings.xml")?.async("string");
  assert.ok(validDocument && validSettings);
  const canonicalTable = extractElement(validDocument, "w:tbl");
  assert.ok(canonicalTable);
  const invalidDocuments = [
    ["body", validDocument.replace("<w:body>", '<w:body xmlns:w="urn:wrong-word-body">')],
    ["table", validDocument.replace(canonicalTable, canonicalTable.replace("<w:tbl>", '<w:tbl xmlns:w="urn:wrong-word-table">'))],
  ] as const;

  for (const [scope, invalidDocument] of invalidDocuments) {
    assert.notEqual(invalidDocument, validDocument, `fixture rebinds the w namespace on the ${scope}`);
    const candidateZip = await JSZip.loadAsync(validStamp);
    candidateZip.file("word/document.xml", invalidDocument);
    const input = await candidateZip.generateAsync({ type: "uint8array" });
    assert.equal(hasStampedHoaTieuHeader(invalidDocument, validSettings, profile.data), false, `candidate gate rejects a ${scope} namespace mismatch`);
    assert.equal(await stampHoaTieuHeader(input, profile.data), input, `stamping preserves input with a ${scope} namespace mismatch`);
  }
});

test("settings with a wrong Word namespace binding are preserved and fail closed", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const wrongNamespace = fixture.settingsXml.replace(
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    'xmlns:w="urn:wrong-word-settings-namespace"',
  );
  assert.notEqual(wrongNamespace, fixture.settingsXml, "fixture changes the actual root namespace binding");
  fixture.zip.file("word/settings.xml", wrongNamespace);
  const input = await fixture.zip.generateAsync({ type: "uint8array" });

  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "stamp does not rewrite settings whose Word prefix is rebound");
  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  assert.ok(validDocument);
  assert.equal(hasStampedHoaTieuHeader(validDocument, wrongNamespace, profile.data), false, "the candidate gate validates the real root namespace binding");
});

test("duplicate canonical and conflicting shape defaults fail closed in stamping and candidate verification", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const canonicalShapeDefaults = extractElement(profile.referenceSettings, "w:shapeDefaults");
  assert.ok(canonicalShapeDefaults);
  const conflictingShapeDefaults = '<w:shapeDefaults><o:shapedefaults fillcolor="#123456"/></w:shapeDefaults>';
  const duplicateSettings = fixture.settingsXml.replace(
    "</w:settings>",
    `${canonicalShapeDefaults}${conflictingShapeDefaults}</w:settings>`,
  );
  fixture.zip.file("word/settings.xml", duplicateSettings);
  const input = await fixture.zip.generateAsync({ type: "uint8array" });

  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "stamp preserves the input when duplicate required settings exist");
  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  const validSettings = await validZip.file("word/settings.xml")?.async("string");
  assert.ok(validDocument && validSettings);
  const candidateSettings = validSettings.replace("</w:settings>", `${conflictingShapeDefaults}</w:settings>`);
  assert.equal(hasStampedHoaTieuHeader(validDocument, candidateSettings, profile.data), false, "a canonical first setting cannot hide a conflicting duplicate");
});

test("DOCTYPE and entity declarations are rejected without changing source settings", async () => {
  const profile = profiles[0];
  const fixture = await createUnstampedFixture(profile.data);
  const declaredSettings = fixture.settingsXml.replace(
    "<w:settings",
    '<!DOCTYPE w:settings [<!ENTITY fake "decoy">]><w:settings',
  );
  fixture.zip.file("word/settings.xml", declaredSettings);
  const input = await fixture.zip.generateAsync({ type: "uint8array" });
  const output = await stampHoaTieuHeader(input, profile.data);
  assert.equal(output, input, "unsupported declarations fail closed and preserve the input bytes");

  const validStamp = await stampHoaTieuHeader(fixture.bytes, profile.data);
  const validZip = await JSZip.loadAsync(validStamp);
  const validDocument = await validZip.file("word/document.xml")?.async("string");
  assert.ok(validDocument);
  assert.equal(hasStampedHoaTieuHeader(validDocument, declaredSettings, profile.data), false, "the candidate gate rejects declarations without interpreting entities");
});
