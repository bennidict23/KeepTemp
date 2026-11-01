import { platformFromUrl } from "../src/platforms";
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
        !platformFromUrl(sender.url)
      ) {
        sendResponse({ ok: false, error: "invalid-source" });
        return false;
      }
      const tabId = sender.tab.id;
      const platform = platformFromUrl(sender.url)!.id;
      const data = request as Record<string, unknown>;
      // Keep the channel alive on Chrome versions without Promise-returning listeners.
      void (async (): Promise<BridgeResponse> => {
        try {
          const consent =
            (await repo.consent()) && (await repo.autoCapture(platform));
          if (data.type === "keeptemp:start-current") {
            if (!(await repo.consent()))
              return { ok: false, error: "consent-required" };
            if (!validSnapshot(data.snapshot))
              return { ok: false, error: "unsupported-data" };
            const snapshot = {
              ...data.snapshot,
              id: scopedChatId(tabId, data.snapshot.id, platform),
              source: platform,
            };
            const saved = await repo.capture(snapshot, true);
            if (!saved) {
              const s = await repo.get(snapshot.id);
              return {
                ok: false,
                error: s?.paused
                  ? "paused"
                  : s?.deleted || s?.excluded
                    ? "excluded"
                    : "not-saved",
              };
            }
            return { ok: true, consent: true, saved: true };
          }
          if (!consent) return { ok: true, consent: false, saved: false };
          if (data.type === "keeptemp:capture") {
            if (!validSnapshot(data.snapshot))
              return { ok: false, error: "unsupported-data" };
            const snapshot = data.snapshot;
            const saved = await repo.capture({
              ...snapshot,
              id: scopedChatId(tabId, snapshot.id, platform),
              source: platform,
            });
            return { ok: true, consent: true, saved };
          }
          const id =
            typeof data.id === "string" &&
            data.id.startsWith("thread:") &&
            data.id.length <= 600
              ? scopedChatId(tabId, data.id, platform)
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
