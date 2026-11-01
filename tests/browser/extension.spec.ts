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
test("real build limits content injection to ChatGPT and blocks regular/unknown synthetic chats", async () => {
  const manifest = JSON.parse(
    await fs.readFile(".output/chrome-mv3/manifest.json", "utf8"),
  );
  expect(manifest.permissions).toEqual(["sidePanel"]);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toHaveLength(1);
  expect(manifest.content_scripts[0].matches).toEqual([
    "https://chatgpt.com/*",
  ]);
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

test("production ChatGPT content script captures synthetic DOM automatically via worker, no real account", async () => {
  // Route the entire supported origin to local synthetic HTML. Never contact ChatGPT.
  const html = `<!doctype html><html><head><title>Synthetic ChatGPT fixture</title></head><body><header><button data-testid="temporary-chat-button" aria-pressed="true">Temporary</button></header><main><article data-testid="conversation-turn-0"><div data-message-author-role="user" data-message-id="synthetic-user-1"><div class="whitespace-pre-wrap">synthetic question</div></div></article><article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="synthetic-answer-1"><div class="markdown"><p>synthetic answer</p></div></div></article></main></body></html>`;
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  // Previous test granted manual consent, but this build requires a separate explicit switch.
  const chat = await browser.newPage();
  await chat.goto("https://chatgpt.com/?temporary-chat=true");
  const status = chat.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("尚未授权");
  await expect(panel.locator(".session")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "启用 ChatGPT 自动保存", exact: true })
    .click();
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session")).toContainText("ChatGPT");
  await chat.evaluate(async () => {
    const p = document.querySelector(".markdown p")!;
    for (let i = 1; i <= 20; i++) {
      p.textContent = "synthetic streamed " + i;
      await new Promise((r) => setTimeout(r, 35));
    }
  });
  await expect(status).toContainText("Saved");
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText(
    "synthetic streamed 20",
  );
  await chat.evaluate(() =>
    history.pushState(
      null,
      "",
      "/c/synthetic-conversation?temporary-chat=true",
    ),
  );
  await chat.reload();
  await expect(status).toContainText("Saved");
  await panel.getByRole("button", { name: "← 会话库", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(1);
  // Same URL, another tab: independent persistence scope.
  const other = await browser.newPage();
  await other.goto(chat.url());
  await expect(
    other.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(2);
  await other.close();
  // Same article indices but a new first native user id must create a different session.
  await chat.evaluate(() => {
    document.querySelector<HTMLElement>(
      '[data-message-author-role="user"]',
    )!.dataset.messageId = "synthetic-user-2";
    history.pushState(null, "", "/?temporary-chat=true");
  });
  await expect(panel.locator(".session")).toHaveCount(3);
  await expect(status).toContainText("Saved");
  await chat
    .locator("#keeptemp-status")
    .getByRole("button", { name: "暂停", exact: true })
    .click();
  await expect(status).toContainText("已暂停");
  await chat.evaluate(
    () =>
      (document.querySelector(".markdown p")!.textContent =
        "paused synthetic text"),
  );
  await expect(status).toContainText("已暂停");
  await chat
    .locator("#keeptemp-status")
    .getByRole("button", { name: "恢复（含可见内容）" })
    .click();
  await expect(status).toContainText("Saved");
  // Regular mode must suppress writes even with a stale temporary URL.
  await chat.evaluate(() => {
    document
      .querySelector("header button")!
      .setAttribute("aria-pressed", "false");
    document.querySelector<HTMLElement>(
      '[data-message-author-role="user"]',
    )!.dataset.messageId = "regular-user";
  });
  await expect(status).toContainText("普通聊天，不保存");
  await expect(panel.locator(".session")).toHaveCount(3);
  await chat.evaluate(() => {
    document
      .querySelector("header button")!
      .setAttribute("aria-pressed", "true");
    document.querySelector<HTMLElement>(
      '[data-message-author-role="user"]',
    )!.dataset.messageId = "synthetic-user-2";
  });
  await expect(status).toContainText("Saved");
  chat.on("dialog", (d) => d.accept());
  await chat
    .locator("#keeptemp-status")
    .getByRole("button", { name: "排除此会话" })
    .click();
  await expect(status).toContainText("已排除");
  await expect(panel.locator(".session")).toHaveCount(2);
  await panel.reload();
  await expect(panel.locator(".session")).toHaveCount(2);
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
  await expect(status).toContainText("尚未授权");
  await chat.evaluate(
    () =>
      (document.querySelector<HTMLElement>(
        '[data-message-author-role="user"]',
      )!.dataset.messageId = "after-reset"),
  );
  await expect(status).toContainText("尚未授权");
  await panel.close();
  await chat.close();
  await browser.unroute("https://chatgpt.com/**");
});

test("ChatGPT worker storage failure is visible and retries without claiming Saved", async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><main><article data-testid="conversation-turn-0"><div data-message-author-role="user" data-message-id="quota-synthetic">synthetic quota test</div></article></main>',
    }),
  );
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  await panel
    .getByRole("button", { name: "启用 ChatGPT 自动保存", exact: true })
    .click();
  const worker = browser.serviceWorkers()[0]!;
  await worker.evaluate(() => {
    const proto = IDBObjectStore.prototype;
    Object.defineProperty(proto, "keepTempOriginalPut", {
      value: proto.put,
      configurable: true,
    });
    proto.put = function () {
      throw new DOMException("synthetic failure", "QuotaExceededError");
    };
  });
  const chat = await browser.newPage();
  await chat.goto("https://chatgpt.com/?temporary-chat=true");
  const status = chat.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("保存失败");
  await expect(status).not.toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(0);
  await worker.evaluate(() => {
    const proto =
      IDBObjectStore.prototype as typeof IDBObjectStore.prototype & {
        keepTempOriginalPut?: typeof IDBObjectStore.prototype.put;
      };
    proto.put = proto.keepTempOriginalPut!;
    delete proto.keepTempOriginalPut;
  });
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(status).toContainText("尚未授权");
  await chat.close();
  await panel.close();
  await browser.unroute("https://chatgpt.com/**");
});

