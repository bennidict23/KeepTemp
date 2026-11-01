# 页面布局记录

0.2.1 曾匹配不到用户页面中的旧消息属性。依据 [Oracle 新布局问题报告](https://github.com/steipete/oracle/issues/517) 与 [AI Conversation Navigator DOM 实测](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md#chatgpt) 补充了新版语义搜索单元、原生 turn key、活动时间线及会话容器身份。0.2.2 随后由用户确认可以识别与保存。

这类属性不是平台稳定接口。保留旧布局支持，在新布局中按活动 region 排除 presentation 副本，外内嵌套角色包装只捕获一次。原生 turn key 按 user/assistant 区分，不以 fallback 的窗口序号作为会话或消息身份。

虚拟列表可能移除此前消息；插件保留已观察记录，不主动滚动或调用接口补抓历史。缺少稳定会话标记或顺序锚点时仍有覆盖限制。

0.3.0 已从产品删除诊断、模拟页与开发提示。回归测试留在 tests/，通过本地请求路由提供合成页面，不读取用户私人聊天。
