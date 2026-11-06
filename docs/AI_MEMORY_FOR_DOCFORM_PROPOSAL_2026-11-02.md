# Đề xuất dùng ai-memory cho coding agent của DocForm

**Trạng thái:** đã cài và cấu hình pilot local MCP-only ngày 2026-11-02; kiểm tra loopback, bearer auth và MCP bridge đạt. Chưa xác minh Codex Desktop đã nạp công cụ trong phiên giao diện hiện tại; kiểm tra ghi page/handoff qua Desktop vẫn chưa thực hiện.

## Khuyến nghị

Thử nghiệm `ai-memory` ở chế độ **MCP-only, local, zero-LLM và ghi nhớ có chọn lọc**. Không bật lifecycle hooks ở giai đoạn đầu.

Giá trị bổ sung chính là ghi nhớ trạng thái theo thời gian: quyết định đã chọn, hướng thử thất bại, kết quả kiểm tra gần nhất, việc còn mở và handoff giữa các phiên. `ai-memory` không thay thế hướng dẫn chuẩn tắc hay bản đồ mã nguồn của DocForm.

## Đối chiếu với hệ hướng dẫn hiện tại

| Thành phần | Vai trò nên giữ |
|---|---|
| `AGENTS.md` gốc và các `AGENTS.md` theo thư mục | Quy tắc chuẩn tắc, bất biến nguồn, bảo mật và cách làm việc. Đây là nguồn có quyền ưu tiên cao nhất trong repository. |
| `docs/CODEBASE_MAP.md` | Tuyến đường đến module, luồng dữ liệu và test hiện có. Cập nhật khi kiến trúc hoặc owner thay đổi. |
| Graphify | Gợi ý quan hệ cấu trúc giữa các file code; agent phải xác minh từ source và test. |
| ai-memory | Bối cảnh theo phiên: quyết định tạm/thời điểm, phát hiện, lỗi đã gặp, lệnh kiểm tra và next step/handoff. Nội dung chỉ là lịch sử cần đối chiếu, không phải chỉ thị. |

Không sao chép luật, quy tắc bảo toàn dữ liệu hoặc nội dung của `AGENTS.md` sang memory pages; làm vậy sẽ tạo thêm nguồn có thể lệch phiên bản.

## Kết quả nghiên cứu

