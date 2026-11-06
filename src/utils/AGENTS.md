# Hướng dẫn cho `src/utils`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 2, 3, 8, 9 và 11.

## Nguồn, trạng thái và quyết định

- Giữ nguyên byte nguồn trong `source_blobs`; báo đúng lưu bền vững `indexeddb` hay tạm thời `memory`. Không thay bản gốc bằng nội dung đã chuẩn hóa.
- `draftStore.ts` là kho bản nháp hoạt động của UI hiện hành. `documentSessionStore.ts` và migration là hạ tầng riêng; không quảng bá thành giao diện nhiều hồ sơ nếu chưa nối vào UI.
- Quyết định regime/loại/profile phải gắn với fingerprint/nguồn và regime hiện tại qua `sourceMismatch.ts`/`profileDecision.ts`. Không áp profile chỉ vì lựa chọn UI hoặc tên file.
- Đề xuất AI/semantic gắn với `targetBlockId`, cell/anchor, fingerprint và revision; người dùng quyết định Áp dụng/Bỏ qua. Không sửa nguồn trực tiếp; từ chối an toàn nếu `original` không còn khớp.

## Thông số hiệu lực theo profile V2.2

- Chọn profile Công ty đã xác nhận làm nguồn thông số cao nhất theo **từng thuộc tính**, cả những trường phân tán trong JSON header, TypeScript body/table và mẫu đã duyệt. Chỉ trường chưa cấu hình trong mọi cấp profile mới fallback ND30/HD05 cùng chế độ. **Không hậu kiểm hoặc báo lỗi vì khác mặc định ND30/HD05** trên thuộc tính đã có profile.
- Giữ phân biệt giá trị `0`, `false`, `""` có chủ ý với absent; không dùng `||`/truthy để quyết định fallback. Ghép các trường theo cùng ngữ nghĩa, scope, version, đơn vị; ghi rõ nguồn `company-profile`/`nd30-fallback`/`hd05-fallback`/`unspecified` và xác minh đến DOCX output.
- Byte DOCX gốc vẫn được lưu để truy vết, nhưng định dạng sai cần được sửa trong ứng viên. Không xây exporter OOXML/template khác khi chưa chứng minh pipeline hiện tại không đáp ứng. Đọc [đặc tả V2.2](../../docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).

## Bảng và xuất ứng viên

- Bảng nhập cần ID ổn định duy nhất và cell ID bền vững. Khi đồng bộ HTML → TableModel, đối chiếu theo cell ID/lưới và giữ thuộc tính nguồn được hỗ trợ; không áp preset ngầm hoặc mặc định 12pt/viền.
- Giữ nhiều run định dạng khi sửa chữ, gồm CSS inline được hỗ trợ; các ca ngoài phạm vi phải hiện rõ, không khẳng định bảo toàn tổng quát cho mọi OOXML.
- Phát hiện cấu trúc bảng chưa hỗ trợ từ XML thô (bảng lồng, hình/vẽ, field, hyperlink, vMerge bất thường); không âm thầm loại bỏ.
- Mỗi lần xuất, kiểm tra byte DOCX ứng viên thực tế với manifest nguồn và quyết định bảng mới được duyệt. Không dùng `roundtripProven` hoặc cache cũ để chứng nhận revision mới.
- Gate vẫn phải kiểm kê bảng ứng viên khi `importedTables` rỗng; giữ fail-closed với DOCX hỏng, ID trùng, sai thứ tự hoặc bảng nội dung ngoài dự kiến.
- Preview, tải xuống và in tham khảo phải cùng dùng byte ứng viên hiện hành. `safe` khác `downloadable`; đổi revision thì ứng viên cũ không còn hợp lệ.

## Đọc và kiểm chứng

- Workspace/export: đọc `workspaceTransactions.ts`, `exportCandidate.ts`, sau đó đúng builder/gate liên quan. Table: `tableFormatUtils.ts`, `tableRoundtrip.ts`, `docxExport.ts` theo thay đổi.
- Storage/profile/semantic: đọc module tương ứng và caller trong `App.tsx` trước khi thay contract.
- Dùng test chuyên biệt trong Codebase Map (imported-table, candidate, storage, profile, semantic). Chạy test liên quan và `npm run lint`; kết quả synthetic không chứng minh mọi tài liệu thực.
