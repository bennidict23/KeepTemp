import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chineseUI, launchExtension } from "./launch";
import { shell, turn, providerFixture } from "../fixtures";
import { context as continuation } from "../../src/recovery";
import type { Session } from "../../src/model";

let browser: BrowserContext, profile: string, base: string, admin: Page;
const sample = (
  id = "local-synthetic",
  source: Session["source"] = "chatgpt",
): Session => ({
  id,
  source,
  title: "合成面试准备",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: "u1",
      role: "user",
      text: "仅存在本机的合成提问 <script>nothing()</script>",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "a1",
      role: "assistant",
      text: "仅存在本机的合成回答\n完整保留第二行。",
      order: 1,
      createdAt: 2,
      updatedAt: 2,
    },
  ],
});
function nativePage(content = turn(), id = "synthetic-conversation") {
  return shell(content, id)
    .replace(
      "<body>",
      `<body><style>html,body{margin:0;font:14px system-ui;background:#fff;color:#171717}html.dark,html.dark body{background:#212121;color:#eee}nav{position:fixed;left:0;top:0;width:260px;height:100vh;background:#f9f9f9;overflow:auto}html.dark nav{background:#171717}nav>a{display:block;padding:18px;color:inherit;text-decoration:none}main{margin-left:260px;min-height:100vh;padding:30px;box-sizing:border-box}main>div{max-width:760px;margin:auto}#composer{position:fixed;bottom:20px;left:320px;width:50%;padding:16px}main [role=presentation]{display:none}</style><nav aria-label="Chat history"><a href="/">新聊天</a><div data-app-action-sidebar-scroll></div><a href="/c/native-ordinary">网站原有历史（合成）</a></nav>`,
    )
    .replace(
      "</main>",
      '<input id="composer" placeholder="询问 ChatGPT" /></main>',
    );
}
async function seed(records: Session[] = [sample()], automatic = false) {
  await admin.evaluate(
    async ({ records, automatic }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("keeptemp-v1", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(Error("synthetic db unavailable"));
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["sessions", "meta"], "readwrite");
        tx.objectStore("meta").put(true, "consent");
        tx.objectStore("meta").put(automatic, "chatgpt-consent");
        for (const record of records) tx.objectStore("sessions").put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(Error("synthetic seed failed"));
      });
      db.close();
    },
    { records, automatic },
  );
}
function claudePage(temporary = true) {
  const sidebar =
    '<aside class="dframe-sidebar" aria-label="Sidebar"><a href="/new">New chat</a><div data-testid="recent-chats"><div data-sidebar-group-label>Recents</div><a href="/chat/native-ordinary">Existing synthetic chat</a></div></aside>';
  let html = providerFixture("claude")
    .html.replace("合成问题", "Help me prepare an honest project introduction.")
    .replace(
      "合成回复",
      "Focus on the Python data cleaning and charts you completed.",
    )
    .replace("保留第二段", "Keep your actual contribution clear.")
    .replace(
      "<body>",
      `<body><style>html,body{margin:0;font:14px system-ui;background:#fff;color:#171717}html.dark,html.dark body,html[data-mode=dark],html[data-mode=dark] body{background:#212121;color:#eee}aside,nav{position:fixed;left:0;top:0;width:280px;height:100vh;background:#f9f9f9;overflow:auto}html.dark aside,html.dark nav,html[data-mode=dark] aside,html[data-mode=dark] nav{background:#171717}aside>a,nav>a,[data-sidebar-group-label],[data-testid=recent-chats]>a{display:block;padding:14px;color:inherit;text-decoration:none}body>header,main{margin-left:280px;padding:24px;box-sizing:border-box}main{min-height:calc(100vh - 80px)}main>div{max-width:720px;margin:24px auto}#composer{position:fixed;bottom:20px;left:340px;width:50%;padding:16px}</style>${sidebar}`,
    )
    .replace(
      "</main>",
      '<form><textarea id="composer" placeholder="Reply to Claude"></textarea></form></main>',
    );
  if (!temporary)
    html = html.replace(
      "<header><span>Incognito chat</span></header>",
      "<header><span>New chat</span></header>",
    );
  return html;
}
async function claudeChat() {
  const p = await browser.newPage();
  await p.goto("https://claude.ai/chat/synthetic");
  await p
    .getByRole("button", { name: /^(Local history|本机历史) · KeepTemp$/ })
    .click();
  return p;
}
async function records() {
  return admin.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("keeptemp-v1");
      r.onsuccess = () => resolve(r.result);
    });
    const result = await new Promise<Session[]>((resolve) => {
      const r = db.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return result.filter((s) => !s.deleted);
  });
}
async function chat(temporary = true, id = "synthetic-conversation") {
  const p = await browser.newPage();
  await p.goto(
    `https://chatgpt.com/c/${id}${temporary ? "?temporary-chat=true" : ""}`,
  );
  await p.getByRole("button", { name: "本机历史 · KeepTemp" }).click();
  return p;
}
const list = (p: Page) => p.frameLocator("#keeptemp-history-list");
const reader = (p: Page) => p.frameLocator("#keeptemp-history-reader");

