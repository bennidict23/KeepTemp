<div align="center">

# KeepTemp

[English](README.md) · **简体中文**

### Shared AI accounts. Your own local history.<br>Different AI models. One personal library.

有些问题，只想问 AI，不想让同账号的人翻到。<br>KeepTemp 把临时对话保存在自己的浏览器里，关掉页面后还能找回，下次带着背景接着聊。

[**下载安装包**](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip) · [安装步骤](#安装)

<a href="docs/save-chat.png"><img src="docs/save-chat.png" width="880" alt="ChatGPT 和 Claude 的侧栏展示同一份个人本机会话库"></a>

<sub>两个网站，同一份本机记录。截图使用虚构对话演示。</sub>

**持续保存。** 临时聊天也能留下记录，聊到一半才开始保存也可以。

**随时找回。** 搜索、重命名、删除，或导出 Markdown／JSON。

**复制接续。** 一次复制完整记录与接续提示词，粘贴到新聊天，也可以换个 AI。

<a href="docs/continue-chat.png"><img src="docs/continue-chat.png" width="960" alt="已保存的对话、复制并接续按钮，以及 Markdown 和 JSON 导出入口"></a>

<sub>打开记录，复制背景，由你粘贴并发送。</sub>

无需注册 KeepTemp 或填写 API Key，不上传对话，无云同步或第三方统计。

## 安装

Chrome 116+ · Edge · Brave

</div>

1. [下载安装包](https://github.com/bennidict23/KeepTemp/releases/download/v0.9.0/keeptemp.zip)并解压。
2. 打开 `chrome://extensions`、`edge://extensions` 或 `brave://extensions`。
3. 开启 **开发者模式** → **加载已解压的扩展** → 选择解压后包含 `manifest.json` 的文件夹。

<div align="center">

**开始使用：** 在网站开启临时／隐身模式，打开 KeepTemp，点击 **Record current chat**。看到 `Saved`，表示当次读取到的文字已存入本机。

<sub>插件不会隐藏或删除网站历史，本地数据库未加密。<br>[隐私与使用边界](PRIVACY.md)</sub>

</div>

<details>
<summary>从源码构建</summary>

需要 Node.js 22.12+。在项目目录运行：

```sh
npm ci
npm run build
```

加载项目下的 `.output/chrome-mv3` 文件夹；文件选择器中看不到时，请显示隐藏文件夹。

[开发与测试](docs/development.md) · [架构](docs/architecture.md) · [平台限制](docs/feasibility.md)

</details>

<div align="center">

[预览版与已知限制](docs/development.md#测试方法与边界) · [MIT License](LICENSE)

</div>
