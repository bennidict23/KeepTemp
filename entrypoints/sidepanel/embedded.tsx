import React, { useEffect, useRef, useState } from "react";
import type { StorageRepository } from "../../src/storage";
import type { Session } from "../../src/model";
import { platformName, type HistoryPlatform } from "../../src/platforms";
import { context, json, longContext, markdown } from "../../src/recovery";
import { currentChatError, recordCurrentPage } from "../../src/current-chat";
import "./embedded.css";
import { translate, type Locale } from "../../src/i18n";
import { MenuItems, menuKeys } from "./menu";

type Props = {
  repo: StorageRepository;
  surface: "list" | "reader" | "menu";
  scope: string;
  theme: string;
  platform: HistoryPlatform;
};
type Confirmation = { kind: "delete"; session: Session } | { kind: "clear" };

export function EmbeddedHistory({
  repo,
  surface,
  scope,
  theme,
  platform,
}: Props) {
  const [locale, setLocale] = useState<Locale>("en");
  const t = (value: string, params?: Record<string, string | number>) =>
    translate(value, locale, params);
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
  const menuSelection = useRef<string | null>(null);
  const epoch = useRef(0);
  const mutating = useRef(false);
  const live = useRef(true);
  const current = sessions.find((s) => s.id === selected);
  const tellHost = (type: string) =>
    parent.postMessage({ type, scope }, platform.origin);
  const close = () => tellHost("keeptemp:history-close");
  const closeMenu = () => tellHost("keeptemp:menu-close");

  async function refresh() {
    const read = ++epoch.current;
    const [allowed, automatic, records, appearance, chinese] =
      await Promise.all([
        repo.consent(),
        repo.autoCapture(platform.id),
        repo.list(),
        repo.darkMode(),
        repo.chineseUI(),
      ]);
    if (!live.current || read !== epoch.current) return;
    setConsent(allowed);
    setEnabled(automatic);
    setDark(appearance);
    setLocale(chinese ? "zh" : "en");
    setSessions(
      records.filter((s) => s.source === "chatgpt" || s.source === "claude"),
    );
  }
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
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
      if (event.source !== parent || event.origin !== platform.origin) return;
      if (event.data?.type === "keeptemp:menu-dismiss") setMenu(null);
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
      if (
        data?.type === "menu-ready" &&
        surface === "list" &&
        menuSelection.current
      )
        bus.postMessage({ type: "menu-select", id: menuSelection.current });
      if (
        data?.type === "menu-select" &&
        surface === "menu" &&
        typeof data.id === "string"
      )
        setSelected(data.id);
      if (
        data?.type === "menu-action" &&
        surface === "list" &&
        typeof data.id === "string" &&
        data.id.length < 1200
      ) {
        void repo
          .get(data.id)
          .then((session) => {
            if (
              !session ||
              session.deleted ||
              (session.source !== "chatgpt" && session.source !== "claude")
            )
              return;
            setMenu(null);
            if (data.action === "rename") {
              setTitle(session.title);
              setEditing(session.id);
            }
            if (data.action === "delete")
              setConfirmation({ kind: "delete", session });
          })
          .catch(() => {});
      }
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
    if (surface === "menu") bus.postMessage({ type: "menu-ready" });
    const poll = () => {
      if (!mutating.current)
        void refresh().catch(() => {
          if (live.current) {
            setFailed(true);
            setNotice(t("Could not read local records. Please try again."));
          }
        });
    };
    poll();
    const timer = setInterval(poll, 1000);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (surface === "menu") closeMenu();
        setMenu(null);
        setEditing(null);
        setConfirmation(null);
      }
    };
    // Remove a menu frame after the complete keystroke, so keyup has a live
    // destination even when Escape closes the focused frame itself.
    window.addEventListener("keyup", escape);
    return () => {
      live.current = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(nextFrame);
      clearTimeout(interactionTimer);
      epoch.current++;
      clearInterval(timer);
      bus.close();
      window.removeEventListener("message", updateTheme);
      window.removeEventListener("keyup", escape);
    };
  }, [surface, scope, theme, platform]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected]);
  useEffect(() => {
    if (surface === "menu" && interactive && selected)
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [surface, interactive, selected]);

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
      setNotice(
        record
          ? currentChatError(error)
          : t("The action could not be completed. Please try again."),
      );
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
    const text = context(session, locale);
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
      {t(notice)}
    </p>
  );
  // Do not expose clickable controls until the embedded frame has painted.
  if (!interactive || (surface === "menu" && !selected))
    return (
      <div className={`embedded-history embedded-${surface}`}>
        <p className="embedded-caption">{t("Loading…")}</p>
      </div>
    );
  if (surface === "menu")
    return (
      <div
        className="embedded-history menu-surface"
        role="menu"
        aria-label={t("Conversation actions")}
        onKeyDown={menuKeys}
      >
        <MenuItems
          locale={locale}
          onRename={() => {
            channel.current?.postMessage({
              type: "menu-action",
              action: "rename",
              id: selected,
            });
            closeMenu();
          }}
          onDelete={() => {
            channel.current?.postMessage({
              type: "menu-action",
              action: "delete",
              id: selected,
            });
            closeMenu();
          }}
        />
      </div>
    );
  return (
    <div
      className={`embedded-history embedded-${surface}`}
      onPointerDown={(event) => {
        if (
          surface === "list" &&
          menu &&
          !(event.target as Element).closest(".embedded-row")
        )
          closeMenu();
      }}
    >
      {surface === "reader" ? (
        <>
          <header className="embedded-header">
            <button
              disabled={!interactive}
              onClick={close}
              aria-label={t("Back to {platform}", { platform: platform.name })}
            >
              ← {t("Back to {platform}", { platform: platform.name })}{" "}
            </button>
            <span>
              {current && `${platformName(current.source)} · `}
              {t("Local copy · KeepTemp")}
            </span>
            <button
              aria-label={locale === "en" ? "中文" : "English"}
              disabled={busy}
              onClick={() => run(() => repo.setChineseUI(locale !== "zh"))}
            >
              {locale === "en" ? "中文" : "EN"}
            </button>
            {current && (
              <button
                disabled={busy || !interactive}
                onClick={() =>
                  setConfirmation({ kind: "delete", session: current })
                }
              >
                {t("Delete local copy")}{" "}
              </button>
            )}
          </header>
          {status}
          {!consent ? (
            <div className="embedded-empty">
              {t("Agree to local saving in the sidebar first.")}
            </div>
          ) : !current ? (
            <div className="embedded-empty">
              {selected
                ? t("This local record no longer exists.")
                : t("Opening local record…")}
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
                        t(
                          "Full history and continuation prompt copied. Paste into a new chat and send.",
                        ),
                      )
                    }
                  >
                    {t("Copy & continue")}{" "}
                  </button>
                  <a href={platform.url} target="_blank" rel="noreferrer">
                    {platform.id === "chatgpt"
                      ? t("New temporary chat ↗")
                      : t("New Claude chat ↗")}{" "}
                  </a>
                  <details>
                    <summary>{t("Export")}</summary>
                    <button onClick={() => download(current, "md")}>
                      Markdown
                    </button>
                    <button onClick={() => download(current, "json")}>
                      JSON
                    </button>
                  </details>
                </div>
                {platform.id === "claude" && (
                  <p className="embedded-caption">
                    {t("Enable incognito mode on Claude before pasting.")}
                  </p>
                )}
                <p className="embedded-caption">
                  {t(
                    "This is a local text copy. Continue in a new chat; the original server session is not restored.",
                  )}{" "}
                </p>
                {longContext(current, locale) && (
                  <p className="embedded-caption">
                    {t(
                      "This record is long. The destination model may not accept all of it; the copy is never truncated.",
                    )}{" "}
                  </p>
                )}
                <section
                  className="embedded-messages"
                  aria-label={t("Saved conversation")}
                >
                  {current.messages.map((m) => (
                    <article
                      className={`embedded-message embedded-${m.role}`}
                      key={m.id}
                    >
                      <span>
                        {m.role === "user"
                          ? t("You")
                          : platformName(current.source)}
                      </span>
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
          <div className="embedded-language">
            <button
              aria-label={locale === "en" ? "中文" : "English"}
              disabled={busy}
              onClick={() => run(() => repo.setChineseUI(locale !== "zh"))}
            >
              {locale === "en" ? "中文" : "EN"}
            </button>
          </div>
          {consent === null ? (
            <p className="embedded-caption">{t("Opening local history…")}</p>
          ) : !consent ? (
            <div className="embedded-onboarding">
              <p>{t("Keep a copy for yourself.")}</p>
              <p className="embedded-caption">
                {t(
                  "Text stays in this browser. It does not hide website history. The database is not encrypted; uninstalling may remove records.",
                )}{" "}
              </p>
              <button
                className="embedded-primary"
                disabled={busy || !interactive}
                onClick={() =>
                  run(async () => {
                    await repo.authorize();
                    await repo.setAutoCapture(true, platform.id);
                  }, t("Temporary chat recording enabled"))
                }
              >
                {t("Agree and enable local recording")}{" "}
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
                      t("Saved to local history"),
                      true,
                    )
                  }
                >
                  {t("＋ Record current chat")}{" "}
                </button>
                <button
                  disabled={busy || !interactive}
                  title={t("Automatically record temporary chats")}
                  aria-label={
                    enabled
                      ? t("Pause temporary auto-recording")
                      : t("Enable temporary auto-recording")
                  }
                  onClick={() =>
                    run(() => repo.setAutoCapture(!enabled, platform.id))
                  }
                >
                  {enabled ? t("Pause") : t("Enable")}
                </button>
              </div>
              <input
                type="search"
                aria-label={t("Search local history")}
                placeholder={t("Search local history")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="embedded-rows">
                {!matched.length && (
                  <p className="embedded-caption">
                    {query
                      ? t("No matching records")
                      : t(
                          "Saved ChatGPT and Claude conversations appear here.",
                        )}
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
                          aria-label={t("Conversation name")}
                          autoFocus
                          maxLength={100}
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                        <button
                          disabled={busy || !interactive || !title.trim()}
                        >
                          {t("Save")}{" "}
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          className="embedded-row-title"
                          aria-label={s.title}
                          onClick={() => open(s)}
                          title={s.title}
                        >
                          <span>{s.title}</span>
                          <small className="embedded-source">
                            {platformName(s.source)}
                          </small>
                        </button>
                        <button
                          aria-label={t("Conversation actions: {title}", {
                            title: s.title,
                          })}
                          aria-expanded={menu === s.id}
                          aria-haspopup="menu"
                          onClick={(event) => {
                            if (menu === s.id) {
                              setMenu(null);
                              closeMenu();
                              return;
                            }
                            menuSelection.current = s.id;
                            setMenu(s.id);
                            channel.current?.postMessage({
                              type: "menu-select",
                              id: s.id,
                            });
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            parent.postMessage(
                              {
                                type: "keeptemp:menu-open",
                                scope,
                                x: rect.left,
                                y: rect.bottom,
                              },
                              platform.origin,
                            );
                          }}
                        >
                          ⋯
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <details className="embedded-settings">
                <summary>{t("Local only · Settings")}</summary>
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
                  {(dark === undefined ? pageTheme === "dark" : dark)
                    ? t("Switch to light mode")
                    : t("Switch to dark mode")}
                </button>
                <p>
                  {t(
                    "Temporary mode is controlled by the website. You can also save ordinary chats manually; a local copy does not delete website history. Continuation carries text only. Export important records for backup.",
                  )}{" "}
                </p>
                <button
                  disabled={busy || !interactive}
                  onClick={() => setConfirmation({ kind: "clear" })}
                >
                  {t("Clear all KeepTemp local data")}{" "}
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
            confirmation.kind === "delete"
              ? t("Delete local copy")
              : t("Clear all local data")
          }
        >
          <p>
            {confirmation.kind === "delete"
              ? t(
                  "Delete “{title}”? This only removes the local copy and cannot be undone.",
                  { title: confirmation.session.title },
                )
              : t(
                  "Clear local records and consent for every platform? This cannot be undone.",
                )}
          </p>
          <div>
            <button
              disabled={busy || !interactive}
              onClick={() => setConfirmation(null)}
            >
              {t("Cancel")}{" "}
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
                    ? t("Local copy deleted")
                    : t("All local data cleared"),
                )
              }
            >
              {t(
                confirmation.kind === "delete"
                  ? "Confirm delete"
                  : "Confirm clear",
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
