# 可行性与风险

研究及更新日期：2026-11-02。

## 当前状态

0.2.2 对新版 ChatGPT 页面结构的适配已由用户确认可以识别和保存。0.3.0 以此为基础收敛界面，保留自动捕获、持久化、查找与接续。自动化验证使用合成内容和独立 profile；用户验收不等于所有账号、语言和灰度界面都兼容。

技术路径为可见 DOM → 内容脚本 → 扩展后台 → 本地 IndexedDB。没有私有接口、凭据提取、网络拦截、自动输入或自动发送。

## 平台条款

[OpenAI 使用条款](https://openai.com/policies/row-terms-of-use/) 限制自动或程序化提取数据及输出。本项目最初未启用真实捕获；用户后来明确要求先实现，不以条款确认作为当前开发门槛。该指令不构成平台许可：当前仍没有获得适用于该功能的 OpenAI 授权，不能以技术可运行或竞品存在宣称可以公开发布。

[Temporary Chat 官方说明](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt) 描述临时会话不进入普通历史，但平台可为安全保留副本最多 30 天；原生保存会将其转为普通聊天。KeepTemp 不执行该转换，只存本地文字副本。

## Chrome 与发布

[Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) 需要 sidePanel 权限；页面读取通过 chatgpt.com 限定内容脚本。[商店用户数据要求](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) 同样适用于只在本地处理数据的扩展。项目尚未上架，正式发布前应复核条款、发布可访问隐私政策并准确披露数据用途。

[TCX Temporary Chat Saver](https://chromewebstore.google.com/detail/tcx-temporary-chat-saver/cgjidpkaabokdjlfaakggpdopmieijle) 也声明提供本地保存，因此不宣称首创。KeepTemp 的产品取舍是无感自动保存、最少控制、本地可找回、真实提交状态及可审计边界。

具体网页选择器存在变化风险，见 [布局记录](layout-compatibility.md)。数据没有应用层加密，也没有自动备份。完整恢复服务器会话、附件、工具状态或未观察历史不在当前能力内。
