import React, { useEffect, useRef, useState } from "react";
import type { StorageRepository } from "../../src/storage";
import type { Session } from "../../src/model";
import { context, json, longContext, markdown } from "../../src/recovery";
import { currentChatError, recordCurrentPage } from "../../src/current-chat";
import "./embedded.css";

type Props = {
  repo: StorageRepository;
  surface: "list" | "reader";
  scope: string;
  theme: string;
};
type Confirmation = { kind: "delete"; session: Session } | { kind: "clear" };

export function EmbeddedHistory({ repo, surface, scope, theme }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pageTheme, setPageTheme] = useState(theme);
  const [dark, setDark] = useState<boolean | undefined>();
  const [interactive, setInteractive] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const selection = useRef<string | null>(null);
  const epoch = useRef(0);
  const mutating = useRef(false);
  const live = useRef(true);
  const current = sessions.find((s) => s.id === selected);
  const tellHost = (type: string) =>
    parent.postMessage({ type, scope }, "https://chatgpt.com");
  const close = () => tellHost("keeptemp:history-close");

  async function refresh() {
    const read = ++epoch.current;
    const [allowed, automatic, records, appearance] = await Promise.all([
      repo.consent(),
      repo.autoCapture("chatgpt"),
      repo.list(),
      repo.darkMode(),
    ]);
    if (!live.current || read !== epoch.current) return;
    setConsent(allowed);
    setEnabled(automatic);
    setDark(appearance);
    setSessions(records.filter((s) => s.source === "chatgpt"));
  }
  useEffect(() => {
    document.documentElement.dataset.theme =
      dark === undefined ? pageTheme : dark ? "dark" : "light";
  }, [pageTheme, dark]);
  useEffect(() => {
    live.current = true;
    // Let the newly embedded frame paint before accepting a first click; an
    // immediate click during frame composition can land on its host instead.
    let nextFrame = 0;
    let interactionTimer = 0;
    const firstFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        interactionTimer = window.setTimeout(() => setInteractive(true), 120);
      });
    });
    document.documentElement.dataset.embeddedSurface = surface;
    const updateTheme = (event: MessageEvent) => {
      if (event.source !== parent || event.origin !== "https://chatgpt.com")
        return;
      if (
        event.data?.type === "keeptemp:theme" &&
        ["light", "dark"].includes(event.data.theme)
      )
        setPageTheme(event.data.theme);
    };
    window.addEventListener("message", updateTheme);
    const bus = new BroadcastChannel(`keeptemp-history:${scope}`);
    channel.current = bus;
    bus.onmessage = ({ data }) => {
      if (data?.type === "ready" && surface === "list" && selection.current)
        bus.postMessage({ type: "select", id: selection.current });
      if (
        data?.type === "select" &&
        surface === "reader" &&
        typeof data.id === "string" &&
        data.id.length < 1200
      ) {
        setNotice("");
        setSelected(data.id);
      }
      if (data?.type === "changed") void refresh().catch(() => {});
    };
    if (surface === "reader") bus.postMessage({ type: "ready" });
    const resize = new ResizeObserver(() => {
      if (surface === "list")
        parent.postMessage(
          {
            type: "keeptemp:history-size",
            scope,
            height:
              document
                .querySelector(".embedded-history")!
                .getBoundingClientRect().height + 8,
          },
          "https://chatgpt.com",
        );
    });
    const root = document.querySelector(".embedded-history");
    if (root && surface === "list") resize.observe(root);
    const poll = () => {
      if (!mutating.current)
        void refresh().catch(() => {
          if (live.current) {
            setFailed(true);
            setNotice("暂时无法读取本机记录，请稍后重试。");
          }
        });
    };
    poll();
    const timer = setInterval(poll, 1000);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setEditing(null);
        setConfirmation(null);
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      live.current = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(nextFrame);
      clearTimeout(interactionTimer);
      epoch.current++;
      clearInterval(timer);
      bus.close();
      resize.disconnect();
      window.removeEventListener("message", updateTheme);
      window.removeEventListener("keydown", escape);
    };
  }, [surface, scope, theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected]);

  async function run(
    task: () => Promise<unknown>,
    success = "",
    record = false,
  ) {
    if (mutating.current) return;
    mutating.current = true;
    epoch.current++;
    setBusy(true);
    setNotice("");
    try {
      await task();
      await refresh();
      channel.current?.postMessage({ type: "changed" });
      setFailed(false);
      setNotice(success);
    } catch (error) {
      setFailed(true);
      setNotice(record ? currentChatError(error) : "操作未完成，请稍后重试。");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  function open(session: Session) {
    selection.current = session.id;
    setMenu(null);
    channel.current?.postMessage({ type: "select", id: session.id });
    tellHost("keeptemp:history-open");
  }
  function download(session: Session, kind: "md" | "json") {
    const url = URL.createObjectURL(
      new Blob([kind === "md" ? markdown(session) : json(session)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `keeptemp-${session.createdAt}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(session: Session) {
    // A page may deny the asynchronous Clipboard API to embedded frames.
    // This synchronous, user-initiated copy stays inside the extension frame.
    const text = context(session);
    const focused = document.activeElement;
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(field);
    field.focus();
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      /* Try the modern API below. */
    }
    field.remove();
    if (focused instanceof HTMLElement) focused.focus();
    if (!copied) await navigator.clipboard.writeText(text);
  }
  const matched = sessions.filter((s) =>
    `${s.title}\n${s.messages.map((m) => m.text).join("\n")}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const status = notice && (
    <p className="embedded-notice" role="status" data-error={failed}>
      {notice}
    </p>
  );
  return (
    <div
      className={`embedded-history embedded-${surface}`}
      inert={!interactive}
    >
      {surface === "reader" ? (
        <>
          <header className="embedded-header">
            <button
              disabled={!interactive}
              onClick={close}
              aria-label="返回 ChatGPT"
            >
              ← 返回 ChatGPT
            </button>
            <span>本机记录 · KeepTemp</span>
            {current && (
              <button
                disabled={busy || !interactive}
                onClick={() =>
                  setConfirmation({ kind: "delete", session: current })
                }
              >
                删除本机记录
              </button>
            )}
          </header>
          {status}
          {!consent ? (
            <div className="embedded-empty">请先在左侧同意本地保存。</div>
          ) : !current ? (
            <div className="embedded-empty">
              {selected ? "这条本机记录已不存在。" : "正在打开本机记录…"}
            </div>
          ) : (
            <>
              <div className="embedded-reading" key={current.id}>
                <h1>{current.title}</h1>
                <div className="embedded-reading-tools">
                  <button
                    className="embedded-primary"
                    disabled={busy || !interactive}
                    onClick={() =>
                      run(
                        () => copy(current),
                        "已复制完整记录与接续提示词。请在新聊天中粘贴发送。",
                      )
                    }
                  >
                    复制并接续
                  </button>
                  <a
                    href="https://chatgpt.com/?temporary-chat=true"
                    target="_blank"
                    rel="noreferrer"
                  >
                    新临时聊天 ↗
                  </a>
                  <details>
                    <summary>导出</summary>
                    <button onClick={() => download(current, "md")}>
                      Markdown
                    </button>
                    <button onClick={() => download(current, "json")}>
                      JSON
                    </button>
                  </details>
                </div>
                <p className="embedded-caption">
                  这是本机保存的文字记录。接续会使用新聊天，不恢复原服务端会话。
                </p>
                {longContext(current) && (
                  <p className="embedded-caption">
                    这段记录较长，目标模型可能无法接收全部内容；复制不会自动截断。
                  </p>
                )}
                <section
                  className="embedded-messages"
                  aria-label="已保存的对话"
                >
                  {current.messages.map((m) => (
                    <article
                      className={`embedded-message embedded-${m.role}`}
                      key={m.id}
                    >
                      <span>{m.role === "user" ? "你" : "ChatGPT"}</span>
                      <p>{m.text}</p>
                    </article>
                  ))}
                </section>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {consent === null ? (
            <p className="embedded-caption">正在打开本机历史…</p>
          ) : !consent ? (
            <div className="embedded-onboarding">
              <p>给自己的对话留一份。</p>
              <p className="embedded-caption">
                文字保存在当前浏览器，不上传。不会隐藏网站历史；数据库未加密，卸载扩展可能丢失记录。
              </p>
              <button
                className="embedded-primary"
                disabled={busy || !interactive}
                onClick={() =>
                  run(async () => {
                    await repo.authorize();
                    await repo.setAutoCapture(true, "chatgpt");
                  }, "已开启临时聊天记录")
                }
              >
                同意并开启本地记录
              </button>
            </div>
          ) : (
            <>
              <div className="embedded-list-tools">
                <button
                  disabled={busy || !interactive}
                  onClick={() =>
                    run(
                      async () => {
                        await recordCurrentPage(repo);
                        setQuery("");
                      },
                      "已存入本机历史",
                      true,
                    )
                  }
                >
                  ＋ 记录当前对话
                </button>
                <button
                  disabled={busy || !interactive}
                  title="自动记录临时聊天"
                  aria-label={enabled ? "暂停临时自动记录" : "开启临时自动记录"}
                  onClick={() =>
                    run(() => repo.setAutoCapture(!enabled, "chatgpt"))
                  }
                >
                  {enabled ? "暂停" : "开启"}
                </button>
              </div>
              <input
                type="search"
                aria-label="搜索本机历史"
                placeholder="搜索本机历史"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="embedded-rows">
                {!matched.length && (
                  <p className="embedded-caption">
                    {query
                      ? "没有找到相关记录"
                      : "保存的 ChatGPT 对话会出现在这里。"}
                  </p>
                )}
                {matched.map((s) => (
                  <div className="embedded-row" key={s.id}>
                    {editing === s.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            await repo.rename(s.id, title);
                            setEditing(null);
                          });
                        }}
                      >
                        <input
                          aria-label="会话名称"
                          autoFocus
                          maxLength={100}
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                        <button
                          disabled={busy || !interactive || !title.trim()}
                        >
                          保存
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          className="embedded-row-title"
                          onClick={() => open(s)}
                          title={s.title}
                        >
                          {s.title}
                        </button>
                        <button
                          aria-label={`会话操作：${s.title}`}
                          aria-expanded={menu === s.id}
                          onClick={() => setMenu(menu === s.id ? null : s.id)}
                        >
                          ⋯
                        </button>
                        {menu === s.id && (
                          <div className="embedded-menu" role="menu">
                            <button
                              role="menuitem"
                              onClick={() => {
                                setTitle(s.title);
                                setEditing(s.id);
                                setMenu(null);
                              }}
                            >
                              重命名
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setMenu(null);
                                setConfirmation({ kind: "delete", session: s });
                              }}
                            >
                              删除本机记录
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <details className="embedded-settings">
                <summary>仅本机 · 设置</summary>
                <button
                  disabled={busy || !interactive}
                  onClick={() =>
                    run(() =>
                      repo.setDarkMode(
                        document.documentElement.dataset.theme !== "dark",
                      ),
                    )
                  }
                >
                  切换为
                  {(dark === undefined ? pageTheme === "dark" : dark)
                    ? "浅色"
                    : "深色"}
                </button>
                <p>
                  临时模式需在网站开启。普通聊天可以主动另存；本地保存不会删除网站历史。接续只保留文字，重要内容请导出备份。
                </p>
                <button
                  disabled={busy || !interactive}
                  onClick={() => setConfirmation({ kind: "clear" })}
                >
                  清空 KeepTemp 全部本机数据
                </button>
              </details>
            </>
          )}
          {status}
        </>
      )}
      {confirmation && (
        <div
          className="embedded-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={
            confirmation.kind === "delete" ? "删除本机记录" : "清空全部本机数据"
          }
        >
          <p>
            {confirmation.kind === "delete"
              ? `删除“${confirmation.session.title}”？只删除本机副本，无法撤销。`
              : "清空所有平台的本机记录和本地保存授权？此操作无法撤销。"}
          </p>
          <div>
            <button
              disabled={busy || !interactive}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              className="embedded-primary"
              disabled={busy || !interactive}
              onClick={() =>
                run(
                  async () => {
                    if (confirmation.kind === "delete")
                      await repo.delete(confirmation.session.id);
                    else await repo.reset();
                    setConfirmation(null);
                  },
                  confirmation.kind === "delete"
                    ? "已删除本机记录"
                    : "已清空全部本机数据",
                )
              }
            >
              确认{confirmation.kind === "delete" ? "删除" : "清空"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
