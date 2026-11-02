import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { launchExtension } from "./launch";
import {
  shell,
  turn,
  otherProviders,
  providerFixture,
  genericFixture,
  genericTurn,
  deepseekFixture,
  deepseekVirtualFixture,
} from "../fixtures";
let browser: BrowserContext, base: string, profile: string, panel: Page;
test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "keeptemp-"));
  const extension = path.join(profile, "extension");
  await fs.cp(path.resolve(".output/chrome-mv3"), extension, {
    recursive: true,
  });
  // Test-only required hosts emulate grants in an isolated profile. Shipping
  // manifest still declares these as optional; native permission prompts need manual QA.
  const manifest = JSON.parse(
    await fs.readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions.push(
    "https://synthetic-chat.example/*",
    "https://synthetic-other.example/*",
    "https://chat.deepseek.com/*",
  );
  await fs.writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  browser = await launchExtension(profile, extension);
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
  await panel.getByRole("button", { name: "启用自动保存" }).click();
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
  const privacy = panel
    .locator("details.tools")
    .filter({ has: panel.locator("summary", { hasText: "本地数据与隐私" }) });
  if (!(await privacy.evaluate((el) => (el as HTMLDetailsElement).open)))
    await privacy.locator("summary").click();
  await expect(privacy).toHaveAttribute("open", "");
  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "清空所有数据并撤回授权" }).click();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
}
test.afterEach(async () => {
  if (
    !panel.isClosed() &&
    (await panel.getByRole("button", { name: "返回对话列表" }).isVisible())
  ) {
    if (
      !(await panel
        .getByRole("button", { name: "我了解并同意本地保存" })
        .isVisible())
    )
      await clear();
  }
  for (const p of browser.pages()) await p.close();
  await browser.unroute("https://chatgpt.com/**");
  for (const source of otherProviders)
    await browser.unroute(providerFixture(source).origin + "/**");
  for (const origin of [
    "https://synthetic-chat.example",
    "https://synthetic-other.example",
    "https://chat.deepseek.com",
  ])
    await browser.unroute(origin + "/**");
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
  await panel.getByRole("button", { name: "返回", exact: true }).click();
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
  await panel.screenshot({
    path: "test-results/library-preview.png",
    fullPage: true,
  });
  await panel.locator(".session").click();
  await panel.screenshot({
    path: "test-results/sidepanel-preview.png",
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
  await p.evaluate(() => {
    document.querySelector("[data-markdown-text-style] p")!.textContent =
      "合成长对话段落。\n".repeat(200) + "结尾标记";
  });
  await expect(panel.locator(".messages")).toContainText("结尾标记");
  await panel.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const back = panel.getByRole("button", { name: "返回", exact: true });
  const box = await back.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.height).toBeGreaterThanOrEqual(40);
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  await expect(
    panel.getByRole("link", { name: "打开 ChatGPT" }),
  ).toHaveAttribute("href", "https://chatgpt.com/?temporary-chat=true");
  await back.click();
  await expect(panel.getByRole("searchbox")).toBeVisible();
  const manifest = JSON.parse(
    await fs.readFile(".output/chrome-mv3/manifest.json", "utf8"),
  );
  expect(manifest.permissions).toEqual(["sidePanel", "scripting", "activeTab"]);
  expect(manifest.host_permissions).toEqual([
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://grok.com/*",
    "https://gemini.google.com/*",
  ]);
  expect(manifest.optional_host_permissions).toEqual(["https://*/*"]);
  expect(manifest.content_scripts).toHaveLength(1);
  expect([...manifest.content_scripts[0].matches].sort()).toEqual(
    [...manifest.host_permissions].sort(),
  );
});

test("homepage ellipsis menu renames and deletes without opening the conversation", async () => {
  await enable();
  const p = await chat();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await expect(panel.locator(".session")).toHaveCount(1);
  const trigger = panel.getByRole("button", { name: /^会话操作：/ });
  await trigger.click();
  await expect(panel.getByRole("menu")).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(panel.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await panel.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await panel.getByRole("textbox", { name: "会话名称" }).fill("我的项目讨论");
  await panel.getByRole("button", { name: "保存名称" }).click();
  await expect(panel.locator(".session strong")).toHaveText("我的项目讨论");
  await p.evaluate(
    () =>
      (document.querySelector("[data-markdown-text-style] p")!.textContent =
        "capture after rename"),
  );
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await expect(panel.locator(".session .preview")).toHaveText(
    "capture after rename",
  );
  await expect(panel.locator(".session strong")).toHaveText("我的项目讨论");
  await panel.reload();
  await expect(panel.locator(".session strong")).toHaveText("我的项目讨论");
  await panel.getByRole("button", { name: "会话操作：我的项目讨论" }).click();
  await panel.screenshot({
    path: "test-results/library-menu-preview.png",
    fullPage: true,
  });
  panel.once("dialog", (d) => d.dismiss());
  await panel.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(1);
  await panel.getByRole("button", { name: "会话操作：我的项目讨论" }).click();
  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(0);
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "已排除",
  );
});

test("starts recording a conversation opened independently and already in progress", async () => {
  const p = await chat();
  await p.evaluate(
    (html) => {
      document
        .querySelector("[data-chatgpt-conversation-selection-target]")!
        .insertAdjacentHTML("beforeend", html);
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<header><button data-testid="temporary-chat-button" aria-pressed="true">Temporary</button></header>',
      );
      document.documentElement.dataset.sameDocument = "keep-me";
      history.replaceState(null, "", "/c/mid-session-synthetic");
    },
    turn("prior-turn-2", "之前的第二个问题", "之前的第二个回答"),
  );
  await expect(panel.locator(".session")).toHaveCount(0);
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("已保存");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session")).toContainText("4 条消息");
  await expect(
    panel.getByText("自动保存已开启", { exact: true }),
  ).toBeVisible();
  expect(
    await p.evaluate(() => document.documentElement.dataset.sameDocument),
  ).toBe("keep-me");
  expect(p.url()).toBe("https://chatgpt.com/c/mid-session-synthetic");
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("已保存");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session")).toContainText("4 条消息");
  expect(await p.locator("#keeptemp-status").count()).toBe(1);
  await p.evaluate(
    (html) =>
      document
        .querySelector("[data-chatgpt-conversation-selection-target]")!
        .insertAdjacentHTML("beforeend", html),
    turn("continuing-turn", "继续聊天", "接管后的自动回复"),
  );
  await expect(panel.locator(".session")).toContainText("6 条消息");
});

