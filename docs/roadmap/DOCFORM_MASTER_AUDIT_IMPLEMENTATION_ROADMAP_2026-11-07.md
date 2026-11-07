# DOCFORM — MASTER AUDIT & KẾ HOẠCH HOÀN THIỆN THEO KẾT QUẢ NGƯỜI DÙNG

**Phiên bản hiện hành:** MASTER-ROADMAP-v2.0 — 07/11/2026 (kế thừa v1.0 không xóa lịch sử)  
**Repository:** `tranhaihp26-bit/DocForm` — nhánh `main`  
**Snapshot mã nguồn được kiểm tra:** `87cf74c9b7508d69e9bbca25ff60cf0907341f82` (GitHub, 07/11/2026; tree `1a5c6fee8aee70c64412dae5bc3cb6dba8c174ee`, **463 mục, 417 tệp**, `truncated=false`)  
**Tài liệu áp dụng:** `docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md`; registry OOXML HTHHMB V1.2 (07/11); Word Table Optimizer V6.9 (07/11); audit/đề xuất DocForm gần đây; dữ liệu profile và hợp đồng QA có liên quan trên Google Drive.  
**Trạng thái hiện hành:** **ĐÃ CÓ PHẦN CODE ĐƯỢC TRIỂN KHAI VÀ CI KIỂM CHỨNG**, nhưng **CHƯA NGHIỆM THU SẢN PHẨM M1/M2**. Phần 0–11 là snapshot audit gốc; phần 12–14 là tiến độ đã ghi; phần 15–21 bên dưới là **kế hoạch tích hợp nghiệm thu sản phẩm có hiệu lực**. Không suy nội dung kế hoạch thành tính năng đã triển khai.  
**Mục đích:** **một Master Roadmap duy nhất** gồm 29 gói kỹ thuật A–F và sáu trục nghiệm thu sản phẩm PA-01–PA-06 (không phải sáu module mới). Mục tiêu nghiệm thu cao nhất nằm tại [Product End State](../product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md); cập nhật sau mỗi phiên theo [Project Session Protocol](../PROJECT_SESSION_PROTOCOL.md). Không thay profile/mẫu đã duyệt, mã nguồn hiện hành hay hồ sơ pháp lý.

> **Bảo vệ dữ liệu:** repository hiện **PUBLIC**. Tài liệu này cố ý chỉ lưu **tên/phiên bản và kết luận kỹ thuật** của nguồn Drive/ChatGPT; **không đưa URL/ID của các tài liệu Drive nội bộ, tên nhân sự, nội dung hồ sơ thật, tệp font, khóa API hay dữ liệu nhạy cảm** lên GitHub. Nếu cần kiểm chứng mẫu nội bộ, sử dụng môi trường riêng, lưu SHA-256 và bằng chứng được phép công bố thay vì tải nguyên nguồn vào repository public.

## QUY TẮC ĐIỀU HÀNH HIỆN HÀNH — ĐỌC TRƯỚC KHI CHỌN TASK

**Cặp tài liệu điều hành:** (1) [Mục tiêu sản phẩm cuối và cổng nghiệm thu](../product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md) xác định **làm xong việc gì cho người dùng**; (2) **Master Roadmap này** xác định **gói nào, khi nào, phụ thuộc và bằng chứng**. [Project Memory](../PROJECT_MEMORY.md) xác định những gói đã hoàn thành, tránh làm lại.

**Thứ tự ưu tiên khi có xung đột nội dung:** mục tiêu đã chốt gần nhất của người dùng và chính sách profile-first → tài liệu Product End State cho tiêu chí nghiệm thu → tiến độ/phase ở phần 15–21 có hiệu lực → chi tiết kỹ thuật A–F ở phần 5 → snapshot audit 0–11 chỉ mang tính lịch sử. **Không xem lịch sử “OPEN” ở đầu báo cáo là trạng thái live** khi phần sau ghi đã DONE.

**Đích release:** M1 = pilot nội bộ có giới hạn rõ; M2 = sản phẩm sử dụng thường xuyên trong phạm vi cam kết. **Không gọi hoàn thành dự án vì đã đóng 29 issue.** M2 đòi hỏi người dùng mục tiêu tự làm xong việc, DOCX sửa được trong Office đã cam kết, vận hành/khôi phục/hướng dẫn và cổng nghiệm thu có bằng chứng. Không có Word/WPS/Office thật → `NOT_VERIFIED_RENDER`.

**Không mở rộng phạm vi vô cớ:** Profile Công ty có quyền ưu tiên **từng thuộc tính được thiết lập**, ND30/HD05 chỉ fallback đúng hệ khi thiếu; master conflict A02/A03 không tự sửa. Không viết Word clone, optimizer mặc định hay EXE trước khi cần. Những điều kiện kỹ thuật bắt buộc về bảo toàn nguồn, AI consent và stale candidate không được nới để tăng tỷ lệ hoàn thành giả.

---
---

## 0. KẾT LUẬN KIỂM TOÁN ĐỘC LẬP

**Định hướng sản phẩm: GIỮ; thực thi quy trình lõi: TIẾP TỤC CÓ ĐIỀU KIỆN; nghiệm thu triển khai rộng: CHƯA ĐẠT (NO-GO).**

DocForm có nền tảng đáng kế thừa: UX ba bước Import → Editor → Export, lưu nguồn & provenance, TableModel và fidelity gate, bộ tạo DOCX với header stamp, profile ND30/HD05 phân biệt, cơ chế WPS PDF tham khảo và các bài test tích lũy. **Không viết lại ứng dụng/Word clone/dual engine** khi chưa có ca lỗi bắt buộc. Tuy nhiên, chưa có chứng cứ hệ thống đã đạt **đúng mọi thông số profile trên DOCX cuối**, hoặc WPS/Word đã nghiệm thu các biến thể quan trọng. Các xung đột **nội bộ profile** và hành vi **bảng/phần cuối** có thể làm đầu ra không giống mẫu. V6.9 mới là nghiên cứu bảng giả lập, không phải engine đã sẵn sàng ghép trực tiếp.

**Định nghĩa thành công người dùng:** người dùng tạo/nhập, rà soát và chuẩn hóa văn bản nhanh, *đúng profile Công ty đã chọn*, có thể chỉnh sửa DOCX thực, không mất nội dung/hình ảnh/bảng/đối tượng ngoài phạm vi, xem trước có cảnh báo đúng, không bị tự điền số/ngày/chữ ký, và không phải tự sửa lại nhiều sau khi tải.

### Điều không được lặp lại

- **Đã merge:** PR #1 (`296c54e7`), CI kiểm tra kiểu và **31/31 test liên quan PASS** tại run `42308016555`. Đã xử lý nhận diện profile từ tên cơ quan ở import/composer, tin cậy profile từ AI, một phần audit body/page, và thông điệp xuất.
- **Đã sửa trên main sau PR #1:** cỡ tên loại văn bản Đảng từ **15,5 → 15 pt** (`e1d3c6a`), test font (`c890afc1`) và sửa regex (`87cf74c9`). Chưa thấy một workflow CI mới chứng minh toàn bộ sửa font này đã chạy; không công bố toàn DOCX font integer PASS.
- **Đã có bộ mẫu header + OOXML stamp:** không dựng thêm một header/template engine chỉ vì muốn “template-first”.
- **Đã có V6.9 + dữ liệu 18 ca:** sử dụng làm tiền đề/triage hoặc spike có kiểm soát; không tái xây bảng giả lập cùng nội dung để tăng số test.
- **Không tái audit 414 tệp vô điều kiện:** audit lịch sử đã kiểm kê repo tại snapshot trước; lượt này **đối chiếu 417 tệp trong cây hiện tại**, kiểm tra sâu module rủi ro và nguồn mới. Kiểm tra bổ sung ở từng PR theo diff & tác động; full canonical tại release gate.

## 1. NGUỒN DỮ LIỆU, ĐỘ TIN CẬY VÀ QUYỀN ƯU TIÊN

| Nguồn | Đã đọc/kiểm tra | Dùng vào việc gì | Giới hạn |
|---|---|---|---|
| **GitHub `main`** | HEAD và tree không cắt cụt; AGENTS, README, V2.2, audit V2.2; module profile, ruleEngine, composer, importer, exporter, header stamp, bảng, candidate, WPS, UI, test, server; commit & Actions | Trạng thái **code thực tế hiện tại** | Đọc tĩnh ≠ chạy runtime/Word. Không khẳng định toàn bộ 417 tệp đều được thử chức năng |
| **ChatGPT / files đính kèm** | Registry OOXML **V1.2**, ZIP **Word Table V6.9**, báo cáo nghiên cứu đối chiếu 07/11, đề xuất Product First V2.2, báo cáo P0, audit GitHub và các tệp liên quan | Yêu cầu người dùng đã chốt, nghiên cứu và phần còn thiếu | Kết luận cũ phải gắn phiên bản; không cho báo cáo thay thế đo đầu ra mới |
| **Google Drive — workbook profile** | Bộ **v1.7.4 “CHỐT THEO NGƯỜI DÙNG”**, v1.7.6 offline, **v1.7.7 “CHƯA DUYỆT”**, **v1.8.0 “CHƯA DUYỆT”** | Đối chiếu provenance, thiết lập riêng, trạng thái phê duyệt | Workbook phục vụ skill/plugin văn phòng **không tự động là cấu hình runtime DocForm**; không copy mọi ô vào code hoặc lấy v1.8 chưa duyệt thay v1.7.4 |
| **Google Drive — profile tổ chức** | `01_PROFILE_CONG_TY.md`, `02_PROFILE_DANG_UY.md`, `HTHHMB-PROFILE.md` | Tên/cấp tổ chức, ngữ cảnh loại văn bản, mẫu/golden | Có **biến thể phiên bản/tên gọi**, và một mẫu biên bản nhân sự riêng từng loại. Không áp chéo cho tất cả văn bản |
| **Google Drive — hợp đồng QA** | `05_QA_HANDOFF_VA_RANH_GIOI_BANG_v1.0.0`, bộ công văn `CTY-CV-01`, chính sách offline và mục lục phiên bản | Phân vai LAYOUT_TABLE / CONTENT_TABLE / UNKNOWN_TABLE; quyền sửa và QA | Đây là hướng dẫn skill offline, cần chuyển đổi thành điều kiện kỹ thuật đúng loại tác vụ, không hiểu mặc nhiên đã tích hợp DocForm |
| **Word Table Optimizer V6.9** | Manifest **220/220 SHA hợp lệ**, corpus nguồn **18/18 SHA hợp lệ**, batch JSON & README/QA | Thử tối ưu bảng có điều kiện, tái dùng preflight/candidate/measured gain | **7** `REVIEW_CANDIDATE`, **1** `KEEP`, **10** `REVIEW_REQUIRED`; chỉ mô phỏng LibreOffice, **Word/Adobe chưa kiểm**, `production_go=false` |

### Quy tắc giải quyết khi nhiều nguồn mâu thuẫn

1. **Yêu cầu nghiệp vụ đã chốt gần nhất của người dùng** về chính sách sản phẩm/định dạng có quyền ưu tiên cho *mục tiêu và hành vi*; không suy ra một file trên Drive mới nhất về ngày là master đã duyệt.
2. **Đối với một thông số cụ thể**, khi người dùng chọn profile có hiệu lực: **profile đã cấu hình → giá trị đó, tuyệt đối không so/hậu kiểm với ND30/HD05**; trường profile chưa cấu hình ở mọi cấp mới **fallback ND30 hoặc HD05 cùng regime**; vẫn thiếu → `UNSPECIFIED`. Với `0`, `false`, `""` có chủ ý vẫn là “đã cấu hình”; `null` theo schema. Không tự điền.
3. **Nếu hai lớp cùng là profile lại khác nhau** (`profile.json`, builder, master XML, workbook cũ), quy tắc #2 **không giải quyết được**. Đặt `PROFILE_CONFLICT`, giữ bản đã duyệt đang vận hành, khoanh vùng, đối chiếu golden DOCX/PDF đúng phiên bản và chốt master. **Không dùng ND30/HD05 để phân xử thông số profile đã có**.
4. Phải tách **nguồn rule** (P=profile, R=master XML stamp, C=code hiện hữu, F=fallback, D=đề xuất, ?=chưa kiểm) khỏi **bằng chứng đã kiểm thử**. Không nâng `C/D/?` thành P hoặc PASS. Không tự nhập giá trị từ workbook **CHƯA DUYỆT**.
5. Profile Công ty và profile Đảng ủy là hai chủ thể; hồ sơ Drive cũ dùng biến thể tên `ĐẢNG ỦY BỘ PHẬN`, trong khi profile đang triển khai ghi `ĐẢNG ỦY CÔNG TY`. **Không tự sửa tên cơ quan ban hành** hoặc suy từ tài liệu quá khứ. Giải quyết bằng đúng quyết định/mẫu hiệu lực dành cho văn bản cần dùng, có version và approval.
6. “Chính sách áp dụng thông số trong DocForm” **không phải** lời chứng nhận tuân thủ pháp lý; đánh giá pháp lý độc lập (nếu có) không tự ghi đè profile đã xác nhận.

