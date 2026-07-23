import { describe, it, expect, vi, afterEach } from "vitest";
import { openRouterEmbedder } from "@/src/services/embeddings";

afterEach(() => vi.restoreAllMocks());

describe("OpenRouter embedder (Phase 9, G4)", () => {
  it("posts the OpenAI-compatible request and returns data[0].embedding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const emb = openRouterEmbedder({ apiKey: "sk-test", model: "openai/text-embedding-3-small" });
    const vec = await emb.embed("hello world");

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/embeddings");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "openai/text-embedding-3-small",
      input: "hello world",
      encoding_format: "float",
    });
  });

  it("throws a clear error without an API key", async () => {
    const emb = openRouterEmbedder({ apiKey: "" }); // force no key regardless of env
    await expect(emb.embed("x")).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("throws on a non-ok response (surfacing status)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }),
    );
    const emb = openRouterEmbedder({ apiKey: "sk-test" });
    await expect(emb.embed("x")).rejects.toThrow(/429/);
  });

  it("encodes the model in the embedder id (so re-embeds are detectable)", () => {
    expect(openRouterEmbedder({ apiKey: "k", model: "cohere/embed-v4" }).id).toBe(
      "openrouter:cohere/embed-v4",
    );
  });
});
