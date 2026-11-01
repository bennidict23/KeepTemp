# OpenAI 平台许可询问草稿（未发送）

用途：可通过 [官方支持入口](https://help.openai.com/en/articles/6614161-how-can-i-contact-support) 询问并请求转交有权确认该用途的团队。草稿不含用户私人聊天、凭据或账号信息。本项目尚未获得对应授权；一封泛化客服回复不能自动被解释为许可。

Subject: Permission clarification for a local-only Chrome extension saving a user's own Temporary Chat

Hello OpenAI team,

We are evaluating KeepTemp, a proposed open-source Chrome extension. Its intended purpose is to let a user continue using Temporary Chat at chatgpt.com as usual, while retaining a local plaintext copy of that user's conversation without converting it into regular ChatGPT history.

We understand that the Terms of Use prohibit automatically or programmatically extracting data or Output. We have not enabled capture on ChatGPT. Our current prototype automatically captures only our own bundled synthetic chat page.

The proposed real-platform feature would, only after explicit user consent:

- Passively read the visible user and assistant message text from the DOM in the user's active Temporary Chat and update a local record as replies stream.
- Store role, plaintext, order and locally observed timestamps in the extension's IndexedDB, with pause, exclusion, deletion and export controls.
- Make no private API calls, extract no credentials, intercept no network traffic, bypass no access controls, and perform no automatic input or sending.
- Upload no transcripts and include no analytics. Recovery would copy text only when the user clicks, leaving the user to paste and send it in a new chat.

Could you please clarify:

1. Is this specific passive DOM-based local backup permitted under the applicable Terms of Use? If not, is there an authorization process or a supported API/export mechanism for consumer Temporary Chat that preserves its temporary status?
2. Would permission, if available, cover both personal local use and distribution of the extension through an open-source repository and Chrome Web Store? What conditions or regional limitations would apply?
3. Is there a written policy or a team authorized to provide a definitive answer for this specific integration?

We will keep real-platform capture disabled unless the applicable permission and implementation boundaries are established. We are not requesting access to other users' conversations or any bypass of platform restrictions.

Thank you.
