import { browser } from "wxt/browser";
import { ChatGPTAdapter } from "../../src/chatgpt-adapter";
import type { BridgeRequest, BridgeResponse } from "../../src/bridge";
export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",
  main(ctx) {
    const adapter = new ChatGPTAdapter(document, () => new URL(location.href));
    const host = document.createElement("div");
    host.id = "keeptemp-status";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
:host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#35533e}*{box-sizing:border-box}section{background:#f7f9f3f5;border:1px solid #d7e0d0;border-radius:22px;box-shadow:0 3px 14px #0000000b;max-width:290px}.bar{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px}.dot{width:6px;height:6px;border-radius:50%;background:#8a9983;flex-shrink:0}:host([data-state=saved]) .dot{background:#52864e}:host([data-state=error]) .dot{background:#ba644c}p{margin:0;line-height:1.5;font-size:11px}button{font:inherit;background:transparent;color:inherit;border:1px solid #d7e0d0;border-radius:7px;padding:6px 9px;cursor:pointer}button:focus-visible{outline:2px solid #52864e;outline-offset:2px}#expand{border:0;padding:0 4px;line-height:1;font-size:18px}#actions{padding:0 12px 12px;border-top:1px solid #e2e8dc;margin-top:2px}#capture-controls{display:flex;gap:6px;flex-wrap:wrap;padding-top:10px}#capture-controls[hidden],#actions[hidden]{display:none}small{display:block;color:#7c8876;font-size:10px;line-height:1.7;margin-top:8px}section:has(#actions:not([hidden])){border-radius:14px}@media(prefers-color-scheme:dark){section{background:#233027f5;border-color:#40513e;color:#d0dfc7}button{border-color:#40513e}#actions{border-color:#40513e}small{color:#a3b39a}}
</style><section aria-label="KeepTemp 保存状态"><div class="bar"><span class="dot" aria-hidden="true"></span><p role="status">KeepTemp · 正在检查</p><button id="expand" aria-label="KeepTemp 操作" aria-expanded="false" aria-controls="actions">⋯</button></div><div id="actions" hidden><div id="capture-controls" hidden><button id="pause">暂停</button><button id="exclude">排除此会话</button></div><small>仅保存可见文字，不上传。暂停后恢复会保存当前可见内容。</small></div></section>`;
    document.documentElement.append(host);
    const label = shadow.querySelector("p")!,
      controls = shadow.querySelector<HTMLElement>("#capture-controls")!,
      pause = shadow.querySelector<HTMLButtonElement>("#pause")!,
      exclude = shadow.querySelector<HTMLButtonElement>("#exclude")!;
    let busy = false,
      dirty = true,
      lastSaved = "",
      lastState = 0,
      paused = false,
      excluded = false,
      consent = false,
      activeId = "";
    const say = (s: string) => {
      label.textContent = `KeepTemp · ${s}`;
      host.dataset.state = s.includes("Saved")
        ? "saved"
        : s.includes("失败")
          ? "error"
          : "idle";
    };
    const send = (request: BridgeRequest) =>
      browser.runtime.sendMessage(request) as Promise<BridgeResponse>;
    const state = async (id?: string) => {
      const r = await send({ type: "keeptemp:state", id });
      if (!r?.ok) throw Error();
      consent = r.consent === true;
      paused = r.paused === true;
      excluded = r.excluded === true;
      pause.textContent = paused ? "恢复（含可见内容）" : "暂停";
      controls.hidden = !consent || !id || excluded;
      return r;
    };
    pause.onclick = async () => {
      if (busy || !activeId) return;
      busy = true;
      try {
        const r = await send({
          type: "keeptemp:pause",
          id: activeId,
          paused: !paused,
        });
        if (!r.ok) throw Error();
        await state(activeId);
        say(paused ? "已暂停；恢复时会保存可见内容" : "等待更新");
        dirty = true;
      } catch {
        say("设置失败，请重试");
      } finally {
        busy = false;
      }
    };
    exclude.onclick = async () => {
      if (busy || !activeId) return;
      if (!confirm("排除此会话并删除其本地副本？后续不再保存。")) return;
      busy = true;
      try {
        const r = await send({ type: "keeptemp:exclude", id: activeId });
        if (!r.ok) throw Error();
        await state(activeId);
        lastSaved = "";
        say("此会话已排除");
      } catch {
        say("排除失败，请重试");
      } finally {
        busy = false;
      }
    };
    const expand = shadow.querySelector<HTMLButtonElement>("#expand")!;
    const actions = shadow.querySelector<HTMLElement>("#actions")!;
    const closeActions = () => {
      actions.hidden = true;
      expand.setAttribute("aria-expanded", "false");
    };
    expand.onclick = () => {
      actions.hidden = !actions.hidden;
      expand.setAttribute("aria-expanded", String(!actions.hidden));
    };
    shadow.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") {
        closeActions();
        expand.focus();
      }
    });
    ctx.addEventListener(document, "pointerdown", (event) => {
      if (!event.composedPath().includes(host)) closeActions();
    });
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !host.contains(r.target))) {
        dirty = true;
        if (consent && !paused && !excluded) say("正在检查更新…");
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "data-message-id",
        "data-message-author-role",
        "data-turn-key",
        "data-content-search-unit-key",
        "data-chatgpt-search-unit-key",
        "data-chatgpt-search-message-ids",
        "data-chatgpt-conversation-selection-target",
        "aria-pressed",
        "aria-checked",
        "data-state",
      ],
    });
    const tick = async () => {
      if (busy || !ctx.isValid) return;
      busy = true;
      try {
        if (Date.now() - lastState > 1200) {
          await state(activeId || undefined);
          lastState = Date.now();
        }
        if (!consent) {
          lastSaved = "";
          dirty = true;
          say("尚未授权 · 未开启自动保存");
          return;
        }
        // Read only after consent; unknown or regular pages never produce a write.
        const s = adapter.read();
        if (!s || s.temporary !== true || !s.messages.length) {
          controls.hidden = true;
          activeId = "";
          say(
            s?.temporary === false
              ? "普通聊天，不保存"
              : s?.temporary === true
                ? "等待临时对话内容"
                : "等待临时对话",
          );
          return;
        }
        if (activeId !== s.id) {
          activeId = s.id;
          lastSaved = "";
          dirty = true;
          await state(activeId);
        }
        if (excluded) {
          say("此会话已排除");
          return;
        }
        if (paused) {
          say("已暂停");
          return;
        }
        if (!dirty) return;
        const key = JSON.stringify([
          s.id,
          s.messages.map((m) => [m.id, m.role, m.text]),
        ]);
        dirty = false;
        if (key === lastSaved) {
          say("Saved · 已存本机");
          return;
        }
        say("Saving…");
        const r = await send({ type: "keeptemp:capture", snapshot: s });
        if (!r?.ok) throw Error();
        if (r.saved) {
          lastSaved = key;
          const latest = adapter.read();
          const currentKey = latest
            ? JSON.stringify([
                latest.id,
                latest.messages.map((m) => [m.id, m.role, m.text]),
              ])
            : "";
          if (currentKey === key) say("Saved · 已存本机");
          else {
            dirty = true;
            say("内容已更新，等待保存");
          }
        } else {
          dirty = true;
          lastState = 0;
          say("未保存 · 请检查授权或会话排除状态");
        }
      } catch {
        dirty = true;
        say("保存失败 · 请保留此页，稍后重试");
      } finally {
        busy = false;
      }
    };
    ctx.setInterval(() => void tick(), 350);
    void tick();
    ctx.addEventListener(window, "popstate", () => {
      dirty = true;
    });
    ctx.addEventListener(window, "pageshow", () => {
      dirty = true;
      lastState = 0;
    });
    ctx.onInvalidated(() => {
      observer.disconnect();
      host.remove();
    });
  },
});
