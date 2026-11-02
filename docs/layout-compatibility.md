# 页面布局记录

0.2.1 曾匹配不到用户页面中的旧消息属性。依据 [Oracle 新布局问题报告](https://github.com/steipete/oracle/issues/517) 与 [AI Conversation Navigator DOM 实测](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md#chatgpt) 补充了新版语义搜索单元、原生 turn key、活动时间线及会话容器身份。0.2.2 随后由用户确认可以识别与保存。

这类属性不是平台稳定接口。保留旧布局支持，在新布局中按活动 region 排除 presentation 副本，外内嵌套角色包装只捕获一次。原生 turn key 按 user/assistant 区分，不以 fallback 的窗口序号作为会话或消息身份。

虚拟列表可能移除此前消息；插件保留已观察记录，不主动滚动或调用接口补抓历史。缺少稳定会话标记或顺序锚点时仍有覆盖限制。

0.3.0 已从产品删除诊断、模拟页与开发提示。回归测试留在 tests/，通过本地请求路由提供合成页面，不读取用户私人聊天。

## 0.4.0 三家实验适配

2026-11-02 查阅公开工程资料，并用自制合成页面验证；未登录三家平台，没有读取用户聊天。页面属性属于非稳定实现细节，不是受支持 API。

[AI Conversation Navigator 的 DOM 记录](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md) 提供三家结构依据：

- Claude：近期 transcript-row 带 data-perf-row=human / assistant 及 data-index；正文含 user-message / assistant-message。仅在原生 /chat/<id> 会话已确定时使用行号；根地址要求真原生消息 ID。不会从项目名可能使用的通用字体类猜助手角色。
- Gemini：conversation-container 的原生 id 包含 user-query 与 model-response；query-text 和 model-response-text 是正文范围。user-query-content-N 的窗口编号不作为稳定身份。排除 You said 隐藏标签及复制、反馈控件。
- Grok：原生 response-* 容器、message-bubble、user / items-end 与 items-start。资料时间相对更早，实际布局需确认；不按消息单双数猜角色。

模式信号：可见原生隐私标记、明确开启的带标签控制或页眉被动状态。明确关闭优先于其他信号。正文提到“临时聊天”和仅邀请“开启”的按钮不算证据。

Grok #private 入口参考 [作者维护的 private-by-default 脚本](https://github.com/nisc/grok-userscripts/blob/main/grok-private-by-default.user.js)；只使用 URL 线索，不复制自动点击、私有请求或其他行为。Claude 控件标记参考 [Incognito by Default 内容脚本](https://github.com/generativelabs/claude-incognito-by-default/blob/main/content.js)，不自动点击切换。

没有稳定会话 URL 的临时页面按原生消息锚定。完全没有共同锚点时拆分；根地址刷新或从无会话 ID 的根地址跳到原生会话 URL 时可能拆分。不自动滚动补抓被卸载内容。真实账号验收要分别核对模式识别、角色、流式更新、刷新、SPA 新会话和多标签，不能仅以合成测试通过宣布支持所有布局。

## 0.5.0 通用引擎与 DeepSeek

GenericChatAdapter 不列厂商名单，要求可见主区中的明确 user／assistant（或 human／model）角色、原生消息 ID 及共同会话身份；没有共同会话容器时要求高唯一性原生锚点。data-index、扫描位置、正文哈希均不作为通用消息 ID。缺少稳定身份或多个活动区域／重复键时拒绝。

DeepSeek 仅 chat.deepseek.com 的实验分支参考 [作者的 DOM 实现](https://openuserjs.org/scripts/FastNow/DeepSeekExporter/source)：ds-message 内有 ds-markdown 时识别为助手，否则用户；优先明确角色，存在冲突则拒绝。原生 /a/chat/s/<id> 范围内可使用 data-virtual-list-item-key，未确定会话或缺键则拒绝。没有检查私人账号，没有获取 Token、请求接口或自动滚动。该推断依赖布局，预览需用户核对，不能以合成测试证明真实角色稳定。

通用模式不判断平台是否真的临时，记录始终标注“主动记录，网站历史可能存在”。已有四家临时自动捕获不放宽此判断。刷新可恢复同一批准会话；路由变化，即使原生会话键相同也要求再次确认，宁可分段而不沿用到新会话。

0.5.1：用户确认 Grok 按钮文字为 Private／私密聊天。自动模式识别增加此标签的可见选中状态；没有选中证据的按钮仍未知。主动预览可复用四家已有稳定 DOM 提取，绕过模式门槛但不绕过角色、身份和来源校验。相同原生会话沿用原来的存储键，避免后备记录与后来自动识别产生两个副本。实际 Grok 灰度布局仍未由开发环境验收。


## 0.5.2：DeepSeek 无 main 的虚拟列表

用户反馈“0 条、无法区分你和 AI”。代码中确认一个可复现缺陷：只查 main／role=main／log，导致存在 ds-message 但位于独立 div 虚拟列表时返回 roles-unknown。旧合成样本全包在 main 中，没有覆盖这个前提。该复现不等于已经查看并确认用户实际 DOM。

新增结构依据：[Voyager 的 DeepSeek 站点声明](https://github.com/Nagi-ovo/gemini-voyager/blob/main/src/features/plugins/catalog/sites/deepseek/site.json) 给出原生虚拟滚动区、用户 collapsible-text、助手 main-content／think-content 结构和原生 virtual-list-item-key。[DeepSeekExporter 作者源码](https://github.com/fastnow/UserJs/blob/main/DeepSeekExporter.user.js) 也包含虚拟列表可见容器。这些是第三方作者的原始工程资料，不是 DeepSeek 的稳定接口或采集许可。只参考 DOM 线索，不采用私有请求、凭据或自动滚动。

修复为优先原生虚拟列表与消息组件，保留旧布局；不让外围 data-role=virtual-item 冒充发言角色。用户正文中渲染的 markdown 仍为用户；助手思考占位与最终回复共用同一个原生消息 ID；多个正文块不丢失，也不拆成多条。排除侧栏、弹窗、菜单、输入区；多个可见原生对话区和冲突角色仍拒绝。

新增合成复现和浏览器回归包括：完全无 main、原生虚拟列表与非消息角色包装、两段助手正文及独立思考区、流式更新、刷新／关页持久化、复制一致，以及缺区域失败提示。真实账号仍待用户重试验收，不宣称全部布局已兼容。
