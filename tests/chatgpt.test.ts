import { describe, it, expect } from "vitest";
import { ChatGPTAdapter, temporaryMode } from "../src/chatgpt-adapter";
import { validSnapshot, scopedChatId } from "../src/bridge";
import { StorageRepository } from "../src/storage";
function fixture() {
  document.body.innerHTML =
    '<header><button data-testid="temporary-chat-button" aria-pressed="true">Temporary</button></header><main><article data-testid="conversation-turn-0"><div data-message-author-role="user" data-message-id="user-uuid"><div class="whitespace-pre-wrap">合成问题</div></div></article><article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="assistant-uuid"><div class="markdown"><p>第一段</p><p>第二段</p><button>Copy</button></div></div></article></main>';
  return new ChatGPTAdapter(document, () => new URL("https://chatgpt.com/"));
}
describe("ChatGPT visible-DOM adapter (synthetic fixtures only)", () => {
  it("captures roles and readable paragraphs without action buttons", () => {
    const s = fixture().read()!;
    expect(s.source).toBe("chatgpt");
    expect(s.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(s.messages[1]?.text).toBe("第一段\n第二段");
    expect(validSnapshot(s)).toBe(true);
  });
  it("keeps one assistant during streaming even if native id arrives later", () => {
    const adapter = fixture();
    const assistant = document.querySelector<HTMLElement>(
      '[data-message-author-role="assistant"]',
    )!;
    delete assistant.dataset.messageId;
    const first = adapter.read()!;
    assistant.dataset.messageId = "new-native-id";
    assistant.querySelector("p")!.textContent = "stream complete";
    expect(adapter.read()?.messages[1]?.id).toBe(first.messages[1]?.id);
  });
  it("keeps root-to-c navigation and reload identity, separates new conversations", () => {
    fixture();
    let path = "/";
    const a = new ChatGPTAdapter(
      document,
      () => new URL("https://chatgpt.com" + path),
    );
    const key = a.read()?.id;
    path = "/c/new-server-id";
    expect(a.read()?.id).toBe(key);
    expect(
      new ChatGPTAdapter(
        document,
        () => new URL("https://chatgpt.com" + path),
      ).read()?.id,
    ).toBe(key);
    document.querySelector<HTMLElement>(
      '[data-message-author-role="user"]',
    )!.dataset.messageId = "different-user-uuid";
    expect(a.read()?.id).not.toBe(key);
    expect(scopedChatId(1, key!)).not.toBe(scopedChatId(2, key!));
  });
  it("never uses transcript text or enable-mode button as mode evidence", () => {
    fixture();
    document.querySelector("header")!.remove();
    document.querySelector("main")!.append("Temporary chat");
    expect(temporaryMode(document, new URL("https://chatgpt.com"))).toBe(null);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<header><button aria-label="Turn on temporary chat">Temporary</button></header>',
    );
    expect(temporaryMode(document, new URL("https://chatgpt.com"))).toBe(null);
  });
  it("accepts explicit temporary URL but lets explicit off override stale query", () => {
    fixture();
    document.querySelector("header")!.remove();
    expect(
      temporaryMode(
        document,
        new URL("https://chatgpt.com/?temporary-chat=true"),
      ),
    ).toBe(true);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<button data-testid="temporary-chat-button" aria-pressed="false">Temporary</button>',
    );
    expect(
      temporaryMode(
        document,
        new URL("https://chatgpt.com/?temporary-chat=true"),
      ),
    ).toBe(false);
  });
  it("rejects hidden indicators, missing first-message identity and foreign/share URLs", () => {
    const a = fixture();
    document.querySelector("header")!.hidden = true;
    expect(a.read()?.temporary).toBe(null);
    fixture();
    document
      .querySelector('[data-message-author-role="user"]')!
      .removeAttribute("data-message-id");
    expect(a.read()).toBe(null);
    expect(
      new ChatGPTAdapter(document, () => new URL("https://example.org")).read(),
    ).toBe(null);
    expect(
      new ChatGPTAdapter(
        document,
        () => new URL("https://chatgpt.com/share/test"),
      ).read(),
    ).toBe(null);
  });
  it("does not capture a hidden branch or an ambiguous header activation button", () => {
    const a = fixture();
    document.querySelector("header")!.innerHTML = "<button>Temporary</button>";
    expect(a.read()?.temporary).toBe(null);
    fixture();
    document.querySelector("article")!.style.display = "none";
    expect(a.read()).toBe(null);
  });
  it("rejects duplicate message ids and malformed bridge payloads", () => {
    const s = fixture().read()!;
    expect(
      validSnapshot({ ...s, messages: [s.messages[0], s.messages[0]] }),
    ).toBe(false);
    expect(validSnapshot({ ...s, temporary: false })).toBe(false);
    expect(
      validSnapshot({ ...s, messages: [{ ...s.messages[0], role: "system" }] }),
    ).toBe(false);
  });
  it("requires new explicit capture consent even when manual saving was authorized", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    const s = fixture().read()!;
    expect(await r.capture(s)).toBe(false);
    await r.setAutoCapture(true);
    expect(await r.capture(s)).toBe(true);
    expect((await r.get(s.id))?.source).toBe("chatgpt");
    await r.pause(s.id, true);
    expect(await r.capture(s)).toBe(false);
    await r.pause(s.id, false);
    expect(await r.capture(s)).toBe(true);
    await r.setAutoCapture(false);
    expect(await r.capture(s)).toBe(false);
    await r.reset();
    expect(await r.autoCapture()).toBe(false);
  });
});

