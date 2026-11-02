import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchExtension } from "./launch";
import { shell, turn } from "../fixtures";
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
  admin = await browser.newPage();
  await admin.goto(`${base}/sidepanel.html`);
  await expect(
    admin.getByRole("button", { name: "我了解并同意本地保存" }),
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
  await seed([sample(), sample("claude-record", "claude")]);
  const p = await chat();
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
  await list(p).getByRole("menuitem", { name: "重命名" }).click();
  await list(p).getByRole("textbox", { name: "会话名称" }).fill("合成新标题");
  await list(p).getByRole("button", { name: "保存", exact: true }).click();
  await list(p).getByRole("searchbox").fill("小而可靠");
  await expect(
    list(p).getByRole("button", { name: "合成新标题", exact: true }),
  ).toBeVisible();
  await list(p).getByRole("button", { name: "会话操作：合成新标题" }).click();
  await list(p).getByRole("menuitem", { name: "删除本机记录" }).click();
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

test("clear all removes every platform's text and authorization without resurrection", async () => {
  await seed([sample(), sample("claude-record", "claude")], true);
  const p = await chat();
  await list(p).locator("summary", { hasText: "仅本机" }).click();
  await list(p)
    .getByRole("button", { name: "清空 KeepTemp 全部本机数据" })
    .click();
  await list(p).getByRole("button", { name: "确认清空" }).click();
  await expect(
    list(p).getByRole("button", { name: "同意并开启本地记录" }),
  ).toBeVisible();
  await expect(p.locator("#keeptemp-status").getByRole("status")).toContainText(
    "尚未授权",
  );
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

test("embedded record reports a worker storage failure without a false success", async () => {
  await seed([]);
  const p = await chat();
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

function continuationPage(kind = "textarea", behavior = "accept") {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <header>${behavior === "unknown" ? "" : '<button data-testid="temporary-chat-button" aria-pressed="true">Temporary</button>'}</header>
  <main><form>${kind === "textarea" ? `<textarea id="prompt-textarea">${behavior === "draft" ? "用户未发送的合成草稿" : ""}</textarea>` : '<div id="prompt-textarea" contenteditable="true" style="white-space:pre-wrap"></div>'}<button type="button" data-testid="send-button" disabled>Send</button></form></main>
  <script>
  const editor = document.getElementById('prompt-textarea'), send = document.querySelector('[data-testid="send-button"]');
  const read = () => editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText;
  editor.addEventListener('input', () => {
    send.disabled = ${behavior === "hold" ? "true" : "!read()"};
    ${behavior === "mode-change" ? 'document.querySelector("header button").setAttribute("aria-pressed", "false");' : ""}
  });
  send.addEventListener('click', () => {
    document.body.dataset.syntheticSendCount = String(Number(document.body.dataset.syntheticSendCount || '0') + 1);
    ${behavior === "unconfirmed" ? "return;" : ""}
    const user = document.createElement('div'); user.dataset.messageAuthorRole = 'user'; user.dataset.messageId = 'synthetic-new-user';
    const content = document.createElement('p'); content.dataset.userMessageBubble = 'true'; content.textContent = read(); user.append(content); document.querySelector('main').append(user);
    if (editor.tagName === 'TEXTAREA') editor.value = ''; else editor.textContent = '';
    send.disabled = true;
  });
  </script></body></html>`;
}
async function continuationTarget(kind = "textarea", behavior = "accept") {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body:
        new URL(route.request().url()).pathname === "/"
          ? continuationPage(kind, behavior)
          : nativePage(),
    }),
  );
  await seed();
  const p = await chat();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  return p;
}
async function launchContinuation(p: Page) {
  const created = browser.waitForEvent("page");
  await reader(p)
    .getByRole("button", { name: "新建临时聊天并接续", exact: true })
    .click();
  const next = await created;
  await next.waitForLoadState();
  return next;
}
for (const kind of ["textarea", "contenteditable"]) {
  test(`one click opens a new temporary ChatGPT tab and sends exact context once through ${kind}`, async () => {
    const p = await continuationTarget(kind),
      next = await launchContinuation(p);
    await expect(next.locator('[data-message-author-role="user"]')).toHaveText(
      continuation(sample()),
    );
    await expect(next.locator("body")).toHaveAttribute(
      "data-synthetic-send-count",
      "1",
    );
    await expect(
      next.locator("#keeptemp-continuation-status").getByRole("status"),
    ).toContainText("已在新临时聊天发送");
    expect(new URL(next.url()).searchParams.get("temporary-chat")).toBe("true");
    expect(next.url()).not.toContain("KEEPTEMP_HISTORY");
    await expect(p.locator("#composer")).toHaveValue("");
    await expect(reader(p).getByRole("status")).toContainText(
      "已在新的 ChatGPT 临时聊天发送",
    );
  });
}
for (const behavior of ["draft", "mode-change", "unknown"]) {
  test(`automatic continuation refuses ${behavior} without sending`, async () => {
    const p = await continuationTarget("textarea", behavior),
      next = await launchContinuation(p);
    await expect(
      next.locator("#keeptemp-continuation-status").getByRole("status"),
    ).toContainText("未发送", { timeout: 20000 });
    await expect(next.locator('[data-message-author-role="user"]')).toHaveCount(
      0,
    );
    await expect(next.locator("body")).not.toHaveAttribute(
      "data-synthetic-send-count",
    );
    await expect(next.locator("#prompt-textarea")).toHaveValue(
      behavior === "draft" ? "用户未发送的合成草稿" : "",
    );
  });
}
for (const kind of ["textarea", "contenteditable"])
  test(`deleting the source cancels the pending ${kind} send and removes its draft`, async () => {
    const p = await continuationTarget(kind, "hold"),
      next = await launchContinuation(p);
    await expect
      .poll(() =>
        next
          .locator("#prompt-textarea")
          .evaluate((el) =>
            el instanceof HTMLTextAreaElement
              ? el.value
              : (el as HTMLElement).innerText,
          ),
      )
      .toBe(continuation(sample()));
    await list(p)
      .getByRole("button", { name: "会话操作：合成面试准备" })
      .click();
    await list(p)
      .getByRole("menuitem", { name: "删除本机记录", exact: true })
      .click();
    await list(p)
      .getByRole("button", { name: "确认删除", exact: true })
      .click();
    await expect.poll(records).toHaveLength(0);
    await next
      .locator('[data-testid="send-button"]')
      .evaluate((node) => ((node as HTMLButtonElement).disabled = false));
    await expect(
      next.locator("#keeptemp-continuation-status").getByRole("status"),
    ).toContainText("未发送");
    await expect
      .poll(() =>
        next
          .locator("#prompt-textarea")
          .evaluate((el) =>
            el instanceof HTMLTextAreaElement
              ? el.value
              : (el as HTMLElement).innerText.trim(),
          ),
      )
      .toBe("");
    await expect(next.locator("body")).not.toHaveAttribute(
      "data-synthetic-send-count",
    );
  });
test("an unacknowledged send is never retried or reported as accepted", async () => {
  const p = await continuationTarget("textarea", "unconfirmed"),
    next = await launchContinuation(p);
  await expect(
    next.locator("#keeptemp-continuation-status").getByRole("status"),
  ).toContainText("未能确认网页接收", { timeout: 20000 });
  await expect(next.locator("body")).toHaveAttribute(
    "data-synthetic-send-count",
    "1",
  );
  await expect(reader(p).getByRole("status")).toContainText("未能确认网页接收");
});
test("concurrent requests for one record open only one target tab", async () => {
  await continuationTarget();
  const before = browser.pages().length;
  const results = await admin.evaluate(async () => {
    const chrome = (
      globalThis as unknown as { chrome: typeof import("wxt/browser").browser }
    ).chrome;
    return Promise.all([
      chrome.runtime.sendMessage({
        type: "keeptemp:continue",
        id: "local-synthetic",
      }),
      chrome.runtime.sendMessage({
        type: "keeptemp:continue",
        id: "local-synthetic",
      }),
    ]);
  });
  expect(results.filter((r) => r?.ok)).toHaveLength(1);
  expect(results.find((r) => !r?.ok)?.error).toBe("handoff-busy");
  expect(browser.pages()).toHaveLength(before + 1);
});

test("website content scripts cannot request an automatic send", async () => {
  const p = await continuationTarget();
  const before = browser.pages().length;
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
        return chrome.runtime.sendMessage({
          type: "keeptemp:continue",
          id: "local-synthetic",
        });
      },
    });
  }, p.url());
  expect(result[0]?.result).toEqual({ ok: false, error: "invalid-source" });
  expect(browser.pages()).toHaveLength(before);
});

test("closing a pending target stops it; a later explicit click can start a new task", async () => {
  const p = await continuationTarget("textarea", "hold"),
    next = await launchContinuation(p);
  await expect(next.locator("#prompt-textarea")).toHaveValue(
    continuation(sample()),
  );
  await next.close();
  await expect(
    reader(p).getByRole("button", { name: "新建临时聊天并接续" }),
  ).toBeEnabled();
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body:
        new URL(route.request().url()).pathname === "/"
          ? continuationPage()
          : nativePage(),
    }),
  );
  const retry = await launchContinuation(p);
  await expect(retry.locator('[data-message-author-role="user"]')).toHaveText(
    continuation(sample()),
  );
  await expect(retry.locator("body")).toHaveAttribute(
    "data-synthetic-send-count",
    "1",
  );
});

test("automatic continuation never clicks through a platform dialog", async () => {
  await browser.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body:
        new URL(route.request().url()).pathname === "/"
          ? continuationPage().replace(
              "</main>",
              '</main><div role="dialog" aria-modal="true">合成平台提示</div>',
            )
          : nativePage(),
    }),
  );
  await seed();
  const p = await chat();
  await list(p)
    .getByRole("button", { name: "合成面试准备", exact: true })
    .click();
  const next = await launchContinuation(p);
  await expect(
    next.locator("#keeptemp-continuation-status").getByRole("status"),
  ).toContainText("新窗口有待处理的提示");
  await expect(next.locator("#prompt-textarea")).toHaveValue("");
  await expect(next.locator("body")).not.toHaveAttribute(
    "data-synthetic-send-count",
  );
});
