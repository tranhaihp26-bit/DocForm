import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  VisualEvidenceFailureCode,
  VisualEvidenceManifest,
} from "../shared/fullDocumentAiProtocol.ts";

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_PDF_BYTES = 200 * 1024 * 1024;
const MAX_RENDERED_PAGE_COUNT = 300;
const MAX_PAGE_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_PAGE_IMAGE_BYTES = 300 * 1024 * 1024;
const WORD_RENDER_TIMEOUT_MS = 120_000;
const PDF_RENDER_TIMEOUT_MS = 90_000;

export interface RenderedSourcePage {
  page: number;
  imageBytes: Uint8Array;
}

export interface SourceVisualRendererAdapter {
  rendererName: string;
  renderPdf(sourceBytes: Uint8Array, signal: AbortSignal): Promise<{
    pdfBytes: Uint8Array;
    rendererVersion: string;
  }>;
  renderPages(pdfBytes: Uint8Array, signal: AbortSignal): Promise<{
    pageCount: number;
    pages: RenderedSourcePage[];
    rasterizerName: string;
    rasterizerVersion: string;
  }>;
}

export interface SourceVisualRenderResult {
  manifest: VisualEvidenceManifest;
  pdfBytes: Uint8Array;
  pages: Array<RenderedSourcePage & { sha256: string }>;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

class VisualRendererError extends Error {
  constructor(
    public readonly code: VisualEvidenceFailureCode,
    public readonly exitCode?: number,
  ) {
    super(code);
    this.name = "VisualRendererError";
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorCode(error: unknown, fallback: VisualEvidenceFailureCode): VisualEvidenceFailureCode {
  if (error instanceof VisualRendererError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "cancelled" || code === "timeout" || code === "renderer_unavailable" ||
        code === "pdf_page_count_unavailable" || code === "page_render_failed") return code;
  }
  return fallback;
}

function makeResult(
  sourceSha256: string,
  failureCode: VisualEvidenceFailureCode,
  options: {
    rendererName?: string;
    rendererVersion?: string;
    rasterizerName?: string;
    rasterizerVersion?: string;
    pdfBytes?: Uint8Array;
    pageCount?: number;
    pages?: RenderedSourcePage[];
  } = {},
): SourceVisualRenderResult {
  const pdfBytes = options.pdfBytes ?? new Uint8Array();
  const pages = (options.pages ?? []).flatMap(item => {
    if (!(item.imageBytes instanceof Uint8Array) || item.imageBytes.byteLength === 0) return [];
    return [{ ...item, sha256: sha256(item.imageBytes) }];
  });
  return {
    manifest: {
      sourceSha256,
      rendererName: options.rendererName ?? "Microsoft Word",
      ...(options.rendererVersion ? { rendererVersion: options.rendererVersion } : {}),
      ...(options.rasterizerName ? { rasterizerName: options.rasterizerName } : {}),
      ...(options.rasterizerVersion ? { rasterizerVersion: options.rasterizerVersion } : {}),
      ...(pdfBytes.byteLength > 0 ? { pdfSha256: sha256(pdfBytes) } : {}),
      pageCount: options.pageCount ?? 0,
      pages: pages.map(({ page, sha256: pageSha }) => ({ page, sha256: pageSha })),
      complete: false,
      failureCode,
    },
    pdfBytes,
    pages,
  };
}

function environmentForLocalRenderer(): NodeJS.ProcessEnv {
  const allowedNames = [
    "PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA",
    "USERPROFILE", "ProgramFiles", "ProgramFiles(x86)",
  ];
  const safeEnv: NodeJS.ProcessEnv = {};
  for (const name of allowedNames) {
    const value = process.env[name];
    if (value) safeEnv[name] = value;
  }
  return safeEnv;
}

function runProcess(
  executable: string,
  args: string[],
  signal: AbortSignal,
  timeoutMs: number,
  maxOutputBytes = 2 * 1024 * 1024,
): Promise<ProcessResult> {
  if (signal.aborted) return Promise.reject(new VisualRendererError("cancelled"));

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      env: environmentForLocalRenderer(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let captured = 0;
    let settled = false;
    const finish = (error?: Error, result?: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(result!);
    };
    const onAbort = () => {
      child.kill();
      finish(new VisualRendererError("cancelled"));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new VisualRendererError("timeout"));
    }, timeoutMs);
    timer.unref();
    signal.addEventListener("abort", onAbort, { once: true });