test("hot-attaches when the old content script is absent without reloading the conversation", async () => {
  const p = await chat();
  await p.evaluate(() => {
    document.documentElement.dataset.sameDocument = "preserved";
    document.querySelector("[data-user-message-bubble]")!.textContent =
      "existing synthetic chat, do not reload";
  });
  await expect(panel.locator(".session")).toHaveCount(0);
  // Use WXT's context-invalidation signal to remove the receiver and observer.
  // This exercises real missing-script reinjection, not Chrome's extension-reload lifecycle.
  const eventName = `${new URL(base).host}:capture:wxt:content-script-started`;
  await panel.evaluate(async (name) => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const [tab] = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
    await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: (event: string) => {
        document.dispatchEvent(
          new CustomEvent(event, {
            detail: {
              contentScriptName: "capture",
              messageId: "synthetic-invalidation",
            },
          }),
        );
      },
      args: [name],
    });
  }, eventName);
  await expect(p.locator("#keeptemp-status")).toHaveCount(0);
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("已保存");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session strong")).toContainText(
    "existing synthetic chat, do not reload",
  );
  expect(
    await p.evaluate(() => document.documentElement.dataset.sameDocument),
  ).toBe("preserved");
  expect(await p.locator("#keeptemp-status").count()).toBe(1);
});

