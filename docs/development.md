# 开发与测试

需要 Node.js 22.12+。依赖锁定在 `package-lock.json`，请使用 `npm ci`。

```sh
npm ci
npm run dev          # WXT 开发模式
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser # 先构建生产扩展
npm run zip
```

加载构建后的 `.output/chrome-mv3`，安装方式见 [README](../README.md)。修改内容脚本后，在扩展管理页重新加载扩展，并在合成页面验证；不要卸载扩展或清空真实记录来调试。

## 目录

```text
entrypoints/         后台、内容脚本与侧栏 UI
src/adapters/        平台 DOM 规则与通用提取
src/model.ts         数据模型、通信协议与快照校验
src/platforms.ts     平台入口及 origin 注册表
src/current-chat.ts  当前页接管与主动记录
src/page-history.ts   ChatGPT／Claude 侧栏入口及扩展框架挂载
src/storage.ts       IndexedDB、授权与增量合并
src/recovery.ts      文字接续与导出格式
src/i18n.ts          英文界面、中文翻译与占位参数
src/style.css        侧栏样式与黑白主题
tests/               合成 DOM、存储及控制器单元测试
tests/browser/       隔离浏览器集成测试
docs/                架构、可行性及本指南
```

WXT、TypeScript、Vitest 和 Playwright 的配置分别服务构建、类型检查、单元测试和浏览器测试。`.wxt/`、`.output/`、`test-results/`、`playwright-report/` 和依赖目录都是本机生成物，不提交。临时截图输出到 `test-results/`；README 保留三张完整使用场景原图，平台演示采用虚构对话。

