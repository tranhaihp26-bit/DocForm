export interface ChatGPTSafeSessionState {
  status: "disconnected" | "connecting" | "connected" | "reauth_required";
  sharing: boolean;
  profileId?: string;
  profileLabel?: string;
  identity?: { name?: string; email?: string };
  error?: { code: string; message: string; retryable: boolean };
}

export interface ChatGPTLocalStatus {
  enabled: boolean;
  reason?: string;
  session: ChatGPTSafeSessionState;
}

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Bạn đã hủy hoặc từ chối cấp quyền ChatGPT.",
  browser_unavailable: "Không mở được trình duyệt mặc định để đăng nhập ChatGPT.",
  connection_busy: "Một thao tác kết nối ChatGPT khác đang chạy.",
  empty_response: "ChatGPT không trả về nội dung. Chưa tạo đề xuất tinh chỉnh.",
  invalid_grant: "Phiên ChatGPT cần được kết nối lại.",
  model_unavailable: "Tài khoản ChatGPT chưa có model khả dụng để chia sẻ với DocForm.",
  revocation_failed: "Đã xóa thông tin đăng nhập local nhưng chưa xác nhận được ngắt kết nối từ xa.",
  sharing_not_enabled: "Cần bật quyền chia sẻ ChatGPT trong bước cấp quyền để dùng gói của bạn.",
  sign_in_required: "Hãy kết nối ChatGPT trước khi gửi nội dung.",
  storage_encryption_unavailable: "Windows DPAPI không khả dụng; thông tin đăng nhập chưa được lưu.",
  storage_error: "Không thể đọc hoặc lưu phiên ChatGPT an toàn trên máy này.",
  subscription_sharing_usage_limit_exceeded: "Tài khoản đã đạt giới hạn sử dụng ChatGPT hiện tại.",
  subscription_sharing_user_not_eligible: "Tài khoản hoặc workspace ChatGPT chưa đủ điều kiện dùng tính năng chia sẻ.",
};

export function safeChatGPTError(code: string, retryable = false) {
  return {
    code: /^[a-z0-9_]{1,80}$/.test(code) ? code : "chatgpt_error",
    message: SAFE_ERROR_MESSAGES[code] ?? "Không thể hoàn tất yêu cầu ChatGPT. Hãy kiểm tra kết nối rồi thử lại.",
    retryable,
  };
}
