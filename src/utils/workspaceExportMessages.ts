export type ExportBlockerAction='review_source'|'edit_target'|'download_original';
export interface ExportBlockerDescription{code:string;messageVi:string;action?:ExportBlockerAction;targetId?:string}

const messages:Record<string,{messageVi:string;action?:ExportBlockerAction}>={
 workspace_approval_required:{messageVi:'Nguồn nhập chưa được duyệt và phân vùng. Hãy xem lại nguồn trước khi tạo DOCX.',action:'review_source'},
 partition_not_approved:{messageVi:'Phân vùng nguồn chưa được duyệt cho thể thức hiện tại.',action:'review_source'},
 pending_partition:{messageVi:'Thay đổi phân vùng đang chờ xác nhận; hãy hoàn tất duyệt nguồn.' ,action:'review_source'},
 unsupported_working_media:{messageVi:'Bản soạn còn ảnh hoặc phương tiện chưa được chứng minh là giữ nguyên trong DOCX. Hãy kiểm tra phần nguồn liên quan.',action:'review_source'},
 candidate_unpack_failed:{messageVi:'Không đọc được DOCX vừa tạo để kiểm tra nội dung. Hãy tạo lại ứng viên sau khi kiểm tra bản soạn.'},
 candidate_document_missing:{messageVi:'DOCX vừa tạo thiếu nội dung tài liệu; cần tạo lại ứng viên.'},
 content_invalid_xml:{messageVi:'DOCX ứng viên có cấu trúc XML không hợp lệ. Không thể xác nhận nội dung.'},
 working_state_modified_outside_transaction:{messageVi:'Bản soạn có thay đổi ngoài giao dịch đã kiểm soát. Hãy duyệt lại nguồn và làm mới bản soạn.',action:'review_source'},
};

export function describeExportBlocker(code:string,context:{targetId?:string}={}):ExportBlockerDescription{
 const targetId=context.targetId??(code.split(':').slice(1).join(':')||undefined);
 const exact=messages[code];
 if(exact)return{code,messageVi:exact.messageVi,...(exact.action?{action:exact.action}:{}),...(targetId?{targetId}:{})};
 if(code==='profile_header_not_stamped')
  return{code,messageVi:'Phần đầu Hoa Tiêu chưa được ghép nguyên mẫu cùng đường kẻ Shape. Hãy kiểm tra tên cơ quan và tạo lại ứng viên.',action:'review_source'};
 const root=code.split(':',1)[0];
 if(root==='unsupported_source_ooxml')
  return{code,messageVi:`Khối nguồn ${targetId?`"${targetId}" `:''}có đối tượng Drawing/Shape hoặc trường OOXML chưa được chứng minh bảo toàn trong DOCX ứng viên. Hãy đối chiếu tệp gốc.`,action:'review_source',...(targetId?{targetId}:{})};
 if(root.startsWith('unsupported_source_media')||root.startsWith('unsupported_source_ooxml')||root.startsWith('unsupported_source_table')||root.startsWith('unsupported_source_block'))
  return{code,messageVi:'Nguồn có bảng, ảnh hoặc cấu trúc OOXML chưa được hỗ trợ xác minh. Hãy đối chiếu khối nguồn được nêu trước khi xuất.',action:'review_source',...(targetId?{targetId}:{})};
 if(root.startsWith('readonly_content')||root.startsWith('invalid_transaction')||root.startsWith('stale_revision'))
  return{code,messageVi:'Bản soạn có thay đổi chưa được chấp nhận bởi cổng an toàn. Hãy kiểm tra đoạn đang sửa rồi tạo ứng viên mới.',action:'edit_target',...(targetId?{targetId}:{})};
 return{code,messageVi:'Chưa xác minh được khả năng bảo toàn DOCX cho một phần của bản soạn. Hãy kiểm tra nguồn hoặc tải lại tệp gốc.',action:'download_original',...(targetId?{targetId}:{})};
}
