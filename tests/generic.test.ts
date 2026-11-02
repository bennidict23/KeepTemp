import { describe, it, expect, vi } from "vitest";
import { GenericChatAdapter } from "../src/adapters/generic";
import { StorageRepository } from "../src/storage";
import { validSnapshot, scopedChatId } from "../src/model";
import {
  genericFixture,
  genericTurn,
  deepseekFixture,
  deepseekVirtualFixture,
  otherProviders,
  providerFixture,
  shell,
} from "./fixtures";
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
        {
          ...snap("thread:builtin"),
          source: "chatgpt",
          captureMode: undefined,
          temporary: false,
        },
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

describe("built-in explicit capture shares the existing session identity", () => {
  it("keeps explicit authorization and metadata when automatic mode later becomes recognizable", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    const first = {
      ...snap("grok:1:thread:native"),
      source: "grok" as const,
      sourceOrigin: "https://grok.com",
    };
    expect(await r.capture(first, true)).toBe(true);
    expect(await r.autoCapture("grok")).toBe(false);
    const automatic = {
      ...first,
      captureMode: undefined,
      sourceOrigin: undefined,
      temporary: true,
      messages: first.messages.map((m) => ({
        ...m,
        text: "later",
        updatedAt: 2,
      })),
    };
    expect(await r.capture(automatic)).toBe(true);
    expect(await r.list()).toHaveLength(1);
    expect((await r.list())[0]).toMatchObject({
      source: "grok",
      captureMode: "explicit",
      sourceOrigin: "https://grok.com",
    });
    await r.setAutoCapture(false);
    await r.setAutoCapture(true);
    expect(await r.capture(automatic)).toBe(false); // global on does not reauthorize explicit copies
    await r.close();
  });
});

describe("manual platform previews never invent temporary mode", () => {
  it.each(otherProviders)("previews $0 without privacy markers", (source) => {
    const fixture = providerFixture(source);
    const html = fixture.html.replace(/<header>[\s\S]*?<\/header>/, "");
    const result = adapter(html, fixture.url).engine.inspect();
    expect(result).toMatchObject({
      reason: "ready",
      method: "platform-layout",
      snapshot: { temporary: null, captureMode: "explicit" },
    });
    expect(result.snapshot?.messages).toHaveLength(2);
  });
  it("previews the ChatGPT app shell without temporary query", () => {
    const result = adapter(
      shell(),
      "https://chatgpt.com/c/synthetic",
    ).engine.inspect();
    expect(result).toMatchObject({
      reason: "ready",
      method: "platform-layout",
      snapshot: { temporary: null },
    });
  });
});

describe("DeepSeek native virtual list without a semantic main", () => {
  it("extracts role bodies from the virtual list, not the thinking panel or toolbar", () => {
    const result = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic-new-layout",
    ).engine.inspect();
    expect(result.reason).toBe("ready");
    expect(result.snapshot?.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "DeepSeek 合成问题"],
      ["assistant", "DeepSeek 合成回复\n\n保留第二段"],
    ]);
  });
  it("keeps the native reply identity while the thinking-only placeholder becomes a final answer", () => {
    const { engine } = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic-new-layout",
    );
    const body = document.querySelector<HTMLElement>(
      ".ds-assistant-message-main-content",
    )!;
    const markup = body.innerHTML;
    body.innerHTML = "";
    const initial = engine.inspect().snapshot!;
    expect(initial?.messages[1]).toMatchObject({ role: "assistant", text: "" });
    body.innerHTML = markup;
    expect(engine.inspect().snapshot?.messages[1]?.id).toBe(
      initial.messages[1]!.id,
    );
  });
});

