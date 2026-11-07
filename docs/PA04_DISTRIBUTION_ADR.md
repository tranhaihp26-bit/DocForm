# PA-04 — ADR có điều kiện về mô hình phân phối DocForm

- Ngày: 07/11/2026
- Trạng thái: **PROVISIONAL — NOT_VERIFIED_OPS**
- Phạm vi: DF-E04 (#11), PA-04 (#33)
- Quyết định này là hướng triển khai có điều kiện; không xác nhận phát hành M1/M2 hay nghiệm thu người dùng.

## Nhu cầu và bằng chứng hiện có

Nhân viên văn phòng cần mở DocForm mà không phải chạy lệnh npm hoặc sửa mã/cấu hình. Luồng làm việc hiện là ứng dụng web cục bộ 3 bước. Product End State v1.0, mục DEC-P02, ghi nhận giữ local webapp trong giai đoạn phát triển và chuẩn bị cold-start test; chưa chọn EXE hoặc nền tảng khác. Master Roadmap PA-04 yêu cầu kiểm máy sạch, khởi động lại, cập nhật/rollback, chế độ không mạng/không AI và tình huống PDF/WPS lỗi.

Lệnh vận hành hiện được repo ghi nhận là npx tsx server.ts --port 5050. Đây là lệnh cho môi trường phát triển và cần Node/npm; chưa thể coi là cách mở ứng dụng phù hợp nhân viên văn phòng. Cài đặt npm ci trong worktree trên máy Windows hiện tại chỉ chứng minh dependency cài được, không phải smoke trên máy sạch. Chưa có bằng chứng Word/WPS, quyền IT, cấu hình mạng nội bộ hoặc người dùng không biết npm.

## Các phương án

| Phương án | Phù hợp | Chi phí và rủi ro | Bằng chứng còn cần |
|---|---|---|---|
| Webapp cục bộ một người dùng, mở qua launcher mỏng | Giữ xử lý tệp trên máy; phù hợp làm việc thủ công/offline nếu runtime cục bộ và đường dẫn tài liệu sẵn sàng; WPS/PDF có thể dùng renderer trên cùng máy | Launcher/runtime cần cài đặt, cập nhật, dọn tiến trình, thông báo lỗi; nếu launcher chỉ gọi npm thì chưa đạt nhu cầu người dùng | Máy Windows sạch: mở bằng thao tác đơn giản, không cần npm/terminal; kiểm offline/manual, PDF lỗi vẫn cho tải DOCX hợp lệ, update/rollback |
| Windows desktop wrapper | Có thể mở cửa sổ riêng và quản lý vòng đời tiến trình để nhân viên không thấy terminal | Thêm framework, đóng gói, ký/phát hành và nâng cấp; không giải quyết tương thích DOCX/WPS; chi phí bảo trì cao hơn | Bằng chứng rằng launcher cục bộ không đáp ứng trải nghiệm; bản dựng/thử cài sạch và xác minh renderer |
| Webapp intranet do IT vận hành | Có thể tập trung cập nhật và hỗ trợ khi tổ chức cần truy cập nhiều máy | Đòi hỏi thiết kế lại xác thực, phân quyền, lưu trữ, sao lưu, mạng và cô lập dữ liệu nhiều người dùng; luồng dựng hình loopback/renderer cục bộ hiện không chứng minh được cách vận hành này | Quyết định IT/bảo mật, mô hình lưu trữ và quyền truy cập, renderer server hợp lệ, kiểm tải/vận hành và mạng nội bộ |

## Quyết định có điều kiện

Tiếp tục giữ kiến trúc webapp local, một người dùng trên một máy, làm baseline kỹ thuật. Nếu sau này chọn pilot phân phối local, ưu tiên thử launcher mỏng mở ứng dụng local; chỉ cân nhắc đóng gói runtime sau khi kiểm thử máy Windows sạch. Không bắt đầu Windows wrapper hoặc intranet trong lane này.

Đây chưa phải cam kết mô hình M1/M2. Mô hình chỉ được chốt khi người dùng thật mở được ứng dụng mà không cần npm/terminal, thao tác manual/offline được trong phạm vi đã công bố, dữ liệu vẫn local theo mục tiêu, DOCX đủ điều kiện không bị chặn khi renderer PDF thất bại, và có hướng cập nhật/rollback đã thực hành. Nếu các điều kiện đó không đạt, giữ PA-04 mở và điều chỉnh quyết định theo bằng chứng.

## Ma trận kiểm tra vận hành

Các trạng thái dưới đây đều **NOT RUN** ở thời điểm ghi bản ADR này. Ghi evidence cụ thể sau khi thử; không đổi thành PASS chỉ vì unit test hoặc CI thành công.

| Kịch bản | Kết quả cần quan sát | Trạng thái / bằng chứng |
|---|---|---|
| Cold start trên máy Windows sạch, tài khoản nhân viên thường | Mở từ shortcut/tệp cài; không cần biết npm, sửa mã, tự tìm Node hoặc mở terminal; UI báo rõ nếu thiếu thành phần | NOT_VERIFIED_OPS |
| Khởi động lại sau khi đóng ứng dụng | Cổng/tiến trình cũ được dọn hoặc xử lý rõ; phiên mới không chiếm nhầm cổng; dữ liệu cục bộ còn trong phạm vi công bố | NOT_VERIFIED_OPS |
| Manual/offline/no-AI | Tạo hoặc nhập tài liệu, sửa và xuất DOCX trong phạm vi hỗ trợ mà không gọi AI; mất mạng không làm mất nguồn hoặc draft đã lưu bền vững | NOT_VERIFIED_OPS; cần đối chiếu PA-05 lưu/khôi phục |
| WPS/Word/PDF renderer không cài hoặc lỗi | DOCX candidate hợp lệ vẫn có thể tải theo fidelity gate; PDF hiển thị lý do lỗi và hành động; không giả báo preview/in đã thành công | NOT_VERIFIED_OPS; cần E03/E02 và Office thật |
| Cập nhật | Gói mới mở được; nguồn/draft người dùng giữ theo chính sách; phiên bản và lỗi được chẩn đoán | NOT_VERIFIED_OPS |
| Rollback | Có thể quay về bản trước mà không mất/corrupt dữ liệu người dùng; hướng dẫn khả thi cho nhân viên/IT | NOT_VERIFIED_OPS |
| Tương thích Office | Ghi rõ phiên bản Word/WPS, Windows, loại export và renderer thực đã mở/sửa được DOCX/PDF | NOT_VERIFIED_RENDER |
| Hỗ trợ và phục hồi | Người dùng biết tiếp tục/lấy nguồn/nháp sau sự cố; có đường hỗ trợ rõ, không tạo cảm giác dữ liệu đã lưu khi chưa lưu | NOT_VERIFIED_OPS; cần PA-05 |

## Điều kiện mở lại quyết định

- Có kết quả PA-02/PA-03 để biết trải nghiệm cục bộ và cách mở có đủ dễ dùng không.
- Có hợp đồng và bằng chứng renderer từ DF-E03; PDF là tùy chọn, không thay thế DOCX.
- Có PA-05 cho draft/recovery và quy trình hỗ trợ.
- Máy smoke được phép dùng, OS/Office/version và người tham gia được ghi rõ.
- Nếu môi trường yêu cầu IT-hosted/multiuser, làm đánh giá xác thực, quyền truy cập, lưu trữ và bảo mật trước khi chọn intranet.

Tham chiếu: Product End State v1.0, DEC-P02 và Gate O/R/U; Master Roadmap v2.0, PA-04 và phần nghiệm thu M1/M2; Issue Execution Board, PA-04 READY_ADR.