## 2. KIẾN TRÚC HIỆN TẠI VÀ PHẦN CÓ THỂ KẾ THỪA

```text
BƯỚC 1: source DOCX/TXT / tạo mới
   └─ phân vùng + evidence + quyết định regime/type/profile + source SHA/revision
BƯỚC 2: editor Tiptap/HTML + TableModel + transactions + user approvals
   └─ composer / semantic formatting / profile-regime rule resolution (chưa phủ đủ)
BƯỚC 3: docx.js → Packer → postProcessDocxShapes → stampHoaTieuHeader
   ├─ OOXML/candidate/content/table fidelity gate, unsupported-source gate
   ├─ downloadable / review-only / blocked / stale (đang cần đo UX)
   └─ WPS COM-to-PDF trên Windows (cần real-world QA), tùy môi trường
```

- **Giữ** `TableModel`/`tableRoundtrip`/`candidateContentFidelity` và gating; chỉnh lựa chọn hàng tiêu đề thay vì phá công cụ đã có.
- **Giữ** bảng Wide Header đúng mẫu của hai hệ; bảng nơi nhận–người ký thực chất nằm trong `word/document.xml`, **không phải Word footer part**. Tên “footer” trong kế hoạch là **vùng cuối văn bản**.
- **Giữ** kiến trúc một đường xuất DOCX hiện tại trước khi cân nhắc patch OOXML hay document IR. Chỉ thử selective patch ở ca nguồn thực chứng minh tổn thất không khắc phục hiệu quả bằng cách đơn giản.
- **Giữ WPS COM ở vai trò render/QA** trên Windows, không biến WPS thành editor lõi. LibreOffice là chứng cứ surrogate; Word Desktop, khi có, mới giúp so độ tương thích Word thực.

## 3. PHÁT HIỆN AUDIT CÓ ĐỊA CHỈ CỤ THỂ

**Nhãn:** `CONFIRMED_SOURCE` = đọc thấy trong code/file; `RISK_NEEDS_REPRO` = nguy cơ cần test; `KNOWN_DONE` = đã có bằng chứng hoàn thành phạm vi hẹp; `BLOCKED_BY_MASTER` = thiếu một phiên bản master được chọn; `NOT_VERIFIED` = chưa có test/render thực.

| Mã | Mức | Bằng chứng / tệp | Phát hiện | Trạng thái |
|---|---|---|---|---|
| **AF-01** | **P0** | Registry V1.2 G-01; ND30 `profile.json`, `companyHeader.ts`, `hoaTieuHeaderReferenceXml.ts` | Ngày tháng **right** trong JSON/builder nhưng **center** trong XML stamp; kết quả tùy nhánh stamp | `BLOCKED_BY_MASTER` |
| **AF-02** | **P0** | Registry V1.2 G-02; `companyHeader.ts` và XML master | Tên Công ty ND30 builder **Exactly 16 pt**, stamp **Exactly 15 pt** | `BLOCKED_BY_MASTER` |
| **AF-03** | **P0** | Drive profile Đảng; GitHub HD05 profile JSON/Builder | Biến thể tên cơ quan Đảng theo hồ sơ **không thống nhất giữa các phiên bản**, dễ tự thay sai chủ thể | `BLOCKED_BY_MASTER` |
| **AF-04** | **P0** | `companyBodyProfile.ts`, `semanticRuleFormatting.ts`, `documentComposer.ts`, `ruleEngine.ts`, V2.2 | Đã có cấu hình body rải nhiều nơi; kiểm một số thuộc tính profile, **chưa có registry effective per-property xuyên toàn pipeline**, phân biệt `0/false/""`, nguồn quyết định | `CONFIRMED_SOURCE` (khoảng trống kiến trúc có giới hạn) |
| **AF-05** | **P0** | `docxExport.ts:403`, `tableRoundtrip.ts:536` | Khi chọn profile Công ty, code có thể tự coi **hàng đầu là header** (`rowIndex===0`) và QA comparison cũng chuẩn hóa như thế; có thể báo đạt dù `row.isHeader=false` | `CONFIRMED_SOURCE`, cần test tái hiện end-to-end |
| **AF-06** | **P0** | `docxExport.ts:2545–2559`; Registry V1.2 G-10 | Tự thêm **`(Ký, đóng dấu)`** khi có `signTitle`, không phù hợp mặc định nháp đã chốt | `CONFIRMED_SOURCE` |
| **AF-07** | **P0** | Registry V1.2 E; `docxExport.ts` nơi nhận | HD05 dùng nhánh trình bày nơi nhận/chữ ký chung với ND30; style HD05 đề xuất **chưa được duyệt** và chưa có role registry đầy đủ | `CONFIRMED_SOURCE` + `BLOCKED_BY_MASTER` |
| **AF-08** | **P0** | `hoaTieuHeaderStamp.ts:61–62`; `exportCandidate.ts:192–195` | Stamp thay toàn `word/settings.xml` theo mẫu tham chiếu; có **nguy cơ** mất thuộc tính unrelated của tài liệu đầu vào. Candidate kiểm settings khớp stamp, **không chứng minh bảo toàn mọi setting nguồn** | `RISK_NEEDS_REPRO` — không gọi là lỗi đã xảy ra |
| **AF-09** | **P0** | Registry V1.2 phần A4/J; `test/header-dual-regime.test.ts:215–220` | Cỡ chữ HD05 title 15pt đã sửa; test mới kiểm `w:sz` trong **document.xml** ca giới hạn; chưa có gate effective font integer toàn bộ scope role/styles/header/footer post-stamp | `KNOWN_DONE` một phần, `NOT_VERIFIED` toàn diện |
| **AF-10** | **P1** | Registry V1.2 B/C/D/E; `docxExport.ts`; `hoaTieuHeaderStamp.ts` | Builder/stamp/nhánh có tên loại/công văn/lists/appendix có spacing, indent, line khác nhau; inheritance `Before/After` không được xem như 0 | `RISK_NEEDS_REPRO` |
| **AF-11** | **P1** | Registry V1.2 D3, Drive QA bảng, `tableFormatUtils.ts` | TableModel (1/1pt) và HTML mới (2/2pt hoặc khác), margin/width/fidelity khác đường; không có quyền tự giảm bảng từ 13 xuống 11/10pt | `CONFIRMED_SOURCE` + test end-to-end cần có |
| **AF-12** | **P1** | Word Table V6.9; DocForm Wide Header và bảng cuối | V6.9 chỉ tự nhận **một bảng/một section**; DocForm thực thường có ít nhất bảng phần đầu + bảng cuối. Dùng nguyên triage toàn DOCX sẽ chặn bảng nội dung lành tính | `CONFIRMED_SOURCE` |
| **AF-13** | **P1** | `exportCandidate.ts`, `WorkspaceExport.tsx`, test P0 | `safe/downloadable/reviewDownloadable` vẫn có luồng trạng thái cần chứng minh cả UI và byte; tự động PASS **không đồng nghĩa phê duyệt ban hành** (copy P0 đã sửa) | `KNOWN_DONE` copy; hành vi review còn `NOT_VERIFIED` |
| **AF-14** | **P1** | `server.ts`/`compliance.middleware.ts` | Middleware có `confirmedProfile?`, nhưng route AI format đang gọi chỉ với `parsed, regime` / `fallback, regime`; thông số được chọn trước đó chưa được truyền tin cậy qua API | `CONFIRMED_SOURCE` |
| **AF-15** | **P1** | `src/server/sourceVisualRenderer.ts`, PowerShell renderer, V2.2 | WPS real PDF chỉ hoạt động trên Windows; chưa có dữ liệu nghiệm thu Word/WPS cùng bản DOCX cuối; cần cách ly file ngoại lai, quan sát WPS bận/lỗi | `NOT_VERIFIED` |
| **AF-16** | **P1** | `package.json`, CI V2.2 logs | `npm ci` sạch gặp **peer conflict Vite 8.3.x ↔ esbuild 0.25.x** ở run đầu; CI đã dùng `--legacy-peer-deps` để 31/31 PASS, **chưa sửa dependency chuẩn** | `CONFIRMED_SOURCE` |
| **AF-17** | **P1** | `server.ts` bản hiện tại; audit 02/11 | Audit 02/11 báo bind/CORS mặc định rủi ro, nhưng hiện server **mặc định 127.0.0.1**, có `isTrustedLocalAiRequest`. **Không tiếp tục coi F-01 cũ là lỗi chưa sửa**; vẫn cần regression security khi explicit bind/remote config, route chứa credential | `KNOWN_DONE` một phần, cần negative test |
| **AF-18** | **P2** | `docs/CODEBASE_MAP.md`, `src/App.tsx`, test and Actions | UX orchestration tập trung; còn khác biệt giữa kiểm thử module và hành vi Step1–3 khi mở lại draft, đổi regime/profile, dữ liệu nguồn phức tạp | `RISK_NEEDS_REPRO` |
| **AF-19** | **P2** | Drive HTHHMB profile/nguồn skill và MD registry V1.2 | Định nghĩa đã duyệt/vẫn dự thảo bị trộn giữa workbook offline, profile cho biên bản riêng, master JSON/TS và DOCX mẫu. Không tự hợp nhất mọi nguồn thành một profile đã duyệt | `CONFIRMED_SOURCE` |
| **AF-20** | **P2** | Bảng `SOURCE-MODEL`/Docs & `tableRoundtrip` | Field, drawing, footnote, bookmark, hyperlink, ảnh, bảng nested và section cần giữ/cảnh báo; không có bằng chứng mọi loại phức tạp có thể sửa tự động | `NOT_VERIFIED` (đã có fail-closed) |

### 3.1. Thông số đã thống nhất, không cần nghiên cứu lại

- **Hai profile**: ND30 Công ty `hoa-tieu-mien-bac-administrative-v1`; HD05 Đảng ủy `HOA-TIEU-MIEN-BAC-PARTY-HD05-HEADER-2026`.
- **Body theo profile** hai hệ: **Times New Roman 14 pt, Exactly 19 pt, After 6 pt**, firstLine **ND30 720 dxa**, **HD05 567 dxa**; bảng nội dung **13 pt** khi profile đã đặt; margin A4 dọc 20/20/30/15 mm theo profile hiện có.
- **Wide Header**: ND30 bảng 2 hàng × 2 cột, 10432 dxa/−874 dxa/cột 5187–5245; HD05 bảng 1 hàng × 2 cột, 9980/−593/cột 5540–4440. Không đổi Wide Header thành Text Box; không trộn thông số hai hệ.
- **Font size integer policy**: size pt là **số nguyên dương** trong vùng engine định dạng thuộc profile, `w:sz`/`w:szCs` là **số chẵn**; nếu **giá trị profile có cấu hình** là 15,5 thì `INVALID_PROFILE_FONT_SIZE`, **không làm tròn**, **không fallback**. Số đo không phải cỡ chữ (line width 0,75pt, ratio 52,14%, line multiplier 1,15) vẫn được phép là thập phân. Thiếu direct OOXML không tự coi `0`; xem inheritance.
- **Văn bản Đảng**: tiêu đề 15pt, dấu `*`, line đặc trưng 72,09mm, dấu tách **5 dấu `-----` dạng văn bản** dưới trích yếu khi có tên loại; không phải đường Shape thứ ba. ND30 chỉ có line trích yếu cho văn bản có tên loại theo điều kiện, không ép cho công văn.
- **Phần cuối**: bảng 2 cột hiện grid `[4878,4476]` cộng 9354 dxa tương ứng **165mm** (bề ngang body); không coi tỷ lệ 52,14/47,86% và grid này tự động là lỗi. Chỉ đổi khi có repro Word/WPS.

### 3.2. Kết quả V6.9 được kiểm lại trong gói ZIP

- `MANIFEST_SHA256.json`: **220/220 file SHA khớp**, 0 thiếu. Corpus `admin_corpus/CORPUS_MANIFEST.json`: **18/18 DOCX SHA khớp**.
- Batch: **7 đề nghị xem ứng viên**, **1 giữ nguồn**, **10 chuyển review**. Các ứng viên đo bằng LibreOffice surrogate; không có chứng cứ Word Desktop/Adobe, không production GO. `A01–A05`, `A07–A08` là 7 ca có cải thiện; `A06` giữ nguồn; `B01–B10` review do ô gộp/ngang/dọc, bảng lồng, nhiều section/bảng, thiếu repeat/cantSplit, row Exactly, ảnh, bảng quá rộng.
- Điều kiện **H06/H07** và tối ưu **H08** phải tách: thiếu thuộc tính bắt buộc như Repeat Header/cantSplit là vấn đề **chuẩn hóa định dạng**; giảm footprint chỉ là **tối ưu bổ sung**, không dùng mức tăng giảm trang để thay thế chính sách profile.

## 4. KIẾN TRÚC ĐÍCH TỐI THIỂU — KHÔNG ĐẠI TU

### 4.1. Effective Attribute Registry (nhỏ, theo thuộc tính)

