import test from "node:test";
import assert from "node:assert/strict";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

async function pointerClick(client: CdpClient, selector: string) {
  const point = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getBoundingClientRect().width>0);if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

test("general AI settings persist the provider and keep document consent separate", async () => {
  const port = 5137;
  const server = await startTestServer(port);
  const client = new CdpClient("docform-ai-settings-20261022");
  try {
    await client.launch(9637);
    await client.navigate(`http://127.0.0.1:${port}/`);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="app-settings-dialog"]'))`, 1500), false);
    assert.equal(await pointerClick(client, 'button[aria-label="Cài đặt chung"]'), true, "The application header opens general settings by pointer");
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="app-settings-dialog"]'))`), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="app-settings-dialog"]')?.contains(document.activeElement)`), true);

    await client.evaluate(`(()=>{const s=document.querySelector('[data-testid="ai-default-provider"]');s.value='chatgpt';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    assert.equal(await client.waitForFunction(`JSON.parse(localStorage.getItem('docform.ai-settings.v1')||'null')?.defaultProvider==='chatgpt'`), true);
    const persisted = await client.evaluate<any>(`JSON.parse(localStorage.getItem('docform.ai-settings.v1')||'null')`);
    assert.deepEqual(persisted, { version: 1, defaultProvider: "chatgpt" }, "Only the non-secret default provider is stored");

    await client.reload();
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="app-settings-dialog"]')===null`), true, "Settings do not reopen automatically after reload");
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button[aria-label="Cài đặt chung"]')).some(button=>button.getBoundingClientRect().width>0)`), true,
      "The general settings entry is reachable after application hydration");
    assert.equal(await pointerClick(client, 'button[aria-label="Cài đặt chung"]'), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="ai-default-provider"]')?.value==='chatgpt'`), true, "The preference is restored after a new page session");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="app-settings-dialog"]')===null`), true, "Escape closes general settings");
    assert.equal(await client.evaluate(`document.activeElement?.getAttribute('aria-label')==='Cài đặt chung'`), true, "Closing settings returns focus to its opener");

    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await client.evaluate(`Array.from(document.querySelectorAll('button[aria-label="Cài đặt chung"]')).some(button=>{const r=button.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})`), true, "The settings entry remains reachable in a narrow viewport");
  } finally {
    client.close();
    server.kill();
  }
});