test("role=main with ancestor ids saves and diagnostic copy contains no conversation data", async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><div role="main"><section data-message-id="private-native-user-id"><div data-message-author-role="user">synthetic sensitive question</div></section><section data-message-id="private-native-assistant-id"><div data-message-author-role="assistant">synthetic sensitive answer</div></section></div>',
    }),
  );
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  await panel
    .getByRole("button", { name: "启用 ChatGPT 自动保存", exact: true })
    .click();
  const chat = await browser.newPage();
  await chat.goto("https://chatgpt.com/?temporary-chat=true");
  const widget = chat.locator("#keeptemp-status");
  await expect(widget.getByRole("status")).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await widget
    .getByRole("button", { name: "复制诊断（不含聊天内容）" })
    .click();
  const report = await widget
    .getByRole("textbox", { name: "结构诊断" })
    .inputValue();
  expect(JSON.parse(report)).toMatchObject({
    version: "0.2.2",
    reason: "ready",
    mode: true,
    scopedRoleNodes: 2,
  });
  expect(report).not.toContain("sensitive");
  expect(report).not.toContain("private-native");
  await chat.evaluate(() => {
    document
      .querySelector("[data-message-id]")!
      .removeAttribute("data-message-id");
  });
  await expect(widget.getByRole("status")).toContainText("缺少会话标识");
  await widget
    .getByRole("button", { name: "复制诊断（不含聊天内容）" })
    .click();
  expect(
    JSON.parse(
      await widget.getByRole("textbox", { name: "结构诊断" }).inputValue(),
    ).reason,
  ).toBe("session-id-missing");
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
  await chat.close();
  await panel.close();
  await browser.unroute("https://chatgpt.com/**");
});

test("new app-shell layout saves without any legacy markers and retains virtualized turns", async () => {
  const turn = (id: string, q: string, a: string) =>
    `<div data-turn-key="${id}"><div data-content-search-turn-key="fallback-turn-0"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="${id}"><div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble="true">${q}</div></div></div><div data-chatgpt-search-unit-key="fallback-turn-0:0:assistant" data-chatgpt-search-message-ids="${id}-answer,${id}-answer"><div data-content-search-unit-key="fallback-turn-0:0:assistant"><div data-markdown-text-style="assistant-message"><p>${a}</p></div><button>Copy</button></div></div></div></div>`;
  const first = turn(
    "synthetic-shell-turn-1",
    "app shell question 1",
    "app shell answer 1",
  );
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><main><div role="region" data-app-action-timeline-scroll><div data-chatgpt-conversation-selection-target="synthetic-shell-conversation" data-thread-find-target="conversation">${first}</div></div><div role="presentation"><div data-content-search-unit-key="hidden:0:user">not a visible turn</div></div></main>`,
    }),
  );
  const panel = await browser.newPage();
  await panel.goto(`${base}/sidepanel.html`);
  await panel.getByRole("button", { name: "我了解并同意本地保存" }).click();
  await panel
    .getByRole("button", { name: "启用 ChatGPT 自动保存", exact: true })
    .click();
  const chat = await browser.newPage();
  await chat.goto("https://chatgpt.com/?temporary-chat=true");
  expect(
    await chat
      .locator(
        '[data-message-author-role],[data-turn-id],[data-testid^="conversation-turn-"]',
      )
      .count(),
  ).toBe(0);
  const status = chat.locator("#keeptemp-status").getByRole("status");
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".session")).toHaveCount(1);
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText("app shell answer 1");
  const second = turn(
    "synthetic-shell-turn-2",
    "app shell question 2",
    "app shell answer 2",
  );
  await chat.evaluate(
    (html) =>
      document
        .querySelector("[data-chatgpt-conversation-selection-target]")!
        .insertAdjacentHTML("beforeend", html),
    second,
  );
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".messages article")).toHaveCount(4);
  // First mounted turn disappears and gets replaced, as with a sliding DOM window.
  await chat.evaluate(() =>
    document.querySelector("[data-turn-key]")!.remove(),
  );
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".messages article")).toHaveCount(4);
  await chat.evaluate(
    (html) =>
      document
        .querySelector("[data-chatgpt-conversation-selection-target]")!
        .insertAdjacentHTML("afterbegin", html),
    first,
  );
  await expect(status).toContainText("Saved");
  await expect(panel.locator(".messages article")).toHaveCount(4);
  await expect(panel.locator(".messages article").first()).toContainText(
    "app shell question 1",
  );
  await chat
    .locator("#keeptemp-status")
    .getByRole("button", { name: "复制诊断（不含聊天内容）" })
    .click();
  const report = JSON.parse(
    await chat
      .locator("#keeptemp-status")
      .getByRole("textbox", { name: "结构诊断" })
      .inputValue(),
  );
  expect(report).toMatchObject({
    version: "0.2.2",
    reason: "ready",
    roleNodes: 0,
    activeTimelines: 1,
    userNodes: 2,
    assistantNodes: 2,
  });
  await chat.close();
  await panel.getByRole("button", { name: "← 会话库", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(1);
  panel.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
  await panel.close();
  await browser.unroute("https://chatgpt.com/**");
});
