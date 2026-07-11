// Content script - minimal, for future full-page capture support
(function() {
  console.log("[Snapshot] Content script loaded on:", window.location.href);

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageDimensions") {
      const width = Math.max(
        document.body.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
        document.documentElement.offsetWidth
      );
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      sendResponse({ success: true, width, height });
      return true;
    }
    return false;
  });
})();