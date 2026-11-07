# Session 2026-11-07 — DF-B04 — preserve unrelated settings during header stamp

- Mục tiêu người dùng / Master Roadmap: xác định việc đóng dấu header ND30/HD05 có làm mất thiết lập DOCX ngoài phạm vi; chỉ sửa sau khi tái hiện bằng DOCX tổng hợp.
- Trạng thái live: issue #16 đang OPEN, ghi `RISK_NEEDS_REPRO`, chưa có PR mở trùng; base local `deffe60c91a00041765530e3192259735c36defe`; branch riêng `codex/g04-b04-20261107`.
- Trước sửa: tạo DOCX tổng hợp bằng `Packer.toArrayBuffer(generateND30DocxDocument(...))` và `postProcessDocxShapes(...)`, xác nhận có `word/_rels/document.xml.rels`, shape header và `w:sectPr`; thêm `<w:doNotTrackMoves/>` vào `word/settings.xml`, rồi gọi stamp thực.
- Repro: trước patch, stamp thay toàn bộ `word/settings.xml` bằng settings tham chiếu và làm mất `<w:doNotTrackMoves/>` ở cả ND30 lẫn HD05. Relationships/shape/section là các phần có trong fixture; không dùng tài liệu riêng tư.
- Thay đổi:
  - `src/utils/hoaTieuHeaderStamp.ts` — giữ nguyên settings nguồn; chỉ thêm `w:shapeDefaults` bắt buộc nếu đang thiếu và WPS `typoFeatureVersion` của HD05 nếu thiếu. Nếu shape defaults hoặc WPS marker đang có nhưng xung đột, không sửa DOCX; candidate check không xác nhận stamp. `hasStampedHoaTieuHeader` kiểm tra các fragment cần thiết thay vì yêu cầu toàn bộ settings phải bằng mẫu tham chiếu.
  - `test/hoa-tieu-header-settings-preservation.test.ts` — kiểm tra trước/sau cho ND30 và HD05, giữ unrelated setting, toàn bộ settings còn lại, relationships XML, shape, section và nội dung body; xác nhận source bytes không bị mutate, lần stamp thứ hai idempotent, và settings shape xung đột khiến stamp fail-closed.
- Kiểm thử: `npm ci` exit 0 (308 package thêm, 309 audit, 0 vulnerability); `npx tsx --test test/hoa-tieu-header-settings-preservation.test.ts` 3/3 pass; `npx tsx test/header-dual-regime.test.ts` 5/5 case pass; `npx tsx --test test/export-candidate-contract.test.ts` 6/6 pass; `npm run lint` exit 0; `git diff --check` exit 0.
- Trạng thái sau local: `DONE_CODE` và đã kiểm tra OOXML tổng hợp trước/sau; chưa có CI/PR. Issue #16 cần giữ OPEN cho đến khi PR/CI và phần evidence còn lại được G00 rà soát; Word/WPS render và UAT vẫn `NOT_VERIFIED_RENDER`/`NOT_VERIFIED`.
- Chưa thực hiện / chưa xác minh / rủi ro: không chạy Word/WPS; chưa dùng corpus DOCX thực. Kiểm chứng dựa trên prefix XML `w:` và cấu trúc do `docx` exporter hiện hành tạo; nguồn settings có shape defaults xung đột được bảo toàn nguyên trạng và không được xác nhận stamp. Không thực hiện GitHub write/comment: parent đang xử lý chặn auto-review với yêu cầu đăng source; trạng thái `NOT_PERSISTED` lên GitHub.
- Delta đề xuất cho G00 sau khi được phép publish/merge: cập nhật DF-B04 thành code đã sửa với synthetic OOXML evidence, giữ `NOT_VERIFIED_RENDER`/UAT và để issue mở; không sửa shared Project Memory, Roadmap hoặc Support Matrix trong lane này.
- Tiếp theo: sau khi có quyền ghi GitHub rõ ràng, tạo PR nhỏ cho #16, gắn log này, chờ CI/review; không đổi header geometry/master và không tự đóng issue.

## Follow-up cục bộ — harden XML token gate sau review

