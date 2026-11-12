/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic-provider";
import { selectPresentedCards } from "./present";
import type { ToolRuntime } from "./provider";
import type { AssistantPropertyCard } from "./schemas";

const REAL = "aaaaaaaa-0000-4000-8000-000000000001";
const FAKE = "ffffffff-0000-4000-8000-00000000000f";

function message(content: unknown[], stop_reason: string) {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: DEFAULT_ANTHROPIC_MODEL,
    content,
    stop_reason,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

function fakeClient(responses: unknown[]) {
  // Requests are copied when sent: the provider keeps appending to the same messages array.
  const requests: Record<string, any>[] = [];
  let index = 0;
  const create = vi.fn(async (body: Record<string, unknown>) => {
    requests.push(structuredClone(body));
    return responses[index++];
  });
  return { create, requests, client: { beta: { messages: { create } } } as never };
}

function runtime(): ToolRuntime & { seen: Map<string, AssistantPropertyCard>; run: ReturnType<typeof vi.fn> } {
  const seen = new Map<string, AssistantPropertyCard>();
  const run = vi.fn(async (name: string) => {
    if (name === "search_properties") {
      seen.set(REAL, { id: REAL } as AssistantPropertyCard);
      return { content: { total_matches: 1, listings: [{ id: REAL, title: "QA Sunny PG" }] } };
    }
    return { content: { error: "unknown" }, is_error: true };
  });
  return {
    definitions: [
      { name: "search_properties", description: "search", input_schema: { type: "object", properties: {} } },
    ],
    seen,
    run,
  };
}

describe("AnthropicProvider", () => {
  it("runs tools, then returns the present_results payload", async () => {
    const { requests, client } = fakeClient([
      message([{ type: "tool_use", id: "t1", name: "search_properties", input: { city: "bengaluru" } }], "tool_use"),
      message(
        [
          {
            type: "tool_use",
            id: "t2",
            name: "present_results",
            input: { message: "Here is one.", property_ids: [REAL, FAKE], alternatives: false },
          },
        ],
        "tool_use",
      ),
    ]);
    const tools = runtime();
    const provider = new AnthropicProvider({ apiKey: "test", client });
    const result = await provider.respond({ system: "sys", history: [], message: "PG in Bengaluru", tools });

    expect(result.outcome).toBe("presented");
    expect(result.tool_calls).toBe(1);
    expect(result.input_tokens).toBe(200);
    expect(tools.run).toHaveBeenCalledWith("search_properties", { city: "bengaluru" });

    // Second request carries the tool_result for t1 in one user message.
    const second = requests[1]!;
    expect(second.messages.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1" }],
    });
    expect(second.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(second.tools.map((t: { name: string }) => t.name)).toEqual(["search_properties", "present_results"]);
    expect(second.tool_choice).toEqual({ type: "auto" });

    // The made-up id is dropped by the server-side validation step.
    const { cards, dropped } = selectPresentedCards(result.present!.property_ids, tools.seen);
    expect(cards.map((c) => c.id)).toEqual([REAL]);
    expect(dropped).toEqual([FAKE]);
  });

  it("returns plain text when the model answers without tools (guidance)", async () => {
    const { client } = fakeClient([message([{ type: "text", text: "Deposits are usually 1-2 months." }], "end_turn")]);
    const provider = new AnthropicProvider({ apiKey: "test", client, model: "claude-opus-5-5" });
    const result = await provider.respond({
      system: "sys",
      history: [{ role: "assistant", content: "Hi" }, { role: "user", content: "earlier" }, { role: "assistant", content: "ok" }],
      message: "How much deposit?",
      tools: runtime(),
    });
    expect(result).toMatchObject({ outcome: "text", text: "Deposits are usually 1-2 months.", model: DEFAULT_ANTHROPIC_MODEL });
  });

  it("drops a leading assistant turn and uses AI_MODEL", async () => {
    const { requests, client } = fakeClient([message([{ type: "text", text: "ok" }], "end_turn")]);
    await new AnthropicProvider({ apiKey: "k", client, model: "claude-haiku-5-5" }).respond({
      system: "s",
      history: [{ role: "assistant", content: "Hi" }],
      message: "hello",
      tools: runtime(),
    });
    const request = requests[0]!;
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(request.fallbacks).toBeUndefined();
  });

  it("reports a refusal", async () => {
    const { client } = fakeClient([message([], "refusal")]);
    const result = await new AnthropicProvider({ apiKey: "k", client }).respond({
      system: "s",
      history: [],
      message: "x",
      tools: runtime(),
    });
    expect(result.outcome).toBe("refusal");
  });

  it("asks again when present_results input is invalid, and stops after the step limit", async () => {
    const bad = message([{ type: "tool_use", id: "p", name: "present_results", input: { property_ids: [] } }], "tool_use");
    const { create, requests, client } = fakeClient(Array.from({ length: 6 }, () => bad));
    const result = await new AnthropicProvider({ apiKey: "k", client }).respond({
      system: "s",
      history: [],
      message: "x",
      tools: runtime(),
    });
    expect(result.outcome).toBe("incomplete");
    expect(create).toHaveBeenCalledTimes(6);
    expect(requests[1]!.messages.at(-1).content[0]).toMatchObject({ is_error: true, tool_use_id: "p" });
  });
});