test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "keeptemp-embedded-"));
  browser = await launchExtension(profile, path.resolve(".output/chrome-mv3"));
  const worker =
    browser.serviceWorkers()[0] ??
    (await browser.waitForEvent("serviceworker"));
  base = `chrome-extension://${new URL(worker.url()).host}`;
});
test.beforeEach(async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: nativePage(),
      headers: { "Permissions-Policy": "clipboard-write=(self)" },
    }),
  );
  await browser.route("https://claude.ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: claudePage(),
      headers: {
        "Permissions-Policy": "clipboard-write=(self)",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'none'",
      },
    }),
  );
  admin = await browser.newPage();
  await admin.goto(`${base}/sidepanel.html`);
  if (!test.info().title.startsWith("English")) await chineseUI(admin);
  await expect(
    admin.getByRole("button", {
      name: test.info().title.startsWith("English")
        ? "I understand and agree to local saving"
        : "我了解并同意本地保存",
    }),
  ).toBeVisible();
});
test.afterEach(async () => {
  for (const p of browser.pages()) if (p !== admin) await p.close();
  await admin.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("keeptemp-v1");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["sessions", "meta"], "readwrite");
      tx.objectStore("sessions").clear();
      tx.objectStore("meta").clear();
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await admin.close();
  await browser.unroute("https://chatgpt.com/**");
  await browser.unroute("https://claude.ai/**");
});
test.afterAll(async () => {
  await browser?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});

