import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type CDPSession,
} from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { genericFixture } from "../fixtures";
import { launchExtension } from "./launch";

// This suite uses the shipping manifest unchanged: neither test host grants nor
// mocked Chrome permission APIs may mask toolbar/activeTab integration failures.
let context: BrowserContext,
  panel: Page,
  chat: Page,
  cdp: CDPSession,
  profile: string,
  extensionId: string;
test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "keeptemp-toolbar-"));
  const extension = path.resolve(".output/chrome-mv3");
  context = await launchExtension(profile, extension);
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
  for (const origin of [
    "https://toolbar-chat.example",
    "https://toolbar-other.example",
  ])
    await context.route(origin + "/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: genericFixture(),
      }),
    );
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  chat = await context.newPage();
  await chat.goto("https://toolbar-chat.example/chat/synthetic");
  cdp = await context.browser()!.newBrowserCDPSession();
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});
async function activeUrl() {
  return panel.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab?.url ?? null;
  });
}
async function toolbarAction() {
  await chat.bringToFront();
  const targets = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab" }, { exclude: true }],
  });
  const target = targets.targetInfos.find((t) => t.url === chat.url());
  expect(target, "Chrome tab target for the synthetic chat").toBeDefined();
  await cdp.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: target!.targetId,
  });
}

async function inspectActivePage() {
  return panel.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab!.id!, frameIds: [0] },
      files: ["/content-scripts/generic.js"],
    });
    const result = await chrome.tabs.sendMessage(tab!.id!, {
      type: "keeptemp:generic-preview",
    });
    return {
      reason: result.preview.reason,
      count: result.preview.messages.length,
      origin: result.preview.origin,
    };
  });
}
test("native toolbar action grants current-origin access without persisted test host grants", async () => {
  const nativePanels = async () => {
    const targets = await cdp.send("Target.getTargets");
    return targets.targetInfos.filter(
      (t) =>
        t.type === "page" &&
        t.url === `chrome-extension://${extensionId}/sidepanel.html`,
    ).length;
  };
  const panelsBeforeAction = await nativePanels();
  await chat.bringToFront();
  expect(await activeUrl()).toBe(null);
  await toolbarAction();
  // The existing panel tab is a test controller. A separate target proves the
  // browser's actual sidebar opened, rather than only rendering the UI in a tab.
  await expect.poll(nativePanels).toBeGreaterThan(panelsBeforeAction);
  await expect.poll(activeUrl).toBe(chat.url());
  expect(await inspectActivePage()).toMatchObject({
    reason: "ready",
    count: 2,
    origin: "https://toolbar-chat.example",
  });
  await expect(panel.locator(".session")).toHaveCount(0);
});
test("cross-origin navigation revokes access until another native action", async () => {
  await chat.goto("https://toolbar-other.example/chat/second");
  await chat.bringToFront();
  expect(await activeUrl()).toBe(null);
  await toolbarAction();
  await expect.poll(activeUrl).toBe(chat.url());
  expect(await inspectActivePage()).toMatchObject({
    reason: "ready",
    count: 2,
    origin: "https://toolbar-other.example",
  });
});
test("one record click reaches native site permission with no application confirmation or fake Saved", async () => {
  await panel.evaluate(() => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const original = chrome.permissions.request.bind(chrome.permissions);
    chrome.permissions.request = (args) => {
      document.documentElement.dataset.requestedOrigins = JSON.stringify(
        args.origins,
      );
      return original(args); // Observe only; never replace Chrome's permission decision.
    };
  });
  await chat.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect
    .poll(() =>
      panel.evaluate(() => document.documentElement.dataset.requestedOrigins),
    )
    .toBe(JSON.stringify(["https://toolbar-other.example/*"]));
  await expect(panel.getByRole("region", { name: "保存前预览" })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("button", { name: "确认并记录此对话" }),
  ).toHaveCount(0);
  await expect(panel.locator(".session")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "记录当前对话", exact: true }),
  ).toBeDisabled();
  const granted = await panel.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    return chrome.permissions.getAll();
  });
  expect(granted.permissions).not.toContain("tabs");
  expect(granted.origins).not.toContain("https://*/*");
  // The native prompt remains pending in headless Chromium; the profile is closed
  // after this assertion. Accepted/denied outcomes are covered by the other suites.
});
