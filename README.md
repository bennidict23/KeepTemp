# KeepTemp

**照常聊临时对话，自动留在本机；需要时找回，接着聊。**

KeepTemp 是一个本地优先的 Chrome 扩展，为 ChatGPT Temporary Chat 保存文字副本。无需账号、后端或 API Key，不上传聊天，不把临时会话转换成平台普通历史。

产品方向与每次迭代的判断依据见 [产品初心](docs/product-brief.md)。

## 使用

1. 在 `chrome://extensions` 加载已解压扩展，选择 `path/to/KeepTemp/.output/chrome-mv3`。macOS 文件选择器可按 Cmd+Shift+G 输入隐藏目录路径。
2. 点击工具栏的 KeepTemp，阅读隐私说明并授权，再开启自动保存。
3. 在 ChatGPT Temporary Chat 中照常聊天。网页右下角显示 **Saved** 后，该次文字已持久化；打开侧边栏即可查看和搜索。
4. 想接着聊时，打开记录，点击“复制并接续”，在新临时会话中粘贴并发送。复制包自动包含完整历史和接续提示词，让模型沿用目标、结论与偏好，从中断处继续；无需自己写提示词或重述背景。

网页上的小状态标记可展开，暂停或排除当前会话。暂停后恢复会保存当时仍可见的文字；排除会删除该段本地副本并阻止再次保存。

每段记录右上角可直接删除；“管理这段对话”提供 Markdown/JSON 导出和停止继续保存。主页“本地数据与隐私”提供全部清空与撤回授权。

## 更新

当前版本 **0.3.2**。在 `chrome://extensions` 点击 KeepTemp 的刷新按钮，再重新打开侧边栏。保留现有安装目录和扩展 id，**无需卸载或清空，原记录保留**。新的网页状态标记在新打开的 ChatGPT 标签页生效；尚未保存的旧临时聊天请先保持打开。

0.3.0 移除了产品内的模拟实验室、诊断、手动导入和开发提示，只保留自动保存、找回、接续及必要的数据控制。0.2.2 的真实页面识别和保存已由用户确认可用；本次自动化验证仍只使用独立浏览器中的合成内容。

## 边界

- 仅 Chrome、chatgpt.com、可识别的 Temporary Chat。普通或不确定的聊天默认不保存。
- 只保存已经出现在页面 DOM 中的可见文字；未挂载历史、附件、工具状态和原服务端会话不能恢复。不自动输入或发送。
- Saved 表示当次写入成功。未确认提交的流式尾部可能在立即关闭时丢失。
- 数据保存在此浏览器的 IndexedDB，未做应用层加密，不是密码保险库；无云同步。卸载、浏览器清理或设备损坏可能丢失数据，请按需导出。
- 复制内容包含固定接续提示词和保留角色的完整存储文字；Markdown/JSON 导出仍只包含原始记录。长上下文提示为字符数量启发，不代表精确模型容量。
- 不使用私有接口、凭据提取或网络拦截。平台条款许可尚未取得；技术可用不代表获准公开发布，见 [可行性与风险](docs/feasibility.md)。

## 开发

Node.js 22.12+，Chrome 116+：

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

开发测试使用合成 DOM 和独立 profile；不访问真实账号或私人聊天。测试页面不会打包进扩展。CI 示例见 `docs/github-actions.example.yml`，远端 Actions 未启用。

[架构](docs/architecture.md) · [隐私](PRIVACY.md) · [验证记录](docs/testing.md) · [界面预览](docs/library-preview.png)

MIT License。仓库按用户要求保持私有。
