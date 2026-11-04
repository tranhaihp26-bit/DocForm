# Báo cáo Audit & Pilot Test Thực Tế Bước 1 DocForm (03/11/2026)

## 1. Kết luận tổng quan

- **Đánh giá tổng thể:** **`NEEDS_REVIEW`**
- **Phạm vi thực sự đã kiểm tra:** Toàn bộ luồng giao diện và chức năng của Bước 1 (Khởi động hồ sơ sạch → Tải tệp DOCX thực tế → Phân tích & nhận diện 9 nhóm thể thức → Thẩm định hệ thể thức và căn cứ pháp lý → Xem nhanh nội dung & kiểm tra dựng hình bố cục trang gốc → Hộp thoại đối chiếu / phân vùng hai cột với kiểm tra phím bấm/focus → Rà soát ngữ nghĩa Semantic Review → Kiểm tra ranh giới AI & Payload Inspector → Xác nhận chuyển bước sang Studio soạn thảo Bước 2).
- **Tóm tắt cốt lõi:**
  - Về mặt **kỹ thuật và cổng an toàn (Gates & Safety)**: Hệ thống đạt `PASS`. Quá trình đọc DOCX pilot bóc tách chính xác 12 khối văn bản, 2 bảng (bảng đầu trang và bảng nơi nhận/chữ ký) theo đúng cấu trúc OOXML; cổng bảo vệ hệ thể thức xác định đúng Nghị định 30 với chứng cứ mạnh; dữ liệu thiếu hoặc có dấu chấm lửng được đánh dấu "Cần xác nhận", không tự bịa dữ liệu; AI mặc định tắt, consent bỏ chọn; sau khi hoàn tất đối chiếu, nút xác nhận đưa tài liệu vào Studio (Bước 2) thành công. Tệp gốc được bảo toàn 100% nguyên vẹn (khớp mã SHA-256 trước và sau pilot).
  - Về mặt **trải nghiệm người dùng văn phòng (Office Worker UX)**: Đánh giá `NEEDS_REVIEW`. Thao tác thực địa trên tệp DOCX thực tế đã **tái hiện 4/6 vấn đề** được ghi nhận trong audit trước:
    1. **S1-01 (TÁI HIỆN):** Số lượng phụ lục hiển thị `00` thay vì số `0` tự nhiên.
    2. **S1-02 (TÁI HIỆN):** Tóm tắt metric chỉ hiện "8/9 Nhóm có dữ liệu" và "01 Nhóm cần xác nhận"; trạng thái "Chưa xác minh" của Nhóm 08 (Dấu, chữ ký số) bị chìm, không có chỉ số cảnh báo riêng trên thanh tóm tắt.
    3. **S1-03 (TÁI HIỆN & PHÁT HIỆN THÊM):** Không chỉ `media_unsupported`, giao diện lộ hàng loạt mã enum lập trình tiếng Anh (`narrative`, `list_item`, `legal_basis`, `table_data`, `drawing_or_image`) làm tiêu đề hiển thị cho cán bộ văn phòng.
    4. **S1-05 (TÁI HIỆN):** Khi bấm "Xem bố cục trang gốc", hệ thống báo "Chưa dựng đủ trang để đối chiếu" và nút reset lại trạng thái cũ mà không nêu lý do hay bước xử lý kế tiếp trên thông báo chính.

---

## 2. Môi trường kiểm thử thực tế

- **Kho mã nguồn:** `D:\DocForm`
- **Nhánh Git & Commit HEAD:** `main` @ `fe854c66f044195f473cc980a71ee3dd8dff777e`
- **Tiến trình & Cổng phục vụ:** `http://127.0.0.1:5050/`, tiến trình Node.js / `tsx server.ts` đang lắng nghe tại loopback độc quyền `127.0.0.1:5050` (PID `13984`, phản hồi HTTP 200). Không thay thế hoặc làm gián đoạn server hiện hành.
- **Trình duyệt & Hồ sơ kiểm thử:** Google Chrome Desktop (`chrome.exe`), hồ sơ trình duyệt cô lập hoàn toàn (`mkdtempSync` tại `C:\Users\GIAP\AppData\Local\Temp\docform-pilot-full-Ml08of`), không chia sẻ cookie, session, localStorage hay IndexedDB với các phiên soạn thảo trước.
- **Đặc tính hiển thị (Desktop-First):**
  - Chiều rộng & chiều cao viewport: `1440 × 900` px (Desktop tiêu chuẩn).
  - Tỷ lệ điểm ảnh (DPR): `1.0`, tỷ lệ thu phóng (Zoom): `100%`.
  - Độ rộng tài liệu: `scrollWidth = 1440 px`, `innerWidth = 1440 px` (hoàn toàn không có thanh cuộn ngang ngoài ý muốn).