describe("structure compatibility and privacy-safe diagnostics", () => {
  it("supports role=main and native message ids placed on ancestors", () => {
    document.body.innerHTML =
      '<div role="main"><section data-message-id="parent-user-uuid"><div data-message-author-role="user">private synthetic question</div></section><section data-message-id="parent-answer-uuid"><div data-message-author-role="assistant">private synthetic answer</div></section></div>';
    const a = new ChatGPTAdapter(
      document,
      () => new URL("https://chatgpt.com/?temporary-chat=true"),
    );
    expect(a.read()?.id).toBe("thread:parent-user-uuid");
    expect(a.read()?.messages.map((m) => m.text)).toEqual([
      "private synthetic question",
      "private synthetic answer",
    ]);
    expect(a.diagnose().reason).toBe("ready");
  });
  it("supports native ids nested inside role wrappers and div turn containers", () => {
    document.body.innerHTML =
      '<main><div data-testid="conversation-turn-0"><div data-message-author-role="user"><div data-message-id="nested-user-uuid">question</div></div></div><div data-testid="conversation-turn-1"><div data-message-author-role="assistant"><div data-message-id="nested-answer-uuid">answer</div></div></div></main>';
    const a = new ChatGPTAdapter(
      document,
      () => new URL("https://chatgpt.com/?temporary-chat=true"),
    );
    expect(a.read()?.id).toBe("thread:nested-user-uuid");
    expect(a.read()?.messages).toHaveLength(2);
  });
  it("reports precise structural failures without content, ids or full URLs", () => {
    fixture();
    let url =
      "https://chatgpt.com/c/private-path?temporary-chat=true&private=secret";
    const a = new ChatGPTAdapter(document, () => new URL(url));
    document.querySelector("header")!.remove();
    document
      .querySelector('[data-message-author-role="user"]')!
      .removeAttribute("data-message-id");
    expect(a.diagnose().reason).toBe("session-id-missing");
    const report = JSON.stringify(a.diagnose());
    for (const secret of [
      "private-path",
      "secret",
      "合成问题",
      "第一段",
      "user-uuid",
      "assistant-uuid",
    ])
      expect(report).not.toContain(secret);
    document.querySelector("main")!.innerHTML = "synthetic raw content";
    expect(a.diagnose().reason).toBe("message-markers-missing");
    url = "https://chatgpt.com/";
    expect(a.diagnose().reason).toBe("mode-unknown");
  });
});

