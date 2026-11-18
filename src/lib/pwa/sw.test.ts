// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

type Handler = (event: Record<string, unknown>) => void;

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const cacheApi = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const map = store.get(name)!;
      return {
        add: async (url: string) => void map.set(url, new Response("x")),
        put: async (request: Request | string, response: Response) => void map.set(typeof request === "string" ? request : request.url, response),
        delete: async (request: string) => map.delete(request),
        keys: async () => [...map.keys()],
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (request: Request | string) => {
      const key = typeof request === "string" ? new URL(request, "https://z.test").pathname : request.url;
      for (const map of store.values()) {
        for (const [k, v] of map) if (k === key || k.endsWith(key)) return v;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: "https://z.test" },
    addEventListener: (type: string, handler: Handler) => void (handlers[type] = handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const fetchMock = vi.fn(async () => new Response("page", { status: 200 }));
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", "Response", "URL", source)(self, cacheApi, fetchMock, Response, URL);
  return { handlers, store, fetchMock };
}

async function navigate(w: ReturnType<typeof loadWorker>, path: string) {
  const request = { method: "GET", mode: "navigate", url: `https://z.test${path}` };
  let answer: Promise<Response> | undefined;
  const waits: Promise<unknown>[] = [];
  w.handlers.fetch!({ request, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
  const response = answer ? await answer : undefined;
  await Promise.all(waits);
  return { handled: Boolean(answer), response, request };
}

describe("service worker", () => {
  it("caches public pages but never private ones", async () => {
    const w = loadWorker();
    await navigate(w, "/cities/bengaluru");
    await navigate(w, "/bookings");
    await navigate(w, "/account/profile");
    const cached = [...(w.store.get("zovia-v2-pages")?.keys() ?? [])];
    expect(cached).toContain("https://z.test/cities/bengaluru");
    expect(cached.some((url) => /bookings|account/.test(url))).toBe(false);
  });

  it("serves the offline page when a private navigation fails and never a cached private copy", async () => {
    const w = loadWorker();
    await w.handlers.install!({ waitUntil: (p: Promise<unknown>) => p });
    w.fetchMock.mockRejectedValue(new TypeError("offline"));
    const { response } = await navigate(w, "/bookings");
    expect(response).toBeDefined();
    expect(await response!.text()).toBe("x"); // the precached /offline entry
  });

  it("leaves API calls alone and clears caches on the sign-out message", async () => {
    const w = loadWorker();
    expect((await navigate(w, "/api/v1/me")).handled).toBe(false);
    await navigate(w, "/");
    expect(w.store.size).toBeGreaterThan(0);
    let wait: Promise<unknown> | undefined;
    w.handlers.message!({ data: { type: "zovia:clear-caches" }, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect([...(w.store.get("zovia-v2-pages")?.keys() ?? [])]).toEqual(["/offline"]);
  });
});
