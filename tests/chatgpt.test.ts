import { describe, it, expect } from "vitest";
import { ChatGPTAdapter, temporaryMode } from "../src/adapters/chatgpt";
import { validSnapshot, scopedChatId } from "../src/model";
import { shell, turn } from "./fixtures";
function adapter(html = shell()) {
  document.documentElement.innerHTML = html;
  return new ChatGPTAdapter(
    document,
    () => new URL("https://chatgpt.com/?temporary-chat=true"),
  );
}
describe("visible ChatGPT DOM", () => {
  it("captures the app-shell without legacy markers, excluding controls and presentation copies", () => {
    const s = adapter().read()!;
    expect(s.id).toBe("thread:conversation:synthetic-conversation");
    expect(s.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "把临时对话留在手中"],
      ["assistant", "从一个小而可靠的本地工具开始。"],
    ]);
    expect(validSnapshot(s)).toBe(true);
  });
  it("keeps identities when search indices or final assistant native ids change", () => {
    const a = adapter();
    const first = a.read()!;
    document.querySelector<HTMLElement>(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    )!.dataset.chatgptSearchMessageIds = "new-answer";
    expect(a.read()?.messages.map((m) => m.id)).toEqual(
      first.messages.map((m) => m.id),
    );
  });
  it("pins the conversation across virtualized first-turn changes, separates a new conversation", () => {
    const a = adapter();
    const first = a.read()!;
    document.querySelector<HTMLElement>("[data-turn-key]")!.dataset.turnKey =
      "other-turn";
    expect(a.read()?.id).toBe(first.id);
    expect(a.read()?.messages[0]?.id).not.toBe(first.messages[0]?.id);
    document.querySelector<HTMLElement>(
      "[data-chatgpt-conversation-selection-target]",
    )!.dataset.chatgptConversationSelectionTarget = "another";
    expect(a.read()?.id).not.toBe(first.id);
  });
  it("supports legacy markup with native ids on ancestors and role=main", () => {
    const a = adapter(
      '<div role="main"><div data-message-id="u"><div data-message-author-role="user">question</div></div><div data-message-id="a"><div data-message-author-role="assistant">answer</div></div></div>',
    );
    expect(a.read()?.messages.map((m) => m.text)).toEqual([
      "question",
      "answer",
    ]);
  });
  it("retains a fallback session when earlier turns leave the visible window", () => {
    const a = adapter(
      shell(turn("first")).replace(
        'data-chatgpt-conversation-selection-target="synthetic-conversation"',
        "",
      ),
    );
    const first = a.read()!;
    document
      .querySelector("[data-turn-key]")!
      .insertAdjacentHTML("afterend", turn("second"));
    expect(a.read()?.messages).toHaveLength(4);
    document.querySelector("[data-turn-key]")!.remove();
    expect(a.read()?.id).toBe(first.id);
    document.querySelector('[data-chatgpt-search-unit-key$=":user"]')!.remove();
    const assistant = document.querySelector("[data-markdown-text-style]")!;
    assistant.textContent = "synthetic streaming update";
    expect(a.read()?.id).toBe(first.id);
    expect(a.read()?.messages[0]?.text).toBe("synthetic streaming update");
  });
  it("retains the same session while conversation markers disappear and return", () => {
    const a = adapter(shell(turn("first") + turn("second")));
    const first = a.read()!;
    const conversation = document.querySelector<HTMLElement>(
      "[data-chatgpt-conversation-selection-target]",
    )!;
    delete conversation.dataset.chatgptConversationSelectionTarget;
    document.querySelector("[data-turn-key]")!.remove();
    expect(a.read()?.id).toBe(first.id);
    const content = conversation.innerHTML;
    conversation.innerHTML = "";
    expect(a.read()).toBe(null);
    conversation.innerHTML = content;
    conversation.dataset.chatgptConversationSelectionTarget =
      "synthetic-conversation";
    expect(a.read()?.id).toBe(first.id);
  });
  it("learns a late conversation marker without creating another session", () => {
    const a = adapter(
      shell().replace(
        'data-chatgpt-conversation-selection-target="synthetic-conversation"',
        "",
      ),
    );
    const first = a.read()!;
    document.querySelector<HTMLElement>(
      "[data-thread-find-target]",
    )!.dataset.chatgptConversationSelectionTarget = "late-conversation";
    expect(a.read()?.id).toBe(first.id);
  });
  it("keeps disjoint windows inside an identified conversation", () => {
    const a = adapter();
    const first = a.read()!;
    document.querySelector("[data-thread-find-target]")!.innerHTML =
      turn("much-later");
    expect(a.read()?.id).toBe(first.id);
  });
  it("waits on an unidentifiable disjoint window instead of creating a duplicate", () => {
    const a = adapter(
      shell().replace(
        'data-chatgpt-conversation-selection-target="synthetic-conversation"',
        "",
      ),
    );
    const first = a.read()!;
    const content = document.querySelector("[data-thread-find-target]")!;
    const original = content.innerHTML;
    content.innerHTML = turn("unrelated-or-virtualized");
    expect(a.read()).toBe(null);
    content.innerHTML = original + content.innerHTML;
    expect(a.read()?.id).toBe(first.id);
  });
  it("uses route continuity but separates navigation to another conversation", () => {
    document.documentElement.innerHTML = shell().replace(
      'data-chatgpt-conversation-selection-target="synthetic-conversation"',
      "",
    );
    let url = new URL("https://chatgpt.com/c/first?temporary-chat=true");
    const a = new ChatGPTAdapter(document, () => url);
    const first = a.read()!;
    expect(a.read()?.id).toBe(first.id);
    document.querySelector("[data-thread-find-target]")!.innerHTML =
      turn("later");
    expect(a.read()?.id).toBe(first.id);
    url = new URL("https://chatgpt.com/c/second?temporary-chat=true");
    document.querySelector("[data-thread-find-target]")!.innerHTML =
      turn("new-chat");
    expect(a.read()?.id).not.toBe(first.id);
    url = new URL("https://chatgpt.com/?temporary-chat=true");
    document.querySelector("[data-thread-find-target]")!.innerHTML =
      turn("another-new-chat");
    expect(a.read()?.id).toBe("thread:another-new-chat");
  });
  it("does not guess roles from alternating prose", () => {
    expect(
      adapter("<main><div>user</div><div>assistant</div></main>").read(),
    ).toBe(null);
  });
  it("rejects hidden branches and ambiguous duplicate units", () => {
    const a = adapter(shell(turn() + turn()));
    expect(a.read()).toBe(null);
    adapter();
    document.querySelector<HTMLElement>("[role=region]")!.hidden = true;
    expect(
      new ChatGPTAdapter(
        document,
        () => new URL("https://chatgpt.com/?temporary-chat=true"),
      ).read(),
    ).toBe(null);
  });
  it("rejects shared or foreign pages", () => {
    adapter();
    expect(
      new ChatGPTAdapter(
        document,
        () => new URL("https://chatgpt.com/share/example"),
      ).read(),
    ).toBe(null);
    expect(
      new ChatGPTAdapter(document, () => new URL("https://example.org")).read(),
    ).toBe(null);
  });
  it("does not mistake transcript text or an activation button for temporary mode", () => {
    adapter(
      '<header><button aria-label="Turn on temporary chat">Temporary</button></header><main>Temporary chat</main>',
    );
    expect(temporaryMode(document, new URL("https://chatgpt.com"))).toBe(null);
  });
  it("explicit off overrides stale URL; explicit on works without query", () => {
    adapter(
      '<button data-testid="temporary-chat-button" aria-pressed="false">Temporary</button>',
    );
    expect(
      temporaryMode(
        document,
        new URL("https://chatgpt.com/?temporary-chat=true"),
      ),
    ).toBe(false);
    document.querySelector("button")!.setAttribute("aria-pressed", "true");
    expect(temporaryMode(document, new URL("https://chatgpt.com"))).toBe(true);
  });
  it("bounds bridge payloads and separates tabs", () => {
    const s = adapter().read()!;
    expect(
      validSnapshot({ ...s, messages: [s.messages[0], s.messages[0]] }),
    ).toBe(false);
    expect(
      validSnapshot({ ...s, messages: [{ ...s.messages[0], role: "system" }] }),
    ).toBe(false);
    expect(validSnapshot({ ...s, aliases: ["not-a-thread"] })).toBe(false);
    expect(
      validSnapshot({ ...s, aliases: ["thread:" + "x".repeat(600)] }),
    ).toBe(false);
    expect(
      validSnapshot({
        ...s,
        messages: [{ ...s.messages[0], text: "x".repeat(2000001) }],
      }),
    ).toBe(false);
    expect(scopedChatId(1, s.id)).not.toBe(scopedChatId(2, s.id));
  });
});
