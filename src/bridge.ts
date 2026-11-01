import type { PlatformId } from "./platforms";
import type { Snapshot } from "./model";
export type BridgeRequest =
  | { type: "keeptemp:state"; id?: string }
  | { type: "keeptemp:capture"; snapshot: Snapshot }
  | { type: "keeptemp:start-current"; snapshot: Snapshot }
  | { type: "keeptemp:exclude"; id: string }
  | { type: "keeptemp:pause"; id: string; paused: boolean };
export interface BridgeResponse {
  ok: boolean;
  consent?: boolean;
  saved?: boolean;
  paused?: boolean;
  excluded?: boolean;
  error?: string;
}
export function validSnapshot(
  value: unknown,
  allowExplicit = false,
): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Snapshot;
  if (
    typeof s.id !== "string" ||
    s.id.length > 600 ||
    !s.id.startsWith("thread:") ||
    !(
      s.temporary === true ||
      (allowExplicit &&
        s.source === "generic" &&
        s.captureMode === "explicit" &&
        (s.temporary === null || typeof s.temporary === "boolean"))
    ) ||
    !Array.isArray(s.messages) ||
    !s.messages.length ||
    s.messages.length > 10000
  )
    return false;
  let size = 0;
  const ids = new Set<string>();
  return s.messages.every((m) => {
    if (
      !m ||
      typeof m.id !== "string" ||
      m.id.length > 300 ||
      ids.has(m.id) ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.text !== "string" ||
      !Number.isSafeInteger(m.order) ||
      m.order < 0 ||
      !Number.isFinite(m.createdAt) ||
      !Number.isFinite(m.updatedAt)
    )
      return false;
    ids.add(m.id);
    size += m.text.length;
    return size <= 2_000_000;
  });
}
export function scopedChatId(
  tabId: number,
  id: string,
  source: PlatformId | "generic" = "chatgpt",
  origin = "",
) {
  return source === "generic"
    ? `generic:${encodeURIComponent(origin)}:${tabId}:${id}`
    : `${source}:${tabId}:${id}`;
}
