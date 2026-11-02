import { beforeEach, expect, it, vi } from "vitest";
import { submitContinuation } from "../src/continuation";

const text =
  "合成历史\n\n[user]\n不要截断 <script>synthetic()</script>\n\n[assistant]\n完整回复";
let controller: AbortController;
const url = () => new URL("https://chatgpt.com/?temporary-chat=true");
function page(mode = true, kind = "textarea") {
  document.body.innerHTML = `<header><button data-testid="temporary-chat-button" aria-pressed="${mode}">Temporary</button></header><main><form>${kind === "textarea" ? '<textarea id="prompt-textarea"></textarea>' : '<div id="prompt-textarea" contenteditable="true"></div>'}<button type="button" data-testid="send-button">Send</button></form></main>`;
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="send-button"]',
  )!;
  const click = vi.fn(() => {
    const node = document.querySelector<HTMLElement>("#prompt-textarea")!;
    const message = document.createElement("div");
    message.dataset.messageAuthorRole = "user";
    message.textContent =
      node instanceof HTMLTextAreaElement ? node.value : node.textContent;
    document.querySelector("main")!.append(message);
  });
  button.addEventListener("click", click);
  return {
    button,
    click,
    editor: document.querySelector<HTMLElement>("#prompt-textarea")!,
  };
}
const claim = () => vi.fn(async (_step: "fill" | "send") => true);
beforeEach(() => {
  controller = new AbortController();
});
it.each(["textarea", "contenteditable"])(
  "sends the exact full context once through %s after both claims",
  async (kind) => {
    const { click } = page(true, kind),
      permission = claim();
    expect(
      await submitContinuation(
        document,
        url,
        text,
        permission,
        controller.signal,
        200,
      ),
    ).toEqual({ ok: true });
    expect(permission.mock.calls.map(([step]) => step)).toEqual([
      "fill",
      "send",
    ]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[data-message-author-role="user"]')!.textContent,
    ).toBe(text);
    expect(document.querySelector("script")).toBeNull();
  },
);
it.each(["url-only", "off"])(
  "never fills or sends on %s temporary evidence",
  async (mode) => {
    const { editor, click } = page(false),
      permission = claim();
    if (mode === "url-only") document.querySelector("header")!.remove();
    expect(
      await submitContinuation(
        document,
        url,
        text,
        permission,
        controller.signal,
        10,
      ),
    ).toMatchObject({ ok: false, error: "handoff-mode-unconfirmed" });
    expect((editor as HTMLTextAreaElement).value).toBe("");
    expect(click).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
  },
);
it("does not overwrite an existing user draft", async () => {
  const { editor, click } = page();
  (editor as HTMLTextAreaElement).value = "合成用户正在输入";
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-draft-exists" });
  expect((editor as HTMLTextAreaElement).value).toBe("合成用户正在输入");
  expect(click).not.toHaveBeenCalled();
});
it("stops when consent/source validation is revoked before send and clears only its own draft", async () => {
  const { editor, click } = page();
  const permission = vi.fn(async (step: "fill" | "send") => step === "fill");
  expect(
    await submitContinuation(
      document,
      url,
      text,
      permission,
      controller.signal,
    ),
  ).toMatchObject({ error: "handoff-cancelled" });
  expect(click).not.toHaveBeenCalled();
  expect((editor as HTMLTextAreaElement).value).toBe("");
});
it("refuses a mode change during input without sending", async () => {
  const { editor, click } = page();
  editor.addEventListener("input", () =>
    document
      .querySelector("header button")!
      .setAttribute("aria-pressed", "false"),
  );
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-page-changed" });
  expect(click).not.toHaveBeenCalled();
  expect((editor as HTMLTextAreaElement).value).toBe("");
});
it("preserves a user edit made while waiting for the send button", async () => {
  const { editor, button, click } = page();
  button.disabled = true;
  editor.addEventListener("input", () => {
    (editor as HTMLTextAreaElement).value = "用户的新草稿";
  });
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-page-changed" });
  expect((editor as HTMLTextAreaElement).value).toBe("用户的新草稿");
  expect(click).not.toHaveBeenCalled();
});
it("will not use an occupied or redirected conversation", async () => {
  const { click } = page();
  expect(
    await submitContinuation(
      document,
      () => new URL("https://chatgpt.com/c/existing"),
      text,
      claim(),
      controller.signal,
    ),
  ).toMatchObject({ error: "handoff-page-changed" });
  const node = document.createElement("div");
  node.dataset.messageAuthorRole = "assistant";
  document.querySelector("main")!.append(node);
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-page-changed" });
  expect(click).not.toHaveBeenCalled();
});
it("never retries a click whose acceptance could not be confirmed", async () => {
  const { button, click } = page();
  button.removeEventListener("click", click);
  const send = vi.fn();
  button.addEventListener("click", send);
  expect(
    await submitContinuation(
      document,
      url,
      text,
      claim(),
      controller.signal,
      10,
    ),
  ).toMatchObject({ error: "handoff-send-unconfirmed" });
  expect(send).toHaveBeenCalledTimes(1);
});
it("refuses cancellation and never guesses between multiple composers", async () => {
  const { click } = page();
  controller.abort();
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-cancelled" });
  controller = new AbortController();
  document
    .querySelector("form")!
    .insertAdjacentHTML(
      "afterbegin",
      '<textarea id="prompt-textarea"></textarea>',
    );
  expect(
    await submitContinuation(
      document,
      url,
      text,
      claim(),
      controller.signal,
      10,
    ),
  ).toMatchObject({ error: "handoff-mode-unconfirmed" });
  expect(click).not.toHaveBeenCalled();
});

it("accepts an unambiguous labelled send button without a test ID", async () => {
  const { button, click } = page();
  button.removeAttribute("data-testid");
  button.setAttribute("aria-label", "Send prompt");
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toEqual({ ok: true });
  expect(click).toHaveBeenCalledTimes(1);
});

it("does not paste or click through a platform dialog", async () => {
  const { click, editor } = page();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div role="dialog" aria-modal="true">合成平台选择提示</div>',
  );
  expect(
    await submitContinuation(document, url, text, claim(), controller.signal),
  ).toMatchObject({ error: "handoff-needs-action" });
  expect((editor as HTMLTextAreaElement).value).toBe("");
  expect(click).not.toHaveBeenCalled();
});
