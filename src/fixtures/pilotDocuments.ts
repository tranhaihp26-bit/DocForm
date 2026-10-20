/**
 * @file pilotDocuments.ts
 * @description Bộ sưu tập 27 tài liệu Pilot Test chuẩn hóa theo Nghị định 30/2020/NĐ-CP và Hướng dẫn số 05-HD/VPTW.
 * Bao gồm 7 danh mục chính, mỗi danh mục từ 3 - 4 tài liệu với đầy đủ các thành phần thể thức bắt buộc:
 * 1. Kế hoạch (KH) - 4 tài liệu
 * 2. Quyết định (QĐ) - 4 tài liệu
 * 3. Công văn (CV) - 4 tài liệu
 * 4. Biên bản làm việc (BB) - 4 tài liệu (kèm mẫu ký 3 bên và 2 bên)
 * 5. Báo cáo (BC) - 4 tài liệu (kèm bảng số liệu thống kê chuẩn cột)
 * 6. Tờ trình (TTr) - 3 tài liệu
 * 7. Văn bản Đảng HD 05 (ĐẢNG) - 4 tài liệu
 */

import type { DocumentFormatType } from "../shared/schemas/document.schema.ts";

export interface PilotDocumentItem {
  id: string;
  category: "ke_hoach" | "quyet_dinh" | "cong_van" | "bien_ban" | "bao_cao" | "to_trinh" | "dang";
  categoryName: string;
  code: string;
  title: string;
  desc: string;
  badge: string;
  hasTable: boolean;
  signatureType: "standard" | "three_parties" | "two_parties";
  doc: DocumentFormatType;
}

