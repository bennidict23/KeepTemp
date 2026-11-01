# 0.2.2 新布局补充

消息候选支持旧角色标记和新版 content/chatgpt search unit key 的 :user/:assistant 后缀，不使用视觉左右位置推断。存在活动时间线时仅扫描其 region，排除 presentation 副本、表单与编辑器。嵌套的同角色包装仅选外层一次。消息身份优先使用原生 turn key（按角色分离），不使用 fallback-turn 的序号作为新布局身份。

新版会话标识优先使用祖先 conversation selection target；首条挂载消息发生变化不会自动建立另一会话。该标记不存在时退回已知原生消息/turn id，无法保证所有虚拟列表变体无拆分。保持 tab id 隔离。

仓库增量合并会保留卸载的消息；新出现的旧历史消息，按快照内已知的下一/上一消息锚点插入，避免一律追加到尾部。完全无交集的片段没有足够证据确定绝对位置，是已知限制。真实适配器仍不读取私有 API、不自动滚动、不主动发消息。

# KeepTemp 0.2.0 架构更新

新增 ChatGPTAdapter 与 chatgpt.content 内容脚本（仅 chatgpt.com）。真实页面不能直接访问扩展 IndexedDB，因此使用 runtime 消息 → MV3 后台 → StorageRepository 事务。后台验证发送方扩展 id、tab id、顶层 frame、精确 origin 以及有上限的快照 schema；忽略外部/iframe 来源。生产后台不发网络请求。

授权分两层：meta.consent 为本地存储授权，meta.chatgpt-consent 为主动开启网站自动保存；真实捕获事务同时验证两者。后台重启后仍从 IndexedDB 获取授权和排除状态，不依赖内存。内容脚本授权检查失败前不读取消息。

ChatGPT 会话键为 chatgpt:<tab id>:thread:<首条用户原生消息 UUID>，不使用 URL 路径作为会话身份，避免生成回复后 / 到 /c 导航导致拆分。消息优先使用 article 的 turn id / turn testid，缺少时用原生 message id；仅当首条用户有原生稳定 id 时才允许捕获，不能把重复的 conversation-turn-0 当作不同会话的身份。不同 tab 独立；浏览器重启后的 tab id 不稳定是已知限制。

内容脚本每 350ms 合并 DOM 变化，单次写入期间不并发排队。指纹只包含会话 id、消息 id、角色和文字，不包含不断变化的扫描时间。已提交才记为 Saved；失败保留 dirty 并重试。完整扫描之后仍可能在立即关标签页时丢失未提交尾部。脚本显示 Shadow DOM 状态栏及暂停/排除按钮；不向网页主世界暴露 runtime bridge。

暂停状态持久化于 Session.paused。网页排除采用无内容 tombstone 并删除副本；面板排除保留副本并设 excluded。全局关闭 autoCapture 后事务拒绝真实写入；清空在事务中同时清除内容和两个授权，活跃标签页也不能重新写回。

临时模式以明确的激活控件、状态或 URL 参数识别；纯正文包含 Temporary 不构成信号。显式 off 覆盖 URL；普通、未知模式及共享链接不捕获。全部选择器均为实验性，真实当前 ChatGPT DOM 尚未在账号中验证。公开实现可作为结构参考，不能当作本站当前结构保证。

以下为 0.1.0 原型模块设计记录；新增能力及身份规则以上文为准。

# KeepTemp 架构

## 范围
Chrome MV3 / WXT / TypeScript / React / IndexedDB。真实平台采用主动导入，自动捕获只用于扩展自带合成 DOM 页。没有后端、API Key、分析服务或网络采集。

## 模块与数据流
- `PlatformAdapter`（`src/model.ts`）提供平台无关 Snapshot；`MockAdapter` 读取明确标记的模拟 DOM，Temporary 不确定时拒绝捕获。
- `SessionCapture` 每次固定快照、按队列写入，隔离扫描与事务；状态依次为 saving → saved/error/skipped。只有仓库事务完成才返回 saved。模拟页 MutationObserver 标记变化、150ms 合并扫描；无尾部无限防抖。
- `StorageRepository` 唯一持久化入口；所有写入在同一个事务内检查授权。sessions 保存消息数组，meta 保存授权。小型 MVP 采用单会话原子写入，避免跨表部分提交。
- `RecoveryFormatter` 生成有角色的文本、Markdown 和版本化 JSON；不依赖 DOM。复制内容不额外包装或摘要，不自动裁剪。
- Side Panel 使用 React 安全插值显示纯文本；全文搜索在本地内存进行。每秒刷新以观察不同扩展页面提交的变更，不使用额外 storage 权限。

## 标识与一致性
模拟会话键为 `mock:<Chrome tab id>:<URL session UUID>`。刷新保留 URL、不同标签页由 Chrome tab id 隔离；SPA 新会话更新 UUID。消息使用不变 UUID，流式输出仅更新 text。消息保留初次观察时间和最近扫描时间；这些不是平台服务端时间。相同 id 只 upsert，按 order 排序；较老更新时间不能覆盖新值。

IndexedDB readwrite 事务协调多个页面的写入。删除写入无聊天内容的 tombstone，防止打开的模拟页面重新创建已删除会话；排除标记永久停止该段模拟会话更新。清空时在同一事务内清空会话、tombstone 和授权，即使有排队写入，也会在事务中重新检查授权。

暂停停止后续写入，不是内容级排除：恢复时仍可见内容会重新扫描。UI 明确说明。排除按钮用于整段会话永久停止捕获。所有已提交内容仍可导出或删除。

## 权限及信任边界
只有 `sidePanel`。无 host_permissions、content_scripts、cookies、webRequest、tabs、clipboardRead、unlimitedStorage。`tabs.create/getCurrent` 使用不需要 tabs 权限的能力。写剪贴板由点击触发，失败给出错误；不申请常驻剪贴板读取权限。

生产 CSP `connect-src 'none'` 阻止扩展页面 fetch/WS，代码与字体随包提供，无远程执行。外部 ChatGPT 链接只在用户点击时打开。

## 局限
全会话对象原子写入、线性全文搜索适合小型库；大量消息应先做性能测量。当前不恢复模拟页 DOM（刷新后新增轮次合并原记录），不恢复任何原平台状态。未提交的最后约 150ms 数据在立即关闭时可能丢失，Saved 仅保证当次已提交快照；不依赖 unload 异步写入。浏览器重启后的模拟 tab id 不保证不变，应新建会话，不支持自动重新绑定。模型容量用 24,000 字符启发提醒，不能承诺精确 token 判断。