**Không tạo registry thứ hai sao chép tất cả rule pháp quy.** Duy trì một lớp ánh xạ có version trên những role đang thực sự áp dụng. Mỗi entry có: `regime`, `profileId`, `objectRole`, `propertyPath`, `scope`, `value`, `unit`, `valueState`, `sourceKind`, `sourceFile`, `sourceRevision`, `approval`, `effectiveAt`, `ooxmlPath`, `validationMethod`, `verifiedCode`, `verifiedDocx`, `verifiedRender`. Giá trị có nguồn từ JSON profile/master XML/TS được duyệt; rule regime đọc như fallback ở field còn thiếu.

Ví dụ (đặc tả, chưa phải API):

```ts
resolveAttribute({ regime: "party", profileId, role: "body.normal", property: "font.sizePt" })
  -> { state: "SET", value: 14, source: "company-profile", sourceRef: "companyBodyProfile.ts" }
resolveAttribute({ regime: "administrative", profileId, role: "distribution.label", property: "beforePt" })
  -> { state: "SET" | "UNSPECIFIED" | "INVALID", value?, source? }
```

- `isConfigured` dựa vào **presence + schema**, không truthiness; khi có `0/false/""` thì thuộc tính vẫn SET.
- Chuỗi cascade: **approved role-specific profile** → **approved shared profile applicable to same role** → **regime fallback for that property** → `UNSPECIFIED`. Nếu hai profile khác nhau cùng một role/property nhưng không có quan hệ thứ bậc rõ → **`PROFILE_CONFLICT`**, không lấy ND30/HD05 “phán xử”.
- Không tự biến `C` (hardcode trong exporter), `D` (đề xuất) hay workbook CHƯA DUYỆT thành approved profile.
- Tách `ValuePolicy` khỏi `EvidenceEvaluator`: xuất 14pt khác với chứng minh `w:sz=28` thực; kiểm cả direct/run/style/cascade sau stamp.
- Chỉ nối consumer đang có, không viết lại `docxExport.ts` hơn 2600 dòng trong một PR.

### 4.2. Vai trò bảng để tích hợp V6.9 sau này

```text
DocumentTableInventory
 ├─ header_layout            → LOCKED (Wide Header, shapes)
 ├─ signature_distribution  → LOCKED (cuối văn bản)
 ├─ content_table[id]        → profile formatting → optional optimizer
 └─ unknown                 → NEEDS_REVIEW, không sửa
```

Chỉ tối ưu **một content_table được người dùng chọn/định danh rõ** trên bản sao toàn DOCX; kiểm hash nguồn, layout/table IDs, source coverage, untouched regions. Chạy triage từ V6.9 ở **phạm vi bảng mục tiêu**, không dùng nguyên `doc.tables.length === 1` với toàn DOCX nhiều bảng. Kết quả `KEEP`, `REVIEW_CANDIDATE`, `REVIEW_REQUIRED`; **không auto-apply**, không thay font 13pt profile bằng 11/10pt, không tự xoay landscape, không sửa header/footer.

### 4.3. Các cổng độc lập theo tầng

`G-SOURCE` nguồn/consent/phiên và nguyên vẹn nội dung → `G-PROFILE` thuộc tính hiệu lực + schema → `G-OOXML` sau stamp + objects/relationships → `G-VISUAL` renderer WPS/Word/Adobe khi có → `G-USABILITY` user dễ sửa/số thao tác → `G-RELEASE` chỉ lúc đủ evidence. Candidate `downloadable` chỉ là **đủ điều kiện tải kỹ thuật**, không phải duyệt ban hành. Thiếu WPS thật → `NOT_VERIFIED_RENDER`, không gắn PASS.

## 5. ROADMAP THỰC HIỆN THEO GÓI CÔNG VIỆC (ISSUE-READY)

**Quy tắc chung cho mọi gói:** đọc commit HEAD và kết quả đã có; nhánh/PR nhỏ theo một outcome; sửa tối thiểu; test phạm vi diff; PR checklist có before/after, bằng chứng, failed tests/blocked công khai; không tự nâng ngoại lệ. Gói không phụ thuộc nguồn mới thì chủ động thực hiện không hỏi lại. Mục cần master phê duyệt mới để ở `BLOCKED_BY_MASTER`, vẫn làm các phần độc lập được.

### PHASE A — Khoá nguồn chuẩn / giải quyết xung đột profile (P0)

| ID | Công việc chính xác | File/code được tác động dự kiến | Đầu ra & nghiệm thu | Phụ thuộc/điều kiện dừng |
|---|---|---|---|---|
| **DF-A01** | Tạo **approval/provenance matrix** theo role/path: loại `P/R/C/F/D/?`, scope, profile ID, release, master SHA; đối chiếu workbook v1.7.4 đã chốt với 1.7.6 nghiên cứu, v1.7.7/v1.8 chưa duyệt, JSON/TS | `docs/profile/PROFILE_SOURCE_MATRIX.md` (mới); **chưa** thay các JSON đang chạy | 100% field của **4 nhóm pilot** có trạng thái nguồn: approved/draft/conflict/unspecified; không “auto-approved” Drive | Không khóa các field chưa có master, ghi blocker riêng |
| **DF-A02** | Chốt đúng **một** master ND30 cho `header.date.alignment` (right/center) và `issuer.lineSpacingPt` (15/16), kiểm raw OOXML/PDF được duyệt, ghi hash | `profile.json`, `companyHeader.ts`, `hoaTieuHeaderReferenceXml.ts`, test stamp (sau khi có master) | Giá trị **phê duyệt** thống nhất giữa builder/stamp, cả có/không có stamp; 0 drift trên DOCX cuối | `BLOCKED_BY_MASTER` nếu thiếu mẫu đã duyệt; không đoán |
| **DF-A03** | Chốt **tên chủ thể HD05** và phân biệt profile của từng loại tổ chức Đảng theo quyết định/Golden, không lấy hồ sơ cũ suy sang mẫu mới | Profile HD05 + test mapping nếu được phê duyệt | Một chuỗi/phiên bản chính thức theo từng regime/issuer; người dùng được chọn/đổi có kiểm soát | `BLOCKED_BY_MASTER`; không tự thay tên |
| **DF-A04** | Tạo test `profile-no-fallback-when-set` và data-contract `0/false/""/null`, xung đột 2 cấp, missing và sai regime | `test/profile-resolution-v22.test.ts` và schema nhỏ khi cần | Ca dữ liệu âm/dương rõ ràng, field đã SET không bị pháp quy ghi đè | Độc lập với A02/A03 |

### PHASE B — Chính sách profile & xuất DOCX đúng thực tế (P0)

| ID | Công việc chính xác | Mô-đun dự kiến | Đầu ra/DoD | Ghi chú |
|---|---|---|---|---|
| **DF-B01** | Xây **resolver thuộc tính nhỏ**, truy vết `path→value→source` chỉ cho các role có cấu hình đã duyệt; không duplicate `rules.generated.json` | `src/canonical/` hoặc `src/shared/` module mới nhỏ; kết nối `companyBodyProfile.ts`, JSON header | Test matrix SET/MISSING/INVALID/CONFLICT; 0 so ND30/HD05 với trường profile đã SET; 0/false/"" không bị bỏ | Chỉ triển khai consumers có thật, không build universal IR |
| **DF-B02** | Nối resolver vào **producer → composer → exporter → audit** cho Body/font/line/indent, header/margin, title/subject/số-ngày và bảng hiện có | `documentComposer.ts`, `semanticRuleFormatting.ts`, `docxExport.ts`, `ruleEngine.ts` | Xuất OOXML cuối theo **profile effective value**, fallback đúng role/regime, log nguồn và revision; 0 double-rule conflict | Bảo toàn P0 PR #1; không chạy lại test cũ vô ích |
| **DF-B03** | Cổng **Font Integer** trên từng role đủ scope sau stamp: `w:sz`/`w:szCs` direct, `styles.xml`/defaults, header/footer, table text; `INVALID_PROFILE_FONT_SIZE` khi profile tự chứa cỡ lẻ | profile validator, post-export OOXML auditor, test/fixtures | `Number.isInteger(fontPt) && fontPt>0`; odd half-point ở vùng được engine định dạng → FAIL; direct unset được resolve cascade hoặc NOT_EVALUATED; không tự làm tròn | Giữ HD05 title 15pt đã sửa; kiểm không sửa stroke 0.75pt |
| **DF-B04** | Gia cố stamp Header: **không thay toàn settings mà không bảo toàn thuộc tính unrelated**; kiểm schema/relationships, chọn patch mục cần thiết hoặc chứng minh copy full an toàn, định danh bảng đầu ổn | `hoaTieuHeaderStamp.ts`, source/reference XML + test | Test DOCX có unrelated settings và shape; không mất/đổi thiết lập ngoài phạm vi; output profile post-stamp đạt; import unknown được chặn/giữ nguyên | Chỉ làm nếu test chứng minh thay settings gây hại; không thay master geometry |
| **DF-B05** | Kiểm và chốt đủ **4 loại** trên hai regime: ND30 văn bản có tên loại / ND30 công văn `V/v` / HD05 văn bản có tên loại / HD05 công văn; kiểm line 3, `-----`, dấu `*`, spacing, title 15pt, số/ngày/recipient | `docxExport.ts`, `companyHeader*.ts`, fixtures/test | Không lẫn văn bản Đảng/công văn, không sinh line 3 khi không áp; 0 nội dung tự điền; lệch thì chỉ sửa block phạm vi | A02/A03 chặn phần đang conflict; test phần độc lập trước |
| **DF-B06** | Xử lý blank paragraphs/spacing hiệu lực trên các block còn sai: Before/After/line + style cascade; tránh đoạn rỗng cộng khoảng, widow/orphan, ngắt trang bất thường | `docxExport.ts`, paragraph formatting helpers, QA | Diff từng role trước/sau, không tăng khoảng trắng vô ý; không mất giữ nguyên blank có ý nghĩa | Không xóa paragraph nguồn hàng loạt; đo trước khi sửa |

### PHASE C — Phần cuối, bảng và bảo vệ nguồn (P0/P1)

| ID | Công việc chính xác | Mô-đun dự kiến | Đầu ra/DoD | Ghi chú |
|---|---|---|---|---|
| **DF-C01** | **Không tự tạo `(Ký, đóng dấu)`** trong tài liệu nháp; chỉ xuất nếu người dùng chọn/nguồn đã có và được phép, áp cả 1-bên/nhiều-bên; không tự điền người ký, số văn bản, ngày | `docxExport.ts`, `DocumentState` field opt-in nếu cần | Test nháp có signTitle nhưng không có chú thích ký; nếu opt-in thì đúng; 0 sinh chữ ký/dấu giả | Giữ cấu trúc ký và dữ liệu nguồn, không “xóa mọi ghi chú” |
| **DF-C02** | Tách role phần cuối HD05 (`distribution.label/item`, `signature.authority/position/name/space`) khỏi ND30; map profile đã duyệt, phần chưa duyệt để `UNSPECIFIED`/fallback | `companyBodyProfile.ts` hoặc profile registry, exporter | ND30 không bị đổi; HD05 chỉ áp style được chốt, không tự gán kiểu 14pt/underline đề xuất | Blocked một phần khi chưa có golden footer HD05 |
| **DF-C03** | Sửa **nhận diện hàng tiêu đề thật** ở bảng nhập: bỏ điều kiện `rowIndex===0` vô điều kiện tại exporter và roundtrip comparator; giữ `row.isHeader`/semantic proof | `docxExport.ts:403`, `tableRoundtrip.ts:536`, `tableFormatUtils.ts` | Row0 không header → không có `w:tblHeader`, không ép center/bold; source có header thật → repeat đúng; comparator không “làm đúng hộ” output | Ưu tiên vì tránh false PASS |
| **DF-C04** | Chuẩn hóa profile bảng theo role và nghĩa vụ: font 13pt locked, padding/cell spacing/width, `cantSplit` cho hàng ngắn khi khả thi, repeat cho hàng tiêu đề thật; tách bảng HTML mới vs TableModel imported | `tableFormatUtils.ts`, `docxExport.ts`, `tableModel.ts`, test | Ít nhất 1 bảng nhập và 1 bảng mới cùng dữ liệu có geometry so được; zero data loss, repeat/cantSplit đúng; hàng quá cao → REVIEW | Không auto đổi font 11/10pt, không xoay landscape |
| **DF-C05** | Bảng nơi nhận–người ký dài/nhiều bên: kiểm grid/width 9354 dxa ≈165mm, `cantSplit`, vAlign, tblLayout, pagination, nơi nhận dài | `docxExport.ts` vùng khối cuối, test | Không tràn trang, không rơi toàn bảng ra trang mới nếu có phương án hợp lệ; có case fail-closed khi không xử lý được | **Không** giả định tỷ lệ bảng hiện tại là sai chỉ vì dùng pct+dxa |
| **DF-C06** | Bảo đảm các vùng ngoài CONTENT_TABLE còn nguyên khi sửa bảng; phát hiện metadata/layout/signature/content/unknown theo source lineage, không chỉ vị trí đầu trang | `sourceTableInventory.ts`, `tableRoundtrip.ts`, source fidelity | Unknown → NEEDS_REVIEW, locked tables không thay đổi; diff kiểm table IDs/relationships | Tránh chuyển hợp đồng offline thành heuristic mới thiếu chứng cứ |