    const collect = (target: Buffer[], part: Buffer | string) => {
      const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
      captured += buffer.byteLength;
      if (captured > maxOutputBytes) {
        child.kill();
        finish(new VisualRendererError("render_failed"));
        return;
      }
      target.push(buffer);
    };
    child.stdout.on("data", part => collect(stdout, part));
    child.stderr.on("data", part => collect(stderr, part));
    child.on("error", error => finish(new VisualRendererError((error as NodeJS.ErrnoException).code === "ENOENT" ? "renderer_unavailable" : "render_failed")));
    child.on("close", (exitCode, signalName) => {
      if (settled) return;
      if (signalName || exitCode === null) {
        finish(new VisualRendererError("render_failed"));
        return;
      }
      finish(undefined, {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode,
      });
    });
  });
}

async function findWindowsExecutable(name: string): Promise<string> {
  const whereExe = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe");
  try {
    const result = await runProcess(whereExe, [name], new AbortController().signal, 5_000, 16_384);
    const found = result.stdout.split(/\r?\n/).map(item => item.trim()).find(Boolean);
    if (result.exitCode === 0 && found) return found;
  } catch {
    // A missing optional converter is reported by the caller as unavailable.
  }
  throw new VisualRendererError("renderer_unavailable");
}

async function runChecked(
  executable: string,
  args: string[],
  signal: AbortSignal,
  timeoutMs: number,
  failureCode: VisualEvidenceFailureCode,
): Promise<ProcessResult> {
  try {
    const result = await runProcess(executable, args, signal, timeoutMs);
    if (result.exitCode !== 0) throw new VisualRendererError(failureCode, result.exitCode);
    return result;
  } catch (error) {
    if (error instanceof VisualRendererError) {
      if (error.code === "cancelled" || error.code === "timeout" || error.code === "renderer_unavailable") throw error;
    }
    throw new VisualRendererError(failureCode);
  }
}

function parseWordRendererVersion(metadata: string): string {
  try {
    const value = JSON.parse(metadata) as { rendererVersion?: unknown };
    return typeof value.rendererVersion === "string" ? value.rendererVersion : "unknown";
  } catch {
    throw new VisualRendererError("render_failed");
  }
}

