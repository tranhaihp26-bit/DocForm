import type { SemanticLabel } from "../shared/semanticDocument.ts";

const SEMANTIC_LABELS: Record<SemanticLabel, string> = {
  section_heading: "Đề mục",
  legal_basis: "Căn cứ pháp lý",
  lead: "Đoạn dẫn",
  narrative: "Đoạn văn hành chính",
  article: "Điều",
  clause: "Khoản",
  point: "Điểm",
  table_header: "Tiêu đề bảng",
  table_data: "Ô dữ liệu trong bảng",
  media_unsupported: "Hình ảnh hoặc đồ họa chưa hỗ trợ",
  meeting_time_place: "Thời gian, địa điểm cuộc họp",
  participants: "Thành phần tham dự",
  chair_secretary: "Chủ trì, thư ký",
  agenda: "Chương trình cuộc họp",
  discussion: "Nội dung thảo luận",
  vote: "Nội dung biểu quyết",
  conclusion: "Kết luận",
  assignment: "Nội dung phân công",
  closing: "Phần kết văn bản",
  explanation: "Nội dung giải trình",
  source_note: "Ghi chú nguồn",
  header_footer: "Đầu trang hoặc chân trang",
  footnote: "Chú thích cuối trang",
  endnote: "Chú thích cuối tài liệu",
  textbox: "Hộp văn bản",
  table: "Bảng",
  appendix_title: "Tiêu đề phụ lục",
  appendix_reference: "Dẫn chiếu phụ lục",
  appendix_heading: "Đề mục trong phụ lục",
  list_item: "Ý liệt kê / gạch đầu dòng",
  note: "Ghi chú",
  unknown: "Chưa phân loại",
  heading: "Tiêu đề",
  body_paragraph: "Đoạn văn hành chính",
  meeting_attendance: "Thành phần dự họp",
  meeting_agenda: "Chương trình cuộc họp",
  meeting_discussion: "Nội dung thảo luận",
  meeting_decision: "Kết luận cuộc họp",
  table_header_cell: "Ô tiêu đề trong bảng",
  table_cell: "Ô dữ liệu trong bảng",
};

export function semanticLabelForOfficeWorker(label: string): string {
  return Object.hasOwn(SEMANTIC_LABELS, label)
    ? SEMANTIC_LABELS[label as SemanticLabel]
    : "Nội dung cần xem lại";
}

export interface ImportGroupForAttention {
  title: string;
  status: string;
}

export function getImportGroupAttention(groups: ImportGroupForAttention[]): {
  unverified: string[];
  missing: string[];
} {
  return {
    unverified: groups.filter(group => group.status === "unverified").map(group => group.title),
    missing: groups.filter(group => group.status === "missing").map(group => group.title),
  };
}

export function getSourceVisualFailureMessage(status: "incomplete" | "error" | "unavailable"): string {
  if (status === "incomplete") {
    return "Chưa dựng đủ trang để đối chiếu. Bạn vẫn có thể duyệt nội dung đã trích bên dưới hoặc mở tệp gốc bằng Word.";
  }
  return "Máy tính này chưa thể hiển thị bố cục trang gốc. Bạn vẫn có thể duyệt nội dung đã trích bên dưới hoặc mở tệp gốc bằng Word.";
}
