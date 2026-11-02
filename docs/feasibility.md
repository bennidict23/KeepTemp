# 可行性与风险

研究及更新日期：2026-11-02。

## 当前状态

0.2.2 对新版 ChatGPT 页面结构的适配已由用户确认可以识别和保存。0.3.0 以此为基础收敛界面，保留自动捕获、持久化、查找与接续。自动化验证使用合成内容和独立 profile；用户验收不等于所有账号、语言和灰度界面都兼容。

技术路径为可见 DOM → 内容脚本 → 扩展后台 → 本地 IndexedDB。没有私有接口、凭据提取、网络拦截、自动输入或自动发送。

## 平台条款

[OpenAI 使用条款](https://openai.com/policies/row-terms-of-use/) 限制自动或程序化提取数据及输出。本项目最初未启用真实捕获；用户后来明确要求先实现，不以条款确认作为当前开发门槛。该指令不构成平台许可：当前仍没有获得适用于该功能的 OpenAI 授权，不能以技术可运行或竞品存在宣称可以公开发布。

[Temporary Chat 官方说明](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt) 描述临时会话不进入普通历史，但平台可为安全保留副本最多 30 天；原生保存会将其转为普通聊天。KeepTemp 不执行该转换，只存本地文字副本。

## Chrome 与发布

[Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) 需要 sidePanel 权限；页面读取通过四个精确站点限定的内容脚本。中途接管使用 [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) 给已打开页面补加载脚本，需 scripting 与目标平台的精确 host 权限。[商店用户数据要求](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) 同样适用于只在本地处理数据的扩展。项目尚未上架，正式发布前应复核条款、发布可访问隐私政策并准确披露数据用途。

[TCX Temporary Chat Saver](https://chromewebstore.google.com/detail/tcx-temporary-chat-saver/cgjidpkaabokdjlfaakggpdopmieijle) 也声明提供本地保存，因此不宣称首创。KeepTemp 的产品取舍是无感自动保存、最少控制、本地可找回、真实提交状态及可审计边界。

具体网页选择器存在变化风险，见 [布局记录](layout-compatibility.md)。数据没有应用层加密，也没有自动备份。完整恢复服务器会话、附件、工具状态或未观察历史不在当前能力内。

## 0.4.0：用户明确扩展到四个平台

用户要求支持 Claude、Grok、Gemini 与跨平台接续。接续是完整角色文字加本地固定提示词，选择目标平台仅改变打开入口，不调用目标 API，也不要求原平台配合。来源保存在 UI 和导出记录中，不写入接续提示词。

新增捕获沿用 DOM → 后台 → IndexedDB，只读取挂载文字，保守识别 Temporary／Incognito／Private。三家均为实验支持，只有合成测试，不能宣称真实账号可用。共享账号是否允许、采集和公开发布是否获准仍需分别确认；未获得三家对本扩展的授权，不以第三方 DOM 资料作为许可证明。

平台功能参考：

- [Claude Incognito 官方说明](https://support.claude.com/en/articles/12260368-use-incognito-chats)：隐身聊天与普通历史区分。入口只打开 /new，用户须自行开启隐身模式；没有平台承诺稳定的 DOM 接口。
- [Gemini 官方临时聊天说明](https://support.google.com/gemini/answer/13275745?hl=en)：临时模式需主动开启，账号可用性不同。[Gemini 隐私说明](https://support.google.com/gemini/answer/13594961) 介绍临时聊天平台端保留；不因为本地保存改变这些规则。
- [Grok 官方 FAQ](https://x.ai/legal/faq) 与 [产品 FAQ](https://docs.x.ai/grok/faq)：Private Chat 与普通历史有区别。本扩展只适配 grok.com，不适配 X 内嵌界面。

新增权限仅为三个精确 HTTPS 站点，仍无 cookies、请求拦截、凭据访问或平台 API。原 ChatGPT 授权保留；升级不会自动开启其他平台。主页总开关明确开启四家，主动记录仅开启当前平台。Claude／Gemini 新会话入口不自动保证隐私模式，界面要求用户发送前确认。

工程判断：跨平台文字接续可直接实现；自动保存取决于模式信号、稳定消息身份和挂载范围。Claude 根地址只有虚拟行号时不保存；无共同原生锚点时拆分而非冒险混淆。更多布局依据见 [页面布局记录](layout-compatibility.md)。

## 0.5.0：通用保存与 DeepSeek 的明确结果

用户将“保存”置于接续之前，并明确授权：普通或模式未知的网页对话也可在主动确认后保存，但必须提醒网站里的历史仍存在。这是对原“仅临时”边界的明确产品变更；四家原临时自动捕获仍严格判断。

[DeepSeek 官方隐私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)（页内更新 2026-02-10）描述输入、输出与聊天历史处理；本次未从官方资料确认原生 Temporary／Incognito 模式。未登录账号验证，不能因此断言所有账号都没有该功能，更不能把另存本地宣称为平台历史隐藏。[DeepSeek 使用条款](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html)（页内更新 2026-03-27）也不构成本扩展采集授权。

公开作者的 [DeepSeekExporter DOM 源码](https://openuserjs.org/scripts/FastNow/DeepSeekExporter/source) 提供 ds-message、ds-markdown、virtual-list-item-key 及 /a/chat/s/ 路径参考。只参考这些网页结构线索，不采用该工具的凭据访问、私有 API、网络拦截或自动滚动路径。合成页面验证了 DOM 捕获闭环，真实布局与 native item key 的长期稳定性仍待用户验收。

通用技术边界：可以针对带明确角色与稳定身份的未列出网站复用引擎；无法保证任意网站无需规则即可提取。没有可靠结构时明确拒绝，不把导入或逐轮复制作为核心替代，也不把通用原型宣传成全面支持。

权限参考：[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) 在用户调用扩展后授予当前页临时访问；[permissions.request](https://developer.chrome.com/docs/extensions/reference/api/permissions#method-request) 允许在用户操作时请求可选范围的子集。实现将全 HTTPS 范围仅声明为 optional，确认时只请求当前 origin，不默认读取所有网站。Chrome 原生授权弹窗需用户实际验收；浏览器自动化以隔离测试副本中的合成站点权限模拟已授予状态，不能用此宣称弹窗已实测通过。

## 0.5.1 工具栏访问与 Grok 反馈

用户反馈工具栏提示循环，以及 Grok 显示 Private 但插件拒绝识别。第一项已在未修改生产 manifest 的独立 Chromium 中复现：原生工具栏动作只打开侧栏，activeTab 仍不可见；改为 action.onClicked 显式打开后，当前 URL 和通用预览可用，跨 origin 后权限撤回符合预期。

依据 [Chrome activeTab 文档](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[Chrome 团队的侧栏指导](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/chrome-extensions/references/extensions/side-panel.md) 与 [Chromium 讨论](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DET2SXCFnDg)，侧栏内点击不等价于调用扩展 action。实现注册真正 action 点击，保持临时授权语义，不改成全站读取。回归用 [Extensions.triggerAction](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-triggerAction) 触发 Chrome 原生 action，不直接调用应用回调，也不预先赋予测试域名权限。

第二项包含产品路径遗漏：已有适配站点仍被模式检查挡在通用预览之外。0.5.1 已统一主动入口，普通／未知模式也可预览确认。补充 Private 可见选中信号；仅按钮文字不足时不声称已确认隐私。Grok 的真实 DOM 仍需用户验收，但模式未知本身不再阻止主动副本。
