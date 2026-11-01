import { browser } from "wxt/browser";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StorageRepository } from "../../src/storage";
import { context, json, markdown, longContext } from "../../src/recovery";
import type { Session } from "../../src/model";
import "../../src/style.css";
const repo = new StorageRepository();
function dateLabel(value: number) {
  const d = new Date(value),
    now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return value >= today
    ? `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : value >= today - 86400000
      ? "昨天"
      : d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function App() {
  const [consent, setConsent] = useState<boolean | null>(null),
    [enabled, setEnabled] = useState(false),
    [sessions, setSessions] = useState<Session[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [copied, setCopied] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const focusActions = (id: string) =>
    requestAnimationFrame(() =>
      document.getElementById(`session-actions-${id}`)?.focus(),
    );
  useEffect(() => {
    if (!menuId) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".session-actions")
      )
        setMenuId(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuId(null);
        focusActions(menuId);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuId]);
  const listScroll = useRef(0);
  const current = sessions.find((s) => s.id === selected);
  async function load() {
    const [c, e, s] = await Promise.all([
      repo.consent(),
      repo.autoCapture(),
      repo.list(),
    ]);
    return { c, e, s };
  }
  function apply(data: Awaited<ReturnType<typeof load>>) {
    setConsent(data.c);
    setEnabled(data.e);
    setSessions(data.s);
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await load();
        if (active) apply(data);
      } catch {
        if (active) {
          setFailed(true);
          setNotice("暂时无法读取本地记录，请检查浏览器存储设置。");
        }
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice || failed) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice, failed]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    window.scrollTo(0, selected ? 0 : listScroll.current);
    setCopied(false);
    setMenuId(null);
    setEditingId(null);
  }, [selected]);
  async function run(
    task: () => Promise<void>,
    success = "",
    failure = "操作未完成，请检查本地存储空间后重试。",
  ) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      apply(await load());
      setFailed(false);
      setNotice(success);
    } catch {
      setFailed(true);
      setNotice(failure);
    } finally {
      setBusy(false);
    }
  }
  function deleteSession(session: Session) {
    setMenuId(null);
    if (!confirm(`删除“${session.title}”？无法撤销，也不会删除平台端的记录。`))
      return;
    void run(async () => {
      await repo.delete(session.id);
      setSelected((id) => (id === session.id ? null : id));
    }, "已删除本地对话");
  }
  function exportFile(s: Session, kind: "md" | "json") {
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
  const visible = sessions.filter(
    (s) =>
      !query ||
      `${s.title}\n${s.messages.map((m) => m.text).join("\n")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <main>
      <header>
        <button
          className="brand"
          onClick={() => setSelected(null)}
          aria-label="返回对话列表"
        >
          ▱ <strong>KeepTemp</strong>
        </button>
        <span className="badge">
          <span aria-hidden="true">●</span> 仅存本机
        </span>
      </header>
      {notice && (
        <div className="toast" data-tone={failed ? "error" : "success"}>
          <p role="status">{notice}</p>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {consent === null ? (
        <p>正在打开本地记录…</p>
      ) : !consent ? (
        <section className="welcome">
          <span className="eyebrow">A LITTLE LESS TEMPORARY</span>
          <h1>
            临时对话，
            <br />
            留在你手中。
          </h1>
          <p>
            照常聊天，自动留一份在本机。
            <br />
            想继续时，随时找回。
          </p>
          <div className="card">
            <h3>开始之前</h3>
            <p>
              只保存被识别为 Temporary 的可见对话文字，不上传，不需要账号或 API
              Key。
            </p>
            <p>
              本地数据库未加密，不是密码保险库。卸载扩展或清理浏览器数据可能丢失记录，请按需导出。
            </p>
            <p>
              本地保存不改变平台端保留规则；OpenAI
              可能为安全目的保留临时聊天最多 30
              天。复制接续不恢复原服务端会话、附件或工具状态。
            </p>
          </div>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => run(() => repo.authorize())}
          >
            我了解并同意本地保存
          </button>
          <small>同意后，再开启 ChatGPT 自动保存。</small>
        </section>
      ) : current ? (
        <section className="conversation-view">
          <div className="conversation-nav">
            <button className="back-button" onClick={() => setSelected(null)}>
              <span aria-hidden="true">←</span> 返回
            </button>
            <button
              className="danger delete-session"
              disabled={busy}
              onClick={() => deleteSession(current)}
            >
              删除会话
            </button>
          </div>
          <div className="meta">
            {dateLabel(current.updatedAt)} · {current.messages.length} 条消息
            {current.excluded ? " · 已停止保存" : ""}
          </div>
          <h1>{current.title}</h1>
          <div className="toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    await navigator.clipboard.writeText(context(current));
                    setCopied(true);
                  },
                  "已复制历史与接续提示词。打开新临时会话，粘贴发送即可。",
                  "未能写入剪贴板，请检查浏览器权限后重试。",
                )
              }
            >
              {copied ? "已复制 ✓" : "复制并接续"}
            </button>
            <a
              className="button"
              href="https://chatgpt.com/?temporary-chat=true"
              target="_blank"
              rel="noreferrer"
            >
              新临时会话 ↗
            </a>
          </div>
          <small>已包含完整历史与接续提示词。在新临时会话中粘贴并发送。</small>
          {longContext(current) && (
            <p className="notice">
              这段对话较长，可能超过所选模型的上下文容量。复制内容保持完整，不会自动截断。
            </p>
          )}
          <div className="messages">
            {current.messages.map((m) => (
              <article key={m.id}>
                <span className="eyebrow">
                  {m.role === "user" ? "你" : "ChatGPT"}
                </span>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
          <details className="tools">
            <summary>管理这段对话</summary>
            <div className="tool-actions">
              <button onClick={() => exportFile(current, "md")}>
                导出 Markdown
              </button>
              <button onClick={() => exportFile(current, "json")}>
                导出 JSON
              </button>
              {!current.excluded && current.source !== "manual" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => repo.exclude(current.id),
                      "已停止保存此会话，现有记录保留。",
                    )
                  }
                >
                  停止保存此会话
                </button>
              )}
            </div>
          </details>
        </section>
      ) : (
        <section>
          <div className="shelf-heading">
            <div>
              <span className="eyebrow">KEEP WHAT MATTERS</span>
              <h1>你的对话</h1>
            </div>
            <span className="count">{sessions.length} 段</span>
          </div>
          <div className="capture-strip" data-enabled={enabled}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{enabled ? "自动保存已开启" : "自动保存尚未开启"}</strong>
              <small>
                {enabled
                  ? "照常聊天，文字留在本机。"
                  : "只保存可识别的临时对话。"}
              </small>
            </div>
            <button
              className="toggle"
              aria-label={
                enabled ? "关闭 ChatGPT 自动保存" : "启用 ChatGPT 自动保存"
              }
              disabled={busy}
              onClick={() =>
                run(
                  () => repo.setAutoCapture(!enabled),
                  enabled
                    ? "已关闭自动保存"
                    : "已开启自动保存，请在新标签页开始临时聊天。",
                )
              }
            >
              {enabled ? "关闭" : "开启"}
            </button>
          </div>
          <a
            className="primary new-chat"
            href="https://chatgpt.com/?temporary-chat=true"
            target="_blank"
            rel="noreferrer"
          >
            ＋ 新建临时聊天 <span aria-hidden="true">↗</span>
          </a>
          <input
            aria-label="全文搜索"
            type="search"
            placeholder="搜索对话…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="list" aria-label="本地会话">
            {visible.length ? (
              visible.map((s) => (
                <div className="session-row" key={s.id}>
                  {editingId === s.id ? (
                    <form
                      className="rename-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(
                          async () => {
                            await repo.rename(s.id, editingTitle);
                            setEditingId(null);
                            focusActions(s.id);
                          },
                          "名称已更新",
                          "重命名未完成，请输入 1–100 个字符，并确认对话仍然存在。",
                        );
                      }}
                    >
                      <label htmlFor="session-name">重命名会话</label>
                      <input
                        id="session-name"
                        aria-label="会话名称"
                        autoFocus
                        required
                        maxLength={100}
                        value={editingTitle}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingId(null);
                            focusActions(s.id);
                          }
                        }}
                      />
                      <div>
                        <button
                          className="primary"
                          type="submit"
                          disabled={busy || !editingTitle.trim()}
                        >
                          保存名称
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            focusActions(s.id);
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button
                        className="session"
                        onClick={() => {
                          listScroll.current = window.scrollY;
                          setSelected(s.id);
                        }}
                      >
                        <span className="session-meta">
                          <span>{s.excluded ? "已停止保存" : "临时对话"}</span>
                          <time
                            dateTime={new Date(s.updatedAt).toISOString()}
                            title={new Date(s.updatedAt).toLocaleString()}
                          >
                            {dateLabel(s.updatedAt)}
                          </time>
                        </span>
                        <strong>{s.title}</strong>
                        <span className="preview">
                          {s.messages.at(-1)?.text.slice(0, 100)}
                        </span>
                        <span className="message-count">
                          {s.messages.length} 条消息{" "}
                          <span aria-hidden="true">→</span>
                        </span>
                      </button>
                      <div className="session-actions">
                        <button
                          id={`session-actions-${s.id}`}
                          className="more-trigger"
                          aria-label={`会话操作：${s.title}`}
                          aria-haspopup="menu"
                          aria-expanded={menuId === s.id}
                          aria-controls={`session-menu-${s.id}`}
                          disabled={busy}
                          onClick={() =>
                            setMenuId(menuId === s.id ? null : s.id)
                          }
                        >
                          ⋯
                        </button>
                        {menuId === s.id && (
                          <div
                            ref={menuRef}
                            className="session-menu"
                            id={`session-menu-${s.id}`}
                            role="menu"
                            aria-label="会话操作"
                            onKeyDown={(e) => {
                              if (
                                ![
                                  "ArrowDown",
                                  "ArrowUp",
                                  "Home",
                                  "End",
                                ].includes(e.key)
                              )
                                return;
                              e.preventDefault();
                              const items = [
                                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                                  '[role="menuitem"]',
                                ),
                              ];
                              const index = items.indexOf(
                                document.activeElement as HTMLButtonElement,
                              );
                              items[
                                e.key === "Home"
                                  ? 0
                                  : e.key === "End"
                                    ? items.length - 1
                                    : (index +
                                        (e.key === "ArrowDown"
                                          ? 1
                                          : items.length - 1)) %
                                      items.length
                              ]?.focus();
                            }}
                          >
                            <button
                              role="menuitem"
                              onClick={() => {
                                setMenuId(null);
                                setEditingTitle(s.title);
                                setEditingId(s.id);
                              }}
                            >
                              重命名
                            </button>
                            <button
                              role="menuitem"
                              className="danger"
                              onClick={() => deleteSession(s)}
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="empty">
                <div className="empty-icon">▱</div>
                <h3>{query ? "没有找到相关对话" : "下一段好对话，留在这里"}</h3>
                <p>
                  {query
                    ? "换个关键词试试，标题和正文都可以搜。"
                    : "开启自动保存，开始临时聊天。保存成功后会自动出现在这里。"}
                </p>
                {query && (
                  <button className="link" onClick={() => setQuery("")}>
                    清除搜索
                  </button>
                )}
              </div>
            )}
          </div>
          <details className="tools">
            <summary>本地数据与隐私</summary>
            <p className="settings-note">
              记录只在此浏览器中保存，没有云同步。数据库未加密，卸载扩展可能丢失数据。请在对话内导出需要备份的记录。
            </p>
            <button
              className="danger link"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "清空所有本地记录并撤回保存授权？无法撤销。已导出的文件和平台端记录不会被删除。",
                  )
                )
                  void run(async () => {
                    await repo.reset();
                    setSelected(null);
                    setQuery("");
                  }, "全部本地记录与授权已清空");
              }}
            >
              清空所有数据并撤回授权
            </button>
          </details>
          <p className="local-note">仅存本机 · 无云同步 · 随时删除</p>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
