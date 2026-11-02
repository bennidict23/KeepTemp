import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "KeepTemp",
    description:
      "Save AI conversations locally. Find them later and continue in a new chat.",
    permissions: ["sidePanel", "scripting", "activeTab"],
    optional_host_permissions: ["https://*/*"],
    host_permissions: [
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://grok.com/*",
      "https://gemini.google.com/*",
    ],
    minimum_chrome_version: "116",
    web_accessible_resources: [
      {
        resources: ["sidepanel.html", "chunks/*", "assets/*"],
        matches: ["https://chatgpt.com/*", "https://claude.ai/*"],
      },
    ],
    action: { default_title: "Open KeepTemp" },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  },
});