test("first-use consent gates capture; streaming updates one local transcript", async () => {
  const p = await chat();
  await expect(
    list(p).getByRole("button", { name: "同意并开启本地记录" }),
  ).toBeVisible();
  expect(await records()).toEqual([]);
  await list(p).getByRole("button", { name: "同意并开启本地记录" }).click();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await p.evaluate(async () => {
    const target = document.querySelector("[data-markdown-text-style] p")!;
    for (let i = 0; i < 12; i++) {
      target.textContent = `合成流式回复 ${i}`;
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await expect
    .poll(async () => (await records())[0]?.messages.at(-1)?.text)
    .toBe("合成流式回复 11");
  expect((await records())[0]!.messages).toHaveLength(2);
  await list(p)
    .getByRole("button", { name: "把临时对话留在手中", exact: true })
    .click();
  await expect(reader(p).locator(".embedded-message")).toHaveCount(2);
  await expect(reader(p).locator(".embedded-messages")).toContainText(
    "合成流式回复 11",
  );
});

test("local library reuses existing data without exposing contents in website DOM", async () => {
  await seed([
    sample(),
    { ...sample("claude-record", "claude"), title: "Claude synthetic notes" },
  ]);
  const p = await chat();
  await expect(
    list(p).getByRole("button", {
      name: "Claude synthetic notes",
      exact: true,
    }),
  ).toBeVisible();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(p).locator(".embedded-message")).toHaveCount(2);
  await expect(reader(p).locator(".embedded-messages")).toContainText(
    sample().messages[0]!.text,
  );
  expect(await p.locator("body").innerText()).not.toContain("仅存在本机");
  expect(
    await p.evaluate(() => {
      try {
        void (
          document.querySelector(
            "#keeptemp-history-reader",
          ) as HTMLIFrameElement
        ).contentWindow!.document.body;
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await p.evaluate(() =>
    window.postMessage(
      { type: "keeptemp:history-open", scope: "page-forged-scope" },
      "*",
    ),
  );
  expect(await records()).toHaveLength(2);
  await reader(p)
    .getByRole("button", { name: "返回 ChatGPT", exact: true })
    .click();
  await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
  await expect(p.locator("#composer")).toBeVisible();
});

test("copy preserves the exact full context and never sends or fills the composer", async () => {
  await seed();
  const p = await chat();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await reader(p)
    .getByRole("button", { name: "复制并接续", exact: true })
    .click();
  await expect(reader(p).getByRole("status")).toContainText("已复制完整记录");
  await browser.grantPermissions(["clipboard-read"]);
  await admin.bringToFront();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(
    continuation(sample()),
  );
  await expect(p.locator("#composer")).toHaveValue("");
  await expect(
    reader(p).getByRole("link", { name: "新临时聊天" }),
  ).toHaveAttribute("href", "https://chatgpt.com/?temporary-chat=true");
  await browser.clearPermissions();
});

test("ordinary chat is saved by one explicit click and subsequent clicks update it", async () => {
  await seed([], true);
  const p = await chat(false);
  expect(await records()).toHaveLength(0);
  await list(p)
    .getByRole("button", { name: "＋ 记录当前对话", exact: true })
    .click();
  await expect(list(p).getByRole("status")).toContainText("已存入本机历史");
  await p
    .locator("[data-markdown-text-style] p")
    .evaluate((el) => (el.textContent = "后续合成文字"));
  await list(p)
    .getByRole("button", { name: "＋ 记录当前对话", exact: true })
    .click();
  await expect
    .poll(async () => (await records())[0]?.messages[1]?.text)
    .toBe("后续合成文字");
  expect(await records()).toHaveLength(1);
});

test("rename, full-text search, delete and explicit re-record reflect committed data", async () => {
  await seed([], true);
  const p = await chat();
  const title = "把临时对话留在手中";
  await expect(
    list(p).getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await list(p)
    .getByRole("button", { name: `会话操作：${title}` })
    .click();
  await p
    .frameLocator("#keeptemp-history-menu")
    .getByRole("menuitem", { name: "重命名" })
    .click();
  await list(p).getByRole("textbox", { name: "会话名称" }).fill("合成新标题");
  await list(p).getByRole("button", { name: "保存", exact: true }).click();
  await list(p).getByRole("searchbox").fill("小而可靠");
  await expect(
    list(p).getByRole("button", { name: "合成新标题", exact: true }),
  ).toBeVisible();
  await list(p).getByRole("button", { name: "会话操作：合成新标题" }).click();
  await p
    .frameLocator("#keeptemp-history-menu")
    .getByRole("menuitem", { name: "删除本机记录" })
    .click();
  await list(p).getByRole("button", { name: "确认删除" }).click();
  await expect.poll(records).toHaveLength(0);
  await p
    .locator("[data-markdown-text-style] p")
    .evaluate((el) => (el.textContent = "删除后仍不自动复活"));
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "已排除",
  );
  expect(await records()).toHaveLength(0);
  await list(p)
    .getByRole("button", { name: "＋ 记录当前对话", exact: true })
    .click();
  await expect(list(p).getByRole("status")).toContainText("已存入本机历史");
  await expect
    .poll(async () => (await records())[0]?.messages[1]?.text)
    .toBe("删除后仍不自动复活");
  await expect(
    list(p).getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
});

test("native sidebar rerender and navigation retain one entry and close the reader", async () => {
  await seed();
  const p = await chat();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(p).locator("h1")).toHaveText("合成面试准备");
  await p.evaluate(() => {
    const old = document.querySelector("[data-app-action-sidebar-scroll]")!;
    const replacement = document.createElement("div");
    replacement.setAttribute("data-app-action-sidebar-scroll", "");
    old.replaceWith(replacement);
  });
  await expect(p.locator("#keeptemp-history-entry")).toHaveCount(1);
  await expect(list(p).getByRole("searchbox")).toBeVisible();
  await p.evaluate(() => history.pushState({}, "", "/c/new-synthetic"));
  await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
  await p.reload();
  await p.getByRole("button", { name: "本机历史 · KeepTemp" }).click();
  await expect(
    list(p).getByRole("button", { name: "合成面试准备", exact: true }),
  ).toBeVisible();
});

test("two tabs keep independent selections; closing a chat preserves its local copy", async () => {
  const second = { ...sample("local-second"), title: "第二个合成会话" };
  await seed([sample(), second]);
  const a = await chat(),
    b = await chat(true, "synthetic-other");
  await list(a)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await list(b)
    .getByRole("button", { name: "第二个合成会话", exact: true })
    .click();
  await expect(reader(a).locator("h1")).toHaveText("合成面试准备");
  await expect(reader(b).locator("h1")).toHaveText("第二个合成会话");
  await a.close();
  await reader(b)
    .getByRole("button", { name: "返回 ChatGPT", exact: true })
    .click();
  await list(b)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(b).locator(".embedded-message")).toHaveCount(2);
});

test("theme follows ChatGPT and layout stays inside the available main area", async () => {
  await seed();
  const p = await chat();
  await p.setViewportSize({ width: 1120, height: 800 });
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(p).locator("h1")).toBeVisible();
  await expect(
    reader(p).getByRole("button", { name: "复制并接续", exact: true }),
  ).toBeEnabled();
  expect((await p.locator("#keeptemp-history-reader").boundingBox())?.x).toBe(
    260,
  );
  await p.screenshot({
    path: "test-results/embedded-history-light.png",
    animations: "disabled",
  });
  await p.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(reader(p).locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(list(p).locator("html")).toHaveAttribute("data-theme", "dark");
  await p.screenshot({
    path: "test-results/embedded-history-dark.png",
    animations: "disabled",
  });
  await p.setViewportSize({ width: 640, height: 800 });
  expect(
    await reader(p)
      .locator("html")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await list(p).locator("summary", { hasText: "仅本机" }).click();
  await list(p)
    .getByRole("button", { name: "切换为浅色", exact: true })
    .click();
  await expect(reader(p).locator("html")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await list(p)
    .getByRole("button", { name: "切换为深色", exact: true })
    .click();
  await p.evaluate(() => document.documentElement.classList.remove("dark"));
  await p.reload();
  await p.getByRole("button", { name: "本机历史 · KeepTemp" }).click();
  await expect(list(p).locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const source of ["chatgpt", "claude"] as const)
  test(`${source} clear all removes every platform's text and authorization without resurrection`, async () => {
    await seed([sample(), sample("claude-record", "claude")], true);
    const p = source === "claude" ? await claudeChat() : await chat();
    if (source === "claude")
      await list(p)
        .getByRole("button", { name: "开启临时自动记录", exact: true })
        .click();
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText("Saved");
    await list(p).locator("summary", { hasText: "仅本机" }).click();
    await list(p)
      .getByRole("button", { name: "清空 KeepTemp 全部本机数据" })
      .click();
    await list(p).getByRole("button", { name: "确认清空" }).click();
    await expect(
      list(p).getByRole("button", { name: "Agree and enable local recording" }),
    ).toBeVisible();
    await expect(
      p.locator("#keeptemp-status").getByRole("status"),
    ).toContainText("Not authorized");
    expect(await records()).toEqual([]);
  });

test("toolbar opens a fallback when the native sidebar disappears; reinjection stays unique", async () => {
  await seed();
  const p = await browser.newPage();
  await p.goto("https://chatgpt.com/?temporary-chat=true");
  // WXT must invalidate the previous controller before a new injection mounts its UI.
  await admin.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      files: ["/content-scripts/capture.js"],
    });
  });
  await expect(p.locator("#keeptemp-history-entry")).toHaveCount(1);
  // Remove the live receiver using WXT's isolated-world invalidation signal.
  // The toolbar must now take its missing-script injection path, without reload.
  await admin.evaluate(
    async (eventName) => {
      const chrome = (
        globalThis as unknown as {
          chrome: typeof import("wxt/browser").browser;
        }
      ).chrome;
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        func: (name: string) => {
          document.documentElement.dataset.sameDocument = "preserved";
          document.dispatchEvent(
            new CustomEvent(name, {
              detail: {
                contentScriptName: "capture",
                messageId: "synthetic-invalidation",
              },
            }),
          );
        },
        args: [eventName],
      });
    },
    `${new URL(base).host}:capture:wxt:content-script-started`,
  );
  await expect(p.locator("#keeptemp-history-entry")).toHaveCount(0);
  await p.locator("nav").evaluate((el) => el.remove());
  const cdp = await browser.browser()!.newBrowserCDPSession();
  await p.bringToFront();
  const targets = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab" }, { exclude: true }],
  });
  const target = targets.targetInfos.find((t) => t.url === p.url());
  await cdp.send("Extensions.triggerAction", {
    id: new URL(base).host,
    targetId: target!.targetId,
  });
  await expect(p.locator("#keeptemp-history-entry")).toHaveCount(1);
  await expect(
    list(p).getByRole("button", { name: "合成面试准备", exact: true }),
  ).toBeVisible();
  expect(
    await p.evaluate(() => document.documentElement.dataset.sameDocument),
  ).toBe("preserved");
  await cdp.detach();
});

for (const source of ["chatgpt", "claude"] as const)
  test(`${source} embedded record reports a worker storage failure without a false success`, async () => {
    await seed([]);
    const p = source === "claude" ? await claudeChat() : await chat();
    const worker = browser.serviceWorkers()[0]!;
    await worker.evaluate(() => {
      const proto = IDBObjectStore.prototype;
      Object.defineProperty(proto, "originalPut", {
        value: proto.put,
        configurable: true,
      });
      proto.put = function () {
        throw new DOMException("synthetic quota", "QuotaExceededError");
      };
    });
    try {
      await list(p)
        .getByRole("button", { name: "＋ 记录当前对话", exact: true })
        .click();
      await expect(list(p).getByRole("status")).toContainText("暂未保存成功");
      expect(await records()).toHaveLength(0);
      await expect(
        p.locator("#keeptemp-status").getByRole("status"),
      ).not.toContainText("Saved");
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
    await list(p)
      .getByRole("button", { name: "＋ 记录当前对话", exact: true })
      .click();
    await expect(list(p).getByRole("status")).toContainText("已存入本机历史");
    expect(await records()).toHaveLength(1);
  });

test("extension history loads with a restrictive parent frame policy", async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: nativePage(),
      headers: {
        "Content-Security-Policy": "frame-src 'self'",
        "Permissions-Policy": "clipboard-write=(self)",
      },
    }),
  );
  await seed();
  const p = await chat();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(p).locator("h1")).toHaveText("合成面试准备");
});

