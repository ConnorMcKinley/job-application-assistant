import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Application Assistant",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    action: {},
    side_panel: { default_path: "sidepanel.html" },
  },
});