for (const source of otherProviders) {
  test(`${source}: synthetic automatic capture streams, persists and refuses ordinary mode`, async () => {
    const fixture = providerFixture(source);
    await browser.route(fixture.origin + "/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: fixture.html,
      }),
    );
    await enable();
    const p = await browser.newPage();
    await p.goto(fixture.url);
    const status = p.locator("#keeptemp-status").getByRole("status");
    await expect(status).toContainText("Saved");
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.locator(".session").click();
    await expect(panel.locator(".meta")).toContainText(
      source === "claude" ? "Claude" : source === "grok" ? "Grok" : "Gemini",
    );
    await expect(panel.locator(".messages article")).toHaveCount(2);
    await expect(panel.locator(".messages")).toContainText("保留第二段");
    await expect(panel.locator(".messages")).not.toContainText("You said");
    await p.evaluate(async () => {
      for (let i = 0; i < 25; i++) {
        document.querySelector("[data-stream]")!.textContent = `合成流式 ${i}`;
        await new Promise((r) => setTimeout(r, 25));
      }
    });
    await expect(panel.locator(".messages")).toContainText("合成流式 24");
    await expect(panel.locator(".messages article")).toHaveCount(2);
    await p.reload();
    await expect(status).toContainText("Saved");
    await expect(panel.locator(".messages article")).toHaveCount(2);
    // No status inference from transcript text or a button offering to enable privacy.
    await p.evaluate(() => document.querySelector("header")!.remove());
    await expect(status).toContainText("等待临时对话");
    await p.evaluate(
      () =>
        (document.querySelector("[data-stream]")!.textContent =
          "ordinary text must not save"),
    );
    await expect(panel.locator(".messages")).not.toContainText(
      "ordinary text must not save",
    );
    await p.close();
    await panel.reload();
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.locator(".session").click();
    await expect(panel.locator(".messages article")).toHaveCount(2);
  });
}

test("four platform origins stay independent; cross-platform handoff remains neutral and exact", async () => {
  await panel.setViewportSize({ width: 340, height: 900 });
  await enable();
  const gpt = await chat();
  await expect(
    gpt.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("Saved");
  for (const source of otherProviders) {
    const fixture = providerFixture(source);
    await browser.route(fixture.origin + "/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: fixture.html,
      }),
    );
    const p = await browser.newPage();
    await p.goto(fixture.url);
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText("Saved");
  }
  await expect(panel.locator(".session")).toHaveCount(4);
  await panel.screenshot({
    path: "test-results/multiplatform-preview.png",
    fullPage: true,
  });
  await panel
    .locator(".session")
    .filter({ has: panel.locator(".session-meta", { hasText: "ChatGPT" }) })
    .click();
  await panel
    .getByRole("combobox", { name: "接续平台" })
    .selectOption("claude");
  await expect(
    panel.getByRole("link", { name: "打开 Claude" }),
  ).toHaveAttribute("href", "https://claude.ai/new");
  await panel.getByRole("button", { name: "复制并接续" }).click();
  const copied = await panel.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(
    "[user]\n把临时对话留在手中\n\n[assistant]\n从一个小而可靠的本地工具开始。",
  );
  for (const brand of ["ChatGPT", "Claude", "Grok", "Gemini"])
    expect(copied).not.toContain(brand);
  await expect(panel.locator(".meta")).toContainText("ChatGPT");
  await panel.screenshot({
    path: "test-results/cross-platform-preview.png",
    fullPage: true,
  });
  await panel
    .getByRole("combobox", { name: "接续平台" })
    .selectOption("gemini");
  await expect(
    panel.getByRole("link", { name: "打开 Gemini" }),
  ).toHaveAttribute("href", "https://gemini.google.com/app");
  await panel.getByRole("button", { name: "返回", exact: true }).click();
  await panel
    .getByRole("combobox", { name: "新会话平台" })
    .selectOption("grok");
  await expect(panel.getByRole("link", { name: /打开 Grok/ })).toHaveAttribute(
    "href",
    "https://grok.com/chat#private",
  );
  const pages = browser.pages().length;
  expect(pages).toBe(5); // Selecting a target and copying never opens, pastes or sends automatically.
});