### PHASE D — V6.9 table optimizer: thử nghiệm opt-in có cổng dừng (P1/P2)

| ID | Công việc chính xác | Phạm vi | Điều kiện đạt & dừng |
|---|---|---|---|
| **DF-D01** | Thiết kế seam **`evaluateContentTableCandidate(tableId, effectiveProfile, lockedProps, sourceSha, revision)`**; kết quả `KEEP/REVIEW_CANDIDATE/REVIEW_REQUIRED` | Chỉ content table đơn giản, một table được chọn; tách khỏi `exportCandidate` chính | 0 sửa byte nguồn, 0 sửa header/signature; hủy khi unsupported hoặc stale; thiết kế ADR ngắn có benchmark |
| **DF-D02** | Tái dùng **preflight** V6.9 theo bảng mục tiêu và **measured-gain** V6.8 (không ném Python full ZIP vào frontend) | Pilot adapter/offline worker hoặc dịch từng phần thuật toán thật cần | Test 7 positive/1 keep/10 review **tái dùng corpus**; không coi 7/18 là tỷ lệ thực tế; nếu adapter phức tạp hoặc ít lợi ích thì dừng tích hợp, giữ thành công cụ độc lập |
| **DF-D03** | Tách **format remediation** (Repeat Header/cantSplit theo evidence) khỏi **tối ưu độ rộng**; không yêu cầu phải giảm trang mới cho phép sửa format sai | Quy trình table content đã phân loại | Chứng minh H06/H07 end-to-end qua OOXML và render; nội dung không đổi; hàng quá cao/row Exactly/nested/merge phức tạp → REVIEW |
| **DF-D04** | Pilot 10–20 bảng thực đã ẩn danh **chỉ nếu nguồn có quyền sử dụng**, so Word/WPS/LO, chấm chuyên gia; xem có cần mở rộng gộp ngang/section không | Không lưu hồ sơ thật trên GitHub public | Nếu không có dữ liệu/máy render thì để `BLOCKED_EVIDENCE`, **không mở rộng engine bằng suy đoán** |

### PHASE E — QA, trải nghiệm, security/dependency (P1)

| ID | Công việc chính xác | Mô-đun | Bằng chứng hoàn thành |
|---|---|---|---|
| **DF-E01** | Trace profile confirmed qua AI format: route server chỉ chấp nhận profile từ quyết định trusted/session/revision, không từ AI JSON/user field giả; không ngầm ép text và không ghi đè draft đã duyệt | `server.ts` + middleware/protocol | Test request legitimate, fake AI profile, sai regime, stale revision, untrusted origin; default generic nếu thiếu quyết định |
| **DF-E02** | Contract UI Bước 3: trạng thái `downloadable/review-only/blocked/stale/NOT_EVALUATED`, PDF preview đúng SHA/revision, copy không nói phê duyệt ban hành | `exportCandidate.ts`, `WorkspaceExport.tsx` + UI tests | Matrix states & thao tác download/print; không rò bản PDF của revision cũ; tài liệu review chỉ tải theo chính sách cho phép |
| **DF-E03** | **Windows WPS real smoke & an toàn** với 4–6 mẫu: COM isolation, timeout, WPS bận, file xấu/quan hệ ngoài, cleanup, không làm đóng WPS người dùng | `sourceVisualRenderer.ts`, `candidatePdfRenderer.win.ps1`, endpoint | Lưu renderer version, SHA DOCX/PDF, số trang, ảnh trang và kết luận đo thật; nếu không có Windows/WPS thì `NOT_VERIFIED` |
| **DF-E04** | Sửa peer dependency Vite/esbuild để **`npm ci` bình thường PASS**, đồng bộ lockfile, không phụ thuộc `--legacy-peer-deps` | `package.json`, `package-lock.json`, workflow | Fresh install Node 22, lint, focused tests pass; không nâng bừa toàn bộ dependencies; security scan phạm vi gói đổi |
| **DF-E05** | Bổ sung kiểm tra bảo mật **hồi quy** sau các sửa cũ: loopback mặc định, explicit remote host, trusted origin, AI credential routes, PDF DOCX external relationships/size & temp file | `server.ts`, server/visual tests | Test từ chối origin/request không tin cậy; không đánh dấu F-01 02/11 là lỗi đang mở nếu code hiện đã đổi; chỉ mở issue khi repro |
| **DF-E06** | Pilot UX 3 bước trên tài liệu thực ẩn danh: ít thao tác, profile rõ, lỗi không mất draft/nguồn, tất cả vùng unknown được hiển thị | `App.tsx`, step views, tests | Test hành trình người dùng, không tự tạo nội dung, rollback khi lỗi, không ép redesign toàn UI |

### PHASE F — Release/điểm dừng (P2 cuối)

| ID | Công việc | Điều kiện nghiệm thu |
|---|---|---|
| **DF-F01** | Chạy **canonical regression** ở mốc release sau khi các PR liên quan đã merge, không chạy vô điều kiện sau mỗi chỉnh nhỏ | fresh install sạch, lint/build, unit/integration/DOM/UI, 4–6 DOCX pilot, source/table/fidelity/security, kiểm file nhị phân có provenance và hash |
| **DF-F02** | **Word/WPS visual acceptance** đúng profile đã duyệt, có bằng chứng trang đầu/giữa/cuối, header/body/table/footer/shape, lỗi phân trang | PASS theo từng role, 0 lỗi mất nội dung, 0 lỗi font integer thuộc scope profile, 0 mismatch profile đã cấu hình; WPS không có thì NO-GO phần visual |
| **DF-F03** | Báo cáo nghiệm thu, feature toggles, rollback plan và release notes; cập nhật AGENTS/README/ROADMAP theo kết quả thật | `APPROVED_MASTER`, `PARTIAL`, `BLOCKED`, `NOT_VERIFIED` có bằng chứng; không dùng label production GO cho code chưa có Word/WPS QA |

## 6. MA TRẬN KIỂM THỬ TỐI THIỂU — KHÔNG THIẾU CA ÂM

| ID | Ca kiểm | Bộ phận | Kết quả cần xác nhận |
|---|---|---|---|
| `T-01` | Tạo mới ND30 có tên loại | header/body/title/footer | Profile ND30; line header và line trích yếu khi áp dụng; TNR14/Exactly19/After6 |
| `T-02` | Công văn ND30 `V/v...` dài và `Kính gửi` nhiều nơi | header/subject/recipient | Không chèn tiêu đề CÔNG VĂN hay line trích yếu sai, định vị `V/v` đúng mẫu, không nhảy trang bất thường |
| `T-03` | Tạo mới HD05 có tên loại | header, `*`, `-----`, body | Tiêu đề 15pt, body14/Exactly19, firstLine567, dấu line đúng hệ |
| `T-04` | Công văn HD05 | header/subject/recipient | `V/v` đúng vùng; dấu `-----` không tự xuất ở nơi không áp dụng |
| `T-05` | Nhập DOCX nguồn sai font/spacing | import/composer/export | Không mất nội dung; field profile đã có phải đổi về profile; không giữ định dạng sai vì “bảo toàn DOCX” |
| `T-06` | Bảng imported **row0 không phải header** | TableModel/roundtrip | 0 `w:tblHeader` sai, không ép bold/center vào row0 |
| `T-07` | Bảng có header thật và 30+ hàng | table/renderer | Repeat Header đúng, 1–3 dòng không bị tách khi khả thi, trang giữa không chồng/cắt chữ |
| `T-08` | Bảng số liệu nhiều cột/profile khóa 13pt | table/optimizer | Không tự hạ 11/10 pt, không xoay landscape trái profile; có thể KEEP/REVIEW |
| `T-09` | Một content table trong DOCX có header và bảng cuối | optimizer adapter | Chỉ content table thay; 2 bảng layout giữ XML/visual đúng profile |
| `T-10` | Bảng phức tạp (merged/nested/multi-section/ảnh) | source/fidelity | Chặn/suggest review, không âm thầm xuất thiếu objects |
| `T-11` | Header stamp có settings ngoài phạm vi | OOXML stamp | Mục không liên quan không mất; candidate identity đúng; nếu không support thì fail-closed |
| `T-12` | `0`, `false`, `""`, thiếu field, `null`, font profile 15,5 | resolver/schema/QA | Không fallback vì falsy; profile font 15,5 → INVALID, không làm tròn |
| `T-13` | Nháp có signTitle nhưng không có ghi chú ký | footer | Không tự thêm `(Ký, đóng dấu)`; không có số/ngày/người ký mới |
| `T-14` | AI trả profile giả, hoặc upload tên cơ quan khớp | import/API | Không tự activate profile; quyết định user mới có hiệu lực |
| `T-15` | Xuất candidate rồi sửa 1 đoạn, tải/preview/print | export/UI | Candidate & PDF cũ stale; không tải/print bản cũ dưới nhãn bản mới |
| `T-16` | Không có WPS, WPS busy, renderer fail | Windows/PDF UI | Thông báo đúng, không ảnh hưởng quyền tải DOCX đủ điều kiện, không báo PASS render |
| `T-17` | Test nguồn lỗi (quan hệ ngoài, field, ảnh, object lạ) | Import/fidelity/security | Không mất source; fail-closed, giữ bản gốc, có hướng xử lý khi không hỗ trợ |
| `T-18` | Hệ khác không chọn profile, fallback ND30/HD05 | resolver/export | Chỉ dùng regime thích hợp, không trộn giá trị, không tự áp profile Công ty |

**Đo bằng chứng thực**: lưu checksum SHA-256 DOCX đầu ra, sample ID (không chứa tên người), profile ID + approved version, regime, role/property, expected/actual OOXML, nguồn giá trị, UI/revision, renderer + version, ảnh trước/sau **chỉ khi được phép**, kết luận từng tiêu chí. `NOT_EVALUATED` không được tính vào PASS. Không “chuẩn hóa” người/địa danh/số ký hiệu từ ví dụ giả.

### Thang nghiệm thu chất lượng tối thiểu

1. **Profile accuracy:** **100% thuộc tính profile trong phạm vi pilot** phải khớp **DOCX cuối**; lệch 1 thuộc tính được khóa → FAIL pilot đó. Không hậu kiểm trị số profile bằng ND30/HD05.
2. **Fallback accuracy:** 100% field fallback đã xác định và áp dụng trong pilot phải thuộc **đúng regime**; không có cả hai nguồn → UNSPECIFIED, không tự bịa.
3. **Content safety:** **0 mất/thêm/đổi nội dung không được duyệt**, bảng/ảnh/field khó không được “bỏ qua yên lặng”; tất cả object cần có coverage/disposition rõ.
4. **Font policy:** 0 cỡ chữ lẻ trong vùng engine định dạng được profile khóa sau OOXML stamp, kể cả style cascade kiểm được; lỗi source profile → INVALID, không làm tròn.
5. **Table:** 0 header repeat giả, 0 phép ép font trái profile; giữ gộp/cell text/row count trong ca hỗ trợ; trường hợp không hỗ trợ → REVIEW.
6. **Visual:** 0 tràn khổ, ký tự bị cắt/chồng, shape lệch master hoặc lỗi orphan rõ trên **những trang đã chụp/đo được**; không suy PASS cho các trang chưa render. Không đặt số phần trăm giống hình giả khi chưa có benchmark.
7. **UX:** Người dùng hiểu bước còn thiếu, có đường quay lại và sửa, không bị ứng dụng tuyên bố ban hành thay người ký/đơn vị.

## 7. THỨ TỰ PHỤ THUỘC / QUY TẮC DỪNG

```text
A01 (source provenance) ─┬─> A02/A03 (master conflicts, nếu có nguồn)
                         └─> B01 (effective resolver) ──> B02/B03 ──> B05/B06
B02 ──> C01/C02 (footer) + C03/C04 (table)
C03/C04 + C06 ──> D01 (optimizer opt-in) ──> D02/D03 ──> D04 (nếu dữ liệu thật)
E01/E02/E04/E05 chạy song song có kiểm thử tập trung
B/C/E xong và pilot đủ chứng cứ ──> F01/F02 ──> F03
```

**Quy tắc dừng:**

- Nếu A02/A03 chưa có golden được phê duyệt: **không sửa số đo hoặc tên tổ chức theo suy đoán**, vẫn tiếp tục B01/B03/C03/E01/E02/E04 độc lập.
- Nếu thử V6.9 với 4–6 case DocForm không cho lợi ích thực tế hoặc làm khó giữ vùng ngoài bảng: **dừng tích hợp optimizer vào đường xuất mặc định**, vẫn giữ như chức năng offline đề xuất.
- Nếu user chưa cho phép exceptions giảm bảng 13→11/10 pt hay trang dọc→ngang: **không thêm ngoại lệ bằng tùy chọn ẩn**.
- Nếu Word/WPS chưa khả dụng: bàn giao **kết quả cấu trúc có giới hạn**, giữ release visual ở `NOT_VERIFIED/NO-GO`, không giấu thiếu bằng chứng.
- Không dùng bảng điểm 100 chưa được chấm/hiệu chuẩn để phán PASS.

