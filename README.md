# KeepTemp

本地保存 ChatGPT Temporary Chat 的 Chrome 扩展。**0.2.2 已接入真实页面 DOM 自动捕获，处于实验阶段；尚未用真实 ChatGPT 账号验收。** 不再要求逐轮手动复制粘贴。

## 0.2.2 新版界面适配

旧版诊断中 mode=true 但 roleNodes/turnNodes=0，说明旧消息标记匹配不到。新增对新版 app-shell 的语义搜索单元、原生 turn key、活动时间线区域和会话容器身份的支持。保留旧版布局；不靠消息位置交替猜角色。

新增回归验证：没有任何旧消息属性时也能自动保存；同一轮的外层搜索包装与内层内容不会重复写入；屏蔽旁边的 presentation 时间线；首轮移出虚拟列表后仍继续同一会话；旧消息再次挂回不重复；首次看到的更早消息按已知锚点插入。

网页只挂载部分历史时，插件保留之前已观察到的消息，不主动滚动或调用 API 补抓。没有被挂载/观察过的内容无法保证完整；缺少稳定会话容器标记时，长会话的虚拟列表身份仍有限制。缺少跨快照顺序锚点时不保证未知历史的绝对顺序。

右下角“复制诊断”只含结构计数，不含聊天文字、原生 id 或完整网址。更新前保留未保存的临时聊天，更新后先在新测试标签页验证。公开结构参考与验证边界见 [新版布局记录](docs/layout-compatibility.md)。

## 更新及开始使用

本次已构建：`path/to/KeepTemp/.output/chrome-mv3`。

1. 打开 `chrome://extensions`，找到 KeepTemp，点击刷新图标。版本应显示 **0.2.2**；若 Chrome 提示确认 chatgpt.com 网站访问权限，需允许该站点访问。
2. 打开 KeepTemp Side Panel。首次用户先阅读隐私说明、同意本地保存；已授权旧版的用户无需清空已有数据。
3. 点击 **启用 ChatGPT 自动保存**。这是独立授权，旧版手动保存授权不会自动开启网站捕获。
4. 刷新已打开的 ChatGPT 网页，使新版内容脚本加载。打开 Temporary Chat，或点击面板的“打开 ChatGPT 临时聊天”入口（`https://chatgpt.com/?temporary-chat=true`）。请确认网页本身显示 Temporary。
5. 正常聊一轮。页面右下角出现 **KeepTemp · Saved · 已保存到本地** 后，回到 Side Panel 查看。无需粘贴、整理角色或逐轮点击保存。
6. 右下角可以暂停和排除此会话。暂停后恢复会保存当前仍可见的文字；“排除”会删除本地副本并阻止该段会话再次保存。全局停止使用面板的“关闭 ChatGPT 自动保存”。

初次安装：在 `chrome://extensions` 启用开发者模式，加载已解压扩展，选择上述目录。macOS 隐藏 `.output`，文件选择窗口按 Cmd+Shift+G 粘贴完整路径。

## 捕获与恢复边界

- 仅在 `https://chatgpt.com/*` 注入内容脚本。读取可见 user/assistant 文字，按稳定消息标记更新；写入扩展 origin IndexedDB，由后台确认事务成功才显示 Saved。
- Temporary 信号来自明确激活控件、状态标记或 `temporary-chat=true` URL；明确关闭状态优先于 URL。普通、未知模式或缺乏稳定首条用户消息身份时默认不保存。此启发识别尚未在真实账号验证，不能承诺覆盖所有界面版本。
- 页面结构变化可能导致无法识别。右下角一直“等待可识别的 Temporary 对话”时，请反馈状态文字和你使用的语言，不需要提供私人对话。
- 只保存当时存在于页面 DOM 的文字，不补抓未加载历史、不提取隐藏推理、不保存附件或工具状态。消息文本的布局空白会规范化，不是原始 HTML 归档。
- 刷新后使用首条用户消息的原生 id 继续归档；从 `/` 跳到 `/c/...` 不拆会话。不同 tab 的记录保持独立；不自动跨标签页合并。浏览器重启后 tab id 变化可能产生另一份记录。
- 未确认写入的末尾内容可能在马上关闭标签页时丢失。编辑、重新生成和切换分支按当前可见消息更新，不提供分支版本历史。
- 恢复：在 Side Panel 点击复制上下文，自己打开新 ChatGPT 会话、选择 Temporary 并粘贴发送。不自动输入或发送，不恢复原服务端会话。

本地数据库未加密，不是密码保险库；导出备份由用户决定。删除本地记录不改变平台端保留，也不删除导出文件。无服务器、API Key、凭据提取、网络拦截或分析 SDK。

此开发版按用户最新要求启用真实捕获；没有获得 OpenAI 对自动提取的许可，也未上架商店。相关已知风险见 [可行性记录](docs/feasibility.md)，不把技术可运行等同于平台许可。

## 开发

Node.js 22.12+，Chrome 116+。此 Mac 的独立 Node 路径：

```sh
export PATH="$HOME/.local/keeptemp-tools/node:$PATH"
cd path/to/KeepTemp
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run zip
```

浏览器集成测试通过请求路由为 chatgpt.com 提供本地合成 HTML，再运行生产内容脚本、真实 MV3 后台和 IndexedDB。不会连接真实平台，不读取个人账号或用户 Chrome profile。它能证明端到端链路，不能证明当前在线网站 DOM 匹配。CI 示例在 `docs/github-actions.example.yml`，未启用远端 Actions。

仍保留主动导入、全文搜索、Markdown/JSON 导出和合成实验室作为辅助能力。导入支持 KeepTemp JSON，或每个角色以独占一行 `[user]` / `[assistant]` 开始的文字。正文含角色分隔符时用 JSON，避免歧义。

- [架构](docs/architecture.md)
- [测试与真实页面验收](docs/testing.md)
- [隐私边界](PRIVACY.md)

MIT License；GitHub 仓库按用户要求保持私有。