test("removed continuation commands are rejected even from an older page script", async () => {
  await seed();
  const p = await chat(),
    count = browser.pages().length,
    url = p.url();
  const result = await admin.evaluate(async (url) => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    const [tab] = await chrome.tabs.query({ url });
    return chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: async () => {
        const chrome = (
          globalThis as unknown as {
            chrome: typeof import("wxt/browser").browser;
          }
        ).chrome;
        return Promise.all([
          chrome.runtime.sendMessage({
            type: "keeptemp:handoff-check",
            token: "synthetic-old-task",
            step: "send",
          }),
          chrome.runtime.sendMessage({
            type: "keeptemp:continue",
            id: "local-synthetic",
          }),
        ]);
      },
    });
  }, url);
  expect(result[0]?.result).toEqual([
    { ok: false, error: "unsupported-request" },
    { ok: false, error: "unsupported-request" },
  ]);
  expect(browser.pages()).toHaveLength(count);
  expect(p.url()).toBe(url);
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(
    reader(p).getByRole("button", { name: "接着聊", exact: true }),
  ).toHaveCount(0);
  await expect(
    reader(p).getByRole("button", { name: "复制并接续", exact: true }),
  ).toBeVisible();
  await expect(p.locator("#composer")).toHaveValue("");
});

