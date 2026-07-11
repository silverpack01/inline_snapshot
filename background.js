// Background script for Snapshot extension
// Handles install/update events and persistent storage management

const STORAGE_KEY = "snapshots";

// When extension is installed or updated
browser.runtime.onInstalled.addListener((details) => {
  console.log("[Snapshot] Extension " + details.reason);

  if (details.reason === "install") {
    // First time install - initialize empty storage
    browser.storage.local.set({ [STORAGE_KEY]: [] }).then(() => {
      console.log("[Snapshot] Storage initialized");
    });
  } else if (details.reason === "update") {
    // Extension updated - data should persist due to fixed add-on ID
    console.log("[Snapshot] Updated from", details.previousVersion, "to", browser.runtime.getManifest().version);
  }
});

// Listen for storage changes (for cross-tab sync)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    console.log("[Snapshot] Storage updated:", changes[STORAGE_KEY].newValue.length, "snapshots");
  }
});

// Handle messages from popup or content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSnapshots") {
    browser.storage.local.get(STORAGE_KEY).then(data => {
      sendResponse({ snapshots: data[STORAGE_KEY] || [] });
    });
    return true; // Async response
  }

  if (message.action === "clearSnapshots") {
    browser.storage.local.set({ [STORAGE_KEY]: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

console.log("[Snapshot] Background script loaded");