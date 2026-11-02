import type { PlatformId } from "./platforms";
export type Role = "user" | "assistant";
export interface Message {
  id: string;
  role: Role;
  text: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
export interface Session {
  id: string;
  source: "mock" | "manual" | "generic" | PlatformId;
  sourceOrigin?: string;
  captureMode?: "explicit";
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  excluded?: boolean;
  paused?: boolean;
  deleted?: boolean;
  aliasOf?: string;
}
export interface Snapshot {
  source?: "mock" | "generic" | PlatformId;
  sourceOrigin?: string;
  captureMode?: "explicit";
  id: string;
  temporary: boolean | null;
  messages: Message[];
  aliases?: string[];
}
export function snapshotFingerprint(snapshot: Snapshot) {
  return JSON.stringify([
    snapshot.id,
    snapshot.aliases ?? [],
    snapshot.messages.map((m) => [m.id, m.role, m.text]),
  ]);
}
export interface PlatformAdapter {
  readonly source: "mock" | PlatformId;
  read(): Snapshot | null;
}

export type CaptureIssue =
  | "ready"
  | "no-content"
  | "region-missing"
  | "roles-unknown"
  | "identity-missing"
  | "ambiguous"
  | "unsupported-page";

export interface CaptureCandidate {
  tabId: number;
  origin: string;
  token: string;
  id: string;
  messages: Message[];
  reason: CaptureIssue;
  method: "semantic" | "deepseek-layout" | "platform-layout";
}

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
  sessionId?: string;
  theme?: "light" | "dark" | "system";
  language?: "en" | "zh";
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
    s.messages.length > 10000 ||
    (s.aliases !== undefined &&
      (!Array.isArray(s.aliases) ||
        s.aliases.length > 10000 ||
        !s.aliases.every(
          (id) =>
            typeof id === "string" &&
            id.startsWith("thread:") &&
            id.length <= 600,
        )))
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
