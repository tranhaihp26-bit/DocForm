# Chuẩn hoá Văn bản — Hợp Đồng Kiến Trúc Nguồn (Tài Liệu Tham Khảo)

> [!NOTE]
> **Phạm vi tham khảo:** Thư mục này chứa bản sao tài liệu đặc tả kiến trúc nguồn (Upstream Architecture Contract) được lưu lại làm tài liệu tham khảo khái niệm (conceptual reference).
> - **Các file hiện có trong thư mục này:** [`SOURCE-MODEL.md`](SOURCE-MODEL.md), [`RULE-MODEL.md`](RULE-MODEL.md), [`APPLICABILITY.md`](APPLICABILITY.md), [`FIX-SAFETY.md`](FIX-SAFETY.md).
> - **Các tài liệu ngoài luồng:** Các file như `ARCHITECTURE.md`, `DOCUMENT-MODEL.md`, `VALIDATION-RESULTS.md`, `TECHNOLOGY-DECISIONS.md`, `MIGRATION-PLAN.md` và thư mục `nghi-dinh-30/` thuộc dự án đặc tả mở rộng bên ngoài và **không tồn tại cục bộ** trong repo này. Không tạo file rỗng để thay thế các liên kết này.
> - **Triển khai runtime thực tế của DocForm:** Mã nguồn thực thi quy tắc thể thức nằm tại [`../../ruleEngine.ts`](../../ruleEngine.ts), [`../../../shared/schemas/document.schema.ts`](../../../shared/schemas/document.schema.ts) và [`../rules.generated.json`](../rules.generated.json).

Repository tổng hợp các hướng dẫn, nguyên tắc, nguồn chuẩn và mô hình quy tắc để **chuẩn hoá việc soạn thảo, trình bày, quản lý và kiểm tra văn bản**.

Hiện repository có hai lớp song song:

1. **Legacy guides** — tài liệu hướng dẫn tham khảo ban đầu.
2. **Kiến trúc v2** — Source Registry + Canonical Rules + Rule Packs + Profile + Document Model + Validation/Patch contracts.

## Trạng thái

- Baseline v2: commit `6f5a5f1d38a18b6117d8054134e76e8df472d10a`.
- GĐ0: xây foundation/schema/routing/safety; chưa triển khai production DOCX parser/formatter.

## Kiến trúc v2

```text
Official / verified sources
        ↓
Source Registry
        ↓
Atomic Canonical Rules
        ↓
Applicability + Temporal Resolver
        ↓
Minimal Rule Packs
        │
        ├──────────── Organization Profile
        │
DOCX → Document Engine
        │
        └─────────────┬──────────────
                      ↓
                  Validator
                      ↓
             Reversible safe patches
```

Các tài liệu đặc tả hiện có trong thư mục:

- [`SOURCE-MODEL.md`](SOURCE-MODEL.md) — Mô hình nguồn pháp lý
- [`RULE-MODEL.md`](RULE-MODEL.md) — Mô hình quy tắc chuẩn hóa
- [`APPLICABILITY.md`](APPLICABILITY.md) — Điều kiện áp dụng quy tắc
- [`FIX-SAFETY.md`](FIX-SAFETY.md) — Nguyên tắc an toàn khi sửa lỗi

*(Các file khác trong danh mục v2 như ARCHITECTURE.md, DOCUMENT-MODEL.md là đặc tả của dự án mẹ bên ngoài, không có trong thư mục này).*

## Cấu trúc chính

```text
├── README.md
├── ARCHITECTURE.md
├── SOURCE-MODEL.md
├── RULE-MODEL.md
├── DOCUMENT-MODEL.md
├── APPLICABILITY.md
├── FIX-SAFETY.md
├── VALIDATION-RESULTS.md
├── TECHNOLOGY-DECISIONS.md
├── MIGRATION-PLAN.md
├── schemas/
├── sources/
├── rule-packs/
├── profiles/
├── tests/
├── nghi-dinh-30/          # Legacy guides, audit/migration pending
├── huong-dan-05/          # Legacy placeholder
└── quy-dinh-khac/         # Legacy placeholder
```

## Regime và domain

V2 không mặc định mọi tài liệu đều theo Nghị định 30. Runtime phải phân loại regime và domain trước khi chọn rule:

- `administrative`
- `normative_legal`
- `party`
- `specialized`
- `unknown`

Các domain gồm format, structure, workflow, electronic transaction/signature, records/archive, data governance, information security và legal authority.

## Nguyên tắc bắt buộc

- Markdown guide không phải source of truth.
- Mandatory rule phải truy ngược được về nguồn.
- Rule áp theo phạm vi + thời điểm hiệu lực.
- Profile nội bộ không được override legal constraint.
- `NOT_EVALUATED` không được báo thành `PASS`.
- Tài liệu ký số mặc định chỉ audit, không auto-fix.
- Auto-fix phải cục bộ, có audit trail và có thể kiểm tra before/after.

## Nội dung hiện có theo Nghị định 30

| File | Nội dung |
|---|---|
| `01-nguyen-tac-chung.md` | Nguyên tắc chung |
| `02-the-thuc-van-ban.md` | Thể thức văn bản |
| `03-ky-thuat-trinh-bay.md` | Kỹ thuật trình bày |
| `04-bo-cuc-noi-dung.md` | Bố cục nội dung |
| `05-cac-loai-van-ban.md` | Các loại văn bản hành chính |
| `06-huong-dan-soan-thao.md` | Hướng dẫn soạn thảo |
| `07-checklist-kiem-tra.md` | Checklist hiện hành |

Các file này sẽ được audit và migrate ở GĐ1; checklist về lâu dài phải được sinh từ verified canonical rules.

## Đóng góp

Thay đổi kiến trúc/schema/rules nên thực hiện qua feature branch + Pull Request, không sửa trực tiếp `main`.

---

**Lưu ý:** Repository hỗ trợ chuẩn hoá và kiểm tra; không thay thế văn bản pháp luật, quy định của Đảng hoặc quyết định nghiệp vụ của người có thẩm quyền.
