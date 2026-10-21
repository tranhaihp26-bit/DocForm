import React, { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import { renderAsync } from "docx-preview";
import { Packer } from "docx";
import { 
  FileText, ZoomIn, ZoomOut, Maximize2, Minimize2, 
  Printer, Download, FileCode, CheckCircle2, Layers,
  RefreshCw, Eye, Sparkles, LayoutGrid, AlertTriangle
} from "lucide-react";
import { detectEmbeddedHeader, detectEmbeddedSignature, generateND30DocxDocument, generateND30DocxBlob, parseRecipientLines } from "../utils/docxExport";
import { preparePreviewDocument, type PreviewDocumentSource } from "../utils/previewDocument.ts";
import {
  COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_GEOMETRY_MM, COMPANY_MOTTO,
  COMPANY_NATIONAL_HEADER, COMPANY_HEADER_PARENT_LINES, COMPANY_HEADER_ISSUER_LINES,
} from "../canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PROFILE_ID, COMPANY_HEADER_HD05_GEOMETRY_MM,
  COMPANY_HEADER_HD05_PARENT_LINES, COMPANY_HEADER_HD05_ISSUER_LINES, COMPANY_HEADER_HD05_TITLE,
} from "../canonical/hd05/companyHeaderHD05.ts";
import { optimizeTableHtml } from "../utils/tableFormatUtils.ts";

export type DocumentData = PreviewDocumentSource;

export interface A4DocumentPreviewProps {
  doc: DocumentData;
  standardType: "administrative" | "party" | "state";
  previewRef: React.RefObject<HTMLDivElement | null>;
  mode?: "thumbnail" | "full";
  compact?: boolean;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onPrint?: () => void;
  onSwitchToFullPreview?: () => void;
  isExportingDocx?: boolean;
  isExportingPdf?: boolean;
}

// docx-preview does not currently apply the negative OOXML table indent. Restore
// that placement in its HTML view so it matches the exported Word document.
function positionCompanyTableInDocxPreview(root: HTMLElement, isParty: boolean) {
  if (isParty) {
    const table = Array.from(root.querySelectorAll("table"))
      .find((candidate) => candidate.textContent?.includes(COMPANY_HEADER_HD05_TITLE));
    if (!table) return;
    table.style.marginLeft = `${COMPANY_HEADER_HD05_GEOMETRY_MM.headerIndent}mm`;
    table.style.width = `${COMPANY_HEADER_HD05_GEOMETRY_MM.headerWidth}mm`;
    table.style.minWidth = `${COMPANY_HEADER_HD05_GEOMETRY_MM.headerWidth}mm`;
    table.style.tableLayout = "fixed";
    const headerCells = table.rows[0]?.cells;
    if (headerCells?.length === 2) {
      headerCells[0].style.width = `${COMPANY_HEADER_HD05_GEOMETRY_MM.leftColumn}mm`;
      headerCells[1].style.width = `${COMPANY_HEADER_HD05_GEOMETRY_MM.rightColumn}mm`;
    }
  } else {
    const table = Array.from(root.querySelectorAll("table"))
      .find((candidate) => candidate.textContent?.includes(COMPANY_HEADER_ISSUER_LINES[0]));
    if (!table) return;
    table.style.marginLeft = `${COMPANY_HEADER_GEOMETRY_MM.headerIndent}mm`;
    table.style.tableLayout = "fixed";
  }
}

