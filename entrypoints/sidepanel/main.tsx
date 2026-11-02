import {
  PLATFORMS,
  historyPlatformFromUrl,
  platformName,
  isPlatform,
  type PlatformId,
} from "../../src/platforms";
import { browser } from "wxt/browser";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { StorageRepository } from "../../src/storage";
import { context, json, markdown, longContext } from "../../src/recovery";
import type { Session } from "../../src/model";
import { recordCurrentPage, currentChatError } from "../../src/current-chat";
import "../../src/style.css";
import { EmbeddedHistory } from "./embedded";
import { translate, type Locale } from "../../src/i18n";
import { MenuItems, menuKeys } from "./menu";
const repo = new StorageRepository();
function dateLabel(value: number, locale: Locale) {
  const t = (value: string) => translate(value, locale);
  const d = new Date(value),
    now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return value >= today
    ? `${t("Today")} ${d.toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : value >= today - 86400000
      ? t("Yesterday")
      : d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en", {
          month: "short",
          day: "numeric",
        });
}
function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = (value: string, params?: Record<string, string | number>) =>
    translate(value, locale, params);
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
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
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
        !event.target.closest(".session-actions,.session-menu")
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
    const chinese = await repo.chineseUI();
    return { c, e, s, platforms, generic, theme, chinese };
  }
  function apply(data: Awaited<ReturnType<typeof load>>) {
    setConsent(data.c);
    setEnabled(data.e);
    setSessions(data.s);
    setEnabledOn(data.platforms);
    setGenericCount(data.generic);
    setThemePreference(data.theme);
    setLocale(data.chinese ? "zh" : "en");
    setDark(data.theme ?? matchMedia("(prefers-color-scheme: dark)").matches);
  }
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
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
          setNotice(
            t(
              "Could not read local records. Check your browser's storage settings.",
            ),
          );
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
    failure: string | ((error: unknown) => string) = t(
      "The action could not be completed. Check local storage and try again.",
    ),
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
    if (
      !confirm(
        t(
          "Delete “{title}”? This cannot be undone and does not delete the website record.",
          { title: session.title },
        ),
      )
    )
      return;
    void run(async () => {
      await repo.delete(session.id);
      setSelected((id) => (id === session.id ? null : id));
    }, t("Local conversation deleted"));
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
    if (s.source !== "generic") return t(platformName(s.source));
    try {
      return new URL(s.sourceOrigin!).hostname;
    } catch {
      return t("Web conversation");
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
          aria-label={t("Back to conversations")}
        >
          ▱ <strong>KeepTemp</strong>
        </button>
        <div className="header-actions">
          <button
            className="language-toggle"
            disabled={busy || consent === null}
            aria-label={locale === "en" ? "中文" : "English"}
            onClick={() => run(() => repo.setChineseUI(locale !== "zh"))}
          >
            {locale === "en" ? "中文" : "EN"}
          </button>
          <span className="badge">
            <span aria-hidden="true">●</span> {t("On this device")}{" "}
          </span>
          <button
            className="theme-toggle"
            aria-label={
              dark ? t("Switch to light mode") : t("Switch to dark mode")
            }
            title={dark ? t("Switch to light mode") : t("Switch to dark mode")}
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
          <p role="status">{t(notice)}</p>
          <button
            aria-label={t("Dismiss notice")}
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {consent === null ? (
        <p>{t("Opening local records…")}</p>
      ) : !consent ? (
        <section className="welcome">
          <h1>
            {t("Temporary chats,")} <br />
            {t("yours to keep.")}{" "}
          </h1>
          <p>
            {t("Chat as usual. Keep a copy on your device.")} <br />
            {t("Find it when you need it.")}{" "}
          </p>
          <div className="card">
            <h3>{t("Before you start")}</h3>
            <p>
              {t(
                "Chat text stays in this browser. No account, API key, or KeepTemp server.",
              )}
            </p>
            <p>
              {t(
                "Local saving does not change the website's history or retention. The database is not encrypted. Export important records before uninstalling or clearing browser data.",
              )}{" "}
            </p>
            <p>
              {t(
                "Continuation carries text only. It does not restore attachments, tools, or the original server session.",
              )}
            </p>
          </div>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => run(() => repo.authorize())}
          >
            {t("I understand and agree to local saving")}{" "}
          </button>
          <small>{t("Then choose Record current chat to start.")}</small>
        </section>
      ) : current ? (
        <section className="conversation-view">
          <div className="conversation-nav">
            <button className="back-button" onClick={() => setSelected(null)}>
              <span aria-hidden="true">←</span> {t("Back")}{" "}
            </button>
            <button
              className="danger delete-session"
              disabled={busy}
              onClick={() => deleteSession(current)}
            >
              {t("Delete conversation")}{" "}
            </button>
          </div>
          <div className="meta">
            {sourceLabel(current)} · {dateLabel(current.updatedAt, locale)} ·{" "}
            {current.messages.length} {t("messages")}{" "}
            {current.excluded ? t(" · Recording stopped") : ""}
          </div>
          <h1>{current.title}</h1>
          <div className="toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    await navigator.clipboard.writeText(
                      context(current, locale),
                    );
                    setCopied(true);
                  },
                  t(
                    "History and continuation prompt copied. Paste into a new temporary chat and send.",
                  ),
                  t(
                    "Could not copy. Check browser clipboard access and try again.",
                  ),
                )
              }
            >
              {copied ? t("Copied ✓") : t("Copy & continue")}
            </button>
            <select
              className="platform-select"
              aria-label={t("Continue with")}
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
              aria-label={t("Open {platform}", { platform: target.name })}
              title={t("Open {platform}", { platform: target.name })}
              target="_blank"
              rel="noreferrer"
            >
              {t("Open ↗")}{" "}
            </a>
          </div>
          <small>
            {t(
              "Includes the full conversation and a continuation prompt. Enable temporary or incognito mode on the destination, then paste and send.",
            )}{" "}
          </small>
          {longContext(current, locale) && (
            <p className="notice">
              {t(
                "This conversation is long and may exceed the destination model's context limit. The copy stays complete; nothing is truncated.",
              )}{" "}
            </p>
          )}
          <div className="messages">
            {current.messages.map((m) => (
              <article key={m.id}>
                <span className="eyebrow">
                  {m.role === "user" ? t("You") : sourceLabel(current)}
                </span>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
          <details className="tools">
            <summary>{t("Conversation options")}</summary>
            <div className="tool-actions">
              <button onClick={() => exportFile(current, "md")}>
                {t("Export Markdown")}{" "}
              </button>
              <button onClick={() => exportFile(current, "json")}>
                {t("Export JSON")}{" "}
              </button>
              {!current.excluded && current.source !== "manual" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => repo.exclude(current.id),
                      t("Recording stopped. Your existing copy is kept."),
                    )
                  }
                >
                  {t("Stop recording this conversation")}{" "}
                </button>
              )}
            </div>
          </details>
        </section>
      ) : (
        <section>
          <div className="shelf-heading">
            <div>
              <h1>{t("Your chats")}</h1>
            </div>
            <span className="count">
              {sessions.length} {t("chats")}
            </span>
          </div>
          <div className="capture-strip" data-enabled={enabled}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>
                {enabled ? t("Auto-save is on") : t("Auto-save is off")}
              </strong>
              <small>
                {enabled
                  ? t("{platforms} enabled", {
                      platforms: [
                        ...enabledOn.map(platformName),
                        ...(genericCount
                          ? [
                              t("{count} web conversations", {
                                count: genericCount,
                              }),
                            ]
                          : []),
                      ].join(locale === "zh" ? "、" : ", "),
                    })
                  : t(
                      "Only identifiable temporary chats are saved automatically.",
                    )}
              </small>
            </div>
            <button
              className="toggle"
              aria-label={
                enabled ? t("Turn off auto-save") : t("Enable auto-save")
              }
              disabled={busy}
              onClick={() =>
                run(
                  () => repo.setAutoCapture(!enabled),
                  enabled
                    ? t("Auto-save turned off")
                    : t(
                        "Auto-save enabled. Use Record current chat for a conversation already in progress; no refresh needed.",
                      ),
                )
              }
            >
              {enabled ? t("Off") : t("On")}
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
                t("Saved. New messages will keep updating."),
                currentChatError,
              )
            }
          >
            {t("Record current chat")}{" "}
          </button>
          <small className="record-hint">
            {t(
              "Already chatting? Save the readable text and keep recording.",
            )}{" "}
          </small>
          <div className="new-chat-row">
            <select
              className="platform-select"
              aria-label={t("New chat platform")}
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
              {t("＋ Open")} {target.name} <span aria-hidden="true">↗</span>
            </a>
          </div>
          {destination !== "chatgpt" && (
            <small className="platform-hint">
              {target.name}{" "}
              {t(
                "Auto-save is experimental. Enable temporary or incognito mode on the website first.",
              )}{" "}
            </small>
          )}
          <input
            aria-label={t("Full-text search")}
            type="search"
            placeholder={t("Search conversations…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="list" aria-label={t("Local conversations")}>
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
                          t("Name updated"),
                          t(
                            "Could not rename. Use 1–100 characters and check that the conversation still exists.",
                          ),
                        );
                      }}
                    >
                      <label htmlFor="session-name">
                        {t("Rename conversation")}
                      </label>
                      <input
                        id="session-name"
                        aria-label={t("Conversation name")}
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
                          {t("Save name")}{" "}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            focusActions(s.id);
                          }}
                        >
                          {t("Cancel")}{" "}
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
                            {s.excluded ? t(" · Recording stopped") : ""}
                          </span>
                          <time
                            dateTime={new Date(s.updatedAt).toISOString()}
                            title={new Date(s.updatedAt).toLocaleString()}
                          >
                            {dateLabel(s.updatedAt, locale)}
                          </time>
                        </span>
                        <strong>{s.title}</strong>
                        <span className="preview">
                          {s.messages.at(-1)?.text.slice(0, 100)}
                        </span>
                        <span className="message-count">
                          {s.messages.length} {t("messages")}{" "}
                          <span aria-hidden="true">→</span>
                        </span>
                      </button>
                      <div className="session-actions">
                        <button
                          id={`session-actions-${s.id}`}
                          className="more-trigger"
                          aria-label={t("Conversation actions: {title}", {
                            title: s.title,
                          })}
                          aria-haspopup="menu"
                          aria-expanded={menuId === s.id}
                          aria-controls={`session-menu-${s.id}`}
                          disabled={busy}
                          onClick={(event) => {
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              left: Math.max(
                                8,
                                Math.min(innerWidth - 220, rect.right - 210),
                              ),
                              top: Math.max(
                                8,
                                Math.min(innerHeight - 126, rect.bottom + 6),
                              ),
                            });
                            setMenuId(menuId === s.id ? null : s.id);
                          }}
                        >
                          ⋯
                        </button>
                        {menuId === s.id &&
                          createPortal(
                            <div
                              ref={menuRef}
                              className="session-menu"
                              style={menuPosition}
                              id={`session-menu-${s.id}`}
                              role="menu"
                              aria-label={t("Conversation actions")}
                              onKeyDown={menuKeys}
                            >
                              <MenuItems
                                locale={locale}
                                deleteLabel="Delete"
                                onRename={() => {
                                  setMenuId(null);
                                  setEditingTitle(s.title);
                                  setEditingId(s.id);
                                }}
                                onDelete={() => deleteSession(s)}
                              />
                            </div>,
                            document.body,
                          )}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="empty">
                <div className="empty-icon">▱</div>
                <h3>
                  {query
                    ? t("No matching conversations")
                    : t("No saved conversations yet")}
                </h3>
                <p>
                  {query
                    ? t(
                        "Try another keyword. Titles and message text are searchable.",
                      )
                    : t(
                        "Choose Record current chat on the chat page. Saved conversations appear here.",
                      )}
                </p>
                {query && (
                  <button className="link" onClick={() => setQuery("")}>
                    {t("Clear search")}{" "}
                  </button>
                )}
              </div>
            )}
          </div>
          <details className="tools">
            <summary>{t("Local data & privacy")}</summary>
            <p className="settings-note">
              {t(
                "Records stay in this browser with no cloud sync. Claude, Grok, Gemini, generic sites, and DeepSeek have experimental adapters awaiting broader live-account validation. Recording keeps updating this conversation. Clear data revokes local capture consent; website access can be revoked separately in extension settings. The database is not encrypted, and uninstalling may remove it. Export important records for backup.",
              )}{" "}
            </p>
            <button
              className="danger link"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    t(
                      "Clear all local records and revoke saving consent? This cannot be undone. Exports and website records are kept.",
                    ),
                  )
                )
                  void run(async () => {
                    await repo.reset();
                    setSelected(null);
                    setQuery("");
                  }, t("All local records and consent cleared"));
              }}
            >
              {t("Clear all data and revoke consent")}{" "}
            </button>
          </details>
          <p className="local-note">
            {t("Local only · No cloud sync · Delete anytime")}
          </p>
        </section>
      )}
    </main>
  );
}
const params = new URLSearchParams(location.search);
const surface = params.get("surface");
const scope = params.get("scope") ?? "";
const embeddedPlatform = PLATFORMS.find(
  (p) => p.id === (params.get("platform") ?? "chatgpt"),
);
const pagePlatform =
  embeddedPlatform && historyPlatformFromUrl(embeddedPlatform.origin);
createRoot(document.getElementById("root")!).render(
  window.parent !== window &&
    pagePlatform &&
    (surface === "list" || surface === "reader" || surface === "menu") &&
    /^[a-zA-Z0-9-]{20,80}$/.test(scope) ? (
    <EmbeddedHistory
      repo={repo}
      platform={pagePlatform}
      surface={surface}
      scope={scope}
      theme={params.get("theme") ?? "light"}
    />
  ) : (
    <App />
  ),
);
