import { platformFromUrl } from "../src/platforms";
import { browser } from "wxt/browser";
import { StorageRepository } from "../src/storage";
import {
  validSnapshot,
  scopedChatId,
  type BridgeResponse,
  type Snapshot,
} from "../src/model";
export default defineBackground(() => {
  const repo = new StorageRepository();
  // Native side-panel auto-opening does not grant activeTab. Handle the real
  // action so Chrome grants it, then open synchronously within that user gesture.
  browser.action.onClicked.addListener((tab) => {
    if (
      tab.id !== undefined &&
      tab.url?.startsWith("https://chatgpt.com/") &&
      !/^\/(share|auth|login)(\/|$)/.test(new URL(tab.url).pathname)
    ) {
      const tabId = tab.id;
      void (async () => {
        let opened = false;
        try {
          const result = await browser.tabs.sendMessage(
            tabId,
            { type: "keeptemp:open-library" },
            { frameId: 0 },
          );
          opened = Boolean(result?.ok);
          if (!opened) throw new Error("library-unavailable");
        } catch {
          try {
            await browser.scripting.executeScript({
              target: { tabId },
              files: ["/content-scripts/capture.js"],
            });
            const result = await browser.tabs.sendMessage(
              tabId,
              { type: "keeptemp:open-library" },
              { frameId: 0 },
            );
            opened = Boolean(result?.ok);
          } catch {
            /* The side panel remains available from Chrome's panel selector. */
          }
        }
        // Opening a native side panel after asynchronous work may lose the user
        // gesture. Keep this branch inside ChatGPT; other sites open synchronously.
        await browser.action.setBadgeText({ tabId, text: opened ? "" : "!" });
        await browser.action.setTitle({
          tabId,
          title: opened
            ? "Open KeepTemp"
            : "未能打开本机历史。请检查网站访问权限；也可从浏览器侧栏选择 KeepTemp。",
        });
      })().catch(() => {});
      return;
    }
    if (tab.windowId !== undefined)
      void browser.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  });
  void browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
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
      // Top-frame scripts only; unknown HTTPS origins also require an explicit host grant below.
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        sender.frameId !== 0 ||
        !sender.url ||
        !sender.url.startsWith("https://")
      ) {
        sendResponse({ ok: false, error: "invalid-source" });
        return false;
      }
      const tabId = sender.tab.id;
      const origin = new URL(sender.url).origin;
      const explicit = request.type.startsWith("keeptemp:generic:");
      const type = explicit
        ? request.type.replace("keeptemp:generic:", "keeptemp:")
        : request.type;
      const platform = platformFromUrl(sender.url)?.id ?? "generic";
      const generic = platform === "generic" || explicit;
      const scope = (id: string) => scopedChatId(tabId, id, platform, origin);
      const data = request as Record<string, unknown>;
      // Keep the channel alive on Chrome versions without Promise-returning listeners.
      void (async (): Promise<BridgeResponse> => {
        try {
          if (
            generic &&
            !(await browser.permissions.contains({ origins: [origin + "/*"] }))
          )
            return { ok: false, error: "invalid-source" };
          const rawId =
            typeof data.id === "string" &&
            data.id.startsWith("thread:") &&
            data.id.length <= 600
              ? data.id
              : null;
          const localConsent = await repo.consent();
          const dark = await repo.darkMode();
          const theme =
            dark === undefined
              ? ("system" as const)
              : dark
                ? ("dark" as const)
                : ("light" as const);
          const currentSession = rawId
            ? await repo.get(scope(rawId))
            : undefined;
          const consent =
            localConsent &&
            (generic
              ? rawId
                ? await repo.genericAllowed(scope(rawId))
                : true
              : currentSession?.captureMode === "explicit"
                ? await repo.genericAllowed(scope(rawId!))
                : await repo.autoCapture(
                    platform as Exclude<typeof platform, "generic">,
                  ));
          if (type === "keeptemp:start-current") {
            if (!(await repo.consent()))
              return { ok: false, error: "consent-required" };
            if (!validSnapshot(data.snapshot, generic))
              return { ok: false, error: "unsupported-data" };
            const snapshot: Snapshot = {
              ...data.snapshot,
              id: scope(data.snapshot.id),
              source: platform,
              ...(generic
                ? { sourceOrigin: origin, captureMode: "explicit" as const }
                : {}),
            };
            const saved = await repo.capture(snapshot, true, true);
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
            return {
              ok: true,
              consent: true,
              saved: true,
              sessionId: snapshot.id,
              theme,
            };
          }
          if (generic && type === "keeptemp:state") {
            const session = rawId ? await repo.get(scope(rawId)) : undefined;
            return {
              ok: true,
              consent,
              theme,
              paused: session?.paused ?? false,
              excluded: Boolean(session?.excluded || session?.deleted),
            };
          }
          if (!consent && !generic)
            return { ok: true, consent: false, saved: false, theme };
          if (type === "keeptemp:capture") {
            if (!validSnapshot(data.snapshot, generic))
              return { ok: false, error: "unsupported-data" };
            const snapshot = data.snapshot;
            const saved = await repo.capture({
              ...snapshot,
              id: scope(snapshot.id),
              source: platform,
              ...(generic
                ? { sourceOrigin: origin, captureMode: "explicit" as const }
                : {}),
            });
            return { ok: true, consent: true, saved };
          }
          const id =
            typeof data.id === "string" &&
            data.id.startsWith("thread:") &&
            data.id.length <= 600
              ? scope(data.id)
              : null;
          if (type === "keeptemp:exclude" && id) await repo.delete(id); // content-free permanent exclusion, including before first write
          if (
            type === "keeptemp:pause" &&
            id &&
            typeof data.paused === "boolean"
          )
            await repo.pause(id, data.paused);
          const session = id ? await repo.get(id) : undefined;
          return {
            ok: true,
            consent: true,
            theme,
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