test("English is the default; language persists and syncs without translating records", async () => {
  await expect(admin.locator("html")).toHaveAttribute("lang", "en");
  await seed();
  const p = await browser.newPage();
  await p.goto("https://chatgpt.com/?temporary-chat=true");
  await p
    .getByRole("button", { name: "Local history · KeepTemp", exact: true })
    .click();
  await expect(
    list(p).getByRole("searchbox", { name: "Search local history" }),
  ).toBeVisible();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  await expect(reader(p).locator(".embedded-message p")).toHaveText(
    sample().messages.map((m) => m.text),
  );
  await reader(p)
    .getByRole("button", { name: "Copy & continue", exact: true })
    .click();
  await expect(reader(p).getByRole("status")).toContainText(
    "Full history and continuation prompt copied",
  );
  await browser.grantPermissions(["clipboard-read"]);
  await admin.bringToFront();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(
    continuation(sample(), "en"),
  );
  await expect(p.locator("#composer")).toHaveValue("");
  await browser.clearPermissions();
  await p.bringToFront();
  await reader(p).getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    reader(p).getByRole("button", { name: "复制并接续", exact: true }),
  ).toBeVisible();
  await expect(
    list(p).getByRole("searchbox", { name: "搜索本机历史" }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "本机历史 · KeepTemp", exact: true }),
  ).toBeVisible();
  await expect(reader(p).locator(".embedded-message p")).toHaveText(
    sample().messages.map((m) => m.text),
  );
  await expect(admin.locator("html")).toHaveAttribute("lang", "zh-CN");
  await admin.reload();
  await expect(admin.locator("html")).toHaveAttribute("lang", "zh-CN");
  await reader(p).getByRole("button", { name: "English", exact: true }).click();
  await expect(
    reader(p).getByRole("button", { name: "Copy & continue", exact: true }),
  ).toBeVisible();
  expect((await records())[0]).toEqual(sample());
});

