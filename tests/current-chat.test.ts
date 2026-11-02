import { beforeEach, describe, it, expect, vi } from "vitest";
import { PLATFORMS } from "../src/platforms";
const api = vi.hoisted(() => ({
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  permissions: { request: vi.fn() },
  scripting: {
    executeScript: vi.fn(),
    getRegisteredContentScripts: vi.fn(),
    registerContentScripts: vi.fn(),
  },
}));
vi.mock("wxt/browser", () => ({ browser: api }));
import {
  recordCurrentChat,
  recordCurrentPage,
  prepareCurrentChat,
  confirmGeneric,
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
  api.permissions.request.mockResolvedValue(true);
  api.scripting.getRegisteredContentScripts.mockResolvedValue([]);
  api.scripting.registerContentScripts.mockResolvedValue(undefined);
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
      files: ["/content-scripts/capture.js"],
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

const preview = {
  origin: "https://synthetic-chat.example",
  tabId: 17,
  token: "preview-token",
  id: "thread:native",
  reason: "ready" as const,
  method: "semantic" as const,
  messages: [],
};
describe("generic preview and explicit grants", () => {
  it("previews an unlisted HTTPS origin without saving or requesting persistent access", async () => {
    api.tabs.query.mockResolvedValue([
      { id: 17, url: preview.origin + "/chat" },
    ]);
    api.tabs.sendMessage.mockImplementation(
      async (_id: number, r: { type: string }) =>
        r.type === "keeptemp:generic-preview"
          ? { ok: true, preview }
          : { ok: true },
    );
    expect(await prepareCurrentChat(repo())).toMatchObject(preview);
    expect(api.permissions.request).not.toHaveBeenCalled();
    expect(
      api.tabs.sendMessage.mock.calls.some((c) => c[1].type.includes("record")),
    ).toBe(false);
  });
  it("does not read tabs before local consent or inject into restricted/shared pages", async () => {
    await expect(
      prepareCurrentChat({ consent: async () => false }),
    ).rejects.toMatchObject({ code: "consent-required" });
    expect(api.tabs.query).not.toHaveBeenCalled();
    for (const url of [
      "chrome://settings",
      "http://synthetic-chat.example",
      "https://synthetic-chat.example/share/a",
    ]) {
      api.tabs.query.mockResolvedValue([{ id: 17, url }]);
      await expect(prepareCurrentChat(repo())).rejects.toMatchObject({
        code: "not-chatgpt",
      });
    }
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
  it("denied host permission never starts a capture", async () => {
    api.permissions.request.mockResolvedValue(false);
    await expect(confirmGeneric(preview)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  });
  it("rejects a switched tab and reports an expired preview", async () => {
    await expect(confirmGeneric(preview)).rejects.toMatchObject({
      code: "preview-expired",
    });
    expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    api.tabs.query.mockResolvedValue([{ id: 17, url: preview.origin }]);
    api.tabs.sendMessage.mockResolvedValue({
      ok: false,
      error: "preview-expired",
    });
    await expect(confirmGeneric(preview)).rejects.toMatchObject({
      code: "preview-expired",
    });
  });
});

describe("built-in manual entry falls back to reviewed recording", () => {
  it.each(["regular", "temporary-unknown", "no-content"])(
    "offers preview after %s",
    async (reason) => {
      const origin = "https://grok.com";
      api.tabs.query.mockResolvedValue([
        { id: 17, url: origin + "/c/synthetic" },
      ]);
      api.tabs.sendMessage.mockImplementation(
        async (_id: number, r: { type: string }) => {
          if (r.type === "keeptemp:inspect-current" && reason !== "no-content")
            return { ok: false, error: reason };
          if (r.type === "keeptemp:record-current")
            return { ok: false, error: reason };
          if (r.type === "keeptemp:generic-preview")
            return {
              ok: true,
              preview: { ...preview, origin, method: "platform-layout" },
            };
          return { ok: true };
        },
      );
      expect(await prepareCurrentChat(repo())).toMatchObject({
        origin,
        reason: "ready",
      });
      expect(api.permissions.request).not.toHaveBeenCalled();
    },
  );
  it.each(["paused", "excluded", "storage-failed"])(
    "never bypasses %s",
    async (reason) => {
      api.tabs.sendMessage.mockImplementation(
        async (_id: number, r: { type: string }) =>
          r.type === "keeptemp:record-current"
            ? { ok: false, error: reason }
            : { ok: true },
      );
      await expect(prepareCurrentChat(repo())).rejects.toMatchObject({
        code: reason,
      });
      expect(
        api.tabs.sendMessage.mock.calls.some(
          (c) => c[1].type === "keeptemp:generic-preview",
        ),
      ).toBe(false);
    },
  );
});

describe("one-click recording verifies the actual committed row", () => {
  const stored = {
    id: "saved-row",
    source: "generic" as const,
    title: "synthetic",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      {
        id: "m",
        role: "user" as const,
        text: "synthetic",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  function setupCandidate(reason = "ready") {
    api.tabs.query.mockResolvedValue([
      { id: 17, url: preview.origin + "/chat" },
    ]);
    api.tabs.sendMessage.mockImplementation(
      async (_id: number, r: { type: string }) => {
        if (r.type === "keeptemp:generic-preview")
          return {
            ok: true,
            preview: { ...preview, reason, messages: stored.messages },
          };
        if (r.type === "keeptemp:generic-record")
          return { ok: true, saved: true, sessionId: stored.id };
        return { ok: true };
      },
    );
    return {
      consent: async () => true,
      get: vi.fn().mockResolvedValue(stored),
    };
  }
  it("preflights and commits directly, returning a row that really exists", async () => {
    const repository = setupCandidate();
    expect(await recordCurrentPage(repository)).toBe(stored.id);
    expect(repository.get).toHaveBeenCalledWith(stored.id);
    expect(
      api.tabs.sendMessage.mock.calls.some(
        (c) => c[1].type === "keeptemp:generic-record",
      ),
    ).toBe(true);
  });
  it.each(["region-missing", "roles-unknown", "identity-missing", "ambiguous"])(
    "refuses %s without requesting a site grant or claiming success",
    async (reason) => {
      const repository = setupCandidate(reason);
      await expect(recordCurrentPage(repository)).rejects.toMatchObject({
        code: reason,
      });
      expect(api.permissions.request).not.toHaveBeenCalled();
      expect(repository.get).not.toHaveBeenCalled();
    },
  );
  it("does not trust Saved when no row exists or a concurrent deletion won", async () => {
    const repository = setupCandidate();
    repository.get.mockResolvedValue(undefined);
    await expect(recordCurrentPage(repository)).rejects.toMatchObject({
      code: "not-saved",
    });
    repository.get.mockResolvedValue({
      ...stored,
      deleted: true,
      messages: [],
    });
    await expect(recordCurrentPage(repository)).rejects.toMatchObject({
      code: "not-saved",
    });
  });
  it("records recognized temporary chats with the same durable-row verification", async () => {
    api.tabs.sendMessage.mockImplementation(
      async (_id: number, r: { type: string }) =>
        r.type === "keeptemp:record-current"
          ? { ok: true, saved: true, sessionId: stored.id }
          : { ok: true },
    );
    expect(
      await recordCurrentPage({
        consent: async () => true,
        get: async () => stored,
      }),
    ).toBe(stored.id);
    expect(api.permissions.request).not.toHaveBeenCalled();
  });
  it("permission rejection cannot commit or report success", async () => {
    const repository = setupCandidate();
    api.permissions.request.mockResolvedValue(false);
    await expect(recordCurrentPage(repository)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(
      api.tabs.sendMessage.mock.calls.some(
        (c) => c[1].type === "keeptemp:generic-record",
      ),
    ).toBe(false);
  });
});
