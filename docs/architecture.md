# KeepTemp 架构（0.6.0）

Chrome Manifest V3 / WXT / TypeScript / React / IndexedDB。运行时仅内容脚本、扩展后台与 Side Panel；无后端、远程代码或测试页面。

## 捕获入口

用户首次同意本地保存后，点一次“记录当前对话”。recordCurrentPage 负责接管、内部提取检查、必要的当前网站授权、提交和持久化核实；没有保存前预览或第二次应用确认。普通／未知模式可主动记录。消息无法可靠识别时直接报错，不要求用户逐轮复制整理。

四家临时自动捕获保持原有严格模式识别；主动入口在 regular／temporary-unknown／no-content 时转入 explicit 路径，暂停／排除／存储错误不绕过。以前命名为 preview 的内部请求仅作为当前页面提取与令牌校验，不再构成用户界面。

## 模块

- PlatformAdapter：src/platforms.ts 定义四家精确 origin 和入口，工厂选择各自 DOM 规则。ChatGPT 支持新旧语义单元与活动时间线；Claude、Grok、Gemini 依赖各自明确角色与原生会话／消息身份。默认自动读取仍须确认临时模式。
- SessionCapture：内容脚本监听／轮询，原适配每 350ms 至多一轮，通用脚本每 500ms；指纹不含扫描时间，流式文本更新同一消息。小状态标记默认收起控制，Saved 只在提交后显示。后台 runtime 桥验证扩展 id、顶层 frame、origin、tab 和有上限的 schema。
- GenericChatAdapter：未知站点使用明确角色、原生消息键与共同会话容器／高唯一锚点。已知四家主动路径复用相同 DOM 提取与会话键，避免两套副本。DeepSeek DOM 差异隔离在 deepseek-dom.ts，优先原生虚拟列表、用户折叠正文与助手正文，不依赖 main 存在，不将思考区替代最终回复。
- StorageRepository：idb 封装 IndexedDB sessions 与布尔 meta。保留 keeptemp-v1 格式、旧会话键和授权，无清库迁移。普通／显式记录策略由 captureMode 与持久化 grant 决定，不取决于厂商名称。
- RecoveryFormatter：transcript 保留原记录角色与文字；context 添加本机固定接续提示词和不冲突边界。来源不附加到提示词。Markdown／版本化 JSON 保留原记录，不添加接续指令。
- Side Panel：本地读取、全文搜索、阅读、复制、导出、重命名／删除。React 纯文本插值，不执行聊天 HTML。黑白主题由 CSS 变量与 meta.dark-mode 偏好控制，不加载远程字体。

存储、搜索和恢复不依赖平台 DOM。

## 身份与增量一致性

已知平台使用原来的 platform + tab id + 原生会话 ID。通用站点使用 generic + origin + tab id + 路由摘要 + 原生会话／锚点；原始路径和查询参数不落盘，摘要不提供聊天加密。不同标签页独立。

消息按 role + 原生消息／turn key 区分，不按交替位置、正文哈希或 viewport 序号猜身份。单会话原子写入，保留首次观察时间，拒绝更旧更新。网页移除的已存消息保留，新发现旧片段按共同前后锚点插入。具有原生会话与稳定消息键的部分虚拟窗口可继续更新，即使用户那一轮已卸载；没有可靠锚点时拒绝或保守拆分。

重复点记录走真实最新快照提交，更新原记录，不使用上一次 Saved 缓存作为结果。后台返回实际 sessionId，前端读取对应行，只有存在且未删除、有文字时显示成功。成功后清空搜索过滤并回到列表顶部。UI 读代次与 mutationActive 阻止旧轮询读覆盖刚提交的数据，也阻止快速重复点击触发并行保存。

## 授权、删除与重新记录

meta.consent 为本地保存授权。ChatGPT 的旧 chatgpt-consent 键保留，其他三家为 capture:<platform>。explicit 记录使用 generic-grant:<scoped-id> 逐会话授权；首轮 grant 与正文在同一事务提交。主页关闭会移除通用 grants，再开启四家总开关不暗中恢复这些授权。

暂停／排除会拒绝写入。单条删除用无聊天正文／标题的 tombstone 替换记录，同时撤回该 grant，自动捕获不能使其复活。只有后台处理用户显式 start-current 时传 restartDeleted=true，允许把 tombstone 丢弃后重新保存当前可读快照；不使用删除前的消息、标题或创建时间。失败会 abort，旧 tombstone 与撤权保持。清空在一个事务移除全部记录与 meta。

## Chrome 访问与页面接管

默认 API 权限 sidePanel、scripting、activeTab；默认 host 与声明式内容脚本仅 chatgpt.com、claude.ai、grok.com、gemini.google.com。optional_host_permissions 的 https://*/* 只是可申请范围，不默认拥有全站访问。无 cookies、webRequest、tabs、clipboardRead 或 unlimitedStorage。

工具栏使用 action.onClicked，在用户手势内同步 sidePanel.open。原 openPanelOnActionClick 自动打开路径不能提供所需 activeTab，已经用原生工具栏动作回归。侧栏只查当前活动 tab，缺少脚本才补加载同一顶层页面，不导航或刷新聊天。

新网站记录时只申请当前 origin。拒绝／页面切换不保存，后台从 sender 决定来源。提取令牌只能用于同一会话。成功后只注册该精确 origin 的本地脚本以便刷新恢复；通用 entrypoint registration=runtime、matches=[]，避免 WXT 自动扩大默认 host。Chrome 原生授权弹窗属于浏览器权限流程，应用没有额外确认界面。

## 主题与边界

默认跟随系统黑／白，用户切换后将布尔偏好存入同一数据库并覆盖系统；后台状态响应把主题传给网页小标记。清空数据会清除该偏好。成功／错误用文字和边框区分，不引入额外颜色。

DOM 属于平台可变实现细节。未观察历史、附件、隐藏工具状态不保存；未提交流式尾部仍可能因立即关页丢失。跨浏览器重启 tab id 不稳定；无共同原生锚点或根地址变更可能拆分。不自动滚动、不调用平台 API 补抓。数据库未加密，无云备份；技术可行不代表已获采集／发布许可。实际账号灰度布局不由合成测试保证。