test("English floating menu stays outside the sidebar, supports keyboard and closes cleanly", async () => {
  await seed();
  const p = await browser.newPage();
  await p.goto("https://chatgpt.com/?temporary-chat=true");
  await p
    .getByRole("button", { name: "Local history · KeepTemp", exact: true })
    .click();
  const trigger = list(p).getByRole("button", {
    name: "Conversation actions: 合成面试准备",
  });
  await trigger.click();
  const menu = p.frameLocator("#keeptemp-history-menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(
    menu.getByRole("menuitem", { name: "Rename", exact: true }),
  ).toBeFocused();
  await menu
    .getByRole("menuitem", { name: "Rename", exact: true })
    .press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Delete local copy", exact: true }),
  ).toBeFocused();
  const rect = (await p.locator("#keeptemp-history-menu").boundingBox())!;
  const listRect = (await p.locator("#keeptemp-history-list").boundingBox())!;
  expect(rect.x + rect.width).toBeGreaterThan(listRect.x + listRect.width);
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.height).toBeLessThanOrEqual(p.viewportSize()!.height);
  expect(
    await menu
      .locator("html")
      .evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          el.scrollHeight <= el.clientHeight,
      ),
  ).toBe(true);
  await p.screenshot({
    path: "test-results/history-menu-light.png",
    animations: "disabled",
  });
  // Escape removes its focused iframe; send the key without waiting for that
  // now-detached frame to finish a navigation. Verify the visible result below.
  await p.keyboard.press("Escape");
  await expect(p.locator("#keeptemp-history-menu")).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await p.evaluate(() => document.documentElement.classList.add("dark"));
  await trigger.click();
  await expect(menu.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    menu.getByRole("menuitem", { name: "Rename", exact: true }),
  ).toBeVisible();
  await p.screenshot({
    path: "test-results/history-menu-dark.png",
    animations: "disabled",
  });
  await p.locator("#composer").click();
  await expect(p.locator("#keeptemp-history-menu")).toHaveCount(0);
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await list(p)
    .getByRole("textbox", { name: "Conversation name", exact: true })
    .fill("Synthetic project notes");
  await list(p).getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await records())[0]?.title)
    .toBe("Synthetic project notes");
  await list(p)
    .getByRole("button", {
      name: "Conversation actions: Synthetic project notes",
    })
    .click();
  await menu
    .getByRole("menuitem", { name: "Delete local copy", exact: true })
    .click();
  await list(p)
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect.poll(records).toHaveLength(0);
});

test("English Claude consent enables only Claude and streams into one durable record", async () => {
  const p = await claudeChat();
  await expect(
    list(p).getByRole("button", { name: "Agree and enable local recording" }),
  ).toBeVisible();
  expect(await records()).toHaveLength(0);
  await list(p)
    .getByRole("button", { name: "Agree and enable local recording" })
    .click();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "Saved",
  );
  await expect.poll(async () => (await records()).length).toBe(1);
  await p.locator("[data-stream]").evaluate(async (el) => {
    for (let i = 0; i < 15; i++) {
      el.textContent = `Synthetic streamed answer ${i}`;
      await new Promise((r) => setTimeout(r, 35));
    }
  });
  await expect
    .poll(async () => (await records())[0]?.messages[1]?.text)
    .toContain("Synthetic streamed answer 14");
  const [saved] = await records();
  expect(saved!.source).toBe("claude");
  expect(saved!.messages).toHaveLength(2);
  await p.close();
  await admin.reload();
  await expect(admin.locator(".session")).toHaveCount(1);
  const gpt = await browser.newPage();
  await gpt.goto("https://chatgpt.com/?temporary-chat=true");
  await expect(
    gpt.locator("#keeptemp-status").getByRole("status"),
  ).toContainText("Auto-save is off");
  expect(await records()).toHaveLength(1);
});

