import test from 'node:test';
import assert from 'node:assert/strict';
import {describeExportBlocker} from '../src/utils/workspaceExportMessages.ts';

test('export blockers have a clear Vietnamese explanation and a relevant next action',()=>{
 const approval=describeExportBlocker('workspace_approval_required');
 assert.match(approval.messageVi,/duyệt|phân vùng/i);assert.equal(approval.action,'review_source');
 const media=describeExportBlocker('unsupported_source_media:source-image');
 assert.match(media.messageVi,/ảnh|phương tiện/i);assert.equal(media.targetId,'source-image');assert.equal(media.action,'review_source');
});

test('unknown export blocker fails closed without exposing an internal code as user guidance',()=>{
 const result=describeExportBlocker('new_internal_gate_code');
 assert.equal(result.code,'new_internal_gate_code');assert.match(result.messageVi,/Chưa xác minh được khả năng bảo toàn/);
 assert.doesNotMatch(result.messageVi,/new_internal_gate_code/);
});
