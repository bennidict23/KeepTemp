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