test("English Claude shares the library, copies ChatGPT context exactly and returns to its existing composer", async () => {
  const fromGpt = {
    ...sample(),
    title: "Internship Interview Prep",
    messages: sample().messages.map((m, i) => ({
      ...m,
      text:
        i === 0
          ? "I am applying for a data analyst internship. I cleaned the data and made charts for a course project. How should I introduce my own contribution?"
          : "Describe the project briefly, then focus on the Python data cleaning and charts you completed. Explain that a teammate built the prediction model. Keep the introduction honest and specific.",
    })),
  };
  const fromClaude = {
    ...sample("claude-record", "claude"),
    title: "Research Outline",
  };
  await seed([fromGpt, fromClaude]);
  const p = await claudeChat();
  expect(await p.locator("aside #keeptemp-history-entry").count()).toBe(1);
  await expect(
    list(p).getByRole("button", { name: fromGpt.title, exact: true }),
  ).toBeVisible();
  await expect(
    list(p).getByRole("button", { name: fromClaude.title, exact: true }),
  ).toBeVisible();
  await p.locator("#composer").fill("Keep my existing draft");
  await list(p)
    .getByRole("button", { name: fromGpt.title, exact: true })
    .click();
  await expect(reader(p).locator(".embedded-message > span")).toHaveText([
    "You",
    "ChatGPT",
  ]);
  await reader(p)
    .getByRole("button", { name: "Copy & continue", exact: true })
    .click();
  await expect(reader(p).getByRole("status")).toContainText(
    "Full history and continuation prompt copied",
  );
  await browser.grantPermissions(["clipboard-read"]);
  await admin.bringToFront();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(
    continuation(fromGpt, "en"),
  );
  await browser.clearPermissions();
  await expect(
    reader(p).getByRole("link", { name: "New Claude chat" }),
  ).toHaveAttribute("href", "https://claude.ai/new");
  await expect(
    reader(p).getByText("Enable incognito mode on Claude before pasting."),
  ).toBeVisible();
  await expect(p.locator("#composer")).toHaveValue("Keep my existing draft");
  expect((await p.locator("#keeptemp-history-reader").boundingBox())!.x).toBe(
    280,
  );
  expect(await p.locator("body").innerText()).not.toContain(
    fromGpt.messages[0]!.text,
  );
  await p.bringToFront();
  await p.screenshot({
    path: "test-results/claude-history-light.png",
    animations: "disabled",
  });
  await p.emulateMedia({ colorScheme: "dark" });
  await p.evaluate(() => (document.documentElement.dataset.mode = "light"));
  await expect(reader(p).locator("html")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await p.evaluate(() => (document.documentElement.dataset.mode = "dark"));
  await expect(reader(p).locator("html")).toHaveAttribute("data-theme", "dark");
  await p.screenshot({
    path: "test-results/claude-history-dark.png",
    animations: "disabled",
  });
  await reader(p)
    .getByRole("button", { name: "Back to Claude", exact: true })
    .click();
  await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
  await expect(p.locator("#composer")).toHaveValue("Keep my existing draft");
  await list(p)
    .getByRole("button", { name: fromClaude.title, exact: true })
    .click();
  await expect(reader(p).locator(".embedded-message > span")).toHaveText([
    "You",
    "Claude",
  ]);
  await p.reload();
  await p
    .getByRole("button", { name: "Local history · KeepTemp", exact: true })
    .click();
  await expect(
    list(p).getByRole("button", { name: fromGpt.title, exact: true }),
  ).toBeVisible();
});

test("English Claude ordinary chat records manually, updates, renames, deletes and explicitly saves again", async () => {
  await browser.route("https://claude.ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: claudePage(false),
    }),
  );
  await seed([]);
  const p = await claudeChat();
  expect(await records()).toHaveLength(0);
  await list(p)
    .getByRole("button", { name: "＋ Record current chat", exact: true })
    .click();
  await expect(list(p).getByRole("status")).toContainText(
    "Saved to local history",
  );
  await p
    .locator("[data-stream]")
    .evaluate((el) => (el.textContent = "Updated synthetic answer"));
  await list(p)
    .getByRole("button", { name: "＋ Record current chat", exact: true })
    .click();
  await expect
    .poll(async () => (await records())[0]?.messages[1]?.text)
    .toContain("Updated synthetic answer");
  expect(await records()).toHaveLength(1);
  await list(p)
    .getByRole("button", { name: /^Conversation actions:/ })
    .click();
  const menu = p.frameLocator("#keeptemp-history-menu");
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await list(p)
    .getByRole("textbox", { name: "Conversation name", exact: true })
    .fill("My Project Introduction");
  await list(p).getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await records())[0]?.title)
    .toBe("My Project Introduction");
  await list(p).getByRole("searchbox").fill("Updated synthetic");
  await list(p)
    .getByRole("button", {
      name: "Conversation actions: My Project Introduction",
      exact: true,
    })
    .click();
  await menu
    .getByRole("menuitem", { name: "Delete local copy", exact: true })
    .click();
  await list(p)
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect.poll(records).toHaveLength(0);
  await p
    .locator("[data-stream]")
    .evaluate((el) => (el.textContent = "Do not resurrect this record"));
  await expect(
    p.locator("#keeptemp-generic-status").getByRole("status"),
  ).toContainText("excluded");
  expect(await records()).toHaveLength(0);
  await list(p)
    .getByRole("button", { name: "＋ Record current chat", exact: true })
    .click();
  await expect(list(p).getByRole("status")).toContainText(
    "Saved to local history",
  );
  await expect
    .poll(async () => (await records())[0]?.messages[1]?.text)
    .toContain("Do not resurrect this record");
});

