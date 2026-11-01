import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "KeepTemp",
    description: "Keep a local copy. Continue on your terms.",
    permissions: ["sidePanel", "scripting"],
    host_permissions: ["https://chatgpt.com/*"],
    minimum_chrome_version: "116",
    action: { default_title: "Open KeepTemp" },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  },
});
