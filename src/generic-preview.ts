import type { Message } from "./model";
import type { GenericReason } from "./generic-adapter";
export interface GenericPreview {
  tabId: number;
  origin: string;
  token: string;
  id: string;
  messages: Message[];
  reason: GenericReason;
  method: "semantic" | "deepseek-layout" | "platform-layout";
}
export function genericReason(reason: GenericReason) {
  return {
    ready: "",
    "no-content": "没有找到可识别的聊天消息，尚未保存。",
    "region-missing":
      "网页中有消息，但没定位到对话区域，尚未保存；需要适配这个页面布局。",
    "roles-unknown":
      "无法可靠区分你和 AI 的消息，尚未保存；这个页面需要进一步适配。",
    "identity-missing":
      "页面缺少稳定的消息标记，暂不能可靠追踪更新，尚未保存。",
    ambiguous: "发现多段或互相冲突的消息，尚未保存；请保留当前页面。",
    "unsupported-page": "此页面不适合记录；共享链接和非 HTTPS 页面不保存。",
  }[reason];
}
