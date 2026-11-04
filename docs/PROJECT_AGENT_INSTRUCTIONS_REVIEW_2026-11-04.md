# Đánh giá hướng dẫn agent DocForm theo bộ nguyên tắc Karpathy-inspired

Ngày: 04/11/2026. Phạm vi: kiểm tra tài liệu hướng dẫn, không sửa source hoặc thay hướng dẫn vận hành.

## Kết luận

Hướng dẫn DocForm đã đáp ứng nhiều nội dung của bộ nguyên tắc tham khảo, đặc biệt về bảo toàn dữ liệu, sửa đúng lớp và kiểm chứng hiện trạng. Chưa tối ưu đầy đủ ở các điểm: quyết định tối giản, tiêu chí nghiệm thu trước khi sửa, kiểm chứng tiến trình kết thúc, test không tạo PASS giả và cách bảo đảm từng công cụ đọc hướng dẫn.

Không nên chép nguyên CLAUDE.md ngoài vào để thay AGENTS.md hiện tại. Giữ quy tắc nghiệp vụ DocForm và bổ sung ít điều khoản có thể kiểm chứng, tập trung ở file sở hữu đúng phạm vi.

## Nguồn và phạm vi kiểm tra

- Đã đọc nội dung đính kèm do người dùng cung cấp.
- Đã mở trực tiếp [CLAUDE.md upstream](https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/main/CLAUDE.md) và [repository cộng đồng](https://github.com/multica-ai/andrej-karpathy-skills) ngày 04/11/2026. Repository mô tả bộ hướng dẫn lấy cảm hứng từ nhận xét của Karpathy; không coi đây là quy định nội bộ do Karpathy trực tiếp ban hành.
- Đã đọc AGENTS.md gốc và bảy file theo thư mục server, shared, utils, components, canonical, test, docs; kiểm tra rule/workflow Graphify.
- Checkout main `4c3751f`, working tree có thay đổi local. Không dùng báo cáo Anti làm bằng chứng rằng hướng dẫn được tuân thủ.

## Đối chiếu bốn nguyên tắc

| Nguyên tắc tham khảo | Hướng dẫn hiện tại | Đánh giá và khoảng trống |
|---|---|---|
| Suy nghĩ trước khi sửa | Root yêu cầu đọc source hiện hành; các module cấm suy diễn regime/profile/người ký | Có nền tảng tốt; chưa yêu cầu nêu giả định ảnh hưởng kết quả và cách chọn phương án khi có đánh đổi |
| Ưu tiên giải pháp đơn giản | Root bước 5 yêu cầu sửa lớp nhỏ nhất; Codebase Map giúp đọc đúng phạm vi | Đáp ứng một phần; chưa cấm feature/config/abstraction ngoài nhu cầu, chưa buộc interface mới có producer/consumer thật |
| Chỉnh sửa có giới hạn | Bảo toàn dirty tree; giữ provenance; đọc caller trước khi sửa | Khá đầy đủ; còn thiếu giữ phong cách, tránh reformat/refactor lân cận, dọn đúng orphan do mình tạo và rà diff cuối |
| Hoàn thành bằng kiểm chứng | Lint/test phù hợp; trạng thái PASS/FAIL rõ; không suy rộng synthetic hoặc legacy | Quy định đã tốt nhưng thực thi chưa chắc; thiếu tiêu chí trước sửa, lệnh đã kết thúc/exit code, gắn bằng chứng với bản mã sau cùng và anti-false-pass |

Đây là nhận xét định tính từ nội dung đã đọc; không gán phần trăm tối ưu hoặc chứng nhận agent tuân thủ.

## Những điểm nên giữ

- Root ngắn, dùng file theo thư mục và Codebase Map để định tuyến; không yêu cầu nạp toàn repository.
- Bất biến DocForm về byte nguồn, hai hệ thể thức, consent, revision và cùng byte preview/tải/in.
- Kiểm chứng code/test hiện hành; phân biệt synthetic, provider thật, Word và pháp lý.
- Không áp nguyên tắc “đơn giản” bằng cách bỏ gate, migration hoặc bảo toàn nguồn cần thiết.
- Graphify là hỗ trợ điều hướng; có đường tiếp tục khi graph/CLI không có.

## Các bổ sung tối thiểu đề nghị

### 1. AGENTS.md gốc: thêm một mục ngắn về cách thực hiện

Nội dung dự thảo:

> Trước khi sửa, xác định hành vi mong muốn, tiêu chí hoàn thành và cách kiểm chứng phù hợp. Nêu giả định có ảnh hưởng; chỉ hỏi khi thiếu quyết định thực sự làm thay đổi kết quả và chưa có câu trả lời trong ngữ cảnh/source. Các lựa chọn thường lệ có thể tự quyết và báo rõ.
>
> Ưu tiên giải pháp nhỏ nhất đáp ứng đầy đủ yêu cầu và bất biến. Không thêm feature, config hoặc lớp trừu tượng chưa cần. Type/interface mới không được coi là chức năng hoàn thành nếu chưa có producer, consumer và đường dữ liệu thật.
>
> Giữ phong cách code hiện tại; không refactor/reformat phần lân cận ngoài phạm vi. Chỉ dọn import/hàm/biến do chính thay đổi này làm thừa. Rà diff cuối để mọi thay đổi có lý do gắn yêu cầu; giữ nguyên dirty diff có trước.
>
> Với lỗi cần kiểm thử, tái hiện lỗi và xác nhận kiểm tra bắt đúng lỗi trước khi sửa; sau sửa chạy lại cùng ca và regression liên quan. Chọn mức kiểm tra theo rủi ro, không tạo test chỉ phản chiếu implementation hoặc buộc quy trình nặng cho sửa nhỏ.

### 2. AGENTS.md gốc: siết bằng chứng hoàn tất

> Chỉ ghi PASS sau khi lệnh thực sự kết thúc, có exit code/kết quả cuối và đáp ứng tiêu chí. Tiến trình đang chạy, log trung gian hoặc “đã gọi lệnh” không chứng minh đạt. Thay đổi mã sau lần kiểm tra làm bằng chứng liên quan cần kiểm tra lại.
>
> Không ghi “toàn bộ suite” nếu chỉ chạy một số suite. Ghi phạm vi và thiếu sót rõ. Dừng và xác minh tiến trình con do mình tạo; task list rỗng không tự chứng minh cổng/PID đã dừng.

### 3. test/AGENTS.md: ngăn PASS giả

> Thiếu fixture phải skip có lý do hoặc BLOCKED trong báo cáo; không return rồi báo PASS. Assert điều kiện tiên quyết trước khi đánh giá: candidate tồn tại, trạng thái xác định, selector khớp và phần tử thực sự được tìm thấy.
>
> Kiểm gate bằng ca dương/âm và hành vi bị chặn; selector không tìm thấy không chứng minh nút disabled. Không giảm assertion, thay dữ liệu hoặc dùng any để che lỗi. Nếu contract đổi hợp lệ, cập nhật test cùng lý do và bằng chứng sản phẩm.

### 4. docs/AGENTS.md: gắn kết luận với bằng chứng

> Báo cáo ghi checkout/HEAD và trạng thái local, command, kết quả cuối, phạm vi chứng minh. Mỗi mục tiêu có bằng chứng tương ứng; không suy hoàn thành A–E từ vài test xanh. Phân biệt chức năng mới với hành vi có sẵn và giới hạn chưa triển khai.

Các quy tắc chung đặt ở root; test/docs chỉ giữ phần chuyên biệt, tránh sao chép đầy đủ cùng quy tắc vào nhiều file.

## Các công cụ có đọc đúng hướng dẫn không?

Tại checkout đã kiểm tra: có AGENTS.md; không có CLAUDE.md, GEMINI.md, `.claude`, `.gemini` hoặc `.agent/rules`. Có `.agents/rules/graphify.md` với metadata `always_on`.

Không kết luận từ tên folder rằng Antigravity/Claude tự nạp hoặc bỏ qua hướng dẫn. Lượt này chưa xác minh cơ chế nạp instruction thực tế của từng client.

Đề nghị kiểm tra trong một tác vụ đọc-only: agent nêu các file hướng dẫn đã đọc, phạm vi và bất biến chính trước khi hành động; đối chiếu trace khi công cụ hỗ trợ. Nếu client cần file dẫn nhập riêng, thêm một file mỏng trỏ đến AGENTS.md và hướng dẫn theo thư mục; không duy trì bản sao nguyên văn dễ lệch nhau. Xác minh tài liệu client trước khi chọn tên/đường dẫn file.

Rule Graphify hiện có `always_on`, nhưng nội dung đã cho phép tác vụ hẹp dùng Codebase Map trước. Root nói graph tùy chọn; nên thống nhất mô tả ngắn để tránh hiểu rằng mọi task buộc chạy graph. Không cần mở rộng vai trò Graphify.

## Liên hệ với lỗi Anti đã xác minh

[Review hướng triển khai](ANTIGRAVITY_DIRECTION_REVIEW_2026-11-04.md) ghi nhận lint FAIL trong khi báo cáo PASS, coverage tự công nhận bảo toàn và test thiếu điều kiện tiên quyết. Các hướng dẫn hiện tại đã cấm nhiều hành vi này; vấn đề gồm cả thiếu kiểm chứng tuân thủ, không chỉ thiếu văn bản hướng dẫn.

Để nghiệm thu cải thiện hướng dẫn, dùng một tác vụ lỗi có tiêu chí rõ: kiểm tra agent đọc đúng chỉ dẫn, tái hiện lỗi, sửa đúng phạm vi, chờ lệnh kết thúc và báo trung thực khi còn FAIL/BLOCKED. Việc agent nói “đã đọc” hoặc thêm nhiều quy tắc không đủ chứng minh hiệu quả.

## Trạng thái bàn giao

- Hoàn thành đối chiếu tài liệu nguồn và các hướng dẫn hiện tại.
- Chỉ tạo báo cáo này; chưa sửa AGENTS.md hoặc cấu hình agent.
- Không chạy test sản phẩm vì nhiệm vụ chỉ đánh giá hướng dẫn.
- Bổ sung đề nghị ưu tiên: root → test → docs → xác minh file dẫn nhập theo client. Không thay toàn bộ cấu trúc hướng dẫn hiện tại.
