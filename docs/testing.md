# 验证记录

macOS Apple Silicon / Node.js 22 / Chrome MV3 生产构建。全部自动化测试只使用合成内容，运行于 Playwright 独立临时浏览器 profile，不读取用户 Chrome 数据。

## 0.2.0 最终执行结果

2026-11-02：`npm run typecheck` 通过；`npm test` **26/26 通过**；`npm run build` 通过；`npm run test:browser` **6/6 通过**（21.2 秒）；`npm run zip` 通过（86.63 KB）；`npm audit` **0 个已知漏洞**。真实账号兼容性尚未验收。

## 0.2.0 验证范围

单元测试覆盖存储事务、流式去重、消息顺序、授权、并发清空、导入恢复，以及新适配器的角色/段落提取、控件过滤、Temporary 正反信号、隐藏分支、稳定身份、缺少身份时拒绝、同 URL 不同 tab 隔离、消息桥 schema 和独立捕获授权。

浏览器集成覆盖：

- 原有合成实验室的流式保存、刷新、关标签页后读取、多标签隔离和清空。
- 构建清单仅声明 sidePanel API 权限，内容脚本匹配仅 https://chatgpt.com/*，无额外 host_permissions。
- 主动导入、HTML 纯文字显示、实际剪贴板逐字比较、JSON 下载内容比较、搜索与删除。
- 实验室 IndexedDB 写入错误状态。
- **生产 ChatGPT 内容脚本 → runtime → MV3 后台 → 扩展 IndexedDB → Side Panel 的完整自动保存链路**。通过 Playwright 路由将 chatgpt.com 请求直接返回本地合成 HTML，测试本身不向 ChatGPT 发请求。覆盖未启用不捕获、20 次流式更新不重复、刷新及 / → /c 导航不拆会话、新原生首条用户 id 不混会话、多标签独立、暂停恢复、普通模式覆盖残留 Temporary URL、排除删除、关页面后读取、清空后活跃页面不能写回。
- 在 MV3 后台注入 IndexedDB put 的合成 QuotaExceededError，确认真实内容脚本显示失败、会话库没有记录，恢复后自动重试并成功保存。此项不是耗尽真实磁盘空间。

原型 0.1.0 曾通过 17 项核心和 4 项浏览器测试。当前结果以本次 0.2.0 最终执行记录为准。

## 用户现在可以做的真实页面验收

1. 在 chrome://extensions 刷新 KeepTemp，确认版本 **0.2.0**，允许 chatgpt.com 站点访问。保持原扩展目录和 id，不需要清空数据库。
2. 在 KeepTemp Side Panel 点击“启用 ChatGPT 自动保存”；这是旧用户也需要做的一次独立授权。
3. 刷新 ChatGPT 网页，开始 Temporary Chat（也可点面板入口），只用一句无敏感内容的测试问题。
4. 页面右下角应出现 KeepTemp 状态。等 Saved 后查看面板，应自动出现对应 user/assistant 文字。
5. 继续问第二轮，等 Saved，确认同一条会话内有四条消息、流式回复未拆分。
6. 刷新网页后再聊一轮、开另一个临时聊天，检查身份不混淆；普通聊天不应被保存。
7. 试暂停/恢复、排除，最后删除合成测试记录。排除网页当前会话会同时删除本地副本；面板排除会保留已有副本。

若没有状态栏：检查是否刷新了 ChatGPT 标签页、扩展是否允许访问 chatgpt.com、版本是否为 0.2.0。若一直等待识别：反馈状态文字和界面语言即可，不需要分享私人聊天内容。若保存失败：先保留页面，可关闭自动保存，等待修复；不要把未保存当作已备份。

## 尚未验证

当前在线 ChatGPT DOM、真实账号 Temporary 识别、不同语言/灰度界面、真实分支编辑/重新生成、附件/工具、商店审核、断电/OS 重启/SSD 擦除、真实磁盘耗尽、Chrome 工具栏打开 Side Panel 的人工体验。合成 DOM 测试通过不等于真实网站兼容性验收通过。

已有 UI 截图只含合成内容。CI 示例在 docs/github-actions.example.yml，未取得 workflow scope，尚未启用远端 Actions，无远端 CI 通过结论。
