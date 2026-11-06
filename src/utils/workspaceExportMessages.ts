export type ExportBlockerAction='review_source'|'edit_target'|'download_original';
export interface ExportBlockerDescription{code:string;messageVi:string;action?:ExportBlockerAction;targetId?:string}

const messages:Record<string,{messageVi:string;action?:ExportBlockerAction}>={
 workspace_approval_required:{messageVi:'Nội dung nguồn chưa được duyệt phân vùng thể thức. Vui lòng kiểm tra lại nguồn trước khi tạo bản Word.',action:'review_source'},
 partition_not_approved:{messageVi:'Phân vùng nguồn chưa được duyệt cho thể thức hiện tại.',action:'review_source'},
 pending_partition:{messageVi:'Thay đổi phân vùng đang chờ xác nhận; vui lòng hoàn tất duyệt nguồn.',action:'review_source'},
 unsupported_working_media:{messageVi:'Bản soạn có hình ảnh hoặc phương tiện đồ họa chưa thể tự động chuyển sang Word. Vui lòng mở tệp gốc để đối chiếu.',action:'review_source'},
 candidate_unpack_failed:{messageVi:'Không thể đọc tệp Word vừa tạo để kiểm tra nội dung. Vui lòng bấm "Làm mới" để thử lại.'},
 candidate_document_missing:{messageVi:'Tệp Word vừa tạo chưa có nội dung văn bản. Vui lòng bấm "Làm mới" để tạo lại.'},
 content_invalid_xml:{messageVi:'Tệp Word xuất ra phát sinh lỗi định dạng văn bản. Vui lòng kiểm tra lại nội dung bản soạn.'},
 working_state_modified_outside_transaction:{messageVi:'Bản soạn có thay đổi chưa được đồng bộ hoàn tất. Vui lòng duyệt lại nguồn và bấm "Làm mới".',action:'review_source'},
};

export function describeExportBlocker(code:string,context:{targetId?:string}={}):ExportBlockerDescription{
 const targetId=context.targetId??(code.split(':').slice(1).join(':')||undefined);
 const exact=messages[code];
 if(exact)return{code,messageVi:exact.messageVi,...(exact.action?{action:exact.action}:{}),...(targetId?{targetId}:{})};
 if(code==='profile_header_not_stamped')
  return{code,messageVi:'Phần đầu mẫu Hoa Tiêu chưa tạo được đường kẻ chuẩn theo mẫu cơ quan. Vui lòng kiểm tra tên cơ quan và bấm "Làm mới".',action:'review_source'};
 const root=code.split(':',1)[0];
 if(root==='unsupported_source_ooxml') {
  const blockNum = targetId && /^block-(\d+)$/i.test(targetId) ? Number(targetId.replace(/^block-/i, '')) + 1 : undefined;
  const posLabel = blockNum ? `Đoạn nguồn #${blockNum}` : (targetId ? `Vị trí "${targetId}"` : 'Một đoạn trong văn bản gốc');
  return {
    code,
    messageVi: `${posLabel} có hình vẽ, sơ đồ hoặc định dạng đồ họa từ tệp gốc chưa thể chuyển tự động sang tệp Word mới. Vui lòng đối chiếu với tệp gốc.`,
    action: 'review_source',
    ...(targetId ? { targetId } : {})
  };
 }
 if(root.startsWith('unsupported_source_media')||root.startsWith('unsupported_source_ooxml')||root.startsWith('unsupported_source_table')||root.startsWith('unsupported_source_block'))
  return{code,messageVi:'Tệp gốc có bảng biểu, hình ảnh hoặc phương tiện đồ họa nâng cao cần đối chiếu thủ công trước khi xuất.',action:'review_source',...(targetId?{targetId}:{})};
 if(root.startsWith('readonly_content')||root.startsWith('invalid_transaction')||root.startsWith('stale_revision'))
  return{code,messageVi:'Bản soạn có nội dung đang được cập nhật. Vui lòng kiểm tra đoạn đang sửa và bấm "Làm mới".',action:'edit_target',...(targetId?{targetId}:{})};
 return{code,messageVi:'Chưa xác minh được khả năng bảo toàn đầy đủ từ tệp gốc. Bạn có thể tải bản đối chiếu hoặc tải lại tệp gốc để rà soát.',action:'download_original',...(targetId?{targetId}:{})};
}
