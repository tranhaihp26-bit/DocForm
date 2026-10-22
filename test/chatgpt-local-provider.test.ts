import test from "node:test";
import assert from "node:assert/strict";
import {
  createChatGPTPlanProvider,
  isLocalChatGPTActionRequest,
} from "../src/server/chatgptPlanProvider.ts";
import type { ChatGPTClient } from "../vendor/openai/sign-in-with-chatgpt-devkit/packages/local/src/types.ts";

type TextClient = Pick<ChatGPTClient, "getSession" | "listModels" | "streamResponse">;

test("ChatGPT text provider refuses a session without sharing before model lookup", async () => {
  const client: TextClient = {
    getSession: async () => ({ status: "connected", sharing: false }),
    listModels: async () => { throw new Error("model lookup must not run"); },
    streamResponse: async () => { throw new Error("document text must not be sent"); },
  };

  await assert.rejects(
    createChatGPTPlanProvider(client, new AbortController().signal),
    (error: any) => error?.code === "sharing_not_enabled",
  );
});

test("ChatGPT text provider uses an entitled catalog model for a completed response", async () => {
  const observed: Array<{ model: string; input: string }> = [];
  const client: TextClient = {
    getSession: async () => ({ status: "connected", sharing: true }),
    listModels: async () => [{ slug: "catalog-model-1", displayName: "Catalog 1" }, { slug: "catalog-model-2", displayName: "Catalog 2" }],
    streamResponse: async ({ model, input, signal }) => {
      assert.ok(signal instanceof AbortSignal);
      assert.equal(typeof input, "string");
      observed.push({ model, input: input as string });
      return { text: "{\"proposals\":[]}" };
    },
  };

  const provider = await createChatGPTPlanProvider(client, new AbortController().signal);
  const result = await provider("synthetic source text", new AbortController().signal);
  assert.deepEqual(observed, [{ model: "catalog-model-1", input: "synthetic source text" }]);
  assert.deepEqual(result, { text: "{\"proposals\":[]}", model: "catalog-model-1" });
});

test("ChatGPT document actions require explicit consent and matching loopback origin", () => {
  const request = { host: "localhost:5050", origin: "http://localhost:5050", port: 5050, consent: true };
  assert.equal(isLocalChatGPTActionRequest(request), true);
  assert.equal(isLocalChatGPTActionRequest({ ...request, consent: false }), false);
  assert.equal(isLocalChatGPTActionRequest({ ...request, origin: "http://127.0.0.1:5050" }), false);
  assert.equal(isLocalChatGPTActionRequest({ ...request, origin: "http://localhost:5050.evil.example" }), false);
  assert.equal(isLocalChatGPTActionRequest({ ...request, host: "localhost.evil.example:5050" }), false);
});
