/**
 * @file ND30Editor.tsx
 * @description Tiptap Rich Text Editor chuyên dụng cho văn bản hành chính theo Nghị định số 30/2020/NĐ-CP
 * và Hướng dẫn số 05-HD/VPTW của Văn phòng Trung ương Đảng.
 * 
 * TÍNH NĂNG CHÍNH:
 * 1. Chèn Quốc hiệu / Tiêu ngữ chuẩn (căn giữa, in hoa, đậm, gạch ngang).
 * 2. Chèn Cơ quan ban hành chuẩn (in hoa, đứng, đậm).
 * 3. Chuẩn hóa Heading (H1, H2, H3) theo chuẩn trình bày văn bản pháp quy:
 *    - H1: Tên loại văn bản (căn giữa, in hoa, đậm, 14pt).
 *    - H2: Phân mục / Lời ban hành (QUYẾT ĐỊNH:, CHƯƠNG I...).
 *    - H3: Điều, Khoản (Điều 1., Khoản 1...).
 * 4. Chèn Căn cứ pháp lý, Khối chữ ký & Nơi nhận.
 * 5. Giữ vững font Times New Roman và giãn dòng 1.15 - 1.25 chuẩn NĐ 30.
 */

import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {workspaceEditorSafety, type EditorSafety} from '../utils/workspaceProjection.ts';
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { 
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, 
  AlignRight, AlignJustify, List, ListOrdered, Undo, Redo, 
  Heading1, Heading2, Heading3, FileText, Building2, Scale, 
  PenTool, PlusCircle, Bookmark, MapPin, Tag, Table as TableIcon,
  Trash2, Plus, Minus
} from "lucide-react";

export interface ND30EditorProps {
  /** Nội dung HTML của văn bản */
  content: string;
  /** Callback kích hoạt khi nội dung thay đổi */
  onChange: (html: string) => void;
  /** Chế độ thể thức: Hành chính nhà nước hoặc Văn bản Đảng */
  regime?: "administrative" | "party";
  /** Chiều cao tối thiểu của khung soạn thảo */
  minHeight?: string;
  /** Chế độ thanh công cụ tinh gọn khi gắn vào mặt giấy A4 Canvas */
  compactToolbar?: boolean;
  /** Ẩn thanh công cụ nội bộ để dùng thanh công cụ hợp nhất bên ngoài giấy */
  hideToolbar?: boolean;
  /** Callback trả về instance editor */
  onEditorReady?: (editor: any) => void;
}

const DOMPURIFY_CONFIG = {
  ADD_ATTR: [
    "data-source-table-id",
    "data-preserve",
    "data-block-id",
    "data-cell-id",
    "data-vmerge",
    "colspan",
    "rowspan",
    "style",
  ],
};

const PreserveTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-source-table-id": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-source-table-id"),
        renderHTML: (attributes) => {
          if (!attributes["data-source-table-id"]) return {};
          return { "data-source-table-id": attributes["data-source-table-id"] };
        },
      },
      "data-preserve": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-preserve"),
        renderHTML: (attributes) => {
          if (!attributes["data-preserve"]) return {};
          return { "data-preserve": attributes["data-preserve"] };
        },
      },
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          "data-block-id": {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              if (!attributes["data-block-id"]) return {};
              return { "data-block-id": attributes["data-block-id"] };
            },
          },
        },
      },
      {
        types: ["tableHeader"],
        attributes: {
          "data-cell-id": {
            default: null,
            parseHTML: (element) => element.getAttribute("data-cell-id"),
            renderHTML: (attributes) => {
              if (!attributes["data-cell-id"]) return {};
              return { "data-cell-id": attributes["data-cell-id"] };
            },
          },
        },
      },
    ];
  },
});

const PreserveTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-cell-id": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-cell-id"),
        renderHTML: (attributes) => {
          if (!attributes["data-cell-id"]) return {};
          return { "data-cell-id": attributes["data-cell-id"] };
        },
      },
      "data-vmerge": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-vmerge"),
        renderHTML: (attributes) => {
          if (!attributes["data-vmerge"]) return {};
          return { "data-vmerge": attributes["data-vmerge"] };
        },
      },
    };
  },
});

export const ND30Editor: React.FC<ND30EditorProps> = ({
  content,
  onChange,
  regime = "administrative",
  minHeight = "480px",
  compactToolbar = false,
  hideToolbar = false,
  onEditorReady,
}) => {
  const isParty = regime === "party";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "justify",
      }),
      PreserveTable.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      PreserveTableCell,
    ],
    content: DOMPurify.sanitize(content || "<p></p>", DOMPURIFY_CONFIG),
    editorProps: {
      attributes: {
        class: `prose max-w-none focus:outline-none min-h-[300px] ${compactToolbar ? "p-2" : "p-6"} font-serif ${isParty ? "text-[14pt]" : "text-[13pt]"} leading-[1.25] text-slate-900 [&_p]:my-2 [&_p]:text-justify [&_p]:leading-[1.25] [&_p]:indent-[1.27cm] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-3.5 [&_th]:border [&_th]:border-slate-400 [&_th]:p-2 [&_th]:bg-slate-100 [&_th]:text-center [&_th]:align-middle [&_td]:border [&_td]:border-slate-400 [&_td]:p-2 [&_td]:align-top [&_td]:indent-0 [&_td_p]:indent-0 [&_td_p]:my-0`,
        style: "font-family: 'Times New Roman', Times, serif;",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Synchronize content when external prop changes (e.g. AI format, template change, version restore)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(DOMPurify.sanitize(content || "<p></p>", DOMPURIFY_CONFIG), { emitUpdate: false });
    }
  }, [content, editor]);

  // Expose editor instance to parent component for external consolidated toolbar
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) {
    return null;
  }

  if (hideToolbar) {
    return (
      <div 
        className="bg-transparent cursor-text selection:bg-[#EEF0FE]"
        style={{ minHeight }}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }

  // ACTION 1: Chèn Quốc hiệu và Tiêu ngữ chuẩn NĐ 30
  const insertNationalHeader = () => {
    const line1 = isParty ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    const line2 = isParty ? "" : "Độc lập - Tự do - Hạnh phúc";
    const lineWidth = isParty ? "140px" : "170px";

    const htmlSnippet = `
      <p style="text-align: center;"><strong>${line1}</strong></p>
      ${line2 ? `<p style="text-align: center;"><strong>${line2}</strong></p>` : ""}
      <hr style="width: ${lineWidth}; border: none; border-top: 1px solid black; margin: 4px auto;" />
      <p></p>
    `;
    editor.chain().focus().insertContent(htmlSnippet).run();
  };

  // ACTION 2: Chèn Tên cơ quan ban hành văn bản
  const insertOrgHeader = () => {
    const parentOrg = isParty ? "[TÊN CẤP ỦY CẤP TRÊN]" : "[TÊN CƠ QUAN CẤP TRÊN]";
    const org = isParty ? "[TÊN CẤP ỦY BAN HÀNH]" : "[TÊN CƠ QUAN BAN HÀNH]";
    const refNum = isParty ? "Số: ...-NQ/[MÃ CẤP ỦY]" : "Số: .../[MÃ VĂN BẢN]";

    const htmlSnippet = `
      <p style="text-align: center;">${parentOrg}</p>
      <p style="text-align: center;"><strong>${org}</strong></p>
      <hr style="width: 80px; border: none; border-top: 1px solid black; margin: 4px auto;" />
      <p style="text-align: center;">${refNum}</p>
      <p></p>
    `;
    editor.chain().focus().insertContent(htmlSnippet).run();
  };

  // ACTION: Chèn Địa danh & Ngày tháng (Canh phải, in nghiêng, chuẩn NĐ 30)
  const insertLocationAndDate = () => {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const monthStr = (month === 1 || month === 2) ? `0${month}` : `${month}`;
    const htmlSnippet = `<p style="text-align: right;"><em>[Địa danh], ngày ${dayStr} tháng ${monthStr} năm ${year}</em></p><p></p>`;
    editor.chain().focus().insertContent(htmlSnippet).run();
  };

  // ACTION: Chèn Trích yếu nội dung (Căn giữa, in đậm và nghiêng)
  const insertSubject = () => {
    const htmlSnippet = `<p style="text-align: center;"><strong><em>V/v [Trích yếu nội dung văn bản ngắn gọn, súc tích]</em></strong></p><p></p>`;
    editor.chain().focus().insertContent(htmlSnippet).run();
  };

  // ACTION 3: Chèn Căn cứ pháp lý
  const insertLegalGround = () => {
    const groundText = isParty
      ? `<p><strong><em>Căn cứ [Tên quy định/quyết định quy định chức năng, nhiệm vụ của cấp ủy];</em></strong></p><p><strong><em>Căn cứ [Tên văn bản/chỉ thị chỉ đạo liên quan...];</em></strong></p>`
      : `<p><strong><em>Căn cứ [Tên văn bản quy phạm pháp luật quy định chức năng, nhiệm vụ của cơ quan...];</em></strong></p><p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p><p><strong><em>Theo đề nghị của [Tên đơn vị tham mưu]...;</em></strong></p>`;
    editor.chain().focus().insertContent(groundText).run();
  };

  // ACTION 4: Chèn Điều khoản mới (Điều ... / Khoản ...)
  const insertArticle = () => {
    const articleHtml = `
      <p><strong>Điều 1. [Tên điều khoản]</strong></p>
      <p style="text-indent: 1.27cm;">1. Nội dung khoản 1 chi tiết...</p>
      <p style="text-indent: 1.27cm;">2. Nội dung khoản 2 chi tiết...</p>
    `;
    editor.chain().focus().insertContent(articleHtml).run();
  };

  // ACTION 5: Chèn Khối chữ ký & Nơi nhận chuẩn NĐ 30
  const insertSignatureBlock = () => {
    const signTitle = isParty ? "T/M [CẤP ỦY BAN HÀNH]<br/>[CHỨC VỤ NGƯỜI KÝ]" : "TM. [CƠ QUAN BAN HÀNH]<br/>[CHỨC VỤ NGƯỜI KÝ]";
    const recipients = isParty ? "Như [thành phần];<br/>Lưu: VT, [Đơn vị]." : "Như [thành phần];<br/>Lưu: VT, [Đơn vị].";

    const htmlSnippet = `
      <br/>
      <table style="width: 100%; border: none; margin-top: 20px;">
        <tbody>
          <tr>
            <td style="width: 50%; vertical-align: top; font-size: 11pt;">
              <p><strong><em>Nơi nhận:</em></strong></p>
              <p>- ${recipients}</p>
            </td>
            <td style="width: 50%; text-align: center; vertical-align: top;">
              <p><strong>${signTitle}</strong></p>
              <p><em>(Ký, ghi rõ họ tên và đóng dấu)</em></p>
              <br/><br/><br/>
              <p><strong>[Họ và tên người ký]</strong></p>
            </td>
          </tr>
        </tbody>
      </table>
      <p></p>
    `;
    editor.chain().focus().insertContent(htmlSnippet).run();
  };

  // ACTION 6: Chèn Bảng phân công chuẩn NĐ 30 với tỉ lệ cột tối ưu
  const insertND30Table = () => {
    const tableHtml = `
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
            <td style="border: 1px solid #000; padding: 6px; text-align: justify;">[Nội dung công việc 1...]</td>
            <td style="border: 1px solid #000; padding: 6px;">[Đơn vị chủ trì]</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: justify;">[Nội dung công việc 2...]</td>
            <td style="border: 1px solid #000; padding: 6px;">[Đơn vị chủ trì]</td>
          </tr>
        </tbody>
      </table>
      <p></p>
    `;
    editor.chain().focus().insertContent(tableHtml).run();
  };

  return (
    <div className={compactToolbar ? "border border-slate-200 rounded-lg overflow-hidden bg-white/95 shadow-2xs" : "border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs"}>
      {/* 1. Thanh công cụ cấp cao: Thể thức NĐ 30 / HD 05 (ẩn nếu chế độ compactToolbar) */}
      {!compactToolbar && (
        <div className="bg-slate-100 border-b border-slate-200 p-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-700 px-2 py-1 flex items-center gap-1 border-r border-slate-300 mr-1">
            <Scale className="w-3.5 h-3.5 text-blue-600" /> {isParty ? "Chuẩn HD 05:" : "Chuẩn NĐ 30:"}
          </span>

          <button
            type="button"
            onClick={insertNationalHeader}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Quốc hiệu, Tiêu ngữ (căn giữa, in hoa, đậm)"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" /> Quốc hiệu/Tiêu ngữ
          </button>

          <button
            type="button"
            onClick={insertOrgHeader}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Tên cơ quan ban hành văn bản"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-600" /> Cơ quan ban hành
          </button>

          <button
            type="button"
            onClick={insertLocationAndDate}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Địa danh & Ngày tháng (canh phải, in nghiêng chuẩn NĐ 30)"
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-600" /> Địa danh & Ngày tháng
          </button>

          <button
            type="button"
            onClick={insertSubject}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Trích yếu nội dung văn bản (căn giữa, đậm, nghiêng)"
          >
            <Tag className="w-3.5 h-3.5 text-orange-600" /> Trích yếu
          </button>

          <button
            type="button"
            onClick={insertLegalGround}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn căn cứ pháp lý (in nghiêng, đậm)"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-600" /> Căn cứ pháp lý
          </button>

          <button
            type="button"
            onClick={insertArticle}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Điều, Khoản (thụt đầu dòng 1.27cm)"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600" /> Thêm Điều khoản
          </button>

          <button
            type="button"
            onClick={insertND30Table}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn Bảng phân công tiến độ chuẩn NĐ 30 với tỉ lệ cột tối ưu"
          >
            <TableIcon className="w-3.5 h-3.5 text-teal-600" /> Bảng phân công NĐ 30
          </button>

          <button
            type="button"
            onClick={insertSignatureBlock}
            className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-300 px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 shadow-2xs"
            title="Chèn khối chữ ký và nơi nhận chuẩn 2 cột"
          >
            <PenTool className="w-3.5 h-3.5 text-purple-600" /> Khối chữ ký & Nơi nhận
          </button>
        </div>
      )}

      {/* 2. Thanh công cụ định dạng chuẩn: Typography & Alignment */}
      <div className="bg-slate-50 border-b border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1 text-xs sticky top-0 z-20">
        <div className="flex flex-wrap items-center gap-1">
          {/* Headings mapped to NĐ 30 standards */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).setTextAlign("center").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("heading", { level: 1 })
                ? "bg-blue-600 text-white font-bold"
                : "text-slate-700 hover:bg-slate-200"
            }`}
            title="H1: Tên loại văn bản (căn giữa, in hoa, đậm, 14pt)"
          >
            <span className="font-bold px-1">H1 (Loại VB)</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).setTextAlign("center").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("heading", { level: 2 })
                ? "bg-blue-600 text-white font-bold"
                : "text-slate-700 hover:bg-slate-200"
            }`}
            title="H2: Lệnh hành chính (VD: QUYẾT ĐỊNH:)"
          >
            <span className="font-bold px-1">H2 (Phân mục)</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).setTextAlign("left").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("heading", { level: 3 })
                ? "bg-blue-600 text-white font-bold"
                : "text-slate-700 hover:bg-slate-200"
            }`}
            title="H3: Tiêu đề Điều khoản"
          >
            <span className="font-bold px-1">H3 (Điều)</span>
          </button>

          <span className="h-4 w-px bg-slate-300 mx-1" />

          {/* Bold, Italic, Underline */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("bold") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="In đậm (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("italic") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="In nghiêng (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("underline") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Gạch chân (Ctrl+U)"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-slate-300 mx-1" />

          {/* Text Alignment */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive({ textAlign: "left" }) ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Canh trái"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive({ textAlign: "center" }) ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Canh giữa (Quốc hiệu, Tiêu ngữ, Loại văn bản)"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive({ textAlign: "right" }) ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Canh phải (Địa danh, ngày tháng)"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            className={`p-1.5 rounded transition ${
              editor.isActive({ textAlign: "justify" }) ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Canh đều 2 bên (Nội dung văn bản chuẩn NĐ 30)"
          >
            <AlignJustify className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-slate-300 mx-1" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("bulletList") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Danh sách dấu chấm (- / •)"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded transition ${
              editor.isActive("orderedList") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Danh sách đánh số (1., 2., 3.)"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-slate-300 mx-1" />

          {/* Table Operations */}
          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className={`p-1.5 rounded transition flex items-center gap-1 ${
              editor.isActive("table") ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
            title="Chèn bảng biểu 3x3"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold hidden md:inline">Bảng</span>
          </button>

          {editor.isActive("table") && (
            <div className="flex items-center gap-0.5 bg-blue-50 border border-blue-200 rounded px-1 py-0.5">
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-1.5 py-0.5 rounded text-[10px] text-blue-700 hover:bg-blue-100 font-semibold flex items-center gap-0.5"
                title="Thêm hàng dưới"
              >
                <Plus className="w-2.5 h-2.5" /> Hàng
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-1.5 py-0.5 rounded text-[10px] text-blue-700 hover:bg-blue-100 font-semibold flex items-center gap-0.5"
                title="Thêm cột phải"
              >
                <Plus className="w-2.5 h-2.5" /> Cột
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="px-1.5 py-0.5 rounded text-[10px] text-rose-700 hover:bg-rose-100 font-semibold flex items-center gap-0.5"
                title="Xóa hàng hiện tại"
              >
                <Minus className="w-2.5 h-2.5" /> Hàng
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="px-1.5 py-0.5 rounded text-[10px] text-rose-700 hover:bg-rose-100 font-semibold flex items-center gap-0.5"
                title="Xóa cột hiện tại"
              >
                <Minus className="w-2.5 h-2.5" /> Cột
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="p-1 rounded text-rose-700 hover:bg-rose-100"
                title="Xóa toàn bộ bảng"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition"
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition"
            title="Làm lại (Ctrl+Y)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Vùng soạn thảo chính (Giả lập trang in A4) */}
      <div 
        className="bg-white overflow-y-auto cursor-text selection:bg-blue-100"
        style={{ minHeight }}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 4. Thanh trạng thái phía dưới (ẩn trong chế độ compactToolbar) */}
      {!compactToolbar && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>Font: <strong>Times New Roman (13pt - 14pt)</strong></span>
          <span>Khoảng cách dòng: <strong>1.15 - 1.25</strong> · Canh lề chuẩn: <strong>Canh đều (Justify)</strong></span>
        </div>
      )}
    </div>
  );
};

export default ND30Editor;

/** Strict DOM roundtrip: preserve text, attributes and structure, allowing only equivalent mark tags. */
function editorDomIdentity(html: string): string {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const visit = (node: Node): unknown => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element)) return null;
    const tag = ({b:'strong',i:'em',strike:'s'} as Record<string,string>)[node.localName] ?? node.localName;
    return [tag, [...node.attributes].map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0])), [...node.childNodes].map(visit)];
  };
  return JSON.stringify([...root.childNodes].filter(n=>n.nodeType!==Node.TEXT_NODE||n.textContent?.trim()).map(visit));
}

function readonlyEditorNotice(reason:string):string{
  if(reason==='schema_roundtrip_pending')return 'Đang kiểm tra khả năng giữ nguyên nội dung.';
  if(reason==='schema_roundtrip_mismatch')return 'Trình soạn thảo chưa giữ nguyên được cấu trúc và định dạng của nội dung này.';
  if(reason.includes('inline_style'))return 'Định dạng trực tiếp của nguồn chưa được chứng minh bảo toàn khi biên tập.';
  if(reason.includes('table'))return 'Bảng, ô gộp và định danh ô nguồn chưa được chứng minh bảo toàn trong trình soạn thảo.';
  if(reason.includes('img'))return 'Ảnh nguồn hiện chỉ được đối chiếu, chưa hỗ trợ biên tập bảo toàn.';
  return 'Nội dung chứa thành phần hoặc thuộc tính nguồn chưa hỗ trợ biên tập bảo toàn.';
}

/** Each canvas stays mounted by ID. Opening the editor never emits normalized HTML. */
export function WorkspaceCanvasEditor({id,content,safety,onChange,onEditorReady,onActive}:{id:string;content:string;safety:EditorSafety;onChange:(html:string)=>boolean;onEditorReady:(editor:any)=>void;onActive:()=>void}) {
  const changeRef=useRef(onChange),activeRef=useRef(onActive),readyRef=useRef(onEditorReady);
  changeRef.current=onChange;activeRef.current=onActive;readyRef.current=onEditorReady;
  const committed=useRef(content);
  const [proof,setProof]=useState<EditorSafety>({editable:false,reasons:['schema_roundtrip_pending']});
  const editor=useEditor({
    extensions:[StarterKit.configure({underline:false}),Underline,TextAlign.configure({types:['heading','paragraph'],alignments:['left','center','right','justify']})],
    parseOptions:{preserveWhitespace:'full'},
    content:safety.editable?DOMPurify.sanitize(content||'<p></p>'):'<p></p>',
    editable:false,
    editorProps:{attributes:{'aria-label':id==='body'?'Nội dung văn bản':`Nội dung phụ lục ${id}`,class:'df-workspace-prose'}},
    onFocus:()=>activeRef.current(),
    onUpdate:({editor})=>{
      if(!editor.isEditable)return;
      const html=editor.getHTML(),check=workspaceEditorSafety(html);
      if(!check.editable||!changeRef.current(html)){editor.commands.setContent(committed.current,{emitUpdate:false,parseOptions:{preserveWhitespace:'full'}});return;}
      committed.current=html;
    },
  });
  useEffect(()=>{
    if(!editor)return;
    readyRef.current(editor);
    if(!safety.editable){setProof(safety);editor.setEditable(false,false);return;}
    if(content!==committed.current){editor.commands.setContent(content||'<p></p>',{emitUpdate:false,parseOptions:{preserveWhitespace:'full'}});committed.current=content;}
    const valid=editorDomIdentity(content||'<p></p>')===editorDomIdentity(editor.getHTML());
    const next={editable:valid,reasons:valid?[]:['schema_roundtrip_mismatch']};
    setProof(next);editor.setEditable(valid,false);
  },[editor,content,safety.editable,safety.reasons.join('|')]);
  const permitted=safety.editable&&proof.editable;
  return <div className="df-workspace-canvas-content">
    {!permitted&&<div data-editor-readonly role="status"><strong>Chỉ đọc để bảo toàn nội dung.</strong><p>{(safety.editable?proof:safety).reasons.map(readonlyEditorNotice).join(' · ')}</p><div className="df-ws-source-html" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(content,{ADD_ATTR:['data-cell-id','data-source-table-id','style','colspan','rowspan']})}}/></div>}
    <div hidden={!permitted}><EditorContent editor={editor}/></div>
  </div>;
}
