import { plainText, visible } from "./chatgpt";
import type { Role } from "../model";

// Source-specific scopes, not body-wide harvesting. Newer DeepSeek layouts put
// the chat in a div virtual list and may have no main/role=main at all.
export function deepseekRoots(doc: Document, excluded: string) {
  for (const selector of [
    ".ds-virtual-list",
    ".ds-virtual-list-visible-items",
    ".ds-virtual-list-items",
  ]) {
    const roots = [...doc.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => visible(el) && !el.closest(excluded),
    );
    if (roots.length) return roots;
  }
  return [
    ...doc.querySelectorAll<HTMLElement>('main,[role="main"],[role="log"]'),
  ].filter((el) => visible(el) && !el.closest(excluded));
}
export function deepseekRole(el: HTMLElement): Role | null {
  if (!el.matches(".ds-message")) return null;
  // Explicit assistant body and thinking placeholders take precedence over
  // markdown: user messages can themselves contain rendered markdown/code.
  if (el.querySelector(".ds-assistant-message-main-content,.ds-think-content"))
    return "assistant";
  if (el.querySelector(".ds-collapsible-text")) return "user";
  if (el.querySelector(".ds-markdown")) return "assistant";
  return "user"; // Legacy unlabelled plaintext ds-message bubble.
}
export function deepseekText(el: HTMLElement, role: Role) {
  const primary =
    role === "assistant"
      ? el.querySelector<HTMLElement>(".ds-assistant-message-main-content")
      : el.querySelector<HTMLElement>(".ds-collapsible-text");
  const copy = (primary ?? el).cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      '.ds-think-content,[data-thinking],.thinking-container,.sr-only,.ds-message-actions,[data-message-actions],[data-testid="message-actions"]',
    )
    .forEach((n) => n.remove());
  if (primary || role === "user") return plainText(copy);
  // Legacy assistants can render several sibling markdown blocks. Exclude the
  // thinking subtree before locating them, so the first reasoning block cannot
  // replace the final answer. Never create a new message for each block.
  const blocks = [...copy.querySelectorAll<HTMLElement>(".ds-markdown")].filter(
    (node) => !node.parentElement?.closest(".ds-markdown"),
  );
  return blocks.length ? blocks.map(plainText).join("\n") : plainText(copy);
}
