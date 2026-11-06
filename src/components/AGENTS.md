# Hướng dẫn cho `src/components`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 6, 7 và 9.

## Luồng UI hiện hành

- Wizard sản phẩm hiện hành có 3 bước: nhập/xác nhận nguồn và rà soát; soạn thảo; xem/đối chiếu/xuất ứng viên. `OfficeWorkerViews.tsx` và `ExportStepView` có thể là luồng legacy; xác nhận caller ở `App.tsx` trước khi sửa.
- Không suy ra regime, loại văn bản hay profile chỉ từ lựa chọn giao diện khi nguồn còn mâu thuẫn. Giữ bằng chứng nguồn và thao tác xác nhận hiện hành.
- Gợi ý AI/chính tả/semantic phải hiển thị vị trí, phạm vi và trạng thái coverage; nội dung chỉ đổi sau quyết định của người dùng.
- Consent chọn provider không đồng nghĩa đồng ý gửi mọi nguồn. Giữ consent riêng theo tệp/thao tác, hiển thị rõ khi gửi văn bản trích xuất và không tuyên bố AI đọc byte/layout nếu không có bằng chứng.
- Bước 3 dùng cùng byte ứng viên hiện hành cho preview, download và print. Hiển thị blocker/cảnh báo; không bỏ qua fidelity gate, không dùng ứng viên từ revision cũ.
- Preview/in trong trình duyệt là tham khảo; không trình bày như kết quả dàn trang đã xác nhận trong Microsoft Word.

## Mục tiêu sản phẩm và trạng thái Bước 3 (V2.2)

- Khi chuẩn hóa, văn bản đầu ra phải đúng **profile Công ty theo từng thuộc tính đã thiết lập**, ND30/HD05 chỉ là fallback cho trường profile còn thiếu. Không yêu cầu người dùng giải quyết “xung đột” chỉ vì giá trị profile khác default ND30/HD05.
- Bước 3 **không đồng nhất PASS tự động/downloadable với đủ điều kiện ban hành hoặc phê duyệt**. Phải trình bày rõ `review-only`/`blocked`/`stale`/`NOT_EVALUATED` và giới hạn của DOCX browser preview, PDF WPS thật, test mock.
- Đọc [đặc tả V2.2](../../docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md); chỉ tuyên bố đã triển khai khi có bằng chứng kiểm tra UI hiện hành lẫn DOCX thực.

## Đọc và kiểm chứng

- Bắt đầu ở `App.tsx`, `ImportStepView.tsx`, `WorkspaceEditor.tsx`, `WorkspaceExport.tsx`, `A4DocumentPreview.tsx`, `CandidatePrintView.tsx` theo vùng sửa; chỉ mở view legacy khi caller còn dùng.
- Với thay đổi tương tác, chọn test component/browser tương ứng trong Codebase Map. Chạy kiểm tra accessibility/browser khi tác động đến focus, bàn phím, cuộn hoặc viewport.
