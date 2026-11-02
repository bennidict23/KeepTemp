import {
  PLATFORMS,
  platformName,
  isPlatform,
  type PlatformId,
} from "../../src/platforms";
import { browser } from "wxt/browser";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StorageRepository } from "../../src/storage";
import { context, json, markdown, longContext } from "../../src/recovery";
import type { Session } from "../../src/model";
import { recordCurrentPage, currentChatError } from "../../src/current-chat";
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
  const [dark, setDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [themePreference, setThemePreference] = useState<boolean | undefined>();
  const [genericCount, setGenericCount] = useState(0);
  const [destination, setDestination] = useState<PlatformId>("chatgpt");
  const [enabledOn, setEnabledOn] = useState<PlatformId[]>([]);
  const target = PLATFORMS.find((p) => p.id === destination)!;
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
  const readEpoch = useRef(0),
    mutationActive = useRef(false);
  const current = sessions.find((s) => s.id === selected);
  async function load() {
    const [c, e, s] = await Promise.all([
      repo.consent(),
      repo.autoCapture(),
      repo.list(),
    ]);
    const platforms = await repo.enabledPlatforms();
    const generic = await repo.genericCount();
    const theme = await repo.darkMode();
    return { c, e, s, platforms, generic, theme };
  }
  function apply(data: Awaited<ReturnType<typeof load>>) {
    setConsent(data.c);
    setEnabled(data.e);
    setSessions(data.s);
    setEnabledOn(data.platforms);
    setGenericCount(data.generic);
    setThemePreference(data.theme);
    setDark(data.theme ?? matchMedia("(prefers-color-scheme: dark)").matches);
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (mutationActive.current) return;
      const epoch = ++readEpoch.current;
      try {
        const data = await load();
        if (active && epoch === readEpoch.current) apply(data);
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
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      if (themePreference === undefined) setDark(media.matches);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [themePreference]);
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
    const source = sessions.find((s) => s.id === selected)?.source;
    if (isPlatform(source)) setDestination(source);
    setMenuId(null);
    setEditingId(null);
  }, [selected]);
  async function run(
    task: () => Promise<void | string>,
    success = "",
    failure:
      | string
      | ((error: unknown) => string) = "操作未完成，请检查本地存储空间后重试。",
  ) {
    if (mutationActive.current) return;
    setBusy(true);
    setNotice("");
    mutationActive.current = true;
    readEpoch.current++;
    try {
      const result = await task();
      apply(await load());
      setFailed(false);
      setNotice(typeof result === "string" ? result : success);
    } catch (error) {
      setFailed(true);
      setNotice(typeof failure === "function" ? failure(error) : failure);
    } finally {
      mutationActive.current = false;
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
  function sourceLabel(s: Session) {
    if (s.source !== "generic") return platformName(s.source);
    try {
      return new URL(s.sourceOrigin!).hostname;
    } catch {
      return "网页对话";
    }
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
        <div className="header-actions">
          <span className="badge">
            <span aria-hidden="true">●</span> 仅存本机
          </span>
          <button
            className="theme-toggle"
            aria-label={dark ? "切换为浅色" : "切换为深色"}
            title={dark ? "切换为浅色" : "切换为深色"}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await repo.setDarkMode(!dark);
                setDark(!dark);
                setThemePreference(!dark);
              })
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {dark ? (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                </>
              ) : (
                <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />
              )}
            </svg>
          </button>
        </div>
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
            <p>对话文字只保存在这台设备，不上传，不需要账号或 API Key。</p>
            <p>
              本地保存不改变网站的历史或数据保留规则。数据库未加密；卸载扩展或清理浏览器可能丢失记录，请按需导出。
            </p>
            <p>接续保留文字背景，不恢复附件、工具或原服务端状态。</p>
          </div>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => run(() => repo.authorize())}
          >
            我了解并同意本地保存
          </button>
          <small>同意后，点击记录当前对话即可开始。</small>
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
            {sourceLabel(current)} · {dateLabel(current.updatedAt)} ·{" "}
            {current.messages.length} 条消息
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
            <select
              className="platform-select"
              aria-label="接续平台"
              value={destination}
              onChange={(e) => {
                if (isPlatform(e.target.value)) setDestination(e.target.value);
              }}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <a
              className="button"
              href={target.url}
              aria-label={`打开 ${target.name}`}
              title={`打开 ${target.name}`}
              target="_blank"
              rel="noreferrer"
            >
              打开 ↗
            </a>
          </div>
          <small>
            已包含完整历史与接续提示词。请在目标平台先开启临时／隐身模式，再粘贴发送。
          </small>
          {longContext(current) && (
            <p className="notice">
              这段对话较长，可能超过所选模型的上下文容量。复制内容保持完整，不会自动截断。
            </p>
          )}
          <div className="messages">
            {current.messages.map((m) => (
              <article key={m.id}>
                <span className="eyebrow">
                  {m.role === "user" ? "你" : sourceLabel(current)}
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
                  ? `${[...enabledOn.map(platformName), ...(genericCount ? [`${genericCount} 段网页对话`] : [])].join("、")} 已启用`
                  : "只保存可识别的临时对话。"}
              </small>
            </div>
            <button
              className="toggle"
              aria-label={enabled ? "关闭自动保存" : "启用自动保存"}
              disabled={busy}
              onClick={() =>
                run(
                  () => repo.setAutoCapture(!enabled),
                  enabled
                    ? "已关闭自动保存"
                    : "已开启自动保存。已有聊天可点击“记录当前对话”，无需刷新。",
                )
              }
            >
              {enabled ? "关闭" : "开启"}
            </button>
          </div>
          <button
            className="record-current primary"
            disabled={busy}
            onClick={() =>
              run(
                async () => {
                  await recordCurrentPage(repo);
                  setQuery("");
                  setSelected(null);
                  listScroll.current = 0;
                  window.scrollTo(0, 0);
                },
                "已保存，后续将自动记录。",
                currentChatError,
              )
            }
          >
            记录当前对话
          </button>
          <small className="record-hint">
            已经聊到一半？保存现有可读文字，并继续记录。
          </small>
          <div className="new-chat-row">
            <select
              className="platform-select"
              aria-label="新会话平台"
              value={destination}
              onChange={(e) => {
                if (isPlatform(e.target.value)) setDestination(e.target.value);
              }}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <a
              className="button new-chat"
              href={target.url}
              target="_blank"
              rel="noreferrer"
            >
              ＋ 打开 {target.name} <span aria-hidden="true">↗</span>
            </a>
          </div>
          {destination !== "chatgpt" && (
            <small className="platform-hint">
              {target.name} 自动保存为实验支持；打开后请先开启临时／隐身模式。
            </small>
          )}
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
                          <span>
                            {sourceLabel(s)}
                            {s.excluded ? " · 已停止保存" : ""}
                          </span>
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
                <h3>{query ? "没有找到相关对话" : "还没有保存的对话"}</h3>
                <p>
                  {query
                    ? "换个关键词试试，标题和正文都可以搜。"
                    : "在聊天网页点击记录当前对话，保存成功后会出现在这里。"}
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
              记录只在此浏览器中保存，没有云同步。Claude、Grok、Gemini
              为实验适配，通用／DeepSeek
              也尚待真实账号验收。点击记录后会持续保存当前会话；清空会撤回本地保存授权，Chrome
              网站访问权限可在扩展设置另行撤回。数据库未加密，卸载扩展可能丢失数据。请在对话内导出需要备份的记录。
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
