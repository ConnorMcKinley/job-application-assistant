import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Application Assistant",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    host_permissions: ["https://console.anthropic.com/*", "https://api.anthropic.com/*"],
    action: {},
    side_panel: { default_path: "sidepanel.html" },
  },
});
