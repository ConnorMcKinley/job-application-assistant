import { handleContentMessage, type ContentRequest } from "../src/autofill/contentHandler";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    chrome.runtime.onMessage.addListener((req: ContentRequest, _sender, sendResponse) => {
      sendResponse(handleContentMessage(req, document));
      return true;
    });
  },
});
