# Hướng dẫn cho `src/shared`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 3–6.

- Schema/type/protocol ở đây là hợp đồng dùng chung giữa client, server và lưu trữ. Trước khi đổi field/enum, tìm toàn bộ producer/consumer trực tiếp và luồng serialize/restore liên quan.
- Không biến dữ liệu thiếu thành dữ liệu giả bằng default; giữ riêng trạng thái missing, unclassified, not evaluated, needs review và not applicable.
- Theo V2.2, schema/resolver phải mang được cả **giá trị hiệu lực lẫn nguồn của từng thuộc tính**; `0`, `false`, `""` có chủ ý khác absent/undefined, `null` cần semantics từ schema. Chỉ thuộc tính profile thiếu mới fallback ND30/HD05 cùng regime, không hậu kiểm giá trị profile theo default pháp quy. Xem [V2.2](../../docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).
- Giữ sự phân biệt `administrative`/`party`, nguồn gốc evidence, target/anchor và fingerprint/revision nếu chúng là điều kiện an toàn của contract.
- Khi nới schema, kiểm tra tương thích dữ liệu cũ, validation server, UI và export; cập nhật test contract. Chạy `npm run lint` cùng test phù hợp trước khi kết luận.
