export function turn(
  id = "synthetic-turn-1",
  question = "把临时对话留在手中",
  answer = "从一个小而可靠的本地工具开始。",
) {
  return `<div data-turn-key="${id}"><div data-chatgpt-search-unit-key="fallback:0:user" data-chatgpt-search-message-ids="${id}"><div data-content-search-unit-key="fallback:0:user"><div data-user-message-bubble="true">${question}</div></div></div><div data-chatgpt-search-unit-key="fallback:0:assistant" data-chatgpt-search-message-ids="${id}-answer,${id}-answer"><div data-content-search-unit-key="fallback:0:assistant"><div data-markdown-text-style="assistant-message"><p>${answer}</p></div><button>Copy</button></div></div></div>`;
}
export function shell(content = turn(), id = "synthetic-conversation") {
  return `<!doctype html><html><head><meta charset="UTF-8"></head><body><main><div role="region" data-app-action-timeline-scroll><div data-chatgpt-conversation-selection-target="${id}" data-thread-find-target="conversation">${content}</div></div><div role="presentation"><div data-content-search-unit-key="hidden:0:user">hidden synthetic branch</div></div></main></body></html>`;
}

// Synthetic provider layouts: never sourced from a user's conversations.
export const otherProviders = ["claude", "grok", "gemini"] as const;
export function providerFixture(source: (typeof otherProviders)[number]) {
  const header =
    source === "claude"
      ? "<header><span>Incognito chat</span></header>"
      : source === "grok"
        ? "<header><span>Private chat</span></header>"
        : "<header><temporary-chat-header>Temporary chat</temporary-chat-header></header>";
  const body =
    source === "claude"
      ? '<div data-testid="transcript-row" data-perf-row="human" data-index="0"><div data-testid="user-message">合成问题</div></div><div data-testid="transcript-row" data-perf-row="assistant" data-index="1"><div data-testid="assistant-message"><div class="prose"><p data-stream>合成回复</p><p>保留第二段</p></div><button>复制</button></div></div>'
      : source === "grok"
        ? '<div id="response-user-native" class="items-end"><div class="message-bubble user">合成问题</div></div><div id="response-answer-native" class="items-start"><div class="message-bubble"><div class="response-content-markdown"><p data-stream>合成回复</p><p>保留第二段</p></div><button>复制</button></div></div>'
        : '<div class="conversation-container" id="turn-native"><user-query><div class="query-text"><span class="cdk-visually-hidden">You said</span>合成问题<prompt-copy-button>复制</prompt-copy-button></div></user-query><model-response><div class="model-response-text"><p data-stream>合成回复</p><p>保留第二段</p><div class="response-footer">反馈</div></div></model-response></div>';
  const origin =
    source === "claude"
      ? "https://claude.ai"
      : source === "grok"
        ? "https://grok.com"
        : "https://gemini.google.com";
  const path =
    source === "claude"
      ? "/chat/synthetic"
      : source === "grok"
        ? "/c/synthetic"
        : "/app/synthetic";
  return {
    origin,
    path,
    url: origin + path,
    html: `<!doctype html><html><head><meta charset="UTF-8"></head><body>${header}<main>${body}</main></body></html>`,
  };
}

export function genericFixture(id = "synthetic-thread", body = "") {
  return `<!doctype html><html><head><meta charset="UTF-8"></head><body><main><section data-conversation-id="${id}">${body || genericTurn()}</section></main></body></html>`;
}
export function genericTurn(
  id = "turn-1",
  question = "通用合成问题",
  answer = "通用合成回复",
) {
  return `<div data-message-id="${id}-u" data-message-author-role="user"><div data-message-content>${question}</div></div><div data-message-id="${id}-a" data-message-author-role="assistant"><div data-message-content><p data-stream>${answer}</p><p>保留第二段</p></div><button>复制</button></div>`;
}
export function deepseekFixture() {
  return '<!doctype html><html><head><meta charset="UTF-8"></head><body><main><div data-virtual-list-item-key="10"><div class="ds-message">DeepSeek 合成问题</div></div><div data-virtual-list-item-key="11"><div class="ds-message"><div class="ds-markdown"><p data-stream>DeepSeek 合成回复</p><p>保留第二段</p></div><button>复制</button></div></div></main></body></html>';
}
