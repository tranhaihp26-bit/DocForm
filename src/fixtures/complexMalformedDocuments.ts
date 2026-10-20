/**
 * @file complexMalformedDocuments.ts
 * @description Bộ sưu tập 10 tài liệu Pilot Test thuộc các trường hợp phức tạp (Complex),
 * không đúng thể thức (Non-compliant) và sai định dạng dữ liệu (Malformed Data).
 * Dùng để kiểm thử độ bền (resilience) của hệ thống ở cả 4 khâu:
 * 1. Khâu Parse (Bóc tách dữ liệu từ file DOCX/TXT/HTML)
 * 2. Khâu Preview (Hiển thị A4 Canvas & Real OOXML Docx Preview)
 * 3. Khâu In ấn (Print CSS & PDF Layout)
 * 4. Khâu Xuất file (DOCX OOXML Generation & ZIP Packaging)
 */

import type { DocumentFormatType } from "../shared/schemas/document.schema.ts";

export interface ComplexMalformedItem {
  id: string;
  type: "complex" | "non_compliant" | "malformed_data";
  typeName: string;
  title: string;
  code: string;
  desc: string;
  badge: string;
  tags: string[];
  expectedIssues: string[];
  doc: DocumentFormatType;
  rawText?: string;
}

export const COMPLEX_MALFORMED_DOCUMENTS: ComplexMalformedItem[] = [
  // =========================================================================
  // NHÓM 1: TÀI LIỆU CẤU TRÚC PHỨC TẠP (COMPLEX DOCUMENTS)
  // =========================================================================
  {
    id: "complex-01",
    type: "complex",
    typeName: "Cấu trúc phức tạp",
    code: "48/BC-HTMB",
    title: "Báo cáo phân tích kỹ thuật luồng hàng hải đa chỉ tiêu kèm bảng 7 cột",
    desc: "Bảng dữ liệu 7 cột đa chỉ tiêu, danh sách phân cấp 4 tầng (I -> 1 -> a -> -) kiểm thử ngắt trang và tỷ lệ cột",
    badge: "Bảng 7 cột · Danh sách 4 tầng",
    tags: ["Bảng 7 cột", "Phân cấp 4 tầng", "Nhiều trang"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 48/BC-HTMB",
      subject: "V/v Phân tích đánh giá an toàn dẫn dắt tàu biển trọng tải lớn qua luồng Lạch Huyện",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Quy chuẩn kỹ thuật quốc gia về báo hiệu hàng hải QCVN 20:2015/BGTVT;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 58/2017/NĐ-CP ngày 10 tháng 5 năm 2017 của Chính phủ quy định chi tiết một số điều của Bộ luật Hàng hải Việt Nam;</em></strong></p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc báo cáo chi tiết kết quả dẫn dắt tàu container siêu trọng tải như sau:</p>
        <p><strong>Phần I. TÌNH HÌNH DẪN DẮT TÀU BIỂN TRỌNG TẢI TRÊN 100.000 DWT</strong></p>
        <p>1. Về điều kiện khí tượng thủy văn và mớn nước luồng:</p>
        <p>a) Đặc điểm thủy triều và dòng chảy ven bờ:</p>
        <p>- Dòng triều rút đạt vận tốc cực đại 2.4 hải lý/giờ tại khu vực phao số 0 đến phao số 3.</p>
        <p>- Tầm nhìn xa trung bình trong quý III đạt trên 5 hải lý, thuận lợi cho việc cập cầu cảng TC-HICT.</p>
        <p><strong>Phần II. BẢNG THỐNG KÊ CHI TIẾT CÁC CHUYẾN TÀU THỰC HIỆN DẪN DẮT NĂM 2026</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 6%;">
            <col style="width: 24%;">
            <col style="width: 14%;">
            <col style="width: 14%;">
            <col style="width: 14%;">
            <col style="width: 12%;">
            <col style="width: 16%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tên tàu biển</th>
              <th style="border: 1px solid #000; padding: 6px;">Trọng tải (DWT)</th>
              <th style="border: 1px solid #000; padding: 6px;">Chiều dài (LOA)</th>
              <th style="border: 1px solid #000; padding: 6px;">Mớn nước (m)</th>
              <th style="border: 1px solid #000; padding: 6px;">Tàu lai hỗ trợ</th>
              <th style="border: 1px solid #000; padding: 6px;">Đánh giá an toàn</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">MSC EMANUELA</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">165.908</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">366.0 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">14.2 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">03 tàu</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Tuyệt đối an toàn</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">COSCO SHIPPING PLANET</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">198.500</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">399.8 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">14.8 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">04 tàu</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Tuyệt đối an toàn</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">3</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">MAERSK MC-KINNEY MOLLER</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">194.849</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">399.0 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">15.1 m</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">04 tàu</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Tuyệt đối an toàn</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Phần III. KIẾN NGHỊ VÀ ĐỀ XUẤT GIẢI PHÁP</strong></p>
        <p>Tiếp tục nạo vét chuẩn tắc luồng hàng hải bảo đảm độ sâu thiết kế -14.0m Hải đồ để các tàu hành hải 24/7 an toàn./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Cục Hàng hải Việt Nam (để b/c);\nTổng công ty BĐATHH VN;\nCảng vụ Hàng hải Hải Phòng;\nLưu: VT, ATHH (03b).",
    },
  },
  {
    id: "complex-02",
    type: "complex",
    typeName: "Cấu trúc phức tạp",
    code: "04/BB-HHT",
    title: "Biên bản điều tra sự cố đâm va hàng hải ký 4 bên độc lập",
    desc: "Biên bản có 4 chủ thể ký tách biệt (Cảng vụ | Hoa tiêu | Thuyền trưởng tàu | Đăng kiểm viên) không có nơi nhận",
    badge: "Ký 4 bên · Không nơi nhận",
    tags: ["Ký 4 bên", "Biên bản", "Đâm va sự cố"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "BỘ GIAO THÔNG VẬN TẢI\nCỤC HÀNG HẢI VIỆT NAM",
      orgHeader2: "CẢNG VỤ HÀNG HẢI HẢI PHÒNG",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "BIÊN BẢN",
      referenceNumber: "Số: 04/BB-HHT",
      subject: "V/v Khám nghiệm hiện trường sự cố đâm va nhẹ giữa sà lan HP-2891 và tàu MV GLORY STAR",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Hôm nay, vào hồi 09 giờ 00 ngày 15 tháng 10 năm 2026, tại trụ sở Cảng vụ Hàng hải Hải Phòng.</p>
        <p>Chúng tôi gồm các thành phần tham gia điều tra lập biên bản sự việc như sau:</p>
        <p><strong>1. Đại diện Cảng vụ Hàng hải Hải Phòng:</strong> Ông Trần Anh Tuấn - Phó Giám đốc, Trưởng đoàn điều tra.</p>
        <p><strong>2. Đại diện Công ty Hoa tiêu Hàng hải miền Bắc:</strong> Ông Vũ Quốc Huy - Hoa tiêu viên dẫn tàu.</p>
        <p><strong>3. Đại diện Tàu MV GLORY STAR:</strong> Ông Capt. Johnathan Miller - Thuyền trưởng.</p>
        <p><strong>4. Đại diện Chi cục Đăng kiểm số 10:</strong> Ông Đặng Minh Quân - Đăng kiểm viên vỏ tàu.</p>
        <p><strong>I. NỘI DUNG SỰ VIỆC VÀ TÌNH TRẠNG HIỆN TRƯỜNG</strong></p>
        <p>Vào lúc 05h15 ngày 15/10/2026, trong quá trình tàu MV GLORY STAR đang giảm tốc để cập phao neo, sà lan HP-2891 cắt ngang mũi tàu dẫn tới va chạm nhẹ vào mạn phải.</p>
        <p><strong>II. KẾT LUẬN VÀ THỎA THUẬN TẠI CHỖ</strong></p>
        <p>Tổn thất không ảnh hưởng đến tính kín nước của vỏ tàu. Các bên cam kết tự thỏa thuận bồi thường dân sự theo giám định bảo hiểm.</p>
        <p>Biên bản được lập thành 04 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản và cùng ký xác nhận dưới đây./.</p>
      `,
      signTitle: "ĐẠI DIỆN CẢNG VỤ HÀNG HẢI | HOA TIÊU DẪN TÀU | THUYỀN TRƯỞNG TÀU GLORY | ĐĂNG KIỂM VIÊN CHI CỤC 10",
      signName: "Trần Anh Tuấn | Vũ Quốc Huy | Capt. Johnathan Miller | Đặng Minh Quân",
      recipients: "",
    },
  },
  {
    id: "complex-03",
    type: "complex",
    typeName: "Cấu trúc phức tạp",
    code: "215/QĐ-TCT",
    title: "Quyết định phê duyệt dự toán đầu tư thiết bị hoa tiêu kèm 2 phụ lục độc lập",
    desc: "Quyết định có 2 bảng biểu phụ lục dài, cấu trúc điều khoản quy phạm chặt chẽ",
    badge: "2 Phụ lục · Dự toán chi tiết",
    tags: ["2 Phụ lục", "Quyết định", "Bảng biểu"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "BỘ GIAO THÔNG VẬN TẢI\nTỔNG CÔNG TY BĐATHH VN",
      orgHeader2: "HỘI ĐỒNG THÀNH VIÊN",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 215/QĐ-TCT",
      subject: "V/v Phê duyệt dự toán mua sắm thiết bị dẫn đường điện tử (PPU) thế hệ mới",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Luật Doanh nghiệp số 59/2020/QH14 ngày 17 tháng 6 năm 2020;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p>
        <p><strong><em>Theo đề nghị của Tổng Giám đốc Tổng công ty tại Tờ trình số 92/TTr-TGĐ ngày 05/10/2026,</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Phê duyệt dự toán mua sắm thiết bị dẫn đường điện tử cầm tay (PPU) phục vụ hoa tiêu dẫn tàu với tổng mức đầu tư 5.800.000.000 đồng (Năm tỷ tám trăm triệu đồng chẵn).</p>
        <p><strong>Điều 2.</strong> Danh mục và tiêu chuẩn kỹ thuật thiết bị thực hiện theo Phụ lục I ban hành kèm theo Quyết định này.</p>
        <p><strong>Điều 3. Bảng phân kỳ vốn đầu tư năm 2026</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 10%;">
            <col style="width: 60%;">
            <col style="width: 30%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Giai đoạn giải ngân</th>
              <th style="border: 1px solid #000; padding: 6px;">Số tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px;">Đợt 1: Tạm ứng hợp đồng sau khi ký kết</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">1.740.000.000</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px;">Đợt 2: Nghiệm thu và bàn giao đưa vào sử dụng</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">4.060.000.000</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 4.</strong> Ban Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc và các phòng ban liên quan chịu trách nhiệm thi hành Quyết định này./.</p>
      `,
      signTitle: "TM. HỘI ĐỒNG THÀNH VIÊN\nCHỦ TỊCH",
      signName: "Đỗ Đức Tiến",
      recipients: "Bộ Giao thông vận tải (để b/c);\nTổng Giám đốc Tổng công ty;\nCông ty Hoa tiêu HH miền Bắc;\nLưu: VT, HĐTV (03b).",
    },
  },

  // =========================================================================
  // NHÓM 2: TÀI LIỆU KHÔNG ĐÚNG THỂ THỨC (NON-COMPLIANT DOCUMENTS)
  // =========================================================================
  {
    id: "noncompliant-01",
    type: "non_compliant",
    typeName: "Lỗi thể thức NĐ 30",
    code: "12/cv-athh",
    title: "Công văn sai Quốc hiệu, Tiêu ngữ, số ký hiệu thiếu 'Số:' và viết thường",
    desc: "Sai chính tả Quốc hiệu ('VN' viết tắt), Tiêu ngữ dính liền ('Độc lập-Tự do-Hạnh phúc'), số ký hiệu viết thường",
    badge: "Sai Quốc hiệu · Sai Tiêu ngữ",
    tags: ["Sai Quốc hiệu", "Sai Tiêu ngữ", "Sai số hiệu"],
    expectedIssues: [
      "Quốc hiệu bắt buộc phải là \"CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\"",
      "Tiêu ngữ bắt buộc là \"Độc lập - Tự do - Hạnh phúc\"",
      "Số ký hiệu phải bắt đầu bằng 'Số: '",
    ],
    doc: {
      regime: "administrative",
      orgHeader1: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      orgHeader2: "PHÒNG AN TOÀN HOA TIÊU",
      nationalHeader1: "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VN" as any, // LỖI 1: Sai Quốc hiệu
      nationalHeader2: "Độc lập-Tự do-Hạnh phúc" as any,      // LỖI 2: Thiếu khoảng trắng 2 bên gạch nối
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "12/cv-athh",                   // LỖI 3: Thiếu tiền tố "Số: " và viết chữ thường
      subject: "V/v Tăng cường trực ca bảo đảm an toàn hoa tiêu mùa mưa bão",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Kính gửi: Các trạm hoa tiêu và Đội tàu hoa tiêu,</p>
        <p>Dự báo áp thấp nhiệt đới trên Biển Đông có khả năng mạnh lên thành bão cấp 10, giật cấp 12 trong 24 giờ tới.</p>
        <p>Phòng An toàn Hoa tiêu yêu cầu các đồng chí hoa tiêu viên trực ca nghiêm túc, thường xuyên theo dõi thông tin trên luồng./.</p>
      `,
      signTitle: "TRƯỞNG PHÒNG",
      signName: "Nguyễn Hoàng Nam",
      recipients: "Như kính gửi;\nLưu: VT, ATHH.",
    },
  },
  {
    id: "noncompliant-02",
    type: "non_compliant",
    typeName: "Lỗi thể thức NĐ 30",
    code: "Số: .../KH-...",
    title: "Kế hoạch chứa toàn bộ Placeholder chưa điền và nơi nhận để trống",
    desc: "Cơ quan ban hành [TÊN ĐƠN VỊ], ngày tháng 'ngày ... tháng ...', số hiệu 'Số: .../KH-...', thiếu nơi lưu VT",
    badge: "Toàn bộ Placeholder · Nơi nhận rỗng",
    tags: ["Placeholder", "Nơi nhận rỗng", "Thiếu ngày tháng"],
    expectedIssues: [
      "Tên cơ quan, tổ chức ban hành văn bản không được để trống hoặc là placeholder",
      "Văn bản chưa có số ký hiệu chính thức",
      "Văn bản chưa có địa danh hoặc ngày tháng ban hành cụ thể",
      "Chưa có nơi nhận văn bản cụ thể",
    ],
    doc: {
      regime: "administrative",
      orgHeader1: "[CƠ QUAN CẤP TRÊN]",
      orgHeader2: "[TÊN CƠ QUAN BAN HÀNH]",          // LỖI 1: Placeholder
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "[Địa danh], ngày ... tháng ... năm 2026", // LỖI 2: Placeholder
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: .../KH-...",              // LỖI 3: Placeholder
      subject: "V/v Kế hoạch tổ chức diễn tập ứng phó sự cố tràn dầu trên biển",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Căn cứ tình hình thực tế và yêu cầu bảo vệ môi trường biển,</p>
        <p>Đơn vị xây dựng kế hoạch diễn tập ứng phó sự cố với mục tiêu kiểm tra năng lực phối hợp giữa các lực lượng chuyên trách.</p>
        <p>Thời gian và địa điểm chi tiết sẽ được thông báo cụ thể sau./.</p>
      `,
      signTitle: "GIÁM ĐỐC",
      signName: "[Họ và tên người ký]",              // LỖI 4: Placeholder
      recipients: "",                                 // LỖI 5: Rỗng hoàn toàn
    },
  },
  {
    id: "noncompliant-03",
    type: "non_compliant",
    typeName: "Nhầm lẫn Thể thức",
    code: "Số: 14-NQ/ĐU",
    title: "Văn bản Đảng nhưng áp dụng nhầm tiêu chuẩn thể thức Nhà nước",
    desc: "Nghị quyết Đảng nhưng ghi Quốc hiệu CHXHCNVN, Tiêu ngữ Độc lập Tự do Hạnh phúc, chức danh Chủ tịch",
    badge: "Nhầm thể thức Đảng/Nhà nước",
    tags: ["Đảng HD 05", "Sai Quốc hiệu Đảng", "Thừa Tiêu ngữ"],
    expectedIssues: [
      "Quốc hiệu bắt buộc phải là \"ĐẢNG CỘNG SẢN VIỆT NAM\"",
      "Văn bản của Đảng không có tiêu ngữ",
    ],
    doc: {
      regime: "party", // Khai báo Đảng
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BĐATHH VN",
      orgHeader2: "ĐẢNG ỦY CÔNG TY HOA TIÊU MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", // LỖI 1: Văn bản Đảng phải là ĐẢNG CỘNG SẢN VIỆT NAM
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",        // LỖI 2: Đảng không có tiêu ngữ
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "NGHỊ QUYẾT",
      referenceNumber: "Số: 14-NQ/ĐU",
      subject: "V/v Nâng cao chất lượng sinh hoạt chi bộ và công tác phát triển đảng viên",
      fontFamily: "Times New Roman",
      fontSize: 13, // LỖI 3: Đảng phải là 14pt
      bodyHtml: `
        <p>Hội nghị Ban Chấp hành Đảng bộ Công ty họp ngày 15 tháng 10 năm 2026 đã thảo luận và quyết nghị:</p>
        <p><strong>1.</strong> Đánh giá cao kết quả lãnh đạo thực hiện nhiệm vụ chính trị quý III/2026.</p>
        <p><strong>2.</strong> Yêu cầu các cấp ủy chi bộ trực thuộc tăng cường giáo dục chính trị tư tưởng cho cán bộ đảng viên./.</p>
      `,
      signTitle: "T/M ĐẢNG ỦY\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Các Chi bộ trực thuộc;\nBan Thường vụ Đảng ủy TCT (để b/c);\nLưu: VP Đảng ủy.",
    },
  },
  {
    id: "noncompliant-04",
    type: "non_compliant",
    typeName: "Lỗi thể thức NĐ 30",
    code: "Số: 99/TB-HTMB",
    title: "Thông báo sai định dạng ngày tháng và cơ quan ban hành viết chữ thường",
    desc: "Cơ quan ban hành viết chữ thường, ngày tháng viết kiểu 'ngày 5 tháng 2 năm 2026' thiếu số 0",
    badge: "Thiếu số 0 ngày/tháng · CQ thường",
    tags: ["Thiếu số 0", "CQ viết thường", "NĐ 30"],
    expectedIssues: [
      "Tên cơ quan ban hành văn bản phải được trình bày bằng chữ in hoa",
      "Ngày dưới 10 và tháng 1, 2 phải có số 0 ở trước",
    ],
    doc: {
      regime: "administrative",
      orgHeader1: "Tổng công ty Bảo đảm an toàn hàng hải VN", // Viết thường
      orgHeader2: "Công ty Hoa tiêu hàng hải miền Bắc",       // LỖI 1: Cơ quan ban hành viết chữ thường
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 5 tháng 2 năm 2026", // LỖI 2: Thiếu số 0 (ngày 05 tháng 02)
      documentType: "THÔNG BÁO",
      referenceNumber: "Số: 99/TB-HTMB",
      subject: "V/v Lịch nghỉ lễ và phân công trực an toàn hàng hải",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Công ty Hoa tiêu Hàng hải miền Bắc thông báo lịch nghỉ lễ và trực vận hành như sau:</p>
        <p>Toàn thể cán bộ nhân viên nghỉ lễ theo quy định; lực lượng hoa tiêu dẫn tàu duy trì quân số trực 100% bảo đảm thông suốt tuyến luồng./.</p>
      `,
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Các phòng, ban, trạm;\nLưu: VT (02b).",
    },
  },

  // =========================================================================
  // NHÓM 3: TÀI LIỆU SAI DỮ LIỆU & ĐỊNH DẠNG HỎNG (MALFORMED DATA)
  // =========================================================================
  {
    id: "malformed-01",
    type: "malformed_data",
    typeName: "Dữ liệu HTML hỏng",
    code: "Số: 33/BB-KT",
    title: "Biên bản có thẻ HTML bị cắt cụt, style tràn viền 2500px và thiếu thẻ đóng",
    desc: "HTML chứa thẻ table width 2500px, thẻ td/tr không đóng, kiểm thử độ an toàn của Parser và Preview",
    badge: "Bảng vỡ layout · Thẻ không đóng",
    tags: ["Thẻ không đóng", "Table vỡ", "Phục hồi HTML"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      orgHeader2: "PHÒNG KỸ THUẬT VẬT TƯ",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "BIÊN BẢN",
      referenceNumber: "Số: 33/BB-KT",
      subject: "V/v Kiểm tra kỹ thuật định kỳ xuồng đón trả hoa tiêu",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Hôm nay, ngày 15 tháng 10 năm 2026, tổ kiểm tra tiến hành kiểm tra phương tiện xuồng hoa tiêu Pilot 06:</p>
        <table style="width: 2500px; border: 5px solid red;">
          <tr>
            <td>STT<td>Tên hạng mục phụ tùng<td>Tình trạng kỹ thuật
          </tr>
          <tr>
            <td>1<td>Động cơ chính Caterpillar<td>Hoạt động ổn định, áp suất dầu bôi trơn 4.2 bar
          <tr>
            <td>2<td>Hệ thống lái thủy lực<td>Có hiện tượng rò rỉ nhẹ tại van phân phối
        </table>
        <p>Kiến nghị thay gioăng làm kín trước ngày 20/10/2026./.</p>
      `,
      signTitle: "TRƯỞNG ĐOÀN KIỂM TRA",
      signName: "Lê Đức Thắng",
      recipients: "Ban Giám đốc (để b/c);\nLưu: VT, KTVT.",
    },
  },
  {
    id: "malformed-02",
    type: "malformed_data",
    typeName: "Mã độc XSS Injection",
    code: "Số: 102/TTr-IT",
    title: "Tờ trình bị chèn mã độc Javascript, iframe và thuộc tính onerror",
    desc: "Chứa thẻ script alert, iframe độc hại, test cơ chế lọc độc hại Sanitization của DOMPurify và Parser",
    badge: "Mã độc XSS · Iframe độc",
    tags: ["XSS Injection", "DOMPurify", "An ninh mã nguồn"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      orgHeader2: "PHÒNG CÔNG NGHỆ THÔNG TIN",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "TỜ TRÌNH",
      referenceNumber: "Số: 102/TTr-IT",
      subject: "V/v Đề xuất nâng cấp bản quyền phần mềm bảo mật tường lửa mạng nội bộ",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <script>window.__MALICIOUS_FLAG = true; alert("XSS ATTACK FAILED!");</script>
        <iframe src="https://attacker.example.com/steal-cookie" style="display:none;"></iframe>
        <img src="invalid_image.jpg" onerror="window.__MALICIOUS_IMG = true; alert('IMG XSS');" />
        <p><strong><em>Kính gửi:</em></strong> Ban Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc,</p>
        <p>Để ngăn ngừa các nguy cơ tấn công mạng có chủ đích vào hệ thống chỉ huy dẫn tàu hoa tiêu, Phòng CNTT kính đề xuất nâng cấp hệ thống tường lửa thế hệ mới./.</p>
      `,
      signTitle: "TRƯỞNG PHÒNG",
      signName: "Phạm Quốc Hùng",
      recipients: "Như kính gửi;\nLưu: VT, CNTT.",
    },
  },
  {
    id: "malformed-03",
    type: "malformed_data",
    typeName: "Văn bản thô OCR",
    code: "CV-OCR-RAW",
    title: "Văn bản thô OCR scan không ngắt đoạn, dính liền khối và thiếu định dạng",
    desc: "Toàn bộ văn bản là một đoạn văn dài không có thẻ HTML cấu trúc, kiểm thử fallback parser và text wrapping",
    badge: "Văn bản thô OCR · Unstructured",
    tags: ["OCR Raw Text", "Unstructured", "Fallback Parser"],
    expectedIssues: [],
    doc: {
      regime: "administrative",
      orgHeader1: "",
      orgHeader2: "CẢNG VỤ HÀNG HẢI HẢI PHÒNG",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 512/CV-CVHH",
      subject: "V/v Khuyến nghị điều động tàu thuyền trong điều kiện sương mù dày đặc trên luồng",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `<p>CẢNG VỤ HÀNG HẢI HẢI PHÒNG THÔNG BÁO Hiện nay trên luồng hàng hải Hải Phòng từ phao số 0 đến khu vực bến cảng Đình Vũ đang xuất hiện sương mù dày đặc tầm nhìn xa giảm xuống dưới 500m Yêu cầu tất cả các tàu thuyền hành trình trên luồng tăng cường cảnh giới radar sử dụng tín hiệu sương mù theo quy định Colregs 72 Giữ liên lạc liên tục trên kênh VHF 16 và VHF 08 với Đài thông tin Duyên hải và Cảng vụ Hàng hải Khi tầm nhìn dưới 200m các tàu biển phải chủ động thả neo an toàn chờ thời tiết cải thiện mới được tiếp tục hành trình./.</p>`,
      signTitle: "GIÁM ĐỐC",
      signName: "Bùi Văn Minh",
      recipients: "Các hãng tàu, đại lý hàng hải;\nCông ty Hoa tiêu HH miền Bắc;\nLưu: VT, Pháp chế.",
    },
    rawText: `CẢNG VỤ HÀNG HẢI HẢI PHÒNG THÔNG BÁO Hiện nay trên luồng hàng hải Hải Phòng từ phao số 0 đến khu vực bến cảng Đình Vũ đang xuất hiện sương mù dày đặc tầm nhìn xa giảm xuống dưới 500m Yêu cầu tất cả các tàu thuyền hành trình trên luồng tăng cường cảnh giới radar sử dụng tín hiệu sương mù theo quy định Colregs 72 Giữ liên lạc liên tục trên kênh VHF 16 và VHF 08 với Đài thông tin Duyên hải và Cảng vụ Hàng hải Khi tầm nhìn dưới 200m các tàu biển phải chủ động thả neo an toàn chờ thời tiết cải thiện mới được tiếp tục hành trình./.`,
  },
];
