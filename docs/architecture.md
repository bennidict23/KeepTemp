# KeepTemp 架构

Chrome MV3 / WXT / TypeScript / React / IndexedDB。运行时只有内容脚本、扩展后台和 Side Panel；不包含开发测试页面。

## 捕获链路

`ChatGPTAdapter` 只负责网页差异，返回平台无关的 Snapshot。支持旧角色标记，以及新 app-shell 的语义搜索单元、活动时间线和原生 turn key；不通过视觉位置交替猜角色。Temporary 识别不确定或稳定身份不足时拒绝捕获。

内容脚本负责监听、合并扫描、去重、状态与暂停操作。每 350ms 至多处理一轮；指纹不包含扫描时间，避免无改动重复写入。网页只显示小状态标记，操作折叠，不展示诊断或开发信息。

真实页面不能直接访问扩展 IndexedDB，因此通过 runtime 消息 → MV3 后台 → `StorageRepository`。后台验证精确 origin、扩展 id、顶层 frame、tab id 以及有大小上限的快照。事务完成才返回 saved；失败重试且不虚报保存成功。

## 数据与一致性

IndexedDB meta.consent 是本地授权，meta.chatgpt-consent 是网站自动捕获授权；事务同时检查，关闭授权后不再写入。后台重启后从持久化数据库恢复状态。

新版会话键由 tab id 与原生 conversation selection target 组成；无该标记时回退首条用户原生消息/turn id。消息按 role + native turn key 区分。这样同一轮用户和助手各自更新，外内双层搜索包装不重复。从 / 跳到 /c 不依赖 URL 路径拆会话；不同标签页独立。

单会话原子写入，保留首个观察时间，拒绝更老的消息更新。页面虚拟化卸载的记录不会被删除。新出现的旧片段按快照内已知前后锚点插入；完全没有共同锚点时不能保证未知历史的绝对位置。不滚动补抓，不使用平台 API。

暂停存储在 Session.paused；排除与删除使用标记或无内容 tombstone，阻止活跃页面重新捕获。全部清空在一个事务内移除内容与授权。旧版本数据库格式兼容，不清理用户已有记录。

## 会话库与接续

Side Panel 读取扩展数据库，以本地轮询观察跨页提交；全文搜索覆盖标题与消息。选中会话不受搜索过滤结果影响，返回列表恢复滚动位置。列表会话菜单提供重命名和删除；重命名在事务中更新标题，不改变消息或最后聊天时间，后续自动捕获保留自定义标题。React 纯文本插值展示记录，不执行保存内容。

`RecoveryFormatter` 的 transcript 保留角色和原文字，context 在其外层附加固定接续提示词，并选用不会与正文冲突的边界。提示词要求新模型沿用目标、约束、结论和偏好，从未完成处继续，不重复开场或已完成回答。Markdown 与版本化 JSON 导出保持原记录，不附带提示词。复制由点击触发；不自动输入或发送消息。

## 权限与限制

API 权限为 sidePanel 和 scripting；声明式与手动补加载脚本的 host 权限都精确限定 https://chatgpt.com/*。无 cookies、webRequest、tabs、clipboardRead 或 unlimitedStorage 权限。生产扩展 CSP connect-src none，不引入远程代码或字体。

已知限制：DOM 和 Temporary 信号依赖平台布局；未观察历史、附件、隐藏状态不保存；立即关闭可能丢失未提交尾部；跨浏览器重启 tab id 不保证稳定；不提供分支版本历史；全文搜索适合小库；长上下文只做字符启发提醒；数据库未加密且不替代备份。

## 中途接管

Side Panel 的 current-chat 控制器只查询当前窗口的活动标签页，验证精确 origin，排除共享链接，不退而挑选其他聊天。先 ping 已存在脚本，只有接收器缺失时才通过 scripting 注入打包的同一脚本。页面 URL、DOM 和对话不重建。

内容脚本只接受同一扩展页面发出的 inspect/record 控制消息。inspect 仅确认临时模式；record 抽取当前快照，再向后台发 start-current。后台仍验证顶层来源、数据 schema 与本地授权。StorageRepository 在同一个事务内检查 paused/tombstone，然后保存快照并开启自动捕获；失败主动 abort，避免只开启授权却没保存。被暂停、排除或删除的会话不会重建。

后续轮询复用同一身份和去重逻辑。重复接管不会再注入一个状态浮层或建立另一会话。内容脚本只处理页面已挂载文字，不承诺补全此前已虚拟化移除的消息。
