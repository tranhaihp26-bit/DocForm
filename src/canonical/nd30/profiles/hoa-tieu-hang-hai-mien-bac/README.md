# Phần đầu văn bản hành chính Công ty Hoa tiêu hàng hải miền Bắc

`header-reference.docx` là mẫu Word phần đầu do người dùng chọn cho profile hành chính theo Nghị định 30/2020/NĐ-CP. `header-reference.pdf` là bản xuất trực tiếp từ Word để đối chiếu bằng mắt khi preview DOCX hiển thị sai. Mẫu chỉ chứa phần đầu và một đoạn trống để tiếp tục soạn văn bản. `profile.json` ghi thông số và SHA-256 của đúng bản đã chốt để phát hiện thay đổi ngoài ý muốn.

- A4; lề trên/dưới 20 mm, trái 30 mm, phải 15 mm.
- Bảng hai cột không viền, rộng 10432 twips; cột trái 5187, cột phải 5245 twips; thụt bảng -874 twips. Bảng nằm trong mép giấy A4.
- Tên cấp trên 12 pt thường; tên công ty 12 pt đậm; quốc hiệu 12 pt đậm; tiêu ngữ 13 pt đậm; số và địa danh/ngày tháng 13 pt, phần ngày tháng nghiêng. Tất cả dùng Times New Roman.
- Hai đường kẻ là Shape Line mặc định của Word, nét đen liền 0,75 pt, không có mũi tên hay hiệu ứng hiện ra; đặt ngay dưới tên công ty và tiêu ngữ. Đường trái dài 41 mm (trong khoảng 1/3–1/2 tên công ty); đường phải dài 55 mm, tương ứng bề rộng tiêu ngữ khi xuất bằng Word.
- Dòng `Hải Phòng, ngày … tháng … năm …` căn phải trong ô bên phải.
- Số, ký hiệu và ngày tháng để dạng chỗ trống, cần điền theo văn bản cụ thể.

Nguồn quy định: Phụ lục I Nghị định 30/2020/NĐ-CP. Kích thước bảng là lựa chọn trình bày của profile công ty, không phải quy định bắt buộc. Kiểm tra bản xuất Word khi sửa tên cơ quan hoặc cỡ chữ.

Profile này chỉ dành cho văn bản hành chính NĐ30, không dùng cho văn bản Đảng HD05. `src/canonical/nd30/companyHeader.ts` là mã tạo đầu trang của ứng dụng và cần được đồng bộ theo bản Word này trước khi tuyên bố bản xuất tự động giống hệt mẫu.
