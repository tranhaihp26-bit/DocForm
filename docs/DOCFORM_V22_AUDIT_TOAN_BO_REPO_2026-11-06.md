# DocForm — Audit bao phủ repository theo chính sách V2.2 (06/11/2026)

**Chính sách chuẩn:** [Product First — Profile override, ND30/HD05 fallback theo từng thuộc tính](DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).

## Phạm vi

Snapshot sau đợt bổ sung hướng dẫn: 458 mục cây Git (414 tệp, 44 thư mục). Đã **quét nội dung 364 tệp văn bản/mã**: 59 Markdown, 114 tệp app/server/script cấu trúc, 153 tệp TS/TSX test/support và 38 tệp text khác bao gồm `src/App.tsx`, rule catalog JSON, CSS, lockfile và vendor. 50 nhị phân (32 PNG, 13 DOCX, 4 TTF, 1 PDF) được **kiểm kê theo loại và vai trò**, chưa mở/kiểm cấu trúc nội tại. Phân tích sâu những file có ảnh hưởng đến profile, fallback, export và trạng thái UI.

Đây là audit tĩnh trên GitHub; không chạy lint/test, không mở WPS/Word thật và không suy ra kết quả runtime từ việc có code hay test.

## Kết luận

**Còn thiếu triển khai runtime V2.2.** Các hướng dẫn product-first đã có; không được đồng nhất việc sửa Markdown với việc mọi code path đã áp `profile → fallback per-attribute → UNSPECIFIED`. Không kiểm lại/cảnh báo xung đột ND30/HD05 đối với giá trị đã thuộc profile Công ty. Các gate nội dung, bảng, revision và an toàn vẫn độc lập.

## Phần hướng dẫn vừa cập nhật bổ sung

- `README.md`: tiêu đề Product First và cổng mặc định đúng **5050** (đối chiếu `server.ts`, không phải 3000).
- `src/server/AGENTS.md`: không tự coi profile đã được xác nhận do trùng tên cơ quan; middleware phải tôn trọng từng giá trị profile.
- `src/canonical/hd05/README.md`: HD05 chỉ fallback cho trường chưa có profile.
- `docs/DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md`: điều khoản V2.2 được ưu tiên khi đọc UX contract lịch sử.
- `src/canonical/nd30/source-contract/{README.md,APPLICABILITY.md,RULE-MODEL.md}`: gắn ranh giới **tư liệu upstream về nguồn pháp lý**, không phải precedence thông số khi xuất DocForm; giữ nguyên văn bản gốc để không sửa lại lịch sử.