## 8. VẬN HÀNH GITHUB — TRÁNH AGENT LÀM TRÙNG/LỆCH MỤC TIÊU

1. **Nguồn chuẩn công việc:** file này ở `docs/roadmap/` + V2.2 policy + `docs/CODEBASE_MAP.md`. Mọi PR ghi ID `DF-Xnn` trong title/body, module, thay đổi, rủi ro, tác động, test, artifacts, quyết định.
2. **Không tạo lại vấn đề đã hoàn thành:** trước mỗi gói kiểm `main` SHA, commit/changelog, test hiện có, status của các gói `KNOWN_DONE`. Dùng đúng file chốt đang có, không lặp cuộc nghiên cứu ND30/HD05 đã xác nhận khi không có thay đổi.
3. **Mỗi PR hướng đến một outcome**, sửa file tối thiểu, test trực tiếp liên quan. Không refactor App.tsx lớn, không thay renderer/export engine toàn phần khi chỉ sửa một field.
4. **Trạng thái issue:** `OPEN`, `IN_PROGRESS`, `BLOCKED_BY_MASTER`, `BLOCKED_EVIDENCE`, `PARTIAL`, `DONE_CODE`, `VERIFIED_OOXML`, `VERIFIED_RENDER`, `ACCEPTED`. **Chỉ ghi ACCEPTED khi có evidence**; `DONE_CODE` không đồng nghĩa sản phẩm hoàn thành.
5. **CI tầng:** cho PR nhỏ `lint` + test diff + contract; cho PR font/export thì parse OOXML ít nhất 4 pilot; cho bảng thì roundtrip/visual relevant; full suite + Win/WPS release trên milestone. Lưu evidence URL, sha, machine/renderer version.
6. **Giao việc liên tục:** nếu một gói bị blocked do cần master, agent chọn gói độc lập còn lại theo dependency thay vì dừng toàn dự án; chỉ hỏi khi thật sự cần quyết định người dùng/cấp phê duyệt.
7. **Không tạo lại bản sao mọi tài liệu Drive trên GitHub public**; chỉ dẫn chiếu tên/phiên bản và thêm hash master khi được phép công bố. Không commit thông tin nhân sự, file nguồn thật hay credential.
8. **Cập nhật kế hoạch sau merge** đúng ID + bằng chứng, không thay kết luận lịch sử. Nếu thay đổi phạm vi lớn, ghi ADR ngắn lý do Reuse vs Rewrite, đo benefit và chi phí kỹ thuật.

### Checklist PR dùng được ngay

```markdown
- [ ] ID gói và kết quả người dùng; nguồn đã chốt/thiếu; SHA base
- [ ] Quy tắc profile-first được giữ; không kiểm profile bằng ND30/HD05
- [ ] Không tự điền chữ ký, dấu, số, ngày, chức danh, nơi nhận
- [ ] Chỉ thay đổi vùng được phép; source unchanged + OOXML diff giải thích
- [ ] Test liên quan PASS (lệnh, count, runner); trường hợp chưa chạy ghi NOT_VERIFIED
- [ ] Nếu chạm DOCX: QA sau stamp trên cả document/style/rel có liên quan
- [ ] Nếu chạm bố cục: Word/WPS/LO evidence và giới hạn renderer
- [ ] Không sửa ngoài phạm vi, không thêm dependency trả phí, không đưa private Drive data
- [ ] Không đổi kết quả P0 đã merge nếu không có regression chứng minh
- [ ] Điều kiện dừng đạt, kết luận PASS/FAIL/PARTIAL/BLOCKED trung thực
```

## 9. NHỮNG VẤN ĐỀ CHƯA ĐƯỢC PHÉP TỰ CHỐT

| Mã | Quyết định đang thiếu | Giữ hành vi an toàn trong khi chờ |
|---|---|---|
| `DEC-01` | Golden ND30 thực sự quyết định ngày tháng **right** hay **center** trong bảng stamp | Giữ phiên bản hiện tại, đánh dấu conflict, test hai đường, **không tự thay** |
| `DEC-02` | Golden ND30 dòng tên Công ty **Exactly15** hay **Exactly16** | Không tự quyết định bằng luật ND30, giữ source hiện hành và đo |
| `DEC-03` | Tên pháp lý/hiển thị tổ chức Đảng được duyệt cho từng loại văn bản và thời điểm | Không copy tên từ profile lịch sử sang mã live |
| `DEC-04` | Footer HD05: role, chữ, font/underline, khoảng cách, khe ký | Các thông số chưa phê duyệt → UNSPECIFIED/QA; không tự nhận 14pt underline đã chốt |
| `DEC-05` | Ngoại lệ H08: khi nào được giảm bảng 13→11/10, xoay ngang và ai duyệt | Giữ 13pt/dọc theo profile; không bật tự động |
| `DEC-06` | Bộ DOCX thật đã khử nhận dạng + môi trường Word/WPS để nghiệm thu | Chỉ đánh giá bằng dữ liệu giả/surrogate và ghi giới hạn |

## 10. BÀN GIAO VÀ BẢNG KIỂM TÌNH TRẠNG TẠI LÚC LẬP KẾ HOẠCH

| Thành phần | Trạng thái |
|---|---|
| Product First / Profile Override Fallback V2.2 | **ĐÃ CHỐT yêu cầu**, đã đưa vào hướng dẫn GitHub |
| PR #1 profile-first P0 | **MERGED**, TypeScript check + 31/31 test liên quan PASS trước sửa font mới |
| HD05 title font 15 pt và test sửa regex | **COMMITTED on main**; chưa có CI mới bao phủ toàn scope để gọi ACCEPTED |
| Registry V1.2 | **NGHIÊN CỨU/ĐẶC TẢ**, không phải registry runtime đầy đủ |
| V6.9 corpus/triage | **SYNTHETIC QA có evidence**, 220/220 manifest, 18/18 nguồn; **NO PRODUCTION GO** |
| HD05 footer, ND30 conflicts, effective registry, WPS visual | **OPEN/BLOCKED**, đúng như ghi ở các gói |
| Kế hoạch này | **TÀI LIỆU THAM CHIẾU CHƯA TRIỂN KHAI CÁC GÓI MỚI**; ghi commit upload sau khi tạo file |

**Kết luận thực hiện:** làm **A01/B01/B03/C01/C03/E01/E02/E04 trước** vì có giá trị và ít phụ thuộc phê duyệt mẫu; chạy A02/A03/C02 đúng lúc có golden. V6.9 opt-in chỉ sau khi đã giải quyết table-role/locked props và pilot thực; Word/WPS visual là cổng nghiệm thu cuối, không phải lý do trì hoãn toàn bộ công việc độc lập.

---

## 11. DẪN CHIẾU CÔNG KHAI VÀ NHẬN DIỆN NGUỒN

