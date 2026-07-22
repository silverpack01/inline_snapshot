// Background script for Snapshot extension
// Handles install/update events and persistent storage management

const STORAGE_KEY = "snapshots";
const BACKUP_SETTINGS_KEY = "backupSettings";
const BACKUP_STATS_KEY = "backupStats";
const BACKUP_FOLDER = "Snapshot-Backups";
const BACKUP_ALARM_NAME = "snapshotAutoBackup";
const MAX_BACKUP_HISTORY = 25;
const DEFAULT_BACKUP_SETTINGS = {
  enabled: true,
  intervalMinutes: 15,
};

function padBackupCount(count) {
  return String(count).padStart(4, "0");
}

function formatTimestampForFile(date) {
  return date.toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

function buildBackupPayload(snapshots) {
  return {
    version: "1.1",
    exportedAt: new Date().toISOString(),
    totalSnapshots: snapshots.length,
    snapshots: snapshots,
  };
}

async function getBackupSettings() {
  const data = await browser.storage.local.get(BACKUP_SETTINGS_KEY);
  return { ...DEFAULT_BACKUP_SETTINGS, ...(data[BACKUP_SETTINGS_KEY] || {}) };
}

async function syncBackupSchedule() {
  const settings = await getBackupSettings();
  await browser.alarms.clear(BACKUP_ALARM_NAME);

  if (!settings.enabled) {
    console.log("[Snapshot] Auto-backup disabled");
    return;
  }

  const intervalMinutes = Math.max(1, Number(settings.intervalMinutes) || DEFAULT_BACKUP_SETTINGS.intervalMinutes);
  browser.alarms.create(BACKUP_ALARM_NAME, {
    periodInMinutes: intervalMinutes,
  });
  console.log("[Snapshot] Auto-backup scheduled every", intervalMinutes, "minutes");
}

async function saveBackupSnapshot(reason) {
  try {
    const data = await browser.storage.local.get([STORAGE_KEY, BACKUP_STATS_KEY]);
    const snapshots = data[STORAGE_KEY] || [];
    const stats = data[BACKUP_STATS_KEY] || { count: 0, history: [] };

    if (snapshots.length === 0) {
      console.log("[Snapshot] Skipping backup, no snapshots found for", reason);
      return;
    }

    const backupCount = (stats.count || 0) + 1;
    const now = new Date();
    const filenameStamp = formatTimestampForFile(now);
    const backupFilename = `${BACKUP_FOLDER}/backup-${padBackupCount(backupCount)}-${filenameStamp}.json`;

    const blob = new Blob([JSON.stringify(buildBackupPayload(snapshots), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    await browser.downloads.download({
      url,
      filename: backupFilename,
      conflictAction: "uniquify",
      saveAs: false,
    });

    URL.revokeObjectURL(url);

    const updatedStats = {
      count: backupCount,
      lastBackupAt: now.toISOString(),
      lastReason: reason,
      history: [
        ...(stats.history || []),
        {
          count: backupCount,
          at: now.toISOString(),
          reason,
          filename: backupFilename,
        },
      ].slice(-MAX_BACKUP_HISTORY),
    };

    await browser.storage.local.set({ [BACKUP_STATS_KEY]: updatedStats });
    console.log("[Snapshot] Backup saved for", reason, "as #", backupCount);
  } catch (err) {
    console.log("[Snapshot] Backup skipped for", reason, "-", err.message);
  }
}

// When extension is installed or updated
browser.runtime.onInstalled.addListener((details) => {
  console.log("[Snapshot] Extension " + details.reason);

  if (details.reason === "install") {
    // First time install - initialize empty storage
    browser.storage.local.set({
      [STORAGE_KEY]: [],
      [BACKUP_SETTINGS_KEY]: DEFAULT_BACKUP_SETTINGS,
      [BACKUP_STATS_KEY]: { count: 0, lastBackupAt: null, lastReason: null, history: [] },
    }).then(() => {
      console.log("[Snapshot] Storage initialized");
      void syncBackupSchedule();
    });
  } else if (details.reason === "update") {
    // Extension updated - data should persist due to fixed add-on ID
    console.log("[Snapshot] Updated from", details.previousVersion, "to", browser.runtime.getManifest().version);
    void syncBackupSchedule();
  }
});

browser.runtime.onStartup.addListener(() => {
  void syncBackupSchedule();
});

// Best-effort automatic backup before the extension is suspended/disabled.
browser.runtime.onSuspend.addListener(() => {
  void saveBackupSnapshot("suspend");
});

browser.management.onDisabled.addListener((info) => {
  if (info.id === browser.runtime.id) {
    void saveBackupSnapshot("final");
  }
});

browser.management.onUninstalled.addListener((info) => {
  if (info.id === browser.runtime.id) {
    void saveBackupSnapshot("final");
  }
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM_NAME) {
    void saveBackupSnapshot("scheduled");
  }
});

// Listen for storage changes (for cross-tab sync)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    console.log("[Snapshot] Storage updated:", changes[STORAGE_KEY].newValue.length, "snapshots");
  }

  if (area === "local" && changes[BACKUP_SETTINGS_KEY]) {
    void syncBackupSchedule();
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