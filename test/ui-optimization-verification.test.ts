/** Workspace UI integration: source, editing, responsive layout and one DOCX candidate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { CdpClient, startTestServer } from './support/browserHarness.ts';
import { generateND30DocxBuffer } from '../src/utils/docxExport.ts';

const SOURCE_TEXT = 'Nội dung thử nghiệm tiếng Việt của tài liệu tổng hợp.';

test('Workspace UI: nhập, duyệt, xem ở bảy độ rộng và tải đúng DOCX ứng viên', async () => {
  const server = await startTestServer(5074);
  const browser = new CdpClient('docform-workspace-responsive');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docform-workspace-responsive-'));
  try {
    const file = path.join(tempDir, 'Tong_hop_tieng_Viet.docx');
    fs.writeFileSync(file, await generateND30DocxBuffer({
      regime: 'administrative', headerProfile: 'generic',
      orgHeader1: 'CƠ QUAN CẤP TRÊN', orgHeader2: 'CƠ QUAN THỬ NGHIỆM',
      nationalHeader1: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      nationalHeader2: 'Độc lập - Tự do - Hạnh phúc',
      referenceNumber: 'Số: 01/KH-TEST', locationAndDate: 'Hà Nội, ngày 20 tháng 10 năm 2026',
      documentType: 'KẾ HOẠCH', subject: 'Kiểm tra giao diện và xuất văn bản',
      bodyHtml: `<p>${SOURCE_TEXT}</p>`, signTitle: 'GIÁM ĐỐC', signName: 'Nguyễn Văn A',
      recipients: 'Như trên;\nLưu: VT.', fontFamily: 'Times New Roman', fontSize: 13,
    }));

    await browser.launch(9674);
    await browser.navigate('http://127.0.0.1:5074/');
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000), true);
    assert.equal(await browser.evaluate(`document.querySelector('header .df-stepper') === null`), true);
    assert.equal(await browser.evaluate(`document.querySelectorAll('.df-workspace-sidebar button[data-step]').length`), 3);

    await browser.uploadFile('input[type="file"]', file);
    assert.equal(await browser.waitForFunction(`document.body.textContent.includes('Đối Chiếu & Phân Vùng Tài Liệu Tải Lên')`, 15000), true);
    assert.equal(await browser.evaluate(`document.body.textContent.includes(${JSON.stringify(SOURCE_TEXT)})`), true);
    assert.equal(await browser.evaluate(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')`), 'false');
    assert.equal(await browser.clickByText('button', 'Đồng Ý Đưa Vào Studio Soạn Thảo'), true);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-current-step="2"]') !== null`, 8000), true);
    assert.equal(await browser.evaluate(`document.querySelectorAll('[data-workspace-group]').length`), 9);
    assert.equal(await browser.evaluate(`document.querySelector('[data-canvas-id="body"]')?.textContent.includes(${JSON.stringify(SOURCE_TEXT)})`), true);

    for (const width of [1920, 1440, 1366, 1280, 1024, 768, 390]) {
      await browser.setViewport(width, width < 768 ? 844 : 900);
      assert.equal(await browser.evaluate(`document.documentElement.scrollWidth <= innerWidth + 2`), true, `No horizontal overflow at ${width}px in editor`);
      assert.equal(await browser.evaluate(`document.querySelectorAll('.df-workspace-sidebar button[data-step]').length`), 3, `All three steps visible at ${width}px`);
    }

    assert.equal(await browser.clickStep(3), true);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-candidate-safe="true"]') !== null`, 15000), true,
      'An approved, preservable source must produce a safe candidate');
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-preview-bytes-sha]') !== null`, 15000), true);
    const identity = await browser.evaluate<any>(`(() => {
      const candidate = document.querySelector('[data-candidate-safe]');
      return { sha: candidate?.getAttribute('data-candidate-sha'),
        preview: document.querySelector('[data-preview-bytes-sha]')?.getAttribute('data-preview-bytes-sha'),
        evidence: document.querySelector('[data-candidate-evidence]')?.getAttribute('data-candidate-sha'),
        download: document.querySelector('[data-candidate-download]')?.getAttribute('data-candidate-sha') };
    })()`);
    assert.match(identity.sha, /^[a-f0-9]{64}$/);
    assert.equal(identity.preview, identity.sha);
    assert.equal(identity.evidence, identity.sha);
    assert.equal(identity.download, identity.sha);
    for (const width of [1920, 1440, 1366, 1280, 1024, 768, 390]) {
      await browser.setViewport(width, width < 768 ? 844 : 900);
      assert.equal(await browser.evaluate(`document.documentElement.scrollWidth <= innerWidth + 2`), true, `No horizontal overflow at ${width}px in preview`);
    }

    await browser.evaluate(`(() => {
      const original = URL.createObjectURL.bind(URL);
      window.__candidateBytes = null;
      URL.createObjectURL = blob => {
        blob.arrayBuffer().then(buffer => {
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          window.__candidateBytes = btoa(binary);
        });
        return original(blob);
      };
    })()`);
    assert.equal(await browser.clickByText('[data-candidate-download]', 'Tải Word'), true);
    assert.equal(await browser.waitForFunction(`window.__candidateBytes !== null`, 5000), true);
    const bytes = Buffer.from(await browser.evaluate<string>('window.__candidateBytes'), 'base64');
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')?.async('string');
    assert.ok(xml?.includes(SOURCE_TEXT), 'DOCX must preserve the Vietnamese source sentence');
    assert.ok(xml?.includes('w:w="11905"') || xml?.includes('w:w="11906"'), 'A4 width must be preserved');
    const digest = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, identity.sha, 'Downloaded bytes must match preview and OOXML evidence');
  } finally {
    browser.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
