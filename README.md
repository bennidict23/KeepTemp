<div align="center">

# KeepTemp

**English** · [简体中文](README.zh-CN.md)

### A browser extension to save temporary AI chats as local history.

[**📥 Download**](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip) · [Install](#install)

</div>

Sharing a ChatGPT or Claude subscription also means sharing its chat history. Personal worries, work problems, even a basic question you feel awkward asking can end up in someone else's sidebar.

You open a temporary or incognito chat to keep it out of the shared history. Then you work out a useful plan or finally explain the background clearly—and want to keep it for yourself.

**KeepTemp is a local conversation library for people sharing AI accounts.** Turn on recording and chat as usual. Your saved text stays in your browser, outside the shared account's history, ready to find and continue later.

<div align="center">

<a href="docs/chatgpt-sidebar.png"><img src="docs/chatgpt-sidebar.png" width="360" alt="KeepTemp local history inside the complete ChatGPT sidebar"></a> &nbsp; <a href="docs/claude-sidebar.png"><img src="docs/claude-sidebar.png" width="270" alt="KeepTemp local history inside the complete Claude sidebar"></a>

<sub>KeepTemp inside the ChatGPT and Claude sidebars. Original screenshots, fictional conversations. Click any image to enlarge.</sub>

</div>

- **💾 Save as you chat.** Keep useful temporary conversations with ongoing updates. You can start recording halfway through; saved text remains available after closing the original tab.
- **🔎 Find your own history.** ChatGPT and Claude share one local library, with source labels and full-text search. Rename or delete through the **⋯** menu, and export Markdown or JSON.
- **🔁 Copy & continue.** Copy the complete stored transcript and a continuation prompt into a new chat. Stay with the same AI or switch platforms without explaining the background all over again. You choose where to paste and send.

<div align="center">

<a href="docs/local-history.png"><img src="docs/local-history.png" width="960" alt="The full ChatGPT page showing its original sidebar alongside a saved KeepTemp conversation, Copy & continue and export"></a>

<sub>Open a saved conversation inside the ChatGPT interface. Copy the context and continue.</sub>

</div>

No KeepTemp account or API key. No conversation uploads, cloud sync, or analytics.

## Install

Chrome 116+ · Edge · Brave

1. [Download the ZIP](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip) and extract it.
2. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
3. Enable **Developer mode** → **Load unpacked** → select the extracted folder containing `manifest.json`.

**Start:** Enable temporary / incognito mode on the website, open KeepTemp, and choose **Record current chat**. `Saved` confirms the current text is stored locally.

<sub>KeepTemp does not hide or delete website history. Local storage is not encrypted. [Privacy & limits](PRIVACY.md)</sub>

<details>
<summary>⚙️ Build from source</summary>

Node.js 22.12+. Run in the project directory:

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` as the unpacked extension. Show hidden folders in the picker if needed.

[Development & tests](docs/development.md) · [Architecture](docs/architecture.md) · [Platform restrictions](docs/feasibility.md)

</details>

[Preview build & known limits](docs/development.md#测试方法与边界) · [MIT License](LICENSE)
