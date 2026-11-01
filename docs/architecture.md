# KeepTemp 架构

Chrome MV3 / WXT / TypeScript / React / IndexedDB。运行时只有内容脚本、后台和 Side Panel，不含开发测试页面。

## 捕获链路

`PlatformAdapter` 负责网页差异，返回平台无关的 Snapshot。`src/platforms.ts` 集中定义精确 origin、来源 ID、新会话链接和实验标记。工厂按 origin 选择适配器；这四家临时自动捕获在模式不确定、角色或身份不可靠时拒绝捕获，不按视觉位置或奇偶猜角色。

ChatGPT 保留已验收的新旧布局支持：角色标记、语义搜索单元、活动时间线、原生 turn key 和 conversation selection target。Claude 使用 transcript-row 的 human / assistant、会话 URL 与绝对行号；根地址没有原生消息 ID 而只有行号时拒绝。Grok 使用 Private 信号、原生 response ID 和显式角色或用户／助手结构类。Gemini 使用 Temporary header、conversation-container 原生 ID 和 user-query / model-response。三家新增适配为实验支持，证据和限制见 layout-compatibility.md。

内容脚本监听变化，每 350ms 至多处理一轮；指纹不含扫描时间，流式回复更新原消息。网页只显示小状态标记，操作折叠。只有授权后才读取聊天快照；主动记录先确认隐私模式。

内容脚本通过 runtime 消息发给 MV3 后台，后台调用 StorageRepository。后台验证扩展 id、精确 origin、顶层 frame、tab id 和有大小上限的 schema。**平台从 sender origin 决定，不信任快照自报来源。**事务完成才返回 saved；失败重试且不虚报成功。

## 数据与一致性

IndexedDB meta.consent 是本地授权。原 ChatGPT 的 meta.chatgpt-consent 键保留，新增平台使用 capture:<platform> 独立布尔键，默认关闭。主页总开关明确启用／关闭四家；主动记录成功只启用当前平台。写入事务同时检查授权、暂停和排除，后台重启后从数据库恢复状态。

会话存储键为平台 + tab id + 适配器会话 ID；旧 ChatGPT 键不变。不同平台和标签页独立。ChatGPT 优先原生 conversation selection target，否则首条用户原生消息／turn id，不因根路径变 /c 路径拆分。其他三家优先原生会话 URL；根地址以原生消息锚定，有共同锚点才连续保存，无共同锚点宁可分段，避免误合并。完全不重叠的虚拟窗口、根地址重载或后来获得原生会话 URL 仍可能分段。

消息键基于 role + 原生消息／turn key。单会话原子写入，保留首次观察时间，拒绝旧更新。虚拟化移除的已保存消息保留；新发现的旧片段按共同前后锚点插入。无共同锚点时无法保证未知历史绝对位置。不自动滚动，不使用平台 API 补抓。

暂停保存在 Session.paused。排除／删除使用标记或无内容 tombstone 阻止活跃页面回写。全部清空在一个事务内移除内容和授权。旧数据库兼容，升级不清理已有记录。

## 会话库与接续

Side Panel 本地轮询数据库观察跨页提交；搜索覆盖标题与全文，选中会话独立于搜索过滤，返回恢复列表滚动位置。列表“⋯”重命名／删除；重命名事务不改消息或聊天活动时间，后续捕获保留自定义标题。React 按纯文本展示，不执行保存内容。

RecoveryFormatter 的 transcript 保留角色与原文字；context 在外层附固定接续提示词和不冲突的边界，要求新模型承接目标、约束、结论、偏好与未完成请求，不重复开场和已完成回答。来源标签只用于会话库和导出，提示词保持平台中立。Markdown 和版本化 JSON 保持原记录，不附带接续提示词。

接续平台下拉只改变打开链接。复制由用户点击触发，之后用户自行在新临时／隐身会话粘贴发送。不自动切换平台模式、不自动输入、不发送、不调用 AI。存储、搜索和恢复不依赖平台 DOM。

## 中途接管

current-chat 控制器只查询当前窗口的活动标签页，验证精确 origin，排除共享链接，不挑选其他聊天。先 ping 接收器，缺失时才通过 scripting 补加载同一内容脚本，URL 和 DOM 不重建。

内容脚本只接受同一扩展页面发出的 inspect / record。inspect 只确认模式；record 抽取快照并发 start-current。后台验证来源、schema 和本地授权。StorageRepository 在一个事务内检查暂停／tombstone、保存快照和开启当前平台自动捕获；失败主动 abort，避免只开启未保存。暂停、排除、删除不会重建。后续复用同一身份和去重，重复接管不增加浮层或会话。

## 权限与边界

API 权限 sidePanel、scripting、activeTab；默认 host 和声明式内容脚本仅四个 HTTPS origin：chatgpt.com、claude.ai、grok.com、gemini.google.com。不含 cookies、webRequest、tabs、clipboardRead 或 unlimitedStorage。CSP connect-src none，不加载远程代码、字体或分析 SDK。

DOM 和模式信号依赖平台布局，三家新增适配尚待真实账号验收。未观察历史、附件、隐藏状态不保存；立即关闭可能丢未提交尾部；跨浏览器重启 tab id 不保证稳定；无分支版本历史；全文搜索适合小库；长上下文仅字符启发；数据库未加密、不替代备份。技术可行不代表采集许可已确认。

## 0.5.0 通用主动保存

新入口 prepareCurrentChat 优先保留四家原适配；未列出的 HTTPS origin 走运行时 generic.content。用 activeTab 补加载后，GenericChatAdapter 检查明确角色属性、原生消息标记、共同会话容器；无容器时要求足够唯一的原生锚点。多段活动区域、重复身份、冲突角色或缺少身份均 fail closed。完整预览只在内存，不持久化，不调用平台服务。角色和正文完全由用户核对，不需要自行整理或逐轮复制。

用户明确选择允许普通／未知模式的主动副本。因此该路径始终标记 captureMode=explicit、temporary=null，不伪造平台临时状态；确认只授权当前会话。确认先请求 origin + /* 的可选权限，再核对活动 tab、预览令牌与当前会话身份；后台从 sender origin 决定来源，不接受自报 origin。generic-grant:<scoped-id> 与首轮记录在同一 IndexedDB 事务写入；失败、暂停、排除／删除不启用授权。

通用键为 generic + origin + tab id + 路由摘要 + 原生会话 ID／锚点。路由在脚本内做 SHA-256，不持久化原始路径或查询参数；改变路由／会话会终止当前授权范围。消息仍复用仓库增量更新与虚拟化顺序逻辑。全局关闭撤回通用 grants，重新开启不会暗中恢复；单条删除也清除该 grant。旧数据库和 ChatGPT 键不变，无迁移清空。

generic.content 的 WXT registration=runtime、matches=[]，避免构建器从兜底匹配自动扩大默认 host 权限。optional_host_permissions 只声明 https://*/* 的可申请范围；确认成功后仅注册已授予的精确 origin。脚本刷新后检查本地授权和已批准的会话 ID，再恢复同一段；新会话没有写入授权。动态注册失败不会把已持久化记录说成丢失，用户可手动重新接管。

DeepSeek 的实验 DOM 分支使用 ds-message、ds-markdown、原生 /a/chat/s/<id> 与 virtual-list-item-key。后一种键仅在已确定原生会话时接受。角色是布局推断，预览中明确标注实验并要求核对；原生临时模式没有确认。不能宣称这是稳定接口或全站任意适配。完整网页重启、布局变化和没有共同锚点仍有边界。
