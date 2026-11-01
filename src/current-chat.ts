import { platformFromUrl } from "./platforms";
import { browser } from "wxt/browser";
import type { BridgeResponse } from "./bridge";
import type { StorageRepository } from "./storage";
export class CurrentChatError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function currentChatError(error: unknown) {
  const code = error instanceof CurrentChatError ? error.code : "";
  const messages: Record<string, string> = {
    "not-chatgpt":
      "请先切换到 ChatGPT、Claude、Grok 或 Gemini 的聊天标签页，再打开 KeepTemp。",
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