- Lúc lập ghi chú ban đầu, release mới nhất được thấy là `v3.2.9`. Trước khi cài ngày 2026-11-02 đã kiểm tra lại và pin `v3.3.1`; archive Windows được đối chiếu SHA-256 với checksum của release. README mô tả source of truth là wiki Markdown có Git, với SQLite là chỉ mục dẫn xuất, và luồng mặc định không cần gọi LLM. ([Release v3.2.9](https://github.com/akitaonrails/ai-memory/releases/tag/v3.2.9), [Release v3.3.1](https://github.com/akitaonrails/ai-memory/releases/tag/v3.3.1), [README](https://github.com/akitaonrails/ai-memory))
- ai-memory có tích hợp MCP và lifecycle hooks cho Codex. Hai phần tách biệt: MCP-only cho phép agent truy vấn/ghi memory và handoff thủ công; hooks bổ sung capture tự động và handoff theo phiên. ([MCP integration guide](https://github.com/akitaonrails/ai-memory/blob/main/docs/mcp-install.md))
- Hỗ trợ **Windows native đang ở mức Experimental**. Tài liệu yêu cầu cài từ cùng môi trường chạy agent và nói riêng về giới hạn command/PATH của Codex plugin trên Windows. Vì phiên làm việc này chạy Codex Desktop trên Windows, việc Codex Desktop nạp đúng MCP entry và không cần hook phải được kiểm tra trong pilot; không mặc định CLI và Desktop có hành vi giống nhau. ([Windows support](https://github.com/akitaonrails/ai-memory/blob/main/docs/windows.md), [Codex install notes](https://github.com/akitaonrails/ai-memory/blob/main/docs/install.md#marketplace-plugins))
- Cài mới mặc định giữ dữ liệu tại data directory cục bộ, bind loopback và dùng ACL filesystem; **không có mã hóa at-rest riêng**. Local embedding có thể tải model khoảng 87 MB lần đầu; `embedding_provider = "none"` tránh việc tải đó và vẫn giữ FTS search. ([Data handling](https://github.com/akitaonrails/ai-memory/blob/main/DATA_HANDLING.md), [Security](https://github.com/akitaonrails/ai-memory/blob/main/SECURITY.md))
- Mặc định hook có thể capture prompt, metadata và nội dung tool được hỗ trợ. `ignore_paths` chỉ lọc hoạt động có đường dẫn và là best-effort với shell/unknown tools; tùy chọn tắt prompt capture được tài liệu hóa riêng cho Claude Code, không phải Codex. Allowlist mode mới bảo đảm repo không có marker thì không capture bất kỳ lifecycle event nào. ([Capture policy](https://github.com/akitaonrails/ai-memory/blob/main/docs/marker-file.md#capture-exclusions), [Data handling](https://github.com/akitaonrails/ai-memory/blob/main/DATA_HANDLING.md))
- `setup` có thể tự wire các harness mà nó tìm thấy. Cài Codex plugin cũng đưa MCP và hooks vào; tài liệu cảnh báo không cài trùng với Codex settings hooks. Vì vậy pilot cần chọn đúng một cách đăng ký MCP và chưa bật hooks. ([README quick start](https://github.com/akitaonrails/ai-memory#quick-start), [Codex plugin setup](https://github.com/akitaonrails/ai-memory/blob/main/docs/install.md#marketplace-plugins))

## So sánh phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Đánh giá |
|---|---|---|---|
| Không thêm ai-memory | Không cài daemon hay thay đổi Codex; giữ `AGENTS.md`, Codebase Map và Graphify | Handoff giữa phiên vẫn cần ghi lại trong task hoặc memory cá nhân | An toàn và đơn giản; phù hợp nếu agent chủ yếu làm trong một phiên |
| Bật MCP + hooks tự động toàn cục | Ghi observations và handoff tự động, dùng chung qua nhiều repo/harness | Có thể capture prompt/tool activity ngoài ý muốn; hook Codex trên Windows còn Experimental; `setup` có thể sửa cấu hình của nhiều agent | Không chọn làm mặc định cho DocForm |
| MCP-only, memory chọn lọc theo repo | Có thể query/ghi pages và handoff khi cần; không cần capture prompt/tool tự động; giữ dữ liệu trên máy | Handoff phải được yêu cầu/thực hiện rõ ràng; cần kiểm tra kết nối Codex Desktop và native Windows | **Khuyến nghị pilot** |

## Cấu hình mục tiêu cho pilot

1. Cài bản pin `v3.3.1` sau khi xác minh checksum release; dùng data directory riêng của user ngoài `D:\DocForm` và ngoài repository.
2. Chỉ đăng ký **MCP cho Codex**, không cài lifecycle hooks, không dùng `ai-memory run`, không bật marketplace plugin kết hợp hooks trong pilot đầu.
3. Chạy server local loopback trên cùng máy, bật bearer authentication theo cấu hình cài mới; không trỏ tới server nhóm, LAN hay remote.
4. Để `llm_provider` không cấu hình, `AI_MEMORY_RERANKER` không bật, `capture_assistant` tắt; đặt `embedding_provider = "none"` để tránh model download và mọi provider call trong pilot.
5. Tắt cross-project profile cho DocForm bằng `[profile] contribute = false` và `consume = false`. Không bật `[briefing]` tự inject nội dung dài vào mỗi phiên trong giai đoạn đầu.
6. Chỉ lưu metadata kỹ thuật đã được xác nhận: commit/branch, tên file liên quan, quyết định kiến trúc, command/test và kết quả, blocker/next step. Không lưu prompt của người dùng, nội dung DOCX/TXT, OCR, fixture nghiệp vụ, thông tin cá nhân, `.env`, token hoặc log có dữ liệu nguồn.
7. Agent chỉ đọc memory khi công việc dài/nối phiên cần lịch sử; luôn kiểm tra memory với `AGENTS.md`, source và test hiện hành. Chỉ tạo/cập nhật handoff khi người dùng yêu cầu tiếp tục ở phiên khác hoặc khi họ đã đồng ý với quy trình handoff.

### Phân loại memory pages đề xuất

- `decisions/`: quyết định kỹ thuật còn hiệu lực, lý do và đường dẫn source/test liên quan.
- `gotchas/`: lỗi khó tái hiện, command sai/đã thất bại và cách xác minh.
- `workstreams/` hoặc handoff tích hợp sẵn: việc đang làm, trạng thái checkout theo thời điểm, kết quả thực tế và bước kế tiếp.
- Không tạo một bản `AGENTS.md`, Codebase Map, tài liệu nghiệp vụ hay kho nội dung nguồn thứ hai trong memory.

## Điều kiện thử nghiệm đạt

- Codex Desktop thực sự hiển thị các MCP tools sau khi đăng ký; `memory_status`, query, đọc/ghi một trang tổng hợp và handoff thử đều hoạt động trên server local.
- Không có hook entry nào được thêm vào Codex trong giai đoạn MCP-only; không có event/prompt tự động xuất hiện trong observations.
- Wiki/data directory nằm ngoài repository; runtime không tự tạo file trong checkout. Phân biệt trạng thái Git sẵn có với cập nhật báo cáo pilot có chủ đích trong tài liệu này.
- Nội dung thử dùng hoàn toàn tổng hợp; memory pages không chứa dữ liệu tài liệu nguồn hay credential.
- Sau một vài phiên dùng thực tế, lợi ích handoff được đánh giá riêng với chi phí vận hành, thời gian khởi động và chất lượng truy xuất.

## Lộ trình nếu pilot hữu ích

1. Giữ MCP-only và hoàn thiện quy trình ghi/query có chủ đích nếu đủ hiệu quả.
2. Chỉ cân nhắc lifecycle hooks sau khi chính sách dữ liệu cho phép capture prompt/tool ở dự án này và Windows native được nâng khỏi Experimental hoặc đã được kiểm chứng trên đúng phiên bản Codex Desktop.
3. Nếu cần hooks, thử bằng marker trong checkout test tổng hợp trước. Dùng allowlist mode; không dựa riêng vào `ignore_paths` để bảo vệ nội dung nhạy cảm. Xác minh mọi path/hook ghi vào spool, rồi mới cân nhắc DocForm thật.
4. Không bật embedding cloud, LLM consolidation, LLM reranking, assistant capture, webhooks hay server remote nếu chưa có quyết định riêng về nơi dữ liệu được gửi và người có quyền truy cập.

## Kết luận

ai-memory có thể bổ sung tốt phần lịch sử làm việc và handoff mà `AGENTS.md`, Codebase Map và Graphify không nhắm tới. Pilot đã được cấu hình theo hướng **MCP-only + local + zero-LLM + ghi nhớ thủ công có chọn lọc**. Tự động capture prompt/tool chưa phù hợp làm mặc định do tài liệu nguồn có thể nhạy cảm, capture path chỉ lọc best-effort, và hỗ trợ Windows native vẫn Experimental.

## Kết quả triển khai pilot (2026-11-02)

- Đã cài binary Windows `v3.3.1` tại `%LOCALAPPDATA%\Programs\ai-memory`; SHA-256 archive khớp checksum `99dcde5b7af450fe6212b23eccb43af3f608aadcd6999bf8c484efc7d08705db` của release.
- Đã khởi tạo dữ liệu tại `%LOCALAPPDATA%\ai-memory` và chạy server HTTP chỉ bind `127.0.0.1:49374`. `/healthz` trả `200`; MCP không có bearer trả `401`; client xác thực báo `auth=true`. Không bật web UI hay API JSON.
- Cấu hình giữ `embedding_provider = "none"`, không đặt `llm_provider`, tắt `capture_assistant`, cross-project profile và auto-improve scheduler; auto-improve cũng yêu cầu duyệt. Status xác nhận LLM/embedding disabled và hiện có 0 page, 0 session, 0 observation.
- `%USERPROFILE%\.codex\config.toml` có entry stdio `[mcp_servers.ai-memory]`, dùng `mcp-bridge --no-session-id` và đọc token từ data directory; không ghi token vào Codex config. 15 công cụ không chỉ đọc được đặt `approval_mode = "prompt"`. MCP list và bridge handshake/tool listing thành công, server công bố 25 tools. Các MCP/hook entries có trước được giữ nguyên; không thêm ai-memory hook, plugin, project marker hay `.ai-memory.toml`.
- Đã gọi `memory_status` và truy vấn tổng hợp read-only; truy vấn trả rỗng. Chưa ghi page/handoff thử vào store và chưa xác nhận danh sách tool trong giao diện Codex Desktop đang mở. **Trạng thái tích hợp Desktop: UNVERIFIED** cho đến khi Codex Desktop nạp lại cấu hình và hiển thị `ai-memory` tools.
- Cổng DocForm `5050` vẫn lắng nghe. Không sửa mã nguồn ứng dụng hoặc commit/push trong bước cài đặt này.

### Bước xác nhận còn lại

Khởi động lại Codex Desktop để nạp `%USERPROFILE%\.codex\config.toml`, sau đó xác nhận `memory_status` và `memory_query` xuất hiện trong danh sách tools. Chỉ chạy thử ghi nhớ/handoff bằng nội dung tổng hợp khi thực hiện phiên xác nhận đó; không dùng tài liệu DOCX/TXT thật làm dữ liệu thử.