- Phát hiện từ review độc lập: phép tìm chuỗi có thể nhầm `w:shapeDefaults` trong comment là element thật; candidate gate chưa kiểm tra URI namespace `w` ở root; duplicate shape defaults có thể qua gate nếu fragment đầu tiên giống mẫu.
- Sửa trong `src/utils/hoaTieuHeaderStamp.ts`: phân tích tag/quan hệ cha-con XML thực, bỏ qua comment/CDATA/PI khi xác định element, chỉ thêm namespace từ root đã parse, từ chối root namespace sai, yêu cầu đúng một `w:shapeDefaults` canonical trực tiếp dưới `w:settings`; HD05 cũng yêu cầu đúng một WPS marker trong đúng cấu trúc `mc:AlternateContent`. Mọi khai báo `<!...>` không được hỗ trợ, gồm DOCTYPE/ENTITY, làm parse thất bại; parser không mở rộng/thực thi entity. Khi parse/settings invalid hoặc có fragment xung đột, stamp trả nguyên bytes nguồn và candidate gate trả false.
- Bổ sung synthetic regression tại `test/hoa-tieu-header-settings-preservation.test.ts`: comment decoy, root `xmlns:w` sai, duplicate canonical + conflicting fragment, DOCTYPE cùng khai báo entity; xác nhận stamping fail-closed hoặc thêm element thật, candidate gate từ chối đầu vào không hợp lệ.
- Kiểm thử follow-up: `npx tsx --test test/hoa-tieu-header-settings-preservation.test.ts` PASS 7/7; `npx tsx test/header-dual-regime.test.ts` PASS 5/5 cases; `npx tsx --test test/export-candidate-contract.test.ts` PASS 6/6; `npm run lint` PASS (`tsc --noEmit`); `git diff --check` PASS. Không chạy Word/WPS, UAT hoặc GitHub action; render tiếp tục `NOT_VERIFIED_RENDER`.
- Trạng thái follow-up: base commit `82033a4718681f155990221f31fafd8b4ec55560`; thay đổi và log được giữ ở worktree/branch `codex/g04-b04-20261107` bằng commit cục bộ. Không đăng issue/comment/PR do blocker auto-review đã được parent báo trước; cần G00 xử lý quyền publish riêng. Không cập nhật các tài liệu điều hành dùng chung.

## Follow-up cục bộ — chỉ nhận header table từ XML document thật

- Phát hiện từ review độc lập: `documentXml.includes(stamp.table)` và regex tìm `<w:tbl>` có thể coi bảng canonical nằm trong comment là header đã stamp hoặc bảng cần thay thế.
- Sửa trong `src/utils/hoaTieuHeaderStamp.ts`: stamp/candidate gate parse `w:document`, kiểm tra namespace Word trên root, chỉ xét `w:tbl` là con trực tiếp của `w:body`, và chỉ chọn đúng một bảng có phần tử shape thật với `name`/`id` mong đợi. Candidate gate yêu cầu XML của bảng thật khớp fragment canonical; thay thế bằng vị trí token, không tìm/replace chuỗi toàn tài liệu.
- Thêm synthetic regression trong `test/hoa-tieu-header-settings-preservation.test.ts`: chuyển toàn bộ bảng canonical hợp lệ vào XML comment, xác nhận stamp giữ nguyên input và candidate gate từ chối.
- Kiểm thử trên mã cuối: `npx tsx --test test/hoa-tieu-header-settings-preservation.test.ts` PASS 8/8; `npx tsx test/header-dual-regime.test.ts` PASS 5/5 cases; `npx tsx --test test/export-candidate-contract.test.ts` PASS 6/6; `npm run lint` PASS (`tsc --noEmit`); `git diff --check` PASS. Không chạy Word/WPS, render, UAT hoặc GitHub action.
- Base follow-up là commit `00cf8e7e517f4b8b8f00037433c20dbdd97dd015`; thay đổi/log chỉ commit cục bộ trên branch G04. Không tạo PR hay thay đổi remote; render tiếp tục `NOT_VERIFIED_RENDER`.

## Follow-up cục bộ — xác thực namespace và marker shape trong document

- Phát hiện từ review độc lập: marker `name`/`id` trên bất kỳ descendant nào, kể cả node namespace ngoài, có thể làm bảng nội dung bị nhầm là header; `xmlns:w` override ngay tại `w:body` hoặc `w:tbl` chưa bị chặn.
- Sửa trong `src/utils/hoaTieuHeaderStamp.ts`: chỉ nhận shape marker trên `wp:docPr` trong `wp:anchor` với đúng DrawingML namespace hoặc `v:line` trong `w:pict` với đúng VML namespace; yêu cầu WordprocessingML namespace hiệu lực trên root, `w:body` và bảng trực tiếp.
- Thêm hai regression tổng hợp trong `test/hoa-tieu-header-settings-preservation.test.ts`: foreign `x:node` mang tên shape không khiến bảng nội dung bị thay; thay namespace `w` ở body hoặc table khiến candidate gate từ chối và stamp giữ nguyên input.
- Kiểm thử trên mã cuối: settings preservation PASS 10/10; header dual-regime PASS 5/5; export-candidate PASS 6/6; `npm run lint` PASS (`tsc --noEmit`); `git diff --check` PASS. Word/WPS render và UAT chưa chạy (`NOT_VERIFIED_RENDER`).
- Base follow-up là commit `1fc0d520ad8f708d96280864d57c9fb79020d499`; commit chỉ cục bộ trên branch G04, không có GitHub write/PR.
