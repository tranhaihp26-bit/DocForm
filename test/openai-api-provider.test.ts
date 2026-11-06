import test from "node:test";
import assert from "node:assert/strict";

const providerApi = await import("../src/server/openAiApiProvider.ts").catch(() => undefined) as any;

function fakeClient(result: { output_text?: string; model?: string } | Error, calls: any[]) {
  return {
    responses: {
      create: async (request: unknown, options: unknown) => {
        calls.push({ request, options });
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test("OpenAI Responses calls are stateless, use the configured model, and forward abort", async () => {
  assert.ok(providerApi?.createOpenAiApiProvider, "OpenAI API provider adapter must exist");
  const calls: any[] = [];
  const controller = new AbortController();
  const provider = providerApi.createOpenAiApiProvider({
    apiKey: "synthetic-openai-key",
    model: "synthetic-model",
    client: fakeClient({ output_text: "Synthetic response", model: "synthetic-model" }, calls),
  });

  const result = await provider("Synthetic review prompt", controller.signal);
  assert.deepEqual(calls[0].request, {
    model: "synthetic-model",
    input: "Synthetic review prompt",
    store: false,
  });
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(result, { text: "Synthetic response", model: "synthetic-model" });
});

test("OpenAI JSON mode is requested only for structured review calls", async () => {
  assert.ok(providerApi?.createOpenAiApiProvider);
  const jsonCalls: any[] = [];
  const textCalls: any[] = [];
  await providerApi.createOpenAiApiProvider({
    apiKey: "synthetic-openai-key",
    client: fakeClient({ output_text: "{}" }, jsonCalls),
    format: "json",
  })("Return JSON", new AbortController().signal);
  await providerApi.createOpenAiApiProvider({
    apiKey: "synthetic-openai-key",
    client: fakeClient({ output_text: "plain" }, textCalls),
  })("Return text", new AbortController().signal);

  assert.deepEqual(jsonCalls[0].request.text, { format: { type: "json_object" } });
  assert.equal("text" in textCalls[0].request, false);
});

test("OpenAI connection test uses fixed synthetic input and does not expose raw errors", async () => {
  assert.ok(providerApi?.testOpenAiApiConnection);
  const calls: any[] = [];
  const result = await providerApi.testOpenAiApiConnection({
    apiKey: "synthetic-openai-key",
    client: fakeClient({ output_text: "DOCFORM_API_CONNECTION_OK", model: "synthetic-model" }, calls),
    prompt: "PRIVATE_SOURCE_SENTINEL",
  } as any);

  assert.equal(calls[0].request.input, "Reply with exactly DOCFORM_API_CONNECTION_OK.");
  assert.equal(calls[0].request.store, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_SOURCE_SENTINEL"), false);

  const providerError = "raw response PRIVATE_ERROR_SENTINEL";
  await assert.rejects(
    providerApi.testOpenAiApiConnection({
      apiKey: "synthetic-openai-key",
      client: fakeClient(new Error(providerError), []),
    }),
    (error: any) => error.code === "provider_error" && !error.message.includes("PRIVATE_ERROR_SENTINEL"),
  );
});

test("OpenAI adapter rejects missing key and empty output without leaking secrets", async () => {
  assert.ok(providerApi?.createOpenAiApiProvider);
  const emptyKeyProvider = providerApi.createOpenAiApiProvider({ apiKey: "", client: fakeClient({ output_text: "unused" }, []) });
  await assert.rejects(
    emptyKeyProvider("Synthetic prompt", new AbortController().signal),
    (error: any) => error.code === "not_configured" && !error.message.includes("synthetic-openai-key"),
  );

  const emptyResponseProvider = providerApi.createOpenAiApiProvider({
    apiKey: "synthetic-openai-key",
    client: fakeClient({ output_text: "  " }, []),
  });
  await assert.rejects(
    emptyResponseProvider("Synthetic prompt", new AbortController().signal),
    (error: any) => error.code === "empty_response" && !error.message.includes("synthetic-openai-key"),
  );
});