function modernFixture() {
  document.body.innerHTML = `<main><div role="region" data-app-action-timeline-scroll><div data-chatgpt-conversation-selection-target="synthetic-conversation" data-thread-find-target="conversation"><div data-turn-key="native-user-1"><div data-content-search-turn-key="fallback-turn-0"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="native-user-1"><div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble="true">new-layout question</div></div></div><div data-chatgpt-search-unit-key="fallback-turn-0:0:assistant" data-chatgpt-search-message-ids='["native-answer-1","native-answer-1"]'><div data-content-search-unit-key="fallback-turn-0:0:assistant"><div data-markdown-text-style="assistant-message"><p>new-layout answer</p></div><button>Copy</button></div></div></div></div></div></div><div role="presentation"><div data-content-search-unit-key="hidden:0:user" data-message-id="hidden-user">hidden text</div></div></main>`;
  return new ChatGPTAdapter(
    document,
    () => new URL("https://chatgpt.com/?temporary-chat=true"),
  );
}
describe("ChatGPT app-shell rollout without legacy attributes", () => {
  it("captures user and assistant once using semantic search units and native turn keys", () => {
    const a = modernFixture();
    expect(
      document.querySelectorAll(
        "[data-message-author-role],[data-turn-id],article",
      ).length,
    ).toBe(0);
    const s = a.read()!;
    expect(s.id).toBe("thread:conversation:synthetic-conversation");
    expect(s.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "new-layout question"],
      ["assistant", "new-layout answer"],
    ]);
    expect(a.diagnose()).toMatchObject({
      version: "0.2.2",
      reason: "ready",
      roleNodes: 0,
      userNodes: 1,
      assistantNodes: 1,
      activeTimelines: 1,
    });
  });
  it("retains message identity when search-unit indices drift or native answer ids arrive", () => {
    const a = modernFixture();
    const first = a.read()!;
    document.querySelector<HTMLElement>(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    )!.dataset.chatgptSearchMessageIds = "different-final-id";
    document.querySelector<HTMLElement>(
      "[data-content-search-turn-key]",
    )!.dataset.contentSearchTurnKey = "fallback-turn-99";
    expect(a.read()?.messages.map((m) => m.id)).toEqual(
      first.messages.map((m) => m.id),
    );
  });
  it("retains conversation identity when first visible turn unmounts", () => {
    const a = modernFixture();
    const first = a.read()!;
    const turn = document.querySelector<HTMLElement>("[data-turn-key]")!;
    turn.dataset.turnKey = "native-user-2";
    turn.querySelector<HTMLElement>(
      '[data-chatgpt-search-unit-key$=":user"]',
    )!.dataset.chatgptSearchMessageIds = "native-user-2";
    expect(a.read()?.id).toBe(first.id);
    expect(a.read()?.messages[0]?.id).not.toBe(first.messages[0]?.id);
    document.querySelector<HTMLElement>(
      "[data-chatgpt-conversation-selection-target]",
    )!.dataset.chatgptConversationSelectionTarget = "another-conversation";
    expect(a.read()?.id).not.toBe(first.id);
  });
  it("never treats unkeyed alternating divs as messages", () => {
    document.body.innerHTML =
      "<main><div>user question</div><div>assistant answer</div></main>";
    const a = new ChatGPTAdapter(
      document,
      () => new URL("https://chatgpt.com/?temporary-chat=true"),
    );
    expect(a.read()).toBe(null);
    expect(a.diagnose().reason).toBe("message-markers-missing");
  });
  it("merges older remounted turns before known anchors without dropping virtualized history", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    await r.authorize();
    await r.setAutoCapture(true);
    const a = modernFixture();
    const old = a.read()!;
    const latest = {
      ...old,
      messages: old.messages.map((m) => ({
        ...m,
        id: m.id + "-later",
        text: m.text + " later",
        updatedAt: m.updatedAt + 10,
      })),
    };
    await r.capture(latest);
    await r.capture({
      ...old,
      messages: [...old.messages, ...latest.messages].map((m, order) => ({
        ...m,
        order,
      })),
    });
    expect((await r.get(old.id))?.messages.map((m) => m.id)).toEqual(
      [...old.messages, ...latest.messages].map((m) => m.id),
    );
    await r.capture(latest);
    expect((await r.get(old.id))?.messages).toHaveLength(4);
  });
});
