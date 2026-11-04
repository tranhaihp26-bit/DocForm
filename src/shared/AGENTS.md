# Hướng dẫn cho `src/shared`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 3–6.

- Schema/type/protocol ở đây là hợp đồng dùng chung giữa client, server và lưu trữ. Trước khi đổi field/enum, tìm toàn bộ producer/consumer trực tiếp và luồng serialize/restore liên quan.
- Không biến dữ liệu thiếu thành dữ liệu giả bằng default; giữ riêng trạng thái missing, unclassified, not evaluated, needs review và not applicable.
- Giữ sự phân biệt `administrative`/`party`, nguồn gốc evidence, target/anchor và fingerprint/revision nếu chúng là điều kiện an toàn của contract.
- Khi nới schema, kiểm tra tương thích dữ liệu cũ, validation server, UI và export; cập nhật test contract. Chạy `npm run lint` cùng test phù hợp trước khi kết luận.
