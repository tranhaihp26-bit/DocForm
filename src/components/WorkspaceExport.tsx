import React, { useMemo, useState } from 'react';
import { type ExportCandidate, isCandidateEligibleForExport, isCandidateEligibleForReviewDownload } from '../utils/exportCandidate.ts';
import { CandidateDocumentPreview } from './A4DocumentPreview.tsx';
import { describeExportBlocker } from '../utils/workspaceExportMessages.ts';
import { COMPANY_HEADER_PROFILE_ID } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PROFILE_ID } from '../canonical/hd05/companyHeaderHD05.ts';
import type { ND30ComplianceReport } from '../shared/schemas/document.schema.ts';
import { Download, Printer, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import './WorkspaceExport.css';

type WorkspaceExportProps = {
  candidate: ExportCandidate | null;
  complianceReport: ND30ComplianceReport | null;
  complianceRevision: number | null;
  pending: boolean;
  error: string;
  onPrepare: () => void;
  onDownload: () => void;
  onDownloadReview: () => void;
  onDownloadOriginal: () => void;
  onPrintCandidate: () => void;
  originalAvailable: boolean;
  onPrev: () => void;
  onReviewSource: () => void;
  onEditTarget: (targetId?: string) => void;
  isStale?: boolean;
};

export function WorkspaceExport({
  candidate,
  complianceReport,
  complianceRevision,
  pending,
  error,
  onPrepare,
  onDownload,
  onDownloadReview,
  onDownloadOriginal,
  onPrintCandidate,
  originalAvailable,
  onPrev,
  onReviewSource,
  onEditTarget,
  isStale = false,
}: WorkspaceExportProps) {
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [contextOpen, setContextOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 1000);

  // ExportCandidate.bytes is a defensive-copy getter. Read it once per immutable
  // candidate so UI state changes do not create a new preview input each render.
  const previewBytes = useMemo(() => candidate ? candidate.bytes : null, [candidate]);
  const blockerDescriptions = candidate?.blockers.map(code => describeExportBlocker(code)) ?? [];
  const actions = [...new Map(blockerDescriptions.filter(d => d.action && (d.action !== 'download_original' || originalAvailable)).map(d => [d.action === 'edit_target' ? `${d.action}|${d.targetId ?? ''}` : d.action, d])).values()];

  // Danh sách các lưu ý cần đối chiếu (loại bỏ câu lặp và câu thông báo chung chung)
  const warningReasons = useMemo(() => {
    if (!candidate || candidate.safe) return [];
    const all = [
      ...blockerDescriptions.map(d => d.messageVi),
      ...candidate.contentFidelity.violations.map(v => v.messageVi),
      ...candidate.tableFidelity.diffs.map(d => d.messageVi),
      ...candidate.exportSafety.violations.map(v => v.messageVi),
    ];
    return [...new Set(all.filter(Boolean))];
  }, [candidate, blockerDescriptions]);

  const validatedExportAvailable = isCandidateEligibleForExport(candidate);
  const reviewDownloadAvailable = Boolean(candidate && !candidate.safe && isCandidateEligibleForReviewDownload(candidate));
  const regimeLabel = candidate?.formatData.regime === 'party' ? 'Văn bản Đảng · Hướng dẫn 05' : 'Hành chính · Nghị định 30';
  const companyHeaderRegime = candidate && candidate.formatData.headerProfile === (candidate.formatData.regime === 'party' ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID) ? candidate.formatData.regime : undefined;

  // Determine active status category
  const activeComplianceReport = candidate && complianceRevision === candidate.revision ? complianceReport : null;
  const hasComplianceIssues = Boolean(activeComplianceReport?.issues.length);
  const complianceIssuesCount = activeComplianceReport?.issues.length ?? 0;
  const referenceNumberNotAssigned = Boolean(activeComplianceReport?.issues.some(issue => issue.id === 'referenceNumber_missing'));

  // Trạng thái và hướng dẫn xuất bản rõ ràng cho nhân viên văn phòng
  let statusBadgeText = 'Chưa có bản Word';
  let statusTone: 'safe' | 'warning' | 'blocked' | 'pending' = 'pending';
  let statusTitle = 'Chưa có bản Word từ bản soạn hiện tại';
  let statusDesc = 'Tạo bản Word để xem trước trang A4 và tải xuống.';

  if (pending) {
    statusBadgeText = 'Đang kiểm tra';
    statusTone = 'pending';
    statusTitle = 'Đang chuẩn bị tệp Word…';
    statusDesc = 'Hệ thống đang tạo tệp Word và kiểm tra tính toàn vẹn nội dung.';
  } else if (isStale) {
    statusBadgeText = 'Bản soạn đã đổi';
    statusTone = 'warning';
    statusTitle = 'Bản Word chưa cập nhật';
    statusDesc = 'Bản soạn vừa có thay đổi mới. Vui lòng bấm "Làm mới" trước khi tải xuống.';
  } else if (error && !candidate) {
    statusBadgeText = 'Chưa tạo được Word';
    statusTone = 'blocked';
    statusTitle = 'Không tạo được tệp Word';
    statusDesc = 'Bản soạn vẫn được giữ nguyên. Bạn có thể thử lại hoặc quay lại kiểm tra nội dung.';
  } else if (!candidate) {
    statusBadgeText = 'Chưa có bản Word';
    statusTone = 'pending';
    statusTitle = 'Chưa có bản Word từ bản soạn hiện tại';
    statusDesc = 'Tạo bản Word để xem trước trang A4 và tải xuống.';
  } else if (validatedExportAvailable) {
    if (!hasComplianceIssues) {
      statusBadgeText = 'Sẵn sàng tải xuống';
      statusTone = 'safe';
      statusTitle = 'Bản Word hoàn chỉnh sẵn sàng';
      statusDesc = activeComplianceReport
        ? `Tất cả tiêu chuẩn thể thức và nội dung đã đạt (${activeComplianceReport.passedChecks}/${activeComplianceReport.totalChecks} mục). Văn bản đủ điều kiện ban hành.`
        : 'Bản Word đã đạt kiểm tra và đủ điều kiện tải xuống.';
    } else {
      statusBadgeText = 'Có thể tải · Có lưu ý';
      statusTone = 'warning';
      statusTitle = `Bản Word sẵn sàng (còn ${complianceIssuesCount} mục thể thức cần xem lại)`;
      statusDesc = referenceNumberNotAssigned
        ? 'Số và ký hiệu văn bản chưa được cấp. Bạn có thể tải để rà soát; văn bản chưa sẵn sàng ban hành.'
        : 'Tệp Word đã sẵn sàng tải xuống. Vui lòng xem lại một số mục thể thức trước khi ban hành.';
    }
  } else if (reviewDownloadAvailable) {
    statusBadgeText = 'Bản đối chiếu';
    statusTone = 'warning';
    statusTitle = 'Bản Word đối chiếu đã sẵn sàng';
    statusDesc = 'Bản DOCX đối chiếu được tạo từ nội dung hiện có để rà soát trước khi phát hành.';
  } else {
    statusBadgeText = 'Chưa an toàn';
    statusTone = 'blocked';
    statusTitle = 'Chưa thể tạo bản Word an toàn';
    statusDesc = 'Tệp Word chưa bảo toàn dữ liệu gốc. Chức năng tải và in đã bị khóa để bảo vệ văn bản gốc.';
  }

  const passedChecksCount = activeComplianceReport?.passedChecks ?? 0;
  const totalChecksCount = activeComplianceReport?.totalChecks ?? 9;
  const complianceRate = Math.round((passedChecksCount / Math.max(1, totalChecksCount)) * 100);

  return (
    <main
      data-wizard-step="3"
      className="df-workspace-export"
      data-candidate-state={!candidate ? 'missing' : validatedExportAvailable ? 'downloadable' : reviewDownloadAvailable ? 'review-only' : 'blocked'}
      data-candidate-safe={candidate ? String(candidate.safe) : undefined}
      data-candidate-review-downloadable={candidate ? String(candidate.reviewDownloadable) : undefined}
      data-candidate-instance={candidate?.instanceId}
      data-candidate-revision={candidate?.revision}
      data-candidate-sha={candidate?.sha256}
    >
      <h1 className="sr-only">Xem và tải Word</h1>

      <div className="df-step-layout" data-context-open={String(contextOpen)}>
        <div className="df-step-content">
          <section id="df-step3-preview" className="df-step3-preview-section" aria-labelledby="df-step3-preview-title">
            {/* Thanh công cụ đỉnh canvas: Gộp tinh gọn tối đa trên 1 hàng ngang duy nhất */}
            <div className="df-step3-section-heading">
              <div className="df-step3-heading-left">
                <h2 id="df-step3-preview-title">Bản xem trước A4</h2>
                <span className="sr-only">{regimeLabel}</span>
                {candidate && (
                  <span className="sr-only">Bản ứng viên hiện tại (phiên bản {candidate.revision})</span>
                )}
                {candidate && !candidate.safe && (
                  <span className="df-step3-diagnostic-banner sr-only" role="status" data-diagnostic-preview="true">
                    <span className="df-step3-diagnostic-badge">Bản đối chiếu</span>
                  </span>
                )}
              </div>
              <div className="df-step3-heading-toolbar" ref={setToolbarTarget} />
              <button
                type="button"
                className="df-step3-context-toggle"
                aria-expanded={contextOpen}
                aria-controls="df-step3-context-panel"
                onClick={() => setContextOpen(open => !open)}
              >
                {contextOpen ? 'Ẩn bảng điều khiển' : 'Hiện bảng điều khiển'}
              </button>
            </div>

            {!candidate && (
              <div className="df-step3-empty-state">
                <h3>{error ? 'Không tạo hoặc kiểm tra được bản Word' : isStale ? 'Bản Word cũ đã hết hiệu lực do bản soạn thay đổi' : 'Chưa có tệp Word hiện hành'}</h3>
                <p>{pending ? 'Đang tạo và kiểm tra tệp Word…' : error ? 'Đã xảy ra lỗi khi tạo tệp Word. Bản soạn hiện tại vẫn được giữ nguyên.' : isStale ? 'Bản soạn vừa có thay đổi mới; bản xem trước cũ đã được khóa để tránh tải nhầm. Hãy tạo lại bản Word từ bản soạn mới nhất.' : 'Tạo bản Word để xem trước trang A4 và tải xuống.'}</p>
                <button type="button" onClick={onPrepare} disabled={pending}>
                  {pending ? 'Đang kiểm…' : isStale ? 'Tạo lại bản Word' : 'Tạo tệp Word'}
                </button>
              </div>
            )}

            {Boolean(candidate && (candidate.downloadable || candidate.canRenderDiagnostic) && previewBytes) && (
              <CandidateDocumentPreview
                bytes={previewBytes!}
                sha256={candidate!.sha256}
                instanceId={candidate!.instanceId}
                companyHeaderRegime={companyHeaderRegime}
                toolbarTarget={toolbarTarget}
              />
            )}

            {Boolean(candidate && !candidate.downloadable && !candidate.canRenderDiagnostic) && (
              <div className="df-step3-unavailable-state" role="status">
                <strong>Không thể dựng bản xem an toàn.</strong>
                <span>Tệp bị lỗi định dạng hoặc chứa nội dung không an toàn. Đọc trạng thái và hướng xử lý trong bảng bên phải.</span>
              </div>
            )}
          </section>
        </div>

        <aside id="df-step3-context-panel" className="df-step-context" aria-label="Trạng thái và thao tác xuất">
          {/* Card Hợp nhất: Thao tác xuất và Trạng thái tệp Word */}
          <section id="df-step3-export" className="df-step3-context-card df-step3-export-card df-step3-candidate-status" aria-labelledby="df-step3-export-title">
            <div className="df-step3-card-head">
              <div className="df-step3-status-header">
                <span className={`df-step3-status-tag is-${statusTone}`}>{statusBadgeText}</span>
                <h2 id="df-step3-export-title">{statusTitle}</h2>
                <span id="df-step3-status-title" className="sr-only">{statusTitle}</span>
              </div>
              <button
                type="button"
                className="df-step3-prepare-compact-btn"
                onClick={onPrepare}
                disabled={pending}
                title="Làm mới và kiểm tra lại bản Word từ bản soạn hiện tại"
              >
                <RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${pending ? 'animate-spin' : ''}`} />
                <span>{pending ? 'Đang kiểm…' : 'Làm mới'}</span>
              </button>
            </div>

            <p className="df-step3-status-explanation">{statusDesc}</p>
            {error && <p className="df-step3-error" role="alert">{error}</p>}

            {/* Phân nhánh hành động xuất */}
            {isStale ? (
              <>
                <p className="df-step3-export-note" role="status">
                  Bản soạn đã đổi; bản Word cũ không còn hiệu lực. Hãy bấm &quot;Làm mới&quot; để tạo bản mới.
                </p>
                <button type="button" className="df-step3-download-button is-locked" disabled aria-disabled="true">
                  Tải Word (Cần tạo lại bản mới)
                </button>
              </>
            ) : candidate && validatedExportAvailable ? (
              <>
                <button
                  type="button"
                  className="df-step3-download-button"
                  data-candidate-download
                  data-candidate-sha={candidate.sha256}
                  data-candidate-instance={candidate.instanceId}
                  onClick={onDownload}
                >
                  <Download className="w-4 h-4 inline mr-1.5" />
                  Tải xuống DOCX
                </button>
                <button
                  type="button"
                  className="df-step3-print-button"
                  data-candidate-print
                  data-candidate-sha={candidate.sha256}
                  data-candidate-instance={candidate.instanceId}
                  onClick={onPrintCandidate}
                >
                  <Printer className="w-4 h-4 inline mr-1.5" />
                  In bản xem / Lưu PDF tham khảo
                </button>
                <p className="df-step3-export-note">
                  Bản in từ trình duyệt chỉ để tham khảo. Hãy mở DOCX trong Word để kiểm tra phân trang trước khi phát hành.
                </p>
              </>
            ) : candidate && reviewDownloadAvailable ? (
              <>
                <button
                  type="button"
                  className="df-step3-review-download-button"
                  data-candidate-review-download
                  data-candidate-sha={candidate.sha256}
                  data-candidate-instance={candidate.instanceId}
                  onClick={onDownloadReview}
                >
                  <Download className="w-4 h-4 inline mr-1.5" />
                  Tải bản đối chiếu DOCX
                </button>
                <button
                  type="button"
                  className="df-step3-print-button is-locked"
                  data-candidate-print
                  disabled
                  aria-disabled="true"
                  title="Chỉ in sau khi ứng viên vượt qua đối chiếu toàn vẹn"
                >
                  <Printer className="w-4 h-4 inline mr-1.5 opacity-50" />
                  In bản xem / Lưu PDF (Đang khóa)
                </button>
                <p className="df-step3-export-note" role="status">
                  Tệp Word đối chiếu dùng để rà soát trong Word; tính năng In/PDF bị khóa cho đến khi hoàn tất đối chiếu.
                </p>
              </>
            ) : candidate ? (
              <>
                <button
                  type="button"
                  className="df-step3-download-button is-locked"
                  data-candidate-download
                  disabled
                  aria-disabled="true"
                  title="Chức năng tải bị khóa do ứng viên chưa vượt qua đối chiếu an toàn"
                >
                  Tải xuống DOCX (Đang khóa)
                </button>
                <button
                  type="button"
                  className="df-step3-print-button is-locked"
                  data-candidate-print
                  disabled
                  aria-disabled="true"
                  title="Chức năng in bị khóa do ứng viên chưa vượt qua đối chiếu an toàn"
                >
                  In bản xem (Đang khóa)
                </button>
                <p className="df-step3-export-note" role="alert">
                  Tệp Word xuất ra chưa bảo toàn dữ liệu gốc; chức năng tải và in đã bị khóa để bảo vệ dữ liệu.
                </p>
              </>
            ) : (
              <p className="df-step3-export-note">Tạo bản Word hợp lệ để tải hoặc in.</p>
            )}

            {/* Hàng nút phụ: Tải tệp gốc & Quay lại Bước 2 */}
            <div className="df-step3-export-secondary-group">
              {originalAvailable && (
                <button
                  type="button"
                  className="df-step3-original-button"
                  data-original-download
                  onClick={onDownloadOriginal}
                >
                  Tải tệp gốc nguyên vẹn
                </button>
              )}
              <button type="button" className="df-step3-back-button" onClick={onPrev}>
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                Quay lại Bước 2: Hoàn thiện
              </button>
            </div>
          </section>

          {/* Card Chi tiết: Đối chiếu, Thể thức & Bảo toàn tệp gốc */}
          <section className="df-step3-context-card df-step3-details-card" aria-label="Chi tiết đối chiếu và thể thức">
            {/* Cảnh báo chi tiết nếu ứng viên không an toàn */}
            {candidate && !candidate.safe && (
              <section className="df-step3-warning-panel" role="alert" aria-labelledby="df-step3-warning-title">
                <div className="df-step3-warning-head">
                  <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1.5" />
                  <h3 id="df-step3-warning-title">Lưu ý đối chiếu nguồn</h3>
                </div>
                <p className="df-step3-warning-lead">
                  {reviewDownloadAvailable
                    ? 'Một số vị trí trong tài liệu có hình vẽ hoặc định dạng cần xem lại với tệp gốc:'
                    : 'Tài liệu chưa đủ điều kiện an toàn để tải bản Word mới. Vui lòng đối chiếu lại tệp gốc.'}
                </p>

                {/* Danh sách mục cần lưu ý: hiển thị trực tiếp 2 mục đầu, không lặp lại */}
                {warningReasons.length > 0 && (
                  <div className="df-step3-warning-primary" data-blocker-summary="true">
                    <ul className="df-step3-warning-list">
                      {warningReasons.slice(0, 2).map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nếu có nhiều hơn 2 mục, phần còn lại được gom gọn trong details */}
                {warningReasons.length > 2 && (
                  <details className="df-step3-warning-details">
                    <summary>Xem thêm {warningReasons.length - 2} vị trí cần lưu ý</summary>
                    <ul className="df-step3-warning-list">
                      {warningReasons.slice(2).map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {actions.length > 0 && (
                  <nav className="df-step3-blocker-actions" aria-label="Đối chiếu cảnh báo">
                    {actions.map(({ action, targetId }, i) => (
                      <button
                        type="button"
                        key={i}
                        className="df-step3-action-button"
                        onClick={() => action === 'review_source' ? onReviewSource() : action === 'edit_target' ? onEditTarget(targetId) : onDownloadOriginal()}
                      >
                        {action === 'review_source' ? 'Đối chiếu nguồn' : action === 'edit_target' ? 'Mở vị trí cần sửa' : 'Tải tệp gốc'}
                      </button>
                    ))}
                  </nav>
                )}
              </section>
            )}

            {/* Báo cáo rà soát thể thức với Progress Bar đồng bộ */}
            {candidate && (
              <section className="df-step3-formalities" data-formalities-revision={complianceRevision ?? undefined} aria-labelledby="df-step3-formalities-title">
                <div className="df-step3-formalities-header">
                  <h3 id="df-step3-formalities-title">Rà soát thể thức</h3>
                  {activeComplianceReport && (
                    <span className="df-step3-formalities-badge">
                      {passedChecksCount}/{totalChecksCount} đạt ({complianceRate}%)
                    </span>
                  )}
                </div>
                {activeComplianceReport ? (
                  <>
                    <div className="df-step3-progress-track">
                      <div
                        className="df-step3-progress-fill"
                        style={{ width: `${complianceRate}%` }}
                      />
                    </div>
                    {activeComplianceReport.issues.length > 0 ? (
                      <ul className="df-step3-formalities-issues">
                        {activeComplianceReport.issues.slice(0, 4).map(issue => (
                          <li key={issue.id}>
                            <span>{issue.title}</span>
                            {issue.field && issue.field !== 'general' && (
                              <button
                                type="button"
                                className="df-step3-issue-link"
                                onClick={() => onEditTarget(issue.field)}
                              >
                                Sửa
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="df-step3-formalities-clean">Tất cả các trường thể thức chính đã được kiểm tra đạt yêu cầu.</p>
                    )}
                    <p className="df-step3-formalities-note">
                      Đã kiểm tra đối sánh theo quy định thể thức {regimeLabel}. Các mục cần xem lại không chặn quyền tải theo cổng hiện hành.
                    </p>
                  </>
                ) : (
                  <p role="status" className="df-step3-formalities-note">Đang đồng bộ kết quả rà soát với phiên bản bản soạn hiện hành.</p>
                )}
              </section>
            )}

            {/* Kiểm tra bảo toàn tệp gốc */}
            {candidate && (
              <details className="df-step3-gates-container">
                <summary>Kiểm tra bảo toàn tệp gốc</summary>
                <ul className="df-step3-gate-list">
                  <li>
                    <span>Bảo toàn bảng biểu</span>
                    <strong data-gate-state={candidate.tableFidelity.safe ? 'safe' : 'blocked'}>
                      {candidate.tableFidelity.safe ? 'Đã qua' : 'Cần đối chiếu'}
                    </strong>
                  </li>
                  <li>
                    <span>Bảo toàn chữ và nội dung</span>
                    <strong data-gate-state={candidate.contentFidelity.safe ? 'safe' : 'blocked'}>
                      {candidate.contentFidelity.safe ? 'Đã qua' : 'Cần đối chiếu'}
                    </strong>
                  </li>
                  <li>
                    <span>Bảo toàn cấu trúc văn bản</span>
                    <strong data-gate-state={candidate.exportSafety.decision === 'allow' ? 'safe' : 'blocked'}>
                      {candidate.exportSafety.decision === 'allow' ? 'Đã qua' : 'Cần đối chiếu'}
                    </strong>
                  </li>
                </ul>
              </details>
            )}

            {/* Thông tin kiểm toán kỹ thuật: gấp gọn */}
            {candidate && (
              <details className="df-step3-evidence" data-candidate-evidence data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId}>
                <summary>Thông tin kiểm toán kỹ thuật (Dành cho quản trị)</summary>
                <div className="df-step3-evidence-content">
                  <code>{candidate.sha256}</code>
                  <span>Phiên bản: revision {candidate.revision} · {candidate.instanceId}</span>
                  <pre>{JSON.stringify({
                    warnings: candidate.blockers,
                    downloadable: candidate.downloadable,
                    reviewDownloadable: candidate.reviewDownloadable,
                    table: candidate.tableFidelity.safe,
                    content: candidate.contentFidelity.safe,
                    safety: candidate.exportSafety.decision,
                    profileHeaderLines: candidate.profileHeaderLines,
                    evidence: candidate.evidence,
                  }, null, 2)}</pre>
                </div>
              </details>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
