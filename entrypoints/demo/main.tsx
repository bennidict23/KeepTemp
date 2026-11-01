import { browser } from "wxt/browser";
import { MockAdapter } from "../../src/adapters";
import { SessionCapture } from "../../src/capture";
import { StorageRepository } from "../../src/storage";
import "../../src/style.css";
const root = document.getElementById("root")!;
root.innerHTML = `<main><header><strong>▱ KeepTemp Lab</strong><span class="badge">SYNTHETIC ONLY</span></header><h1>合成聊天实验室</h1><p>不连接任何 AI 平台。先在 Side Panel 授权；此页只产生固定合成内容。</p><p id="status" role="status">等待捕获</p><div class="toolbar"><button id="turn">添加合成一轮（流式）</button><button id="new">新会话（SPA）</button><button id="pause">暂停</button></div><label>来源类型<select id="mode"><option value="true">Temporary</option><option value="false">普通聊天</option><option value="unknown">无法确定</option></select></label><small>暂停仅阻止写入；恢复后会保存仍在页面上的内容。排除整段会话请在 Side Panel 操作。Saved 只代表当次事务已提交。</small><div class="messages" id="chat"></div></main>`;
const chat = document.getElementById("chat")!;
const repo = new StorageRepository();
const url = new URL(location.href);
if (!url.searchParams.has("session")) {
  url.searchParams.set("session", crypto.randomUUID());
  history.replaceState(null, "", url);
}
chat.dataset.session = url.searchParams.get("session")!;
chat.dataset.temporary = "true";
const tab = await browser.tabs.getCurrent();
const adapter = new MockAdapter(chat, String(tab?.id ?? crypto.randomUUID()));
const status = document.getElementById("status")!;
const labels = {
  idle: "等待捕获",
  saving: "Saving…",
  saved: "Saved · 已写入本地",
  paused: "已暂停",
  skipped: "未保存 · 未授权、已排除或非 Temporary",
  error: "保存失败 · 未持久化，请保留此页并检查存储空间",
};
const capture = new SessionCapture(adapter, repo, (s) => {
  status.textContent = labels[s];
});
let dirty = false;
new MutationObserver(() => {
  dirty = true;
  status.textContent = "有改动 · 等待写入";
}).observe(chat, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
});
setInterval(() => {
  if (dirty) {
    dirty = false;
    void capture.scan();
  }
}, 150);
let paused = false,
  generation = 0;
document.getElementById("pause")!.onclick = () => {
  paused = !paused;
  capture.pause(paused);
  document.getElementById("pause")!.textContent = paused ? "恢复" : "暂停";
  if (!paused) void capture.scan();
};
const mode = document.getElementById("mode") as HTMLSelectElement;
mode.onchange = () => {
  generation++;
  chat.replaceChildren();
  chat.dataset.session = crypto.randomUUID();
  chat.dataset.temporary = mode.value;
  const next = new URL(location.href);
  next.searchParams.set("session", chat.dataset.session);
  history.pushState(null, "", next);
};
document.getElementById("new")!.onclick = () =>
  mode.onchange!(new Event("change"));
window.onpopstate = () => {
  generation++;
  chat.replaceChildren();
  chat.dataset.session =
    new URL(location.href).searchParams.get("session") ?? crypto.randomUUID();
};
document.getElementById("turn")!.onclick = () => {
  const gen = generation;
  const add = (role: string, text: string) => {
    const el = document.createElement("article");
    el.dataset.messageId = crypto.randomUUID();
    el.dataset.role = role;
    el.dataset.createdAt = String(Date.now());
    el.textContent = text;
    chat.append(el);
    return el;
  };
  add("user", "请给我一个简单的本地优先建议。");
  const el = add("assistant", "");
  const reply =
    "先完成一个小而可靠的闭环：保存、找回、复制。所有文字均为合成测试数据。";
  let i = 0;
  const timer = setInterval(() => {
    if (gen !== generation) {
      clearInterval(timer);
      return;
    }
    el.textContent = reply.slice(0, ++i);
    if (i >= reply.length) clearInterval(timer);
  }, 30);
};
