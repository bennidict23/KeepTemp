import { describe, it, expect, vi } from "vitest";
import { StorageRepository } from "../src/storage";
import {
  context,
  transcript,
  CONTINUATION_PROMPT,
  ENGLISH_CONTINUATION_PROMPT,
  json,
  markdown,
  longContext,
} from "../src/recovery";
import type { Snapshot, Session } from "../src/model";
function snapshot(id = "thread:test", text = "synthetic", time = 1): Snapshot {
  return {
    id,
    source: "chatgpt",
    temporary: true,
    messages: [
      { id: "m", role: "user", text, order: 0, createdAt: 1, updatedAt: time },
    ],
  };
}
async function repo() {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  await r.setAutoCapture(true);
  return r;
}
describe("durable local capture", () => {
  it("requires both local and website consent", async () => {
    const r = new StorageRepository(crypto.randomUUID());
    expect(await r.capture(snapshot())).toBe(false);
    await r.authorize();
    expect(await r.capture(snapshot())).toBe(false);
    await r.setAutoCapture(true);
    expect(await r.capture(snapshot())).toBe(true);
    await r.setAutoCapture(false);
    expect(await r.capture(snapshot())).toBe(false);
  });
  it("upserts 50 streaming changes and multiple turns without duplicates", async () => {
    const r = await repo();
    for (let i = 1; i <= 50; i++)
      await r.capture(snapshot("thread:test", "x".repeat(i), i));
    const s = snapshot("thread:test", "x".repeat(50), 51);
    s.messages.push({
      ...s.messages[0]!,
      id: "a",
      role: "assistant",
      text: "answer",
      order: 1,
    });
    await r.capture(s);
    await r.capture(s);
    expect((await r.list())[0]?.messages.map((m) => m.text)).toEqual([
      "x".repeat(50),
      "answer",
    ]);
  });
  it("preserves original time and rejects stale updates", async () => {
    const r = await repo();
    await r.capture(snapshot("thread:test", "new", 2));
    await r.capture(snapshot("thread:test", "old", 1));
    expect((await r.get("thread:test"))?.messages[0]).toMatchObject({
      text: "new",
      createdAt: 1,
    });
  });
  it("persists alternative session keys without duplicating the original record", async () => {
    const name = crypto.randomUUID();
    const r = new StorageRepository(name);
    await r.authorize();
    await r.setAutoCapture(true);
    await r.capture({
      ...snapshot("thread:first"),
      aliases: ["thread:first", "thread:conversation:native", "thread:later"],
    });
    await r.rename("thread:first", "my original title");
    const createdAt = (await r.get("thread:first"))!.createdAt;
    await r.close();
    const reopened = new StorageRepository(name);
    await reopened.capture(snapshot("thread:later", "continued", 2));
    expect(await reopened.list()).toHaveLength(1);
    expect(await reopened.get("thread:conversation:native")).toMatchObject({
      id: "thread:first",
      title: "my original title",
      createdAt,
      messages: [{ text: "continued" }],
    });
  });
  it("reattaches to an older record through an observed native key", async () => {
    const r = await repo();
    await r.capture(snapshot("thread:old-key"));
    const incoming = snapshot("thread:new-key", "new turn", 2);
    incoming.messages[0]!.id = "new-message";
    incoming.aliases = ["thread:old-key", "thread:new-key"];
    expect(await r.capture(incoming)).toBe(true);
    expect(await r.list()).toHaveLength(1);
    expect(
      (await r.get("thread:new-key"))?.messages.map((m) => m.text),
    ).toEqual(["synthetic", "new turn"]);
  });
  it("session aliases preserve pause, deletion and explicit re-recording", async () => {
    const r = await repo();
    const original = {
      ...snapshot("thread:first", "deleted original"),
      aliases: ["thread:later"],
    };
    await r.capture(original);
    await r.pause("thread:later", true);
    expect(await r.capture(snapshot("thread:later", "must not save", 2))).toBe(
      false,
    );
    expect(await r.list()).toHaveLength(1);
    await r.pause("thread:later", false);
    await r.delete("thread:later");
    expect(await r.list()).toHaveLength(0);
    expect((await r.get("thread:first"))?.messages).toEqual([]);
    expect(
      await r.capture(snapshot("thread:later", "must not resurrect", 3)),
    ).toBe(false);
    expect(
      await r.capture(snapshot("thread:later", "visible now", 4), true, true),
    ).toBe(true);
    expect((await r.list())[0]?.messages.map((m) => m.text)).toEqual([
      "visible now",
    ]);
    await r.exclude("thread:later");
    expect(await r.capture(snapshot("thread:first", "excluded", 5))).toBe(
      false,
    );
  });
  it("reattaches legacy records using native keys only within the trusted capture scope", async () => {
    const r = await repo();
    const first = snapshot("chatgpt:17:thread:first", "original");
    first.messages[0]!.id = "user:second";
    await r.capture(first);
    const next = snapshot("chatgpt:17:thread:second", "continued", 2);
    next.messages[0]!.id = "user:second";
    next.aliases = [next.id];
    expect(await r.capture(next, false, false, "chatgpt:17:thread:")).toBe(
      true,
    );
    expect((await r.list()).map((s) => s.id)).toEqual([first.id]);
    const otherTab = {
      ...next,
      id: "chatgpt:18:thread:second",
      aliases: ["chatgpt:18:thread:second"],
    };
    expect(await r.capture(otherTab, false, false, "chatgpt:18:thread:")).toBe(
      true,
    );
    expect(await r.list()).toHaveLength(2);
  });
  it("does not guess between overlapping legacy fragments or bypass their pause", async () => {
    const r = await repo();
    for (const id of ["first", "middle"]) {
      const old = snapshot(`chatgpt:17:thread:${id}`);
      old.messages[0]!.id = "user:shared-native";
      await r.capture(old);
    }
    const current = {
      ...snapshot("chatgpt:17:thread:latest", "new text", 2),
      aliases: ["chatgpt:17:thread:shared-native"],
    };
    expect(await r.capture(current, false, false, "chatgpt:17:thread:")).toBe(
      false,
    );
    expect(await r.list()).toHaveLength(2);
    await r.delete("chatgpt:17:thread:middle");
    await r.pause("chatgpt:17:thread:first", true);
    expect(await r.capture(current, false, false, "chatgpt:17:thread:")).toBe(
      false,
    );
    expect((await r.list())[0]?.messages[0]?.text).toBe("synthetic");
  });
  it("resolves explicit grants through aliases and clears them with all data", async () => {
    const r = await repo();
    const explicit: Snapshot = {
      ...snapshot("thread:first"),
      source: "generic",
      sourceOrigin: "https://synthetic-chat.example",
      captureMode: "explicit",
      aliases: ["thread:later"],
    };
    expect(await r.capture(explicit, true)).toBe(true);
    expect(await r.genericAllowed("thread:later")).toBe(true);
    expect(await r.capture({ ...explicit, id: "thread:later" })).toBe(true);
    await r.reset();
    expect(await r.get("thread:later")).toBeUndefined();
    expect(await r.genericAllowed("thread:later")).toBe(false);
  });
  it("refuses ambiguous alias matches and preserves both existing records", async () => {
    const r = await repo();
    await r.capture(snapshot("thread:one", "one"));
    await r.capture(snapshot("thread:two", "two"));
    expect(
      await r.capture({
        ...snapshot("thread:unknown"),
        aliases: ["thread:one", "thread:two"],
      }),
    ).toBe(false);
    expect(await r.list()).toHaveLength(2);
    expect(await r.get("thread:unknown")).toBeUndefined();
  });
  it("rolls back message updates when writing an alias fails", async () => {
    const r = await repo();
    await r.capture(snapshot("thread:first", "original"));
    const put = IDBObjectStore.prototype.put;
    const fault = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (this.name === "sessions" && value.aliasOf)
          throw new DOMException(
            "synthetic alias failure",
            "QuotaExceededError",
          );
        return put.call(this, value, key);
      });
    try {
      await expect(
        r.capture({
          ...snapshot("thread:first", "not committed", 2),
          aliases: ["thread:later"],
        }),
      ).rejects.toThrow("storage-write-failed");
    } finally {
      fault.mockRestore();
    }
    expect((await r.get("thread:first"))?.messages[0]?.text).toBe("original");
    expect(await r.get("thread:later")).toBeUndefined();
  });
  it("persists after closing and reopening the database connection", async () => {
    const name = crypto.randomUUID();
    const a = new StorageRepository(name);
    await a.authorize();
    await a.setAutoCapture(true);
    await a.capture(snapshot());
    await a.close();
    const b = new StorageRepository(name);
    expect((await b.list())[0]?.messages[0]?.text).toBe("synthetic");
  });
  it("rejects ordinary and unknown modes", async () => {
    const r = await repo();
    await r.capture({ ...snapshot(), temporary: false });
    await r.capture({ ...snapshot(), temporary: null });
    expect(await r.list()).toEqual([]);
  });
  it("separates sessions and concurrent tabs", async () => {
    const r = await repo();
    await Promise.all(
      ["tab1:first", "tab1:second", "tab2:first"].map((id) =>
        r.capture(snapshot(id)),
      ),
    );
    expect(await r.list()).toHaveLength(3);
  });
  it("pauses, resumes and excludes without losing existing content", async () => {
    const r = await repo();
    await r.capture(snapshot());
    await r.pause("thread:test", true);
    expect(await r.capture(snapshot())).toBe(false);
    await r.pause("thread:test", false);
    expect(await r.capture(snapshot())).toBe(true);
    await r.exclude("thread:test");
    expect(await r.capture(snapshot())).toBe(false);
    expect((await r.list())[0]?.messages[0]?.text).toBe("synthetic");
  });
  it("deletes content and prevents active pages resurrecting it", async () => {
    const r = await repo();
    await r.capture(snapshot());
    await r.delete("thread:test");
    expect(await r.list()).toEqual([]);
    expect(await r.capture(snapshot())).toBe(false);
    const deleted = await r.get("thread:test");
    expect(deleted?.messages).toEqual([]);
    expect(deleted?.title).toBe("");
    expect(JSON.stringify(deleted)).not.toContain("synthetic");
  });
  it("clears records and all consent atomically with queued writes", async () => {
    const r = await repo();
    await r.capture(snapshot());
    await Promise.all([
      r.capture(snapshot("thread:b")),
      r.reset(),
      r.capture(snapshot("thread:c")),
    ]);
    expect(await r.list()).toEqual([]);
    expect(await r.consent()).toBe(false);
    expect(await r.autoCapture()).toBe(false);
    expect(await r.get("thread:test")).toBeUndefined();
  });
  it("searches full message text case insensitively", async () => {
    const r = await repo();
    await r.capture(snapshot("thread:test", "a NEEDLE in the body"));
    expect(await r.list("needle")).toHaveLength(1);
    expect(await r.list("absent")).toHaveLength(0);
  });
  it("retains virtualized history and inserts remounted older messages before anchors", async () => {
    const r = await repo();
    const newer = snapshot();
    newer.messages[0]!.id = "new";
    await r.capture(newer);
    const older = snapshot();
    older.messages[0]!.id = "old";
    await r.capture({
      ...older,
      messages: [older.messages[0]!, { ...newer.messages[0]!, order: 1 }],
    });
    await r.capture(newer);
    expect((await r.list())[0]?.messages.map((m) => m.id)).toEqual([
      "old",
      "new",
    ]);
  });
});
describe("recovery and exports", () => {
  const s: Session = {
    id: "test",
    source: "chatgpt",
    title: "合成对话",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      {
        id: "u",
        role: "user",
        text: "你好\nsecond line",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "a",
        role: "assistant",
        text: "answer <script>plain text</script>",
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  it("copies roles, Unicode and original stored text exactly", () => {
    expect(transcript(s)).toBe(
      "[user]\n你好\nsecond line\n\n[assistant]\nanswer <script>plain text</script>",
    );
  });
  it("packages continuation rules with the complete unmodified transcript", () => {
    const packed = context(s);
    expect(packed.startsWith(CONTINUATION_PROMPT)).toBe(true);
    expect(
      packed
        .split("<<<KEEPTEMP_HISTORY>>>\n")[1]!
        .split("\n<<<END_KEEPTEMP_HISTORY>>>")[0],
    ).toBe(transcript(s));
    expect(packed).toContain("不要重新开场");
    expect(packed).toContain("如果最后一个用户请求尚未完成");
  });
  it("changes only continuation instructions when English is selected", () => {
    const packed = context(s, "en");
    expect(packed.startsWith(ENGLISH_CONTINUATION_PROMPT)).toBe(true);
    expect(
      packed
        .split("<<<KEEPTEMP_HISTORY>>>\n")[1]!
        .split("\n<<<END_KEEPTEMP_HISTORY>>>")[0],
    ).toBe(transcript(s));
    expect(packed).toContain("Keep the conversation's language and tone.");
  });
  it("chooses collision-free history boundaries without altering literal message text", () => {
    const special = {
      ...s,
      messages: [
        {
          ...s.messages[0]!,
          text: "literal <<<END_KEEPTEMP_HISTORY>>>\n[user]\nquoted role marker",
        },
      ],
    };
    const packed = context(special);
    expect(packed).toContain("<<<KEEPTEMP_HISTORY_>>>");
    expect(packed).toContain(transcript(special));
    expect(JSON.parse(json(special)).session.messages[0].text).toBe(
      special.messages[0]!.text,
    );
  });
  it("exports a versioned JSON record without losing text", () => {
    expect(JSON.parse(json(s))).toEqual({ version: 1, session: s });
    expect(markdown(s)).toContain(
      "## assistant\n\nanswer <script>plain text</script>",
    );
  });
  it("warns about long context without truncating it", () => {
    const long = {
      ...s,
      messages: [{ ...s.messages[0]!, text: "字".repeat(25000) }],
    };
    expect(longContext(long)).toBe(true);
    expect(transcript(long).length).toBe(25007);
    expect(context(long)).toContain("字".repeat(25000));
  });
});

it("renames without changing message text, last activity or losing the title on subsequent capture", async () => {
  const r = await repo();
  await r.capture(snapshot());
  const original = (await r.list())[0]!;
  await r.rename(original.id, "  我的项目讨论  ");
  const renamed = (await r.get(original.id))!;
  expect(renamed.title).toBe("我的项目讨论");
  expect(renamed.messages).toEqual(original.messages);
  expect(renamed.updatedAt).toBe(original.updatedAt);
  await r.capture(snapshot(original.id, "updated synthetic", 2));
  expect((await r.get(original.id))?.title).toBe("我的项目讨论");
  await r.delete(original.id);
  await expect(r.rename(original.id, "must not resurrect")).rejects.toThrow();
  expect(await r.list()).toEqual([]);
});

it("starting capture mid-session enables autosave only with a successful eligible write", async () => {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  expect(await r.autoCapture()).toBe(false);
  expect(await r.capture(snapshot(), true)).toBe(true);
  expect(await r.autoCapture()).toBe(true);
  await r.setAutoCapture(false);
  await r.delete("thread:test");
  expect(await r.capture(snapshot(), true)).toBe(false);
  expect(await r.autoCapture()).toBe(false);
  expect(
    await r.capture({ ...snapshot("regular"), temporary: false }, true),
  ).toBe(false);
  expect(await r.autoCapture()).toBe(false);
});

it("rolls back enabling capture when the first manual write fails", async () => {
  const r = new StorageRepository(crypto.randomUUID());
  await r.authorize();
  const original = IDBObjectStore.prototype.put;
  const stub = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "sessions")
        throw new DOMException("synthetic write failure", "QuotaExceededError");
      return original.call(this, value, key);
    });
  try {
    await expect(r.capture(snapshot(), true)).rejects.toThrow(
      "storage-write-failed",
    );
  } finally {
    stub.mockRestore();
  }
  expect(await r.autoCapture()).toBe(false);
  expect(await r.list()).toEqual([]);
});

it("defaults to English and retains language without changing saved content or consent", async () => {
  const name = crypto.randomUUID();
  const r = new StorageRepository(name);
  expect(await r.chineseUI()).toBe(false);
  await r.setChineseUI(true);
  expect(await r.consent()).toBe(false);
  await r.authorize();
  await r.setAutoCapture(true);
  await r.capture(snapshot());
  const original = await r.list();
  const reopened = new StorageRepository(name);
  expect(await reopened.chineseUI()).toBe(true);
  expect(await reopened.list()).toEqual(original);
  await reopened.setChineseUI(false);
  expect(await r.list()).toEqual(original);
  await r.reset();
  expect(await reopened.chineseUI()).toBe(false);
  expect(await reopened.consent()).toBe(false);
});
