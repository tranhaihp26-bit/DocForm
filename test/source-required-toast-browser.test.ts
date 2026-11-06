import test from "node:test";
import assert from "node:assert/strict";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

test("blocked Step 3 explains the missing source in an accessible status message", async () => {
  const port = 5124;
  const server = await startTestServer(port);
  const client = new CdpClient("docform-source-required-toast");
  try {
    await client.launch(9624);
    await client.navigate(`http://127.0.0.1:${port}/`);
    assert.equal(await client.evaluate(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`), "1");

    assert.equal(await client.evaluate(`(() => {
      const step = document.querySelector('.df-workspace-sidebar button[data-step="3"]');
      if (!step) return false;
      step.click();
      return true;
    })()`), true, "Step 3 should be reachable to expose its gate explanation");

    assert.equal(await client.waitForFunction(`document.querySelector('.df-toast[role="status"][aria-live="polite"]')?.textContent?.includes('trước khi xem và xuất văn bản')`), true,
      "The gate message should match the requested action and be announced accessibly");
    assert.equal(await client.evaluate(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`), "1",
      "The export step must remain blocked without a source");
  } finally {
    client.close();
    server.kill();
  }
});
