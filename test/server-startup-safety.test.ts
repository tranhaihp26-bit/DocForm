import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "production";
process.env.DOCFORM_TEST_NO_DOTENV = "true";
process.env.DOCFORM_SIWC_ENABLED = "false";
process.env.GEMINI_API_KEY = "";
process.env.GOOGLE_API_KEY = "";
const { startServer } = await import("../server.ts");
const close = (server: http.Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test("Explicit network binding does not authorize foreign-host AI requests without authentication", async () => {
  const server = await startServer({ port: 0, bindHost: "0.0.0.0" });
  try {
    const port = (server.address() as AddressInfo).port;
    for (const route of ["format-document", "refine-text", "review-document", "check-partitions", "review-full-text", "full-text-review"]) {
      for (const origin of [undefined, "http://foreign.invalid"]) {
        // fetch may replace Host; use the HTTP client to send the actual wire header.
        const status = await new Promise<number | undefined>((resolve, reject) => {
          const request = http.request({ hostname: "127.0.0.1", port, path: `/api/ai/${route}`, method: "POST", headers: { "Content-Type": "application/json", Host: "foreign.invalid", ...(origin ? { Origin: origin } : {}) } }, response => {
            response.resume(); response.once("end", () => resolve(response.statusCode));
          });
          request.once("error", reject); request.end("{}");
        });
        assert.equal(status, 403, `${route} must reject foreign Host regardless of explicit binding or Origin`);
      }
    }
    const local = await fetch(`http://127.0.0.1:${port}/api/ai/review-full-text`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: "{}" });
    assert.equal(local.status, 400, "A genuine local request still reaches payload validation");
  } finally { await close(server); }
});

test("Cloud environment does not implicitly authorize extracted-text AI review", async () => {
  const previous = process.env.K_SERVICE;
  process.env.K_SERVICE = "synthetic-security-test";
  let server: http.Server | undefined;
  try {
    server = await startServer({ port: 0, bindHost: "127.0.0.1" });
    const port = (server.address() as AddressInfo).port;
    const result = await fetch(`http://127.0.0.1:${port}/api/ai/review-full-text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(result.status, 403, "Local-only AI transport cannot be opened by a cloud marker");
  } finally {
    if (server) await close(server);
    if (previous === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = previous;
  }
});

test("Occupied port rejects startServer and releases Vite in production and development", { timeout: 50000 }, async () => {
  const occupied = http.createServer();
  await new Promise<void>(resolve => occupied.listen(0, "127.0.0.1", resolve));
  const port = (occupied.address() as AddressInfo).port;
  const script = `const {startServer}=await import('./server.ts'); try { const s=await startServer({port:${port},bindHost:'127.0.0.1'}); s.close(); process.exitCode=2; } catch(error) { if(error.code==='EADDRINUSE') console.log('EXPECTED_STARTUP_REJECTION'); else process.exitCode=3; }`;
  try {
    for (const mode of ["production", "development"]) {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: mode, DOCFORM_TEST_NO_VITE_CONFIG: "true" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let output = "";
      child.stdout.on("data", chunk => { output += String(chunk); });
      child.stderr.on("data", chunk => { output += String(chunk); });
      const timer = setTimeout(() => child.kill(), 20000);
      try {
        const code = await new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
        assert.equal(code, 0, `Failed listen must reject and let the ${mode} process exit naturally`);
        assert.match(output, /EXPECTED_STARTUP_REJECTION/);
      } finally { clearTimeout(timer); child.kill(); }
    }
  } finally { await close(occupied); }
});
