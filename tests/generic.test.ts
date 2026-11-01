import { describe, it, expect } from "vitest";
import { GenericChatAdapter } from "../src/generic-adapter";
import { StorageRepository } from "../src/storage";
import { validSnapshot, scopedChatId } from "../src/bridge";
import { genericFixture, genericTurn, deepseekFixture } from "./fixtures";
import type { Snapshot } from "../src/model";
function adapter(
  html = genericFixture(),
  url = "https://synthetic-chat.example/chat/first",
) {
  document.documentElement.innerHTML = html;
  let location = new URL(url);
  return {
    engine: new GenericChatAdapter(document, () => location),
    navigate: (target: string) => {
      location = new URL(target, location);
    },
  };
}
function snap(id = "thread:generic"): Snapshot {
  return {
    id,
    source: "generic",
    sourceOrigin: "https://synthetic-chat.example",
    temporary: null,
    captureMode: "explicit",
    messages: [
      {
        id: "native-user",
        role: "user",
        text: "synthetic",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}
describe("conservative generic extraction", () => {
  it("extracts full role text on an unlisted origin without a vendor rule", () => {
    const result = adapter().engine.inspect();
    expect(result.reason).toBe("ready");
    expect(result.snapshot?.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "通用合成问题"],
      ["assistant", "通用合成回复\n保留第二段"],
    ]);
    expect(result.snapshot).toMatchObject({
      source: "generic",
      captureMode: "explicit",
      temporary: null,
    });
    expect(validSnapshot(result.snapshot)).toBe(false);
    expect(validSnapshot(result.snapshot, true)).toBe(true);
  });
  it("upserts streams with stable IDs and distinguishes repeated identical messages", () => {
    const { engine } = adapter(
      genericFixture(
        "thread",
        genericTurn("one", "重复问题", "重复回答") +
          genericTurn("two", "重复问题", "重复回答"),
      ),
    );
    const first = engine.inspect().snapshot!;
    expect(new Set(first.messages.map((m) => m.id)).size).toBe(4);
    for (let i = 0; i < 50; i++) {
      document.querySelector("[data-stream]")!.textContent = "stream " + i;
      expect(engine.inspect().snapshot?.messages.map((m) => m.id)).toEqual(
        first.messages.map((m) => m.id),
      );
    }
    expect(engine.inspect().snapshot?.messages[1]?.text).toBe(
      "stream 49\n保留第二段",
    );
  });
  it("refuses positional roles, missing native IDs and reused row indices", () => {
    expect(
      adapter("<main><p>user</p><p>assistant</p></main>").engine.inspect()
        .reason,
    ).toBe("no-content");
    const { engine } = adapter();
    document.querySelectorAll("[data-message-id]").forEach((el) => {
      el.removeAttribute("data-message-id");
      el.setAttribute("data-index", "1");
    });
    expect(engine.inspect().reason).toBe("identity-missing");
  });
  it("rejects conflicting nested roles, duplicate IDs and multiple active conversations", () => {
    expect(
      adapter(
        genericFixture("t", genericTurn() + genericTurn()),
      ).engine.inspect().reason,
    ).toBe("ambiguous");
    const { engine } = adapter();
    document
      .querySelector("[data-message-author-role=user]")!
      .insertAdjacentHTML(
        "beforeend",
        '<span data-role="assistant">wrong role</span>',
      );
    expect(engine.inspect().reason).toBe("ambiguous");
    expect(
      adapter(genericFixture() + genericFixture("second")).engine.inspect()
        .reason,
    ).toBe("ambiguous");
  });
  it("excludes hidden branches, editors, navigation and controls", () => {
    const { engine } = adapter(
      genericFixture(
        "t",
        genericTurn() +
          "<aside>" +
          genericTurn("sidebar") +
          "</aside><div hidden>" +
          genericTurn("hidden") +
          "</div><form>" +
          genericTurn("editor") +
          "</form>",
      ),
    );
    expect(engine.inspect().snapshot?.messages).toHaveLength(2);
    expect(engine.inspect().snapshot?.messages[1]?.text).not.toContain("复制");
  });
  it("does not invent temporary mode from transcript text or URL", () => {
    const s = adapter(
      genericFixture("t", genericTurn("one", "Temporary chat", "Incognito")),
      "https://synthetic-chat.example/?temporary-chat=true",
    ).engine.inspect().snapshot!;
    expect(s.temporary).toBe(null);
  });
  it("rejects share and non-HTTPS pages", () => {
    for (const url of [
      "https://synthetic-chat.example/share/abc",
      "http://synthetic-chat.example/chat",
    ])
      expect(adapter(undefined, url).engine.inspect().reason).toBe(
        "unsupported-page",
      );
  });
  it("requires globally unique native anchors when a conversation key is absent", () => {
    const { engine } = adapter("<main>" + genericTurn() + "</main>");
    expect(engine.inspect().reason).toBe("identity-missing");
    document
      .querySelectorAll("[data-message-id]")
      .forEach((el) => el.setAttribute("data-message-id", crypto.randomUUID()));
    expect(engine.inspect().reason).toBe("ready");
  });
  it("extracts experimental DeepSeek layout only with native session and item keys", () => {
    const { engine, navigate } = adapter(
      deepseekFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic",
    );
    expect(engine.inspect()).toMatchObject({
      reason: "ready",
      method: "deepseek-layout",
      snapshot: { temporary: null },
    });
    expect(engine.inspect().snapshot?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    document.querySelector("[data-stream]")!.textContent = "updated";
    expect(engine.inspect().snapshot?.messages[1]?.id).toBe(
      "assistant:native-item:11",
    );
    navigate("/");
    expect(engine.inspect().reason).toBe("identity-missing");
  });
});
describe("explicit per-conversation persistence", () => {
  it("requires local authorization plus a successful explicit confirmation", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    expect(await r.capture(snap(), true)).toBe(false);
    await r.authorize();
    expect(await r.capture(snap())).toBe(false);
    expect(await r.capture({ ...snap(), captureMode: undefined }, true)).toBe(
      false,
    );
    expect(await r.capture(snap(), true)).toBe(true);
    expect(await r.genericAllowed(snap().id)).toBe(true);
    expect(await r.genericCount()).toBe(1);
    expect(await r.capture(snap("thread:different"))).toBe(false);
    expect(await r.enabledPlatforms()).toEqual([]);
    await r.close();
  });
  it("accepts explicitly requested ordinary copies while built-in automatic capture stays strict", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.setAutoCapture(true);
    expect(await r.capture({ ...snap(), temporary: false }, true)).toBe(true);
    expect(
      await r.capture(
        { ...snap("thread:builtin"), source: "chatgpt", temporary: false },
        true,
      ),
    ).toBe(false);
    const stored = await r.get(snap().id);
    expect(stored).toMatchObject({
      source: "generic",
      sourceOrigin: "https://synthetic-chat.example",
      captureMode: "explicit",
    });
    await r.close();
  });
  it("rejects invalid origins, mixed scopes and different tabs", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    for (const origin of [
      "http://site.example",
      "https://site.example/path",
      "invalid",
    ])
      expect(await r.capture({ ...snap(), sourceOrigin: origin }, true)).toBe(
        false,
      );
    const keys = ["https://one.example", "https://two.example"].flatMap(
      (origin) =>
        [1, 2].map((tab) =>
          scopedChatId(tab, "thread:same", "generic", origin),
        ),
    );
    expect(new Set(keys).size).toBe(4);
    expect(validSnapshot({ ...snap(), temporary: false })).toBe(false);
    await r.close();
  });
  it("pause, exclusion and deletion block confirmation and never resurrect content", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.capture(snap(), true);
    await r.pause(snap().id, true);
    expect(await r.capture(snap(), true)).toBe(false);
    await r.pause(snap().id, false);
    await r.exclude(snap().id);
    expect(await r.capture(snap(), true)).toBe(false);
    await r.delete(snap().id);
    expect(await r.capture(snap(), true)).toBe(false);
    expect(await r.genericAllowed(snap().id)).toBe(false);
    expect((await r.get(snap().id))?.messages).toEqual([]);
    await r.close();
  });
  it("the global off switch and reset revoke generic capture", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.capture(snap(), true);
    await r.setAutoCapture(false);
    expect(await r.capture(snap())).toBe(false);
    expect(await r.autoCapture()).toBe(false);
    await r.capture(snap(), true);
    await r.reset();
    expect(await r.capture(snap())).toBe(false);
    expect(await r.genericCount()).toBe(0);
    expect(await r.list()).toEqual([]);
    await r.close();
  });
});
