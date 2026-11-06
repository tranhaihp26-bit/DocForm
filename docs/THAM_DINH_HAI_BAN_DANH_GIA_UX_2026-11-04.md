# Thẩm định hai bản đánh giá đặc tả UX DocForm

Ngày 04/11/2026. Checkout `bd2aac5`. Đầu vào: hai bản đánh giá người dùng cung cấp về [đặc tả nội dung UX 3 bước](DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md). Bản đánh giá dài nói rõ chưa xem checkout; điểm `7,0/10` và các ngưỡng phần trăm trong đó là ý kiến/đề xuất, không phải phép đo người dùng hay kết quả test. Tài liệu này kiểm tra các nhận định với mã và [Codebase Map](CODEBASE_MAP.md); không sửa ứng dụng.

## Kết luận ngắn

Hai bản đánh giá chỉ ra đúng những phần đặc tả cần chặt hơn: nghĩa của “bảo toàn”, trạng thái quay lui/thay nguồn, lưu nháp, ứng viên hết hạn, `NOT_EVALUATED`, duyệt nguồn và xử lý lỗi. Tôi đã bổ sung các hợp đồng **hiển thị và nghiệm thu** đó vào mục 11–14 của đặc tả. Tuy nhiên, nhiều cơ chế đã có trong mã; không nên chuyển mọi “thiếu trong tài liệu” thành kết luận “ứng dụng đang lỗi”.

## Phân loại nhận định và xử lý

| Nhận định trong đánh giá | Kết quả thẩm định | Quyết định đối với phương án |
| --- | --- | --- |
| Tách giữ byte tệp gốc khỏi bảo toàn DOCX xuất. | **Đúng, đặc tả cũ chưa nói đủ.** `draftStore.ts` có kho `source_blobs` theo hash; `exportCandidate.ts` dựng byte mới và kiểm tra riêng. | Đã bổ sung ba đối tượng gốc/bản soạn/bản xuất và giới hạn bảo toàn. Không hứa mọi cấu trúc OOXML đã được hỗ trợ. |
| Cần bảng quyết định cho tải bản cuối, bản đối chiếu và chặn. | **Đúng ở mức tài liệu.** Mã hiện có `isCandidateEligibleForExport` và `isCandidateEligibleForReviewDownload`; `App.tsx` kiểm tra ứng viên hiện hành lần nữa khi tải/in. | Đã ghi rõ điều kiện và tách “xuất kỹ thuật” khỏi “phát hành”. Không đổi cổng. |
| Preview, download, print phải cùng ứng viên và vô hiệu ứng viên cũ. | **Bất biến đúng; phần lớn đã có trong mã.** `exportCandidateKey`, `candidateManager.isCurrent`, `invalidateCandidate` và kiểm tra trước tải/in xử lý việc này. | Đã thêm hành vi UI khi bản soạn thay đổi và ca bất đồng bộ đến muộn. Cần test trên giao diện mới, không gọi là lỗi hiện hành nếu chưa tái hiện. |
| Cần mô tả trạng thái lỗi nhập, tạo mới, lưu lỗi, xuất lỗi. | **Đúng ở mức đặc tả.** `App.tsx` có nhánh tạo mới, `saveError`, khôi phục nháp, lỗi chuẩn bị ứng viên và lưu IndexedDB; tài liệu cũ chỉ nêu ngắn. | Đã bổ sung ma trận sự kiện → câu chữ → bảo vệ dữ liệu. |
| `NOT_EVALUATED` có thể bị hiểu nhầm là không có lỗi. | **Đúng.** Rule engine phân biệt `PASS`, `FAIL`, `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE`. | Đã sửa câu “không ghi nhận vấn đề” để nêu phạm vi đã kiểm tra và số mục chưa đánh giá khi có. Không thêm các mục chưa kiểm vào số đạt. |
| Duyệt nguồn đang gộp nhận diện, phân loại và giới hạn hỗ trợ. | **Đúng về nhu cầu diễn đạt.** Mã đã gắn phê duyệt với source hash/partition; không vì vậy mà người dùng hiểu phạm vi nút duyệt. | Đã bổ sung tóm tắt điều được xác nhận. Nếu có giới hạn không bảo toàn, sự đồng ý tiếp tục không làm ứng viên thành `safe`. |
| Cần giải thích lưu nháp và phục hồi. | **Đúng ở mức UX, không phải thiếu hạ tầng.** `App.tsx` tự lưu vào IndexedDB sau 1.000 ms, chỉ hiện đã lưu sau commit; `draftStore.ts` có kho nháp và byte nguồn. | Đã sửa nhãn “Đã lưu trên trình duyệt này” và nêu lỗi/giới hạn khi chưa commit. Không hứa lưu trên máy chủ hoặc phục hồi trong mọi trường hợp. |
| Nhánh tạo mới không nên nằm dưới nhãn “Tải tài liệu”. | **Đúng.** | Đổi tên bước 1 thành “Bắt đầu”; vẫn có lựa chọn tải/tạo mới rõ ràng. |
| Đặt tên tệp xuất có dấu nhận diện tài liệu. | **Hữu ích nhưng chưa phải lỗi an toàn.** Tên hiện tại là `Van_Ban_ND30/HD05.docx` và `Ban_doi_chieu_chua_xac_nhan_ND30/HD05.docx`. | Ghi thành cải tiến sau, cần xử lý trùng tên và ký tự tên tệp. Không tự coi tên mới đã triển khai. |
| “Giữ trống để điền khi phát hành” sẽ xóa cảnh báo. | **Chưa thể chấp nhận như sửa UX đơn thuần.** Đây là quyết định nghiệp vụ mới, ảnh hưởng rule, trạng thái thiếu, provenance và cách gọi tệp xuất. | Chỉ nghiên cứu như một tính năng riêng theo từng trường; không đổi `FAIL`/`NOT_EVALUATED` thành PASS, không tự mở cổng xuất. |
| Debounce 500–800 ms hoặc `onBlur` trước khi cập nhật revision. | **Không phù hợp làm nguyên tắc bảo vệ dữ liệu.** Revision/candidate phải hết hiệu lực ngay sau thay đổi; mã hiện tự lưu nháp sau 1.000 ms, là chuyện khác. | Có thể ổn định danh sách để không nhảy và giữ focus khi gõ, nhưng không trì hoãn invalidation hoặc tính hợp lệ của ứng viên. |
| Cần xử lý nhiều vấn đề cùng vị trí và tài liệu nhiều bảng. | **Đúng là thiếu chi tiết tương tác.** | Gom theo vị trí/loại vấn đề, mở từng nhóm; không áp dụng hàng loạt quyết định chưa duyệt. Giữ focus khi danh sách tính lại. |
| Tạo nội dung kỹ thuật trong DOM ẩn để giữ test. | **Không được đề xuất trong hai bản mới, nhưng là rủi ro từ đề xuất Anti trước đó.** | Test phải bám hành vi nhìn thấy và cổng thật, không bám DOM ẩn. |

