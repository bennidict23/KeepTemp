import { platformFromUrl } from "./platforms";
import { browser } from "wxt/browser";
import type { BridgeResponse } from "./bridge";
import type { StorageRepository } from "./storage";
import type { GenericPreview } from "./generic-preview";
export class CurrentChatError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function currentChatError(error: unknown) {
  const code = error instanceof CurrentChatError ? error.code : "";
  const messages: Record<string, string> = {
    "preview-expired": "网页已切换或预览已失效，请重新点击记录当前对话。",
    "permission-denied": "未获得此网站的访问权限，未保存。",
    "use-toolbar":
      "请先在聊天标签页点击 Chrome 工具栏的 KeepTemp，再点击记录当前对话。",
    "not-chatgpt":
      "请先切换到 HTTPS 聊天网页，再从 Chrome 工具栏打开 KeepTemp；共享链接不保存。",
    "consent-required": "请先同意本地保存，再记录当前会话。",
    "site-access":
      "无法访问当前页面。请在扩展设置中允许访问当前平台的网站；无需刷新或关闭聊天。",
    regular: "当前页面不是临时聊天，未保存。",
    "temporary-unknown":
      "暂未识别出临时模式，未保存。请确认网页显示临时、隐身或私密聊天。",
    "no-content":
      "未找到可保存的对话文字。请确认已有消息；若仍失败，请保留当前页面。",
    paused: "此会话已暂停。请从网页上的 KeepTemp 菜单恢复后重试。",
    excluded: "此会话已排除或删除，不会自动恢复保存。",
    busy: "正在保存，请稍后再试。",
  };
  return messages[code] ?? "暂未保存成功。请保留当前页面，稍后重试。";
}
export async function recordCurrentChat(
  repo: Pick<StorageRepository, "consent">,
) {
  if (!(await repo.consent())) throw new CurrentChatError("consent-required");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url)
    throw new CurrentChatError("not-chatgpt");
  const url = new URL(tab.url);
  if (!platformFromUrl(url) || url.pathname.startsWith("/share/"))
    throw new CurrentChatError("not-chatgpt");
  const tabId = tab.id;
  const send = (type: string) =>
    browser.tabs.sendMessage(tabId, { type }) as Promise<BridgeResponse>;
  try {
    const pong = await send("keeptemp:ping");
    if (!pong?.ok) throw Error();
  } catch {
    try {
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ["/content-scripts/chatgpt.js"],
      });
    } catch {
      throw new CurrentChatError("site-access");
    }
  }
  let inspection: BridgeResponse;
  try {
    inspection = await send("keeptemp:inspect-current");
  } catch {
    throw new CurrentChatError("site-access");
  }
  if (!inspection?.ok)
    throw new CurrentChatError(inspection?.error ?? "site-access");
  for (let attempt = 0; attempt < 5; attempt++) {
    let result: BridgeResponse;
    try {
      result = await send("keeptemp:record-current");
    } catch {
      throw new CurrentChatError("site-access");
    }
    if (result?.ok && result.saved) return;
    if (result?.error !== "busy")
      throw new CurrentChatError(result?.error ?? "storage-failed");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new CurrentChatError("busy");
}

export async function prepareCurrentChat(
  repo: Pick<StorageRepository, "consent">,
): Promise<GenericPreview | null> {
  if (!(await repo.consent())) throw new CurrentChatError("consent-required");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url)
    throw new CurrentChatError("use-toolbar");
  const url = new URL(tab.url);
  if (platformFromUrl(url)) {
    await recordCurrentChat(repo);
    return null;
  }
  if (
    url.protocol !== "https:" ||
    /\/(share|shared|public)(\/|$)/i.test(url.pathname)
  )
    throw new CurrentChatError("not-chatgpt");
  try {
    try {
      const pong = await browser.tabs.sendMessage(tab.id, {
        type: "keeptemp:generic-ping",
      });
      if (!pong?.ok) throw Error();
    } catch {
      await browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ["/content-scripts/generic.js"],
      });
    }
    const result = await browser.tabs.sendMessage(tab.id, {
      type: "keeptemp:generic-preview",
    });
    if (!result?.ok || !result.preview || result.preview.origin !== url.origin)
      throw Error();
    return { ...result.preview, tabId: tab.id };
  } catch {
    throw new CurrentChatError("site-access");
  }
}

// Invoke directly from the confirmation click: Chrome requires a user gesture.
export async function confirmGeneric(preview: GenericPreview) {
  const granted = await browser.permissions.request({
    origins: [preview.origin + "/*"],
  });
  if (!granted) throw new CurrentChatError("permission-denied");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (
    tab?.id !== preview.tabId ||
    !tab.url ||
    new URL(tab.url).origin !== preview.origin
  )
    throw new CurrentChatError("preview-expired");
  let result: BridgeResponse | undefined;
  for (let i = 0; i < 5; i++) {
    result = await browser.tabs.sendMessage(preview.tabId, {
      type: "keeptemp:generic-record",
      token: preview.token,
    });
    if (result?.error !== "busy") break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!result?.ok || !result.saved)
    throw new CurrentChatError(result?.error ?? "storage-failed");
  // Register only this explicitly granted origin, never a catch-all content script.
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(preview.origin),
  );
  const id =
    "keeptemp-site-" +
    [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  try {
    const existing = await browser.scripting.getRegisteredContentScripts({
      ids: [id],
    });
    if (!existing.length)
      await browser.scripting.registerContentScripts([
        {
          id,
          matches: [preview.origin + "/*"],
          js: ["content-scripts/generic.js"],
          runAt: "document_idle",
          allFrames: false,
          persistAcrossSessions: true,
        },
      ]);
  } catch {
    /* Persistence succeeded; a future reload can still be attached manually. */
  }
}
