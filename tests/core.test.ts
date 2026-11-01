import { describe, it, expect, vi } from "vitest";
import { StorageRepository } from "../src/storage";
import { SessionCapture } from "../src/capture";
import { MockAdapter, chatGPTCapability } from "../src/adapters";
import { importText, context, json, longContext } from "../src/recovery";
import type { Snapshot } from "../src/model";
function snapshot(id = "a", text = "synthetic", updatedAt = 1): Snapshot {
  return {
    id,
    temporary: true,
    messages: [
      { id: "m", role: "assistant", text, order: 0, createdAt: 1, updatedAt },
    ],
  };
}
async function repository() {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  return r;
}
describe("transactional storage and capture", () => {
  it("requires explicit authorization", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    expect(await r.capture(snapshot())).toBe(false);
    expect(await r.list()).toEqual([]);
    await expect(
      r.importSession(importText("[user]\nhello", "")),
    ).rejects.toThrow();
  });
  it("upserts 50 streaming scans and multiple turns without duplication", async () => {
    const r = await repository();
    for (let i = 1; i <= 50; i++)
      await r.capture(snapshot("a", "x".repeat(i), i));
    const s = snapshot("a", "x".repeat(50), 51);
    s.messages.push({
      id: "m2",
      role: "user",
      text: "next turn",
      order: 1,
      createdAt: 51,
      updatedAt: 51,
    });
    await r.capture(s);
    await r.capture(s);
    expect((await r.get("a"))?.messages.map((m) => m.text)).toEqual([
      "x".repeat(50),
      "next turn",
    ]);
  });
  it("ignores stale updates and preserves original timestamps", async () => {
    const r = await repository();
    await r.capture(snapshot("a", "new", 20));
    await r.capture(snapshot("a", "old", 10));
    expect((await r.get("a"))?.messages[0]).toMatchObject({
      text: "new",
      createdAt: 1,
    });
  });
  it("reopens persisted data on a fresh connection", async () => {
    const name = crypto.randomUUID();
    const a = new StorageRepository(name);
    await a.authorize();
    await a.capture(snapshot());
    await a.close();
    const b = new StorageRepository(name);
    expect((await b.list())[0]?.messages[0]?.text).toBe("synthetic");
  });
  it("rejects regular and uncertain chats", async () => {
    const r = await repository();
    await r.capture({ ...snapshot(), temporary: false });
    await r.capture({ ...snapshot(), temporary: null });
    expect(await r.list()).toHaveLength(0);
    expect(chatGPTCapability.enabled).toBe(true);
  });
  it("keeps tab and navigation scopes separate", async () => {
    const r = await repository();
    await Promise.all(
      ["tab1:s1", "tab2:s1", "tab1:s2"].map((id) => r.capture(snapshot(id))),
    );
    expect(await r.list()).toHaveLength(3);
  });
  it("does not resurrect deleted or excluded sessions", async () => {
    const r = await repository();
    await r.capture(snapshot("a"));
    await r.exclude("a");
    expect(await r.capture(snapshot("a", "secret", 2))).toBe(false);
    await r.delete("a");
    expect(await r.capture(snapshot("a", "again", 3))).toBe(false);
    expect(await r.list()).toHaveLength(0);
    expect((await r.get("a"))?.messages).toEqual([]);
  });
  it("atomically clears content and authorization despite concurrent writes", async () => {
    const r = await repository();
    await r.capture(snapshot());
    await Promise.all([
      r.capture(snapshot("b")),
      r.reset(),
      r.capture(snapshot("c")),
    ]);
    expect(await r.list()).toEqual([]);
    expect(await r.consent()).toBe(false);
    expect(await r.get("a")).toBeUndefined();
  });
  it("searches full message body", async () => {
    const r = await repository();
    await r.capture(snapshot("a", "needle"));
    expect(await r.list("NEEDLE")).toHaveLength(1);
    expect(await r.list("absent")).toHaveLength(0);
  });
  it("shows saved only after persistence resolves", async () => {
    let resolve!: (b: boolean) => void;
    const states: string[] = [];
    const capture = new SessionCapture(
      { source: "mock", read: () => snapshot() },
      {
        capture: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
      (s) => states.push(s),
    );
    const pending = capture.scan();
    await Promise.resolve();
    expect(states).toEqual(["saving"]);
    resolve(true);
    await pending;
    expect(states).toEqual(["saving", "saved"]);
  });
  it("reports errors without saved and can retry", async () => {
    const states: string[] = [];
    const writer = {
      capture: vi
        .fn()
        .mockRejectedValueOnce(new Error("synthetic failure"))
        .mockResolvedValueOnce(true),
    };
    const c = new SessionCapture(
      { source: "mock", read: () => snapshot() },
      writer,
      (s) => states.push(s),
    );
    await c.scan();
    expect(states).toEqual(["saving", "error"]);
    await c.scan();
    expect(states.at(-1)).toBe("saved");
  });
  it("pauses writes", async () => {
    const writer = { capture: vi.fn() };
    const c = new SessionCapture(
      { source: "mock", read: () => snapshot() },
      writer,
      () => {},
    );
    c.pause(true);
    await c.scan();
    expect(writer.capture).not.toHaveBeenCalled();
  });
});
it("appends new DOM messages after refresh without interleaving existing turns", async () => {
  const r = await repository();
  const first = snapshot();
  first.messages = [
    { ...first.messages[0]!, id: "u1", role: "user", order: 0 },
    { ...first.messages[0]!, id: "a1", order: 1 },
  ];
  await r.capture(first);
  const refreshed = {
    ...first,
    messages: first.messages.map((m) => ({
      ...m,
      id: m.id + "new",
      updatedAt: 2,
    })),
  };
  await r.capture(refreshed);
  expect((await r.get("a"))?.messages.map((m) => m.id)).toEqual([
    "u1",
    "a1",
    "u1new",
    "a1new",
  ]);
});
describe("DOM adapter", () => {
  it("uses stable ids during streaming and scopes sessions", () => {
    const el = document.createElement("div");
    el.dataset.session = "s1";
    el.dataset.temporary = "true";
    el.innerHTML =
      '<article data-message-id="m1" data-role="assistant">part</article>';
    const a = new MockAdapter(el, "tab1");
    expect(a.read()?.messages[0]?.text).toBe("part");
    el.firstElementChild!.textContent = "complete";
    expect(a.read()?.messages).toHaveLength(1);
    expect(a.read()?.messages[0]?.id).toBe("m1");
    expect(new MockAdapter(el, "tab2").read()?.id).not.toBe(a.read()?.id);
    el.dataset.session = "s2";
    expect(a.read()?.id).toBe("mock:tab1:s2");
    delete el.dataset.temporary;
    expect(a.read()?.temporary).toBe(null);
  });
});
describe("explicit import and recovery", () => {
  it("preserves roles order Unicode and multiline text through JSON", () => {
    const s = importText(
      "[user]\n你好\nsecond line\n\n[assistant]\nanswer",
      "",
    );
    expect(context(s)).toBe("[user]\n你好\nsecond line\n\n[assistant]\nanswer");
    expect(context(importText(json(s), ""))).toBe(context(s));
  });
  it("does not render HTML or guess unsupported roles", () => {
    expect(() => importText("ambiguous prose", "")).toThrow();
    expect(() =>
      importText(
        '{"version":1,"session":{"messages":[{"role":"system","text":"x"}]}}',
        "",
      ),
    ).toThrow();
    const s = importText("[user]\n<script>test</script>", "");
    expect(s.messages[0]?.text).toBe("<script>test</script>");
  });
  it("rejects oversized imports and warns about long contexts without truncation", () => {
    expect(() => importText("x".repeat(2000001), "")).toThrow();
    const s = importText("[user]\n" + "字".repeat(25000), "");
    expect(longContext(s)).toBe(true);
    expect(context(s).length).toBe(25007);
  });
});
