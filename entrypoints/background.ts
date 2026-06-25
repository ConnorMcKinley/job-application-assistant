export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") });
  });
});
