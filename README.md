# KeepTemp

**项目状态：技术验证原型，尚未实现核心产品目标。**

目标是在 ChatGPT Temporary Chat 中照常聊天并自动保存本地副本。目前尚未找到已确认获准、符合原约束的真实平台捕获路径。现有手动导入不构成目标完成，也不作为值得继续扩展的独立产品方案。详见 [自动保存可行性复核](docs/automatic-capture-review.md)。

**此版本：主动粘贴 / JSON 导入 + 本地会话库 + 合成页面自动捕获。ChatGPT 自动采集未启用。** 当前条款禁止程序化提取，不能把 DOM 技术可行性当成公开发布许可。参见 [可行性研究](docs/feasibility.md)。

## 本地安装

需要 Node.js 22.12+ 和 Chrome 116+。本次 Mac 开发环境的独立 Node 路径：

```sh
export PATH="$HOME/.local/keeptemp-tools/node:$PATH"
cd path/to/KeepTemp
npm ci
npm run build
```

1. 打开 `chrome://extensions`，启用开发者模式。
2. 选择“加载已解压的扩展程序”，目录 `path/to/KeepTemp/.output/chrome-mv3`。文件选择器可按 Cmd+Shift+G 输入路径。
3. 点击扩展工具栏中的 KeepTemp 图标打开 Side Panel，阅读说明并授权。
4. 点击“粘贴或导入对话”，使用下面格式，保存后即可搜索、查看、导出和复制。
5. 合成验证：点击“打开合成聊天实验室”，添加流式一轮，确认 Saved 后关闭标签页，在会话库重新查看。

```text
[user]
如何完成一个小闭环？

[assistant]
保存、找回，再复制上下文。
```

格式中的 `[user]` 和 `[assistant]` 必须独占一行。若消息正文含有相同独占行，使用 KeepTemp JSON 文件导入，以无歧义保留文字。导入不是自动角色识别。JSON schema 为 `{ "version": 1, "session": { "title": "...", "messages": [{ "role": "user", "text": "..." }] } }`。重新导入总是创建新的本地副本，不信任导入文件的 id、排除标记或授权。

点击“复制上下文”后，主动打开新 ChatGPT 会话，自行选择 Temporary 模式并粘贴发送。不会自动输入或发送。它不能恢复原会话、附件和工具状态。

## 开发与验证

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run zip
```

CI 配置示例见 `docs/github-actions.example.yml`，尚未启用远端 Actions。

浏览器测试加载真实构建产物，使用独立临时配置。`npm run dev` 供开发使用，隐私验收请使用生产 build；生产 CSP 禁止 connect，开发热更新可能需要 WXT 开发连接。

- [架构](docs/architecture.md)
- [可行性与官方资料](docs/feasibility.md)
- [隐私与安全边界](PRIVACY.md)
- [测试结果与人工验收](docs/testing.md)

## 已知限制

仅 Chrome；无真实平台自动采集。正文搜索为小库设计的线性检索。24000 字符提示只是长上下文启发，不是模型 token 容量计算。未提交的流式尾部可能在立即关闭时丢失；请以 Saved 状态为准。暂停后恢复会保存仍可见的内容，永久停止某段合成对话请使用“排除此会话”。刷新模拟页保留本地会话身份，但不重建页面文字；新添加的合成轮次继续并入记录。浏览器重启不保证模拟 tab id 稳定。

本地数据库未加密，不是密码保险库；无自动备份，卸载会丢失数据。删除本地记录不改变平台端保留，也不会删除已导出文件。

MIT License。当前按要求使用私有 GitHub 仓库；包含开源许可不代表仓库已公开。商店上架前须发布隐私政策、完成披露，并复核条款。下一步只解决真实平台自动捕获的许可与来源。明确获准前暂停功能扩展；合成测试继续作为工程证据保留。
