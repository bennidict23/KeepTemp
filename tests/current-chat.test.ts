import { beforeEach, describe, it, expect, vi } from "vitest";
import { PLATFORMS } from "../src/platforms";
const api = vi.hoisted(() => ({
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  scripting: { executeScript: vi.fn() },
}));
vi.mock("wxt/browser", () => ({ browser: api }));
import {
  recordCurrentChat,
  CurrentChatError,
  currentChatError,
} from "../src/current-chat";
beforeEach(() => {
  vi.resetAllMocks();
  api.tabs.query.mockResolvedValue([
    { id: 17, url: "https://chatgpt.com/c/synthetic?temporary-chat=true" },
  ]);
  api.tabs.sendMessage.mockImplementation(
    async (_id: number, r: { type: string }) =>
      r.type === "keeptemp:record-current"
        ? { ok: true, saved: true }
        : { ok: true },
  );
  api.scripting.executeScript.mockResolvedValue([]);
});
const repo = () => ({ consent: vi.fn().mockResolvedValue(true) });
describe("start recording an existing chat", () => {
  it.each(PLATFORMS)("accepts the selected $name origin", async (platform) => {
    api.tabs.query.mockResolvedValue([{ id: 17, url: platform.url }]);
    await recordCurrentChat(repo());
    expect(api.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(17, {
      type: "keeptemp:record-current",
    });
  });
  it("records an already running page without navigation or reinjection", async () => {
    await recordCurrentChat(repo());
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
    expect(api.tabs.sendMessage.mock.calls.map((c) => c[1].type)).toEqual([
      "keeptemp:ping",
      "keeptemp:inspect-current",
      "keeptemp:record-current",
    ]);
  });
  it("loads the missing script into only the selected tab and top frame", async () => {
    api.tabs.sendMessage.mockRejectedValueOnce(new Error("no receiver"));
    await recordCurrentChat(repo());
    expect(api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 17, frameIds: [0] },
      files: ["/content-scripts/chatgpt.js"],
    });
  });
  it("never picks a different chat when the selected page is unrelated", async () => {
    api.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.org" }]);
    await expect(recordCurrentChat(repo())).rejects.toMatchObject({
      code: "not-chatgpt",
    });
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
  it("requires consent before reading tabs or injecting", async () => {
    await expect(
      recordCurrentChat({ consent: async () => false }),
    ).rejects.toMatchObject({ code: "consent-required" });
    expect(api.tabs.query).not.toHaveBeenCalled();
  });
  it.each(["regular", "temporary-unknown"])(
    "does not start on %s mode",
    async (reason) => {
      api.tabs.sendMessage.mockImplementation(
        async (_id: number, r: { type: string }) =>
          r.type === "keeptemp:inspect-current"
            ? { ok: false, error: reason }
            : { ok: true },
      );
      await expect(recordCurrentChat(repo())).rejects.toMatchObject({
        code: reason,
      });
      expect(
        api.tabs.sendMessage.mock.calls.some(
          (c) => c[1].type === "keeptemp:record-current",
        ),
      ).toBe(false);
    },
  );
  it.each(["paused", "excluded", "storage-failed"])(
    "does not report Saved on %s",
    async (reason) => {
      api.tabs.sendMessage.mockImplementation(
        async (_id: number, r: { type: string }) =>
          r.type === "keeptemp:record-current"
            ? { ok: false, error: reason }
            : { ok: true },
      );
      await expect(recordCurrentChat(repo())).rejects.toMatchObject({
        code: reason,
      });
    },
  );
  it("retries a busy writer without creating another content script", async () => {
    let attempts = 0;
    api.tabs.sendMessage.mockImplementation(
      async (_id: number, r: { type: string }) =>
        r.type === "keeptemp:record-current"
          ? ++attempts === 1
            ? { ok: false, error: "busy" }
            : { ok: true, saved: true }
          : { ok: true },
    );
    await recordCurrentChat(repo());
    expect(attempts).toBe(2);
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
  it("explains denied site access without exposing raw errors", async () => {
    api.tabs.sendMessage.mockRejectedValue(new Error("private diagnostic"));
    api.scripting.executeScript.mockRejectedValue(
      new Error("private diagnostic"),
    );
    let caught: unknown;
    try {
      await recordCurrentChat(repo());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CurrentChatError);
    expect(currentChatError(caught)).toContain("允许访问当前平台的网站");
    expect(currentChatError(caught)).not.toContain("private");
  });
});
