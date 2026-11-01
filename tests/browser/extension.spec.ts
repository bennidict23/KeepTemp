import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { shell, turn } from "../fixtures";
let browser: BrowserContext, base: string, profile: string, panel: Page;
test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "keeptemp-"));
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
  await browser.grantPermissions(["clipboard-read", "clipboard-write"]);
});
test.beforeEach(async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: shell() }),
  );
  panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
});
async function enable() {
  await panel.getByRole("button", { name: "启用 ChatGPT 自动保存" }).click();
}
async function chat() {
  const p = await browser.newPage();
  await p.goto("https://chatgpt.com/?temporary-chat=true");
  return p;
}
async function menu(p: Page) {
  const b = p
    .locator("#keeptemp-status")
    .getByRole("button", { name: "KeepTemp 操作" });
  if ((await b.getAttribute("aria-expanded")) === "false") await b.click();
}
async function clear() {
  await panel.getByRole("button", { name: "返回对话列表" }).click();
  await panel.getByText("本地数据与隐私", { exact: true }).click();
  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
}
test.afterEach(async () => {
  if (await panel.getByRole("button", { name: "返回对话列表" }).isVisible()) {
    if (
      !(await panel
        .getByRole("button", { name: "我了解并同意本地保存" })
        .isVisible())
    )
      await clear();
  }
  for (const p of browser.pages()) await p.close();
  await browser.unroute("https://chatgpt.com/**");
});
test.afterAll(async () => {
  await browser?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});
