import React, { useMemo, useState } from 'react';
import { type ExportCandidate, isCandidateEligibleForExport, isCandidateEligibleForReviewDownload } from '../utils/exportCandidate.ts';
import { CandidateDocumentPreview } from './A4DocumentPreview.tsx';
import { describeExportBlocker } from '../utils/workspaceExportMessages.ts';
import { COMPANY_HEADER_PROFILE_ID } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PROFILE_ID } from '../canonical/hd05/companyHeaderHD05.ts';
import type { ND30ComplianceReport } from '../shared/schemas/document.schema.ts';
import { Download, Printer, ArrowLeft, RefreshCw } from 'lucide-react';
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
  const warningReasons = candidate && !candidate.safe ? [...new Set([...blockerDescriptions.map(d => d.messageVi), ...candidate.contentFidelity.violations.map(v => v.messageVi), ...candidate.tableFidelity.diffs.map(d => d.messageVi), ...candidate.exportSafety.violations.map(v => v.messageVi), candidate.exportSafety.decision !== 'allow' ? 'Bộ đối chiếu chưa xác nhận bản xuất bảo toàn đầy đủ dữ liệu nguồn. Hãy kiểm tra các khác biệt nêu trên.' : ''].filter(Boolean))] : [];
  const validatedExportAvailable = isCandidateEligibleForExport(candidate);
  const reviewDownloadAvailable = Boolean(candidate && !candidate.safe && isCandidateEligibleForReviewDownload(candidate));
  const regimeLabel = candidate?.formatData.regime === 'party' ? 'Văn bản Đảng · Hướng dẫn 05' : 'Hành chính · Nghị định 30';
  const companyHeaderRegime = candidate && candidate.formatData.headerProfile === (candidate.formatData.regime === 'party' ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID) ? candidate.formatData.regime : undefined;

  // Determine active status category
  const activeComplianceReport = candidate && complianceRevision === candidate.revision ? complianceReport : null;
  const hasComplianceIssues = Boolean(activeComplianceReport?.issues.length);
  const complianceIssuesCount = activeComplianceReport?.issues.length ?? 0;
  const unevaluatedCount = activeComplianceReport?.canonical?.notEvaluated ?? 0;

  // Derive title & explanation strictly adhering to UX Spec 2026-11-04 Section 6.2
  let statusBadgeText = 'Chưa có bản Word';
  let statusTone: 'safe' | 'warning' | 'blocked' | 'pending' = 'pending';
  let statusTitle = 'Chưa có bản Word từ bản soạn hiện tại';
  let statusDesc = 'Hãy tạo ứng viên để kiểm tra và dựng bản xem trước theo đúng byte sẽ tải.';

  if (pending) {
    statusBadgeText = 'Đang kiểm tra';
    statusTone = 'pending';
    statusTitle = 'Đang chuẩn bị bản Word…';
    statusDesc = 'Hệ thống đang tạo tệp DOCX và chạy các kiểm tra toàn vẹn nội dung, bảng biểu và an toàn.';
  } else if (isStale) {
    statusBadgeText = 'Bản soạn đã đổi';
    statusTone = 'warning';
    statusTitle = 'Bản Word cũ không còn khớp với bản soạn';
    statusDesc = 'Bản soạn vừa có thay đổi mới. Cần tạo lại bản Word trước khi tải hoặc in.';
  } else if (error && !candidate) {
    statusBadgeText = 'Tạo Word chưa thành công';
    statusTone = 'blocked';
    statusTitle = 'Không tạo hoặc kiểm tra được bản Word';
    statusDesc = 'Bản soạn vẫn được giữ. Bạn có thể thử lại hoặc quay lại kiểm tra nội dung.';
  } else if (!candidate) {
    statusBadgeText = 'Chưa có bản Word';
    statusTone = 'pending';
    statusTitle = 'Chưa có bản Word từ bản soạn hiện tại';
    statusDesc = 'Tạo ứng viên để xem kết quả kiểm tra và bản xem trước theo trang A4.';
  } else if (validatedExportAvailable) {
    if (!hasComplianceIssues) {
      statusBadgeText = 'Có thể tải Word';
      statusTone = 'safe';
      statusTitle = 'Có thể tải bản Word';
      statusDesc = activeComplianceReport
        ? `Không phát hiện vấn đề trong các kiểm tra đã thực hiện (${activeComplianceReport.passedChecks}/${activeComplianceReport.totalChecks} mục đạt)${unevaluatedCount ? `; còn ${unevaluatedCount} mục chưa đánh giá` : ''}. Bản Word đủ điều kiện xuất kỹ thuật.`
        : 'Bản Word đã vượt qua các cổng kiểm tra kỹ thuật và đủ điều kiện tải xuống.';
    } else {
      statusBadgeText = 'Có thể tải Word · Có lưu ý';
      statusTone = 'warning';
      statusTitle = `Có thể tải bản Word, còn ${complianceIssuesCount} mục thể thức cần xem lại`;
      statusDesc = 'DOCX đã đạt cổng xuất kỹ thuật; các mục thể thức còn lại cần bạn xem trước khi sử dụng. Đây chưa phải xác nhận sẵn sàng phát hành.';
    }
  } else if (reviewDownloadAvailable) {
    statusBadgeText = 'Chỉ tải bản đối chiếu';
    statusTone = 'blocked';
    statusTitle = 'Chưa thể tải bản Word hoàn chỉnh';
    statusDesc = 'Đối chiếu chưa xác nhận DOCX giữ nguyên đầy đủ nội dung hoặc cấu trúc nguồn. Bản hiện tại chỉ dùng để đối chiếu trong Word, không dùng phát hành.';
  } else {
    statusBadgeText = 'Chưa an toàn';
    statusTone = 'blocked';
    statusTitle = 'Chưa thể tạo bản Word an toàn';
    statusDesc = 'DOCX ứng viên bị từ chối toàn vẹn hoặc cấu trúc không an toàn. Chức năng tải và in đã bị khóa để bảo vệ dữ liệu nguồn.';
  }

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
            <div className="df-step3-section-heading">
              <div>
                <h2 id="df-step3-preview-title">Bản xem trước Word</h2>
                <p>{candidate ? `${regimeLabel} · Bản ứng viên hiện tại (phiên bản ${candidate.revision})` : 'Tạo và kiểm ứng viên từ nội dung đã duyệt để xem trước.'}</p>
              </div>
              <div className="df-step3-heading-toolbar" ref={setToolbarTarget} />
              <button
                type="button"
                className="df-step3-context-toggle"
                aria-expanded={contextOpen}
                aria-controls="df-step3-context-panel"
                onClick={() => setContextOpen(open => !open)}
              >
                {contextOpen ? 'Ẩn thông tin xuất' : 'Thông tin xuất'}
              </button>
            </div>

            {!candidate && (
              <div className="df-step3-empty-state">
                <h3>{error ? 'Không tạo hoặc kiểm tra được bản Word' : isStale ? 'Bản Word cũ đã hết hiệu lực do bản soạn thay đổi' : 'Chưa có DOCX ứng viên hiện hành'}</h3>
                <p>{pending ? 'Đang tạo và kiểm tra ứng viên…' : error ? 'Đã xảy ra lỗi khi tạo bản Word ứng viên. Bản soạn hiện tại vẫn được giữ nguyên.' : isStale ? 'Bản soạn vừa có thay đổi mới; bản xem trước cũ đã được khóa để tránh tải nhầm. Hãy tạo lại bản Word từ bản soạn mới nhất.' : 'Tạo ứng viên để dựng bản xem từ đúng DOCX sẽ tải xuống.'}</p>
                <button type="button" onClick={onPrepare} disabled={pending}>
                  {pending ? 'Đang kiểm…' : isStale ? 'Tạo lại bản Word' : 'Tạo và kiểm DOCX ứng viên'}
                </button>
              </div>
            )}

            {Boolean(candidate && (candidate.downloadable || candidate.canRenderDiagnostic) && previewBytes) && (
              <>
                {candidate && !candidate.safe && (
                  <div className="df-step3-diagnostic-banner" role="status" data-diagnostic-preview="true">
                    <span className="df-step3-diagnostic-badge">Bản đối chiếu — chưa xác nhận</span>
                    <p className="df-step3-diagnostic-desc">Bản xem này chỉ giúp đối chiếu; chưa được xác nhận để phát hành.</p>
                  </div>
                )}
                <CandidateDocumentPreview
                  bytes={previewBytes!}
                  sha256={candidate!.sha256}
                  instanceId={candidate!.instanceId}
                  companyHeaderRegime={companyHeaderRegime}
                  toolbarTarget={toolbarTarget}
                />
              </>
            )}

            {Boolean(candidate && !candidate.downloadable && !candidate.canRenderDiagnostic) && (
              <div className="df-step3-unavailable-state" role="status">
                <strong>Ứng viên không thể dựng bản xem an toàn.</strong>
                <span>Tệp bị lỗi cấu trúc hoặc chứa nội dung không an toàn. Đọc trạng thái và hướng xử lý trong bảng bên phải.</span>
              </div>
            )}
          </section>
        </div>

        <aside id="df-step3-context-panel" className="df-step-context" aria-label="Trạng thái và thao tác xuất">
          {/* Card 1: Trạng thái tệp Word rõ ràng theo đặc tả Section 6.2 */}
          <section className="df-step3-context-card df-step3-candidate-status" aria-labelledby="df-step3-status-title">
            <div className="df-step3-status-header">
              <span className={`df-step3-status-tag is-${statusTone}`}>{statusBadgeText}</span>
              <h2 id="df-step3-status-title">{statusTitle}</h2>
            </div>
            <p className="df-step3-status-explanation">{statusDesc}</p>

            {/* Cảnh báo chi tiết nếu ứng viên không an toàn — đặt ngay đầu thẻ để nhìn thấy vị trí và nút xử lý trên 1366×768 */}
            {candidate && !candidate.safe && (
              <section className="df-step3-warning-panel" role="alert" aria-labelledby="df-step3-warning-title">
                <h3 id="df-step3-warning-title">Nội dung cần xử lý</h3>
                <p>
                  {reviewDownloadAvailable
                    ? 'Đối chiếu chưa xác nhận DOCX giữ nguyên đầy đủ nội dung và cấu trúc nguồn. Bạn có thể tải bản đối chiếu để kiểm tra trong Word; không dùng bản này để phát hành.'
                    : 'Không thể dựng bản đối chiếu đủ an toàn để tải. Hãy đối chiếu lại nguồn hoặc tải tệp gốc nguyên vẹn.'}
                </p>
                {blockerDescriptions.length > 0 && (
                  <p className="df-step3-warning-primary" data-blocker-summary="true">
                    <strong>Vị trí cần đối chiếu:</strong> {blockerDescriptions.slice(0, 2).map(d => d.messageVi).join(' ')}
                  </p>
                )}
                {warningReasons.length > 0 && (
                  <details className="df-step3-warning-details">
                    <summary>{warningReasons.length} khác biệt phát hiện trong đối chiếu</summary>
                    <ul>
                      {warningReasons.map((reason, i) => <li key={i}>{reason}</li>)}
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

            {/* Các cổng kiểm tra kỹ thuật bảo toàn */}
            {candidate && (
              <details className="df-step3-gates-container">
                <summary>Cổng kiểm tra bảo toàn nội dung</summary>
                <ul className="df-step3-gate-list">
                  <li>
                    <span>Đối chiếu bảng</span>
                    <strong data-gate-state={candidate.tableFidelity.safe ? 'safe' : 'blocked'}>
                      {candidate.tableFidelity.safe ? 'Đã qua' : 'Cảnh báo'}
                    </strong>
                  </li>
                  <li>
                    <span>Đối chiếu nội dung</span>
                    <strong data-gate-state={candidate.contentFidelity.safe ? 'safe' : 'blocked'}>
                      {candidate.contentFidelity.safe ? 'Đã qua' : 'Cảnh báo'}
                    </strong>
                  </li>
                  <li>
                    <span>Đối chiếu an toàn</span>
                    <strong data-gate-state={candidate.exportSafety.decision === 'allow' ? 'safe' : 'blocked'}>
                      {candidate.exportSafety.decision === 'allow' ? 'Đã qua' : 'Cảnh báo'}
                    </strong>
                  </li>
                </ul>
              </details>
            )}

            {/* Báo cáo rà soát thể thức */}
            {candidate && (
              <section className="df-step3-formalities" data-formalities-revision={complianceRevision ?? undefined} aria-labelledby="df-step3-formalities-title">
                <h3 id="df-step3-formalities-title">Rà soát thể thức</h3>
                {activeComplianceReport ? (
                  <>
                    <p className="df-step3-formalities-summary">
                      <strong>{activeComplianceReport.passedChecks}/{activeComplianceReport.totalChecks} mục đạt</strong>
                      <span>{activeComplianceReport.issues.length ? `${activeComplianceReport.issues.length} mục cần xem lại` : 'Không có mục đang cảnh báo'}{unevaluatedCount ? ` · ${unevaluatedCount} mục chưa đánh giá` : ''}</span>
                    </p>
                    {activeComplianceReport.issues.length > 0 && (
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
                    )}
                    <p className="df-step3-formalities-note">
                      Kết quả rà soát thể thức độc lập với đối chiếu DOCX. Các mục cần xem lại không chặn quyền tải theo cổng hiện hành.
                    </p>
                  </>
                ) : (
                  <p role="status" className="df-step3-formalities-note">Đang đồng bộ kết quả rà soát với phiên bản bản soạn hiện hành.</p>
                )}
              </section>
            )}

            {/* Chi tiết kỹ thuật: gấp gọn */}
            {candidate && (
              <details className="df-step3-evidence" data-candidate-evidence data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId}>
                <summary>Chi tiết kiểm tra &amp; SHA-256</summary>
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

            {error && <p className="df-step3-error" role="alert">{error}</p>}
          </section>

          {/* Card 2: Thao tác Tải xuống và In */}
          <section id="df-step3-export" className="df-step3-context-card df-step3-export-card" aria-labelledby="df-step3-export-title">
            <h2 id="df-step3-export-title">Tải xuống và in</h2>

            {/* Nút Tạo lại ứng viên */}
            <button
              type="button"
              className="df-step3-prepare-button"
              onClick={onPrepare}
              disabled={pending}
            >
              <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 ${pending ? 'animate-spin' : ''}`} />
              {pending ? 'Đang kiểm…' : candidate ? 'Kiểm tra lại ứng viên' : 'Tạo và kiểm DOCX ứng viên'}
            </button>

            {/* Phân nhánh hành động xuất theo 3 trường hợp chính */}
            {isStale ? (
              <>
                <p className="df-step3-export-note" role="status">
                  Bản soạn đã đổi; bản Word cũ không còn hiệu lực. Hãy bấm &quot;Kiểm tra lại ứng viên&quot; để tạo bản mới.
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
                  Tệp có tên “chưa xác nhận”, chỉ dùng để rà soát trong Word; không dùng phát hành. In/PDF vẫn bị khóa.
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
                  DOCX ứng viên bị từ chối toàn vẹn; chức năng tải và in đã bị khóa để bảo vệ dữ liệu.
                </p>
              </>
            ) : (
              <p className="df-step3-export-note">Tạo DOCX ứng viên hợp lệ để tải hoặc in.</p>
            )}

            {/* Tải tệp gốc */}
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

            {/* Quay lại Bước 2 */}
            <button type="button" className="df-step3-back-button" onClick={onPrev}>
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
              Quay lại Bước 2: Hoàn thiện
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
