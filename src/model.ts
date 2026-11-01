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
}
export interface Snapshot {
  source?: "mock" | "generic" | PlatformId;
  sourceOrigin?: string;
  captureMode?: "explicit";
  id: string;
  temporary: boolean | null;
  messages: Message[];
}
export interface PlatformAdapter {
  readonly source: "mock" | PlatformId;
  read(): Snapshot | null;
}