- **Thông tin tệp pilot:**
  - Đường dẫn: `C:\Users\GIAP\Downloads\01_Thong_bao_Ngay_Van_Hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx`
  - Dung lượng tệp: `20.700 bytes` (Last Modified: 30/10/2026 12:11:26).
  - Băm SHA-256 trước khi thử: `75E6A37A9138008C2EF389A49FD4004DAE81911B8ED5B2918D5DA4D80D29C17E`
  - Băm SHA-256 sau khi thử: `75E6A37A9138008C2EF389A49FD4004DAE81911B8ED5B2918D5DA4D80D29C17E`
  - Kết quả kiểm tra toàn vẹn tệp gốc: **KHÔNG BỊ THAY ĐỔI (MATCH 100%)**.
- **Nguyên tắc bảo vệ dữ liệu:** Tệp thử nghiệm là dữ liệu không đáng tin; không mở liên kết nhúng, không gọi API AI ra ngoài, không trích xuất nguyên văn thông tin cá nhân/nội bộ vào log hay báo cáo.

---

## 3. Nhật ký thao tác Pilot thực tế theo thứ tự

| STT | Thao tác người dùng | Trạng thái trước thao tác | Trạng thái sau thao tác | Kết quả quan sát & Bằng chứng kỹ thuật | Đánh giá |
|:---:|---|---|---|---|:---:|
| **1** | Mở ứng dụng trong hồ sơ trình duyệt riêng | Trình duyệt chưa khởi chạy | Màn hình khởi đầu Bước 1 (`phase="choice"`) | `localStorage.length = 0`. Màn hình hiện 2 thẻ lớn: "Tải tài liệu có sẵn" và "Tạo văn bản mới". Không xuất hiện nút "Tiếp tục tài liệu hiện tại" (xác nhận hồ sơ sạch). | `PASS` |
| **2** | Bấm **"Tải tài liệu có sẵn"**, nạp tệp pilot DOCX qua bộ chọn tệp | `phase="choice"`, chưa có tệp | `phase="recognition"`, `hasSource="true"` | Tệp được nạp vào input `type="file"`. Hệ thống đọc tệp, chuyển giao diện sang giai đoạn nhận diện. Ghi nhận 12 khối nguồn, 2 bảng, 0 phụ lục. Tên tệp hiển thị chính xác. | `PASS` |
| **3** | Mở xem kết quả nhận diện 9 nhóm thành phần thể thức | Giao diện vừa nạp tệp xong | Màn hình "Kết quả nhận diện tài liệu" | - 4 ô đếm: "8/9 Nhóm có dữ liệu", `00` Phụ lục đã tách (S1-01), `01` Nhóm cần xác nhận, `02` Bảng trong nguồn.<br>- 9 nhóm: 7 nhóm "Đã nhận diện" (Nhóm 01, 02, 03, 05, 06, 07, 09); 1 nhóm "Cần xác nhận" (Nhóm 04: ngày tháng có dấu `…`); 1 nhóm "Chưa xác minh" (Nhóm 08: Dấu, chữ ký số); 0 nhóm "Chưa tìm thấy".<br>- Không tự điền ngày tháng giả vào Nhóm 04. | `NEEDS_REVIEW` |
| **4** | Mở rộng chi tiết **"Hệ thể thức và chứng cứ"** | Accordion đóng mặc định | Accordion mở rộng, hiển thị 3 cột và danh sách căn cứ | - Hệ bạn chọn: `Hành chính — Nghị định 30/2020/NĐ-CP`.<br>- Hệ nguồn gợi ý: `Hành chính — Nghị định 30/2020/NĐ-CP`.<br>- Hệ đã xác nhận: `Hành chính — Nghị định 30/2020/NĐ-CP (theo chứng cứ mạnh)`.<br>- Căn cứ trích dẫn: 3 mục gồm Quốc hiệu (block-0 ô 1:2, high), Tiêu ngữ (block-0 ô 1:2, high), Số ký hiệu (block-0 ô 2:1, medium). Không có cảnh báo xung đột hệ. | `PASS` |
| **5** | Bấm **"Xác nhận thông tin"**, chuyển sang màn hình metadata | `phase="recognition"` | `phase="metadata"` | Màn hình hiển thị thẻ Hệ thể thức (Hành chính), Mẫu cơ quan (Công ty Hoa tiêu hàng hải miền Bắc), Loại văn bản (THÔNG BÁO), và phần "Đọc và đối chiếu tài liệu". | `PASS` |
| **6** | Bấm nút **"Xem bố cục trang gốc"** tại mục Tài liệu gốc | Trạng thái: "Chưa xem bố cục trang gốc" | Sau 4s: "Chưa dựng đủ trang để đối chiếu." | Nút chuyển sang "Đang dựng trang trên máy này…", sau 4 giây kết thúc với thông báo "Chưa dựng đủ trang để đối chiếu." Nút reset về "Xem bố cục trang gốc". Không có lý do cụ thể hay bước xử lý trên thông báo chính (S1-05). | `NEEDS_REVIEW` |
| **7** | Mở rộng chi tiết **"Body và phụ lục"** (Rà soát ngữ nghĩa) | Accordion đóng mặc định | Accordion mở rộng, hiển thị 12 đơn vị ngữ nghĩa | Hiển thị 12 đơn vị được bóc tách từ phần thân và bảng ký. Tiêu đề các khối lộ trực tiếp enum tiếng Anh: `Body · narrative`, `Body · list_item`, `Body · legal_basis`, `Body · media_unsupported`, `Body · table`, `Body · table_data` (S1-03). Trạng thái các đơn vị: "Chờ duyệt" hoặc "Chưa hỗ trợ". | `NEEDS_REVIEW` |
| **8** | Bấm **"Xem tóm tắt"**, sau đó bấm **"Xem và duyệt nguồn"** | `phase="metadata"`, hộp thoại đóng | `phase="ready"`, hộp thoại modal mở | Hộp thoại `role="dialog"`, `aria-modal="true"` mở phủ màn hình. Focus tự động chuyển vào trong hộp thoại. Bấm phím `Tab`: focus luân chuyển hoàn toàn bên trong hộp thoại (`tabTrapped: true`).<br>- Cột 1: Danh sách 12 khối, bộ lọc hoạt động (Tất cả: 12, Thân bài: 9, Khối ký riêng: 0, Chưa phân loại: 0).<br>- Cột 2: Bản đồ nhận diện 4 khu vực. Bảng ký được nhận diện chuẩn 2 vị trí theo NĐ 30. | `PASS` |
| **9** | Kiểm tra ranh giới AI & xem trước Payload gửi AI | Kiểm tra trạng thái Consent và nút AI | Consent giữ nguyên `false`, mở Payload Inspector | - Cả 2 checkbox AI consent (kiểm tra phân vùng và rà soát tùy chọn) đều ở trạng thái **bỏ chọn (false)**.<br>- Nút "Rà soát AI (Gemini)" bị khóa (`disabled: true`).<br>- Bấm nút "Xem trước dữ liệu sẽ gửi tới AI": mở trình kiểm tra payload cho phép người dùng thấy danh sách văn bản và ID khối dự kiến gửi mà không thực hiện bất kỳ lệnh gửi nào.<br>- Tuyệt đối không có dữ liệu nào được phát tán ra ngoài. | `PASS` |
| **10** | Bấm nút xác nhận cuối Bước 1: **"Tiếp tục đưa vào Studio soạn thảo"** | Hộp thoại đang mở ở Bước 1 | Hộp thoại đóng, chuyển sang Bước 2 (Studio) | Hộp thoại đóng sạch sẽ. URL và state chuyển sang `currentStep = 2`, thanh quy trình bên trái đánh dấu `Bước 2 / 3: Soạn & kiểm tra`. Header hiển thị tên tệp cùng trạng thái "Đã lưu".<br>*(Dừng ngay lập tức sau khi xác nhận Bước 1 hoàn tất; không chỉnh sửa nội dung trong Bước 2)*. | `PASS` |