## Những chỗ bản đánh giá dài đi quá phạm vi chứng cứ

1. **Điểm số `7,0/10`** không có phương pháp chấm, trọng số hoặc người dùng thử. Nó hữu ích như ưu tiên phản biện, không phải mức chất lượng đã đo.
2. **“7 vấn đề P0”** là mức ưu tiên do tác giả tự gán cho độ đầy đủ của tài liệu. Sau khi xem code, nhiều cơ chế P0 đã có; cần kiểm thử cụ thể trước khi gọi lỗi sản phẩm.
3. **Ma trận mọi đối tượng Word** là nhu cầu tốt cho một hợp đồng năng lực toàn sản phẩm, nhưng không nên biến tối ưu nội dung UX thành cam kết hỗ trợ ảnh neo, textbox, footnote, tracked changes nếu parser/export chưa chứng minh. Giao diện phải phản ánh năng lực thực và `MISSING_INPUT`/`NOT_EVALUATED` khi thiếu bằng chứng.
4. **Ngưỡng 90% hoàn thành, 100% phân biệt bản đối chiếu** là giả thuyết để thảo luận, chưa có baseline, cỡ mẫu hay nhiệm vụ chuẩn. Riêng bất biến kỹ thuật như không tải ứng viên cũ, không gửi dữ liệu AI khi chưa đồng ý có thể đặt mục tiêu 0 vi phạm trong bộ test được định nghĩa.
5. **Sai khác 2 bảng nguồn/0 bảng ứng viên** là quan sát cần điều tra phạm vi đếm. Chưa thể kết luận mất bảng hoặc cổng sai từ hai nhãn UI; cũng không thể tuyên bố bảo toàn nếu chưa giải thích sai khác.

## Việc cần làm sau thẩm định

1. Dùng đặc tả đã bổ sung để dựng prototype desktop cho ba trạng thái xuất quan trọng: tải DOCX đủ điều kiện, chỉ tải bản đối chiếu, không dựng được bản an toàn.
2. Trước khi đổi giao diện Bước 3, kiểm tra trên checkout hiện hành rằng tên/nội dung nhãn phản ánh đúng `safe`, `downloadable`, `reviewDownloadable`, `canRenderDiagnostic` và ứng viên hiện hành.
3. Tạo ca điều tra riêng cho số bảng nguồn/ứng viên; xác định bộ đếm nào phản ánh nguồn, bản soạn và DOCX xuất.
4. Thử với người dùng văn phòng bằng nhiệm vụ thật; kiểm tra mức hiểu “đã lưu”, “cần xem lại”, “bản đối chiếu” và “đủ điều kiện xuất kỹ thuật”. Sau đó mới chốt nhãn và mục tiêu thời gian/số thao tác.

**Phạm vi kiểm chứng của tài liệu này:** chỉ đọc nguồn và đặc tả, chưa chạy lệnh test, chưa sửa UI, chưa kiểm tra fidelity trên DOCX thật trong LibreOffice/Microsoft Word. Không coi thẩm định nội dung là nghiệm thu phần mềm.
