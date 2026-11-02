import {
  PLATFORMS,
  captureKey,
  isPlatform,
  platformName,
  type PlatformId,
} from "./platforms";
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
  async darkMode() {
    return (await this.db).get("meta", "dark-mode");
  }
  async setDarkMode(dark: boolean) {
    await (await this.db).put("meta", dark, "dark-mode");
  }
  async consent() {
    return (await this.db).get("meta", "consent").then(Boolean);
  }
  async autoCapture(source?: PlatformId) {
    const db = await this.db;
    if (source) return Boolean(await db.get("meta", captureKey(source)));
    return (
      (await this.enabledPlatforms()).length > 0 ||
      (await this.genericCount()) > 0
    );
  }
  async enabledPlatforms() {
    const db = await this.db;
    const values = await Promise.all(
      PLATFORMS.map((p) => db.get("meta", captureKey(p.id))),
    );
    return PLATFORMS.filter((_p, i) => values[i]).map((p) => p.id);
  }
  async genericCount() {
    const db = await this.db;
    const keys = await db.getAllKeys("meta");
    return keys.filter((k) => k.startsWith("generic-grant:")).length;
  }
  async genericAllowed(id: string) {
    return Boolean(await (await this.db).get("meta", `generic-grant:${id}`));
  }
  async setAutoCapture(enabled: boolean, source?: PlatformId) {
    const db = await this.db;
    const tx = db.transaction("meta", "readwrite");
    for (const p of PLATFORMS)
      if (!source || p.id === source)
        await tx.store.put(enabled, captureKey(p.id));
    if (!enabled && !source) {
      for (const key of await tx.store.getAllKeys())
        if (key.startsWith("generic-grant:")) await tx.store.delete(key);
    }
    await tx.done;
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
  async capture(
    snapshot: Snapshot,
    enableCapture = false,
    restartDeleted = false,
  ) {
    const requestedExplicit = snapshot.captureMode === "explicit";
    if (
      !snapshot.messages.length ||
      !snapshot.messages.some((m) => m.text.trim()) ||
      (snapshot.source === "generic" && !requestedExplicit) ||
      (!requestedExplicit && snapshot.temporary !== true)
    )
      return false;
    if (requestedExplicit) {
      try {
        const origin = new URL(snapshot.sourceOrigin!);
        if (
          origin.protocol !== "https:" ||
          origin.origin !== snapshot.sourceOrigin
        )
          return false;
      } catch {
        return false;
      }
    }
    const db = await this.db;
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    try {
      if (!(await tx.objectStore("meta").get("consent"))) {
        await tx.done;
        return false;
      }
      const store = tx.objectStore("sessions");
      let old = await store.get(snapshot.id);
      // Only a new explicit record command may replace a deletion marker.
      // Drop the tombstone entirely: never restore deleted title/messages/times.
      if (old?.deleted && enableCapture && restartDeleted) old = undefined;
      if (old?.excluded || old?.deleted || old?.paused) {
        await tx.done;
        return false;
      }
      const explicit = requestedExplicit || old?.captureMode === "explicit";
      if (!enableCapture) {
        const key = explicit
          ? `generic-grant:${snapshot.id}`
          : isPlatform(snapshot.source)
            ? captureKey(snapshot.source)
            : null;
        if (key && !(await tx.objectStore("meta").get(key))) {
          await tx.done;
          return false;
        }
      }
      if (enableCapture && explicit)
        await tx.objectStore("meta").put(true, `generic-grant:${snapshot.id}`);
      else if (enableCapture && isPlatform(snapshot.source))
        await tx.objectStore("meta").put(true, captureKey(snapshot.source));
      const messages = new Map(old?.messages.map((m) => [m.id, m]));
      const incoming = [...snapshot.messages].sort((a, b) => a.order - b.order);
      const ordered = [...messages.values()]
        .sort((a, b) => a.order - b.order)
        .map((m) => m.id);
      for (let i = 0; i < incoming.length; i++) {
        const m = incoming[i]!;
        const previous = messages.get(m.id);
        if (!previous) {
          // Older virtualized turns may be prepended when the user scrolls back.
          const next = incoming
            .slice(i + 1)
            .find((n) => ordered.includes(n.id));
          const prev = [...incoming.slice(0, i)]
            .reverse()
            .find((n) => ordered.includes(n.id));
          if (next) ordered.splice(ordered.indexOf(next.id), 0, m.id);
          else if (prev) ordered.splice(ordered.indexOf(prev.id) + 1, 0, m.id);
          else ordered.push(m.id);
        }
        if (!previous || m.updatedAt >= previous.updatedAt)
          messages.set(m.id, {
            ...m,
            createdAt: previous?.createdAt ?? m.createdAt,
          });
      }
      const all = ordered.map((id, order) => ({ ...messages.get(id)!, order }));
      const now = Date.now();
      await store.put({
        id: snapshot.id,
        source: snapshot.source ?? "mock",
        ...(explicit
          ? {
              sourceOrigin: requestedExplicit
                ? snapshot.sourceOrigin
                : old?.sourceOrigin,
              captureMode: "explicit" as const,
            }
          : {}),
        title:
          old?.title ??
          (all[0]?.text.slice(0, 70) ||
            (isPlatform(snapshot.source)
              ? `${platformName(snapshot.source)} 对话`
              : snapshot.source === "generic"
                ? "未命名对话"
                : "Synthetic chat")),
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        messages: all,
      });
      await tx.done;
      return true;
    } catch {
      try {
        tx.abort();
      } catch {
        /* Already settled. */
      }
      await tx.done.catch(() => {});
      throw new Error("storage-write-failed");
    }
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
  async rename(id: string, title: string) {
    const name = title.trim().replace(/\s+/g, " ");
    if (!name || name.length > 100) throw new Error("invalid-title");
    const db = await this.db;
    const tx = db.transaction("sessions", "readwrite");
    const s = await tx.store.get(id);
    if (!s || s.deleted) {
      await tx.done;
      throw new Error("session-not-found");
    }
    await tx.store.put({ ...s, title: name });
    await tx.done;
  }
  async delete(id: string) {
    const db = await this.db;
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    await tx.objectStore("meta").delete(`generic-grant:${id}`);
    await tx.objectStore("sessions").put({
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
