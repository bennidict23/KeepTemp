import { messageText, temporaryMode, visible } from "./adapters/chatgpt";

export type ContinuationResult = { ok: true } | { ok: false; error: string };

// Uses the same mode evidence as capture. An explicit off control overrides URL hints.
export function continuationPageState(doc: Document, url: URL) {
  const nodes = [
    ...doc.querySelectorAll<HTMLElement>(
      '#prompt-textarea[contenteditable="true"],textarea#prompt-textarea',
    ),
  ].filter(visible);
  const node = nodes.length === 1 ? nodes[0] : undefined;
  return {
    mode: temporaryMode(doc, url),
    draft: Boolean(
      node &&
      (node instanceof HTMLTextAreaElement
        ? node.value
        : (node.innerText ?? node.textContent)
      )?.trim(),
    ),
    occupied: [
      ...doc.querySelectorAll<HTMLElement>(
        'main [data-message-author-role],main [data-content-search-unit-key$=":user"],main [data-content-search-unit-key$=":assistant"],main [data-chatgpt-search-unit-key$=":user"],main [data-chatgpt-search-unit-key$=":assistant"]',
      ),
    ].some(
      (el) =>
        visible(el) &&
        !el.closest('form,[contenteditable="true"],[role="presentation"]'),
    ),
    streaming: [
      ...doc.querySelectorAll<HTMLElement>(
        '[data-testid="stop-button"],[data-testid="stop-generating-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]',
      ),
    ].some(visible),
  };
}
export async function submitContinuation(
  doc: Document,
  getUrl: () => URL,
  text: string,
  claim: (step: "fill" | "send") => Promise<boolean>,
  signal: AbortSignal,
  timeout = 1500,
): Promise<ContinuationResult> {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
  const deadline = Date.now() + timeout;
  const blocked = () =>
    [
      ...doc.querySelectorAll<HTMLElement>(
        '[role="dialog"],[role="alertdialog"],dialog[open]',
      ),
    ].some(visible);
  const fresh = () => {
    const url = getUrl();
    return url.origin === "https://chatgpt.com" && url.pathname === "/";
  };
  const privateMode = () => {
    const url = getUrl();
    return temporaryMode(doc, url) === true;
  };
  const users = () =>
    [
      ...doc.querySelectorAll<HTMLElement>(
        'main [data-message-author-role="user"],main [data-content-search-unit-key$=":user"],main [data-chatgpt-search-unit-key$=":user"]',
      ),
    ].filter(
      (node) =>
        visible(node) &&
        !node.closest('form,[contenteditable="true"],[role="presentation"]'),
    );
  const editor = () => {
    const nodes = [
      ...doc.querySelectorAll<HTMLElement>(
        '#prompt-textarea[contenteditable="true"],textarea#prompt-textarea',
      ),
    ].filter(visible);
    return nodes.length === 1 ? nodes[0] : undefined;
  };
  const occupied = () =>
    [
      ...doc.querySelectorAll<HTMLElement>(
        'main [data-message-author-role],main [data-content-search-unit-key$=":user"],main [data-content-search-unit-key$=":assistant"],main [data-chatgpt-search-unit-key$=":user"],main [data-chatgpt-search-unit-key$=":assistant"]',
      ),
    ].some(
      (node) =>
        visible(node) &&
        !node.closest('form,[contenteditable="true"],[role="presentation"]'),
    );
  const value = (node: HTMLElement) =>
    node instanceof HTMLTextAreaElement
      ? node.value
      : (node.innerText ?? node.textContent ?? "");
  const normalized = (s: string) => s.replace(/\r\n/g, "\n").trim();
  const input = (node: HTMLElement, data: string) => {
    if (node instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(node, data);
    } else {
      // Use the browser's editing path. Escaping the text before adding explicit
      // line breaks avoids insertText's extra blank lines in rich editors.
      node.focus();
      const selection = doc.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(node);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const escaped = doc.createElement("div");
      escaped.textContent = data;
      if (
        !doc.execCommand?.(
          "insertHTML",
          false,
          escaped.innerHTML.replace(/\r?\n/g, "<br>"),
        )
      )
        node.textContent = data;
    }
    node.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data }),
    );
  };
  let filled: HTMLElement | undefined;
  let expected = "";
  const cleanup = () => {
    if (
      filled?.isConnected &&
      normalized(value(filled)) === normalized(expected)
    )
      input(filled, "");
  };
  let clicked = false;
  try {
    while (!signal.aborted && Date.now() < deadline) {
      if (blocked()) return { ok: false, error: "handoff-needs-action" };
      if (!fresh() || occupied())
        return { ok: false, error: "handoff-page-changed" };
      const node = editor();
      if (node && !privateMode())
        return { ok: false, error: "handoff-mode-unconfirmed" };
      if (node && normalized(value(node)))
        return { ok: false, error: "handoff-draft-exists" };
      if (
        privateMode() &&
        node &&
        !node.matches(
          '[disabled],[readonly],[aria-disabled="true"],[aria-readonly="true"]',
        )
      ) {
        filled = node;
        if (!(await claim("fill")))
          return { ok: false, error: "handoff-cancelled" };
        // Claim happens once, before any paste. A lost response never triggers a retry.
        if (
          signal.aborted ||
          blocked() ||
          !fresh() ||
          !privateMode() ||
          occupied() ||
          normalized(value(node))
        )
          return { ok: false, error: "handoff-page-changed" };
        expected = text;
        input(node, text);
        break;
      }
      await delay();
    }
    if (!filled)
      return {
        ok: false,
        error: signal.aborted
          ? "handoff-cancelled"
          : "handoff-mode-unconfirmed",
      };
    while (!signal.aborted && Date.now() < deadline) {
      if (blocked()) {
        cleanup();
        return { ok: false, error: "handoff-needs-action" };
      }
      if (
        !fresh() ||
        !privateMode() ||
        occupied() ||
        editor() !== filled ||
        normalized(value(filled)) !== normalized(text)
      ) {
        cleanup();
        return { ok: false, error: "handoff-page-changed" };
      }
      const form = filled.closest("form") ?? filled.closest("main");
      const buttons = [
        ...(form?.querySelectorAll<HTMLButtonElement>(
          'button[data-testid="send-button"],button[data-testid="composer-send-button"],button[aria-label="Send prompt"],button[aria-label="发送提示"],button[aria-label="发送消息"]',
        ) ?? []),
      ].filter(visible);
      if (
        buttons.length === 1 &&
        !buttons[0]!.disabled &&
        buttons[0]!.getAttribute("aria-disabled") !== "true"
      ) {
        // Revalidate local consent and the source record immediately before sending.
        if (!(await claim("send"))) {
          cleanup();
          return { ok: false, error: "handoff-cancelled" };
        }
        if (
          signal.aborted ||
          blocked() ||
          !fresh() ||
          !privateMode() ||
          occupied() ||
          editor() !== filled ||
          normalized(value(filled)) !== normalized(text) ||
          !buttons[0]!.isConnected ||
          buttons[0]!.disabled ||
          buttons[0]!.getAttribute("aria-disabled") === "true"
        ) {
          cleanup();
          return { ok: false, error: "handoff-page-changed" };
        }
        buttons[0]!.click();
        clicked = true;
        break;
      }
      await delay();
    }
    if (!clicked) {
      cleanup();
      return {
        ok: false,
        error: signal.aborted
          ? "handoff-cancelled"
          : "handoff-editor-unavailable",
      };
    }
    while (!signal.aborted && Date.now() < deadline) {
      if (
        users().some(
          (node) => normalized(messageText(node)) === normalized(text),
        )
      )
        return { ok: true };
      await delay();
    }
    return { ok: false, error: "handoff-send-unconfirmed" };
  } catch {
    if (!clicked) cleanup();
    return {
      ok: false,
      error: clicked
        ? "handoff-send-unconfirmed"
        : "handoff-editor-unavailable",
    };
  }
}
