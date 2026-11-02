# 可行性与平台限制

KeepTemp 的技术路径是可读取 DOM → 内容脚本 → 扩展后台 → 本地 IndexedDB。没有私有接口、凭据提取、网络拦截或自动滚动。接续发送只在用户点击明确按钮后，通过新 ChatGPT 标签页的可见输入框和发送按钮完成，不使用私有接口；未知临时模式、页面或草稿发生变化时停止。技术可运行与平台允许采集、允许发布是独立问题；目前没有取得各平台对本功能的明确授权。

## 产品是否成立

项目首先面向共用或合购 AI 账号的人：不想让同账号的人在普通历史里翻到自己的工作问题、私人烦恼或知识盲区，于是使用临时／隐身聊天；但有用的回答和已经交代的背景又想留给自己。隐私顾虑与个人留存之间的矛盾是主要动机，误关页后的找回是后续收益。

CHI 2026 论文 [“Don’t Look, But I Know You Do”: Norms and Observer Effects in Shared LLM Accounts](https://arxiv.org/html/2603.22822v1)调查 245 名共享账号用户、访谈 36 人，记录了因潜在旁观者而调整提问、回避话题或删除历史的现象（§4.4.2）。研究支持这一顾虑的存在；样本主要涉及 ChatGPT，结论基于参与者自述，不能据此推算市场规模或证明 KeepTemp 的效果。

KeepTemp 的产品判断是：让用户自行启用平台临时模式，把文字副本留在自己的浏览器，再将完整背景复制到新会话接续。插件不替平台建立账号隔离，也不隐藏普通历史。跨平台接续是文字迁移，不依赖目标平台 API，效果受模型能力与上下文容量影响。

[TCX Temporary Chat Saver](https://chromewebstore.google.com/detail/tcx-temporary-chat-saver/cgjidpkaabokdjlfaakggpdopmieijle) 等已有产品也提供本地保存，不应宣称首创。KeepTemp 的取舍是保存、查找和一次复制接续形成简单闭环，同时让保存状态对应真实提交，避免云服务和复杂整理功能。

## 平台功能与条款

- **ChatGPT**：[Temporary Chat 官方说明](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt) 区分普通历史与临时聊天，并说明平台端仍可能保留副本。[OpenAI 使用条款](https://openai.com/policies/row-terms-of-use/) 对自动或程序化提取数据及输出有限制。DOM 读取并不因此自动获得豁免；公开分发前仍需确认适用条款及许可。
- **Claude**：[Incognito 官方说明](https://support.claude.com/en/articles/12260368-use-incognito-chats) 介绍隐身聊天。打开新聊天不等于已经启用隐身模式；没有平台承诺稳定的 DOM 接口。
- **Grok**：[产品 FAQ](https://docs.x.ai/grok/faq) 提供 Private Chat 功能资料。当前规则只针对 grok.com，不包含 X 内嵌界面；单独出现 Private 按钮不证明模式已开启。
- **Gemini**：[临时聊天说明](https://support.google.com/gemini/answer/13275745?hl=en) 和 [隐私说明](https://support.google.com/gemini/answer/13594961) 是平台模式及保留规则的依据。本地副本不改变这些规则。
- **DeepSeek**：[隐私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) 与 [使用条款](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html) 不构成本扩展的采集授权。项目尚未从官方资料及真实账号确认统一的临时模式，主动记录不能被宣传为隐藏平台历史。

以上为研究参考，不是法律意见或平台背书。功能、地区适用性及条款可能变化，发布前须重新核查；不得以竞品存在或用户同意作为平台许可。

## Chrome 权限与发布

使用 [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) 和 [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)。默认 host 只有 chatgpt.com、claude.ai、grok.com 和 gemini.google.com。其他 HTTPS 网站只在用户点击记录时，通过 [permissions.request](https://developer.chrome.com/docs/extensions/reference/api/permissions#method-request) 申请当前 origin；全 HTTPS 声明仅为可选范围，不是默认授权。

未上架 Chrome Web Store。[用户数据政策](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) 同样需要评估；正式发布前应提供可访问的隐私政策并准确披露数据用途。代码的 MIT 许可不替代商店审核或平台采集许可。

## DOM 依据与技术限制

| 适配                 | 结构依据与边界                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ChatGPT              | 原生角色、turn key、新版语义搜索单元与活动时间线；保留旧布局，排除 presentation 副本。早期识别保存曾由用户确认可用。           |
| Claude／Grok／Gemini | 使用各自的角色组件、原生会话及消息身份。Claude 根地址只有虚拟行号时拒绝；Gemini 窗口编号不当作消息 ID；Grok 不按单双数猜角色。 |
| DeepSeek             | 原生虚拟列表、消息键、用户折叠正文与助手正文；不依赖 main 存在，不把思考区当最终回答。                                         |
| 通用提取             | 要求明确角色、稳定消息 ID 和可确定的会话范围；不能保证任意网站零适配。                                                         |

工程参考来自作者维护的 [AI Conversation Navigator DOM 记录](https://github.com/JoonJ14/ai-conversation-navigator/blob/main/DOM-REFERENCE.md)、[Voyager DeepSeek 配置](https://github.com/Nagi-ovo/gemini-voyager/blob/main/src/features/plugins/catalog/sites/deepseek/site.json) 和 [DeepSeekExporter 源码](https://github.com/fastnow/UserJs/blob/main/DeepSeekExporter.user.js)。只参考结构线索，不采用凭据访问、私有请求或自动滚动路径；这些资料不是平台稳定接口或授权证明。

Claude、Grok、Gemini、DeepSeek 与通用规则仍为实验适配，主要由合成页面验证，没有完成真实账号全面验收。虚拟列表中从未读取的旧内容无法补抓，无共同身份锚点时可能分段，立即关页可能丢失未提交的流式尾部。数据未做应用层加密，也没有自动备份。详见 [隐私说明](../PRIVACY.md) 与 [测试边界](development.md)。
