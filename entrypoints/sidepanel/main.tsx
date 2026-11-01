import { browser } from "wxt/browser";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { StorageRepository } from "../../src/storage";
import {
  context,
  json,
  markdown,
  longContext,
  importText,
} from "../../src/recovery";
import type { Session } from "../../src/model";
import "../../src/style.css";
const repo = new StorageRepository();
const sourceName = (source: Session["source"]) =>
  source === "chatgpt"
    ? "ChatGPT"
    : source === "mock"
      ? "合成模拟"
      : "主动导入";
function App() {
  const [consent, setConsent] = useState<boolean | null>(null),
    [sessions, setSessions] = useState<Session[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [autoCapture, setAutoCapture] = useState(false);
  const current = sessions.find((s) => s.id === selected);
  async function refresh() {
    setConsent(await repo.consent());
    setAutoCapture(await repo.autoCapture());
    setSessions(await repo.list(query));
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const c = await repo.consent(),
          s = await repo.list(query);
        if (active) {
          setConsent(c);
          setAutoCapture(await repo.autoCapture());
          setSessions(s);
        }
      } catch {
        if (active) setNotice("无法读取本地数据库。请检查浏览器存储设置。");
      }
    };
    void load();
    const timer = setInterval(load, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [query]);
  async function run(task: () => Promise<void>, message = "") {
    setBusy(true);
    setNotice("");
    try {
      await task();
      await refresh();
      setNotice(message);
    } catch {
      setNotice(
        "操作未完成。导入需使用 [user] / [assistant] 独占一行的格式或 KeepTemp JSON；也请检查存储空间与剪贴板权限。",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(s: Session, kind: "md" | "json") {
    const url = URL.createObjectURL(
      new Blob([kind === "md" ? markdown(s) : json(s)], {
        type:
          kind === "md" ? "text/markdown;charset=utf-8" : "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `keeptemp-${s.createdAt}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main>
      <header>
        <a
          className="brand"
          href="#"
          onClick={() => {
            setSelected(null);
            setAdding(false);
          }}
        >
          ▱ <strong>KeepTemp</strong>
        </a>
        <span className="badge">LOCAL ONLY</span>
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {consent === null ? (
        <p>正在打开本地数据库…</p>
      ) : !consent ? (
        <section className="welcome">
          <span className="eyebrow">A LITTLE LESS TEMPORARY</span>
          <h1>
            临时对话，
            <br />
            留在你手中。
          </h1>
          <p>在本地保存一份文字，随时找回和接续。</p>
          <div className="card">
            <h3>开启之前，你需要知道</h3>
            <p>
              聊天保存在此 Chrome 配置的 IndexedDB
              中，不上传，无账号、云同步或分析 SDK。
            </p>
            <p>
              本地数据库没有应用层加密，不是密码保险库。卸载扩展或清理浏览器数据可能丢失记录，请按需导出备份。
            </p>
            <p>
              本地保存不会改变平台端保留策略。OpenAI 表示 Temporary Chat
              可能为安全目的保留最多 30 天。
            </p>
            <p>
              你可在授权后单独启用 ChatGPT 自动保存。启用后只读取被识别为
              Temporary 的可见对话文字；普通或无法识别的聊天不保存。
            </p>
          </div>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => run(() => repo.authorize())}
          >
            我了解并同意本地保存
          </button>
          <small>
            恢复仅复制文字上下文，不恢复原服务端会话、附件或工具状态。
          </small>
        </section>
      ) : adding ? (
        <section>
          <button className="link" onClick={() => setAdding(false)}>
            ← 返回会话库
          </button>
          <h1>留下一段对话</h1>
          <p>
            主动粘贴你有权保存的内容。每个角色使用独占一行的标记，内容中的同名标记请使用
            JSON 导入以避免歧义。
          </p>
          <label>
            标题（选填）
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="这段对话关于什么？"
            />
          </label>
          <label>
            对话文字或 KeepTemp JSON
            <textarea
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"[user]\n如何开始？\n\n[assistant]\n从一小步开始。"}
            />
          </label>
          <label className="file">
            或选择 JSON 文件
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    if (f.size > 2_000_000) throw Error();
                    setText(await f.text());
                  });
              }}
            />
          </label>
          <button
            className="primary full"
            disabled={busy || !text.trim()}
            onClick={() =>
              run(async () => {
                const s = importText(text, title);
                await repo.importSession(s);
                setText("");
                setTitle("");
                setAdding(false);
                setSelected(s.id);
              }, "已保存到本地")
            }
          >
            保存到本地
          </button>
        </section>
      ) : current ? (
        <section>
          <button className="link" onClick={() => setSelected(null)}>
            ← 会话库
          </button>
          <div className="meta">
            {sourceName(current.source)} ·{" "}
            {new Date(current.updatedAt).toLocaleString()}
          </div>
          <h1>{current.title}</h1>
          <div className="toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => navigator.clipboard.writeText(context(current)),
                  "已复制上下文",
                )
              }
            >
              复制上下文
            </button>
            <button onClick={() => download(current, "md")}>Markdown</button>
            <button onClick={() => download(current, "json")}>JSON</button>
          </div>
          <a
            className="external"
            href="https://chatgpt.com/"
            target="_blank"
            rel="noreferrer"
          >
            打开新 ChatGPT 会话 ↗
          </a>
          <small>
            请自行选择 Temporary
            模式并粘贴发送。复制不会自动发送，也不恢复原会话。
          </small>
          {longContext(current) && (
            <p className="notice">
              这段上下文较长（超过 24,000
              字符），可能超出所选模型容量。此提示不计算精确
              token，内容不会被自动截断。
            </p>
          )}
          <div className="messages">
            {current.messages.map((m) => (
              <article key={m.id}>
                <span className="eyebrow">
                  {m.role === "user" ? "YOU" : "ASSISTANT"}
                </span>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
          <div className="toolbar">
            {current.source !== "manual" && !current.excluded && (
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    () => repo.exclude(current.id),
                    "此会话已排除，后续不再捕获",
                  )
                }
              >
                排除此会话
              </button>
            )}
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm("删除此会话？无法撤销。"))
                  void run(async () => {
                    await repo.delete(current.id);
                    setSelected(null);
                  }, "已删除");
              }}
            >
              删除会话
            </button>
          </div>
        </section>
      ) : (
        <section>
          <span className="eyebrow">YOUR LOCAL SHELF</span>
          <h1>值得留下的对话</h1>
          <p>留一份文字，为下一次思考接上文。</p>
          <div className="card">
            <h3>ChatGPT 自动保存 · 实验功能</h3>
            <p>
              启用后，你在 chatgpt.com 的 Temporary Chat
              可见文字会自动保存在本机。页面右下角显示状态，可暂停或排除。普通聊天与识别不确定的页面不保存。
            </p>
            <button
              className={autoCapture ? "" : "primary"}
              disabled={busy}
              onClick={() =>
                run(
                  () => repo.setAutoCapture(!autoCapture),
                  autoCapture
                    ? "已关闭自动保存"
                    : "已启用。请刷新 ChatGPT 页面，打开 Temporary Chat 查看右下角状态。",
                )
              }
            >
              {autoCapture ? "关闭 ChatGPT 自动保存" : "启用 ChatGPT 自动保存"}
            </button>
            {autoCapture && (
              <a
                className="external"
                href="https://chatgpt.com/?temporary-chat=true"
                target="_blank"
                rel="noreferrer"
              >
                打开 ChatGPT 临时聊天 ↗
              </a>
            )}
          </div>
          <button className="primary full" onClick={() => setAdding(true)}>
            ＋ 粘贴或导入对话
          </button>
          <input
            aria-label="全文搜索"
            type="search"
            placeholder="搜索标题与全文…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="list">
            {sessions.length ? (
              sessions.map((s) => (
                <button
                  className="session"
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                >
                  <span className="meta">
                    {sourceName(s.source)} · {s.messages.length} 条消息
                    {s.excluded ? " · 已排除" : ""}
                  </span>
                  <strong>{s.title}</strong>
                  <span>{s.messages.at(-1)?.text.slice(0, 100)}</span>
                </button>
              ))
            ) : (
              <div className="empty">
                <div className="empty-icon">▱</div>
                <h3>
                  {query ? "没有匹配的对话" : "你的本地书架，等第一段对话"}
                </h3>
                <p>启用自动保存后，在 ChatGPT Temporary Chat 开始对话即可。</p>
              </div>
            )}
          </div>
          <button
            className="link"
            onClick={() =>
              browser.tabs.create({ url: browser.runtime.getURL("/demo.html") })
            }
          >
            打开合成聊天实验室 ↗
          </button>
          <footer>
            <p>
              ChatGPT 自动保存：{autoCapture ? "已启用" : "未启用"} · 仅
              chatgpt.com
            </p>
            <p>本地存储未加密；请按需导出备份。</p>
            <button
              className="danger link"
              disabled={busy}
              onClick={() => {
                if (
                  confirm("彻底清空本地会话、设置与授权？需重新同意才可保存。")
                )
                  void run(async () => {
                    await repo.reset();
                    setSelected(null);
                    setText("");
                    setTitle("");
                    setAdding(false);
                  }, "全部本地数据与授权已清空");
              }}
            >
              清空所有数据并撤回授权
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
