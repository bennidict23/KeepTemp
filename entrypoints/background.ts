import { browser } from "wxt/browser";
import { StorageRepository } from "../src/storage";
import {
  validSnapshot,
  scopedChatId,
  type BridgeResponse,
} from "../src/bridge";
export default defineBackground(() => {
  const repo = new StorageRepository();
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  browser.runtime.onMessage.addListener(
    (request: unknown, sender, sendResponse) => {
      if (
        !request ||
        typeof request !== "object" ||
        !("type" in request) ||
        typeof request.type !== "string" ||
        !request.type.startsWith("keeptemp:")
      )
        return;
      // Only our top-frame content script on the exact supported origin may write.
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        sender.frameId !== 0 ||
        !sender.url ||
        new URL(sender.url).origin !== "https://chatgpt.com"
      ) {
        sendResponse({ ok: false, error: "invalid-source" });
        return false;
      }
      const tabId = sender.tab.id;
      const data = request as Record<string, unknown>;
      // Keep the channel alive on Chrome versions without Promise-returning listeners.
      void (async (): Promise<BridgeResponse> => {
        try {
          const consent = (await repo.consent()) && (await repo.autoCapture());
          if (!consent) return { ok: true, consent: false, saved: false };
          if (data.type === "keeptemp:capture") {
            if (!validSnapshot(data.snapshot))
              return { ok: false, error: "unsupported-data" };
            const snapshot = data.snapshot;
            const saved = await repo.capture({
              ...snapshot,
              id: scopedChatId(tabId, snapshot.id),
              source: "chatgpt",
            });
            return { ok: true, consent: true, saved };
          }
          const id =
            typeof data.id === "string" &&
            data.id.startsWith("thread:") &&
            data.id.length <= 600
              ? scopedChatId(tabId, data.id)
              : null;
          if (data.type === "keeptemp:exclude" && id) await repo.delete(id); // content-free permanent exclusion, including before first write
          if (
            data.type === "keeptemp:pause" &&
            id &&
            typeof data.paused === "boolean"
          )
            await repo.pause(id, data.paused);
          const session = id ? await repo.get(id) : undefined;
          return {
            ok: true,
            consent: true,
            paused: session?.paused ?? false,
            excluded: Boolean(session?.excluded || session?.deleted),
          };
        } catch {
          return { ok: false, error: "storage-failed" };
        }
      })().then(sendResponse, () =>
        sendResponse({ ok: false, error: "storage-failed" }),
      );
      return true;
    },
  );
});