---

## 4. Bảng thẩm định các mã phát hiện từ audit trước (S1-01 đến S1-06)

| Mã | Trạng thái thẩm định | Bằng chứng thực tế trên DOCX Pilot & Hồ sơ sạch | Phân tích tác động với Cán bộ Văn phòng |
|:---:|:---:|---|---|
| **S1-01** | **`TÁI HIỆN`** | Tại màn hình nhận diện, ô đếm phụ lục hiển thị nguyên văn **`00`** (`00 Phụ lục đã tách`). Mã nguồn tại [`ImportStepView.tsx`](../src/components/ImportStepView.tsx#L1126) dùng `String(appendicesCount).padStart(2, "0")`. | Cán bộ văn phòng quen đọc số lượng đếm thông thường (`0 phụ lục` hoặc `0`). Việc hiển thị `00` trông giống mã hiệu phòng ban hoặc số thứ tự lỗi, gây thắc mắc không đáng có. |
| **S1-02** | **`TÁI HIỆN`** | Trên 4 ô tóm tắt đầu trang, chỉ có chỉ số "8/9 Nhóm có dữ liệu" và "01 Nhóm cần xác nhận". Nhóm 08 (Dấu, chữ ký số) mang trạng thái "Chưa xác minh" với giá trị "Chưa có dữ liệu nhận diện", nhưng không có ô đếm riêng hay cảnh báo nào ở thanh tóm tắt. | Cán bộ văn phòng chỉ nhìn vào 4 ô tóm tắt trên cùng sẽ tưởng rằng toàn bộ văn bản chỉ có 1 vấn đề duy nhất ở Nhóm 04 (ngày tháng), dễ bỏ sót việc con dấu và chữ ký số chưa được đối chiếu/xác minh. |
| **S1-03** | **`TÁI HIỆN`** *(và phát hiện thêm diện rộng)* | Khi mở rộng mục "Body và phụ lục" (Rà soát ngữ nghĩa), tiêu đề các khối hiển thị trực tiếp enum tiếng Anh: `Body · narrative`, `Body · list_item`, `Body · legal_basis`, `Body · media_unsupported`, `Body · table_data`. Ngoài ra, tại chi tiết cảnh báo phần tử tệp, hiển thị mã `drawing_or_image`. | Đây là thuật ngữ kỹ thuật của lập trình viên và parser OOXML. Cán bộ văn phòng không hiểu `narrative` hay `media_unsupported` là gì trong văn bản hành chính; không biết nội dung đó có bị mất khi in hay không. |
| **S1-04** | **`KHÔNG ÁP DỤNG`** | Trên tệp pilot này và hồ sơ sạch, cả 3 dòng trạng thái đều trùng khớp hoàn toàn: Hệ chọn = Hành chính, Hệ gợi ý = Hành chính, Hệ xác nhận = Hành chính (chứng cứ mạnh từ Quốc hiệu và Tiêu ngữ). Không xảy ra mâu thuẫn hệ. | Hiện tượng mâu thuẫn 3 dòng trong audit trước xuất phát từ một bản nháp cũ đã lưu (chọn Đảng trên tệp hành chính). Trên hồ sơ sạch với tệp chuẩn, logic xác định hệ hoạt động chính xác. |
| **S1-05** | **`TÁI HIỆN`** | Bấm "Xem bố cục trang gốc", hệ thống báo "Chưa dựng đủ trang để đối chiếu" và nút quay về "Xem bố cục trang gốc". Không có dòng giải thích nguyên nhân và không có hướng dẫn hành động tiếp theo trên thông báo chính. *(Nguyên nhân kỹ thuật: môi trường máy trạm Windows thiếu công cụ rasterizer `pdfinfo.exe`/`pdftoppm.exe` hoặc Word COM)*. | Người dùng tưởng ứng dụng bị đơ hoặc tệp bị hỏng, tiếp tục bấm lại nút nhiều lần trong vô vọng. Cần nêu rõ: "Máy tính chưa có công cụ hiển thị trang in; bạn có thể tiếp tục duyệt bằng danh sách nội dung bên dưới." |
| **S1-06** | **`KHÔNG ÁP DỤNG`** *(Ghi nhận theo chuẩn Desktop-First)* | Theo định hướng mới trong `AGENTS.md`, desktop là ưu tiên nghiệm thu hàng đầu. Tại độ phân giải 1440×900, bố cục cân đối, lưới 9 nhóm và hộp thoại 2 cột thao tác rất thuận tiện, không tràn ngang (`scrollWidth === innerWidth = 1440`). | Các vấn đề co cụm thanh điều hướng ở viewport hẹp (<768px) được giữ lại để tối ưu hóa sau khi luồng desktop hoàn thiện. |

---

## 5. Danh mục lỗi và đề xuất cải tiến cho Cán bộ Văn phòng

### A. Mức ưu tiên P2 (Gây cản trở và bối rối về mặt nghiệp vụ)

1. **Việt hóa toàn diện nhãn thành phần rà soát ngữ nghĩa (S1-03 mở rộng):**
   - *Hiện tượng:* Tiêu đề hiển thị `Body · narrative`, `Body · list_item`, `Body · legal_basis`, `Body · media_unsupported`, `Body · table_data`.
   - *Hệ quả:* Cán bộ văn phòng bối rối, không hiểu ý nghĩa của các khối này đối với việc trình bày văn bản theo Nghị định 30.
   - *Đề xuất sửa:* Tạo hàm ánh xạ nhãn hiển thị tại [`src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx):
     - `narrative` → `Đoạn văn hành chính`
     - `list_item` → `Ý liệt kê / gạch đầu dòng`
     - `legal_basis` → `Căn cứ pháp lý`
     - `media_unsupported` → `Hình ảnh / Đồ họa (cần đối chiếu tệp gốc)`
     - `table` / `table_data` → `Bảng số liệu / Ô dữ liệu`
     - Giữ nguyên enum tiếng Anh trong phần `<details> Chi tiết kỹ thuật` dành cho IT/hỗ trợ.

2. **Bổ sung nguyên nhân và hướng dẫn xử lý khi dựng trang gốc thất bại (S1-05):**
   - *Hiện tượng:* Thông báo chỉ hiện vỏn vẹn "Chưa dựng đủ trang để đối chiếu."
   - *Hệ quả:* Người dùng tưởng tệp bị lỗi hoặc chức năng bị treo, liên tục nhấn lại nút bấm.
   - *Đề xuất sửa:* Khi trạng thái là `incomplete`, `unavailable` hoặc `error`, hiển thị câu hướng dẫn trực diện:
     > *"Chưa dựng được bản xem trang in trên máy tính này (thiếu bộ công cụ hỗ trợ). Bạn hoàn toàn có thể yên tâm tiếp tục duyệt nội dung bằng danh sách bên dưới hoặc tải tệp gốc để mở bằng Word."*

### B. Mức ưu tiên P3 (Làm mịn giao diện và tính nhất quán)

1. **Hiển thị số đếm tự nhiên, loại bỏ đệm số không `00` (S1-01):**
   - *Hiện tượng:* Ô đếm phụ lục hiển thị `00`.
   - *Đề xuất sửa:* Tại [`src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx#L1126-L1134), thay `String(count).padStart(2, "0")` bằng `{count}` thông thường. Chỉ giữ định dạng 2 chữ số (`01`, `02`...) ở mã đánh số thứ tự nhóm (ví dụ: `01. Tiêu đề thể thức`).

2. **Làm rõ các trạng thái nhận diện trên thanh tóm tắt (S1-02):**
   - *Hiện tượng:* 4 ô tóm tắt trên cùng chưa phản ánh nhóm "Chưa xác minh" hoặc "Chưa tìm thấy".
   - *Đề xuất sửa:* Bổ sung ô đếm hoặc chỉ dẫn phụ: `1 nhóm chưa xác minh` (Dấu, chữ ký số) để cán bộ lưu ý kiểm tra con dấu trước khi phát hành.

---

## 6. Ranh giới kiểm tra và các nội dung chưa kiểm chứng

1. **Kiểm tra trực tiếp (Đã thực hiện trong đợt này):**
   - Luồng giao diện thực tế Bước 1 với chuột và bàn phím ảo qua giao thức Chromium CDP trên cổng 5050.
   - Bóc tách cấu trúc tệp pilot DOCX thực tế, kiểm tra 9 nhóm thể thức, căn cứ pháp lý, rà soát ngữ nghĩa, hộp thoại đối chiếu 2 cột và cổng chuyển bước vào Studio.
   - Độc lập xác nhận mã SHA-256 tệp gốc trước và sau quá trình pilot.
2. **Kiểm tra qua kiểm thử tự động (Các đợt trước):**
   - Bộ hồi quy `test:regression` (73 tests PASS), kiểm tra hợp đồng an toàn candidate Bước 3, kiểm tra mạng loopback và bảo vệ máy chủ AI.
3. **Chưa kiểm chứng (Nằm ngoài phạm vi của đợt pilot này):**
   - *Kết nối dịch vụ AI thật (Gemini API / ChatGPT OAuth):* Chưa bật consent và chưa gửi dữ liệu thật ra ngoài theo đúng nguyên tắc an toàn.
   - *Hiển thị trang in trên Microsoft Word thật:* Chưa mở tệp xuất ra trên ứng dụng Word desktop để kiểm tra trực quan ngắt trang vật lý và đường kẻ Shape.
   - *Tệp DOCX có nhiều phụ lục hoặc bảng lồng phức tạp:* Tệp pilot là văn bản Thông báo 1 trang chuẩn; các trường hợp biên của bảng phức tạp cần các tệp mẫu kiểm thử chuyên biệt khác.

---

## 7. Nhật ký lệnh kiểm chứng độc lập trong lượt Audit

| Lệnh thực thi | Mục đích kiểm tra | Kết quả thực tế | Trạng thái |
|---|---|---|:---:|
| `powershell Get-FileHash ...` | Đo băm SHA-256 tệp pilot trước khi thao tác | `75E6A37A9138008C2EF389A49FD4004DAE81911B8ED5B2918D5DA4D80D29C17E` | `PASS` |
| `powershell Get-NetTCPConnection -LocalPort 5050` | Kiểm tra máy chủ đang chạy | Lắng nghe tại `127.0.0.1:5050`, PID `13984` | `PASS` |
| `powershell Invoke-WebRequest -Uri http://127.0.0.1:5050` | Kiểm tra phản hồi HTTP máy chủ | `StatusCode: 200 OK` | `PASS` |
| `cmd /c npx tsx scratch/pilot_full_run.ts` | Thao tác pilot toàn diện Bước 1 bằng Chromium CDP trên hồ sơ sạch | Hoàn tất 10 bước kiểm thử, ghi nhận JSON evidence chi tiết | `PASS` |
| `cmd /c npx tsx scratch/check_visual_state.ts` | Khảo sát chi tiết phản ứng nút "Xem bố cục trang gốc" | Xác nhận sau 4s thông báo chuyển sang "Chưa dựng đủ trang để đối chiếu." | `PASS` |
| `powershell Get-FileHash ...` | Đo băm SHA-256 tệp pilot sau khi thao tác | Khớp 100% với mã ban đầu | `PASS` |
| `git status` | Xác nhận toàn vẹn kho mã nguồn và các thay đổi local | Toàn bộ uncommitted changes được bảo toàn nguyên vẹn | `PASS` |

---

## 8. Tuyên bố tuân thủ an toàn dữ liệu

- **Không gửi dữ liệu ra ngoài:** Tính năng AI và các hộp kiểm consent được duy trì ở trạng thái **TẮT 100%**. Không có bất kỳ byte tài liệu, văn bản trích xuất hay ảnh chụp màn hình nào được gửi tới Google Gemini, OpenAI ChatGPT hoặc bất kỳ bên thứ ba nào.
- **Không làm hỏng tệp pilot:** Tệp `01_Thong_bao_Ngay_Van_Hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx` được giữ ở chế độ chỉ đọc; mã băm SHA-256 trước và sau pilot hoàn toàn trùng khớp.
- **Bảo toàn checkout cục bộ:** Không thực hiện bất kỳ lệnh `git commit`, `push`, `merge`, `reset`, `clean` hay `stash` nào. Toàn bộ các thay đổi cục bộ có sẵn trên checkout `D:\DocForm` được bảo toàn nguyên trạng.
- **Không sửa mã nguồn:** Đợt làm việc này là nhiệm vụ kiểm thử, audit và thẩm định thực tế; không tự ý chỉnh sửa bất kỳ dòng mã nguồn nào của ứng dụng.

---

*Báo cáo được lập dựa trên phiên thao tác người dùng thực tế và trích xuất dữ liệu tự động độc lập trên checkout `D:\DocForm`.*
