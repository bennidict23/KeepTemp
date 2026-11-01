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
  source: "mock" | "manual";
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  excluded?: boolean;
  deleted?: boolean;
}
export interface Snapshot {
  id: string;
  temporary: boolean | null;
  messages: Message[];
}
export interface PlatformAdapter {
  readonly source: "mock";
  read(): Snapshot | null;
}
