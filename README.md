<div align="center">

# KeepTemp

**English** · [简体中文](README.zh-CN.md)

### Shared AI accounts. Your own local history.<br>Different AI models. One personal library.

Some questions are for AI, not everyone sharing your account.<br>KeepTemp saves temporary conversations in your own browser, so you can find them later and pick up where you left off.

[**Download**](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip) · [Install](#install)

<a href="docs/save-chat.png"><img src="docs/save-chat.png" width="880" alt="The same personal conversation library in the ChatGPT and Claude sidebars"></a>

<sub>Your local ChatGPT and Claude records, together. Screenshots use fictional conversations.</sub>

**Save as you chat.** Record temporary conversations continuously, even when you start halfway through.

**Find your own history.** Search, rename, delete, and export Markdown or JSON.

**Copy & continue.** Take the full stored conversation and a continuation prompt into a new chat, on either platform.

<a href="docs/continue-chat.png"><img src="docs/continue-chat.png" width="960" alt="A saved conversation with Copy & continue and Markdown or JSON export"></a>

<sub>Open a saved chat. Copy the context. Paste and send when you're ready.</sub>

No KeepTemp account or API key. No conversation uploads, cloud sync, or analytics.

## Install

Chrome 116+ · Edge · Brave

</div>

1. [Download the ZIP](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip) and extract it.
2. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
3. Enable **Developer mode** → **Load unpacked** → select the extracted folder containing `manifest.json`.

<div align="center">

**Start:** Enable temporary / incognito mode on the website, open KeepTemp, and choose **Record current chat**. `Saved` confirms the current text is stored locally.

<sub>KeepTemp does not hide or delete website history. Local storage is not encrypted.<br>[Privacy & limits](PRIVACY.md)</sub>

</div>

<details>
<summary>Build from source</summary>

Node.js 22.12+. Run in the project directory:

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` as the unpacked extension. Show hidden folders in the picker if needed.

[Development & tests](docs/development.md) · [Architecture](docs/architecture.md) · [Platform restrictions](docs/feasibility.md)

</details>

<div align="center">

[Preview build & known limits](docs/development.md#测试方法与边界) · [MIT License](LICENSE)

</div>
