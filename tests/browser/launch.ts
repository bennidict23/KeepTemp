import { chromium } from "@playwright/test";

// Every caller supplies a disposable profile. Never attach to a user's browser.
export async function launchExtension(profile: string, extension: string) {
  const name = process.env.KEEPTEMP_BROWSER ?? "chromium";
  const executablePath = process.env.KEEPTEMP_BROWSER_PATH;
  if (!["chromium", "edge", "brave"].includes(name))
    throw new Error("KEEPTEMP_BROWSER must be chromium, edge or brave");
  if (name !== "chromium" && !executablePath)
    throw new Error(
      "Set KEEPTEMP_BROWSER_PATH to the selected browser executable",
    );
  if (name === "chromium" && executablePath)
    throw new Error("Set KEEPTEMP_BROWSER when testing a custom executable");

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    executablePath,
    headless: process.env.KEEPTEMP_HEADED !== "1",
    ignoreDefaultArgs: ["--disable-extensions"],
    // Test-only CDP installation works with branded browsers that removed
    // --load-extension. No additional extension permissions are introduced.
    args: ["--enable-unsafe-extension-debugging"],
  });
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    await cdp.send("Extensions.loadUnpacked", { path: extension });
    await cdp.detach();
    console.info(
      `Compatibility browser: ${name}, ${context.browser()!.version()}`,
    );
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}
