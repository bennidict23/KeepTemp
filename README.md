# KeepTemp

**有些问题，只想问 AI，不想让合购的人看到。**

和别人合购 ChatGPT、Claude，订阅费分摊了，聊天历史却也混在一起。工作上的难题、私人的烦恼，甚至一个不好意思让别人知道自己不懂的基础问题，都可能被同账号的人翻到。

于是你打开临时／隐身聊天。可聊出了一个好方案、理清了一件重要的事，又舍不得关掉：这些有用的回答和已经讲清楚的背景，下次还想接着用。

KeepTemp 就是为这个矛盾做的浏览器插件：把网页中可读取的对话文字保存在你自己的浏览器里。关掉页面后还能找回，想继续时，复制到新聊天里接着聊，也可以换个 AI。

[下载安装包](https://github.com/bennidict23/KeepTemp/releases/latest/download/keeptemp.zip) · [安装步骤](#安装)

[![ChatGPT 面试准备对话与 KeepTemp 侧栏，显示已保存的会话和 Saved 状态](docs/save-chat.png)](docs/save-chat.png)

在 ChatGPT 中整理实习面试思路，KeepTemp 在旁边保存。截图使用虚构经历演示，点击可查看原图。

## 安装

支持桌面 **Chrome（116+）、Microsoft Edge 和 Brave**，共用同一个安装包。

1. [下载 keeptemp.zip](https://github.com/bennidict23/KeepTemp/releases/latest/download/keeptemp.zip)，解压到本地文件夹。
2. 打开浏览器的扩展管理页：Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`，Brave 为 `brave://extensions`。
3. 开启「开发者模式」，选择加载已解压的扩展，选中刚解压出来、包含 `manifest.json` 的文件夹。

安装后可在工具栏固定 KeepTemp，方便打开侧栏。使用安装包无需安装 Node.js。

<details>
<summary>从源码构建（开发者）</summary>

需要 Node.js 22.12+。在项目目录运行：

```sh
npm ci
npm run build
```

在扩展管理页加载项目下的 `.output/chrome-mv3` 文件夹。该文件夹在构建后生成；如果看不到，请在文件选择器中显示隐藏文件，或输入该文件夹的完整路径。

</details>

源码构建包含一个待体验的 ChatGPT 页面内界面：网页左侧的「本机历史」可以直接查看本机记录，点击后在主区域阅读。工具栏也可打开此入口；现有数据和原会话库保留。该界面尚待真实网页验证，下载安装包仍为已有稳定版。

## 存下来，再接着聊

1. **开始记录**：首次打开 KeepTemp，同意本地保存说明。在聊天标签页点击工具栏的 KeepTemp，再点「记录当前对话」。首次记录某个网站可能需要授予访问权限；聊到一半也能开始保存。
2. **照常聊天**：看到 `Saved`，就说明这次读到的文字已经存好。后续消息会继续更新，不用反复点击；也可以开启临时聊天的自动记录。
3. **找回或继续**：从会话库打开记录。在源码试用版里，点「接着聊」会直接返回仍在进行的原聊天；原聊天已不在时，在当前 ChatGPT 标签页恢复文字背景并发送，不另开标签页。也可以用「复制并接续」，粘贴到其他 AI 的新聊天中继续，不需要自己重新整理背景。

关掉聊天标签页，已保存的记录仍能从侧栏找到。支持全文搜索、重命名、删除和导出 Markdown／JSON；每条会话旁的「⋯」就是管理入口，网页上的状态菜单可以暂停记录。

[![右侧为 ChatGPT 的本地记录和复制并接续入口，左侧 Claude 沿用原有项目分工继续准备面试](docs/continue-chat.png)](docs/continue-chat.png)

把 ChatGPT 的记录复制到 Claude 后，沿用已有的项目经历和实际分工，继续准备面试追问。

## 支持与隐私

ChatGPT 为优先适配平台；Claude、Grok、Gemini、DeepSeek 和通用网页为实验适配。网页结构可能变化，无法可靠识别消息时会提示错误。Edge、Brave 已通过合成对话回归测试，具体范围见 [开发与测试](docs/development.md)。Firefox、Safari 和手机浏览器暂未适配。

记录已有页面时，如有隐私顾虑，请先在网站开启临时／隐身模式。KeepTemp 不会把现有普通会话变成临时会话，也不会隐藏或删除网站历史。普通对话同样可以主动保存；网站历史和平台端保留规则由网站决定。

KeepTemp 不需要注册、API Key 或后端服务，不上传到 KeepTemp 服务器，没有云同步或第三方分析。点击「接着聊」会把记录发送给 ChatGPT；无法确认临时模式时停止。本地数据库没有应用层加密，同一浏览器配置的使用者可能访问记录，重要内容请按需导出备份。

接续只带走文字，不恢复原服务端会话、附件或工具状态；效果取决于目标模型及其上下文容量。详见 [隐私与安全边界](PRIVACY.md)。

<details>
<summary>开发与研究背景</summary>

WXT + TypeScript + React + IndexedDB。欢迎改进页面适配、保存可靠性和交互；提交问题时请勿附带私人聊天内容。

[架构](docs/architecture.md) · [开发与测试](docs/development.md) · [可行性与平台限制](docs/feasibility.md)

这个出发点也有研究依据：[CHI 2026 的共享 LLM 账号研究](https://arxiv.org/html/2603.22822v1#S4.SS4.SSS2)记录了担心被他人看到而回避敏感话题、调整提问或删除历史的行为。

</details>

代码采用 [MIT License](LICENSE)。平台采集及扩展发布的许可需单独确认，见 [可行性与平台限制](docs/feasibility.md)。
