import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
let browser: BrowserContext, base: string, profile: string;
test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "keeptemp-test-"));
  const extension = path.resolve(".output/chrome-mv3");
  browser = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] ??
    (await browser.waitForEvent("serviceworker"));
  base = `chrome-extension://${new URL(worker.url()).host}`;
});
test.afterAll(async () => {
  await browser?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});
test("synthetic capture persists across refresh and closing the tab; tabs remain separate", async () => {
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  const demo = await browser.newPage();
  await demo.goto(`${base}/demo.html`);
  await demo.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(demo.locator("[data-role=assistant]")).toHaveText(
    "先完成一个小而可靠的闭环：保存、找回、复制。所有文字均为合成测试数据。",
  );
  await expect(demo.getByRole("status")).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await demo.reload();
  await demo.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(demo.locator("[data-role=assistant]")).toHaveText(
    "先完成一个小而可靠的闭环：保存、找回、复制。所有文字均为合成测试数据。",
  );
  await expect(demo.getByRole("status")).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session")).toContainText("4 条消息");
  const second = await browser.newPage();
  await second.goto(demo.url());
  await second.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(second.locator("[data-role=assistant]")).toHaveText(
    "先完成一个小而可靠的闭环：保存、找回、复制。所有文字均为合成测试数据。",
  );
  await expect(second.getByRole("status")).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(2);
  await demo.close();
  await second.close();
  await panel.reload();
  await expect(panel.locator(".session")).toHaveCount(2);
  await panel.locator(".session").first().click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText(
    "所有文字均为合成测试数据",
  );
  await panel
    .getByRole("button", { name: "会话库", exact: false })
    .first()
    .click();
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
});
test("real build has no host access and blocks regular/unknown synthetic chats", async () => {
  const manifest = JSON.parse(
    await fs.readFile(".output/chrome-mv3/manifest.json", "utf8"),
  );
  expect(manifest.permissions).toEqual(["sidePanel"]);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  const page = await browser.newPage();
  await page.goto(`${base}/demo.html`);
  await page.locator("#mode").selectOption("false");
  await page.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(page.getByRole("status")).toContainText("未保存");
  await page.locator("#mode").selectOption("unknown");
  await page.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(page.getByRole("status")).toContainText("未保存");
  await page.close();
});

test("manual import, exact clipboard copy, export, search and permanent deletion", async () => {
  await browser.grantPermissions(["clipboard-read", "clipboard-write"]);
  const panel = await browser.newPage();
  await panel.setViewportSize({ width: 390, height: 900 });
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  await panel.getByRole("button", { name: "粘贴或导入对话" }).click();
  const transcript =
    "[user]\n合成隐私测试\n第二行\n\n[assistant]\n纯文本 <img src=x onerror=alert(1)>。";
  await panel.locator("textarea").fill(transcript);
  await panel.getByRole("button", { name: "保存到本地", exact: true }).click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  expect(await panel.locator(".messages img").count()).toBe(0);
  await panel.getByRole("button", { name: "复制上下文" }).click();
  await expect(panel.getByRole("status")).toHaveText("已复制上下文");
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(
    transcript,
  );
  const download = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "JSON", exact: true }).click();
  const file = await download;
  const data = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
  expect(data.session.messages.map((m: { text: string }) => m.text)).toEqual([
    "合成隐私测试\n第二行",
    "纯文本 <img src=x onerror=alert(1)>。",
  ]);
  await panel.screenshot({
    path: "docs/sidepanel-preview.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "← 会话库", exact: true }).click();
  await panel.getByRole("searchbox").fill("第二行");
  await expect(panel.locator(".session")).toHaveCount(1);
  await panel.locator(".session").click();
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "删除会话", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(0);
  await panel.getByRole("searchbox").fill("");
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
  await panel.close();
});

test("real IndexedDB write failure displays error and never Saved", async () => {
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  const page = await browser.newPage();
  await page.goto(`${base}/demo.html`);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("synthetic quota failure", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "添加合成一轮（流式）" }).click();
  await expect(page.locator("[data-role=assistant]")).toHaveText(
    "先完成一个小而可靠的闭环：保存、找回、复制。所有文字均为合成测试数据。",
  );
  await expect(page.getByRole("status")).toContainText("保存失败");
  await expect(page.getByRole("status")).not.toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(0);
  await page.close();
  await panel.close();
});
