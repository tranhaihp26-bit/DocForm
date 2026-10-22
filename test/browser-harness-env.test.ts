import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestServerEnv } from "./support/browserHarness.ts";

test("browser test server env blocks inherited and dotenv Gemini credentials", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-test-dotenv-"));
  const dotenvFixture = path.join(tempDir, ".env.synthetic");
  fs.writeFileSync(dotenvFixture, [
    "GEMINI_API_KEY=synthetic-dotenv-key-must-not-load",
    "GOOGLE_API_KEY=synthetic-google-key-must-not-load",
    "GOOGLE_APPLICATION_CREDENTIALS=synthetic-service-account.json",
  ].join("\n"), "utf8");

  try {
    const testEnv = buildTestServerEnv({
      ...process.env,
      GEMINI_API_KEY: "synthetic-parent-key-must-not-load",
      GOOGLE_API_KEY: "synthetic-parent-google-key-must-not-load",
      GOOGLE_APPLICATION_CREDENTIALS: "synthetic-parent-service-account.json",
    }, 5901, { partitionAiMock: true });

    assert.equal(testEnv.GEMINI_API_KEY, "");
    assert.equal(testEnv.GOOGLE_API_KEY, "");
    assert.equal(testEnv.GOOGLE_APPLICATION_CREDENTIALS, "");
    assert.equal(testEnv.PORT, "5901");
    assert.equal(testEnv.DOCFORM_TEST_AI_PARTITION_MOCK, "true");

    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      "import dotenv from 'dotenv'; dotenv.config({ path: process.env.DOCFORM_TEST_DOTENV_FIXTURE, quiet: true }); process.stdout.write(JSON.stringify({ gemini: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_API_KEY, credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS }));",
    ], {
      cwd: process.cwd(),
      env: { ...testEnv, DOCFORM_TEST_DOTENV_FIXTURE: dotenvFixture },
      encoding: "utf8",
    });

    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { gemini: "", google: "", credentials: "" },
      "A synthetic .env file must not repopulate credentials after the browser harness clears them");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
