# 可行性与发布风险

> 0.2.0 状态更新：用户后续明确要求先实现真实捕获、不以条款确认作为当前开发门槛。已据此接入实验性 ChatGPT DOM 适配器，且仍只使用可见 DOM，不使用私有接口、凭据或拦截。下文为此前可行性审查记录；许可风险没有消失，不代表当前适配器仍被代码禁用。真实账号验收尚未完成。

研究日期：2026-11-02。网页会更新，发布前必须复核。以下为工程产品风险判断，不是平台许可或法律意见。

## 结论
工程闭环已在本地合成页面验证，但核心产品目标尚未达成。手动粘贴/导入仅保留为原型能力，不能替代无感自动保存，不继续扩展为主产品。参见 [2026-11-02 自动保存路径复核](automatic-capture-review.md)。**真实 ChatGPT 自动采集不启用**，无页面注入、隐藏开关或私有接口。技术可读取 DOM 不等于获准公开发布。用户同意安装扩展也不能替代平台许可。

## Temporary Chat 的当前边界
[OpenAI 官方说明](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt) 描述临时会话在保持临时状态时不进入普通历史、不用于模型改进，但平台可为安全保留副本最多 30 天。当前产品支持用户主动转为普通聊天。KeepTemp 的差异是本地文字副本，不执行该转换。本文不把 Temporary 等同于零服务端保留；恢复也不会重新建立原服务器会话。具体 UI、账号与地域差异未以真实登录账号验证。

## 条款
[非欧洲地区条款](https://openai.com/policies/row-terms-of-use/)（页面标示 2026-01-01 生效）禁止 “Automatically or programmatically extract data or Output”。[欧洲条款](https://openai.com/policies/terms-of-use/) 也包含相应限制。因此普通用户拥有输入/输出的内容权利，并不能推导出允许程序化提取。

手动流程仅接受用户自行从服务界面复制并主动提供的文字、用户已有的 KeepTemp JSON，不驱动平台页面或自动点击复制。此路径减少程序化提取风险，但不代表已经获得 OpenAI 或商店预先批准。用户应确保有权保存导入内容。重新评估自动适配器前需要明确适用条款/平台书面授权、真实 DOM 稳定消息身份和 Temporary 识别证据，以及独立合成回归覆盖。

## MV3 和隐私
[Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) 需要 sidePanel 权限；本项目最低 Chrome 116。
[Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) 可以读取页面 DOM，但不提供服务条款豁免；本项目不声明内容脚本。
[存储与 origin](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)：内容脚本直接使用网页存储会进入宿主 origin，本项目将数据库置于扩展页面 origin。未申请 unlimitedStorage，空间不足需要真实报错。浏览器存储不能代替备份。
[Chrome 商店用户数据要求](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)：即使仅在本地处理，也必须披露数据用途和隐私政策。正式上架前需提供可公开访问的隐私政策、准确填写数据使用披露并复核商店规则。私有仓库不是公开上架。

## 已有产品与差异
| 产品 | 开发者页面声明 | KeepTemp 判断 |
| --- | --- | --- |
| [TCX Temporary Chat Saver](https://chromewebstore.google.com/detail/tcx-temporary-chat-saver/cgjidpkaabokdjlfaakggpdopmieijle) | 本地保存和继续 Temporary Chat | 本地保存已存在，不应声称首创。可审计的提交确认、条款门控、最小权限及准确边界是本项目重点。 |
| [Save ChatGPT Chats](https://microsoftedge.microsoft.com/addons/detail/djeoflhmklclgfpglgeihefkcmebafeb) | 将临时聊天内容转入新的持久聊天 | KeepTemp 不执行服务端转存或自动发送，恢复由用户主动复制。 |

仅研究开发者公开产品页，未安装、未读取其源码，也未验证其隐私承诺或平台许可，不能用竞品存在证明采集合法。

## 尚未验证与下一步
- 真实 ChatGPT DOM、账号操作、附件/工具/分支恢复：未验证且未实现。
- 自动捕获商业发布可行性：受条款阻挡；需要平台许可后另行设计，不能仅新增 DOM 选择器绕过。
- Chrome Web Store 审核、配额压力、断电崩溃、完整操作系统重启：尚未验证。
- 下一步先确认真实自动捕获的许可与来源，再决定是否开发真实适配器。无明确依据前暂停功能扩展，不扩大权限。
