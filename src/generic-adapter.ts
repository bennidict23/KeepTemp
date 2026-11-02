import { deepseekRoots, deepseekRole, deepseekText } from "./deepseek-dom";
import { createPlatformPreviewAdapter } from "./platform-adapter";
import { plainText, visible } from "./chatgpt-adapter";
import type { Message, Role, Snapshot } from "./model";

export type GenericReason =
  | "ready"
  | "no-content"
  | "region-missing"
  | "roles-unknown"
  | "identity-missing"
  | "ambiguous"
  | "unsupported-page";
export interface GenericInspection {
  reason: GenericReason;
  snapshot?: Snapshot;
  method: "semantic" | "deepseek-layout" | "platform-layout";
}
const roleSelector =
  "[data-message-author-role],[data-message-role],[data-author-role],[data-role]";
const excluded =
  'aside,nav,form,[contenteditable="true"],[role="presentation"],[role="dialog"],[role="menu"],blockquote,pre,code,#keeptemp-status';
function roleOf(el: HTMLElement): Role | null {
  const values = [
    el.dataset.messageAuthorRole,
    el.dataset.messageRole,
    el.dataset.authorRole,
    el.dataset.role,
  ]
    .filter(Boolean)
    .map((v) => v!.toLowerCase());
  const roles = values
    .map((v) =>
      /^(user|human)$/.test(v)
        ? "user"
        : /^(assistant|model|bot|ai)$/.test(v)
          ? "assistant"
          : null,
    )
    .filter(Boolean);
  return new Set(roles).size === 1 ? (roles[0] as Role) : null;
}
function identity(el: HTMLElement, root: HTMLElement) {
  for (
    let node: HTMLElement | null = el;
    node && root.contains(node);
    node = node.parentElement
  ) {
    const id =
      node.dataset.messageId ??
      node.dataset.msgId ??
      (/^(message|msg|response)[-_]/.test(node.id) ? node.id : undefined);
    if (id?.trim() && id.length <= 180) return id;
    if (node === root) break;
  }
  return null;
}
function bodyText(el: HTMLElement, deepseek: boolean, role: Role) {
  if (deepseek) return deepseekText(el, role);
  const body =
    el.querySelector<HTMLElement>(
      '[data-message-content],[data-testid="message-content"],.markdown',
    ) ?? el;
  const copy = body.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      '[data-message-actions],.ds-message-actions,[data-testid="message-actions"],.sr-only,.thinking-container,[data-thinking],.ds-think-content',
    )
    .forEach((n) => n.remove());
  return plainText(copy);
}
// This is deliberately stricter than a web clipper: no alternating-position roles,
// content hashes, random per-scan IDs, or viewport indices as message identity.
export class GenericChatAdapter {
  private anchor = "";
  private known = new Set<string>();
  private route = "";
  private platformPreview;
  constructor(
    private doc: Document,
    private location: () => URL,
  ) {
    this.platformPreview = createPlatformPreviewAdapter(doc, location);
  }
  inspect(): GenericInspection {
    const url = this.location();
    if (
      url.protocol !== "https:" ||
      /\/(share|shared|public)(\/|$)/i.test(url.pathname)
    )
      return { reason: "unsupported-page", method: "semantic" };
    const platform = this.platformPreview?.read();
    if (platform?.messages.length)
      return {
        reason: "ready",
        method: "platform-layout",
        snapshot: {
          ...platform,
          source: "generic",
          sourceOrigin: url.origin,
          captureMode: "explicit",
          temporary: null,
        },
      };
    const deepseek = url.origin === "https://chat.deepseek.com";
    const method = deepseek ? "deepseek-layout" : "semantic";
    const fail = (reason: GenericReason): GenericInspection => ({
      reason,
      method,
    });
    const roots = deepseek
      ? deepseekRoots(this.doc, excluded)
      : [
          ...this.doc.querySelectorAll<HTMLElement>(
            'main,[role="main"],[role="log"]',
          ),
        ].filter((el) => visible(el) && !el.closest(excluded));
    const outerRoots = roots.filter(
      (el) => !roots.some((parent) => parent !== el && parent.contains(el)),
    );
    const candidates = outerRoots.flatMap((root) => {
      const ds = deepseek
        ? [...root.querySelectorAll<HTMLElement>(".ds-message")]
        : [];
      // Message components win over unrelated data-role attributes on virtual
      // list wrappers. Those wrapper attributes do not describe a speaker.
      const elements = ds.length
        ? ds
        : [...root.querySelectorAll<HTMLElement>(roleSelector)];
      return elements
        .filter((el) => visible(el) && !el.closest(excluded))
        .map((el) => ({ el, root }));
    });
    // Outermost message wrappers win, but conflicting nested roles are rejected below.
    const nodes = candidates.filter(
      ({ el }) =>
        !candidates.some(
          ({ el: parent }) => parent !== el && parent.contains(el),
        ),
    );
    if (nodes.length > 10000) return fail("ambiguous");
    if (!nodes.length)
      return fail(
        deepseek && !roots.length && this.doc.querySelector(".ds-message")
          ? "region-missing"
          : "no-content",
      );
    const usedRoots = new Set(nodes.map((n) => n.root));
    if (usedRoots.size !== 1) return fail("ambiguous");
    const sessionFromUrl = deepseek
      ? url.pathname.match(/^\/a\/chat\/s\/([a-zA-Z0-9_-]+)\/?$/)?.[1]
      : undefined;
    const now = Date.now();
    const messages: Message[] = [];
    const seen = new Set<string>();
    let commonThread: HTMLElement | null | undefined;
    for (const { el, root } of nodes) {
      let role = roleOf(el);
      if (
        !role &&
        [
          el.dataset.messageAuthorRole,
          el.dataset.messageRole,
          el.dataset.authorRole,
          el.dataset.role,
        ].some((v) => /^(user|human|assistant|model|bot|ai)$/i.test(v ?? ""))
      )
        return fail("ambiguous");
      if (!role && deepseek && !el.matches(roleSelector))
        role = deepseekRole(el);
      else if (
        !role &&
        deepseek &&
        el.matches(".ds-message") &&
        el.querySelector(
          ".ds-collapsible-text,.ds-assistant-message-main-content,.ds-think-content",
        )
      )
        role = deepseekRole(el);
      if (!role) return fail("roles-unknown");
      for (const child of el.querySelectorAll<HTMLElement>(roleSelector)) {
        const childRole = roleOf(child);
        if (childRole && childRole !== role) return fail("ambiguous");
      }
      let key = identity(el, root);
      if (!key && deepseek && sessionFromUrl) {
        const item = el.closest<HTMLElement>("[data-virtual-list-item-key]");
        const native = item?.dataset.virtualListItemKey;
        if (native && /^[a-zA-Z0-9_-]{1,150}$/.test(native))
          key = `native-item:${native}`;
      }
      if (!key) return fail("identity-missing");
      const id = `${role}:${key}`;
      if (seen.has(id)) return fail("ambiguous");
      seen.add(id);
      const thread = el.closest<HTMLElement>(
        "[data-conversation-id],[data-thread-id]",
      );
      if (commonThread === undefined) commonThread = thread;
      else if (commonThread !== thread) return fail("ambiguous");
      messages.push({
        id,
        role,
        text: bodyText(el, deepseek, role),
        order: messages.length,
        createdAt: now,
        updatedAt: now,
      });
    }
    const route = url.pathname + url.search;
    if (route !== this.route) {
      this.anchor = "";
      this.known.clear();
      this.route = route;
    }
    const thread =
      sessionFromUrl ??
      commonThread?.dataset.conversationId ??
      commonThread?.dataset.threadId;
    if (thread && thread.length > 200) return fail("identity-missing");
    // A native conversation and stable role/message keys identify a partial
    // virtual window even when its user turn has already been unmounted.
    if (
      !thread &&
      (!messages.some((m) => m.role === "user") ||
        !messages.some((m) => m.role === "assistant"))
    )
      return fail("roles-unknown");
    if (
      !thread &&
      !/[a-f0-9]{16,}|[a-f0-9]{8}-[a-f0-9-]{20,}/i.test(
        messages.find((m) => m.role === "user")!.id,
      )
    )
      return fail("identity-missing");
    // URL changes and non-overlapping native anchors end this approval scope.
    if (!this.anchor || !messages.some((m) => this.known.has(m.id))) {
      this.anchor =
        messages.find((m) => m.role === "user")?.id ?? messages[0]!.id;
      this.known.clear();
    }
    messages.forEach((m) => this.known.add(m.id));
    const raw = thread ? `native:${thread}` : `anchor:${this.anchor}`;
    // Keep URL scope collision-free without storing URL query/path (which may be sensitive).
    // Route digest is generated by the content runtime before persistence.
    return {
      reason: "ready",
      method,
      snapshot: {
        source: "generic",
        id: `thread:${raw}`,
        temporary: null,
        captureMode: "explicit",
        sourceOrigin: url.origin,
        messages,
      },
    };
  }
}