test("English Claude supports sidebar replacements, legacy navigation, toolbar fallback and SPA closure", async () => {
  await seed([
    { ...sample("claude-record", "claude"), title: "Saved Claude Chat" },
  ]);
  const p = await claudeChat();
  await list(p)
    .getByRole("button", { name: "Saved Claude Chat", exact: true })
    .click();
  await expect(reader(p).locator("h1")).toHaveText("Saved Claude Chat");
  await p.evaluate(() => {
    const aside = document.querySelector("aside")!;
    const replacement = document.createElement("nav");
    replacement.setAttribute("aria-label", "Sidebar navigation");
    replacement.style.cssText = aside.style.cssText;
    replacement.innerHTML =
      '<a href="/new">New chat</a><a href="/recents">Chats</a>';
    aside.replaceWith(replacement);
  });
  await expect(p.locator("nav #keeptemp-history-entry")).toHaveCount(1);
  await p.evaluate(() => history.pushState({}, "", "/chat/another-synthetic"));
  await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
  await p.locator("nav").evaluate((el) => el.remove());
  await p.bringToFront();
  const cdp = await browser.browser()!.newBrowserCDPSession();
  const targets = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab" }, { exclude: true }],
  });
  const target = targets.targetInfos.find((t) => t.url === p.url())!;
  await cdp.send("Extensions.triggerAction", {
    id: new URL(base).host,
    targetId: target.targetId,
  });
  await expect(p.locator("#keeptemp-history-entry[data-floating]")).toHaveCount(
    1,
  );
  await expect(
    list(p).getByRole("button", { name: "Saved Claude Chat", exact: true }),
  ).toBeVisible();
  await cdp.detach();
});

test("English ChatGPT and Claude tabs keep selections separate and synchronize language and deletion", async () => {
  const fromGpt = { ...sample(), title: "Saved GPT Chat" };
  const fromClaude = {
    ...sample("claude-record", "claude"),
    title: "Saved Claude Chat",
  };
  await seed([fromGpt, fromClaude]);
  const gpt = await browser.newPage();
  await gpt.goto("https://chatgpt.com/?temporary-chat=true");
  await gpt
    .getByRole("button", { name: "Local history · KeepTemp", exact: true })
    .click();
  const claude = await claudeChat();
  await list(gpt)
    .getByRole("button", { name: fromGpt.title, exact: true })
    .click();
  await list(claude)
    .getByRole("button", { name: fromClaude.title, exact: true })
    .click();
  await expect(reader(gpt).locator("h1")).toHaveText(fromGpt.title);
  await expect(reader(claude).locator("h1")).toHaveText(fromClaude.title);
  await reader(claude)
    .getByRole("button", { name: "中文", exact: true })
    .click();
  await expect(
    reader(gpt).getByRole("button", { name: "返回 ChatGPT", exact: true }),
  ).toBeVisible();
  await expect(
    reader(claude).getByRole("button", { name: "返回 Claude", exact: true }),
  ).toBeVisible();
  await reader(claude)
    .getByRole("button", { name: "删除本机记录", exact: true })
    .click();
  await reader(claude)
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(
    list(gpt).getByRole("button", { name: fromClaude.title, exact: true }),
  ).toHaveCount(0);
  await expect(reader(gpt).locator("h1")).toHaveText(fromGpt.title);
  await expect(
    reader(claude).getByText("这条本机记录已不存在。", { exact: true }),
  ).toBeVisible();
});

test("English Claude ignores forged page messages and removes local history on shared and login routes", async () => {
  await seed([
    { ...sample("claude-record", "claude"), title: "Private Synthetic Notes" },
  ]);
  const p = await claudeChat();
  const entry = await p.locator("#keeptemp-history-list").getAttribute("src");
  const scope = new URL(entry!).searchParams.get("scope");
  await p.evaluate(
    (scope) =>
      window.postMessage({ type: "keeptemp:history-open", scope }, "*"),
    scope,
  );
  await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
  await list(p)
    .getByRole("button", { name: "Private Synthetic Notes", exact: true })
    .click();
  await expect(reader(p).locator("h1")).toHaveText("Private Synthetic Notes");
  for (const path of [
    "/share/synthetic",
    "/public/artifacts/synthetic",
    "/login",
  ]) {
    await p.evaluate((path) => history.pushState({}, "", path), path);
    await expect(p.locator("#keeptemp-history-reader")).toHaveCount(0);
    await expect(p.locator("#keeptemp-history-entry")).toHaveCount(0);
  }
  await p.evaluate(() => history.pushState({}, "", "/chat/synthetic"));
  await expect(
    p.getByRole("button", { name: "Local history · KeepTemp", exact: true }),
  ).toBeVisible();
  expect(await records()).toHaveLength(1);
});
