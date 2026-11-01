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