describe("DeepSeek layout safety", () => {
  it("keeps markdown inside a user collapsible bubble in the user role", () => {
    const { engine } = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic",
    );
    document.querySelector(".ds-collapsible-text")!.innerHTML =
      '<div class="ds-markdown"><pre>合成用户代码</pre></div>';
    expect(engine.inspect().snapshot?.messages[0]).toMatchObject({
      role: "user",
      text: "合成用户代码",
    });
  });
  it("does not resolve conflicting explicit roles by guessing from layout", () => {
    const { engine } = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic",
    );
    const user = document.querySelector<HTMLElement>(
      ".ds-message:not(nav .ds-message)",
    )!;
    user.dataset.messageRole = "user";
    user.dataset.role = "assistant";
    expect(engine.inspect().reason).toBe("ambiguous");
  });
  it("rejects two visible virtual conversations, hidden copies do not count", () => {
    const { engine } = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic",
    );
    const copy = document
      .querySelector<HTMLElement>(".ds-virtual-list")!
      .cloneNode(true) as HTMLElement;
    document.body.append(copy);
    expect(engine.inspect().reason).toBe("ambiguous");
    copy.hidden = true;
    expect(engine.inspect().snapshot?.messages).toHaveLength(2);
  });
  it("reports a missing region separately from unrecognized speakers", () => {
    const { engine } = adapter(
      '<div><div class="ds-message">synthetic</div></div>',
      "https://chat.deepseek.com/a/chat/s/synthetic",
    );
    expect(engine.inspect().reason).toBe("region-missing");
  });
  it.each([".ds-virtual-list-visible-items", ".ds-virtual-list-items"])(
    "supports the %s root without a main or virtual-list wrapper",
    (selector) => {
      const { engine } = adapter(
        deepseekVirtualFixture(),
        "https://chat.deepseek.com/a/chat/s/synthetic",
      );
      const content = document.querySelector(selector)!.outerHTML;
      document.body.innerHTML = content;
      expect(engine.inspect().snapshot?.messages).toHaveLength(2);
    },
  );
});

describe("intentional re-recording and partial virtual windows", () => {
  it("only a manual restart replaces a deletion marker, without restoring deleted messages or title", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    const initial = snap("thread:restart");
    initial.messages[0]!.text = "old synthetic content";
    await r.capture(initial, true);
    await r.rename(initial.id, "old renamed title");
    await r.delete(initial.id);
    expect(await r.capture(initial)).toBe(false);
    expect(await r.capture(initial, false, true)).toBe(false);
    const fresh = {
      ...initial,
      messages: [
        {
          ...initial.messages[0]!,
          id: "fresh",
          text: "fresh visible content",
          updatedAt: 100,
        },
      ],
    };
    expect(await r.capture(fresh, true, true)).toBe(true);
    const saved = await r.get(initial.id);
    expect(saved?.title).toBe("fresh visible content");
    expect(saved?.messages.map((m) => m.text)).toEqual([
      "fresh visible content",
    ]);
    expect(saved?.deleted).toBeUndefined();
    expect(await r.genericAllowed(initial.id)).toBe(true);
    await r.close();
  });
  it("manual restart still refuses paused or excluded records", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.capture(snap(), true);
    await r.pause(snap().id, true);
    expect(await r.capture(snap(), true, true)).toBe(false);
    await r.pause(snap().id, false);
    await r.exclude(snap().id);
    expect(await r.capture(snap(), true, true)).toBe(false);
    await r.close();
  });
  it("keeps updating a native DeepSeek reply after the earlier user turn is unmounted", async () => {
    const { engine } = adapter(
      deepseekVirtualFixture(),
      "https://chat.deepseek.com/a/chat/s/synthetic-window",
    );
    const first = engine.inspect().snapshot!;
    document.querySelector('[data-virtual-list-item-key="10"]')!.remove();
    document.querySelector("[data-stream]")!.textContent =
      "updated while only assistant is mounted";
    const next = engine.inspect().snapshot!;
    expect(next.id).toBe(first.id);
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]?.role).toBe("assistant");
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.capture(first, true);
    await r.capture(next);
    expect((await r.get(first.id))?.messages).toHaveLength(2);
    expect((await r.get(first.id))?.messages[1]?.text).toContain(
      "updated while only assistant is mounted",
    );
    await r.close();
  });
});

it("does not report a content-free thinking placeholder as a saved conversation", async () => {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  const empty = snap();
  empty.messages[0]!.text = "   ";
  expect(await r.capture(empty, true, true)).toBe(false);
  expect(await r.list()).toEqual([]);
  expect(await r.genericCount()).toBe(0);
  await r.close();
});

it("a failed manual restart leaves the deletion marker and keeps automatic writing disabled", async () => {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  await r.capture(snap(), true);
  await r.delete(snap().id);
  const original = IDBObjectStore.prototype.put;
  const write = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "sessions")
        throw new DOMException("synthetic", "QuotaExceededError");
      return original.apply(this, args);
    });
  try {
    await expect(r.capture(snap(), true, true)).rejects.toThrow(
      "storage-write-failed",
    );
  } finally {
    write.mockRestore();
  }
  expect((await r.get(snap().id))?.deleted).toBe(true);
  expect(await r.genericAllowed(snap().id)).toBe(false);
  expect(await r.capture(snap())).toBe(false);
  await r.close();
});
