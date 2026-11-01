# 验证记录

合成数据；macOS Apple Silicon；Node.js 22；生产 Chrome MV3 构建。浏览器测试使用 Playwright 下载的 Chromium 和独立临时配置，不读取用户 Chrome profile。

## 实际执行

2026-11-02 实际结果：`npm run typecheck` 通过；`npm test` **17/17 通过**；`npm run build` 通过；`npm run test:browser` **4/4 通过**（10.4s）；`npm run zip` 通过（约 79KB）；`npm audit` 全依赖 **0 个已知漏洞**。

[合成数据 UI 截图](sidepanel-preview.png)。测试范围：

- 核心测试：授权门控、50 次流式快照去重、多轮增量、旧更新保护、首次时间保留、重新连接持久化、普通/未知类型拒绝、标签页和 SPA 身份隔离、排除与 tombstone、清空并撤权的并发写入、全文搜索、等待提交后 Saved、失败状态和重试、暂停、DOM 消息稳定身份、刷新后消息顺序、角色/Unicode/多行恢复、JSON round-trip、HTML 纯文本与非法/超大导入、长上下文不截断。
- 浏览器集成：真实 MV3 构建加载；合成流式回复始终一条 assistant；刷新后同一会话增量；相同 URL 的两个 tab 隔离；关标签页后读取；重新加载会话库；清空撤权；清单仅 sidePanel 且无内容脚本或 host 权限；普通/未知来源跳过。
- 导入/恢复浏览器测试：主动粘贴、HTML 不执行、系统剪贴板逐字比较、JSON 下载内容比较、全文搜索、删除、清空授权。
- 故障注入：在独立合成测试页让真实 IndexedDB put 抛 QuotaExceededError，检查显示失败而非 Saved，且库中没有虚假记录。此测试不是磁盘实测耗尽。

## 需要用户人工验收

1. 按 README 加载 `.output/chrome-mv3`，点击工具栏图标；确认真实 Side Panel 能打开，在实际面板宽度下无横向溢出。
2. 阅读首次隐私说明并授权，用合成模拟页添加两轮；等待 Saved，关闭模拟页，确认可读到 4 条消息。
3. 在模拟页暂停/恢复、切普通/未知、新建 SPA 会话；确认 UI 语义符合说明。Side Panel 排除后，模拟页改动不应继续保存。
4. 复制合成上下文，手动粘贴到本地文本编辑器核对；不必登录 ChatGPT 或发送任何真实内容。
5. 导出 Markdown/JSON，导入 JSON，确认内容一致。删除单会话，再清空并撤回授权，确认重新出现授权页面。

## 不宣称验证的部分

真实账号、ChatGPT DOM、真实 Temporary 自动识别、商店审核、断电与 OS 重启、SSD 擦除、浏览器真实磁盘耗尽、Chrome 工具栏打开 Side Panel 的人工体验。自动化测试直接打开 sidepanel.html 验证同一页面的内容行为，不等于完整人工 Side Panel 验收。CI 配置示例保存在 `docs/github-actions.example.yml`。本次 GitHub CLI 授权没有 workflow scope；为避免扩大权限，未启用远端 Actions，因此没有远端 CI 通过的结论。需要时可由仓库所有者将示例移到 `.github/workflows/ci.yml`。
