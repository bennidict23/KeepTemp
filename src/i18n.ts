export type Locale = "en" | "zh";

// English is the source language. Only interface strings go through this table;
// conversation titles, messages and copied transcripts are never translated.
const chinese: Record<string, string> = {
  Yesterday: "昨天",
  "Could not read local records. Check your browser's storage settings.":
    "暂时无法读取本地记录，请检查浏览器存储设置。",
  "The action could not be completed. Check local storage and try again.":
    "操作未完成，请检查本地存储空间后重试。",
  "Local conversation deleted": "已删除本地对话",
  "Web conversation": "网页对话",
  "Back to conversations": "返回对话列表",
  "On this device": "仅存本机",
  "Switch to light mode": "切换为浅色",
  "Switch to dark mode": "切换为深色",
  "Dismiss notice": "关闭提示",
  "Opening local records…": "正在打开本地记录…",
  "Temporary chats,": "临时对话，",
  "yours to keep.": "留在你手中。",
  "Chat as usual. Keep a copy on your device.": "照常聊天，自动留一份在本机。",
  "Find it when you need it.": "想继续时，随时找回。",
  "Before you start": "开始之前",
  "Chat text stays in this browser. No account, API key, or KeepTemp server.":
    "对话文字只保存在这台设备，不上传，不需要账号或 API Key。",
  "Local saving does not change the website's history or retention. The database is not encrypted. Export important records before uninstalling or clearing browser data.":
    "本地保存不改变网站的历史或数据保留规则。数据库未加密；卸载扩展或清理浏览器可能丢失记录，请按需导出。",
  "Continuation carries text only. It does not restore attachments, tools, or the original server session.":
    "接续保留文字背景，不恢复附件、工具或原服务端状态。",
  "I understand and agree to local saving": "我了解并同意本地保存",
  "Then choose Record current chat to start.":
    "同意后，点击记录当前对话即可开始。",
  Back: "返回",
  "Delete conversation": "删除会话",
  messages: "条消息",
  " · Recording stopped": "· 已停止保存",
  "History and continuation prompt copied. Paste into a new temporary chat and send.":
    "已复制历史与接续提示词。打开新临时会话，粘贴发送即可。",
  "Could not copy. Check browser clipboard access and try again.":
    "未能写入剪贴板，请检查浏览器权限后重试。",
  "Copied ✓": "已复制 ✓",
  "Copy & continue": "复制并接续",
  "Continue with": "接续平台",
  "Open ↗": "打开 ↗",
  "Includes the full conversation and a continuation prompt. Enable temporary or incognito mode on the destination, then paste and send.":
    "已包含完整历史与接续提示词。请在目标平台先开启临时／隐身模式，再粘贴发送。",
  "This conversation is long and may exceed the destination model's context limit. The copy stays complete; nothing is truncated.":
    "这段对话较长，可能超过所选模型的上下文容量。复制内容保持完整，不会自动截断。",
  You: "你",
  "Conversation options": "管理这段对话",
  "Export Markdown": "导出 Markdown",
  "Export JSON": "导出 JSON",
  "Recording stopped. Your existing copy is kept.":
    "已停止保存此会话，现有记录保留。",
  "Stop recording this conversation": "停止保存此会话",
  "Your chats": "你的对话",
  chats: "段",
  "Auto-save is on": "自动保存已开启",
  "Auto-save is off": "自动保存尚未开启",
  "Only identifiable temporary chats are saved automatically.":
    "只保存可识别的临时对话。",
  "Turn off auto-save": "关闭自动保存",
  "Enable auto-save": "启用自动保存",
  "Auto-save turned off": "已关闭自动保存",
  "Auto-save enabled. Use Record current chat for a conversation already in progress; no refresh needed.":
    "已开启自动保存。已有聊天可点击“记录当前对话”，无需刷新。",
  Off: "关闭",
  On: "开启",
  "Saved. New messages will keep updating.": "已保存，后续将自动记录。",
  "Record current chat": "记录当前对话",
  "Already chatting? Save the readable text and keep recording.":
    "已经聊到一半？保存现有可读文字，并继续记录。",
  "New chat platform": "新会话平台",
  "＋ Open": "＋ 打开",
  "Auto-save is experimental. Enable temporary or incognito mode on the website first.":
    "自动保存为实验支持；打开后请先开启临时／隐身模式。",
  "Full-text search": "全文搜索",
  "Search conversations…": "搜索对话…",
  "Local conversations": "本地会话",
  "Name updated": "名称已更新",
  "Could not rename. Use 1–100 characters and check that the conversation still exists.":
    "重命名未完成，请输入 1–100 个字符，并确认对话仍然存在。",
  "Rename conversation": "重命名会话",
  "Conversation name": "会话名称",
  "Save name": "保存名称",
  Cancel: "取消",
  "Conversation actions": "会话操作",
  Rename: "重命名",
  Delete: "删除",
  "No matching conversations": "没有找到相关对话",
  "No saved conversations yet": "还没有保存的对话",
  "Try another keyword. Titles and message text are searchable.":
    "换个关键词试试，标题和正文都可以搜。",
  "Choose Record current chat on the chat page. Saved conversations appear here.":
    "在聊天网页点击记录当前对话，保存成功后会出现在这里。",
  "Clear search": "清除搜索",
  "Local data & privacy": "本地数据与隐私",
  "Records stay in this browser with no cloud sync. Claude, Grok, Gemini, generic sites, and DeepSeek have experimental adapters awaiting broader live-account validation. Recording keeps updating this conversation. Clear data revokes local capture consent; website access can be revoked separately in extension settings. The database is not encrypted, and uninstalling may remove it. Export important records for backup.":
    "记录只在此浏览器中保存，没有云同步。Claude、Grok、Gemini 为实验适配，通用／DeepSeek 也尚待真实账号验收。点击记录后会持续保存当前会话；清空会撤回本地保存授权，浏览器 网站访问权限可在扩展设置另行撤回。数据库未加密，卸载扩展可能丢失数据。请在对话内导出需要备份的记录。",
  "Clear all local records and revoke saving consent? This cannot be undone. Exports and website records are kept.":
    "清空所有本地记录并撤回保存授权？无法撤销。已导出的文件和平台端记录不会被删除。",
  "All local records and consent cleared": "全部本地记录与授权已清空",
  "Clear all data and revoke consent": "清空所有数据并撤回授权",
  "Local only · No cloud sync · Delete anytime":
    "仅存本机 · 无云同步 · 随时删除",
  "Could not read local records. Please try again.":
    "暂时无法读取本机记录，请稍后重试。",
  "The action could not be completed. Please try again.":
    "操作未完成，请稍后重试。",
  "Back to ChatGPT": "返回 ChatGPT",
  "← Back to ChatGPT": "← 返回 ChatGPT",
  "Local copy · KeepTemp": "本机记录 · KeepTemp",
  "Delete local copy": "删除本机记录",
  "Agree to local saving in the sidebar first.": "请先在左侧同意本地保存。",
  "This local record no longer exists.": "这条本机记录已不存在。",
  "Opening local record…": "正在打开本机记录…",
  "Full history and continuation prompt copied. Paste into a new chat and send.":
    "已复制完整记录与接续提示词。请在新聊天中粘贴发送。",
  "New temporary chat ↗": "新临时聊天 ↗",
  Export: "导出",
  "This is a local text copy. Continue in a new chat; the original server session is not restored.":
    "这是本机保存的文字记录。接续会使用新聊天，不恢复原服务端会话。",
  "This record is long. The destination model may not accept all of it; the copy is never truncated.":
    "这段记录较长，目标模型可能无法接收全部内容；复制不会自动截断。",
  "Saved conversation": "已保存的对话",
  "Opening local history…": "正在打开本机历史…",
  "Keep a copy for yourself.": "给自己的对话留一份。",
  "Text stays in this browser. It does not hide website history. The database is not encrypted; uninstalling may remove records.":
    "文字保存在当前浏览器，不上传。不会隐藏网站历史；数据库未加密，卸载扩展可能丢失记录。",
  "Temporary chat recording enabled": "已开启临时聊天记录",
  "Agree and enable local recording": "同意并开启本地记录",
  "Saved to local history": "已存入本机历史",
  "＋ Record current chat": "＋ 记录当前对话",
  "Automatically record temporary chats": "自动记录临时聊天",
  "Pause temporary auto-recording": "暂停临时自动记录",
  "Enable temporary auto-recording": "开启临时自动记录",
  Pause: "暂停",
  Enable: "开启",
  "Search local history": "搜索本机历史",
  "No matching records": "没有找到相关记录",
  "Saved ChatGPT conversations appear here.":
    "保存的 ChatGPT 对话会出现在这里。",
  Save: "保存",
  "Local only · Settings": "仅本机 · 设置",
  "Temporary mode is controlled by the website. You can also save ordinary chats manually; a local copy does not delete website history. Continuation carries text only. Export important records for backup.":
    "临时模式需在网站开启。普通聊天可以主动另存；本地保存不会删除网站历史。接续只保留文字，重要内容请导出备份。",
  "Clear all KeepTemp local data": "清空 KeepTemp 全部本机数据",
  "Clear all local data": "清空全部本机数据",
  "Clear local records and consent for every platform? This cannot be undone.":
    "清空所有平台的本机记录和本地保存授权？此操作无法撤销。",
  "Local copy deleted": "已删除本机记录",
  "All local data cleared": "已清空全部本机数据",
  "The page changed. Choose Record current chat again.":
    "网页已切换，请重新点击记录当前对话。",
  "Website access was not granted. Nothing was saved.":
    "未获得此网站的访问权限，未保存。",
  "On the chat tab, click KeepTemp in the browser toolbar, then Record current chat.":
    "请先在聊天标签页点击浏览器工具栏的 KeepTemp，再点击记录当前对话。",
  "Switch to an HTTPS chat page and open KeepTemp from the toolbar. Shared links are not recorded.":
    "请先切换到 HTTPS 聊天网页，再从浏览器工具栏打开 KeepTemp；共享链接不保存。",
  "Agree to local saving before recording a conversation.":
    "请先同意本地保存，再记录当前会话。",
  "Could not access this page. Allow access to this website in extension settings. You do not need to refresh or close your chat.":
    "无法访问当前页面。请在扩展设置中允许访问当前平台的网站；无需刷新或关闭聊天。",
  "This is not a temporary chat. Nothing was saved automatically.":
    "当前页面不是临时聊天，未保存。",
  "Temporary mode was not recognized. Check the website's temporary, incognito, or private mode.":
    "暂未识别出临时模式，未保存。请确认网页显示临时、隐身或私密聊天。",
  "No readable conversation found. Send a message first; if this continues, keep the page open.":
    "未找到可保存的对话文字。请确认已有消息；若仍失败，请保留当前页面。",
  "This conversation is paused. Resume it from the page's KeepTemp menu first.":
    "此会话已暂停。请从网页上的 KeepTemp 菜单恢复后重试。",
  "This conversation was excluded or deleted. Automatic capture will not restore it.":
    "此会话已排除或删除，不会自动恢复保存。",
  "Saving is in progress. Please wait a moment.": "正在保存，请稍后再试。",
  "Messages were found, but the conversation region could not be identified. This layout needs an adapter update.":
    "网页中有消息，但没定位到对话区域，尚未保存；需要适配这个页面布局。",
  "Could not reliably distinguish your messages from the AI's. This layout needs an adapter update.":
    "无法可靠区分你和 AI 的消息，尚未保存；这个页面需要进一步适配。",
  "Stable message markers are missing. Updates cannot be tracked reliably yet.":
    "页面缺少稳定的消息标记，暂不能可靠追踪更新，尚未保存。",
  "Multiple or conflicting conversations were found. Keep this page open; nothing was saved.":
    "发现多段或互相冲突的消息，尚未保存；请保留当前页面。",
  "This page cannot be recorded. Shared links and non-HTTPS pages are not supported.":
    "此页面不适合记录；共享链接和非 HTTPS 页面不保存。",
  "Nothing was saved. Keep this page open and try again.":
    "暂未保存成功。请保留当前页面，稍后重试。",
  Today: "今天",
  "Local history": "本机历史",
  "Loading…": "正在打开…",
  "Confirm delete": "确认删除",
  "Confirm clear": "确认清空",
  "Conversation actions: {title}": "会话操作：{title}",
  "Open {platform}": "打开 {platform}",
  "Delete “{title}”? This cannot be undone and does not delete the website record.":
    "删除“{title}”？无法撤销，也不会删除平台端的记录。",
  "Delete “{title}”? This only removes the local copy and cannot be undone.":
    "删除“{title}”？只删除本机副本，无法撤销。",
  "{count} web conversations": "{count} 段网页对话",
  "{platforms} enabled": "{platforms} 已启用",
  "Saved · On this device": "Saved · 已存本机",
  "Saving…": "Saving…",
  "Not authorized · Auto-save is off": "尚未授权 · 未开启自动保存",
  "Ordinary chat · Auto-save is off": "普通聊天，不保存",
  "Waiting for temporary chat text": "等待临时对话内容",
  "Waiting for temporary chat": "等待临时对话",
  "Conversation excluded": "此会话已排除",
  Paused: "已暂停",
  "Content updated · Waiting to save": "内容已更新，等待保存",
  "Not saved · Check consent or exclusions":
    "未保存 · 请检查授权或会话排除状态",
  "Save failed · Keep this page open and try again":
    "保存失败 · 请保留此页，稍后重试",
  "KeepTemp actions": "KeepTemp 操作",
  "Could not open local history. Check website access, or choose KeepTemp from the browser side panel.":
    "未能打开本机历史。请检查网站访问权限；也可从浏览器侧栏选择 KeepTemp。",
  "Exclude this conversation": "排除此会话",
  "Resume (includes visible text)": "恢复（含可见内容）",
  "KeepTemp save status": "KeepTemp 保存状态",
  "KeepTemp · Checking": "KeepTemp · 正在检查",
  "Visible text only. Resume captures the text currently on this page.":
    "仅保存可见文字，不上传。暂停后恢复会保存当前可见内容。",
  "Local text only · Attachments are not restored":
    "只保存可见文字 · 不恢复附件",
};
Object.assign(chinese, {
  Assistant: "助手",
  Checking: "正在检查",
  "Settings could not be updated. Try again.": "设置未完成，请重试",
  "Settings failed. Try again.": "设置失败，请重试",
  "Paused · Resume captures visible text": "已暂停；恢复时会保存可见内容",
  "Waiting for updates": "等待更新",
  "Exclude this conversation and delete its local copy? Future updates will not be saved.":
    "排除此会话并删除其本地副本？后续不再保存。",
  "Exclusion failed. Try again.": "排除失败，请重试",
  "Checking for updates…": "正在检查更新…",
  "Auto-save is off · Use KeepTemp to record again":
    "自动保存已关闭 · 点击 KeepTemp 重新记录",
  "Cannot identify current content · Updates were not saved":
    "当前内容无法可靠识别 · 尚未保存更新",
  "Conversation changed · Use KeepTemp to record it":
    "已切换会话 · 点击 KeepTemp 记录新对话",
  "Pause recording": "暂停记录",
  "Resume recording": "恢复记录",
});
const english = Object.fromEntries(
  Object.entries(chinese).map(([en, zh]) => [zh, en]),
);
export function translate(
  value: string,
  locale: Locale,
  params: Record<string, string | number> = {},
) {
  const key = english[value] ?? value;
  const text = locale === "zh" ? (chinese[key] ?? value) : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    String(params[name] ?? match),
  );
}

// Only call on extension-owned status markup, never on website chat content.
export function localizeInterface(root: ShadowRoot, locale: Locale) {
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (node.parentElement?.closest("style,script")) continue;
    const value = node.textContent ?? "",
      key = value.trim();
    if (key) {
      const label = key.startsWith("KeepTemp · ")
        ? "KeepTemp · " + translate(key.slice(11), locale)
        : translate(key, locale);
      node.textContent = value.replace(key, label);
    }
  }
  for (const el of root.querySelectorAll("[aria-label],[title]"))
    for (const name of ["aria-label", "title"]) {
      const value = el.getAttribute(name);
      if (value) el.setAttribute(name, translate(value, locale));
    }
}
