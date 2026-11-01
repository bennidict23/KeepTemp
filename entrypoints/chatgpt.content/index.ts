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
    shadow.innerHTML = `<style>:host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:12px -apple-system,sans-serif;color:#214331}section{background:#f5f8f1;border:1px solid #c9d7c8;border-radius:12px;padding:10px 12px;box-shadow:0 3px 18px #0002;max-width:290px}p{margin:0;line-height:1.6}button{font:inherit;margin:7px 6px 0 0;padding:4px 8px;border:1px solid #c9d7c8;border-radius:6px;color:#214331;background:white;cursor:pointer}small{display:block;margin-top:5px;color:#657361}button:disabled{opacity:.5}</style><section><p role="status">KeepTemp · 正在检查授权</p><div hidden><button id="pause">暂停</button><button id="exclude">排除此会话</button></div><small>只保存可见文字 · 不恢复附件</small><button id="diagnostic">复制诊断（不含聊天内容）</button><textarea aria-label="结构诊断" readonly hidden style="width:260px;height:130px;margin-top:6px"></textarea></section>`;
    document.documentElement.append(host);
    const label = shadow.querySelector("p")!,
      controls = shadow.querySelector("div")!,
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
    shadow.querySelector<HTMLButtonElement>("#diagnostic")!.onclick =
      async () => {
        const report = JSON.stringify(adapter.diagnose(), null, 2);
        const output = shadow.querySelector<HTMLTextAreaElement>("textarea")!;
        output.hidden = false;
        output.value = report;
        output.focus();
        output.select();
        try {
          await navigator.clipboard.writeText(report);
        } catch {
          /* Selected text remains available for manual copy. */
        }
      };
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !host.contains(r.target))) {
        dirty = true;
        if (consent && !paused && !excluded)
          say("页面已更新，正在检查保存状态");
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
          say("尚未授权，请在扩展面板开启本地保存");
          return;
        }
        // Read only after consent; unknown or regular pages never produce a write.
        const s = adapter.read();
        if (!s || s.temporary !== true || !s.messages.length) {
          controls.hidden = true;
          activeId = "";
          const reasons: Record<string, string> = {
            regular: "普通聊天，不保存",
            "mode-unknown": "未识别到临时模式，请点击复制诊断",
            "outside-main": "消息在不同页面区域，请点击复制诊断",
            "message-markers-missing": "未找到对话节点，请点击复制诊断",
            "user-message-missing": "临时模式已识别，等待用户消息",
            "session-id-missing":
              "临时模式已识别，但缺少会话标识，请点击复制诊断",
            "message-id-missing":
              "临时模式已识别，但缺少消息标识，请点击复制诊断",
          };
          say(reasons[adapter.diagnose().reason] ?? "等待对话内容");
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
          say("已暂停；恢复时会保存可见内容");
          return;
        }
        if (!dirty) return;
        const key = JSON.stringify([
          s.id,
          s.messages.map((m) => [m.id, m.role, m.text]),
        ]);
        dirty = false;
        if (key === lastSaved) {
          say("Saved · 已保存到本地");
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
          if (currentKey === key) say("Saved · 已保存到本地");
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
        say("保存失败 · 请保留页面并重试；更新扩展后请刷新网页");
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