README 的平台图标取自 [OpenAI 官方 App 图标说明](https://help.openai.com/en/articles/8142208-chatgpt-ios-and-android-app-faq)及 [Claude 网站 favicon](https://claude.ai/favicon.svg)，用于标识兼容平台，相关标识归各权利人。

## 必须守住的行为

| 场景                                          | 预期                                           |
| --------------------------------------------- | ---------------------------------------------- |
| 未同意保存；普通／未知模式的自动扫描          | 不保存；主动记录可保存普通／未知模式           |
| 中途接管、重复点记录、增加新轮次、快速双击    | 更新同一记录，不重复、不假报成功               |
| 流式回复、虚拟列表卸载、旧片段重新出现        | 更新原消息，保留已存文字与顺序                 |
| 刷新、关页、SPA 切换、同站多标签与跨站相同 ID | 已提交内容仍可读，不串会话或越权保存           |
| 删除后后台写入、主动重存、暂停／排除          | 不自动复活；主动重存只保存当前文字；不绕过暂停 |
| 写入失败、删除后重存失败                      | 显示错误，事务回滚，不留下授权或 Saved         |
| 搜索、重命名、删除、清空                      | 列表反映真实数据，清空后活跃页不回写           |
| 复制接续、Markdown／JSON 导出                 | 角色与完整存储文字一致，不自动发送             |
| 新网站授权、拒绝、授权时切换页面              | 只申请当前 origin；未获授权不提交              |
| 340px 面板、长文、菜单、返回、主题切换        | 可操作、无横向溢出，主题持久化且同步网页标记   |

## 测试方法与边界

Vitest 使用 jsdom 和 fake-indexeddb，覆盖 DOM 身份、合并顺序、事务故障和控制器流程。Playwright 使用独立临时 profile，所有聊天请求返回合成 HTML，不读取私人 Chrome 配置或真实聊天。主要浏览器套件只给测试构建副本增加精确合成站点权限，以验证完整保存闭环。

`embedded-history.spec.ts` 使用带合成原生侧栏的 ChatGPT／Claude 页面和未修改的生产 manifest，验证页面内的本机历史原型。包括首次授权、流式保存、普通聊天主动保存、删除重存、搜索、导航、刷新、多标签页、主题、清空和存储失败，以及默认英文／中文同步、浮层菜单和键盘操作；还验证扩展框架复用原数据库、网站不能直接读取历史 DOM，以及严格父页 frame/clipboard 策略下的展示和复制。接续文本与完整存储记录逐字比较，不在网站自动粘贴或发送。真实账号的侧栏布局仍需人工体验；这些测试不代表已验证所有 ChatGPT 或 Claude 布局。

Claude 挂载规则参考公开项目 [Claude.ai CSS Fixes](https://github.com/danslabs/Claude.ai-CSS-fixes) 所记录的 aside／侧栏分组标记，并保留语义 nav 回退。公开选择器只是适配依据，尚未读取或验证用户真实账号的 DOM；真实布局仍需人工体验。

工具栏套件使用未修改的生产 manifest，通过原生 CDP action 检查 activeTab 授予及跨 origin 撤回，并验证出现独立的原生侧栏页面目标，避免把普通标签页中的 UI 当作侧栏成功。另检查点击记录到达原生权限请求。弹窗等待期间不显示 Saved；测试不代替用户点击原生授权。允许／拒绝由控制器单元测试和精确预授权站点覆盖。

## 浏览器兼容验证

测试共用同一份 `.output/chrome-mv3` 构建。2026-11-02 在 macOS 26.4、Apple Silicon、独立临时 profile 中运行，聊天请求全部由合成页面响应：

| 浏览器         | 版本                              | 回归结果     |
| -------------- | --------------------------------- | ------------ |
| Chromium 基线  | 156.0.8078.4                      | 35 / 35 通过 |
| Microsoft Edge | 156.0.4314.58                     | 35 / 35 通过 |
| Brave          | 1.98.63（Chromium 156.0.8078.80） | 35 / 35 通过 |

类型检查、114 项单元测试、生产构建与 ZIP 通过。统一浏览器提示文案后的最终构建，在 Edge、Brave 另各补测 4 项核心场景通过，覆盖流式保存、复制导出、原生侧栏和权限请求。

当前 ChatGPT／Claude 页面内历史界面在 Chromium 156.0.8078.4 通过类型检查、117 项单元测试、58 项浏览器测试及生产构建，其中包含 23 项页面内集成场景。覆盖首次授权、流式与主动记录、重复保存、重命名、全文搜索、删除后重存、清空、存储失败、侧栏重绘／导航及工具栏回退。两站展示同一份本机记录；跨站测试验证来源标签、复制原文逐字一致、返回时草稿保留、标签页选择独立，以及语言／删除状态同步。Claude 测试还覆盖严格父页 frame／clipboard 策略、显式网站主题和共享／登录路径退出。

这些用例全部使用合成对话与隔离 profile。Claude 的真实网页布局尚待用户体验；ChatGPT 也不能据此推断所有灰度布局都兼容。

上表 Edge／Brave 的结果针对原侧栏版本；当前页面内界面未在这两个浏览器重新运行，也未做真实账号的布局验收。

覆盖原生侧栏、工具栏访问、自动及主动保存、流式更新、导航与刷新、复制、导出、删除与重存、清空、主题和写入失败。Windows、Linux 及其他浏览器未做本轮实际运行；共享扩展代码不代表所有系统和旧版本都已验证。Firefox、Safari 当前未适配。

`tests/browser/launch.ts` 默认使用 Playwright 的 Chromium。测试 Edge 或 Brave 时，先设置环境变量 `KEEPTEMP_BROWSER` 为 `edge` 或 `brave`，并将 `KEEPTEMP_BROWSER_PATH` 设为该浏览器可执行文件的完整路径，再运行 `npm run test:browser`；可选 `KEEPTEMP_HEADED=1` 显示测试窗口。不自动安装浏览器，不连接已有 profile。

Chrome 和 Edge 的近期版本移除了命令行扩展加载方式，见 [Playwright 说明](https://playwright.dev/docs/chrome-extensions)。测试通过官方 [CDP Extensions.loadUnpacked](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked) 安装扩展，仅对隔离测试实例启用扩展调试；生产权限不变。浏览器包来自官方来源并核对 SHA256，验证结束后删除本次下载、解压目录与临时 profile。

API 参考：[Edge 侧栏](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar)、[Brave 扩展支持](https://brave.com/learn/using-chrome-extensions-in-brave/)。这些说明用于选定测试目标，实际兼容结论以回归结果为准。

合成测试不证明所有真实账号、地区、语言或灰度布局都兼容。没有实测磁盘耗尽、断电、取证级擦除或所有浏览器重启后的身份变化；存储故障使用合成异常。复制内容一致性也不代表真实模型接续质量已验证。不要把这些未完成项描述为测试通过。

## 提交约定

- 尽量小改，保持原数据库格式及已有数据；不要用清库绕过迁移。
- 添加适配规则时提供合成 fixture，验证角色、原生身份、流式更新和导航，不用真实聊天做快照。
- 不使用凭据、私有 API、网络拦截或自动滚动补抓；无可靠结构时明确失败。
- 修改后运行类型检查、相关测试及生产构建；影响捕获、存储或权限时运行浏览器套件。所有本地检查通过再提交，不能据此宣称远端 CI 已通过。
