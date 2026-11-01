import { describe, it, expect } from "vitest";
import { StorageRepository } from "../src/storage";
import { context, json, markdown, longContext } from "../src/recovery";
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
    expect((await r.get("thread:test"))?.messages).toEqual([]);
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
    expect(context(s)).toBe(
      "[user]\n你好\nsecond line\n\n[assistant]\nanswer <script>plain text</script>",
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
    expect(context(long).length).toBe(25007);
  });
});