export const PILOT_DOCUMENTS: PilotDocumentItem[] = [
  // =========================================================================
  // NHÓM 1: KẾ HOẠCH (4 TÀI LIỆU)
  // =========================================================================
  {
    id: "pilot-kh-01",
    category: "ke_hoach",
    categoryName: "Kế hoạch",
    code: "125/KH-HTMB",
    title: "Kế hoạch tổ chức Hội nghị Tổng kết công tác An toàn Hàng hải năm 2026",
    desc: "Kế hoạch tổng kết năm kèm bảng phân công nhiệm vụ và tiến độ 3 cột chuẩn NĐ 30",
    badge: "Kế hoạch · Bảng 3 cột",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 125/KH-HTMB",
      subject: "V/v Tổ chức Hội nghị Tổng kết Công tác An toàn Hàng hải năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Quyết định số 45/QĐ-TCT ngày 12 tháng 01 năm 2026 của Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam về việc giao kế hoạch nhiệm vụ năm 2026;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p>
        <p>Theo đề nghị của Trưởng phòng Tổ chức - Hành chính và Trưởng phòng An toàn Hoa tiêu,</p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc ban hành Kế hoạch tổ chức Hội nghị Tổng kết công tác An toàn Hàng hải năm 2026 với các nội dung trọng tâm như sau:</p>
        <p><strong>Điều 1. Mục đích và yêu cầu</strong></p>
        <p>1. Đánh giá toàn diện công tác dẫn tàu an toàn, công tác phối hợp cứu hộ cứu nạn và bảo đảm an toàn hàng hải trong vùng nước hoa tiêu được giao quản lý.</p>
        <p>2. Biểu dương các tập thể, cá nhân có thành tích xuất sắc và đề ra phương hướng, nhiệm vụ trọng tâm giai đoạn tiếp theo.</p>
        <p><strong>Điều 2. Bảng phân công tiến độ thực hiện</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 57%;">
            <col style="width: 35%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Nội dung công việc</th>
              <th style="border: 1px solid #000; padding: 6px;">Đơn vị chủ trì</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Dự thảo báo cáo tổng kết an toàn hàng hải năm 2026</td>
              <td style="border: 1px solid #000; padding: 6px;">Phòng An toàn Hoa tiêu</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Công tác khánh tiết, chuẩn bị hội trường và tài liệu phát biểu</td>
              <td style="border: 1px solid #000; padding: 6px;">Văn phòng Công ty</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">3</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Lập dự toán kinh phí và bảo đảm hậu cần phục vụ đại biểu</td>
              <td style="border: 1px solid #000; padding: 6px;">Phòng Tài chính - Kế toán</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Trách nhiệm thi hành</strong></p>
        <p>Các phòng, ban chuyên môn và toàn thể cán bộ công nhân viên, hoa tiêu viên chịu trách nhiệm thi hành Kế hoạch này./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nLãnh đạo Tổng công ty (để b/c);\nBan Giám đốc Công ty;\nLưu: VT, ATHH (03b)."
    }
  },
  {
    id: "pilot-kh-02",
    category: "ke_hoach",
    categoryName: "Kế hoạch",
    code: "142/KH-HTMB",
    title: "Kế hoạch Chuyển đổi số và Hiện đại hóa hệ thống điều hành Hoa tiêu giai đoạn 2026 - 2030",
    desc: "Kế hoạch trung hạn kèm bảng phân kỳ lộ trình 4 cột chi tiết",
    badge: "Kế hoạch · Bảng 4 cột",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 20 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 142/KH-HTMB",
      subject: "V/v Triển khai Chương trình Chuyển đổi số và Hiện đại hóa Quản trị Hoa tiêu giai đoạn 2026 - 2030",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Quyết định số 749/QĐ-TTg ngày 03 tháng 6 năm 2020 của Thủ tướng Chính phủ phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025, định hướng đến năm 2030;</em></strong></p>
        <p><strong><em>Căn cứ Nghị quyết số 18-NQ/ĐU ngày 10 tháng 02 năm 2026 của Đảng ủy Tổng công ty về nâng cao năng lực ứng dụng công nghệ số;</em></strong></p>
        <p>Theo đề nghị của Trưởng phòng Công nghệ thông tin và Trưởng phòng Kế hoạch - Kỹ thuật,</p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc ban hành Kế hoạch chuyển đổi số với các nội dung cụ thể sau:</p>
        <p><strong>Điều 1. Mục tiêu chiến lược</strong></p>
        <p>1. Đạt 100% hồ sơ công việc được xử lý trực tuyến trên môi trường số có chữ ký số điện tử theo đúng Nghị định 30/2020/NĐ-CP.</p>
        <p>2. Tự động hóa giám sát hải trình tàu thuyền hoa tiêu thời gian thực qua hệ thống AIS chuyên dụng tích hợp bản đồ số ECDIS.</p>
        <p><strong>Điều 2. Danh mục các phân hệ phần mềm và lộ trình triển khai</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 48%;">
            <col style="width: 22%;">
            <col style="width: 22%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tên phân hệ ứng dụng</th>
              <th style="border: 1px solid #000; padding: 6px;">Thời gian thực hiện</th>
              <th style="border: 1px solid #000; padding: 6px;">Đơn vị chủ trì</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Phần mềm Quản lý văn bản và điều hành điện tử chuẩn NĐ 30</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Quý I/2027</td>
              <td style="border: 1px solid #000; padding: 6px;">Văn phòng Công ty</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Ứng dụng nhật ký dẫn tàu điện tử trên máy tính bảng (Pilot e-Logbook)</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Quý II/2027</td>
              <td style="border: 1px solid #000; padding: 6px;">Phòng An toàn Hoa tiêu</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">3</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Trung tâm điều hành và phân công hoa tiêu thông minh (VMS Pilot)</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Quý IV/2027</td>
              <td style="border: 1px solid #000; padding: 6px;">Phòng Kế hoạch - Kỹ thuật</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Tổ chức thực hiện</strong></p>
        <p>Ban Quản lý dự án Chuyển đổi số có trách nhiệm định kỳ báo cáo Ban Giám đốc tiến độ vào ngày 25 hàng tháng./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nLãnh đạo Tổng công ty (để b/c);\nCục Hàng hải Việt Nam (để b/c);\nLưu: VT, CNTT."
    }
  },
  {
    id: "pilot-kh-03",
    category: "ke_hoach",
    categoryName: "Kế hoạch",
    code: "88/KH-PCTT",
    title: "Kế hoạch Phòng chống thiên tai, tìm kiếm cứu nạn và ứng phó bão lũ năm 2026",
    desc: "Kế hoạch trực ban phòng chống bão và điều động phương tiện ca nô cứu nạn",
    badge: "Kế hoạch · Cứu hộ",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 05 tháng 5 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 88/KH-PCTT",
      subject: "V/v Phòng, chống thiên tai và tìm kiếm cứu nạn mùa mưa bão năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Luật Phòng, chống thiên tai ngày 19 tháng 6 năm 2013 và Luật sửa đổi, bổ sung một số điều của Luật Phòng, chống thiên tai năm 2020;</em></strong></p>
        <p><strong><em>Căn cứ Chỉ thị của Ban Chỉ huy Phòng chống thiên tai và Tìm kiếm cứu nạn thành phố Hải Phòng;</em></strong></p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc xây dựng kế hoạch ứng trực phòng chống lụt bão với phương châm “bốn tại chỗ”:</p>
        <p><strong>Điều 1. Nhiệm vụ trọng tâm</strong></p>
        <p>1. Đảm bảo an toàn tuyệt đối cho 100% đội ngũ hoa tiêu viên và thuyền viên trực ca nô trong suốt thời gian có giông bão.</p>
        <p>2. Phối hợp Cảng vụ Hàng hải hướng dẫn tàu thuyền neo đậu tránh trú bão đúng vùng nước quy định.</p>
        <p><strong>Điều 2. Bảng phân công lực lượng và phương tiện thường trực</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 45%;">
            <col style="width: 27%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Phương tiện / Đội hình</th>
              <th style="border: 1px solid #000; padding: 6px;">Vị trí neo đậu trực</th>
              <th style="border: 1px solid #000; padding: 6px;">Chỉ huy trực</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Ca nô cao tốc Hoa tiêu 09 (công suất 800 CV)</td>
              <td style="border: 1px solid #000; padding: 6px;">Cầu cảng Trạm Hoa tiêu Đình Vũ</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Đ/c Đỗ Văn Hải</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Ca nô cao tốc Hoa tiêu 12 (công suất 1200 CV)</td>
              <td style="border: 1px solid #000; padding: 6px;">Khu neo đậu tránh bão Cát Bà</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Đ/c Lê Hữu Thắng</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Chế độ thông tin báo cáo</strong></p>
        <p>Khi có áp thấp nhiệt đới hoặc bão từ cấp 6 trở lên, Trực ban PCTT báo cáo tình hình điều động tàu về Ban Chỉ huy 2 giờ/lần./.</p>
      `,
      signTitle: "TRƯỞNG BAN CHỈ HUY PCTT\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Ban Chỉ huy PCTT TCT (để b/c);\nCảng vụ Hàng hải Hải Phòng;\nCác Trạm Hoa tiêu;\nLưu: VT, PCTT."
    }
  },
  {
    id: "pilot-kh-04",
    category: "ke_hoach",
    categoryName: "Kế hoạch",
    code: "56/KH-TCCB",
    title: "Kế hoạch Đào tạo, bồi dưỡng nâng ngạch và sát hạch Hoa tiêu viên định kỳ năm 2026",
    desc: "Kế hoạch huấn luyện chuyên môn hoa tiêu hàng hải theo thông tư Bộ GTVT",
    badge: "Kế hoạch · Đào tạo",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 3 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 56/KH-TCCB",
      subject: "V/v Đào tạo, sát hạch cấp và nâng hạng Giấy chứng nhận khả năng chuyên môn Hoa tiêu viên năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Bộ luật Hàng hải Việt Nam ngày 25 tháng 11 năm 2015;</em></strong></p>
        <p><strong><em>Căn cứ Thông tư số 27/2016/TT-BGTVT của Bộ Giao thông vận tải quy định về đào tạo, cấp chứng chỉ hoa tiêu hàng hải;</em></strong></p>
        <p>Công ty ban hành Kế hoạch huấn luyện và bồi dưỡng chuyên môn cho đội ngũ hoa tiêu viên:</p>
        <p><strong>Điều 1. Đối tượng và chỉ tiêu đào tạo</strong></p>
        <p>1. Cử 05 hoa tiêu viên hạng Ba tham gia khóa bồi dưỡng nâng lên hạng Nhì tại Trường Đại học Hàng hải Việt Nam.</p>
        <p>2. Tổ chức huấn luyện mô phỏng xử lý tình huống tàu mất lái, chết máy trong luồng hẹp cho 100% hoa tiêu viên cơ hữu.</p>
        <p><strong>Điều 2. Chỉ tiêu phân bổ theo các đơn vị trạm</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 52%;">
            <col style="width: 20%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Đơn vị Trạm Hoa tiêu</th>
              <th style="border: 1px solid #000; padding: 6px;">Chỉ tiêu (Người)</th>
              <th style="border: 1px solid #000; padding: 6px;">Kinh phí dự kiến</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Trạm Hoa tiêu Hàng hải khu vực Hải Phòng</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">08</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">120.000.000 đ</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Trạm Hoa tiêu Hàng hải khu vực Quảng Ninh</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">06</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">90.000.000 đ</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Trách nhiệm tổ chức</strong></p>
        <p>Phòng Tổ chức - Cán bộ phối hợp các cơ sở đào tạo tổ chức khai giảng đúng thời gian quy định./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nTổng công ty (để b/c);\nLưu: VT, TCCB."
    }
  },

  // =========================================================================
  // NHÓM 2: QUYẾT ĐỊNH (4 TÀI LIỆU)
  // =========================================================================
  {
    id: "pilot-qd-01",
    category: "quyet_dinh",
    categoryName: "Quyết định",
    code: "89/QĐ-HTMB",
    title: "Quyết định Kiện toàn Ban Chỉ đạo An toàn Hàng hải năm 2026",
    desc: "Quyết định nhân sự cá biệt quy chuẩn thể thức NĐ 30 kèm danh sách đính kèm",
    badge: "Quyết định · Nhân sự",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 89/QĐ-HTMB",
      subject: "V/v Kiện toàn Ban Chỉ đạo An toàn Hàng hải Công ty năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Điều lệ tổ chức và hoạt động của Công ty Hoa tiêu Hàng hải miền Bắc ban hành kèm theo Quyết định số 12/QĐ-HĐTV ngày 10 tháng 02 năm 2022 của Tổng công ty;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p>
        <p><strong><em>Theo đề nghị của Trưởng phòng Tổ chức - Cán bộ;</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Kiện toàn Ban Chỉ đạo An toàn Hàng hải Công ty Hoa tiêu Hàng hải miền Bắc gồm các thành viên sau:</p>
        <p>1. Đồng chí Nguyễn Văn Bình - Giám đốc Công ty: Trưởng ban Chỉ đạo.</p>
        <p>2. Đồng chí Trần Văn An - Phó Giám đốc Công ty phụ trách kỹ thuật: Phó Trưởng ban Thường trực.</p>
        <p>3. Đồng chí Phạm Hoàng Nam - Trưởng phòng An toàn Hoa tiêu: Ủy viên Thường trực.</p>
        <p><strong>Điều 2.</strong> Ban Chỉ đạo có trách nhiệm ban hành Quy chế làm việc, phân công nhiệm vụ cụ thể cho từng thành viên và chịu trách nhiệm trước Hội đồng thành viên Tổng công ty về công tác an toàn dẫn tàu.</p>
        <p><strong>Điều 3.</strong> Quyết định này có hiệu lực thi hành kể từ ngày ký. Các phòng, ban chuyên môn và các cá nhân có tên tại Điều 1 chịu trách nhiệm thi hành Quyết định này./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nLãnh đạo TCT (để b/c);\nLưu: VT, TCCB (02b)."
    }
  },
  {
    id: "pilot-qd-02",
    category: "quyet_dinh",
    categoryName: "Quyết định",
    code: "105/QĐ-HTMB",
    title: "Quyết định Phê duyệt dự toán mua sắm trang bị kỹ thuật và bảo hộ lao động năm 2026",
    desc: "Quyết định phê duyệt dự toán tài chính kèm bảng danh mục hàng hóa chi tiết",
    badge: "Quyết định · Dự toán",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 18 tháng 8 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 105/QĐ-HTMB",
      subject: "V/v Phê duyệt dự toán kinh phí mua sắm trang thiết bị bảo hộ lao động chuyên dùng cho Hoa tiêu viên năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Luật Đấu thầu số 22/2023/QH15 ngày 23 tháng 6 năm 2023;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 24/2024/NĐ-CP ngày 27 tháng 02 năm 2024 của Chính phủ quy định chi tiết một số điều của Luật Đấu thầu;</em></strong></p>
        <p><strong><em>Theo đề nghị của Trưởng phòng Tài chính - Kế toán và Trưởng phòng Kế hoạch - Kỹ thuật;</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Phê duyệt dự toán mua sắm trang bị bảo hộ lao động cho hoa tiêu viên với tổng kinh phí là: 485.000.000 đồng (Bằng chữ: Bốn trăm tám mươi lăm triệu đồng chẵn).</p>
        <p><strong>Điều 2.</strong> Bảng danh mục chi tiết các mặt hàng mua sắm:</p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 44%;">
            <col style="width: 14%;">
            <col style="width: 14%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tên trang thiết bị</th>
              <th style="border: 1px solid #000; padding: 6px;">ĐVT</th>
              <th style="border: 1px solid #000; padding: 6px;">Số lượng</th>
              <th style="border: 1px solid #000; padding: 6px;">Thành tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Áo phao tự thổi chuyên dụng tiêu chuẩn SOLAS có gắn đèn định vị</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Chiếc</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">80</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">192.000.000</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Bộ đàm hàng hải chống nước ICOM tiêu chuẩn phòng nổ</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Bộ</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">30</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">165.000.000</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">3</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Giày bảo hộ chống trơn trượt leo thang hoa tiêu</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Đôi</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">85</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">128.000.000</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3.</strong> Nguồn vốn thực hiện: Quỹ phát triển hoạt động sự nghiệp và chi phí sản xuất kinh doanh năm 2026 của Công ty.</p>
        <p><strong>Điều 4.</strong> Phòng Kế hoạch - Kỹ thuật chủ trì tổ chức lựa chọn nhà thầu theo đúng quy định pháp luật./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 4;\nBan Giám đốc Công ty;\nPhòng TCKT, KHKT;\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-qd-03",
    category: "quyet_dinh",
    categoryName: "Quyết định",
    code: "118/QĐ-HTMB",
    title: "Quyết định Ban hành Quy chế quản lý và khai thác phương tiện ca nô hoa tiêu",
    desc: "Quyết định quy chế quản lý kỹ thuật, định mức tiêu hao nhiên liệu",
    badge: "Quyết định · Quy chế",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 28 tháng 9 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 118/QĐ-HTMB",
      subject: "V/v Ban hành Quy chế quản lý, bảo dưỡng và điều động phương tiện ca nô đưa đón hoa tiêu",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Nghị định số 58/2017/NĐ-CP ngày 10 tháng 5 năm 2017 của Chính phủ quy định chi tiết một số điều của Bộ luật Hàng hải Việt Nam về quản lý hoạt động hàng hải;</em></strong></p>
        <p><strong><em>Theo đề nghị của Trưởng phòng Kế hoạch - Kỹ thuật và Đội trưởng Đội Ca nô;</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Ban hành kèm theo Quyết định này “Quy chế quản lý, bảo dưỡng và điều động phương tiện ca nô đưa đón hoa tiêu” áp dụng thống nhất trong toàn Công ty.</p>
        <p><strong>Điều 2.</strong> Thuyền trưởng và thuyền viên ca nô chịu trách nhiệm kiểm tra kỹ thuật máy chính, hệ thống lái và trang bị an toàn trước mỗi ca điều động đưa đón hoa tiêu.</p>
        <p><strong>Điều 3.</strong> Quyết định này có hiệu lực kể từ ngày 01 tháng 11 năm 2026 và thay thế Quyết định số 42/QĐ-HTMB ngày 15 tháng 4 năm 2021./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nTổng công ty (để b/c);\nĐội Ca nô, các Trạm HT;\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-qd-04",
    category: "quyet_dinh",
    categoryName: "Quyết định",
    code: "155/QĐ-KT",
    title: "Quyết định Khen thưởng đợt thi đua cao điểm dẫn tàu an toàn phục vụ mùa cao điểm hàng hóa",
    desc: "Quyết định khen thưởng thành tích đột xuất cho các tập thể, cá nhân",
    badge: "Quyết định · Khen thưởng",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 30 tháng 11 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 155/QĐ-KT",
      subject: "V/v Khen thưởng các tập thể, cá nhân có thành tích xuất sắc trong đợt thi đua 90 ngày đêm dẫn tàu an toàn",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p><strong><em>Căn cứ Luật Thi đua, Khen thưởng số 06/2022/QH15 ngày 15 tháng 6 năm 2022;</em></strong></p>
        <p><strong><em>Căn cứ Quy chế Thi đua, khen thưởng của Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam;</em></strong></p>
        <p><strong><em>Theo đề nghị của Hội đồng Thi đua - Khen thưởng Công ty;</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Tặng Giấy khen của Giám đốc Công ty và thưởng tiền cho 02 tập thể và 05 cá nhân đã có thành tích xuất sắc trong chiến dịch thi đua cao điểm.</p>
        <p><strong>Điều 2.</strong> Bảng phân bổ mức tiền thưởng từ Quỹ Khen thưởng Công ty:</p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 48%;">
            <col style="width: 22%;">
            <col style="width: 22%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tập thể / Cá nhân khen thưởng</th>
              <th style="border: 1px solid #000; padding: 6px;">Hình thức khen</th>
              <th style="border: 1px solid #000; padding: 6px;">Mức thưởng (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Trạm Hoa tiêu Hàng hải Hải Phòng</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Giấy khen tập thể</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">10.000.000</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Ông Trần Văn An - Hoa tiêu viên Ngoại hạng</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Giấy khen cá nhân</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">3.000.000</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3.</strong> Các phòng, ban liên quan và các tập thể, cá nhân có tên tại Điều 1 căn cứ quyết định thi hành./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nCông đoàn Công ty;\nPhòng TCKT, TCCB;\nLưu: VT, TĐKT."
    }
  },

  // =========================================================================
  // NHÓM 3: CÔNG VĂN (4 TÀI LIỆU)
  // =========================================================================
  {
    id: "pilot-cv-01",
    category: "cong_van",
    categoryName: "Công văn",
    code: "342/HTMB-VT",
    title: "Công văn gửi Hãng tàu về Đảm bảo an toàn dẫn tàu trong mùa gió chướng",
    desc: "Công văn gửi khách hàng, đại lý hàng hải về khuyến cáo an toàn luồng",
    badge: "Công văn · Khuyến cáo",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 342/HTMB-VT",
      subject: "V/v Đảm bảo an toàn dẫn tàu trong điều kiện thời tiết gió mùa Đông Bắc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Các Hãng tàu biển, Đại lý hàng hải và Doanh nghiệp khai thác cảng</p>
        <p>Hiện nay, khu vực vịnh Bắc Bộ đang bước vào giai đoạn gió mùa Đông Bắc hoạt động mạnh, sóng to gió lớn thường xuyên xuất hiện tại khu vực đón trả hoa tiêu Hòn Dấu và Cửa Lục.</p>
        <p>Để đảm bảo an toàn tuyệt đối cho người, tàu thuyền và hàng hóa, Công ty Hoa tiêu Hàng hải miền Bắc trân trọng đề nghị các đơn vị phối hợp triển khai:</p>
        <p>1. Thuyền trưởng chủ động chuẩn bị sẵn sàng thang hoa tiêu đạt chuẩn SOLAS ở mạn dưới gió an toàn trước khi ca nô hoa tiêu cập mạn.</p>
        <p>2. Duy trì liên lạc thông suốt trên kênh 16 VHF và kênh nội bộ của Trạm Hoa tiêu để cập nhật kịp thời thông số mớn nước và tình hình luồng.</p>
        <p>3. Trường hợp thời tiết vượt quá ngưỡng an toàn cho phép, Trạm Hoa tiêu sẽ phối hợp Cảng vụ thông báo tạm hoãn kế hoạch điều động.</p>
        <p>Rất mong nhận được sự hợp tác chặt chẽ của Quý cơ quan và Doanh nghiệp./.</p>
      `,
      signTitle: "KT. GIÁM ĐỐC\nPHÓ GIÁM ĐỐC",
      signName: "Trần Văn An",
      recipients: "Như kính gửi;\nTổng công ty (để b/c);\nCảng vụ Hàng hải Hải Phòng;\nLưu: VT, ATHH (02b)."
    }
  },
  {
    id: "pilot-cv-02",
    category: "cong_van",
    categoryName: "Công văn",
    code: "512/HTMB-KHKT",
    title: "Công văn đề xuất nạo vét duy tu luồng hàng hải Hải Phòng năm 2027",
    desc: "Công văn báo cáo cấp trên về độ sâu chuẩn tắc luồng hàng hải",
    badge: "Công văn · Báo cáo Cục",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 12 tháng 11 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 512/HTMB-KHKT",
      subject: "V/v Báo cáo tình hình sa bồi và kiến nghị nạo vét duy tu luồng hàng hải Hải Phòng năm 2027",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Cục Hàng hải Việt Nam</p>
        <p>Qua công tác thực tế dẫn dắt các tàu chở hàng tổng hợp và container có mớn nước lớn hành hải trên tuyến luồng Bạch Đằng và Lạch Huyện, Công ty Hoa tiêu Hàng hải miền Bắc kính báo cáo như sau:</p>
        <p>Tại một số đoạn cong thuộc luồng Bạch Đằng (từ phao số 18 đến phao số 24) hiện tượng sa bồi cục bộ diễn ra nhanh, độ sâu thực tế thấp hơn độ sâu công bố từ 0,3m đến 0,5m vào thời điểm triều kiệt.</p>
        <p>Để đảm bảo an toàn cho các thế hệ tàu trọng tải lớn ra vào cảng thuận lợi, Công ty kính đề nghị Cục Hàng hải Việt Nam sớm phê duyệt kế hoạch nạo vét duy tu đột xuất trong Quý I năm 2027.</p>
        <p>Kính trình Cục Hàng hải Việt Nam xem xét, giải quyết./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nTổng công ty (để b/c);\nCảng vụ Hàng hải HP;\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-cv-03",
    category: "cong_van",
    categoryName: "Công văn",
    code: "604/HTMB-ATHH",
    title: "Công văn phúc đáp Hãng tàu Maersk Line về phương án dẫn tàu siêu tải vào cảng Lạch Huyện",
    desc: "Công văn phản hồi phương án kỹ thuật và sử dụng tàu lai dắt",
    badge: "Công văn · Kỹ thuật",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 02 tháng 12 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 604/HTMB-ATHH",
      subject: "V/v Phúc đáp phương án dẫn thử nghiệm tàu container sức chở 14.000 TEU cập Cảng quốc tế Lạch Huyện",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Công ty TNHH Maersk Việt Nam</p>
        <p>Phúc đáp Văn bản số 88/2026/ML-OPS ngày 25 tháng 11 năm 2026 của Quý Công ty về việc đăng ký dẫn tàu container siêu lớn trọng tải 132.000 DWT cập Cảng quốc tế Lạch Huyện, Công ty Hoa tiêu Hàng hải miền Bắc có ý kiến như sau:</p>
        <p>1. Về điều kiện luồng: Tuyến luồng hàng hải Lạch Huyện đủ điều kiện tiếp nhận tàu vào thời điểm triều dâng từ +3.5m trở lên.</p>
        <p>2. Về bố trí lực lượng: Công ty sẽ cử 02 Hoa tiêu viên Ngoại hạng trực tiếp dẫn dắt cùng với 04 tàu lai dắt công suất từ 4.000 HP hỗ trợ quay trở.</p>
        <p>Đề nghị Quý Hãng tàu cung cấp sớm bản tính toán mớn nước và mô phỏng bánh lái để tổ chức họp thống nhất chi tiết phương án./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nCảng vụ Hàng hải Hải Phòng;\nCảng TC-HICT;\nLưu: VT, ATHH."
    }
  },
  {
    id: "pilot-cv-04",
    category: "cong_van",
    categoryName: "Công văn",
    code: "710/HTMB-VP",
    title: "Công văn đôn đốc các phòng trạm thực hiện chế độ báo cáo số liệu chuyển đổi số",
    desc: "Công văn hành chính nội bộ đôn đốc công tác tổng hợp số liệu",
    badge: "Công văn · Nội bộ",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 12 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 710/HTMB-VP",
      subject: "V/v Đôn đốc hoàn thành báo cáo thống kê văn bản điện tử và ký số quý IV năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Các Phòng nghiệp vụ và Trạm Hoa tiêu trực thuộc</p>
        <p>Thực hiện chỉ đạo của Tổng Giám đốc Tổng công ty về việc đánh giá mức độ trưởng thành số cơ quan hành chính và doanh nghiệp năm 2026, Văn phòng Công ty đề nghị các đơn vị:</p>
        <p>Khẩn trương rà soát toàn bộ số liệu văn bản đi, đến và văn bản luân chuyển nội bộ đã được ký số trên phần mềm văn thư số.</p>
        <p>Báo cáo gửi về Văn phòng Công ty trước 16h30 ngày 20 tháng 12 năm 2026 để tổng hợp báo cáo Hội đồng Thi đua Công ty./.</p>
      `,
      signTitle: "CHÁNH VĂN PHÒNG",
      signName: "Vũ Đình Trọng",
      recipients: "Như kính gửi;\nBan Giám đốc (để b/c);\nLưu: VT, VP."
    }
  },

  // =========================================================================
  // NHÓM 4: BIÊN BẢN LÀM VIỆC (4 TÀI LIỆU - CÓ KÝ 3 BÊN VÀ KÝ 2 BÊN)
  // =========================================================================
  {
    id: "pilot-bb-01",
    category: "bien_ban",
    categoryName: "Biên bản",
    code: "15/BB-HTMB",
    title: "Biên bản làm việc 3 bên kiểm tra điều kiện an toàn dẫn tàu siêu trọng",
    desc: "Biên bản họp thực địa 3 bên: Đại diện Cảng vụ | Đại diện Hoa tiêu | Thư ký",
    badge: "Biên bản · Ký 3 người",
    hasTable: false,
    signatureType: "three_parties",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "BIÊN BẢN LÀM VIỆC",
      referenceNumber: "Số: 15/BB-HTMB",
      subject: "V/v Khảo sát thực địa và kiểm tra điều kiện luồng dẫn tàu container 100.000 DWT",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Hôm nay, vào hồi 09 giờ 00 ngày 15 tháng 10 năm 2026, tại phòng họp Trạm Hoa tiêu Hàng hải Hải Phòng, cuộc họp gồm các bên tham gia:</p>
        <p><strong>1. Đại diện Cảng vụ Hàng hải Hải Phòng:</strong> Đồng chí Trần Văn An - Trưởng phòng Pháp chế Hàng hải.</p>
        <p><strong>2. Đại diện Công ty Hoa tiêu Hàng hải miền Bắc:</strong> Đồng chí Nguyễn Văn Bình - Giám đốc Công ty.</p>
        <p><strong>3. Thư ký ghi biên bản:</strong> Đồng chí Lê Thị Lan - Chuyên viên Phòng An toàn Hoa tiêu.</p>
        <p>Sau khi tiến hành kiểm tra hải đồ độ sâu mới nhất và đối chiếu thực tế mớn nước tàu, các bên thống nhất kết luận:</p>
        <p>- Tuyến luồng Lạch Huyện đủ độ sâu chuẩn tắc cho phép tàu trọng tải đến 100.000 DWT hành hải khi mớn nước không vượt quá 14,2m.</p>
        <p>- Yêu cầu bố trí 03 tàu lai hỗ trợ trực tại vị trí phao số 0 trước khi hoa tiêu lên tàu 30 phút.</p>
        <p>Biên bản được lập thành 03 bản có giá trị pháp lý như nhau, các bên đã đọc lại và nhất trí ký tên./.</p>
      `,
      signTitle: "ĐẠI DIỆN CẢNG VỤ | ĐẠI DIỆN HOA TIÊU | THƯ KÝ",
      signName: "Trần Văn An | Nguyễn Văn Bình | Lê Thị Lan",
      recipients: "Các bên tham dự cuộc họp;\nLưu: VT, ATHH (03b)."
    }
  },
  {
    id: "pilot-bb-02",
    category: "bien_ban",
    categoryName: "Biên bản",
    code: "24/BB-NTBG",
    title: "Biên bản Nghiệm thu kỹ thuật và bàn giao đưa vào sử dụng Ca nô Hoa tiêu cao tốc",
    desc: "Biên bản nghiệm thu bàn giao 3 thành phần: Đơn vị giao | Đơn vị nhận | Đăng kiểm viên",
    badge: "Biên bản · Nghiệm thu 3 bên",
    hasTable: true,
    signatureType: "three_parties",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 25 tháng 10 năm 2026",
      documentType: "BIÊN BẢN NGHIỆM THU",
      referenceNumber: "Số: 24/BB-NTBG",
      subject: "V/v Nghiệm thu xuất xưởng và bàn giao ca nô hoa tiêu vỏ hợp kim nhôm đóng mới năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Thời gian: 14 giờ 30 ngày 25 tháng 10 năm 2026. Địa điểm: Cầu cảng Công ty Đóng tàu Hải Minh.</p>
        <p>Thành phần tham gia nghiệm thu và bàn giao gồm:</p>
        <p><strong>1. Đơn vị thi công đóng mới (Bên giao):</strong> Ông Hoàng Mạnh Cường - Giám đốc Nhà máy.</p>
        <p><strong>2. Đơn vị chủ đầu tư (Bên nhận):</strong> Ông Nguyễn Văn Bình - Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc.</p>
        <p><strong>3. Đơn vị đăng kiểm giám sát:</strong> Ông Đỗ Quốc Tuấn - Đăng kiểm viên Chi cục Đăng kiểm số 10.</p>
        <p>Kết quả chạy thử đường dài trên biển và kiểm tra thông số kỹ thuật:</p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 48%;">
            <col style="width: 22%;">
            <col style="width: 22%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Hạng mục kiểm tra</th>
              <th style="border: 1px solid #000; padding: 6px;">Tiêu chuẩn thiết kế</th>
              <th style="border: 1px solid #000; padding: 6px;">Kết quả thực đo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Tốc độ chạy thử tải tối đa trên biển</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">≥ 22 hải lý/giờ</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">23.4 hải lý/giờ (Đạt)</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Hệ thống radar hàng hải và máy định vị vệ tinh GPS</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Hoạt động ổn định</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Tín hiệu rõ nét (Đạt)</td>
            </tr>
          </tbody>
        </table>
        <p>Các bên thống nhất nghiệm thu và bàn giao đưa ca nô vào khai thác phục vụ công tác dẫn tàu kể từ ngày ký./.</p>
      `,
      signTitle: "ĐƠN VỊ THI CÔNG | ĐƠN VỊ TIẾP NHẬN | ĐĂNG KIỂM VIÊN",
      signName: "Hoàng Mạnh Cường | Nguyễn Văn Bình | Đỗ Quốc Tuấn",
      recipients: "Bên giao (01b);\nBên nhận (01b);\nĐăng kiểm (01b);\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-bb-03",
    category: "bien_ban",
    categoryName: "Biên bản",
    code: "09/BB-BGTL",
    title: "Biên bản Bàn giao hồ sơ lưu trữ và tài liệu nghiệp vụ văn thư",
    desc: "Mẫu biên bản bàn giao 2 bên chuẩn thể thức: Bên giao và Bên nhận",
    badge: "Biên bản · 2 bên",
    hasTable: false,
    signatureType: "two_parties",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 05 tháng 11 năm 2026",
      documentType: "BIÊN BẢN BÀN GIAO",
      referenceNumber: "Số: 09/BB-BGTL",
      subject: "V/v Bàn giao tài liệu lưu trữ năm 2025 vào kho lưu trữ cơ quan",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Hôm nay, ngày 05 tháng 11 năm 2026, tại phòng Lưu trữ Công ty Hoa tiêu Hàng hải miền Bắc, tiến hành bàn giao hồ sơ gồm:</p>
        <p><strong>1. Bên giao:</strong> Bà Trần Thị Mai - Văn thư kiêm nhiệm Phòng An toàn Hoa tiêu.</p>
        <p><strong>2. Bên nhận:</strong> Ông Vũ Đình Trọng - Lưu trữ viên chuyên trách Văn phòng Công ty.</p>
        <p>Nội dung bàn giao gồm 24 hộp hồ sơ chuyên môn hoa tiêu và biên bản dẫn tàu năm 2025 đã được chỉnh lý hoàn chỉnh theo đúng hướng dẫn của Cục Văn thư và Lưu trữ nhà nước.</p>
        <p>Biên bản lập thành 02 bản, mỗi bên giữ 01 bản để làm căn cứ theo dõi tra cứu./.</p>
      `,
      signTitle: "BÊN GIAO | BÊN NHẬN",
      signName: "Trần Thị Mai | Vũ Đình Trọng",
      recipients: "Bên giao;\nBên nhận;\nLãnh đạo VP (để b/c);\nLưu: VT."
    }
  },
  {
    id: "pilot-bb-04",
    category: "bien_ban",
    categoryName: "Biên bản",
    code: "31/BB-SCTT",
    title: "Biên bản Xác minh và xử lý sự cố va quẹt luồng hàng hải",
    desc: "Biên bản điều tra sự cố hàng hải giữa Cảng vụ, Thuyền trưởng và Hoa tiêu",
    badge: "Biên bản · Sự cố 3 bên",
    hasTable: false,
    signatureType: "three_parties",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 18 tháng 11 năm 2026",
      documentType: "BIÊN BẢN XÁC MINH",
      referenceNumber: "Số: 31/BB-SCTT",
      subject: "V/v Xác minh sự cố va chạm phao tiêu báo hiệu số 14 luồng Nam Triệu",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p>Thời gian: 20 giờ 15 ngày 18 tháng 11 năm 2026. Địa điểm: Văn phòng Cảng vụ Hàng hải Hải Phòng.</p>
        <p>Các bên liên quan cùng ký biên bản gồm:</p>
        <p><strong>1. Đại diện Cảng vụ Hàng hải:</strong> Ông Nguyễn Anh Dũng - Thanh tra viên Hàng hải.</p>
        <p><strong>2. Đại diện Thuyền trưởng tàu PACIFIC:</strong> Captain Kim Min Soo - Quốc tịch Hàn Quốc.</p>
        <p><strong>3. Hoa tiêu viên dẫn tàu:</strong> Ông Đỗ Văn Hải - Hoa tiêu viên hạng Nhất.</p>
        <p>Tóm tắt diễn biến: Vào hồi 17h10 cùng ngày, trong điều kiện sương mù dày đặc tầm nhìn dưới 500m, tàu PACIFIC khi di chuyển qua phao số 14 đã va quẹt làm dịch chuyển vị trí phao. Không có thiệt hại về người và vỏ tàu.</p>
        <p>Các bên thống nhất yêu cầu chủ tàu bồi thường chi phí đưa phao về vị trí thiết kế theo quy định pháp luật./.</p>
      `,
      signTitle: "THANH TRA CẢNG VỤ | THUYỀN TRƯỞNG TÀU | HOA TIÊU DẪN TÀU",
      signName: "Nguyễn Anh Dũng | Kim Min Soo | Đỗ Văn Hải",
      recipients: "Cảng vụ Hàng hải HP (02b);\nChủ tàu PACIFIC;\nCông ty Hoa tiêu;\nLưu: VT, ATHH."
    }
  },

  // =========================================================================
  // NHÓM 5: BÁO CÁO (4 TÀI LIỆU - BẢNG SỐ LIỆU ĐỊNH LƯỢNG)
  // =========================================================================
  {
    id: "pilot-bc-01",
    category: "bao_cao",
    categoryName: "Báo cáo",
    code: "198/BC-HTMB",
    title: "Báo cáo Kết quả công tác dẫn tàu và an toàn hàng hải năm 2026",
    desc: "Báo cáo tổng kết toàn diện số lượt tàu, doanh thu và tỷ lệ an toàn 100%",
    badge: "Báo cáo · Thống kê số liệu",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 20 tháng 12 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 198/BC-HTMB",
      subject: "Báo cáo Tổng kết công tác dẫn tàu an toàn và sản xuất kinh doanh năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Hội đồng thành viên và Ban Điều hành Tổng công ty</p>
        <p>Năm 2026, trong bối cảnh khối lượng hàng hóa xuất nhập khẩu qua các cảng biển phía Bắc tăng trưởng ấn tượng, Công ty Hoa tiêu Hàng hải miền Bắc báo cáo kết quả như sau:</p>
        <p><strong>I. TÌNH HÌNH THỰC HIỆN NHIỆM VỤ DẪN TÀU</strong></p>
        <p>1. Tổng số lượt dẫn tàu toàn Công ty đạt 14.850 lượt, tăng 8,5% so với kế hoạch đề ra đầu năm.</p>
        <p>2. Đảm bảo an toàn hàng hải tuyệt đối 100%, không xảy ra bất kỳ tai nạn hàng hải nghiêm trọng nào do lỗi chủ quan của hoa tiêu.</p>
        <p><strong>II. BẢNG THỐNG KÊ SẢN LƯỢNG VÀ DOANH THU THEO TỪNG VÙNG HOA TIÊU</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 44%;">
            <col style="width: 24%;">
            <col style="width: 24%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Vùng hoa tiêu quản lý</th>
              <th style="border: 1px solid #000; padding: 6px;">Số lượt dẫn tàu (Lượt)</th>
              <th style="border: 1px solid #000; padding: 6px;">Doanh thu (Tỷ đồng)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Vùng hoa tiêu Hải Phòng và Lạch Huyện</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">9.420</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">168,5</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Vùng hoa tiêu Quảng Ninh và Cái Lân</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">4.180</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">74,2</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">3</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Vùng hoa tiêu Nam Định và Ninh Bình</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1.250</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">18,3</td>
            </tr>
          </tbody>
        </table>
        <p><strong>III. PHƯƠNG HƯỚNG NHIỆM VỤ NĂM 2027</strong></p>
        <p>Tiếp tục đổi mới công tác quản trị, nâng cao kỹ năng hoa tiêu và giữ vững kỷ cương an toàn hàng hải trên toàn tuyến./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nBan Giám đốc Tổng công ty;\nCục Hàng hải Việt Nam (để b/c);\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-bc-02",
    category: "bao_cao",
    categoryName: "Báo cáo",
    code: "82/BC-CNTT",
    title: "Báo cáo Tình hình triển khai ứng dụng phần mềm văn thư chuẩn NĐ 30",
    desc: "Báo cáo thống kê hiệu quả ứng dụng chuẩn hóa thể thức văn bản số",
    badge: "Báo cáo · Chuyển đổi số",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 82/BC-CNTT",
      subject: "Báo cáo Đánh giá kết quả triển khai phần mềm DocForm-30 và chuẩn hóa văn bản điện tử",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc</p>
        <p>Thực hiện kế hoạch hiện đại hóa văn phòng cơ quan, Phòng Công nghệ thông tin báo cáo kết quả áp dụng phần mềm DocForm-30 như sau:</p>
        <p>1. 100% văn bản hành chính đi của Công ty đều được kiểm định tuân thủ tự động theo 435 quy tắc canonical của Nghị định 30/2020/NĐ-CP trước khi ký duyệt.</p>
        <p>2. Rút ngắn thời gian soạn thảo và ban hành văn bản từ 24 giờ xuống còn dưới 30 phút.</p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 52%;">
            <col style="width: 20%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Loại hình văn bản</th>
              <th style="border: 1px solid #000; padding: 6px;">Số lượng ban hành</th>
              <th style="border: 1px solid #000; padding: 6px;">Tỷ lệ đạt chuẩn NĐ 30</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Quyết định cá biệt và quy chế</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">185 văn bản</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">100%</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Kế hoạch và Báo cáo chuyên đề</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">312 văn bản</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">100%</td>
            </tr>
          </tbody>
        </table>
        <p>Kính đề nghị Ban Giám đốc tiếp tục duy trì và nhân rộng giải pháp./.</p>
      `,
      signTitle: "TRƯỞNG PHÒNG CNTT",
      signName: "Lê Minh Tuấn",
      recipients: "Như kính gửi;\nBan Giám đốc (để chỉ đạo);\nLưu: VT, CNTT."
    }
  },
  {
    id: "pilot-bc-03",
    category: "bao_cao",
    categoryName: "Báo cáo",
    code: "45/BC-ATHH",
    title: "Báo cáo Chuyên đề Khảo sát chướng ngại vật và luồng hàng hải mùa gió chướng",
    desc: "Báo cáo kỹ thuật chi tiết các điểm cạn sa bồi trên luồng Hải Phòng",
    badge: "Báo cáo · Luồng cạn",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 12 tháng 9 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 45/BC-ATHH",
      subject: "Báo cáo Chuyên đề kết quả rà quét chướng ngại vật luồng Nam Triệu sau bão số 4",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Giám đốc Công ty và Trưởng phòng An toàn Hoa tiêu</p>
        <p>Thực hiện lệnh kiểm tra luồng sau cơn bão số 4, đội khảo sát kỹ thuật hoa tiêu đã phối hợp với tàu đo đạc chuyên dùng tiến hành rà quét toàn tuyến luồng Nam Triệu:</p>
        <p>1. Tại vị trí phao 19 cách tim luồng 25m về phía bên phải phát hiện một cụm đăng đáy nuôi trồng thủy hải sản trôi dạt vào luồng.</p>
        <p>2. Đơn vị đã kịp thời thông báo Cảng vụ Hàng hải phát thông báo hàng hải khẩn cấp và di dời chướng ngại vật ngay trong ngày.</p>
        <p>Hiện tại tuyến luồng đã thông thoáng, đảm bảo an toàn cho các phương tiện hành hải bình thường./.</p>
      `,
      signTitle: "ĐỘI TRƯỞNG ĐỘI KHẢO SÁT",
      signName: "Vũ Hải Đăng",
      recipients: "Như kính gửi;\nTrạm Hoa tiêu HP;\nLưu: VT, ATHH."
    }
  },
  {
    id: "pilot-bc-04",
    category: "bao_cao",
    categoryName: "Báo cáo",
    code: "112/BC-TCKT",
    title: "Báo cáo Tình hình giải ngân kinh phí đầu tư phát triển 9 tháng đầu năm 2026",
    desc: "Báo cáo tài chính, giải ngân vốn đầu tư công và mua sắm thiết bị",
    badge: "Báo cáo · Tài chính",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 05 tháng 10 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 112/BC-TCKT",
      subject: "Báo cáo Tình hình phân bổ và giải ngân nguồn vốn đầu tư phát triển 9 tháng năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Hội đồng thành viên Tổng công ty Bảo đảm ATHH VN</p>
        <p>Phòng Tài chính - Kế toán kính báo cáo tiến độ giải ngân các dự án đầu tư nâng cấp phương tiện ca nô đưa đón hoa tiêu:</p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 50%;">
            <col style="width: 22%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tên gói thầu / Dự án</th>
              <th style="border: 1px solid #000; padding: 6px;">Kế hoạch vốn (Tỷ VNĐ)</th>
              <th style="border: 1px solid #000; padding: 6px;">Đã giải ngân (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Đóng mới 02 ca nô hoa tiêu cao tốc 1200 CV</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">28,5</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">92%</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Nâng cấp hạ tầng công nghệ thông tin và bản đồ số</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right;">6,2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">85%</td>
            </tr>
          </tbody>
        </table>
        <p>Ước tính cả năm 2026 sẽ hoàn thành 100% kế hoạch vốn được phê duyệt./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nBan Kiểm soát TCT;\nLưu: VT, TCKT."
    }
  },

  // =========================================================================
  // NHÓM 6: TỜ TRÌNH (3 TÀI LIỆU)
  // =========================================================================
  {
    id: "pilot-ttr-01",
    category: "to_trinh",
    categoryName: "Tờ trình",
    code: "78/TTr-HTMB",
    title: "Tờ trình Đề nghị phê duyệt chủ trương đầu tư mua sắm ca nô hoa tiêu công suất lớn",
    desc: "Tờ trình gửi Tổng công ty xin chủ trương đầu tư ca nô cao tốc",
    badge: "Tờ trình · Đầu tư",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 14 tháng 8 năm 2026",
      documentType: "TỜ TRÌNH",
      referenceNumber: "Số: 78/TTr-HTMB",
      subject: "V/v Đề nghị phê duyệt chủ trương đầu tư dự án Đóng mới 02 ca nô hoa tiêu cao tốc phục vụ vùng biển Hải Phòng",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Hội đồng thành viên Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam</p>
        <p><strong><em>Căn cứ Luật Quản lý, sử dụng vốn nhà nước đầu tư vào sản xuất, kinh doanh tại doanh nghiệp;</em></strong></p>
        <p><strong><em>Căn cứ Chiến lược phát triển đội tàu và phương tiện chuyên dụng của Tổng công ty giai đoạn 2025 - 2030;</em></strong></p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc kính trình Hội đồng thành viên xem xét phê duyệt chủ trương đầu tư với các nội dung chính sau:</p>
        <p><strong>1. Tên dự án:</strong> Đầu tư đóng mới 02 ca nô hoa tiêu cao tốc chuyên dụng vỏ hợp kim nhôm, công suất máy chính 1.200 CV.</p>
        <p><strong>2. Mục tiêu đầu tư:</strong> Thay thế các phương tiện cũ đã khai thác trên 15 năm, nâng cao năng lực đón trả hoa tiêu an toàn trong điều kiện sóng gió cấp 6, cấp 7 tại vùng nước phao số 0.</p>
        <p><strong>3. Tổng mức đầu tư dự kiến:</strong> 32.000.000.000 đồng (Bằng chữ: Ba mươi hai tỷ đồng chẵn).</p>
        <p><strong>4. Nguồn vốn:</strong> Quỹ đầu tư phát triển của Công ty và vốn vay thương mại hợp pháp.</p>
        <p>Kính trình Hội đồng thành viên Tổng công ty xem xét, quyết định./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nTổng Giám đốc TCT (để b/c);\nBan Kế hoạch - Đầu tư TCT;\nLưu: VT, KHKT."
    }
  },
  {
    id: "pilot-ttr-02",
    category: "to_trinh",
    categoryName: "Tờ trình",
    code: "94/TTr-TCCB",
    title: "Tờ trình Bổ nhiệm nhân sự chức danh Phó Giám đốc phụ trách kỹ thuật",
    desc: "Tờ trình công tác cán bộ, bổ nhiệm lãnh đạo cấp phó",
    badge: "Tờ trình · Cán bộ",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 22 tháng 9 năm 2026",
      documentType: "TỜ TRÌNH",
      referenceNumber: "Số: 94/TTr-TCCB",
      subject: "V/v Đề nghị bổ nhiệm chức danh Phó Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Thường trực Đảng ủy và Tổng Giám đốc Tổng công ty</p>
        <p><strong><em>Căn cứ Quy định số 80-QĐ/TW ngày 18 tháng 8 năm 2022 của Bộ Chính trị về phân cấp quản lý cán bộ và bổ nhiệm, giới thiệu cán bộ ứng cử;</em></strong></p>
        <p><strong><em>Căn cứ kết quả lấy phiếu tín nhiệm tại Hội nghị cán bộ chủ chốt ngày 15 tháng 9 năm 2026;</em></strong></p>
        <p>Tập thể lãnh đạo Công ty Hoa tiêu Hàng hải miền Bắc kính trình phương án nhân sự bổ nhiệm chức danh Phó Giám đốc Công ty phụ trách Kỹ thuật và An toàn đối với:</p>
        <p>- Đồng chí: <strong>Trần Văn An</strong>, sinh năm 1978, Trình độ: Thạc sĩ Hàng hải, Hoa tiêu viên Ngoại hạng, Cao cấp Lý luận chính trị.</p>
        <p>Đồng chí Trần Văn An có phẩm chất chính trị vững vàng, năng lực chuyên môn xuất sắc và đạt tỷ lệ tín nhiệm 100% tại các bước quy trình cán bộ.</p>
        <p>Kính trình Lãnh đạo Tổng công ty xem xét, quyết định./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nBan Tổ chức Đảng ủy TCT;\nBan TCCB - Lao động TCT;\nLưu: VT, TCCB."
    }
  },
  {
    id: "pilot-ttr-03",
    category: "to_trinh",
    categoryName: "Tờ trình",
    code: "115/TTr-HTMB",
    title: "Tờ trình Xin phê duyệt Kế hoạch tuyển dụng Hoa tiêu viên tập sự năm 2027",
    desc: "Tờ trình kế hoạch bổ sung nhân lực hoa tiêu đáp ứng quy mô luồng Lạch Huyện",
    badge: "Tờ trình · Tuyển dụng",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "administrative",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 11 năm 2026",
      documentType: "TỜ TRÌNH",
      referenceNumber: "Số: 115/TTr-HTMB",
      subject: "V/v Phê duyệt chỉ tiêu tuyển dụng và đào tạo Hoa tiêu viên tập sự năm 2027",
      fontFamily: "Times New Roman",
      fontSize: 13,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Tổng Giám đốc Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam</p>
        <p>Để chuẩn bị lực lượng hoa tiêu đón đầu các bến cảng container số 3, 4, 5, 6 Cảng cửa ngõ quốc tế Hải Phòng đi vào hoạt động, Công ty kính trình Kế hoạch tuyển dụng:</p>
        <p>1. Chỉ tiêu tuyển dụng: 06 Sĩ quan boong tốt nghiệp chuyên ngành Điều khiển tàu biển loại Khá trở lên, có kinh nghiệm đi biển tối thiểu 24 tháng.</p>
        <p>2. Hình thức thi tuyển: Kiểm tra chuyên môn hàng hải, tiếng Anh chuyên ngành và phỏng vấn trực tiếp trước Hội đồng tuyển dụng.</p>
        <p>Kính trình Tổng Giám đốc Tổng công ty xem xét phê duyệt./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nBan TCCB Tổng công ty;\nLưu: VT, TCCB."
    }
  },

  // =========================================================================
  // NHÓM 7: VĂN BẢN ĐẢNG - HƯỚNG DẪN SỐ 05-HD/VPTW (4 TÀI LIỆU)
  // =========================================================================
  {
    id: "pilot-dang-01",
    category: "dang",
    categoryName: "Văn bản Đảng",
    code: "28-NQ/ĐU",
    title: "Nghị quyết của Đảng ủy về lãnh đạo thực hiện nhiệm vụ chính trị và an toàn hàng hải",
    desc: "Nghị quyết Đảng bộ chuẩn Hướng dẫn số 05-HD/VPTW (Font 14pt, không tiêu ngữ, cỡ chữ Đảng)",
    badge: "HD 05 · Nghị quyết Đảng",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "party",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "NGHỊ QUYẾT",
      referenceNumber: "Số: 28-NQ/ĐU",
      subject: "Về tăng cường sự lãnh đạo của Đảng đối với công tác bảo đảm an toàn hàng hải và chuyển đổi số năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 14,
      bodyHtml: `
        <p><strong><em>Căn cứ Điều lệ Đảng Cộng sản Việt Nam;</em></strong></p>
        <p><strong><em>Căn cứ Nghị quyết Đại hội Đảng bộ Công ty Hoa tiêu Hàng hải miền Bắc nhiệm kỳ 2025 - 2030;</em></strong></p>
        <p>Ban Chấp hành Đảng bộ Công ty quyết nghị các mục tiêu chiến lược sau:</p>
        <p><strong>I. QUAN ĐIỂM CHỈ ĐẠO VÀ MỤC TIÊU</strong></p>
        <p>1. Xác định an toàn hàng hải là nhiệm vụ chính trị sống còn của doanh nghiệp, gắn trách nhiệm của người đứng đầu cấp ủy và từng đảng viên hoa tiêu viên.</p>
        <p>2. Phấn đấu 100% cán bộ, đảng viên gương mẫu ứng dụng văn thư số, ký số chuẩn Nghị định 30 và Hướng dẫn 05 trong điều hành công tác.</p>
        <p><strong>II. NHIỆM VỤ VÀ GIẢI PHÁP TRỌNG TÂM</strong></p>
        <p>1. Tăng cường công tác giáo dục chính trị tư tưởng, bồi dưỡng đạo đức nghề nghiệp và bản lĩnh làm chủ luồng lạch cho hoa tiêu viên.</p>
        <p>2. Chỉ đạo Ban Giám đốc và các đoàn thể chính trị - xã hội tổ chức phong trào thi đua lao động sáng tạo, phát huy sáng kiến cải tiến kỹ thuật dẫn tàu.</p>
        <p><strong>III. TỔ CHỨC THỰC HIỆN</strong></p>
        <p>Các chi bộ trực thuộc tổ chức học tập, quán triệt và xây dựng chương trình hành động cụ thể trước ngày 30 tháng 10 năm 2026./.</p>
      `,
      signTitle: "T/M ĐẢNG BỘ\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Đảng ủy Tổng công ty (để b/c);\nCác chi bộ trực thuộc;\nBan Giám đốc Công ty;\nLưu: VP Đảng ủy."
    }
  },
  {
    id: "pilot-dang-02",
    category: "dang",
    categoryName: "Văn bản Đảng",
    code: "12-QĐ/ĐU",
    title: "Quyết định của Đảng ủy về Phân công nhiệm vụ các đồng chí Đảng ủy viên khóa 2025 - 2030",
    desc: "Quyết định phân công phụ trách khối của Ban Thường vụ và Ban Chấp hành Đảng bộ",
    badge: "HD 05 · Quyết định Đảng",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "party",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      locationAndDate: "Hải Phòng, ngày 02 tháng 8 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 12-QĐ/ĐU",
      subject: "V/v Phân công nhiệm vụ Ủy viên Ban Chấp hành Đảng bộ Công ty khóa 2025 - 2030",
      fontFamily: "Times New Roman",
      fontSize: 14,
      bodyHtml: `
        <p><strong><em>Căn cứ Quy chế làm việc của Ban Chấp hành Đảng bộ Công ty nhiệm kỳ 2025 - 2030;</em></strong></p>
        <p><strong><em>Theo đề nghị của Ban Tổ chức Đảng ủy Công ty;</em></strong></p>
        <p style="text-align: center;"><strong>BAN CHẤP HÀNH ĐẢNG BỘ QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Phân công nhiệm vụ các đồng chí Đảng ủy viên như sau:</p>
        <p>1. Đồng chí Nguyễn Văn Bình - Bí thư Đảng ủy: Phụ trách chung toàn diện công tác đảng và định hướng chiến lược doanh nghiệp.</p>
        <p>2. Đồng chí Trần Văn An - Phó Bí thư Đảng ủy: Trực tiếp phụ trách công tác tổ chức, cán bộ, kiểm tra giám sát và quy chế dân chủ cơ sở.</p>
        <p>3. Đồng chí Phạm Hoàng Nam - Đảng ủy viên: Phụ trách công tác chuyên môn an toàn hàng hải và sinh hoạt Chi bộ An toàn Hoa tiêu.</p>
        <p><strong>Điều 2.</strong> Các đồng chí Đảng ủy viên có trách nhiệm chủ động xây dựng kế hoạch công tác và báo cáo Ban Thường vụ định kỳ hàng tháng.</p>
        <p><strong>Điều 3.</strong> Quyết định có hiệu lực kể từ ngày ký. Các chi bộ trực thuộc và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành./.</p>
      `,
      signTitle: "T/M ĐẢNG BỘ\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nThường trực Đảng ủy TCT (để b/c);\nLưu: VP Đảng ủy."
    }
  },
  {
    id: "pilot-dang-03",
    category: "dang",
    categoryName: "Văn bản Đảng",
    code: "08-KH/ĐU",
    title: "Kế hoạch Kiểm tra, giám sát của Đảng ủy và Ủy ban Kiểm tra Đảng ủy năm 2026",
    desc: "Kế hoạch công tác kiểm tra tổ chức đảng và đảng viên khi có dấu hiệu vi phạm",
    badge: "HD 05 · Kiểm tra Đảng",
    hasTable: true,
    signatureType: "standard",
    doc: {
      regime: "party",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      locationAndDate: "Hải Phòng, ngày 10 tháng 01 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 08-KH/ĐU",
      subject: "Về công tác kiểm tra, giám sát của Đảng ủy và Ủy ban Kiểm tra Đảng ủy năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 14,
      bodyHtml: `
        <p><strong><em>Căn cứ Điều 30 và Điều 32 Điều lệ Đảng Cộng sản Việt Nam;</em></strong></p>
        <p><strong><em>Căn cứ Phương hướng công tác kiểm tra, giám sát nhiệm kỳ 2025 - 2030 của Đảng bộ Công ty;</em></strong></p>
        <p>Đảng ủy Công ty ban hành Kế hoạch kiểm tra, giám sát chuyên đề năm 2026:</p>
        <p><strong>Điều 1. Nội dung và đối tượng kiểm tra</strong></p>
        <p>Kiểm tra việc thực hiện nguyên tắc tập trung dân chủ, quy chế làm việc và trách nhiệm nêu gương của người đứng đầu cấp ủy chi bộ.</p>
        <p><strong>Điều 2. Bảng phân kỳ thời gian các đợt kiểm tra giám sát</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 50%;">
            <col style="width: 22%;">
            <col style="width: 20%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Tổ chức Đảng được kiểm tra</th>
              <th style="border: 1px solid #000; padding: 6px;">Thời gian thực hiện</th>
              <th style="border: 1px solid #000; padding: 6px;">Trưởng đoàn kiểm tra</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Chi bộ Trạm Hoa tiêu Hàng hải Hải Phòng</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Quý II/2026</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Đ/c Trần Văn An</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Chi bộ Phòng Tài chính - Kế toán</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Quý III/2026</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">Đ/c Lê Thị Lan</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Trách nhiệm thi hành</strong></p>
        <p>Ủy ban Kiểm tra Đảng ủy có trách nhiệm chủ trì tham mưu, lập biên bản và báo cáo kết luận sau mỗi đợt kiểm tra./.</p>
      `,
      signTitle: "T/M ĐẢNG BỘ\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "UBKT Đảng ủy TCT (để b/c);\nCác chi bộ trực thuộc;\nLưu: UBKT Đảng ủy."
    }
  },
  {
    id: "pilot-dang-04",
    category: "dang",
    categoryName: "Văn bản Đảng",
    code: "19-BC/ĐU",
    title: "Báo cáo Sơ kết công tác xây dựng Đảng và thực hiện nhiệm vụ chính trị 9 tháng đầu năm 2026",
    desc: "Báo cáo công tác Đảng chuẩn thể thức Hướng dẫn 05 của VPTW",
    badge: "HD 05 · Báo cáo Đảng",
    hasTable: false,
    signatureType: "standard",
    doc: {
      regime: "party",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      locationAndDate: "Hải Phòng, ngày 30 tháng 9 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 19-BC/ĐU",
      subject: "Báo cáo Sơ kết công tác xây dựng Đảng và lãnh đạo thực hiện nhiệm vụ chính trị 9 tháng đầu năm 2026",
      fontFamily: "Times New Roman",
      fontSize: 14,
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Ban Thường vụ Đảng ủy Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam</p>
        <p>Đảng ủy Công ty Hoa tiêu Hàng hải miền Bắc báo cáo kết quả công tác 9 tháng đầu năm và triển khai nhiệm vụ trọng tâm 3 tháng cuối năm 2026:</p>
        <p><strong>I. KẾT QUẢ CÔNG TÁC XÂY DỰNG ĐẢNG</strong></p>
        <p>1. Công tác chính trị, tư tưởng: Tổ chức 04 đợt học tập nghị quyết với tỷ lệ 100% cán bộ, đảng viên tham gia đầy đủ, nghiêm túc.</p>
        <p>2. Công tác tổ chức cán bộ và đảng viên: Đã kết nạp được 03 đảng viên mới là hoa tiêu viên trẻ có thành tích xuất sắc, chuyển đảng chính thức cho 02 đồng chí.</p>
        <p><strong>II. LÃNH ĐẠO THỰC HIỆN NHIỆM VỤ CHÍNH TRỊ</strong></p>
        <p>Đảng ủy đã ban hành các nghị quyết chuyên đề lãnh đạo Hội đồng thành viên và Ban Giám đốc hoàn thành vượt mức các chỉ tiêu kế hoạch SXKD được giao, bảo đảm an toàn hàng hải tuyệt đối.</p>
        <p>Kính báo cáo Ban Thường vụ Đảng ủy Tổng công ty theo dõi, chỉ đạo./.</p>
      `,
      signTitle: "T/M ĐẢNG BỘ\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Như kính gửi;\nCác đồng chí Đảng ủy viên;\nLưu: VP Đảng ủy."
    }
  }
];
