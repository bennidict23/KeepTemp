import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type CDPSession,
} from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { genericFixture } from "../fixtures";

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
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-unsafe-extension-debugging",
    ],
  });
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
test("native toolbar action grants current-origin access and unlocks generic preview without host grants", async () => {
  await chat.bringToFront();
  expect(await activeUrl()).toBe(null);
  await toolbarAction();
  await expect.poll(activeUrl).toBe(chat.url());
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("region", { name: "保存前预览" })).toBeVisible();
  await expect(panel.locator(".preview-messages article")).toHaveCount(2);
  await expect(panel.locator(".session")).toHaveCount(0);
  const permissions = await panel.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    return chrome.permissions.getAll();
  });
  expect(permissions.permissions).not.toContain("tabs");
  // activeTab is temporary access, not a grant to every site or a persisted host.
  expect(permissions.origins ?? []).not.toContain("https://*/*");
});
test("cross-origin navigation revokes temporary access until another real toolbar action", async () => {
  await chat.goto("https://toolbar-other.example/chat/second");
  await chat.bringToFront();
  expect(await activeUrl()).toBe(null);
  await toolbarAction();
  await expect.poll(activeUrl).toBe(chat.url());
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("region", { name: "保存前预览" })).toContainText(
    "toolbar-other.example",
  );
  await expect(panel.locator(".session")).toHaveCount(0);
});