test("automatic streaming capture, exact recovery, search and export", async () => {
  const p = await chat(),
    status = p.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("尚未授权");
  await enable();
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await p.evaluate(async () => {
    const target = document.querySelector("[data-markdown-text-style] p")!;
    for (let i = 1; i <= 20; i++) {
      target.textContent = "流式合成回复 " + i;
      await new Promise((r) => setTimeout(r, 35));
    }
  });
  await expect(status).toContainText("Saved");
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText("流式合成回复 20");
  await panel.getByRole("button", { name: "复制并接续" }).click();
  await expect(panel.getByRole("button", { name: "已复制 ✓" })).toBeVisible();
  const copied = await panel.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("请接续下面这段中断的对话");
  expect(
    copied
      .split("<<<KEEPTEMP_HISTORY>>>\n")[1]!
      .split("\n<<<END_KEEPTEMP_HISTORY>>>")[0],
  ).toBe("[user]\n把临时对话留在手中\n\n[assistant]\n流式合成回复 20");
  await panel.getByText("管理这段对话", { exact: true }).click();
  const downloaded = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "导出 JSON" }).click();
  const file = await downloaded;
  expect(
    JSON.parse(await fs.readFile((await file.path())!, "utf8")).session
      .messages,
  ).toHaveLength(2);
  await panel.getByRole("button", { name: "← 会话库", exact: true }).click();
  await panel.getByRole("searchbox").fill("合成回复");
  await expect(panel.locator(".session")).toHaveCount(1);
  await panel.getByRole("searchbox").fill("absent");
  await expect(panel.getByText("没有找到相关对话")).toBeVisible();
  await panel.getByRole("button", { name: "清除搜索" }).click();
  await expect(panel.locator(".session")).toHaveCount(1);
});
test("virtualization, refresh, SPA changes and independent tabs retain durable records", async () => {
  await enable();
  const p = await chat(),
    status = p.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("Saved");
  await p.evaluate(
    (html) =>
      document
        .querySelector("[data-chatgpt-conversation-selection-target]")!
        .insertAdjacentHTML("beforeend", html),
    turn("second", "第二轮合成问题", "第二轮合成回复"),
  );
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toContainText("4 条消息");
  await p.evaluate(() => document.querySelector("[data-turn-key]")!.remove());
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toContainText("4 条消息");
  await p.evaluate(() =>
    history.pushState(null, "", "/c/synthetic?temporary-chat=true"),
  );
  await p.reload();
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  const other = await chat();
  await expect(
    other.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(2);
  await other.close();
  await p.close();
  await panel.reload();
  await expect(panel.locator(".session")).toHaveCount(2);
});
test("compact controls pause and resume; ordinary mode never writes", async () => {
  await enable();
  const p = await chat(),
    widget = p.locator("#keeptemp-status"),
    status = widget.getByRole("status");
  await expect(status).toContainText("Saved");
  await expect(
    widget.getByRole("button", { name: "暂停", exact: true }),
  ).toBeHidden();
  await menu(p);
  await widget.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(status).toContainText("已暂停");
  await p.evaluate(
    () =>
      (document.querySelector("[data-markdown-text-style] p")!.textContent =
        "paused change"),
  );
  await panel.locator(".session").click();
  await expect(panel.locator(".messages")).not.toContainText("paused change");
  await widget.getByRole("button", { name: "恢复（含可见内容）" }).click();
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".messages")).toContainText("paused change");
  await p.evaluate(() =>
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<button data-testid="temporary-chat-button" aria-pressed="false">Temporary</button>',
    ),
  );
  await expect(status).toContainText("普通聊天，不保存");
  await p.evaluate(
    () =>
      (document.querySelector("[data-markdown-text-style] p")!.textContent =
        "ordinary change"),
  );
  await expect(panel.locator(".messages")).not.toContainText("ordinary change");
});
test("worker write failure is visible and retries without false Saved", async () => {
  await enable();
  const worker = browser.serviceWorkers()[0]!;
  await worker.evaluate(() => {
    const p = IDBObjectStore.prototype;
    Object.defineProperty(p, "originalPut", {
      value: p.put,
      configurable: true,
    });
    p.put = function () {
      throw new DOMException("synthetic quota", "QuotaExceededError");
    };
  });
  const p = await chat(),
    status = p.locator("#keeptemp-status").getByRole("status");
  try {
    await expect(status).toContainText("保存失败");
    await expect(status).not.toContainText("Saved");
    await expect(panel.locator(".session")).toHaveCount(0);
  } finally {
    await worker.evaluate(() => {
      const p = IDBObjectStore.prototype as typeof IDBObjectStore.prototype & {
        originalPut?: typeof IDBObjectStore.prototype.put;
      };
      p.put = p.originalPut!;
      delete p.originalPut;
    });
  }
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
});
test("deletion and clearing cannot be undone by active capture tabs", async () => {
  await enable();
  const p = await chat(),
    status = p.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("Saved");
  await panel.locator(".session").click();
  await expect(
    panel.getByRole("button", { name: "删除会话", exact: true }),
  ).toBeVisible();
  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "删除会话", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(0);
  await expect(status).toContainText("已排除");
  await clear();
  await expect(status).toContainText("尚未授权");
});
test("minimal library fits narrow light and dark panels without development tools", async () => {
  await panel.setViewportSize({ width: 340, height: 900 });
  await enable();
  const p = await chat();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await expect(panel.locator(".session")).toHaveCount(1);
  if (await panel.getByRole("button", { name: "关闭提示" }).isVisible())
    await panel.getByRole("button", { name: "关闭提示" }).click();
  expect(await panel.getByText("粘贴或导入对话").count()).toBe(0);
  expect(await panel.getByText("打开合成聊天实验室").count()).toBe(0);
  expect(
    await p.locator("#keeptemp-status").getByText("复制诊断").count(),
  ).toBe(0);
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await p.locator("#keeptemp-status").boundingBox())!.height,
  ).toBeLessThan(65);
  await panel.screenshot({ path: "docs/library-preview.png", fullPage: true });
  await panel.locator(".session").click();
  await panel.screenshot({
    path: "docs/sidepanel-preview.png",
    fullPage: true,
  });
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.emulateMedia({ colorScheme: "dark" });
  await panel.screenshot({
    path: "test-results/sidepanel-dark.png",
    fullPage: true,
  });
  const manifest = JSON.parse(
    await fs.readFile(".output/chrome-mv3/manifest.json", "utf8"),
  );
  expect(manifest.permissions).toEqual(["sidePanel"]);
  expect(manifest.content_scripts[0].matches).toEqual([
    "https://chatgpt.com/*",
  ]);
  await expect(
    panel.getByRole("link", { name: "新临时会话 ↗" }),
  ).toHaveAttribute("href", "https://chatgpt.com/?temporary-chat=true");
});
