import { platformFromUrl } from "../src/platforms";
import { browser } from "wxt/browser";
import { GenericChatAdapter } from "../src/generic-adapter";
import type { GenericPreview } from "../src/generic-preview";
import type { BridgeResponse } from "../src/bridge";
import type { Snapshot } from "../src/model";

export default defineContentScript({
  // Concrete matches are registered only after the user grants that origin.
  matches: [],
  registration: "runtime",
  runAt: "document_idle",
  main(ctx) {
    const adapter = new GenericChatAdapter(
      document,
      () => new URL(location.href),
    );
    let previewToken = "",
      previewId = "",
      activeId = "",
      lastSaved = "",
      busy = false;
    let host: HTMLDivElement | undefined;
    let initialized = false;
    const say = (text: string) => {
      if (!host) {
        host = document.createElement("div");
        host.id = platformFromUrl(location.href)
          ? "keeptemp-generic-status"
          : "keeptemp-status";
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML =
          '<style>:host{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:12px system-ui;color:#35533e}section{max-width:300px;padding:10px 12px;background:#f7f9f3;border:1px solid #d7e0d0;border-radius:12px;box-shadow:0 3px 14px #0001}p{margin:0;line-height:1.6}small{display:block;font-size:10px;color:#6d7868}button{font:inherit;color:inherit;background:none;border:1px solid #d7e0d0;border-radius:6px;margin-top:6px;cursor:pointer;padding:3px 8px}</style><section><p role="status"></p><small>本地副本 · 不改变网站历史</small><button id="pause" aria-label="暂停记录">暂停</button></section>';
        document.documentElement.append(host);
        host.shadowRoot!.querySelector<HTMLButtonElement>("#pause")!.onclick =
          async () => {
            const id = activeId;
            if (!id) return;
            const action =
              host!.shadowRoot!.querySelector<HTMLButtonElement>("#pause")!;
            action.disabled = true;
            for (let i = 0; busy && ctx.isValid && i < 120; i++)
              await new Promise((resolve) => setTimeout(resolve, 25));
            if (busy || !ctx.isValid || activeId !== id) {
              action.disabled = false;
              say("设置未完成，请重试");
              return;
            }
            busy = true;
            try {
              const current = await send("keeptemp:state", undefined, activeId);
              const result = (await browser.runtime.sendMessage({
                type: "keeptemp:generic:pause",
                id: activeId,
                paused: !current.paused,
              })) as BridgeResponse;
              if (!result.ok) throw Error();
              const button =
                host!.shadowRoot!.querySelector<HTMLButtonElement>("#pause")!;
              button.textContent = result.paused
                ? "恢复（含可见内容）"
                : "暂停";
              button.setAttribute(
                "aria-label",
                result.paused ? "恢复记录" : "暂停记录",
              );
              say(result.paused ? "已暂停" : "等待更新");
              lastSaved = "";
            } catch {
              say("设置失败，请重试");
            } finally {
              busy = false;
              action.disabled = false;
            }
          };
      }
      host.shadowRoot!.querySelector("p")!.textContent = `KeepTemp · ${text}`;
      host.dataset.recording = String(Boolean(activeId));
      host.dataset.state = text.includes("Saved")
        ? "saved"
        : text.includes("失败")
          ? "error"
          : "idle";
    };
    const read = async () => {
      const inspection = adapter.inspect();
      if (!inspection.snapshot || platformFromUrl(location.href))
        return inspection;
      // SHA-256 keeps route scope stable without persisting a potentially private URL.
      const route = location.pathname + location.search;
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(route),
      );
      const digest = [...new Uint8Array(bytes)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      inspection.snapshot.id = `thread:${digest}:${inspection.snapshot.id.slice(7)}`;
      return inspection;
    };
    const send = (type: string, snapshot?: Snapshot, id?: string) =>
      browser.runtime.sendMessage({
        type: type.replace("keeptemp:", "keeptemp:generic:"),
        snapshot,
        id,
      }) as Promise<BridgeResponse>;
    async function tick() {
      if (busy || !ctx.isValid) return;
      busy = true;
      try {
        // A granted origin may resume an already approved conversation after reload.
        // Unapproved conversation IDs never gain a write grant automatically.
        if (!activeId) {
          if (initialized) return;
          const available = await send("keeptemp:state");
          if (!available.ok || !available.consent) return;
          const initial = await read();
          if (!initial.snapshot) return;
          const approved = await send(
            "keeptemp:state",
            undefined,
            initial.snapshot.id,
          );
          initialized = true;
          if (!approved.ok || !approved.consent || approved.excluded) return;
          activeId = initial.snapshot.id;
        }
        const state = await send("keeptemp:state", undefined, activeId);
        if (!state.ok) throw Error();
        if (state.excluded) {
          say("此会话已排除");
          return;
        }
        if (!state.consent) {
          lastSaved = "";
          say("自动保存已关闭 · 点击 KeepTemp 重新记录");
          return;
        }
        if (state.paused) {
          say("已暂停");
          const button =
            host!.shadowRoot!.querySelector<HTMLButtonElement>("#pause")!;
          button.textContent = "恢复（含可见内容）";
          button.setAttribute("aria-label", "恢复记录");
          return;
        }
        const inspection = await read();
        const snapshot = inspection.snapshot;
        if (!snapshot) {
          say("当前内容无法可靠识别 · 尚未保存更新");
          return;
        }
        if (snapshot.id !== activeId) {
          activeId = "";
          lastSaved = "";
          say("已切换会话 · 请重新确认记录");
          return;
        }
        const key = JSON.stringify(
          snapshot.messages.map((m) => [m.id, m.role, m.text]),
        );
        if (key === lastSaved) {
          say("Saved · 已存本机");
          return;
        }
        say("Saving…");
        const result = await send("keeptemp:capture", snapshot);
        if (!result.ok || !result.saved) throw Error();
        lastSaved = key;
        const latest = await read();
        say(
          latest.snapshot?.id === activeId &&
            JSON.stringify(
              latest.snapshot.messages.map((m) => [m.id, m.role, m.text]),
            ) === key
            ? "Saved · 已存本机"
            : "内容已更新，等待保存",
        );
      } catch {
        say("保存失败 · 请保留此页，稍后重试");
      } finally {
        busy = false;
      }
    }
    const listener: Parameters<
      typeof browser.runtime.onMessage.addListener
    >[0] = (request, sender, reply) => {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab ||
        !sender.url?.startsWith(browser.runtime.getURL("/"))
      )
        return;
      if (request?.type === "keeptemp:generic-ping") {
        reply({ ok: true });
        return false;
      }
      if (request?.type === "keeptemp:generic-preview") {
        void read().then(
          (inspection) => {
            previewToken = crypto.randomUUID();
            previewId = inspection.snapshot?.id ?? "";
            const preview: Omit<GenericPreview, "tabId"> = {
              origin: location.origin,
              token: previewToken,
              id: previewId,
              reason: inspection.reason,
              method: inspection.method,
              messages: inspection.snapshot?.messages ?? [],
            };
            reply({ ok: true, preview });
          },
          () => reply({ ok: false, error: "no-content" }),
        );
        return true;
      }
      if (request?.type === "keeptemp:generic-record") {
        if (busy) {
          reply({ ok: false, error: "busy" });
          return false;
        }
        if (!previewToken || request.token !== previewToken) {
          reply({ ok: false, error: "preview-expired" });
          return false;
        }
        busy = true;
        void (async () => {
          try {
            const inspection = await read();
            if (!inspection.snapshot || inspection.snapshot.id !== previewId)
              return { ok: false, error: "preview-expired" };
            const result = await send(
              "keeptemp:start-current",
              inspection.snapshot,
            );
            if (result.ok && result.saved) {
              activeId = inspection.snapshot.id;
              previewToken = "";
              lastSaved = ""; // next tick rechecks the latest stream before showing Saved
              const latest = await read();
              say(
                latest.snapshot?.id === activeId &&
                  JSON.stringify(
                    latest.snapshot.messages.map((m) => [m.id, m.role, m.text]),
                  ) ===
                    JSON.stringify(
                      inspection.snapshot.messages.map((m) => [
                        m.id,
                        m.role,
                        m.text,
                      ]),
                    )
                  ? "Saved · 已存本机"
                  : "内容已更新，等待保存",
              );
            } else say("保存失败 · 请保留此页，稍后重试");
            return result;
          } catch {
            say("保存失败 · 请保留此页，稍后重试");
            return { ok: false, error: "storage-failed" };
          }
        })()
          .then(reply)
          .finally(() => {
            busy = false;
          });
        return true;
      }
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.setInterval(() => void tick(), 500);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(listener);
      host?.remove();
    });
  },
});
