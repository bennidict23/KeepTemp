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
