import { platformFromUrl } from "./platforms";
import { browser } from "wxt/browser";
import type { BridgeResponse, CaptureCandidate } from "./model";
import type { StorageRepository } from "./storage";
export class CurrentChatError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function currentChatError(error: unknown) {
  const code = error instanceof CurrentChatError ? error.code : "";
  const messages: Record<string, string> = {
    "preview-expired": "网页已切换，请重新点击记录当前对话。",
    "permission-denied": "未获得此网站的访问权限，未保存。",
    "use-toolbar":
      "请先在聊天标签页点击浏览器工具栏的 KeepTemp，再点击记录当前对话。",
    "not-chatgpt":
      "请先切换到 HTTPS 聊天网页，再从浏览器工具栏打开 KeepTemp；共享链接不保存。",
    "consent-required": "请先同意本地保存，再记录当前会话。",
    "handoff-mode-unconfirmed":
      "未发送：当前页面未识别为临时聊天，请先开启临时模式。",
    "handoff-current-unsaved":
      "未切换：当前对话尚未完整保存，请先记录当前对话。",
    "handoff-streaming": "当前回复仍在生成，请等这一轮结束；没有切换或发送。",
    "handoff-loading": "页面尚未就绪，未发送；请待页面显示后再点接着聊。",
    "handoff-use-chatgpt": "请先切换到要接续的 ChatGPT 标签页。",
    "handoff-draft-exists": "未发送：当前输入框已有草稿，已保留你的文字。",
    "handoff-needs-action":
      "未发送：当前聊天页面有待处理的提示，请先完成登录或临时模式选择。",
    "handoff-page-changed":
      "未发送：当前页面或输入内容已改变，请检查当前聊天页面。",
    "handoff-cancelled": "未发送：本地授权或原记录已改变，请重新打开记录。",
    "handoff-editor-unavailable":
      "未发送：暂不支持这个输入框或发送按钮，请使用复制并接续。",
    "handoff-send-unconfirmed":
      "已点击发送，但未能确认网页接收。请检查当前聊天页面，避免重复发送。",
    "handoff-unavailable":
      "无法完成自动接续，请检查当前聊天页面；仍可使用复制并接续。",
    "handoff-busy": "这段记录正在接续，请查看当前聊天页面。",
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
    "region-missing":
      "网页中有消息，但没定位到对话区域，尚未保存；需要适配这个页面布局。",
    "roles-unknown":
      "无法可靠区分你和 AI 的消息，尚未保存；这个页面需要进一步适配。",
    "identity-missing":
      "页面缺少稳定的消息标记，暂不能可靠追踪更新，尚未保存。",
    ambiguous: "发现多段或互相冲突的消息，尚未保存；请保留当前页面。",
    "unsupported-page": "此页面不适合记录；共享链接和非 HTTPS 页面不保存。",
  };
  return messages[code] ?? "暂未保存成功。请保留当前页面，稍后重试。";
}
export async function continueInChatGPT(id: string) {
  let result: { ok: boolean; error?: string };
  try {
    result = await browser.runtime.sendMessage({
      type: "keeptemp:continue",
      id,
    });
  } catch {
    throw new CurrentChatError("handoff-unavailable");
  }
  if (!result?.ok)
    throw new CurrentChatError(result?.error ?? "handoff-unavailable");
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
        files: ["/content-scripts/capture.js"],
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
    if (result?.ok && result.saved) return result.sessionId;
    if (result?.error !== "busy")
      throw new CurrentChatError(result?.error ?? "storage-failed");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new CurrentChatError("busy");
}

export async function prepareCurrentChat(
  repo: Pick<StorageRepository, "consent">,
  onSaved?: (id: string) => void,
): Promise<CaptureCandidate | null> {
  if (!(await repo.consent())) throw new CurrentChatError("consent-required");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url)
    throw new CurrentChatError("use-toolbar");
  const url = new URL(tab.url);
  if (platformFromUrl(url)) {
    try {
      const id = await recordCurrentChat(repo);
      if (id) onSaved?.(id);
      return null;
    } catch (error) {
      // Explicit recording may fall back to a per-conversation copy; automatic temporary
      // capture still refuses normal/unknown mode. Never bypass pause/deletion/errors.
      if (
        !(error instanceof CurrentChatError) ||
        !["regular", "temporary-unknown", "no-content"].includes(error.code)
      )
        throw error;
    }
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

// Called within the explicit record action; Chrome may request this site's permission.
export async function confirmGeneric(preview: CaptureCandidate) {
  const granted = await browser.permissions
    .request({
      origins: [preview.origin + "/*"],
    })
    .catch(() => false);
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
  try {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(preview.origin),
    );
    const id =
      "keeptemp-site-" +
      [...new Uint8Array(hash)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
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
  return result.sessionId;
}

// The record button is the user's intent. Extraction/identity checks remain
// internal; there is no second application confirmation or preview screen.
export async function recordCurrentPage(
  repo: Pick<StorageRepository, "consent" | "get">,
) {
  let id: string | undefined;
  const candidate = await prepareCurrentChat(repo, (saved) => {
    id = saved;
  });
  if (candidate) {
    if (candidate.reason !== "ready")
      throw new CurrentChatError(candidate.reason);
    if (!candidate.messages.some((m) => m.text.trim()))
      throw new CurrentChatError("no-content");
    id = await confirmGeneric(candidate);
  }
  if (!id) throw new CurrentChatError("not-saved");
  const stored = await repo.get(id);
  if (!stored || stored.deleted || !stored.messages.length)
    throw new CurrentChatError("not-saved");
  return id;
}
