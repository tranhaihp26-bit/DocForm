# Hướng dẫn cho `src/utils`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 2, 3, 8, 9 và 11.

## Nguồn, trạng thái và quyết định

- Giữ nguyên byte nguồn trong `source_blobs`; báo đúng lưu bền vững `indexeddb` hay tạm thời `memory`. Không thay bản gốc bằng nội dung đã chuẩn hóa.
- `draftStore.ts` là kho bản nháp hoạt động của UI hiện hành. `documentSessionStore.ts` và migration là hạ tầng riêng; không quảng bá thành giao diện nhiều hồ sơ nếu chưa nối vào UI.
- Quyết định regime/loại/profile phải gắn với fingerprint/nguồn và regime hiện tại qua `sourceMismatch.ts`/`profileDecision.ts`. Không áp profile chỉ vì lựa chọn UI hoặc tên file.
- Đề xuất AI/semantic gắn với `targetBlockId`, cell/anchor, fingerprint và revision; người dùng quyết định Áp dụng/Bỏ qua. Không sửa nguồn trực tiếp; từ chối an toàn nếu `original` không còn khớp.

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
