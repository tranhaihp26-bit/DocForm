# Bộ dữ liệu Hướng dẫn 05-HD/VPTW (27/5/2026)

Mẫu đầu trang do người dùng tinh chỉnh cho Đảng ủy Công ty Hoa tiêu Hàng hải miền Bắc được lưu riêng tại [`profiles/hoa-tieu-hang-hai-mien-bac/`](profiles/hoa-tieu-hang-hai-mien-bac/README.md). Đây là lựa chọn trình bày của đơn vị; không chuyển các số đo của mẫu thành rule chung.

Nguồn chuẩn: [PDF do Văn phòng Trung ương Đảng công bố](https://dangcongsan.vn/upload/2006988/20260529/HD_05_VPTW_e1550.pdf). SHA-256 của bản dùng để trích xuất được ghi trong `rules.2026.json`.

`rules.2026.json` bao phủ Phần I, Phần II (I–IV), Phần III và các yêu cầu trình bày trong Phụ lục 1–3. Mỗi hàng là một rule với 9 cột theo thứ tự trong `columns`: mã, vị trí nguồn, trang PDF, điều kiện áp dụng, thành phần, thuộc tính, phép kiểm, giá trị mong đợi, phương pháp xác minh. `reference_tables` chứa các mã viết tắt chính thức ở trang 7–9.

`examples.2026.json` ghi 4 tệp thực tế từ hệ thống văn bản của Đảng bộ các cơ quan Đảng tỉnh Hà Tĩnh và cổng xã Ia Chim (Quảng Ngãi), gồm kế hoạch, báo cáo, công văn và một biểu mẫu còn để trống số/ngày. Các ví dụ nối với mã rule để làm ca kiểm tra nhận dạng, **không phải nguồn quy phạm** và không mặc nhiên là mẫu đạt mọi rule.

## Đối chiếu nguồn công khai (16/10/2026)

- [Bài trên Cổng Chính phủ](https://xaydungchinhsach.chinhphu.vn/huong-dan-so-05-hd-vptw-ve-the-thuc-va-ky-thuat-trinh-bay-van-ban-cua-dang-119260601101535274.htm) đăng phần giới thiệu và toàn văn 36 trang của Hướng dẫn 05. Không thấy rule mới so với PDF do Văn phòng Trung ương Đảng công bố, nên số rule gốc vẫn là **231**.
- Phần tóm tắt của bài không liệt kê “Nơi nhận” trong danh sách thành phần bắt buộc; bản toàn văn có quy định ở Phần II.I.9. Vì vậy phải ưu tiên PDF gốc khi có khác biệt giữa tóm tắt và văn bản.
- [Danh mục văn bản Đảng bộ các cơ quan Đảng tỉnh Hà Tĩnh](https://dukcq.hatinh.gov.vn/laws/) có tệp Word sau ngày Hướng dẫn 05 có hiệu lực. Các tệp xác nhận trường hợp bố cục thực tế cho kế hoạch/báo cáo/công văn. Ngày trên danh mục của ba mục đã xem đều sớm hơn ngày ghi trong tệp một ngày; hệ thống nhập liệu phải giữ riêng ngày đăng và ngày trong văn bản, đồng thời báo cần rà soát nếu lệch.
- [PDF kế hoạch trên cổng xã Ia Chim](https://iachim.quangngai.gov.vn/upload/2007057/20260607/KH_thuc_hien_Chi_thi_14_Signed_17136.pdf) còn trống số và ngày; không đưa vào bộ mẫu đạt chuẩn. Đây là ca thử hữu ích cho trạng thái `NEEDS_REVIEW`.

## Cách dùng an toàn

- Đây là **dữ liệu nguồn đã trích xuất**, chưa được nối vào bộ kiểm định của ứng dụng và chưa được chuyên gia nghiệp vụ xác nhận từng rule. `status` thể hiện điều đó. Không hiển thị toàn bộ danh mục là đã đạt.
- Phải xác định `regime=party` và loại văn bản trước khi lọc `applies_when`. Không dùng rule đường kẻ của Nghị định 30 cho văn bản Đảng.
- `text` có thể kiểm từ nội dung/OOXML; `layout` cần đo hình học bản hiển thị và DOCX; `visual` cần kiểm ảnh hoặc bản giấy; `semantic` cần người duyệt; `external` cần quy chế, sổ đăng ký, văn bản thành lập, thẩm quyền hoặc quy định được dẫn chiếu. Không đủ bằng chứng thì trả `NOT_EVALUATED` hoặc `NEEDS_REVIEW`, không trả `PASS`.
- `required` chỉ áp khi điều kiện ở `applies_when` đúng. `allowed` mô tả phương án được phép, không phải yêu cầu phải xuất hiện. `approx` phản ánh chữ “khoảng” trong nguồn; không tự gán một dung sai số học khi chưa có chính sách đo.
- Với công văn, trích yếu nằm dưới số/ký hiệu và không áp dấu `-----` ở giữa trang. Với văn bản có tên loại, dấu phân cách dưới trích yếu là **năm ký tự `-`**. Ở đầu trang văn bản Đảng, dưới tên cơ quan là một dấu `*`; dưới tiêu đề Đảng là **đường kẻ nét liền dài bằng tiêu đề**.
- Phần quy trình về thẩm quyền, dấu, chữ ký và bản sao không thể chứng minh chỉ từ DOCX. Các rule này là điều kiện kiểm duyệt, không phải lệnh tự động sửa.
- Khi học từ mẫu thực tế, chỉ dùng mẫu để thử parser và đối chiếu với rule. Không biến khoảng trắng quanh số/ký hiệu, khoảng trắng trước `-----`, ngày đăng trên trang hay lỗi trong tệp mẫu thành chuẩn định dạng.

## Nhóm rule

| Nhóm | Nội dung |
| --- | --- |
| GEN, GOV | Phạm vi, hiệu lực, trách nhiệm |
| HEAD, ORG | Tiêu đề Đảng, tên cơ quan, dấu sao |
| NUM, DATE, TITLE | Số/ký hiệu, địa danh/ngày tháng, tên loại/trích yếu |
| BODY | Nội dung, căn cứ, bố cục điều khoản |
| SIGN, SEAL, REC | Chữ ký, dấu, nơi nhận |
| OPT, COPY | Thành phần bổ sung và bản sao |
| PAGE, STYLE | Khổ/lề/số trang, phông và cỡ chữ Phụ lục 2 |

Các ví dụ ở trang 3–5 và 14–22 được quy về điều kiện áp dụng và yêu cầu tương ứng. Không biến tên riêng trong ví dụ thành giá trị bắt buộc cho mọi văn bản. Các quy định được Hướng dẫn 05 dẫn chiếu sang văn bản khác chỉ có `operator=reference`; cần nạp nguồn tương ứng trước khi kiểm định.

