import {
  ChatGPTAdapter,
  temporaryMode,
  visible,
  plainText,
} from "./chatgpt-adapter";
import { platformFromUrl, type PlatformId } from "./platforms";
import type { Message, PlatformAdapter, Role, Snapshot } from "./model";
export interface CaptureAdapter extends PlatformAdapter {
  mode(): boolean | null;
}
const terms: Record<Exclude<PlatformId, "chatgpt">, RegExp> = {
  claude: /incognito|隐身|无痕/i,
  grok: /private chat|private mode|私密聊天|私人聊天/i,
  gemini: /temporary chat|temp.chat|临时聊天|临时对话/i,
};
export function privateMode(
  id: Exclude<PlatformId, "chatgpt">,
  doc: Document,
  url: URL,
): boolean | null {
  const pattern = terms[id];
  const controls = [
    ...doc.querySelectorAll<HTMLElement>(
      'button,[role="switch"],[role="checkbox"]',
    ),
  ].filter(
    (el) =>
      visible(el) &&
      !el.closest('[role="menu"],[role="dialog"],form') &&
      pattern.test(
        [
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.dataset.testid,
          el.getAttribute("data-test-id"),
        ].join(" "),
      ),
  );
  for (const el of controls) {
    if (
      el.getAttribute("aria-pressed") === "false" ||
      el.getAttribute("aria-checked") === "false" ||
      ["off", "unchecked"].includes(el.dataset.state ?? "")
    )
      return false;
  }
  for (const el of controls) {
    if (
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      ["on", "checked"].includes(el.dataset.state ?? "") ||
      /^(turn off|disable|exit|关闭|退出)/i.test(
        el.getAttribute("aria-label") ?? "",
      )
    )
      return true;
  }
  const indicators =
    id === "claude"
      ? '[data-testid="incognito-indicator"],[data-testid="incognito-chat-label"],[data-is-incognito="true"]'
      : id === "grok"
        ? '[data-testid="private-chat-indicator"],[data-private-chat="true"]'
        : 'temporary-chat-header,.temporary-chat-header,[is-temporary-chat="true"],[data-is-temporary-chat="true"]';
  if ([...doc.querySelectorAll<HTMLElement>(indicators)].some(visible))
    return true;
  if (id === "grok" && url.hash === "#private") return true;
  const labels =
    /^(Incognito(?: chat| mode)?|Private chat|Temporary chat|隐身聊天|无痕聊天|私密聊天|私人聊天|临时聊天|临时对话)$/i;
  for (const el of doc.querySelectorAll<HTMLElement>(
    'header span,header h1,header div,[data-testid="chat-header"] span',
  )) {
    if (
      visible(el) &&
      !el.closest('button,a,[role="button"],[role="menu"],form') &&
      labels.test(el.textContent?.trim() ?? "") &&
      pattern.test(el.textContent ?? "")
    )
      return true;
  }
  return null;
}
interface NodeMessage {
  el: HTMLElement;
  role: Role;
  key: string;
}
function scoped(el: HTMLElement) {
  return (
    Boolean(
      el.closest(
        'main,[role="main"],#chat-history,infinite-scroller.chat-history',
      ),
    ) &&
    !el.closest('[role="presentation"],form,[contenteditable="true"],aside,nav')
  );
}
function nativeKey(el: HTMLElement) {
  return (
    el.closest<HTMLElement>("[data-message-id]")?.dataset.messageId ??
    el.querySelector<HTMLElement>("[data-message-id]")?.dataset.messageId
  );
}
function cleanText(el: HTMLElement) {
  const copy = el.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      '.cdk-visually-hidden,.sr-only,[data-testid="message-actions"],message-actions,prompt-copy-button,prompt-edit-button,regenerate-button,copy-button,copy-table-button,thinking-overlay,.thinking-container,.response-footer',
    )
    .forEach((n) => n.remove());
  return plainText(copy);
}
class OtherAdapter implements CaptureAdapter {
  private anchor = "";
  private known = new Set<string>();
  constructor(
    readonly source: Exclude<PlatformId, "chatgpt">,
    private doc: Document,
    private location: () => URL,
  ) {}
  mode() {
    return privateMode(this.source, this.doc, this.location());
  }
  read(): Snapshot | null {
    const url = this.location();
    if (
      platformFromUrl(url)?.id !== this.source ||
      /\/(share|public|imagine|files|project)\//.test(url.pathname)
    )
      return null;
    const temporary = this.mode();
    if (temporary !== true)
      return { id: "unknown", source: this.source, temporary, messages: [] };
    const nodes: NodeMessage[] = [];
    let session = "";
    if (this.source === "claude") {
      const match = url.pathname.match(/^\/chat\/([a-zA-Z0-9_-]+)\/?$/);
      session = match?.[1] ?? "";
      const candidates = [
        ...this.doc.querySelectorAll<HTMLElement>(
          '[data-testid="transcript-row"],[data-testid="user-message"],[data-testid="assistant-message"],[data-message-author-role]',
        ),
      ].filter((el) => scoped(el) && visible(el));
      for (const el of candidates) {
        if (
          candidates.some(
            (parent) =>
              parent !== el &&
              parent.contains(el) &&
              parent.dataset.testid === "transcript-row",
          )
        )
          continue;
        const row = el.closest<HTMLElement>(
          '[data-testid="transcript-row"],[data-index][data-rs-index]',
        );
        const roleValue =
          row?.dataset.perfRow ??
          el.dataset.messageAuthorRole ??
          (el.dataset.testid === "user-message"
            ? "user"
            : el.dataset.testid === "assistant-message"
              ? "assistant"
              : "");
        const role =
          roleValue === "human" || roleValue === "user"
            ? "user"
            : roleValue === "assistant"
              ? "assistant"
              : null;
        if (!role) continue;
        const body = el.matches('[data-testid="transcript-row"]')
          ? el.querySelector<HTMLElement>(
              role === "user"
                ? '[data-testid="user-message"]'
                : '[data-testid="assistant-message"]',
            )
          : el;
        if (!body) continue;
        const native = nativeKey(body);
        // A row index is stable only within an identified conversation.
        if (!session && !native) return null;
        const key =
          native ??
          (row?.dataset.index !== undefined && /^\d+$/.test(row.dataset.index)
            ? `row:${row.dataset.index}`
            : undefined);
        if (!key) return null;
        nodes.push({
          el: body.querySelector<HTMLElement>(".prose") ?? body,
          role,
          key,
        });
      }
    } else if (this.source === "gemini") {
      session =
        url.pathname.match(/\/(?:app|gem\/[^/]+)\/([a-zA-Z0-9_-]+)\/?$/)?.[1] ??
        "";
      for (const el of this.doc.querySelectorAll<HTMLElement>(
        "user-query,model-response",
      )) {
        if (!scoped(el) || !visible(el)) continue;
        const role =
          el.tagName.toLowerCase() === "user-query" ? "user" : "assistant";
        const turn = el.closest<HTMLElement>(".conversation-container[id]");
        const key = turn?.id ?? nativeKey(el);
        if (!key) return null;
        const body =
          el.querySelector<HTMLElement>(
            role === "user"
              ? ".query-text"
              : '[class~="model-response-text"],.markdown-main-panel,message-content',
          ) ?? el;
        nodes.push({ el: body, role, key });
      }
    } else {
      session =
        url.pathname.match(/^\/c\/(?:chat\/)?([a-zA-Z0-9_-]+)\/?$/)?.[1] ??
        url.pathname.match(/^\/chat\/([a-zA-Z0-9_-]+)\/?$/)?.[1] ??
        "";
      for (const el of this.doc.querySelectorAll<HTMLElement>(
        ".message-bubble,[data-message-author-role]",
      )) {
        if (!scoped(el) || !visible(el)) continue;
        const root = el.closest<HTMLElement>('[id^="response-"]');
        const explicit = el.dataset.messageAuthorRole ?? el.dataset.role;
        const role =
          explicit === "user" || explicit === "assistant"
            ? explicit
            : el.classList.contains("user") ||
                root?.classList.contains("items-end")
              ? "user"
              : el.classList.contains("assistant") ||
                  root?.classList.contains("items-start")
                ? "assistant"
                : null;
        if (!role) continue;
        const key = nativeKey(el) ?? root?.id;
        if (!key) return null;
        nodes.push({
          el: el.querySelector<HTMLElement>(".response-content-markdown") ?? el,
          role,
          key,
        });
      }
    }
    if (!nodes.length) {
      this.anchor = "";
      this.known.clear();
      return null;
    }
    if (!nodes.some((n) => n.role === "user")) return null;
    // Temporary views may keep a root URL. Anchor to an observed native turn, retaining
    // it while snapshots overlap; non-overlapping windows split rather than mix chats.
    if (!session) {
      const keys = nodes.map((n) => `${n.role}:${n.key}`);
      if (!this.anchor || !keys.some((key) => this.known.has(key))) {
        this.anchor = nodes.find((n) => n.role === "user")!.key;
        this.known.clear();
      }
      keys.forEach((key) => this.known.add(key));
      session = this.anchor;
    }
    if (!session || session.length > 300) return null;
    const seen = new Set<string>();
    const now = Date.now();
    const messages: Message[] = [];
    for (const n of nodes) {
      const key = `${n.role}:${n.key}`;
      if (seen.has(key)) return null;
      seen.add(key);
      messages.push({
        id: key,
        role: n.role,
        text: cleanText(n.el),
        order: messages.length,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      id: `thread:${session}`,
      source: this.source,
      temporary: true,
      messages,
    };
  }
}
export function createPlatformAdapter(
  doc: Document,
  location: () => URL,
): CaptureAdapter {
  const provider = platformFromUrl(location());
  if (!provider) throw new Error("unsupported-platform");
  if (provider.id === "chatgpt") {
    const adapter = new ChatGPTAdapter(doc, location);
    return {
      source: "chatgpt",
      read: () => adapter.read(),
      mode: () => temporaryMode(doc, location()),
    };
  }
  return new OtherAdapter(provider.id, doc, location);
}