function createWindowsSourceVisualRendererAdapter(): SourceVisualRendererAdapter {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const powershellPath = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const scriptPath = path.join(moduleDirectory, "sourceVisualRenderer.win.ps1");

  return {
    rendererName: "Microsoft Word",
    async renderPdf(sourceBytes, signal) {
      if (process.platform !== "win32") throw new VisualRendererError("renderer_unavailable");
      const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "docform-source-render-"));
      try {
        const sourcePath = path.join(tempDirectory, "source.docx");
        const pdfPath = path.join(tempDirectory, "source.pdf");
        const metadataPath = path.join(tempDirectory, "renderer.json");
        await fs.writeFile(sourcePath, Buffer.from(sourceBytes));
        try {
          const wordResult = await runProcess(powershellPath, [
            "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
            "-InputDocxPath", sourcePath, "-OutputPdfPath", pdfPath, "-MetadataPath", metadataPath,
          ], signal, WORD_RENDER_TIMEOUT_MS);
          if (wordResult.exitCode === 42) throw new VisualRendererError("renderer_unavailable", 42);
          if (wordResult.exitCode !== 0) throw new VisualRendererError("render_failed", wordResult.exitCode);
        } catch (error) {
          if (error instanceof VisualRendererError && error.exitCode === 42) throw new VisualRendererError("renderer_unavailable");
          if (error instanceof VisualRendererError && error.code === "timeout") throw error;
          if (error instanceof VisualRendererError && error.code === "cancelled") throw error;
          throw new VisualRendererError("render_failed");
        }
        const metadata = await fs.readFile(metadataPath, "utf8");
        const pdfBytes = await fs.readFile(pdfPath);
        if (pdfBytes.byteLength === 0) throw new VisualRendererError("render_failed");
        return { pdfBytes, rendererVersion: parseWordRendererVersion(metadata) };
      } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    },
    async renderPages(pdfBytes, signal) {
      if (process.platform !== "win32") throw new VisualRendererError("renderer_unavailable");
      const pdfinfoPath = await findWindowsExecutable("pdfinfo.exe");
      const pdftoppmPath = await findWindowsExecutable("pdftoppm.exe");
      const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "docform-page-render-"));
      try {
        const pdfPath = path.join(tempDirectory, "source.pdf");
        const pagePrefix = path.join(tempDirectory, "page");
        await fs.writeFile(pdfPath, Buffer.from(pdfBytes));
        let pdfInfo: ProcessResult;
        try {
          pdfInfo = await runChecked(pdfinfoPath, [pdfPath], signal, PDF_RENDER_TIMEOUT_MS, "pdf_page_count_unavailable");
        } catch (error) {
          throw new VisualRendererError(errorCode(error, "pdf_page_count_unavailable"));
        }
        const pageCountMatch = pdfInfo.stdout.match(/^Pages:\s*(\d+)\s*$/im);
        if (!pageCountMatch) throw new VisualRendererError("pdf_page_count_unavailable");
        const pageCount = Number(pageCountMatch[1]);
        if (!Number.isInteger(pageCount) || pageCount <= 0) throw new VisualRendererError("zero_pages");
        if (pageCount > MAX_RENDERED_PAGE_COUNT) throw new VisualRendererError("too_many_pages");

        let versionInfo: ProcessResult;
        try {
          versionInfo = await runProcess(pdftoppmPath, ["-v"], signal, 10_000, 16_384);
          if (versionInfo.exitCode !== 0 && versionInfo.exitCode !== 1) {
            throw new VisualRendererError("page_render_failed", versionInfo.exitCode);
          }
        } catch (error) {
          if (error instanceof VisualRendererError && error.exitCode === 1 && error.code !== "timeout") {
            versionInfo = { stdout: "", stderr: "", exitCode: 0 };
          } else {
            throw new VisualRendererError(errorCode(error, "page_render_failed"));
          }
        }
        const rasterizerVersion = `${versionInfo.stdout}\n${versionInfo.stderr}`.match(/pdftoppm version\s+([^\s]+)/i)?.[1] ?? "available";
        try {
          await runChecked(pdftoppmPath, ["-png", "-r", "150", pdfPath, pagePrefix], signal, PDF_RENDER_TIMEOUT_MS, "page_render_failed");
        } catch (error) {
          throw new VisualRendererError(errorCode(error, "page_render_failed"));
        }

        const names = await fs.readdir(tempDirectory);
        const pageFiles = names.flatMap(name => {
          const match = /^page-(\d+)\.png$/i.exec(name);
          return match ? [{ number: Number(match[1]), name }] : [];
        }).sort((a, b) => a.number - b.number);
        const pages: RenderedSourcePage[] = [];
        let totalPageBytes = 0;
        for (const item of pageFiles) {
          if (item.number < 1 || item.number > pageCount) continue;
          const imageBytes = await fs.readFile(path.join(tempDirectory, item.name));
          totalPageBytes += imageBytes.byteLength;
          if (imageBytes.byteLength === 0 || imageBytes.byteLength > MAX_PAGE_IMAGE_BYTES || totalPageBytes > MAX_TOTAL_PAGE_IMAGE_BYTES) {
            throw new VisualRendererError("page_render_failed");
          }
          pages.push({ page: item.number, imageBytes });
        }
        return {
          pageCount,
          pages,
          rasterizerName: "Poppler pdftoppm",
          rasterizerVersion,
        };
      } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}

