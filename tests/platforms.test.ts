import { describe, it, expect } from "vitest";
import { createPlatformAdapter } from "../src/adapters/index";
import {
  PLATFORMS,
  platformFromUrl,
  historyPlatformFromUrl,
} from "../src/platforms";
import { validSnapshot, scopedChatId } from "../src/model";
import { StorageRepository } from "../src/storage";
import { context } from "../src/recovery";
import { otherProviders, providerFixture } from "./fixtures";

function setup(source: (typeof otherProviders)[number]) {
  const fixture = providerFixture(source);
  document.documentElement.innerHTML = fixture.html;
  let url = new URL(fixture.url);
  const adapter = createPlatformAdapter(document, () => url);
  return {
    adapter,
    navigate: (target: string) => {
      url = new URL(target, fixture.origin);
    },
  };
}
for (const source of otherProviders)
  describe(`${source} experimental visible capture`, () => {
    it("captures native roles, all paragraphs and stable identities without controls", () => {
      const { adapter } = setup(source);
      const s = adapter.read()!;
      expect(s).toMatchObject({
        id: "thread:synthetic",
        source,
        temporary: true,
      });
      expect(s.messages.map((m) => [m.role, m.text])).toEqual([
        ["user", "合成问题"],
        ["assistant", "合成回复\n保留第二段"],
      ]);
      expect(validSnapshot(s)).toBe(true);
      const ids = s.messages.map((m) => m.id);
      for (let i = 0; i < 50; i++) {
        document.querySelector("[data-stream]")!.textContent = `stream ${i}`;
        expect(adapter.read()?.messages.map((m) => m.id)).toEqual(ids);
      }
      expect(adapter.read()?.messages[1]?.text).toBe("stream 49\n保留第二段");
    });
    it("refuses ordinary/unknown mode, including activation controls and transcript mentions", () => {
      const { adapter } = setup(source);
      document.querySelector("header")!.remove();
      document
        .querySelector("main")!
        .insertAdjacentHTML(
          "beforeend",
          "<p>Temporary chat Incognito chat Private chat 临时聊天</p>",
        );
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<header><button aria-label="Turn on ${source === "claude" ? "Incognito chat" : source === "grok" ? "Private chat" : "Temporary chat"}">Enable</button></header>`,
      );
      expect(adapter.mode()).toBe(null);
      expect(adapter.read()?.temporary).not.toBe(true);
    });
    it("explicit inactive mode overrides passive header and URL", () => {
      const { adapter, navigate } = setup(source);
      navigate(providerFixture(source).path + "#private");
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<button aria-label="${source === "claude" ? "Incognito chat" : source === "grok" ? "Private chat" : "Temporary chat"}" aria-pressed="false">mode</button>`,
      );
      expect(adapter.mode()).toBe(false);
      expect(adapter.read()?.messages).toEqual([]);
    });
    it("separates SPA conversations, rejects shared pages and ambiguous native identities", () => {
      const { adapter, navigate } = setup(source);
      const first = adapter.read()!;
      navigate(providerFixture(source).path.replace("synthetic", "second"));
      expect(adapter.read()?.id).not.toBe(first.id);
      navigate("/share/synthetic");
      expect(adapter.read()).toBe(null);
      navigate(providerFixture(source).path);
      document
        .querySelector("main")!
        .insertAdjacentHTML(
          "beforeend",
          document.querySelector("main")!.innerHTML,
        );
      expect(adapter.read()).toBe(null);
    });
    it("fails closed when native identity is missing or the branch is hidden", () => {
      const { adapter } = setup(source);
      document
        .querySelectorAll("[data-index]")
        .forEach((el) => el.removeAttribute("data-index"));
      document
        .querySelectorAll("[id]")
        .forEach((el) => el.removeAttribute("id"));
      expect(adapter.read()).toBe(null);
      setup(source);
      document.querySelector("main")!.hidden = true;
      expect(adapter.read()).toBe(null);
    });
  });
