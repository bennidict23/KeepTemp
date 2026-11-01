import type { PlatformAdapter, Snapshot, Message } from "./model";
// No ChatGPT selector, host access, or runtime enable switch exists in this build.
export const chatGPTCapability = {
  enabled: false,
  reason: "Programmatic extraction permission not established",
} as const;
export class MockAdapter implements PlatformAdapter {
  readonly source = "mock" as const;
  constructor(
    private root: HTMLElement,
    private scope: string,
  ) {}
  read(): Snapshot | null {
    const key = this.root.dataset.session;
    if (!key) return null;
    const now = Date.now();
    const messages: Message[] = [
      ...this.root.querySelectorAll<HTMLElement>("[data-message-id]"),
    ].flatMap((el, order) => {
      const role = el.dataset.role;
      return role === "user" || role === "assistant"
        ? [
            {
              id: el.dataset.messageId!,
              role,
              text: el.textContent ?? "",
              order,
              createdAt: Number(el.dataset.createdAt) || now,
              updatedAt: now,
            },
          ]
        : [];
    });
    return {
      id: `mock:${this.scope}:${key}`,
      temporary:
        this.root.dataset.temporary === "true"
          ? true
          : this.root.dataset.temporary === "false"
            ? false
            : null,
      messages,
    };
  }
}
