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
