import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { translate, type Locale } from "./i18n";

// Only empty UI containers enter the page DOM. Titles and transcripts remain
// inside extension-origin frames, sharing the existing extension database.
export function mountChatGPTHistory(ctx: ContentScriptContext) {
  let locale: Locale = "en";
  const scope = crypto.randomUUID();
  const extensionOrigin = browser.runtime.getURL("/").replace(/\/$/, "");
  const host = document.createElement("div");
  host.id = "keeptemp-history-entry";
  host.style.cssText = "padding:4px 8px;flex-shrink:0;min-width:0";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host{display:block;color:inherit;font:14px -apple-system,BlinkMacSystemFont,sans-serif}
    button{display:flex;align-items:center;gap:9px;width:100%;padding:10px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
    button:hover{background:#80808020}button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
    svg{flex:none}small{font-size:10px;opacity:.55;margin-left:auto;white-space:nowrap}
    iframe{display:block;border:0;width:100%;height:340px;max-height:calc(100dvh - 180px);color-scheme:normal}iframe[hidden]{display:none}
  </style><button type="button" aria-label="Local history · KeepTemp" aria-expanded="false">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8m-8 4h8m-8 4h4"/></svg>
    <span data-label>Local history</span><small>KeepTemp</small></button>`;
  const button = shadow.querySelector("button")!;
  let list: HTMLIFrameElement | undefined;
  let reader: HTMLIFrameElement | undefined;
  let menu: HTMLIFrameElement | undefined;
  let expanded = false;
  let disposed = false;
  let lastTheme = "";
  let readerLayout = "";
  let route = location.pathname + location.search;
  const readingStyle = document.createElement("style");
  readingStyle.textContent =
    "html[data-keeptemp-reading] #keeptemp-status,html[data-keeptemp-reading] #keeptemp-generic-status{visibility:hidden!important}";
  document.documentElement.append(readingStyle);

  const theme = () =>
    document.documentElement.classList.contains("dark") ||
    document.documentElement.dataset.theme === "dark" ||
    getComputedStyle(document.documentElement).colorScheme === "dark" ||
    (!document.documentElement.classList.contains("light") &&
      matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
  const frame = (surface: "list" | "reader" | "menu") => {
    const f = document.createElement("iframe");
    f.title = `KeepTemp · ${translate(surface === "menu" ? "Conversation actions" : surface === "list" ? "Local history" : "Saved conversation", locale)}`;
    f.allow = "clipboard-write";
    f.src = `${browser.runtime.getURL("/sidepanel.html")}?surface=${surface}&scope=${scope}&theme=${theme()}`;
    f.addEventListener("load", () => syncTheme());
    return f;
  };
  function syncTheme() {
    for (const f of [list, reader, menu])
      f?.contentWindow?.postMessage(
        { type: "keeptemp:theme", theme: theme() },
        extensionOrigin,
      );
    lastTheme = theme();
  }
  function closeReader() {
    closeMenu();
    reader?.remove();
    reader = undefined;
    readerLayout = "";
    document.documentElement.removeAttribute("data-keeptemp-reading");
  }
  function closeMenu(notify = true) {
    menu?.remove();
    menu = undefined;
    if (notify)
      list?.contentWindow?.postMessage(
        { type: "keeptemp:menu-dismiss", scope },
        extensionOrigin,
      );
  }
  function openMenu(x: number, y: number) {
    if (!list) return;
    closeMenu(false);
    const rect = list.getBoundingClientRect();
    menu = frame("menu");
    menu.id = "keeptemp-history-menu";
    const left = Math.max(
      8,
      Math.min(
        innerWidth - 224,
        rect.left + Math.min(rect.width, Math.max(0, x)) - 8,
      ),
    );
    const top = Math.max(
      8,
      Math.min(
        innerHeight - 128,
        rect.top + Math.min(rect.height, Math.max(0, y)) + 4,
      ),
    );
    menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:216px;height:116px;border:1px solid ${theme() === "dark" ? "#424242" : "#e5e5e5"};border-radius:14px;background:${theme() === "dark" ? "#212121" : "#fff"};box-shadow:0 10px 32px #0003;z-index:2147483647;color-scheme:normal`;
    document.body.append(menu);
  }
  function positionReader() {
    if (!reader) return;
    const main = [
      ...document.querySelectorAll<HTMLElement>('main,[role="main"]'),
    ].find(
      (el) =>
        el.getBoundingClientRect().width > 200 &&
        el.getBoundingClientRect().height > 100,
    );
    const rect = main?.getBoundingClientRect();
    const left = Math.max(
      0,
      rect?.left ?? host.closest("nav")?.getBoundingClientRect().right ?? 0,
    );
    const layout = `${left}:${innerWidth}:${theme()}`;
    if (readerLayout !== layout) {
      reader.style.cssText = `position:fixed;left:${left}px;top:0;width:${Math.max(0, innerWidth - left)}px;height:100dvh;border:0;z-index:2147483646;background:${theme() === "dark" ? "#212121" : "#fff"};color-scheme:normal`;
      readerLayout = layout;
    }
  }
  function openReader() {
    closeMenu();
    if (!reader) {
      reader = frame("reader");
      reader.id = "keeptemp-history-reader";
      document.body.append(reader);
    }
    document.documentElement.setAttribute("data-keeptemp-reading", "");
    positionReader();
  }
  function open() {
    mount();
    if (/^\/(share|auth|login)(\/|$)/.test(location.pathname)) return false;
    // A collapsed or changed native sidebar must not make the toolbar a dead end.
    if (!host.isConnected || host.getBoundingClientRect().width < 80) {
      host.dataset.floating = "";
      host.style.cssText =
        "position:fixed;top:64px;left:12px;width:250px;padding:8px;border:1px solid #80808040;border-radius:12px;z-index:2147483647;background:" +
        (theme() === "dark" ? "#171717;color:#eee" : "#f9f9f9;color:#171717");
      document.body.append(host);
    }
    if (!list) {
      list = frame("list");
      list.id = "keeptemp-history-list";
      shadow.append(list);
    }
    expanded = true;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    return true;
  }
  button.onclick = () => {
    if (!expanded) open();
    else {
      expanded = false;
      if (list) list.hidden = true;
      button.setAttribute("aria-expanded", "false");
      closeReader();
    }
  };
  function mount() {
    if (disposed) return;
    if (/^\/(share|auth|login)(\/|$)/.test(location.pathname)) {
      host.remove();
      closeReader();
      return;
    }
    const scroll = document.querySelector<HTMLElement>(
      "[data-app-action-sidebar-scroll]",
    );
    const nav =
      scroll?.closest("nav") ??
      document.querySelector<HTMLElement>(
        'nav[aria-label="Chat history"],nav[aria-label="聊天历史"],nav',
      );
    const target = scroll ?? nav;
    if (
      target &&
      target.getBoundingClientRect().width > 80 &&
      !target.contains(host)
    ) {
      delete host.dataset.floating;
      host.style.cssText = "padding:4px 8px;flex-shrink:0;min-width:0";
      target.prepend(host);
    }
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  mount();
  ctx.addEventListener(window, "message", (event) => {
    if (event.origin !== extensionOrigin || event.data?.scope !== scope) return;
    if (
      event.source !== list?.contentWindow &&
      event.source !== reader?.contentWindow &&
      event.source !== menu?.contentWindow
    )
      return;
    // No archive contents or IDs are carried over the page message channel.
    if (
      event.data.type === "keeptemp:history-open" &&
      event.source === list?.contentWindow
    )
      openReader();
    if (event.data.type === "keeptemp:history-close") closeReader();
    if (event.data.type === "keeptemp:menu-close") closeMenu();
    if (
      event.data.type === "keeptemp:menu-open" &&
      event.source === list?.contentWindow &&
      Number.isFinite(event.data.x) &&
      Number.isFinite(event.data.y)
    )
      openMenu(event.data.x, event.data.y);
  });
  ctx.addEventListener(document, "click", (event) => {
    if (event.composedPath().includes(host)) return;
    if (event.target instanceof Element && event.target.closest("nav a[href]"))
      closeReader();
  });
  ctx.addEventListener(window, "resize", positionReader);
  ctx.addEventListener(document, "pointerdown", (event) => {
    if (
      menu &&
      !event.composedPath().includes(menu) &&
      !event.composedPath().includes(host)
    )
      closeMenu();
  });
  ctx.addEventListener(window, "keyup", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  ctx.setInterval(() => {
    mount();
    const current = location.pathname + location.search;
    if (current !== route) {
      closeReader();
      route = current;
    }
    if (lastTheme !== theme()) syncTheme();
    positionReader();
  }, 500);
  ctx.onInvalidated(() => {
    disposed = true;
    observer.disconnect();
    closeReader();
    host.remove();
    readingStyle.remove();
  });
  function setLocale(value: Locale) {
    locale = value;
    button.setAttribute(
      "aria-label",
      translate("Local history", locale) + " · KeepTemp",
    );
    shadow.querySelector("[data-label]")!.textContent = translate(
      "Local history",
      locale,
    );
  }
  return { open, setLocale };
}