export const A4DocumentPreview: React.FC<A4DocumentPreviewProps> = ({
  doc,
  standardType,
  previewRef,
  mode = "full",
  compact = false,
  onExportDocx,
  onExportPdf,
  onPrint,
  onSwitchToFullPreview,
  isExportingDocx = false,
  isExportingPdf = false,
}) => {
  const isParty = standardType === "party";
  const isCompanyHeader = !isParty && doc.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const isCompanyHeaderHD05 = isParty && doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
  const isAnyCompanyHeader = isCompanyHeader || isCompanyHeaderHD05;
  const docTypeUpper = (doc.documentType || "").trim().toUpperCase();
  const isPartyOfficialLetter = isParty && (docTypeUpper === "CÔNG VĂN" || docTypeUpper === "");
  const isImported = doc.importMetadata?.sourceType === "docx" || doc.importMetadata?.sourceType === "txt";
  const [zoomLevel, setZoomLevel] = useState<number | "auto">("auto");
  const [computedScale, setComputedScale] = useState<number>(mode === "thumbnail" ? 0.48 : 0.85);
  const [renderEngine, setRenderEngine] = useState<"docx_real" | "css_canvas">("docx_real");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalZoom, setModalZoom] = useState<number>(0.9);
  const [pageCount, setPageCount] = useState<number>(1);
  const [renderSize, setRenderSize] = useState({ width: 794, height: 1123 });
  const [isRenderingDocx, setIsRenderingDocx] = useState<boolean>(false);
  const [isDocxRenderSuccess, setIsDocxRenderSuccess] = useState<boolean>(false);
  const [docxRenderError, setDocxRenderError] = useState<boolean>(false);
  const [docxRetryKey, setDocxRetryKey] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const modalDocxContainerRef = useRef<HTMLDivElement>(null);

  // A4 sheet dimensions in CSS pixels at 96 DPI: 210mm ~ 794px, 297mm ~ 1123px
  const A4_WIDTH_PX = 794;
  const A4_HEIGHT_PX = 1123;

  // Check embedded headers / signatures in bodyHtml
  const bodyHtml = doc.bodyHtml || "";
  const hasEmbeddedHeader = detectEmbeddedHeader(bodyHtml);
  const hasEmbeddedSignature = detectEmbeddedSignature(bodyHtml);

  // 1. Calculate responsive scale based on container width
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return;
      const surface = containerRef.current;
      const style = getComputedStyle(surface);
      const containerWidth = surface.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
      if (zoomLevel === "auto") {
        if (mode === "thumbnail") {
          const autoScale = Math.min(0.6, Math.max(0.2, containerWidth / renderSize.width));
          setComputedScale(autoScale);
        } else {
          const autoScale = Math.min(1, Math.max(0.2, containerWidth / renderSize.width));
          setComputedScale(autoScale);
        }
      } else {
        setComputedScale(zoomLevel);
      }
    };

    calculateScale();
    const resizeObserver = new ResizeObserver(calculateScale);
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [zoomLevel, mode, renderSize.width]);

  useEffect(() => {
    const target = renderEngine === "docx_real" && !docxRenderError ? docxContainerRef.current : previewRef.current;
    if (!target) return;
    const measure = () => setRenderSize({ width: Math.max(A4_WIDTH_PX, target.scrollWidth), height: Math.max(A4_HEIGHT_PX, target.offsetHeight) });
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    measure();
    return () => observer.disconnect();
  }, [renderEngine, docxRenderError, previewRef]);

  // 2. Debounced DOCX Real Engine Rendering via docx-preview
  useEffect(() => {
    let isMounted = true;
    if (renderEngine === "docx_real") {
      setIsRenderingDocx(true);
      setIsDocxRenderSuccess(false);
    } else {
      setIsRenderingDocx(false);
      setIsDocxRenderSuccess(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      const targetElement = docxContainerRef.current;
      if (!targetElement) {
        if (isMounted) setIsRenderingDocx(false);
        return;
      }

      try {
        const normalizedDoc = preparePreviewDocument(doc, isParty ? "party" : "administrative");
        const blob = await generateND30DocxBlob(normalizedDoc);

        if (!isMounted || !docxContainerRef.current) return;

        docxContainerRef.current.innerHTML = "";
        await renderAsync(blob, docxContainerRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          trimXmlDeclaration: true,
          debug: false,
        });
        if (isAnyCompanyHeader && docxContainerRef.current) {
          positionCompanyTableInDocxPreview(docxContainerRef.current, isParty);
        }

        if (isMounted) {
          setDocxRenderError(false);
          setIsDocxRenderSuccess(true);
          setPageCount(Math.max(1, targetElement.querySelectorAll("section.docx").length));
        }
      } catch (err) {
        console.warn("docx-preview rendering error, falling back to CSS canvas:", err);
        if (isMounted) {
          setDocxRenderError(true);
          setIsDocxRenderSuccess(false);
        }
      } finally {
        if (isMounted) setIsRenderingDocx(false);
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [doc, standardType, isParty, isCompanyHeader, isCompanyHeaderHD05, isAnyCompanyHeader, renderEngine, docxRetryKey]);

  // 3. Render Modal DOCX Real Engine when Modal is Open
  useEffect(() => {
    if (!isModalOpen || renderEngine !== "docx_real" || !modalDocxContainerRef.current) return;

    let isMounted = true;
    const renderModalDocx = async () => {
      try {
        const normalizedDoc = preparePreviewDocument(doc, isParty ? "party" : "administrative");
        const blob = await generateND30DocxBlob(normalizedDoc);
        if (!isMounted || !modalDocxContainerRef.current) return;

        modalDocxContainerRef.current.innerHTML = "";
        await renderAsync(blob, modalDocxContainerRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          trimXmlDeclaration: true,
          debug: false,
        });
        if (isAnyCompanyHeader && modalDocxContainerRef.current) {
          positionCompanyTableInDocxPreview(modalDocxContainerRef.current, isParty);
        }
      } catch (err) {
        console.warn("Modal docx-preview render error:", err);
      }
    };

    renderModalDocx();
    return () => { isMounted = false; };
  }, [isModalOpen, doc, standardType, isParty, isCompanyHeader, isCompanyHeaderHD05, isAnyCompanyHeader, renderEngine]);

  // 4. Estimate page count for CSS Canvas fallback
  useEffect(() => {
    if (renderEngine === "docx_real" && !docxRenderError) return;
    const calculatePages = () => {
      const targetElement = previewRef.current || sheetRef.current;
      if (targetElement) {
        const height = targetElement.scrollHeight;
        const estimatedPages = Math.max(1, Math.ceil(height / A4_HEIGHT_PX));
        setPageCount(estimatedPages);
      }
    };

    calculatePages();
    const timeout = setTimeout(calculatePages, 200);
    return () => clearTimeout(timeout);
  }, [doc, bodyHtml, renderEngine, docxRenderError]);

  const handleZoomIn = () => {
    if (zoomLevel === "auto") setZoomLevel(mode === "thumbnail" ? 0.65 : 1.0);
    else setZoomLevel((prev) => Math.min(1.8, (prev as number) + 0.15));
  };

  const handleZoomOut = () => {
    if (zoomLevel === "auto") setZoomLevel(mode === "thumbnail" ? 0.35 : 0.6);
    else setZoomLevel((prev) => Math.max(0.3, (prev as number) - 0.15));
  };

  // High-fidelity CSS A4 Paper Sheet Renderer
  const renderA4SheetContent = (isModal = false) => (
    <div
      id={isModal ? undefined : "printable-document"}
      ref={isModal ? undefined : previewRef}
      className="bg-white text-slate-900 rounded-sm border border-slate-300 shadow-2xl mx-auto selection:bg-blue-100 relative text-left box-border"
      style={{
        width: "210mm",
        minHeight: "297mm",
        paddingTop: "20mm",
        paddingBottom: "20mm",
        paddingLeft: "30mm",
        paddingRight: "15mm",
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: isParty ? "14pt" : "13pt",
        lineHeight: "1.4",
        color: "#000000",
        boxSizing: "border-box",
      }}
    >
      {/* 1. Header Block (2 columns) */}
      {!hasEmbeddedHeader && isCompanyHeader && (
        <div
          className="grid text-center text-black mb-6"
          style={{
            width: `${COMPANY_HEADER_GEOMETRY_MM.headerWidth}mm`,
            marginLeft: `${COMPANY_HEADER_GEOMETRY_MM.headerIndent}mm`,
            gridTemplateColumns: `${COMPANY_HEADER_GEOMETRY_MM.leftColumn}mm ${COMPANY_HEADER_GEOMETRY_MM.rightColumn}mm`,
            fontFamily: "'Times New Roman', Times, serif",
            lineHeight: "18pt",
          }}
        >
          <div>
            <p style={{ fontSize: "12pt" }}>{COMPANY_HEADER_PARENT_LINES[0]}<br />{COMPANY_HEADER_PARENT_LINES[1]}</p>
            <div className="inline-flex flex-col items-center mt-0.5">
              <p className="font-bold whitespace-nowrap" style={{ fontSize: "12pt" }}>{COMPANY_HEADER_ISSUER_LINES[0]}</p>
              <div className="w-[42%] border-b border-black mt-0.5" />
            </div>
          </div>
          <div>
            <p className="font-bold whitespace-nowrap" style={{ fontSize: "12pt" }}>{COMPANY_NATIONAL_HEADER}</p>
            <div className="inline-flex flex-col items-center mt-0.5">
              <p className="font-bold whitespace-nowrap" style={{ fontSize: "13pt" }}>{COMPANY_MOTTO}</p>
              <div className="w-full border-b border-black mt-0.5" />
            </div>
          </div>
          <p className="mt-1" style={{ fontSize: "13pt" }}>{doc.referenceNumber || "Số: …/…"}</p>
          <p className="mt-1 italic text-right" style={{ fontSize: "13pt" }}>{doc.locationAndDate || "Hải Phòng, ngày … tháng … năm …"}</p>
        </div>
      )}
      {!hasEmbeddedHeader && isCompanyHeaderHD05 && (
        <div
          className="grid text-center text-black mb-6"
          style={{
            width: `${COMPANY_HEADER_HD05_GEOMETRY_MM.headerWidth}mm`,
            marginLeft: `${COMPANY_HEADER_HD05_GEOMETRY_MM.headerIndent}mm`,
            gridTemplateColumns: `${COMPANY_HEADER_HD05_GEOMETRY_MM.leftColumn}mm ${COMPANY_HEADER_HD05_GEOMETRY_MM.rightColumn}mm`,
            fontFamily: "'Times New Roman', Times, serif",
            lineHeight: 1.15,
          }}
        >
          <div>
            {doc.orgHeader1 && !doc.orgHeader1.includes("[Cơ quan") ? (
              <p style={{ fontSize: "14pt" }}>
                {doc.orgHeader1.split("\n").map((line, idx) => (
                  <React.Fragment key={idx}>
                    {line}
                    {idx < doc.orgHeader1!.split("\n").length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            ) : (
              <p style={{ fontSize: "14pt" }}>{COMPANY_HEADER_HD05_PARENT_LINES[0]}<br />{COMPANY_HEADER_HD05_PARENT_LINES[1]}</p>
            )}
            {doc.orgHeader2 && !doc.orgHeader2.includes("[Tên") ? (
              <div className="font-bold" style={{ fontSize: "14pt" }}>
                {doc.orgHeader2.split("\n").map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="font-bold whitespace-nowrap" style={{ fontSize: "14pt" }}>
                {COMPANY_HEADER_HD05_ISSUER_LINES[0]}<br />{COMPANY_HEADER_HD05_ISSUER_LINES[1]}
              </p>
            )}
            {/* Dấu hoa thị * cân đối giữa cơ quan và số/ký hiệu theo HD 05 */}
            <p className="font-bold" style={{ fontSize: "14pt" }}>*</p>
            <p style={{ fontSize: "14pt" }}>{doc.referenceNumber || <span className="df-preview-placeholder no-print">Chưa nhập số hiệu</span>}</p>
            {isPartyOfficialLetter && doc.subject && (
              <p className="text-[12pt] italic font-normal mt-2 text-center leading-snug">
                {doc.subject}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="inline-flex flex-col items-stretch text-right">
              <p className="font-bold whitespace-nowrap" style={{ fontSize: "15pt" }}>ĐẢNG CỘNG SẢN VIỆT NAM</p>
              {/* Nét liền 100% bằng độ dài chữ ĐẢNG CỘNG SẢN VIỆT NAM theo HD 05 */}
              <div className="w-full border-b border-black mt-0.5" />
            </div>
            <p className="italic text-right whitespace-nowrap" style={{ fontSize: "14pt", marginTop: "9pt" }}>
              {doc.locationAndDate || <span className="df-preview-placeholder no-print">Chưa nhập địa danh, ngày tháng</span>}
            </p>
          </div>
        </div>
      )}
      {!hasEmbeddedHeader && !isCompanyHeader && !isCompanyHeaderHD05 && (
        <div className="grid grid-cols-[44%_56%] text-center mb-6 gap-2 items-start text-black">
          {/* Column 1: Organization Header & Ref Number */}
          <div>
            {doc.orgHeader1 && (
              <p className={`uppercase font-normal leading-tight whitespace-pre-line ${isParty ? "text-[14pt]" : "text-[10.5pt]"}`}>
                {doc.orgHeader1}
              </p>
            )}
            {isParty ? (
              <div className="flex flex-col items-center">
                <p className="font-bold uppercase text-[14pt] leading-tight mt-0.5 whitespace-pre-line">
                  {doc.orgHeader2 || "[TÊN CẤP ỦY]"}
                </p>
                {/* Dấu hoa thị * cân đối theo HD 05 (KHÔNG có đường kẻ) */}
                <p className="font-bold text-[14pt] mt-0.5 leading-none">*</p>
              </div>
            ) : (() => {
              const lines = (doc.orgHeader2 || "[CƠ QUAN BAN HÀNH]").split("\n").filter(Boolean);
              if (lines.length === 0) lines.push("[CƠ QUAN BAN HÀNH]");
              const firstLines = lines.slice(0, -1);
              const lastLine = lines[lines.length - 1];
              return (
                <div className="flex flex-col items-center">
                  {firstLines.map((ln, idx) => (
                    <p key={idx} className="font-bold uppercase text-[11pt] leading-tight mt-0.5">{ln}</p>
                  ))}
                  <div className="inline-flex flex-col items-center mt-0.5">
                    <p className="font-bold uppercase text-[11pt] leading-tight">{lastLine}</p>
                    {/* Đường kẻ ngang nét liền dài 1/3 đến 1/2 (42%) độ dài dòng chữ cuối cùng theo NĐ 30 */}
                    <div className="w-[42%] border-b border-black mt-0.5" />
                  </div>
                </div>
              );
            })()}
            <p className={`mt-1 font-normal ${isParty ? "text-[14pt]" : "text-[10pt]"}`}>
              {doc.referenceNumber || <span className="df-preview-placeholder no-print">Chưa nhập số hiệu</span>}
            </p>
            {isPartyOfficialLetter && doc.subject && (
              <p className="text-[12pt] italic font-normal mt-2 text-center leading-snug">
                {doc.subject}
              </p>
            )}
          </div>

          {/* Column 2: National Header & Date */}
          <div>
            {isParty ? (
              <div className="inline-flex flex-col items-center">
                <p className="font-bold uppercase text-[15pt] leading-tight whitespace-nowrap">
                  {doc.nationalHeader1 || "ĐẢNG CỘNG SẢN VIỆT NAM"}
                </p>
                {/* Nét liền 100% bằng độ dài dòng chữ ĐẢNG CỘNG SẢN VIỆT NAM theo HD 05 */}
                <div className="w-full border-b border-black mt-0.5" />
              </div>
            ) : (
              <div>
                <p className="font-bold uppercase text-[11.5pt] leading-tight whitespace-nowrap">
                  {doc.nationalHeader1 || "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"}
                </p>
                <div className="inline-flex flex-col items-center mt-0.5">
                  <p className="font-bold text-[11.5pt] leading-tight whitespace-nowrap">
                    {doc.nationalHeader2 || "Độc lập - Tự do - Hạnh phúc"}
                  </p>
                  {/* Đường kẻ ngang nét liền có độ dài bằng 100% độ dài dòng chữ theo NĐ 30 */}
                  <div className="w-full border-b border-black mt-0.5" />
                </div>
              </div>
            )}
            <p className={`italic mt-1 font-normal ${isParty ? "text-[14pt] text-right" : "text-[10pt]"}`}>
              {doc.locationAndDate || <span className="df-preview-placeholder no-print">Chưa nhập địa danh, ngày tháng</span>}
            </p>
          </div>
        </div>
      )}

      {/* 2. Document Type (Tên loại văn bản) */}
      {!hasEmbeddedHeader && !isPartyOfficialLetter && doc.documentType && (
        <div className="text-center my-4">
          <h2 className={`font-bold uppercase tracking-wide ${isParty ? "text-[15pt]" : "text-[14pt]"}`}>
            {doc.documentType}
          </h2>
        </div>
      )}

      {/* 3. Subject (Trích yếu) */}
      {!hasEmbeddedHeader && !isPartyOfficialLetter && doc.subject && (
        <div className="text-center mb-4 px-4">
          <p className={`leading-snug ${isParty ? "font-bold not-italic text-[14pt]" : "font-bold italic text-[11pt]"}`}>
            {doc.subject}
          </p>
          {isParty && (
            <p className="text-center font-bold tracking-widest my-2 text-[14pt]">-----</p>
          )}
        </div>
      )}

      {/* 4. Main Body HTML */}
      <div
        className="text-justify my-4 space-y-2 [&_p]:my-2 [&_p]:text-justify [&_p]:leading-[1.25] [&_p]:indent-[1.27cm] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-3.5 [&_th]:border [&_th]:border-black [&_th]:p-2 [&_th]:font-bold [&_th]:bg-slate-50 [&_th]:text-center [&_th]:align-middle [&_td]:border [&_td]:border-black [&_td]:p-1.5 [&_td]:align-top [&_td]:indent-0 [&_td_p]:indent-0 [&_td_p]:my-0 [&_table[data-borders='false']_td]:border-none [&_table[data-borders='false']_th]:border-none [&_table.border-none_td]:border-none [&_table.border-none_th]:border-none [&_table[data-preserve='true']_th]:bg-transparent"
        style={{
          fontSize: isParty ? "14pt" : "13pt",
          fontFamily: "'Times New Roman', Times, serif",
          lineHeight: "1.25",
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(optimizeTableHtml(bodyHtml || (isImported ? "" : "<p>[Chưa có nội dung văn bản]</p>"))),
        }}
      />

      {/* 5. Signature & Recipients Block */}
      {!hasEmbeddedSignature && (!isImported || Boolean(doc.recipients || doc.signTitle || doc.signName)) && (
        doc.signTitle && doc.signTitle.includes("|") ? (
          <div className="mt-8 pt-2 items-start break-inside-avoid">
            <div className={`grid gap-4 ${doc.signTitle.split("|").length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {doc.signTitle.split("|").map((titlePart, idx) => {
                const names = (doc.signName || "").split("|").map(n => n.trim());
                const namePart = names[idx] || "";
                return (
                  <div key={idx} className="text-center">
                    <p className="font-bold uppercase text-[11pt] whitespace-pre-line leading-tight">
                      {titlePart.trim()}
                    </p>
                    <p className="text-[9.5pt] italic my-2 text-slate-600">(Ký, ghi rõ họ tên)</p>
                    <div className="h-16"></div>
                    <p className="font-bold text-[11pt]">{namePart}</p>
                  </div>
                );
              })}
            </div>
            {doc.recipients && (
              <div className="text-[10pt] leading-normal mt-6 text-left border-t border-slate-200 pt-2">
                <p className="font-bold italic">Nơi nhận:</p>
                <div className="whitespace-pre-line mt-1">
                  {parseRecipientLines(doc.recipients).map(item => `- ${item}`).join("\n")}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-[38%_62%] gap-4 pt-2 items-start break-inside-avoid">
            {/* Left Column: Recipients */}
            <div className="text-[10pt] leading-normal">
              {(doc.recipients && doc.recipients.trim()) ? <>
                <p className="font-bold italic">Nơi nhận:</p>
                <div className="whitespace-pre-line mt-1">
                  {parseRecipientLines(doc.recipients).map(item => `- ${item}`).join("\n")}
                </div>
              </> : null}
            </div>

            {/* Right Column: Sign Title & Name */}
            <div className="text-center">
              {(doc.signTitle || doc.signName) ? <>
                {doc.signTitle && (
                  <p className="font-bold uppercase text-[11pt] whitespace-pre-line leading-tight">
                    {doc.signTitle}
                  </p>
                )}
                <p className="text-[9.5pt] italic my-2 text-slate-600">(Ký, ghi rõ họ tên và đóng dấu)</p>
                <div className="h-16"></div>
                {doc.signName && <p className="font-bold text-[11pt]">{doc.signName}</p>}
              </> : (!isImported ? <>
                <p className="font-bold uppercase text-[11pt] whitespace-pre-line leading-tight">
                  {isParty ? "T/M CẤP ỦY\nBÍ THƯ" : "TM. CƠ QUAN BAN HÀNH\nGIÁM ĐỐC"}
                </p>
                <p className="text-[9.5pt] italic my-2 text-slate-600">(Ký, ghi rõ họ tên và đóng dấu)</p>
                <div className="h-16"></div>
                <p className="font-bold text-[11pt]">[Họ và tên]</p>
              </> : null)}
            </div>
          </div>
        )
      )}

      {/* 6. Independent Appendices Section */}
      {doc.appendices && Array.isArray(doc.appendices) && doc.appendices.length > 0 && (
        <div className="mt-12 pt-8 border-t border-slate-300 space-y-8">
          {doc.appendices.map((app: any, idx: number) => (
            <div key={app.id || idx} className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold uppercase text-[12pt]">
                  {app.title || `PHỤ LỤC ${idx + 1}`}
                </h3>
                {app.referenceText && (
                  <p className="italic text-[11pt] mt-1">{app.referenceText}</p>
                )}
              </div>
              <div
                className="text-justify space-y-2 [&_p]:my-2 [&_p]:text-justify [&_p]:leading-[1.25] [&_p]:indent-[1.27cm] [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-3.5 [&_th]:border [&_th]:border-black [&_th]:p-2 [&_th]:font-bold [&_th]:bg-slate-50 [&_th]:text-center [&_th]:align-middle [&_td]:border [&_td]:border-black [&_td]:p-1.5 [&_td]:align-top [&_td]:indent-0 [&_td_p]:indent-0 [&_td_p]:my-0 [&_table[data-borders='false']_td]:border-none [&_table[data-borders='false']_th]:border-none [&_table.border-none_td]:border-none [&_table.border-none_th]:border-none [&_table[data-preserve='true']_th]:bg-transparent"
                style={{
                  fontSize: isParty ? "14pt" : "13pt",
                  fontFamily: "'Times New Roman', Times, serif",
                  lineHeight: "1.25",
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(optimizeTableHtml(app.html || "")),
                }}
              />
            </div>
          ))}
        </div>
      )}
      {Boolean(doc.unclassified?.length) && (
        <div className="mt-12 pt-8 border-t border-amber-300 space-y-3">
          <h3 className="font-bold text-amber-900">KHỐI CHƯA PHÂN LOẠI — CẦN ĐỐI CHIẾU BẢN GỐC</h3>
          {doc.unclassified?.map((block) => (
            <div key={block.id}>
              <p className="font-semibold">Khối #{block.index + 1} ({block.kind})</p>
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html || `<p>${block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`) }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`df-word-preview bg-white border border-slate-200 rounded-2xl shadow-xs ${compact ? "df-word-preview-compact" : "space-y-3"} ${
      mode === "thumbnail" ? "p-3.5 sticky top-20" : "p-4 sm:p-5"
    }`}>
      {/* Top Header Bar */}
      {!compact && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>Xem trước trang A4 (210×297 mm)</span>
            </h3>
            <p className="text-[10px] text-slate-500 font-sans">
              Khổ A4 Portrait · Lề: Trên 20mm, Dưới 20mm, Trái 30mm, Phải 15mm
            </p>
          </div>
        </div>

        {/* Badges & Mode Switchers */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-100">
            {isParty ? "HD 05 (14pt)" : "NĐ 30 (13pt)"}
          </span>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium border border-slate-200 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-500" />
            {renderEngine === "docx_real" ? (
              isRenderingDocx ? (
                <span className="flex items-center gap-1 text-blue-700 font-semibold">
                  <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                  Đang dựng DOCX...
                </span>
              ) : isDocxRenderSuccess && !docxRenderError ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Bản xem DOCX
                </span>
              ) : docxRenderError ? (
                <span className="text-amber-700">Lỗi dựng DOCX (Canvas CSS)</span>
              ) : (
                `Khoảng ${pageCount} trang (ước tính)`
              )
            ) : (
              `Khoảng ${pageCount} trang (ước tính)`
            )}
          </span>

          {mode === "full" && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] ml-1">
              <button
                type="button"
                onClick={() => setRenderEngine("docx_real")}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  renderEngine === "docx_real" ? "bg-white text-blue-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
                title="Sử dụng engine Word DOCX thực tế"
              >
                Bản Word
              </button>
              <button
                type="button"
                onClick={() => setRenderEngine("css_canvas")}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  renderEngine === "css_canvas" ? "bg-white text-blue-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
                title="Sử dụng A4 Canvas CSS"
              >
                Bản mô phỏng
              </button>
            </div>
          )}
        </div>
      </div>

      }
      {compact && <div className="df-word-status" role="status">{isRenderingDocx ? "Đang dựng bản xem từ tệp Word…" : docxRenderError ? "Đang hiển thị bản mô phỏng" : `${pageCount} trang · Bản xem từ tệp Word`}</div>}

      {/* Toolbar: Zoom, Scale, Fullscreen */}
      <div className="flex flex-wrap items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            title="Thu nhỏ"
            className="p-1 hover:bg-white hover:shadow-2xs rounded text-slate-700 border border-transparent hover:border-slate-200 transition"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel("auto")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              zoomLevel === "auto"
                ? "bg-blue-600 text-white shadow-2xs font-semibold"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Vừa khung ({Math.round(computedScale * 100)}%)
          </button>
          <button
            onClick={handleZoomIn}
            title="Phóng to"
            className="p-1 hover:bg-white hover:shadow-2xs rounded text-slate-700 border border-transparent hover:border-slate-200 transition"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {!compact && <select
            aria-label="Độ thu phóng bản xem trước"
            value={zoomLevel === "auto" ? "auto" : zoomLevel}
            onChange={(e) => {
              const val = e.target.value;
              setZoomLevel(val === "auto" ? "auto" : parseFloat(val));
            }}
            className="bg-white border border-slate-200 text-[11px] rounded px-1.5 py-0.5 text-slate-700 focus:outline-none"
          >
            <option value="auto">Tự động</option>
            <option value="0.4">40%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1.0">100% (A4 chuẩn)</option>
            <option value="1.25">125%</option>
          </select>}
          {compact && <button type="button" onClick={() => setZoomLevel(1)} className="df-preview-actual">100%</button>}
        </div>

        <div className="flex items-center gap-1.5">
          {mode === "thumbnail" && onSwitchToFullPreview && (
            <button
              onClick={onSwitchToFullPreview}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 py-1 rounded-lg text-[11px] transition flex items-center gap-1 shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5" /> Xem toàn trang
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            aria-label="Mở rộng bản xem trước A4"
            className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 shadow-2xs"
          >
            <Maximize2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Mở rộng A4</span>
          </button>
        </div>
      </div>

      {/* Warning banner when docx_real engine fails to render */}
      {renderEngine === "docx_real" && docxRenderError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Không dựng được DOCX; đang xem bản mô phỏng Canvas CSS.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDocxRenderError(false);
              setDocxRetryKey((prev) => prev + 1);
            }}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-[11px] transition shrink-0 cursor-pointer"
          >
            Thử lại DOCX
          </button>
        </div>
      )}

      {/* Main Preview Container with Neutral Canvas & Centered A4 Pages */}
      <div
        ref={containerRef}
        aria-busy={isRenderingDocx}
        className={`df-word-canvas bg-slate-100 rounded-xl border border-slate-200 overflow-auto relative ${mode === "thumbnail" ? "p-3" : "p-4"}`}
      >
        {isRenderingDocx && <div className="df-word-loading" role="status"><RefreshCw className="w-5 h-5 animate-spin" /> Đang dựng trang Word…</div>}
        <div className="df-word-size" style={{ width: renderSize.width * computedScale, height: renderSize.height * computedScale }}>
          <div className="df-word-scale" style={{ width: renderSize.width, transform: `scale(${computedScale})` }}>
            {renderEngine === "docx_real" && !docxRenderError
              ? <div key="docx-real" ref={docxContainerRef} className="docx-preview-wrapper" />
              : renderA4SheetContent(false)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {(onPrint || onExportPdf || onExportDocx) && <div className="pt-1 grid grid-cols-3 gap-2">
        {onPrint && (
          <button
            onClick={onPrint}
            className="bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" /> In A4
          </button>
        )}
        {onExportPdf && (
          <button
            onClick={onExportPdf}
            disabled={isExportingPdf}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <FileCode className="w-3.5 h-3.5" /> {isExportingPdf ? "Đang xuất..." : "Xuất PDF"}
          </button>
        )}
        {onExportDocx && (
          <button
            onClick={onExportDocx}
            disabled={isExportingDocx}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> {isExportingDocx ? "Đang xuất..." : "Xuất Word"}
          </button>
        )}
      </div>

      }

      {/* FULLSCREEN / EXPANDED A4 PREVIEW MODAL */}
      {isModalOpen && (
        <div role="dialog" aria-modal="true" aria-label="Xem trước toàn màn hình"
        className="df-word-fullscreen fixed inset-0 backdrop-blur-xs z-50 flex flex-col items-center justify-between p-3 sm:p-6 overflow-hidden">
          {/* Modal Topbar */}
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 px-4 py-2.5 w-full max-w-6xl flex flex-wrap gap-3 items-center justify-between z-10 mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>Xem trước A4 (210×297 mm) — Tỷ lệ hình học chuẩn</span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                    {isParty ? "HD 05 (14pt)" : "NĐ 30 (13pt)"}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Lề: Trên 20mm, Dưới 20mm, Trái 30mm, Phải 15mm · Khoảng {pageCount} trang
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Modal Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  onClick={() => setModalZoom((z) => Math.max(0.4, z - 0.1))}
                  className="p-1 hover:bg-white rounded text-slate-700"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-medium text-slate-700">{Math.round(modalZoom * 100)}%</span>
                <button
                  onClick={() => setModalZoom((z) => Math.min(1.5, z + 0.1))}
                  className="p-1 hover:bg-white rounded text-slate-700"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setModalZoom(1.0)}
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  100%
                </button>
              </div>

              {/* Action Buttons */}
              {onPrint && (
                <button
                  onClick={onPrint}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> In
                </button>
              )}
              {onExportDocx && (
                <button
                  onClick={onExportDocx}
                  disabled={isExportingDocx}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" /> Xuất Word
                </button>
              )}

              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 p-1.5 rounded-lg font-bold transition ml-1"
                title="Đóng xem trước"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Body Container */}
          <div 
            ref={modalContainerRef}
            className="df-word-fullscreen-canvas w-full flex-1 overflow-auto rounded-xl p-4 sm:p-8 flex justify-center items-start shadow-inner"
          >
            {renderEngine === "docx_real" && !docxRenderError ? (
              <div
                key="modal-docx-real"
                style={{
                  transform: `scale(${modalZoom})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease-out",
                }}
              >
                <div ref={modalDocxContainerRef} className="docx-preview-modal-wrapper" />
              </div>
            ) : (
              <div
                key="modal-css-canvas"
                style={{
                  transform: `scale(${modalZoom})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease-out",
                }}
              >
                {renderA4SheetContent(true)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Main Workspace browser preview: consumes candidate bytes without claiming Word pagination. */
export const CandidateDocumentPreview=React.memo(function CandidateDocumentPreview({bytes,sha256,instanceId}:{bytes:Uint8Array;sha256:string;instanceId:string}) {
  const host=useRef<HTMLDivElement>(null);
  const viewport=useRef<HTMLDivElement>(null);
  const pageElements=useRef<HTMLElement[]>([]);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const [renderedSha,setRenderedSha]=useState('');
  const [zoomScale,setZoomScale]=useState<number|null>(null);
  const [currentPage,setCurrentPage]=useState(1);
  const [viewportWidth,setViewportWidth]=useState(0);
  const [geometry,setGeometry]=useState<{width:number;height:number;pageWidth:number;pageCount:number}|null>(null);
  useEffect(()=>{
    let cancelled=false;
    pageElements.current=[];
    setReady(false);setRenderedSha('');setError('');setGeometry(null);setZoomScale(null);setCurrentPage(1);host.current?.replaceChildren();
    const staging=document.createElement('div');
    const renderBytes=new Uint8Array(bytes);
    const render=async()=>{const hash=await crypto.subtle.digest('SHA-256',renderBytes.buffer);const actualSha=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');if(actualSha!==sha256)throw Error('Bytes bản xem không khớp ứng viên.');await renderAsync(renderBytes.buffer,staging,undefined,{inWrapper:true,breakPages:true,ignoreFonts:false,experimental:true});await document.fonts?.ready;const images=[...staging.querySelectorAll('img')];await Promise.all(images.map(image=>image.decode?.().catch(()=>undefined)));return actualSha;};
    const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    render().then(async actualSha=>{
      if(cancelled||!host.current)return;
      host.current.replaceChildren(...Array.from(staging.childNodes));
      await nextFrame();
      if(cancelled||!host.current)return;
      const wrapper=host.current.querySelector<HTMLElement>('.docx-wrapper');
      if(!wrapper)throw Error('Bản DOCX không có trang để xem.');
      const pageEls=[...wrapper.querySelectorAll<HTMLElement>(':scope > section.docx, :scope > .docx, :scope > .docx-page')];
      if(!pageEls.length)throw Error('Không xác định được danh sách trang trong DOCX ứng viên.');
      const pages=pageEls;
      pages.forEach((page,index)=>page.dataset.previewPage=String(index+1));
      pageElements.current=pages;
      const widths=pages.map(page=>page.getBoundingClientRect().width||page.offsetWidth).filter(width=>width>0);
      const width=Math.max(wrapper.scrollWidth,wrapper.getBoundingClientRect().width,wrapper.offsetWidth);
      const height=Math.max(wrapper.scrollHeight,wrapper.getBoundingClientRect().height,wrapper.offsetHeight);
      const pageWidth=widths.length?Math.max(...widths):width;
      setGeometry({width,height,pageWidth,pageCount:pages.length});setCurrentPage(1);setRenderedSha(actualSha);setReady(true);
    }).catch(e=>{if(!cancelled)setError(String(e));});
    return()=>{cancelled=true;};
  },[bytes,sha256,instanceId]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const measure=()=>setViewportWidth(node.clientWidth);
    measure();
    const observer=new ResizeObserver(measure);observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  const fitScale=ready&&geometry&&viewportWidth>0?Math.min(1,Math.max(.1,(viewportWidth-32)/geometry.pageWidth)):1;
  const scale=zoomScale??fitScale;
  const layoutWidth=geometry?geometry.width*scale:undefined;
  const layoutHeight=geometry?geometry.height*scale:undefined;
  const updateCurrentPage=useCallback(()=>{
    const viewportNode=viewport.current;
    if(!viewportNode||!pageElements.current.length)return;
    const top=viewportNode.getBoundingClientRect().top+10;
    const index=pageElements.current.findIndex(page=>page.getBoundingClientRect().bottom>top);
    setCurrentPage(index<0?pageElements.current.length:index+1);
  },[]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    node.addEventListener('scroll',updateCurrentPage,{passive:true});
    return()=>node.removeEventListener('scroll',updateCurrentPage);
  },[updateCurrentPage,ready]);
  const goToPage=useCallback((pageIndex:number)=>{
    const viewportNode=viewport.current;
    const page=pageElements.current[pageIndex];
    if(!viewportNode||!page)return;
    const viewportRect=viewportNode.getBoundingClientRect();
    const pageRect=page.getBoundingClientRect();
    viewportNode.scrollTo({top:Math.max(0,viewportNode.scrollTop+pageRect.top-viewportRect.top-12),behavior:'smooth'});
    setCurrentPage(pageIndex+1);
  },[]);
  const setRelativeZoom=(direction:-1|1)=>setZoomScale(Math.min(1.5,Math.max(.35,scale+direction*.1)));
  return <section className="df-candidate-preview" data-candidate-preview data-preview-bytes-sha={renderedSha||undefined} data-candidate-sha={sha256} data-candidate-instance={instanceId} data-preview-page-count={ready?geometry?.pageCount:undefined} aria-label="Bản xem DOCX ứng viên">
      <p className="df-candidate-preview-note">Bản xem được dựng từ DOCX ứng viên hiện hành.</p>
      {!ready&&!error&&<p role="status">Đang dựng bản xem từ DOCX ứng viên…</p>}
    {error&&<p role="alert">Không dựng được bản xem: {error}. Không thay bằng bản dựng khác.</p>}
    <div className="df-candidate-preview-toolbar" role="toolbar" aria-label="Điều hướng trang và thu phóng">
      <div className="df-candidate-page-nav">
        <button type="button" data-preview-prev aria-label="Vùng xem trước" disabled={!ready||currentPage<=1} onClick={()=>goToPage(currentPage-2)}>‹</button>
        <span aria-live="polite">Vùng xem <strong>{ready?currentPage:'—'}</strong> / {ready?geometry?.pageCount??0:'—'}</span>
        <button type="button" data-preview-next aria-label="Vùng xem sau" disabled={!ready||currentPage>=(geometry?.pageCount??0)} onClick={()=>goToPage(currentPage)}>›</button>
      </div>
      <span className="df-candidate-page-orientation">A4 dọc</span>
      <div className="df-candidate-zoom-controls">
        <button type="button" aria-label="Thu nhỏ" disabled={!ready} onClick={()=>setRelativeZoom(-1)}>−</button>
        <span>{Math.round(scale*100)}%</span>
        <button type="button" aria-label="Phóng to" disabled={!ready} onClick={()=>setRelativeZoom(1)}>+</button>
        <button type="button" data-preview-fit aria-pressed={zoomScale===null} disabled={!ready} onClick={()=>setZoomScale(null)}>Vừa chiều rộng</button>
        <button type="button" data-preview-actual aria-pressed={zoomScale===1} disabled={!ready} onClick={()=>setZoomScale(1)}>100%</button>
      </div>
      <span className="df-candidate-preview-state">Bản xem trình duyệt · phân trang tham khảo</span>
    </div>
    <div className="df-candidate-preview-layout">
      <nav className="df-candidate-page-list" aria-label="Danh sách vùng xem DOCX">
        <h3>Vùng xem</h3>
        {ready&&geometry&&geometry.pageCount>0?Array.from({length:geometry.pageCount},(_,index)=><button type="button" key={index} data-preview-page-link={index+1} aria-current={currentPage===index+1?'page':undefined} onClick={()=>goToPage(index)}><span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><span>Vùng {index+1}</span></button>):<p>{ready?'Không tìm thấy vùng xem DOCX.':'Đang dựng bản xem…'}</p>}
      </nav>
      <div className="df-candidate-preview-scroll" ref={viewport} data-preview-mode={zoomScale===null?'fit':zoomScale===1?'actual':'manual'} data-preview-ready={String(ready)}>
        <div className="df-candidate-preview-frame" style={{width:layoutWidth,height:layoutHeight}}>
          <div className="df-candidate-preview-scaled" style={{width:geometry?.width,height:geometry?.height,transform:`scale(${scale})`}}>
            <div className="df-candidate-preview-rendered" ref={host}/>
          </div>
        </div>
      </div>
    </div>
  </section>;
});