**GitHub (public):**
- [Repository DocForm](https://github.com/tranhaihp26-bit/DocForm) — baseline `87cf74c9`.
- [Chính sách V2.2](https://github.com/tranhaihp26-bit/DocForm/blob/main/docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).
- [Audit repository V2.2](https://github.com/tranhaihp26-bit/DocForm/blob/main/docs/DOCFORM_V22_AUDIT_TOAN_BO_REPO_2026-11-06.md).
- [PR #1 đã merge](https://github.com/tranhaihp26-bit/DocForm/pull/1), [CI 31/31](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42308016555).
- [Commit HD05 title font 15 pt](https://github.com/tranhaihp26-bit/DocForm/commit/e1d3c6a161a627be12302e278ea7ffb0b158e03c); [test mới](https://github.com/tranhaihp26-bit/DocForm/commit/c890afc1f60ea87846a71b77990e77185a8285e0); [sửa regex](https://github.com/tranhaihp26-bit/DocForm/commit/87cf74c9b7508d69e9bbca25ff60cf0907341f82).
- [Bản đồ nguồn](https://github.com/tranhaihp26-bit/DocForm/blob/main/docs/CODEBASE_MAP.md) và [đánh giá 02/11](https://github.com/tranhaihp26-bit/DocForm/blob/main/docs/PROJECT_ASSESSMENT_2026-11-02.md) — các kết luận cũ phải so với HEAD mới.

**ChatGPT (tệp nguồn; chỉ ghi tên):**
- `DOCFORM_REGISTRY_OOXML_PROFILE_HTHHMB_ND30_HD05_V1_2_INTEGER_FONT_2026-11-07(1).md`.
- `WORD_TABLE_OPTIMIZER_V6_9_SYNTHETIC_ADMIN_2026-11-07(1).zip` (đặc biệt `README_V69.md`, `BAO_CAO_WORD_TABLE_V6_9_2026-11-07.md`, `admin_batch_v69.py`, `reports/v69_batch/BATCH_RESULTS_V69.json`).
- `NGHIEN_CUU_DOI_CHIEU_DOCFORM_PROFILE_V12_WORD_TABLE_V69_2026-11-07.md`; đề xuất V2.2; báo cáo P0 & audit lịch sử.

**Google Drive (tên/phiên bản, không công khai link private):**
- `BO_RULE_PROFILE_HTHHMB_v1.7.4_CHOT_THEO_NGUOI_DUNG.xlsx`; `v1.7.6_OFFLINE_FULL.xlsx`; `v1.7.7_TICH_HOP_TQA_V17.4_CHUA_DUYET.xlsx`; `v1.8.0_HOAN_THIEN_OFFLINE_CHUA_DUYET.xlsx`.
- `01_PROFILE_CONG_TY.md`; `02_PROFILE_DANG_UY.md`; `HTHHMB-PROFILE.md`; `05_QA_HANDOFF_VA_RANH_GIOI_BANG_v1.0.0`; `11_CTY-CV-01_HO_SO_HOAN_THIEN_NHOM_CONG_VAN_v1.0.0`; `00_MUC_LUC_VA_QUY_TAC_QUAN_LY_PHIEN_BAN_HTHHMB`.

**Giới hạn chủ động:** không phân tích đầy đủ từng byte ảnh/PDF/DOCX của Drive riêng tư, không chạy WPS/Word trên máy người dùng, không thực hiện tấn công bảo mật thực tế, không chấm luật pháp ở ngoài phạm vi cấu hình sản phẩm. Các mục như vậy được ghi minh bạch là cần evidence, **không suy thành PASS**.
---

## 12. TIẾN ĐỘ TRIỂN KHAI SAU AUDIT — 07/11/2026

> Phần 0–11 là **snapshot gốc** tại commit `87cf74c9`. Các thay đổi dưới đây là nhật ký tiến độ, không sửa lại kết luận lịch sử. GitHub `main` đã tiến lên sau đó.

| Gói | Trạng thái | Kết quả thực hiện | Bằng chứng |
|---|---|---|---|
| **DF-C01** | **DONE_CODE + VERIFIED_OOXML_FOCUSED** | Bỏ việc tự thêm dòng `(Ký, đóng dấu)` khi chỉ có `signTitle`; nếu dòng ghi chú đã được đưa vào `signTitle`, xuất đúng **một** lần, giữ chữ, in nghiêng; không thay bảng chữ ký/layout phần cuối | [PR #2](https://github.com/tranhaihp26-bit/DocForm/pull/2), [commit `b8d825bf`](https://github.com/tranhaihp26-bit/DocForm/commit/b8d825bfe63ac733286535bcef2197058b52520f) |
| **DF-C03** | **DONE_CODE + VERIFIED_OOXML_FOCUSED** | `buildDocxTableFromModel` chỉ set `w:tblHeader` khi `row.isHeader===true`; nhánh comparator không tự sửa `rowIndex=0`. Đã có negative test chèn `tblHeader` giả và kiểm roundtrip từ chối | Cùng PR #2/commit |
| **DF-A01** | **PARTIAL_SOURCE_MAPPED** | Đã tạo [ma trận nguồn, role, property, xung đột và trạng thái phê duyệt](../profile/PROFILE_SOURCE_MATRIX.md) cho bốn đường pilot. Không đổi JSON/master profile. Chưa hoàn tất 100% roles sau stamp và chưa Word/WPS sign-off | [Tệp `docs/profile/PROFILE_SOURCE_MATRIX.md`](../profile/PROFILE_SOURCE_MATRIX.md), commit `6fbe26a6` |
| **DF-A02/DF-A03** | **BLOCKED_BY_MASTER** | ND30 header.date right/center và issuer.line 15/16; biến thể tên đơn vị HD05 | Không tự giải bằng fallback; cần golden có SHA/approval |
| **DF-A04** | **DONE_CODE + CI_VERIFIED_FOCUSED** | Resolver kiểm tra 0/false/""/null, conflict, fonts invalid, fallback và regime | [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3), [nhật ký](../sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md) |
| **DF-B01** | **PARTIAL_IMPLEMENTED + CI_VERIFIED_FOCUSED** | Resolver per-property có provenance, nối một consumer thật `body.fontSizePt` trong composer. Các role khác thuộc B02/B03 vẫn mở | [merge `cf5fb619`](https://github.com/tranhaihp26-bit/DocForm/commit/cf5fb6190a1bd06db9da846039ad6eebd75e027c), [CI 26/26](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367558), [CI 31/31](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367566) |
| **DF-C02/C04 và B02–B06** | **OPEN** | Chưa triển khai trong sprint này | Chỉ tiến hành phần không bị A02/A03 chặn |

**CI scope của PR #2:** GitHub Actions Ubuntu/Node 22 chạy `npm run lint` **PASS**, 15/15 tests **PASS**, 0 skipped/failed: [run 42332869724](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42332869724). Đây là test OOXML/code, **không** chứng minh Word/WPS trực quan đã PASS; workflow vẫn dùng `npm ci --legacy-peer-deps` vì DF-E04 còn OPEN.

**Kế hoạch thực hiện tiếp, không lặp lại DF-C01/DF-C03:**

1. Tiếp tục **DF-B02** để nối những thuộc tính đã có nguồn vào exporter và OOXML QA; DF-B01 đã có resolver nhỏ + ca dữ liệu âm/dương, không tạo lại. Không dùng master đang conflict.
2. Kết nối resolver vào các consumer thực (**DF-B02/B03**) theo từng role đã được ánh xạ. Test hai chế độ và trường hợp profile chưa xác nhận; không refactor exporter toàn phần.
3. Xử lý phần độc lập **DF-E01/E02** sau khi đánh giá source-trust/candidate states. Cấu hình chưa duyệt giữ `REQUIRES_REVIEW`.
4. **DF-C02**, **DF-A02/A03** chỉ mở khi có golden/master đúng phiên bản; với WPS/Word thì báo `NOT_VERIFIED_RENDER` khi chưa kiểm.

**Quy tắc tiếp tục:** không lặp test/QA đã PASS nếu code liên quan không đổi; không chuyển `DONE_CODE` thành `ACCEPTED` khi chưa nghiệm thu trên file và renderer thực.


### Cập nhật trạng thái GitHub — 07/11/2026

Các PR dưới đây vẫn là bản nháp mở; chưa merge. Trạng thái phản ánh bằng chứng code/tài liệu, không phải nghiệm thu sản phẩm.

| Gói | Trạng thái hiện tại | Bằng chứng publication và giới hạn |
|---|---|---|
| **DF-A01** | **PARTIAL_SOURCE_MAPPED** | [PR #44](https://github.com/tranhaihp26-bit/DocForm/pull/44), nhánh `codex/g01-a01-sources-20261107`; A02/A03 vẫn BLOCKED_BY_MASTER; không có Word/WPS/UAT. |
| **DF-B03** | **DONE_CODE + CI_VERIFIED_FOCUSED** | [PR #37](https://github.com/tranhaihp26-bit/DocForm/pull/37); focused audit local 2/2; current-head GitHub Actions 42367294809, 42367294801, 42367294808 thành công. Chưa nối vào DOCX hậu stamp và chưa Word/WPS/UAT. |
| **DF-B04** | **DONE_CODE; render NOT_VERIFIED** | [PR #45](https://github.com/tranhaihp26-bit/DocForm/pull/45); local settings 10/10, header 5/5, export-candidate 6/6, lint PASS. Không có workflow run trên head tại lúc kiểm; Word/WPS/UAT chưa chạy. |
| **PA-01** | **BASELINE_DOCUMENTED / NOT_VERIFIED_UAT** | [PR #46](https://github.com/tranhaihp26-bit/DocForm/pull/46); bổ sung phạm vi/bằng chứng, không thay Support Matrix hoặc xác nhận hỗ trợ end-to-end. |
| **PA-02/PA-03** | **BASELINE_TEMPLATE_DOCUMENTED / NOT_VERIFIED_UAT** | [PR #46](https://github.com/tranhaihp26-bit/DocForm/pull/46); chưa chạy UI, Office hoặc người dùng thật. |
| **PA-05** | **GUIDE_DRAFT / NOT_VERIFIED_UAT** | [PR #47](https://github.com/tranhaihp26-bit/DocForm/pull/47); storage 6/6 và synthetic preview/print 1/1 local; hai test failure đã được nêu trong PR; browser recovery thực, Word/WPS và UAT chưa xác minh. |

Session index: [GitHub publication log](../sessions/2026-11-07_github-publication.md) · [PR #48](https://github.com/tranhaihp26-bit/DocForm/pull/48). No release, M1/M2, rendering, or acceptance gate is marked complete by these draft PRs.

## 13. QUY TẮC ĐIỀU HÀNH XUYÊN PHIÊN (BẮT BUỘC)

Đọc [Project Memory](../PROJECT_MEMORY.md) và [Project Session Protocol](../PROJECT_SESSION_PROTOCOL.md) **trước khi mở task**, so ID/status/bằng chứng đã hoàn thành với HEAD hiện hành; chỉ thực hiện việc còn phục vụ **mục tiêu cuối người dùng** và có tiêu chí dừng. Sau PR/đợt sửa, lưu nhật ký tại `docs/sessions/` với commit, file, test, kết quả thực, điều chưa xác minh và bước kế tiếp; cập nhật memory và đúng dòng trạng thái trong roadmap. Mọi kết luận về Word/WPS chưa kiểm phải ghi `NOT_VERIFIED_RENDER`. Không đặt việc ghi nhớ như lý do chạy full test hay mở rộng scope.


## 14. BÀN GIAO DF-A04/B01 — BỘ NHỚ DỰ ÁN ĐÃ KÍCH HOẠT (07/11/2026)

**Đã merge [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3)**: commit `cf5fb6190a1bd06db9da846039ad6eebd75e027c`. Chi tiết thay đổi, bằng chứng typecheck, [CI 26/26](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367558), [CI 31/31](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367566), hạn chế và tiếp quản được ghi tại [session log 07/11/2026](../sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md).

**Cổng vận hành bắt buộc từ phiên này:** trước sửa đọc [Project Memory](../PROJECT_MEMORY.md), xác nhận ID/mục tiêu cuối của roadmap và SHA/test còn hiệu lực; sau sửa ghi nhật ký phiên, cập nhật index + trạng thái gói, commit lên GitHub, không chỉ báo trong chat. Xem [quy trình chính thức](../PROJECT_SESSION_PROTOCOL.md). **Chưa nghiệm thu** Word/WPS toàn diện, chưa phát hành production.

---

## 15. MỤC TIÊU CUỐI VÀ PHẠM VI BÀN GIAO — CẬP NHẬT V2.0

### 15.1. Nguồn yêu cầu sản phẩm duy nhất

[DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md](../product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md) là **Product Charter/Acceptance Contract**; đường phát triển các 29 gói A–F và sáu lớp PA trong tài liệu này chỉ là **phương tiện thực hiện**. Không sao chép charter thành nhiều bản mâu thuẫn; khi đổi mục tiêu phải ghi quyết định, sửa charter rồi mới sửa roadmap tương ứng.

**Kết quả cuối cùng:** nhân viên văn phòng không biết công nghệ có thể tự tạo hoặc nhập DOCX/TXT, chọn/xác nhận ND30/HD05 và profile, sửa được các vùng đã công bố, chuẩn hóa, tải DOCX thật sự chỉnh sửa được, tiếp tục công việc sau khi gián đoạn, và biết phải làm gì nếu gặp tài liệu chưa hỗ trợ; không cần AI, không tự điền số/ngày/ký/dấu, không mất nội dung. Văn bản theo profile Công ty phải đúng **từng thuộc tính đã cấu hình** trên file hậu stamp; không đối chiếu/hậu kiểm bằng ND30/HD05 với field đã SET.

### 15.2. Các mức bàn giao và ranh giới bắt buộc

| Mức | Phạm vi sản phẩm | Điều kiện tối thiểu |
|---|---|---|
| M0 — TECHNICAL CANDIDATE | Có mã và test kỹ thuật; dùng để phát triển | CI/OOXML có bằng chứng; không hứa ứng dụng nhân viên văn phòng sẵn dùng |
| M1 — CONTROLLED MVP/PILOT | Chỉ các loại và chức năng có dòng SUPPORTED_END_TO_END trong ma trận; review/blocked hiển thị đúng | S/T/U-pilot/R của Charter đạt trong scope; 4 tuyến pilot có kịch bản người dùng, DOCX có Word/WPS thật, profile master được chốt cho ca định dùng |
| M2 — COMPLETE DAILY-USE PRODUCT | Sản phẩm phục vụ hàng ngày trong **phạm vi loại văn bản/công cụ Office đã công bố**, không phải clone Word | S/T/U/R/O/C đạt; 0 blocker P0 ở scope phát hành; cài mở, phục hồi, trợ giúp, offline và bảo trì có bằng chứng |

**Không suy M2 nghĩa là hỗ trợ tất cả các mẫu trong kho HTHHMB hay mọi tính năng DOCX của Microsoft Word.** Muốn mở rộng type/role nào phải nâng Support Matrix và corpus có thử.

### 15.3. Các cổng kết quả người dùng thay cho đếm issue

| Cổng | Người dùng nhìn thấy | Bằng chứng |
|---|---|---|
| Gate S — Scope | Biết rõ loại văn bản và phần nào sửa được; không quảng bá quá năng lực | Support Matrix có regime/type/action/Office/version/status |
| Gate T — Trust & fidelity | Không mất nội dung, đúng profile trên DOCX hậu stamp, file đúng revision | Source SHA, candidate SHA, role→expected→actual OOXML, fidelity report |
| Gate U — Usability/task success | Tự làm xong ba bước, biết xử lý cảnh báo, không cần developer ở tác vụ thường | User pilot/UX-01–13, hành trình U-01–U-12, số bước/thời gian/lỗi |
| Gate R — Office/render | DOCX thực sự mở và chỉnh trên công cụ Office đã chọn; pagination/shape/line đúng mẫu | Version Word/WPS/LO, trang đầu–giữa–cuối, hash, visual QA |
| Gate O — Operation/recovery | Mở app thuận tiện, dùng manual offline, lưu/mở lại, xử lý lỗi PDF | Máy sạch + restart + lưu/khôi phục + network/renderer |
| Gate C — Release/continuity | Có hướng dẫn, rollback, release notes, evidence, Project Memory | Bản bàn giao, log phiên/commit/CI, help & support checklist |

**Quy tắc tuyệt đối:** Gate T không được lấy tỷ lệ trung bình để cho qua lỗi mất nội dung/profile. Gate U phải đo bằng người dùng mục tiêu; Gate R không được thay bằng mock hoặc render HTML; Gate O phải đo trên mô hình cài đặt được chọn.

## 16. SÁU BỘ CÔNG VIỆC NGHIỆM THU SẢN PHẨM — PA-01 ĐẾN PA-06

Đây là **sáu acceptance workstreams, không phải sáu gói refactor/tính năng tự động phát sinh**. Mỗi PA kế thừa các DF đã có, không tái xây test đã chạy; chỉ mở issue khi đầu ra thiếu.

### PA-01 — Ma trận phạm vi release và năng lực thật (P0)

**Liên kết:** DF-A01, DF-B05, DF-C04/C06, DF-F03; Product Charter §4.  
**Đầu ra bắt buộc:** docs/product/PRODUCT_SUPPORT_MATRIX.md (tạo khi bắt đầu PA-01) với một dòng cho **mỗi regime × loại văn bản × hành động tạo/nhập/sửa/xuất × nhóm đối tượng/Office**, và nhãn SUPPORTED_END_TO_END / SUPPORTED_WITH_REVIEW / READ_ONLY_SOURCE / UNSUPPORTED / NOT_VERIFIED / BLOCKED_BY_MASTER. Ghi version/source/case ID, người xác nhận và đường xử lý nếu không hỗ trợ.

**Làm ngay không chờ chủ sở hữu master:** điền trạng thái dự kiến và chưa xác minh cho bốn tuyến pilot (ND30 có tên loại, ND30 công văn, HD05 có tên loại, HD05 công văn). **Tuyệt đối không biến dự kiến thành SUPPORTED_END_TO_END** nếu thiếu Word/WPS/UAT/golden.

**DoD:** 100% *loại và hành động định quảng bá ở M1/M2* đều có kết luận có bằng chứng; ca ngoài scope có giới hạn công khai. **Mốc:** khởi động trước/đồng thời DF-B02; khóa phát hành tại DF-F03.

### PA-02 — Người dùng tự hoàn thành hành trình ba bước (P0)

**Liên kết:** DF-E06, DF-E02, DF-F01/F03; dùng lại [UX-01–UX-13](../DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md) thay vì viết lại.  
**Đầu ra:** baseline workflow hiện tại và bảng UAT gồm người dùng không phải developer, kịch bản, loại file, thời gian, thao tác, số lần hỏi giúp đỡ, số thao tác sai/tải nhầm, trạng thái kết quả; kèm ảnh/ghi chép có phép.

**Thử sớm:** ít nhất 4 hành trình chuẩn (tạo ND30, tạo HD05, import-sửa-xuất, DOCX bảng); thêm trường hợp mâu thuẫn profile, nguồn/khối không hỗ trợ, candidate stale và mất PDF. Tập pilot tiết kiệm ban đầu **đề xuất** khoảng 5 người và 8–12 tệp; đó không phải số đã đo hay chuẩn thống kê. Chỉ định **ngưỡng hoàn thành/độ thuận tiện trước vòng UAT cuối** sau khi có baseline. Riêng sai phạm INV (mất dữ liệu, AI không consent, stale) luôn yêu cầu 0.

**DoD:** người dùng đại diện **tự tìm thấy và thực hiện hành động cần thiết**, biết xem cảnh báo và làm xong DOCX trong scope; có số liệu và phản hồi thực; không thay bằng UI screenshots hoặc unit tests. **Mốc:** bắt đầu song song DF-B02, đánh giá lại tại DF-E06/F03.

### PA-03 — Ma trận sửa được thực sự trong Editor (P0)

**Liên kết:** DF-B02/B05, DF-C04/C06, DF-E06; Product Charter §7.  
**Đầu ra:** bản đồ từng role (text, subject, V/v, Kính gửi, số/ngày, người ký, nơi nhận, bảng đơn giản, ô gộp, ảnh, field, textbox, header/footer, phụ lục) với EDITABLE / REVIEW_ONLY / READ_ONLY_SOURCE / UNSUPPORTED và bằng chứng **thao tác UI → lưu → xuất DOCX → mở Office kiểm thay đổi**. Tách giá trị profile bị khóa khỏi nội dung người dùng có thể điền.

**DoD:** không có nút sửa giả; dữ liệu đã chấp nhận được ghi qua revision và xuất đúng; cảnh báo đúng cho vùng không hỗ trợ. Bảng đơn giản có ít nhất một ca nhập và một ca tạo mới trong scope. **Mốc:** trước nghiệm thu DF-C04/DF-E06 và PA-06.

### PA-04 — Cài đặt, mở ứng dụng, làm việc không AI và sự cố môi trường (P1)

**Liên kết:** DF-E03/E04/E05, DF-F01/F03.  
**Đầu ra:** ghi ADR gọn chọn **mô hình phân phối thực tế** (local webapp + launcher/Windows wrapper/webapp nội bộ IT quản trị) theo nhu cầu người dùng, không mặc định Electron hay EXE. Danh sách OS/Office/renderer/version được cam kết, kịch bản máy sạch install/start/restart/update/rollback, trạng thái no-network/no-AI và lỗi WPS/PDF.

**DoD M2:** một người văn phòng sử dụng cách mở công bố, không phải chạy lệnh npm hoặc chỉnh env để làm tác vụ thường; DOCX đủ điều kiện không bị chặn bởi PDF renderer tùy chọn; hoạt động offline đúng phạm vi đã cam kết. **Mốc:** quyết định trước DF-F01, nghiệm thu cuối DF-F03.

### PA-05 — Duy trì công việc, phục hồi và trợ giúp (P1)

**Liên kết:** DF-E02/E06, DF-F03, UX-10 và §16–19 UX spec.  
**Đầu ra:** test nguồn/lưu nháp/reload/mất lưu trữ, lỗi import/export, thay nguồn/hủy, thay regime/profile/revision, bản ứng viên cũ, khả năng tải nguyên nguồn. Chọn cơ chế **backup/export draft vừa đủ** hoặc ghi hạn chế phục hồi rõ; không tự triển khai đồng bộ cloud. Có hướng dẫn ngắn ba bước, bảng lý do REVIEW/BLOCKED/NOT_EVALUATED, cách xử lý PDF/WPS lỗi.

**DoD:** ứng dụng không báo đã lưu khi ghi thất bại; người dùng biết cách tiếp tục/khôi phục theo mô hình thực; không mất draft ở ca đã công bố hỗ trợ. **Mốc:** trước DF-F03, thực hành cùng PA-02 sớm.

### PA-06 — Corpus nghiệp vụ, DOCX editable và nghiệm thu tương thích thật (P0 release gate)

**Liên kết:** DF-C04/C06, DF-E03, DF-F02/F03.  
**Đầu ra:** hai tập mẫu có quyền sử dụng, đã ẩn danh: (a) **common-supported** theo Support Matrix; (b) **complex/review** (merge/nested/multisection/image/field/unknown); kèm expected/actual, source/candidate SHA, Office/version và video/ảnh kiểm khi được phép. Đo tỷ lệ hoàn thành end-to-end, nguyên nhân review/blocked, số phần phải sửa lại, giữ bản gốc. Mẫu M1 phải có đủ bốn tuyến pilot nằm trong scope; mẫu M2 mở rộng theo từng loại được công bố.

**DoD:** đầu ra **mở được, sửa tiếp được, không sai profile/không mất nội dung** trên bản Office đã cam kết; nếu unsupported thì chặn/đối chiếu đúng, không bỏ lặng lẽ. Thiếu Word/WPS thực → NOT_VERIFIED_RENDER và **không GO cho M1/M2 cần hình thức Word**. **Mốc:** DF-F02 và quyết định DF-F03.

## 17. PHÂN BIỆT “ĐỦ CODE” VỚI “NGƯỜI DÙNG DÙNG ĐƯỢC”

| Thành phần | Chỉ kiểm code/OOXML có đủ không? | Phải bổ sung gì trước M1/M2? |
|---|---|---|
| Chọn profile/nhập tài liệu | Không | Người dùng hiểu quyết định; profile không tự áp; nguồn còn nguyên; phân vùng có thể đối chiếu |
| Editor thân/tiêu đề/bảng | Không | Sửa được dữ liệu đúng role; xuất thấy sửa; không có nút sửa giả (PA-03) |
| Export DOCX | Không | Cùng revision, mở Word/WPS sửa được, không cần sửa lại hình thức profile (PA-06) |
| QA rules/fidelity | Không | PASS chỉ tính trên thuộc tính có evidence; unsupported xử lý rõ; không nhầm pháp lý |
| WPS/LibreOffice/PDF | Không | Kiểm Office/version thật; PDF tùy chọn, không hứa tương đồng tuyệt đối (PA-04/06) |
| Lưu nháp | Không | Restart/reload, lỗi quota, phục hồi/cảnh báo đúng thực tế (PA-05) |
| Tính năng AI | Không | Consent và ranh giới dữ liệu; không AI vẫn hoàn thành tác vụ (PA-02/04) |
| Đóng gói/triển khai | Không | Máy sạch, user thường tự mở và hoàn thành (PA-04) |
| Hướng dẫn/trợ giúp | Không | Nội dung ngắn, action-oriented theo lỗi thật (PA-05) |

**Ưu tiên hiệu quả:** đầu tiên thực hiện phần thay đổi liên quan trực tiếp đến blocker người dùng; không đưa đủ mọi chức năng Word vào scope hoặc kéo DF-D01–D04/V6.9 vào đường mặc định. Optimizer chỉ opt-in khi pilot chứng minh có giá trị thực với bảng được phép.

## 18. LỊCH TRIỂN KHAI TÍCH HỢP — THAY CHO HAI ROADMAP SONG SONG

**Mỗi hàng là một checkpoint kết quả**, không phải sprint thời gian cố định; thứ tự có thể điều chỉnh theo dependency nhưng không bỏ gate sản phẩm.

| Chặng | Ưu tiên thực hiện | Bằng chứng kết thúc chặng | Không làm |
|---|---|---|---|
| **0. Chốt phạm vi & baseline** | PA-01 dự thảo ma trận; PA-02 test baseline 3 bước; PA-03 khảo sát Editability; tiếp quản Project Memory | Support Matrix v0, danh sách hành trình, baseline thao tác, mọi điểm NOT_VERIFIED ghi rõ | Không chờ xong engine rồi mới gặp người dùng |
| **1. DOCX đáng tin cậy** | DF-B02/B03; nhánh DF-B05/B06 không conflict; DF-E01 bảo vệ trusted profile; DF-E02 trạng thái ứng viên | DOCX 4 tuyến có OOXML hiệu lực và nguồn/byte đúng; test âm; không vi phạm INV | Không thay master A02/A03 khi chưa duyệt |
| **2. Editor và bảng dùng được** | DF-C02/C04/C05/C06; PA-03 và PA-02 vòng 1; sửa đúng lỗi usability phát hiện | Ma trận editability có thực chứng, bảng đơn giản xuất được, vùng lạ có lối thoát | Không tối ưu mọi bảng phức tạp theo V6.9 vô điều kiện |
| **3. Vận hành & phục hồi** | DF-E03/E04/E05/E06 + PA-04/PA-05; PA-06 corpus được phép | Cold start, offline/manual, draft recovery, lỗi PDF, UI người dùng và Office smoke | Không triển khai cloud/multiuser khi không có nhu cầu |
| **4. M1 nghiệm thu pilot** | DF-F01/F02/F03 scope M1 + Gate S/T/U/R; chủ thể profile master tương ứng được duyệt | Biên bản nghiệm thu M1 kèm danh mục supported, nguồn, Office/version và UAT | Không công bố sản phẩm hoàn thiện toàn diện |
| **5. M2 hoàn thiện có kiểm chứng** | Mở rộng scope theo PA-01 sau M1, PA-06 với các loại thêm, Gate O/C, các lỗi thực tế | Release M2 qua S/T/U/R/O/C, hướng dẫn/rollback/version/hỗ trợ | Không suy M2 = mọi loại DOCX có thể sửa |

**Phụ thuộc quan trọng:** A02/A03 thiếu master → **chặn kết luận SUPPORTED_END_TO_END cho loại phải dùng giá trị đó**, không chặn PA-02 baseline, PA-03 ma trận, DF-B02 property khác, E01/E02, E04/E05, UX, backup. Thiếu Office thực → phát hành chỉ technical candidate, không “visual PASS”.

## 19. HỒ SƠ BẰNG CHỨNG CHO TỪNG CỔNG

Mỗi dòng nghiệm thu cần: ID ca/loại, source giả lập hoặc được phép, profile/regime và approval version, user task và bước, expected, actual, hash DOCX, sửa được hay không, vùng bị REVIEW, Word/WPS/LO/version và ảnh khi được phép, CI/commit, kết luận PASS/FAIL/NOT_VERIFIED, người thực hiện và ngày. Không đưa tài liệu nội bộ thật lên repo public.

| Điều kiện release | M1 | M2 | Quy tắc FAIL |
|---|---|---|---|
| Profile-first đúng trong scope | Bắt buộc 100% field hiệu lực | Bắt buộc 100% field hiệu lực | Một field SET bị ép fallback hay khác OOXML cuối |
| An toàn nội dung, dữ liệu, consent | 0 vi phạm INV-01–INV-08 | 0 vi phạm INV-01–INV-08 | Bất kỳ mất nội dung, nhầm candidate, gửi AI trái phép |
| Bảng/khối được hỗ trợ | Có test đúng ca và coverage | Mở rộng theo phạm vi công bố | Tự bỏ object, làm sai merge, tạo repeat header giả |
| Word/WPS thực | Kiểm mẫu M1 đúng Office/version | Kiểm corpus M2 | Chỉ có HTML, mock hoặc surrogate mà gọi đạt Word |
| UX user journey | Có người dùng mục tiêu thực hiện được cả tuyến M1; ghi baseline | UAT theo scope, ngưỡng khóa trước test cuối | Người dùng thường không thể hoàn thành, hoặc tải nhầm |
| Editor editability | Các trường M1 đã cam kết chỉnh được thật | Các trường M2 đã cam kết chỉnh được thật | UI cho sửa nhưng DOCX không mang thay đổi |
| Lưu nháp và phục hồi | Không gian lận trạng thái lưu, có đường tải nguồn/khôi phục tối thiểu | Backup/recovery theo mô hình phát hành đã công bố | Nhầm “đã lưu” hoặc mất công việc ở ca cam kết |
| Vận hành/nhận trợ giúp | Có lối truy cập trong pilot | Máy sạch, tự mở, offline/manual và help/rollback | Bắt người dùng văn thư sửa mã/chạy dev command |

**Gợi ý đo ban đầu:** khoảng 5 người làm văn thư và 8–12 tài liệu đại diện để tìm vấn đề; **chưa đặt ngưỡng 90%/tối ưu thời gian như kết quả thực**. Ghi baseline rồi khóa target trước UAT cuối. 0 lỗi nghiêm trọng là điều kiện ngay lập tức, không cần chờ baseline.

## 20. CHỈ DẪN CỤ THỂ CHO AGENT THỰC HIỆN

**Trước mỗi PR:** đọc [Project Memory](../PROJECT_MEMORY.md) → Product End State → Master Roadmap (ưu tiên **phần 15–21 và trạng thái 12–14**, chi tiết gói tại phần 5) → [Profile Source Matrix](../profile/PROFILE_SOURCE_MATRIX.md) khi chạm định dạng → đúng AGENTS theo thư mục. Trong mô tả PR ghi: **DF-ID + PA-ID liên quan + kết quả người dùng + what is already done + smallest change + focused tests + stop rule**.

**Trong PR:** chỉ thêm test từ hành trình người dùng mà thay đổi có ảnh hưởng; không chạy full canonical vì một sửa nhỏ, không làm lại các case đã PASS nếu code chưa đổi. Trạng thái phải tách DONE_CODE, VERIFIED_OOXML, VERIFIED_RENDER, UAT_VERIFIED, ACCEPTED; đổi thuật ngữ không biến nó thành PASS.

**Sau PR/đợt docs:** [Project Session Protocol](../PROJECT_SESSION_PROTOCOL.md) yêu cầu append-only log tại docs/sessions, cập nhật [Project Memory](../PROJECT_MEMORY.md) và trạng thái đúng gói/PA, ghi SHA/CI/Word UAT/no-proof và bước ưu tiên tiếp theo; commit lên GitHub. Không đăng dữ liệu Drive private/hồ sơ thật lên repository public.

**Quy tắc dừng:** khi một việc không gắn trực tiếp DF-ID còn thiếu, PA-ID hoặc nhu cầu mới đã chốt thì **dừng mở rộng**; khi field profile có conflict thì giữ hiện hành và chặn chỉ đúng phạm vi; khi sản phẩm đã đạt gate scope mục tiêu thì không tự đầu tư optimizer/rewrite chỉ để tăng độ phức tạp.

## 21. DANH SÁCH ƯU TIÊN NGAY SAU TÀI LIỆU V2.0

1. **PA-01 — tạo bản ma trận scope**, đánh dấu tất cả bốn tuyến pilot là NOT_VERIFIED hoặc BLOCKED nếu còn thiếu golden/UAT; không chờ code.
2. **DF-B02 — nối resolver per-property** cho body/paragraph/table role đã được duyệt; mỗi consumer có expected→actual DOCX và một ca thao tác. Không làm lại DF-B01.
3. **PA-02/PA-03 — baseline người dùng và khả năng sửa**, tận dụng UX-01–13, không mở dự án UI mới; ghi rõ nút nào hiện chỉ xem.
4. **DF-E01/E02 — chống AI giả profile, candidate stale**, bảo đảm UX/cổng xuất đúng; tiếp nối P0 đã hoàn thành.
5. **DF-C02/C04/C06 + A02/A03 nếu đã có mẫu**; những trường conflict không được tự quyết.
6. **DF-E03/E04, PA-04/PA-05/PA-06**, rồi F01/F02/F03 theo scope M1→M2.

**Trạng thái tại commit cập nhật kế hoạch:** đây là tài liệu đặc tả và lộ trình. Đã có DF-C01/C03/A04 DONE_CODE theo Project Memory và DF-B01 PARTIAL; **PA-01–PA-06 chưa có UAT/Office/end-user evidence**, không gọi M1/M2 PASS. Master Roadmap V2.0 vẫn giữ đầy đủ 29 gói kỹ thuật cũ và không thay đổi cấu hình profile thực tế.


## 22. ISSUE BACKLOG TRÊN GITHUB — ĐÃ TRIỂN KHAI DANH SÁCH CÔNG VIỆC (07/11/2026)

**[Bảng điều phối 32 issue song song](DOCFORM_ISSUE_EXECUTION_BOARD_2026-11-07.md)** là mapping chính thức từ mỗi DF-ID/PA-ID đến GitHub issue #4–#35 và EPIC [#36](https://github.com/tranhaihp26-bit/DocForm/issues/36). **29 gói DF cũ:** DF-A04, C01, C03 đã có code/test nên không tạo issue mới; **26 gói còn lại + sáu luồng PA** đã được tạo issue với DoD/ràng buộc. Không đồng nghĩa code đã hoàn thành.

**W0 triển khai độc lập:** #7 B02, #8 B03, #9 E01, #10 E02, #11 E04, #22 C06; các lane chứng cứ #4/#5/#6/#12/#16/#33/#34/#35 song song. Tránh chỉnh trùng `docxExport.ts`, `App.tsx`, `server.ts`, `package-lock.json`. **Đang BLOCKED_BY_MASTER:** #13 A02 và #14 A03; không tự suy đoán. **D01–D04 tùy chọn** theo GO/NO-GO, F01–F03 chỉ ở release gate.

**Sau mỗi phiên:** lưu thay đổi/kiểm thử vào issue comment + `docs/sessions/` + [Project Memory](../PROJECT_MEMORY.md); ghi trạng thái thực và việc còn lại, không tính issue “OPEN” là test FAIL hay “CLOSED” là UAT PASS nếu bằng chứng chưa đủ.

## 22. CẬP NHẬT SAU TÍCH HỢP GITHUB — 07/11/2026

> Mục này **cập nhật trạng thái hiện hành** sau bản ghi publication của phần trước; những dòng “Draft/unmerged” trong snapshot lịch sử vẫn đúng **tại thời điểm publication**, không dùng làm trạng thái hiện hành.

| Gói/trục | Bằng chứng tích hợp | Trạng thái sau lượt này | Cổng vẫn thiếu |
|---|---|---|---|
| DF-E05 (#28) | [PR #38](https://github.com/tranhaihp26-bit/DocForm/pull/38) **MERGED** `463561a`; local focused 41/41 PASS | `INTEGRATED_CODE / PARTIAL` | CI riêng cho upload security chưa có, chưa có Office/UAT; DF-E01 (#9) vẫn deferred |
| DF-C06 (#22) | [PR #42](https://github.com/tranhaihp26-bit/DocForm/pull/42) **MERGED** `9373b803`; focused 48/48 và workflow `42362321800` PASS | `INTEGRATED_CODE / FOCUSED_VERIFIED` | DOCX thực, Word/WPS/UAT, source-preservation gate |
| DF-A01 (#12) | [PR #44](https://github.com/tranhaihp26-bit/DocForm/pull/44) **MERGED** `373ce2b7` | `INTEGRATED_DOCS / PARTIAL_SOURCE_MAPPED` | A02/A03 profile conflicts & approval còn blocker |
| PA-01/02/03 (#4/#5/#6) | [PR #46](https://github.com/tranhaihp26-bit/DocForm/pull/46) **MERGED** `3ca6a276` | `INTEGRATED_DOCS / NOT_VERIFIED_UAT` | Hành trình thật, editable Office, hỗ trợ end-to-end |
| DF-B03 (#8) | [PR #37](https://github.com/tranhaihp26-bit/DocForm/pull/37) **OPEN / DRAFT**, diverged, 3 Actions head cũ PASS | `NOT_INTEGRATED` | Đồng bộ branch, kiểm post-stamp role/font, Office/UAT |
| DF-E03 + PA-06 (#27/#35) | [PR #43](https://github.com/tranhaihp26-bit/DocForm/pull/43) **OPEN / DRAFT**, synthetic local 16/16 | `NOT_INTEGRATED` | CI trên branch mới, render pipeline và Office/visual/UAT |
| DF-B04 (#16) | [PR #45](https://github.com/tranhaihp26-bit/DocForm/pull/45) **OPEN / DRAFT** | `NOT_INTEGRATED` | Word/WPS settings fidelity, UAT |
| PA-05 (#34) | [PR #47](https://github.com/tranhaihp26-bit/DocForm/pull/47) **OPEN / DRAFT** | `GUIDE_DRAFT / NOT_VERIFIED_UAT` | Hai test failures cũ; manual/browser-process recovery |
| G00 / continuity | [PR #48](https://github.com/tranhaihp26-bit/DocForm/pull/48) đang cập nhật Project Memory, Roadmap và log | `IN_PROGRESS` cho đến khi merge #48 | Không suy từ merge docs sang release M1/M2 |

**Main sau tích hợp:** `3ca6a2761d238cb29e301c97e26f166653b2199e` (sau PR #46). **Không có test local, DOCX pilot thật hoặc Word/WPS/UAT mới** trong lượt merge này. Các kết quả CI/test trên là bằng chứng từ PR head trước merge; không nâng thành nghiệm thu toàn hệ thống. Giữ các issue mở nếu thiếu gate.

**Log chi tiết và thứ tự tiếp:** [2026-11-07 GitHub integration follow-up](../sessions/2026-11-07_github-integration-followup.md). Tiếp theo đồng bộ #37 (branch diverged và diff lịch sử), rồi #43, #45, #47 theo điều kiện test/Office/UAT. Chỉ kiểm lại đúng scope sau khi đồng bộ; canonical full tại release gate.

### 22.1. Chốt phiên GitHub integration sau merge #48

- **PR #48 đã MERGED** tại `60c7990ae67c6089e12ef68109acbc4603e27c44` (sau các PR #38, #42, #44, #46). Vì vậy hàng “G00 / continuity — IN_PROGRESS cho đến khi merge #48” trong mục 22 là snapshot trước thời điểm merge; hiện trạng G00 của phiên này là **đã lưu nhật ký và chỉ mục lên main**.
- Vẫn còn 4 PR Draft #37/#43/#45/#47; không PR nào trong bốn PR này được merge trong phiên. Issues liên quan chưa đóng do cổng thực tế chưa hoàn thành.
- Không có bằng chứng mới cho M1/M2, Word/WPS/UAT; giữ `NO-GO`. Chi tiết căn cứ ở [nhật ký tích hợp](../sessions/2026-11-07_github-integration-followup.md).

### 22.2. Bổ sung bằng chứng CI theo phạm vi — 07/11/2026

- DF-B03 / [PR #37](https://github.com/tranhaihp26-bit/DocForm/pull/37): workflow focused OOXML/font mới [42370010487](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370010487) **SUCCESS** (3/3); ba workflow PR hiện hành khác cũng SUCCESS. Chưa merge, branch diverged; không nâng `VERIFIED_OOXML_POST_STAMP_REAL`.
- DF-E03 / [PR #43](https://github.com/tranhaihp26-bit/DocForm/pull/43): [42369791164](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42369791164) **SUCCESS** (22 PASS/1 SKIP, Windows-only), thực thi lockfile install + lint + scoped renderer/security suites. Chưa merge hoặc nghiệm thu WPS.
- DF-B04 / [PR #45](https://github.com/tranhaihp26-bit/DocForm/pull/45): [42369870886](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42369870886) **SUCCESS** (scoped settings/header tests). Chưa merge hoặc nghiệm thu Word/WPS.
- Đây là **CI trên các nhánh PR**, không phải release Gate R/U/O. #47 vẫn lỗi test. Giữ toàn bộ các issue và các PR Draft chưa nghiệm thu ở trạng thái cần kiểm chứng thêm; không đổi kết luận **M1/M2 NO-GO**.

### 22.3. Kết quả tích hợp và phục hồi test (07/11/2026)

| Mã | Tích hợp thực tế (merge SHA) | Bằng chứng mới | Trạng thái nghiệm thu |
|---|---|---|---|
| DF-B03 #8 | PR #37 **MERGED** `bce0f733`; isolated auditor + CI | [42370611414](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370611414), [42370611419](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370611419) SUCCESS; lịch sử diverged được hòa bằng 2-parent merge non-force trước tích hợp | `INTEGRATED_CODE / CI_VERIFIED_FOCUSED`, chưa có manifest hậu stamp |
| DF-E03/PA-06 #27/#35 | PR #43 **MERGED** `1efe5e34` | [42370734850](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370734850) SUCCESS Linux scoped; test Windows-only vẫn SKIP | `INTEGRATED_CODE`, `NOT_VERIFIED_RENDER` |
| DF-B04 #16 | PR #45 **MERGED** `eed8f02e` | [42370737629](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370737629) SUCCESS | `INTEGRATED_CODE`, chưa có Word/WPS settings visual |
| PA-05 #34 | PR #47 **MERGED** `12432b48`, guide only | Không sửa runtime; kiểm chứng legacy recovery bên dưới | `HELP_PUBLISHED / NOT_VERIFIED_UAT` |
| Cross-cutting legacy QA | PR #49 **MERGED** `058b72f7` | [42371345394](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371345394) SUCCESS, 20/20 cases, gồm Test 9/13 IndexedDB/draft; test geometry HD05 đo 9980=5540+4440, hai rule generic ratio `NOT_APPLICABLE` theo profile-first | `CI_VERIFIED_FOCUSED`, không nâng M1/M2 |

**Browser-test blocker rõ ràng:** `test/import-session-browser.test.ts` cũ cho rằng modal rà soát tự mở ngay khi upload; `src/App.tsx` hiện có chủ đích để modal đóng sau import và chuyển sang giai đoạn metadata. Cần cập nhật browser test theo UX mới và kiểm race guard source/draft trên Windows. Không hạ assertion bảo toàn nội dung để biến test xanh. Không thay runtime theo kỳ vọng test cũ.

**Cổng tiếp theo:** DF-B03 nối auditor với candidate hậu stamp; PA-05 trình duyệt/restart thật; DF-E03/DF-B04 và PA-06 kiểm DOCX thật + Word/WPS + UAT. Profile conflicts A02/A03 vẫn giữ khóa. **Release M1/M2 NO-GO**. Chi tiết và các SHA: [follow-up 2](../sessions/2026-11-07_github-integration-followup-2.md).