Commits: [bổ sung hướng dẫn](https://github.com/tranhaihp26-bit/DocForm/commit/bedc20ec50ecd7e022000e16a163574cc6f4c854), [chỉnh heading UX](https://github.com/tranhaihp26-bit/DocForm/commit/ba42ca74c3f4ee65ecc2379f8f93f3ddc79ae3e1). Link Markdown của bảy file này đã kiểm lại: **0 liên kết nội bộ không tồn tại**.

## Các vị trí code còn phải thay đổi/đánh giá thực

| ID | Ưu tiên | Tệp | Bằng chứng/rủi ro |
|---|---|---|---|
| RT-01 | P0 | `src/canonical/ruleEngine.ts` | Đang đánh giá rule `mandatory_legal` và `company_profile` trong mô hình chung; chưa có bằng chứng suppression theo **từng thuộc tính đã được profile định nghĩa**. Đầu file còn ghi profile không nới lỏng rule pháp lý. |
| RT-02 | P0 | `src/utils/documentComposer.ts:19-30` | `headerProfile='generic'` vẫn có thể bị tự thay thành company khi tên cơ quan khớp. |
| RT-03 | P0 | `src/utils/importSessionLifecycle.ts:166-177` | Gán `selectedProfile` dựa trên so khớp tên cơ quan ngay lúc nhập; phải phân biệt gợi ý với đã xác nhận. |
| RT-04 | P0 | `src/server/middleware/compliance.middleware.ts:124-149` | AI compliance middleware hardcode/override 13pt hành chính và 14pt Đảng bất kể cấu hình profile nguồn. Cần xét caller cụ thể trước khi sửa. |
| RT-05 | P0 | `src/components/WorkspaceExport.tsx:202-209` | Copy UI khẳng định “Văn bản đủ điều kiện ban hành” khi chỉ có báo cáo kiểm tra tự động. |
| RT-06 | P1 | `src/utils/semanticRuleFormatting.ts:27-44` | Định dạng Body được chọn bằng giá trị cứng theo regime/profile ID; chưa có resolver `isConfigured` + provenance theo từng trường. |
| RT-07 | P1 | `src/utils/docxExport.ts`, `documentComposer.ts`, `src/shared/schemas/document.schema.ts` | Có giá trị default 13/14; đường body Công ty có profile 14/Exactly19 nhưng phải đo **DOCX thực** theo từng phạm vi để không bị default ghi đè. |
| RT-08 | P1 | `src/components/A4DocumentPreview.tsx`, `WorkspaceEditor.tsx` | Preview/CSS hardcode có thể lệch effective formatting; chưa chứng minh là lỗi. |
| RT-09 | P2 | `src/utils/tableFormatUtils.ts:319-323` | Mẫu `fontSizePt || 13`; cần phân biệt absent và falsy ở các trường cho phép 0, không coi font-size 0 là hợp lệ. |
| RT-10 | P1 | `src/canonical/bodyRuleApplicability.ts`, `semanticRuleSelector.ts` | Chọn rule theo chế độ và category; cần kiểm sự nối với policy effective property nếu có đường gọi áp dụng/QA. |
| RT-11 | P1 | `src/server/sourceVisualRenderer.ts`, `candidatePdfRenderer.win.ps1` | Chưa có bằng chứng WPS real render trong audit này; mock không thay cho nghiệm thu bố cục. |

Đây là các **điểm tồn tại/rủi ro qua đọc code**, không phải tuyên bố tất cả đã gây lỗi trong mọi luồng sử dụng.

## Bộ test cần mở rộng khi triển khai

`test/company-body-profile.test.ts`, `semantic-rule-formatting.test.ts`, `profile-decision-gate.test.ts`, `source-mismatch-profile.test.ts`, `nd30-canonical-overlay.test.ts`, `body-rule-applicability.test.ts`, `nd30-compliance.test.ts`, `workspace-candidate.test.ts`, `workspace-ui-contract.test.ts`, `stage5-word-visual-acceptance.test.ts`. Không cần sửa toàn bộ 153 file test.

Ca kiểm bắt buộc: profile định nghĩa giá trị khác ND30/HD05 **vẫn đúng**, không warning/hậu kiểm; chỉ thuộc tính profile thiếu mới fallback đúng regime; cả hai thiếu → UNSPECIFIED; `0`/`false`/`""` được giữ; profile import chưa xác nhận không được tự áp; DOCX không mất nội dung và revision đúng; UI không tuyên bố được phép ban hành chỉ từ checks kỹ thuật.

## Những tệp cố ý giữ nguyên

- Hai mẫu header DOCX, hai `profile.json`, `companyHeader.ts`/ `companyHeaderHD05.ts`, `companyBodyProfile.ts`: đã chứa giá trị profile, **không đổi số đo** chỉ vì đổi precedence.
- Tài liệu audit, kế hoạch, fixture, ảnh, font, rule catalog gốc và `vendor/`: là tư liệu nguồn/lịch sử/tham chiếu hoặc mã ngoài phạm vi; không cập nhật nhãn V2.2 hàng loạt.
- Source/OOXML fidelity gate và WPS preview identity: không nới lỏng chỉ để cho phép xuất.

## Đề xuất tiến hành

1. **P0:** Trạng thái UI Bước 3, kiểm soát xác nhận profile khi import/compose và override trong middleware; thực hiện theo test tương ứng.
2. **P1:** Xây một resolver thuộc tính **nhỏ**, có provenance, kế thừa các cấu hình đã duyệt; nối các consumer đang thực sự sử dụng và rule QA; không viết lại cả editor/exporter.
3. **P1:** Pilot tạo mới ND30/HD05 theo profile, nhập chuẩn hóa DOCX sai, nhập bảng nhiều trang; đo OOXML và render thật.
4. **P2:** Chỉ thử OOXML patch/kiến trúc khác sau khi có ca lỗi cụ thể không giải quyết hợp lý bằng pipeline hiện tại.

**Trạng thái:** cập nhật hướng dẫn **ĐÃ COMMIT**; runtime/test V2.2 **CHƯA TRIỂN KHAI/CHƯA NGHIỆM THU**. Không chạy build/lint/test trong phiên audit này.