describe("platform boundaries and permission migration", () => {
  it("accepts only exact origins and scopes equal session keys independently", () => {
    expect(PLATFORMS.map((p) => platformFromUrl(p.url)?.id)).toEqual(
      PLATFORMS.map((p) => p.id),
    );
    for (const url of [
      "https://claude.ai.example.org",
      "http://grok.com",
      "https://x.com/i/grok",
      "https://chatgpt.com@evil.example",
      "https://notgemini.google.com",
      "invalid",
    ])
      expect(platformFromUrl(url)).toBeUndefined();
    expect(
      new Set(PLATFORMS.map((p) => scopedChatId(1, "thread:same", p.id))).size,
    ).toBe(4);
    expect(scopedChatId(1, "thread:same")).toBe("chatgpt:1:thread:same");
  });
  it("upgrades existing ChatGPT consent without enabling another provider", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.setAutoCapture(true, "chatgpt");
    expect(await r.enabledPlatforms()).toEqual(["chatgpt"]);
    for (const source of otherProviders) {
      const { adapter } = setup(source);
      expect(await r.capture(adapter.read()!)).toBe(false);
    }
    const { adapter } = setup("claude");
    expect(await r.capture(adapter.read()!, true)).toBe(true);
    expect(await r.enabledPlatforms()).toEqual(["chatgpt", "claude"]);
    await r.setAutoCapture(false);
    expect(await r.enabledPlatforms()).toEqual([]);
    await r.setAutoCapture(true);
    expect(await r.enabledPlatforms()).toHaveLength(4);
    await r.reset();
    expect(await r.autoCapture()).toBe(false);
    await r.close();
  });
  it("root views require a true native anchor; reused row indices cannot mix incognito chats", () => {
    const { adapter, navigate } = setup("claude");
    navigate("/new");
    expect(adapter.read()).toBe(null);
    document
      .querySelector("[data-testid=user-message]")!
      .setAttribute("data-message-id", "native-user");
    document
      .querySelector("[data-testid=assistant-message]")!
      .setAttribute("data-message-id", "native-answer");
    const first = adapter.read()!;
    document
      .querySelector("[data-testid=user-message]")!
      .setAttribute("data-message-id", "next-user");
    document
      .querySelector("[data-testid=assistant-message]")!
      .setAttribute("data-message-id", "next-answer");
    expect(adapter.read()?.id).not.toBe(first.id);
  });
  it("keeps the complete continuation text identical regardless of source label", () => {
    const { adapter } = setup("claude");
    const s = {
      ...adapter.read()!,
      source: "claude" as const,
      title: "合成",
      createdAt: 1,
      updatedAt: 1,
    };
    const copied = context(s);
    for (const p of PLATFORMS) {
      expect(context({ ...s, source: p.id })).toBe(copied);
      expect(copied).not.toContain(p.name);
    }
  });
});

it("Grok recognizes a selected Private control, but never an unselected activation button", () => {
  const { adapter } = setup("grok");
  document.querySelector("header")!.innerHTML =
    '<button aria-label="Private" aria-pressed="true">Private</button>';
  expect(adapter.mode()).toBe(true);
  document
    .querySelector("header button")!
    .setAttribute("aria-pressed", "false");
  expect(adapter.mode()).toBe(false);
  document.querySelector("header button")!.removeAttribute("aria-pressed");
  expect(adapter.mode()).toBe(null);
});

it("limits embedded history to exact ChatGPT and Claude origins", () => {
  expect(historyPlatformFromUrl("https://chatgpt.com/c/synthetic")?.id).toBe(
    "chatgpt",
  );
  expect(historyPlatformFromUrl("https://claude.ai/chat/synthetic")?.id).toBe(
    "claude",
  );
  for (const url of [
    "https://grok.com/chat",
    "https://gemini.google.com/app",
    "https://claude.ai.example/chat",
    "https://chatgpt.com.example/",
    "http://claude.ai/",
    "invalid",
  ])
    expect(historyPlatformFromUrl(url)).toBeUndefined();
});
