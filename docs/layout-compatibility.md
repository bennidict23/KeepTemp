# 新版页面布局兼容性记录

2026-11-02：用户提供无内容诊断：mode=true、mainRegions=1，但 roleNodes=0、turnNodes=0。这证明 0.2.1 使用的旧标记没有匹配到用户页面，不能归咎于未开启 Temporary。

查得开发者 [Oracle 的同类问题报告](https://github.com/steipete/oracle/issues/517)：新版 Chat/Work 布局移除了旧消息属性，改为语义搜索单元与原生 turn key。另参照 [AI Conversation Navigator 的 DOM 实测记录](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md#chatgpt) 关于活动时间线、重复包装和虚拟化的观察。

这些是其他开发者的结构记录，不是 OpenAI 稳定接口承诺，也不是本项目在用户账号上的实测。0.2.2 实现独立的 DOM 适配与合成回归，未使用参考项目的私有接口或历史补抓路径。

为保护私人内容，诊断只提供已知标记的数量、状态枚举和布尔值，不输出文字、标题、HTML、具体消息/会话 id、任意属性值或完整网址。新增 modernUnitNodes、activeTimelines、modernTurnNodes 用于区分新旧布局。真实兼容性仍需用户在新版上确认。
