import { openDB, type DBSchema } from "idb";
import type { Session, Snapshot } from "./model";
interface Schema extends DBSchema {
  sessions: { key: string; value: Session };
  meta: { key: string; value: boolean };
}
export class StorageRepository {
  private db;
  constructor(name = "keeptemp-v1") {
    this.db = openDB<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore("sessions", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
  }
  async consent() {
    return (await this.db).get("meta", "consent").then(Boolean);
  }
  async autoCapture() {
    return Boolean(await (await this.db).get("meta", "chatgpt-consent"));
  }
  async setAutoCapture(enabled: boolean) {
    await (await this.db).put("meta", enabled, "chatgpt-consent");
  }
  async authorize() {
    await (await this.db).put("meta", true, "consent");
  }
  async list(query = "") {
    const q = query.toLocaleLowerCase();
    return (await (await this.db).getAll("sessions"))
      .filter(
        (s) =>
          !s.deleted &&
          (!q ||
            `${s.title}\n${s.messages.map((m) => m.text).join("\n")}`
              .toLocaleLowerCase()
              .includes(q)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async get(id: string) {
    return (await this.db).get("sessions", id);
  }
  async capture(snapshot: Snapshot) {
    if (snapshot.temporary !== true || !snapshot.messages.length) return false;
    const db = await this.db;
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    if (!(await tx.objectStore("meta").get("consent"))) {
      await tx.done;
      return false;
    }
    if (
      snapshot.source === "chatgpt" &&
      !(await tx.objectStore("meta").get("chatgpt-consent"))
    ) {
      await tx.done;
      return false;
    }
    const store = tx.objectStore("sessions");
    const old = await store.get(snapshot.id);
    if (old?.excluded || old?.deleted || old?.paused) {
      await tx.done;
      return false;
    }
    const messages = new Map(old?.messages.map((m) => [m.id, m]));
    let nextOrder =
      Math.max(-1, ...[...messages.values()].map((m) => m.order)) + 1;
    for (const m of [...snapshot.messages].sort((a, b) => a.order - b.order)) {
      const previous = messages.get(m.id);
      if (!previous || m.updatedAt >= previous.updatedAt)
        messages.set(m.id, {
          ...m,
          order: previous?.order ?? nextOrder++,
          createdAt: previous?.createdAt ?? m.createdAt,
        });
    }
    const all = [...messages.values()].sort((a, b) => a.order - b.order);
    const now = Date.now();
    await store.put({
      id: snapshot.id,
      source: snapshot.source ?? "mock",
      title:
        old?.title ??
        (all[0]?.text.slice(0, 70) ||
          (snapshot.source === "chatgpt"
            ? "ChatGPT Temporary Chat"
            : "Synthetic chat")),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      messages: all,
    });
    await tx.done;
    return true;
  }
  async importSession(session: Session) {
    const db = await this.db;
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    if (!(await tx.objectStore("meta").get("consent")))
      throw new Error("consent-required");
    await tx.objectStore("sessions").put(session);
    await tx.done;
  }
  async exclude(id: string) {
    const db = await this.db;
    const tx = db.transaction("sessions", "readwrite");
    const s = await tx.store.get(id);
    if (s) await tx.store.put({ ...s, excluded: true });
    await tx.done;
  }
  async pause(id: string, paused: boolean) {
    const db = await this.db;
    const tx = db.transaction("sessions", "readwrite");
    const s = await tx.store.get(id);
    if (s && !s.deleted) await tx.store.put({ ...s, paused });
    await tx.done;
  }
  async delete(id: string) {
    const db = await this.db;
    const tx = db.transaction("sessions", "readwrite");
    await tx.store.put({
      id,
      source: "mock",
      title: "",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
      deleted: true,
    });
    await tx.done;
  }
  async reset() {
    const db = await this.db;
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    await tx.objectStore("sessions").clear();
    await tx.objectStore("meta").clear();
    await tx.done;
  }
  async close() {
    (await this.db).close();
  }
}
