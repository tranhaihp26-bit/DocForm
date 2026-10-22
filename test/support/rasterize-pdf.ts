/**
 * Chặng 5 — rasterise PDF (do chính Word xuất) thành PNG để kiểm bằng mắt.
 * Dùng Chromium/PDFium nên bố cục giữ nguyên những gì Word đã dàn trang.
 */
import fs from "node:fs";
import { CdpClient } from "./browserHarness.ts";

export async function rasterizePdfToPng(
  pdfPath: string,
  pngPath: string,
  port: number
): Promise<boolean> {
  const client = new CdpClient("docform-stage5-raster");
  try {
    await client.launch(port);
    const url = `file:///${pdfPath.replace(/\\/g, "/")}`;
    await client.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 6000));
    const shot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const b64 = shot?.result?.data;
    if (!b64) return false;
    fs.writeFileSync(pngPath, Buffer.from(b64, "base64"));
    return true;
  } finally {
    client.close();
  }
}

// Chạy độc lập: node --import tsx test/support/rasterize-pdf.ts <pdf> <png> [port]
if (process.argv[2] && process.argv[3] && import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "")) {
  const ok = await rasterizePdfToPng(
    process.argv[2],
    process.argv[3],
    Number(process.argv[4] || 9691)
  );
  console.log(ok ? `PNG: ${process.argv[3]}` : "PNG: failed");
}
