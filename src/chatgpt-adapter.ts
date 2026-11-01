import type { Message, PlatformAdapter, Snapshot } from "./model";

function visible(el: HTMLElement) {
  if (el.closest('[hidden],[aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
const modeSelector =
  '[data-testid="temporary-chat-button"],button[aria-label="Turn off temporary chat"],button[aria-label="关闭临时聊天"]';
export function temporaryMode(doc: Document, url: URL): boolean | null {
  const controls = [...doc.querySelectorAll<HTMLElement>(modeSelector)].filter(
    visible,
  );
  // Explicit off beats a stale URL. Text anywhere in the transcript is never mode evidence.
  for (const el of controls) {
    if (
      el.getAttribute("aria-pressed") === "false" ||
      el.getAttribute("aria-checked") === "false" ||
      el.dataset.state === "off"
    )
      return false;
  }
  for (const el of controls) {
    if (
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      el.dataset.state === "on" ||
      /^(Turn off temporary chat|关闭临时聊天)$/i.test(
        el.getAttribute("aria-label") ?? "",
      )
    )
      return true;
  }
  if (url.searchParams.get("temporary-chat") === "false") return false;
  if (url.searchParams.get("temporary-chat") === "true") return true;
  // The active-mode pill is only accepted in the page header, never in menus or message text.
  const headers = doc.querySelectorAll<HTMLElement>(
    'header [role="status"],#page-header [role="status"],header button[aria-current="true"],#page-header button[aria-current="true"]',
  );
  for (const el of headers) {
    if (
      visible(el) &&
      !el.closest('[role="menu"],[role="dialog"]') &&
      /^(Temporary(?: chat)?|临时聊天|临时对话|临时)$/i.test(
        el.innerText?.trim() ?? el.textContent?.trim() ?? "",
      )
    ) {
      // A labelled activation control is an invitation to enable mode, not evidence it is on.
      if (/turn on|enable|开启|启用/i.test(el.getAttribute("aria-label") ?? ""))
        continue;
      if (el.getAttribute("aria-pressed") === "false") continue;
      return true;
    }
  }
  return null;
}
const roleSelector =
  '[data-message-author-role],[data-content-search-unit-key$=":user"],[data-content-search-unit-key$=":assistant"],[data-chatgpt-search-unit-key$=":user"],[data-chatgpt-search-unit-key$=":assistant"]';
function roleOf(el: HTMLElement): "user" | "assistant" | null {
  const native = el.dataset.messageAuthorRole;
  if (native === "user" || native === "assistant") return native;
  const key =
    el.dataset.chatgptSearchUnitKey ?? el.dataset.contentSearchUnitKey ?? "";
  return key.endsWith(":user")
    ? "user"
    : key.endsWith(":assistant")
      ? "assistant"
      : null;
}
function candidateNodes(doc: Document) {
  const hasTimeline = Boolean(
    doc.querySelector('[data-app-action-timeline-scroll][role="region"]'),
  );
  const all = [...doc.querySelectorAll<HTMLElement>(roleSelector)].filter(
    (el) => {
      if (
        !el.closest('main,[role="main"]') ||
        el.closest('[role="presentation"],form,[contenteditable="true"]')
      )
        return false;
      return (
        !hasTimeline ||
        Boolean(el.closest('[data-app-action-timeline-scroll][role="region"]'))
      );
    },
  );
  // Search-index wrappers and their content wrappers can both carry the role.
  return all.filter(
    (el) =>
      !all.some(
        (parent) =>
          parent !== el && parent.contains(el) && roleOf(parent) === roleOf(el),
      ),
  );
}
function nativeMessageId(el: HTMLElement): string | undefined {
  const legacy =
    el.dataset.messageId ??
    el.closest<HTMLElement>("[data-message-id]")?.dataset.messageId ??
    el.querySelector<HTMLElement>("[data-message-id]")?.dataset.messageId;
  if (legacy) return legacy;
  const owner =
    el.closest<HTMLElement>("[data-chatgpt-search-message-ids]") ??
    el.querySelector<HTMLElement>("[data-chatgpt-search-message-ids]");
  const raw = owner?.dataset.chatgptSearchMessageIds;
  if (!raw) return;
  let values: unknown;
  try {
    values = raw.trim().startsWith("[") ? JSON.parse(raw) : raw.split(/[\s,]+/);
  } catch {
    return;
  }
  if (
    !Array.isArray(values) ||
    !values.every(
      (v) => typeof v === "string" && /^[a-zA-Z0-9_:.-]{1,250}$/.test(v),
    )
  )
    return;
  const ids = [...new Set(values as string[])];
  return ids.length === 1 ? ids[0] : undefined;
}
function turnKey(el: HTMLElement): string | undefined {
  return (
    el
      .closest<HTMLElement>("[data-turn-key],[data-turn-id]")
      ?.getAttribute("data-turn-key") ??
    el.closest<HTMLElement>("[data-turn-id]")?.dataset.turnId
  );
}
function stableId(el: HTMLElement): string | null {
  const turn = el.closest<HTMLElement>(
    '[data-turn-key],[data-turn-id],[data-testid^="conversation-turn-"]',
  );
  const id =
    turn?.dataset.turnKey ??
    turn?.dataset.turnId ??
    turn?.dataset.testid ??
    nativeMessageId(el);
  return id && id.length <= 250 ? id : null;
}
function sessionKey(first: HTMLElement) {
  const container = first.closest<HTMLElement>(
    '[data-chatgpt-conversation-selection-target][data-thread-find-target="conversation"]',
  );
  const conversation = container?.dataset.chatgptConversationSelectionTarget;
  if (conversation && /^[a-zA-Z0-9_-]{1,250}$/.test(conversation))
    return `conversation:${conversation}`;
  return nativeMessageId(first) ?? turnKey(first);
}
export function messageText(el: HTMLElement): string {
  const content =
    el.querySelector<HTMLElement>(
      '[data-user-message-bubble="true"],[data-markdown-text-style="assistant-message"],.markdown,.whitespace-pre-wrap,[data-message-content]',
    ) ?? el;
  const clone = content.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'button,nav,script,style,[hidden],[aria-hidden="true"],.sr-only',
    )
    .forEach((n) => n.remove());
  // innerText on the live node preserves paragraph/code line breaks. Clone is used to
  // exclude controls; block boundaries are made explicit before reading textContent.
  clone.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  clone
    .querySelectorAll("p,div,pre,li,h1,h2,h3,h4,blockquote,tr")
    .forEach((n) => n.append("\n"));
  return (clone.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
export class ChatGPTAdapter implements PlatformAdapter {
  readonly source = "chatgpt" as const;
  constructor(
    private doc: Document,
    private location: () => URL,
  ) {}
  read(): Snapshot | null {
    const url = this.location();
    if (
      url.origin !== "https://chatgpt.com" ||
      url.pathname.startsWith("/share/")
    )
      return null;
    const temporary = temporaryMode(this.doc, url);
    if (temporary !== true)
      return { id: "unknown", source: "chatgpt", temporary, messages: [] };
    const nodes = candidateNodes(this.doc).filter(visible);
    const now = Date.now();
    const messages: Message[] = [];
    const seen = new Set<string>();
    for (const el of nodes) {
      const role = roleOf(el);
      if (role !== "user" && role !== "assistant") continue;
      const key = stableId(el);
      // A turn testid is only used for message position inside a native-UUID-scoped session.
      if (!key) return null;
      const id = `${role}:${key}`;
      if (seen.has(id)) {
        // A second independent unit for the same role/turn is ambiguous; never silently drop it.
        return null;
      }
      seen.add(id);
      messages.push({
        id,
        role,
        text: messageText(el),
        order: messages.length,
        createdAt: now,
        updatedAt: now,
      });
    }
    const firstNode = nodes.find((el) => roleOf(el) === "user");
    const firstKey = firstNode ? sessionKey(firstNode) : undefined;
    if (!firstKey || firstKey.length > 250 || !messages.length) return null;
    // First user marker is retained when / becomes /c/... and across refreshes.
    return {
      id: `thread:${firstKey}`,
      source: "chatgpt",
      temporary: true,
      messages,
    };
  }
}