export async function renderSourceDocx(
  sourceBytes: Uint8Array,
  expectedSha256: string,
  signal: AbortSignal,
  adapter?: SourceVisualRendererAdapter,
): Promise<SourceVisualRenderResult> {
  const actualSourceSha = sha256(sourceBytes);
  const rendererName = adapter?.rendererName ?? "Microsoft Word";
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) return makeResult(actualSourceSha, "invalid_source_sha", { rendererName });
  if (actualSourceSha.toLowerCase() !== expectedSha256.toLowerCase()) return makeResult(actualSourceSha, "source_hash_mismatch", { rendererName });
  if (sourceBytes.byteLength === 0) return makeResult(actualSourceSha, "empty_source", { rendererName });
  if (sourceBytes.byteLength > MAX_SOURCE_BYTES) return makeResult(actualSourceSha, "source_too_large", { rendererName });
  if (signal.aborted) return makeResult(actualSourceSha, "cancelled", { rendererName });

  const renderer = adapter ?? createWindowsSourceVisualRendererAdapter();
  let renderedPdf: { pdfBytes: Uint8Array; rendererVersion: string };
  try {
    renderedPdf = await renderer.renderPdf(sourceBytes, signal);
  } catch (error) {
    return makeResult(actualSourceSha, errorCode(error, "render_failed"), { rendererName });
  }

  if (!(renderedPdf.pdfBytes instanceof Uint8Array) || renderedPdf.pdfBytes.byteLength === 0) {
    return makeResult(actualSourceSha, "render_failed", { rendererName, rendererVersion: renderedPdf.rendererVersion });
  }
  if (renderedPdf.pdfBytes.byteLength > MAX_PDF_BYTES) {
    return makeResult(actualSourceSha, "pdf_too_large", { rendererName, rendererVersion: renderedPdf.rendererVersion });
  }
  if (signal.aborted) {
    return makeResult(actualSourceSha, "cancelled", { rendererName, rendererVersion: renderedPdf.rendererVersion, pdfBytes: renderedPdf.pdfBytes });
  }

  let renderedPages: Awaited<ReturnType<SourceVisualRendererAdapter["renderPages"]>>;
  try {
    renderedPages = await renderer.renderPages(renderedPdf.pdfBytes, signal);
  } catch (error) {
    return makeResult(actualSourceSha, errorCode(error, "page_render_failed"), {
      rendererName,
      rendererVersion: renderedPdf.rendererVersion,
      pdfBytes: renderedPdf.pdfBytes,
    });
  }

  const common = {
    rendererName,
    rendererVersion: renderedPdf.rendererVersion,
    rasterizerName: renderedPages.rasterizerName,
    rasterizerVersion: renderedPages.rasterizerVersion,
    pdfBytes: renderedPdf.pdfBytes,
    pageCount: Number.isInteger(renderedPages.pageCount) && renderedPages.pageCount > 0 ? renderedPages.pageCount : 0,
    pages: renderedPages.pages,
  };
  if (renderedPages.pageCount <= 0) return makeResult(actualSourceSha, "zero_pages", common);
  if (renderedPages.pageCount > MAX_RENDERED_PAGE_COUNT) return makeResult(actualSourceSha, "too_many_pages", common);
  if (signal.aborted) return makeResult(actualSourceSha, "cancelled", common);

  const orderedPages = [...renderedPages.pages].sort((a, b) => a.page - b.page);
  let totalPageBytes = 0;
  const validPageSet = orderedPages.length === renderedPages.pageCount &&
    orderedPages.every((item, index) => item.page === index + 1 && item.imageBytes instanceof Uint8Array && item.imageBytes.byteLength > 0);
  for (const item of orderedPages) {
    totalPageBytes += item.imageBytes.byteLength;
    if (item.imageBytes.byteLength > MAX_PAGE_IMAGE_BYTES || totalPageBytes > MAX_TOTAL_PAGE_IMAGE_BYTES) {
      return makeResult(actualSourceSha, "page_render_failed", common);
    }
  }
  if (!validPageSet) return makeResult(actualSourceSha, "page_count_mismatch", common);

  const pages = orderedPages.map(item => ({ ...item, sha256: sha256(item.imageBytes) }));
  return {
    manifest: {
      sourceSha256: actualSourceSha,
      rendererName,
      rendererVersion: renderedPdf.rendererVersion,
      rasterizerName: renderedPages.rasterizerName,
      rasterizerVersion: renderedPages.rasterizerVersion,
      pdfSha256: sha256(renderedPdf.pdfBytes),
      pageCount: renderedPages.pageCount,
      pages: pages.map(({ page, sha256: pageSha }) => ({ page, sha256: pageSha })),
      complete: true,
    },
    pdfBytes: renderedPdf.pdfBytes,
    pages,
  };
}