test("recording the current Claude chat only enables Claude and preserves the existing page", async () => {
  for (const source of ["claude", "gemini"] as const) {
    const fixture = providerFixture(source);
    await browser.route(fixture.origin + "/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: fixture.html,
      }),
    );
  }
  const p = await browser.newPage();
  await p.goto(providerFixture("claude").url);
  await p.evaluate(
    () => (document.documentElement.dataset.preserve = "existing-document"),
  );
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "尚未授权",
  );
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("已保存");
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".capture-strip small")).toHaveText(
    "Claude 已启用",
  );
  expect(
    await p.evaluate(() => document.documentElement.dataset.preserve),
  ).toBe("existing-document");
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  const second = await browser.newPage();
  await second.goto(providerFixture("gemini").url);
  await expect(
    second.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("尚未授权");
  await expect(panel.locator(".session")).toHaveCount(1);
});

async function genericChat(
  origin = "https://synthetic-chat.example",
  html = genericFixture(),
  routePath = "/chat/first",
) {
  await browser.route(origin + "/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  const p = await browser.newPage();
  await p.goto(origin + routePath);
  return p;
}
async function recordPage(p: Page, statusId = "#keeptemp-status") {
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(p.locator(statusId).getByRole("status")).toContainText("Saved");
  await expect(panel.getByRole("region", { name: "保存前预览" })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("button", { name: "确认并记录此对话" }),
  ).toHaveCount(0);
}
test("one record click saves a generic chat, streams updates and resumes after reload", async () => {
  const p = await genericChat();
  await expect(panel.locator(".session")).toHaveCount(0);
  await recordPage(p);
  await expect(panel.locator(".session")).toHaveCount(1);
  await expect(panel.locator(".session")).toContainText(
    "synthetic-chat.example",
  );
  await p.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      document.querySelector("[data-stream]")!.textContent = "通用流式 " + i;
      await new Promise((r) => setTimeout(r, 30));
    }
  });
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText("通用流式 29");
  await expect(
    panel.getByText("网站里的历史可能仍存在", { exact: false }),
  ).toHaveCount(0);
  await p.reload();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await p.evaluate(
    () => (document.querySelector("[data-stream]")!.textContent = "刷新后继续"),
  );
  await expect(panel.locator(".messages")).toContainText("刷新后继续");
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await p.close();
  await panel.reload();
  await expect(panel.locator(".session")).toHaveCount(1);
});
test("SPA navigation stops automatic capture of another generic conversation until a record click", async () => {
  const p = await genericChat();
  await recordPage(p);
  await expect(panel.locator(".session")).toHaveCount(1);
  await p.evaluate(
    (html) => {
      history.pushState(null, "", "/chat/second");
      document.querySelector("main")!.innerHTML = html;
    },
    '<section data-conversation-id="second">' +
      genericTurn("second", "新的合成问题", "新的合成回答") +
      "</section>",
  );
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "已切换会话",
  );
  await expect(panel.locator(".session")).toHaveCount(1);
  await recordPage(p);
  await expect(panel.locator(".session")).toHaveCount(2);
});
test("generic origins and tabs stay independent, deletion and clear cannot be undone", async () => {
  const first = await genericChat();
  await recordPage(first);
  const second = await genericChat("https://synthetic-other.example");
  await recordPage(second);
  const third = await browser.newPage();
  await third.goto("https://synthetic-other.example/chat/first");
  await recordPage(third);
  await expect(panel.locator(".session")).toHaveCount(3);
  await panel
    .locator(".session")
    .filter({ hasText: "synthetic-chat.example" })
    .click();
  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "删除会话", exact: true }).click();
  await expect(panel.locator(".session")).toHaveCount(2);
  await expect(
    first.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("已排除");
  await first.evaluate(
    () =>
      (document.querySelector("[data-stream]")!.textContent =
        "must not return"),
  );
  await clear();
  await expect(
    second.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("已关闭");
  await panel.reload();
  await expect(
    panel.getByRole("button", { name: "我了解并同意本地保存" }),
  ).toBeVisible();
});
test("one-click generic write failure is honest, atomic and retryable", async () => {
  const p = await genericChat();
  const worker = browser.serviceWorkers()[0]!;
  await worker.evaluate(() => {
    const proto =
      IDBObjectStore.prototype as typeof IDBObjectStore.prototype & {
        originalPut?: typeof IDBObjectStore.prototype.put;
      };
    proto.originalPut = proto.put;
    proto.put = function (...args) {
      if (this.name === "sessions")
        throw new DOMException("synthetic", "QuotaExceededError");
      return proto.originalPut!.apply(this, args);
    };
  });
  try {
    await p.bringToFront();
    await panel
      .getByRole("button", { name: "记录当前对话", exact: true })
      .click();
    await expect(panel.getByRole("status")).toContainText("暂未保存成功");
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText("保存失败");
    await expect(panel.locator(".session")).toHaveCount(0);
    await expect(panel.locator(".capture-strip strong")).toHaveText(
      "自动保存尚未开启",
    );
  } finally {
    await worker.evaluate(() => {
      const proto =
        IDBObjectStore.prototype as typeof IDBObjectStore.prototype & {
          originalPut?: typeof IDBObjectStore.prototype.put;
        };
      proto.put = proto.originalPut!;
      delete proto.originalPut;
    });
  }
  await recordPage(p);
  await expect(panel.locator(".session")).toHaveCount(1);
});
test("DeepSeek legacy DOM saves in one click without asking for temporary mode or review", async () => {
  const p = await genericChat(
    "https://chat.deepseek.com",
    deepseekFixture(),
    "/a/chat/s/synthetic-deepseek",
  );
  await recordPage(p);
  await panel.locator(".session").click();
  await expect(panel.locator(".meta")).toContainText("chat.deepseek.com");
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await p.evaluate(
    () =>
      (document.querySelector("[data-stream]")!.textContent =
        "DeepSeek 增量回复"),
  );
  await expect(panel.locator(".messages")).toContainText("DeepSeek 增量回复");
  await panel.getByRole("button", { name: "复制并接续" }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toContain(
    "[assistant]\nDeepSeek 增量回复\n保留第二段",
  );
});
for (const source of ["chatgpt", ...otherProviders] as const) {
  test(`${source}: ordinary or unknown mode records directly with no preview or repeated warning`, async () => {
    const fixture =
      source === "chatgpt"
        ? {
            origin: "https://chatgpt.com",
            url: "https://chatgpt.com/c/synthetic",
            html: shell(),
          }
        : providerFixture(source);
    const html = fixture.html.replace(
      /<header>[\s\S]*?<\/header>/,
      source === "grok"
        ? '<header><button aria-label="Private" aria-pressed="false">Private</button></header>'
        : '<header><button aria-label="Private">Private</button></header>',
    );
    await browser.route(fixture.origin + "/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: html }),
    );
    if (source === "grok") await enable();
    const p = await browser.newPage();
    await p.goto(fixture.url);
    await recordPage(p, "#keeptemp-generic-status");
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.locator(".session").click();
    await expect(panel.locator(".messages article")).toHaveCount(2);
    await expect(
      panel.getByText("这是你主动记录的网页对话。", { exact: false }),
    ).toHaveCount(0);
    await p.reload();
    await expect(
      p.locator("#keeptemp-generic-status").getByRole("status"),
    ).toContainText("Saved");
    await expect(panel.locator(".messages article")).toHaveCount(2);
    await panel.getByRole("button", { name: "返回", exact: true }).click();
    await expect(panel.locator(".session")).toHaveCount(1);
  });
}
test("DeepSeek virtual list saves the full reply once and keeps streaming without thinking text", async () => {
  const p = await genericChat(
    "https://chat.deepseek.com",
    deepseekVirtualFixture(),
    "/a/chat/s/synthetic-virtual",
  );
  await recordPage(p);
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText("保留第二段");
  await expect(panel.locator(".messages")).not.toContainText("合成思考");
  await p.evaluate(async () => {
    for (let i = 0; i < 25; i++) {
      document.querySelector("[data-stream]")!.textContent =
        "虚拟列表回复 " + i;
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  await expect(panel.locator(".messages")).toContainText("虚拟列表回复 24");
  await panel.getByRole("button", { name: "复制并接续" }).click();
  const copied = await panel.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("[assistant]\n虚拟列表回复 24\n\n保留第二段");
  expect(copied).not.toContain("合成思考");
  await p.reload();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await p.close();
  await panel.reload();
  await expect(panel.locator(".session")).toHaveCount(1);
});
test("unrecognized DeepSeek layout shows a direct error and never saves or opens a confirmation screen", async () => {
  const p = await genericChat(
    "https://chat.deepseek.com",
    '<html><head><meta charset="UTF-8"></head><body><div class="ds-message">合成布局，不含对话区域</div></body></html>',
    "/a/chat/s/synthetic-missing",
  );
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("没定位到对话区域");
  await expect(panel.getByRole("region", { name: "保存前预览" })).toHaveCount(
    0,
  );
  await expect(panel.locator(".session")).toHaveCount(0);
});

for (const kind of ["chatgpt", "generic"] as const) {
  test(`${kind}: repeated manual recording appends new turns to one visible record even after automatic capture is disabled`, async () => {
    const p = kind === "chatgpt" ? await chat() : await genericChat();
    await recordPage(p);
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.getByRole("button", { name: "关闭自动保存" }).click();
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText(kind === "chatgpt" ? "尚未授权" : "已关闭");
    await p.evaluate(
      ({ html, selector }) =>
        document.querySelector(selector)!.insertAdjacentHTML("beforeend", html),
      {
        html:
          kind === "chatgpt"
            ? turn("added-turn", "新增合成问题", "新增合成回复")
            : genericTurn("added-turn", "新增合成问题", "新增合成回复"),
        selector:
          kind === "chatgpt"
            ? "[data-chatgpt-conversation-selection-target]"
            : "[data-conversation-id]",
      },
    );
    await panel.getByRole("searchbox").fill("no-match-synthetic-filter");
    await expect(panel.locator(".session")).toHaveCount(0);
    await recordPage(p);
    await expect(panel.getByRole("searchbox")).toHaveValue("");
    await expect(panel.locator(".session")).toHaveCount(1);
    await expect(panel.locator(".session")).toContainText("4 条消息");
    await p.bringToFront();
    await panel
      .getByRole("button", { name: "记录当前对话", exact: true })
      .evaluate((el: HTMLButtonElement) => {
        el.click();
        el.click();
      });
    await expect(
      panel.getByRole("button", { name: "记录当前对话", exact: true }),
    ).toBeEnabled();
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.locator(".session").click();
    await expect(panel.locator(".messages article")).toHaveCount(4);
    await expect(panel.locator(".messages")).toContainText("新增合成回复");
    await panel.getByRole("button", { name: "复制并接续" }).click();
    expect(
      await panel.evaluate(() => navigator.clipboard.readText()),
    ).toContain("[user]\n新增合成问题\n\n[assistant]\n新增合成回复");
  });
  test(`${kind}: deleting stops background writes but an explicit record click creates a real visible copy again`, async () => {
    const p = kind === "chatgpt" ? await chat() : await genericChat();
    await recordPage(p);
    await panel.locator(".session").click();
    panel.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: "删除会话", exact: true }).click();
    await expect(panel.locator(".session")).toHaveCount(0);
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText("已排除");
    await p.evaluate(
      (selector) =>
        (document.querySelector(selector)!.textContent = "删除后的新合成回复"),
      kind === "chatgpt" ? "[data-markdown-text-style] p" : "[data-stream]",
    );
    await expect(panel.locator(".session")).toHaveCount(0);
    await recordPage(p);
    await expect(panel.locator(".session")).toHaveCount(1);
    await expect(panel.locator(".session strong")).not.toHaveText("");
    await panel.reload();
    await expect(panel.locator(".session")).toHaveCount(1);
    await panel.locator(".session").click();
    await expect(panel.locator(".messages article")).toHaveCount(2);
    await expect(panel.locator(".messages")).toContainText(
      "删除后的新合成回复",
    );
  });
}
test("DeepSeek keeps updating and manually merges an assistant-only virtual window", async () => {
  const p = await genericChat(
    "https://chat.deepseek.com",
    deepseekVirtualFixture(),
    "/a/chat/s/partial-synthetic",
  );
  await recordPage(p);
  await p.evaluate(() => {
    document.querySelector('[data-virtual-list-item-key="10"]')!.remove();
    document.querySelector("[data-stream]")!.textContent =
      "用户消息卸载后的回复";
  });
  await expect(panel.locator(".session .preview")).toContainText(
    "用户消息卸载后的回复",
  );
  await recordPage(p);
  await expect(panel.locator(".session")).toHaveCount(1);
  await panel.locator(".session").click();
  await expect(panel.locator(".messages article")).toHaveCount(2);
  await expect(panel.locator(".messages")).toContainText("DeepSeek 合成问题");
  await expect(panel.locator(".messages")).toContainText(
    "用户消息卸载后的回复",
  );
});
test("generic pause blocks automatic and manual updates, resume captures the current text", async () => {
  const p = await genericChat();
  await recordPage(p);
  await menu(p);
  await p
    .locator("#keeptemp-status")
    .getByRole("button", { name: "暂停记录" })
    .click();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "已暂停",
  );
  await p.evaluate(
    () =>
      (document.querySelector("[data-stream]")!.textContent =
        "paused synthetic edit"),
  );
  await p.bringToFront();
  await panel
    .getByRole("button", { name: "记录当前对话", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("此会话已暂停");
  await panel.locator(".session").click();
  await expect(panel.locator(".messages")).not.toContainText(
    "paused synthetic edit",
  );
  await menu(p);
  await p
    .locator("#keeptemp-status")
    .getByRole("button", { name: "恢复记录" })
    .click();
  await expect(panel.locator(".messages")).toContainText(
    "paused synthetic edit",
  );
});
test("light and dark toggle is monochrome, accessible, persistent and reaches the capture widget", async () => {
  await panel.setViewportSize({ width: 340, height: 900 });
  await panel.emulateMedia({ colorScheme: "light" });
  const p = await genericChat();
  await recordPage(p);
  const assertNeutral = async () => {
    const colors = await panel.evaluate(() =>
      [
        document.documentElement,
        document.querySelector(".record-current")!,
        document.querySelector(".session")!,
      ].flatMap((el) => {
        const css = getComputedStyle(el);
        return [css.color, css.backgroundColor];
      }),
    );
    for (const color of colors) {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
      expect(channels[0]).toBe(channels[1]);
      expect(channels[1]).toBe(channels[2]);
    }
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  };
  await assertNeutral();
  if (await panel.getByRole("button", { name: "关闭提示" }).isVisible())
    await panel.getByRole("button", { name: "关闭提示" }).click();
  await panel.screenshot({
    path: "test-results/library-light.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "切换为深色" }).click();
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(p.locator("#keeptemp-status")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await assertNeutral();
  await panel.screenshot({
    path: "test-results/library-dark.png",
    fullPage: true,
  });
  await panel.reload();
  await expect(panel.getByRole("button", { name: "切换为浅色" })).toBeVisible();
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await panel.getByRole("button", { name: "切换为浅色" }).click();
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(p.locator("#keeptemp-status")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await assertNeutral();
});
