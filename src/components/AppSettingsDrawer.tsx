import { createPortal } from "react-dom";
import { ExternalLink, Settings2, X } from "lucide-react";
import type { PartitionAiProviderKind } from "../shared/partitionAiProtocol.ts";
import type { ChatGPTLocalStatus } from "../shared/chatgptPlanProtocol.ts";
import { useAccessibleDialog } from "../utils/useAccessibleDialog.ts";

interface AppSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  aiProvider: PartitionAiProviderKind;
  onAiProviderChange: (provider: PartitionAiProviderKind) => void;
  preferencePersisted: boolean;
  storageAvailable: boolean;
  chatGPTStatus: ChatGPTLocalStatus;
  isChatGPTActionPending: boolean;
  onChatGPTConnect: () => void;
  onChatGPTConnectCancel: () => void;
  onChatGPTDisconnect: () => void;
}

export function AppSettingsDrawer({
  isOpen,
  onClose,
  aiProvider,
  onAiProviderChange,
  preferencePersisted,
  storageAvailable,
  chatGPTStatus,
  isChatGPTActionPending,
  onChatGPTConnect,
  onChatGPTConnectCancel,
  onChatGPTDisconnect,
}: AppSettingsDrawerProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose, { initialFocusSelector: "select" });
  if (!isOpen) return null;

  const connected = chatGPTStatus.enabled && chatGPTStatus.session.status === "connected" && chatGPTStatus.session.sharing;
  const connecting = isChatGPTActionPending || chatGPTStatus.session.status === "connecting";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="df-app-settings-title"
        aria-describedby="df-app-settings-description"
        data-testid="app-settings-dialog"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="df-app-settings-title" className="text-lg font-bold text-slate-900">Cài đặt chung</h2>
              <p id="df-app-settings-description" className="mt-1 text-sm text-slate-600">Thiết lập áp dụng cho các bước AI của DocForm local.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng cài đặt" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
          <section aria-labelledby="df-app-settings-ai-title" className="space-y-4">
            <div>
              <h3 id="df-app-settings-ai-title" className="text-base font-bold text-slate-900">Nhà cung cấp AI mặc định</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Áp dụng cho rà soát phân vùng, rà soát tài liệu và tinh chỉnh đoạn. Lượt tinh chỉnh đã gửi vẫn có thể hoàn tất ở nhà cung cấp cũ, nhưng kết quả về muộn sẽ không được dùng; khi đổi nhà cung cấp, cần xác nhận lại việc gửi nguồn.</p>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-800 sm:grid-cols-[1fr_280px] sm:items-center">
              <span>Nhà cung cấp cho các thao tác AI</span>
              <select
                data-testid="ai-default-provider"
                value={aiProvider}
                onChange={event => onAiProviderChange(event.currentTarget.value as PartitionAiProviderKind)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="gemini">Gemini · API máy chủ local</option>
                <option value="chatgpt">ChatGPT plan · local</option>
              </select>
            </label>

            <p role="status" data-testid="ai-settings-persistence" className={`text-xs ${storageAvailable ? "text-slate-600" : "text-amber-800"}`}>
              {storageAvailable
                ? preferencePersisted
                  ? "Đã lưu lựa chọn trên trình duyệt này; lựa chọn áp dụng sau khi tải lại và mở phiên mới."
                  : "Đang dùng Gemini mặc định; lựa chọn sẽ được lưu trên trình duyệt này sau khi bạn thay đổi."
                : "Trình duyệt không cho phép lưu tùy chọn. Cài đặt chỉ có hiệu lực trong phiên hiện tại."}
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="chatgpt-settings">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">ChatGPT plan · local</h4>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Phiên đăng nhập được quản lý bởi máy chủ DocForm trên máy này. Trạng thái kết nối không tự cho phép gửi nội dung tài liệu.</p>
                </div>
                {connected ? (
                  <button type="button" onClick={onChatGPTDisconnect} disabled={isChatGPTActionPending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                    {isChatGPTActionPending ? "Đang xử lý…" : "Ngắt kết nối"}
                  </button>
                ) : isChatGPTActionPending ? (
                  <button type="button" onClick={onChatGPTConnectCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Hủy đăng nhập</button>
                ) : chatGPTStatus.enabled ? (
                  <button type="button" onClick={onChatGPTConnect} disabled={isChatGPTActionPending || chatGPTStatus.session.status === "connecting"} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Kết nối ChatGPT</button>
                ) : null}
              </div>
              <p className={`mt-3 text-sm ${connected ? "font-semibold text-emerald-700" : "text-amber-800"}`} role="status" data-testid="chatgpt-settings-status">
                {connected
                  ? `Đã kết nối${chatGPTStatus.session.identity?.email ? ` · ${chatGPTStatus.session.identity.email}` : ""}`
                  : connecting && chatGPTStatus.enabled
                    ? "Đang chờ hoàn tất đăng nhập trong trình duyệt…"
                    : chatGPTStatus.enabled && chatGPTStatus.session.status === "reauth_required"
                      ? "Phiên ChatGPT cần kết nối lại."
                      : chatGPTStatus.reason || "Chưa kết nối ChatGPT plan."}
              </p>
            </div>
          </section>

          <section aria-labelledby="df-app-settings-privacy-title" className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <h3 id="df-app-settings-privacy-title" className="font-semibold text-slate-900">Kiểm soát gửi nội dung</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              <li>Chọn nhà cung cấp không tự gửi tài liệu; từng thao tác AI vẫn cần lệnh riêng.</li>
              <li>Cho phép rà soát nguồn được hỏi riêng theo từng tệp và mặc định tắt sau khi tải lại.</li>
              <li>Chỉ lựa chọn nhà cung cấp được lưu ở trình duyệt. Token ChatGPT và khóa API Gemini không được lưu trong tùy chọn này.</li>
            </ul>
            {aiProvider === "gemini" && <p className="mt-3 text-xs leading-5 text-slate-600">Gemini dùng khóa của máy chủ local. Chính sách dữ liệu tùy Free/Paid tier; Google hiện ghi nội dung gửi qua Free Tier có thể được dùng để cải thiện sản phẩm. Hãy kiểm tra tier của dự án gắn với khóa trước khi gửi tài liệu nhạy cảm.</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <a className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:underline" href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noreferrer">
                Tài liệu Gemini API <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:underline" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">
                Hạn mức và chính sách dữ liệu <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Đóng</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
