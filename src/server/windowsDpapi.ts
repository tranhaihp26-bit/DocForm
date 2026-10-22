import { spawn } from "node:child_process";
import type { CredentialEncryption } from "../../vendor/openai/sign-in-with-chatgpt-devkit/packages/local/src/types.ts";

const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const PROBE_TEXT = "DocForm SIWC DPAPI availability probe";
const ENTROPY_TEXT = "DocForm-30-SIWC-DPAPI-v1";

function runPowerShellDpapi(operation: "protect" | "unprotect", input: Uint8Array): Promise<Uint8Array> {
  if (process.platform !== "win32") return Promise.reject(new Error("Windows DPAPI is unavailable."));

  const method = operation === "protect" ? "Protect" : "Unprotect";
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$encoded = [Console]::In.ReadToEnd().Trim()",
    "$data = [Convert]::FromBase64String($encoded)",
    `$entropy = [Text.Encoding]::UTF8.GetBytes('${ENTROPY_TEXT}')`,
    `$result = [Security.Cryptography.ProtectedData]::${method}($data, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    "[Console]::Out.Write([Convert]::ToBase64String($result))",
  ].join("; ");
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript], {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error("Windows DPAPI operation failed."));
      child.kill();
    };
    const timeout = setTimeout(fail, 15_000);
    timeout.unref();

    child.stdout.on("data", (part: Buffer | string) => {
      const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part, "ascii");
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_BUFFER_BYTES) {
        fail();
        return;
      }
      stdout.push(buffer);
    });
    child.stderr.on("data", () => {
      // Diagnostics can contain input-derived material and are never logged.
    });
    child.on("error", fail);
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("Windows DPAPI operation failed."));
        return;
      }
      const encoded = Buffer.concat(stdout).toString("ascii").trim();
      if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        reject(new Error("Windows DPAPI returned invalid data."));
        return;
      }
      resolve(Buffer.from(encoded, "base64"));
    });
    child.stdin.on("error", () => {
      // The close handler reports the generic failure without echoing input.
    });
    child.stdin.end(Buffer.from(input).toString("base64"), "ascii");
  });
}

let availabilityCheck: Promise<boolean> | undefined;

async function checkAvailability(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const protectedSample = await runPowerShellDpapi("protect", Buffer.from(PROBE_TEXT, "utf8"));
    const restoredSample = await runPowerShellDpapi("unprotect", protectedSample);
    return Buffer.from(restoredSample).equals(Buffer.from(PROBE_TEXT, "utf8"));
  } catch {
    return false;
  }
}

export const windowsDpapiCredentialEncryption: CredentialEncryption = {
  id: "windows-dpapi-current-user-v1",
  isAvailable() {
    availabilityCheck ??= checkAvailability();
    return availabilityCheck;
  },
  async encrypt(plaintext) {
    return runPowerShellDpapi("protect", Buffer.from(plaintext, "utf8"));
  },
  async decrypt(ciphertext) {
    const plaintext = await runPowerShellDpapi("unprotect", ciphertext);
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  },
};
