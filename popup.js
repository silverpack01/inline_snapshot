const captureBtn = document.getElementById("captureBtn");
const statusEl = document.getElementById("status");
const galleryEl = document.getElementById("gallery");
const clearAllBtn = document.getElementById("clearAllBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const snapCountEl = document.getElementById("snapCount");
const backupCountEl = document.getElementById("backupCount");
const galleryCountEl = document.getElementById("galleryCount");
const backupEnabledEl = document.getElementById("backupEnabled");
const backupIntervalEl = document.getElementById("backupInterval");
const saveBackupSettingsBtn = document.getElementById("saveBackupSettingsBtn");
const backupLastEl = document.getElementById("backupLast");
const backupNextEl = document.getElementById("backupNext");
const backupCountdownEl = document.getElementById("backupCountdown");
const presetButtons = document.querySelectorAll(".preset-chip");

const STORAGE_KEY = "snapshots";
const MAX_SNAPSHOTS = 50;
const BACKUP_SETTINGS_KEY = "backupSettings";
const BACKUP_STATS_KEY = "backupStats";
const DEFAULT_BACKUP_SETTINGS = {
  enabled: true,
  intervalMinutes: 15,
};

let backupCountdownTimer = null;

function formatCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeBackupTime(isoString) {
  if (!isoString) return "none";
  const date = new Date(isoString);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNextBackupText(settings) {
  if (!settings.enabled) return "Next backup: off";
  return `Next backup: every ${settings.intervalMinutes} min`;
}

function getDueTimestamp(settings, stats) {
  const intervalMs = Math.max(1, Number(settings.intervalMinutes) || DEFAULT_BACKUP_SETTINGS.intervalMinutes) * 60 * 1000;
  const lastBackupMs = stats.lastBackupAt ? new Date(stats.lastBackupAt).getTime() : Date.now();
  return lastBackupMs + intervalMs;
}

function updateCountdown(settings, stats) {
  if (!settings.enabled) {
    backupCountdownEl.textContent = "Countdown: off";
    return;
  }

  const dueAt = getDueTimestamp(settings, stats);
  const remaining = dueAt - Date.now();
  backupCountdownEl.textContent = `Countdown: ${formatCountdown(remaining)}`;
}

function startCountdownLoop(settings, stats) {
  if (backupCountdownTimer) {
    clearInterval(backupCountdownTimer);
  }

  updateCountdown(settings, stats);
  backupCountdownTimer = setInterval(() => {
    updateCountdown(settings, stats);
  }, 1000);
}

function getCurrentBackupSettings() {
  return {
    enabled: backupEnabledEl.checked,
    intervalMinutes: Math.max(1, Number.parseInt(backupIntervalEl.value, 10) || DEFAULT_BACKUP_SETTINGS.intervalMinutes),
  };
}

async function loadBackupSettings() {
  const data = await browser.storage.local.get([BACKUP_SETTINGS_KEY, BACKUP_STATS_KEY]);
  const settings = { ...DEFAULT_BACKUP_SETTINGS, ...(data[BACKUP_SETTINGS_KEY] || {}) };
  const stats = data[BACKUP_STATS_KEY] || { count: 0, lastBackupAt: null };

  backupEnabledEl.checked = Boolean(settings.enabled);
  backupIntervalEl.value = settings.intervalMinutes;
  backupCountEl.textContent = stats.count || 0;
  backupLastEl.textContent = `Last backup: ${formatRelativeBackupTime(stats.lastBackupAt)}`;
  backupNextEl.textContent = formatNextBackupText(settings);
  startCountdownLoop(settings, stats);
  presetButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.minutes) === Number(settings.intervalMinutes));
  });
}

async function saveBackupSettings() {
  const intervalMinutes = Math.max(1, Number.parseInt(backupIntervalEl.value, 10) || DEFAULT_BACKUP_SETTINGS.intervalMinutes);
  const settings = {
    enabled: backupEnabledEl.checked,
    intervalMinutes,
  };

  await browser.storage.local.set({ [BACKUP_SETTINGS_KEY]: settings });
  backupNextEl.textContent = formatNextBackupText(settings);
  const stats = (await browser.storage.local.get(BACKUP_STATS_KEY))[BACKUP_STATS_KEY] || { count: 0, lastBackupAt: null };
  startCountdownLoop(settings, stats);
  presetButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.minutes) === Number(settings.intervalMinutes));
  });
  setStatus(`✅ Backup schedule saved: ${settings.enabled ? intervalMinutes + " min" : "off"}`, "success");
}

// Show status message with type
function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

// Update snapshot count
function updateCount(snapshots) {
  snapCountEl.textContent = snapshots.length;
  galleryCountEl.textContent = snapshots.length;
}

// Load saved screenshots from storage
async function loadGallery() {
  try {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const snapshots = data[STORAGE_KEY] || [];
    renderGallery(snapshots);
    updateCount(snapshots);
    await loadBackupSettings();
  } catch (err) {
    console.error("Load gallery error:", err);
    setStatus("Gallery load failed", "error");
  }
}

// Render the gallery list
function renderGallery(snapshots) {
  galleryEl.innerHTML = "";

  if (snapshots.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Abhi tak koi capture nahi. 📸 Click the button above!";
    galleryEl.appendChild(empty);
    clearAllBtn.style.display = "none";
    updateCount([]);
    return;
  }

  clearAllBtn.style.display = "block";
  updateCount(snapshots);

  // Newest first
  snapshots
    .slice()
    .reverse()
    .forEach((snap) => {
      const item = document.createElement("div");
      item.className = "gallery-item";

      const img = document.createElement("img");
      img.src = snap.dataUrl;
      img.title = "Click to open full size";
      img.alt = "Screenshot " + snap.time;
      img.addEventListener("click", () => {
        const w = window.open();
        w.document.write(
          '<html><head><title>Screenshot</title><style>body{margin:0;background:#1a1a2e;display:flex;justify-content:center;align-items:center;min-height:100vh;}img{max-width:95vw;max-height:95vh;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,0.5);}</style></head><body><img src="' + snap.dataUrl + '"></body></html>'
        );
      });

      const meta = document.createElement("div");
      meta.className = "meta";

      const time = document.createElement("span");
      time.textContent = snap.time;

      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteSnapshot(snap.id));

      meta.appendChild(time);
      meta.appendChild(del);

      item.appendChild(img);
      item.appendChild(meta);
      galleryEl.appendChild(item);
    });
}

// Delete a snapshot by id
async function deleteSnapshot(id) {
  try {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const snapshots = data[STORAGE_KEY] || [];
    const updated = snapshots.filter((s) => s.id !== id);
    await browser.storage.local.set({ [STORAGE_KEY]: updated });
    renderGallery(updated);
    setStatus("✅ Capture delete ho gaya.", "success");
  } catch (err) {
    console.error("Delete error:", err);
    setStatus("❌ Delete failed: " + err.message, "error");
  }
}

// Clear all snapshots
async function clearAllSnapshots() {
  if (!confirm("Sare captures delete karne hain?")) return;
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: [] });
    renderGallery([]);
    setStatus("✅ Sare captures delete ho gaye.", "success");
  } catch (err) {
    setStatus("❌ Clear failed: " + err.message, "error");
  }
}

clearAllBtn.addEventListener("click", clearAllSnapshots);
saveBackupSettingsBtn.addEventListener("click", saveBackupSettings);
backupEnabledEl.addEventListener("change", () => {
  const settings = getCurrentBackupSettings();
  backupNextEl.textContent = formatNextBackupText(settings);
  const stats = backupCountdownTimer ? null : { lastBackupAt: null, count: 0 };
  updateCountdown(settings, stats || { lastBackupAt: null, count: 0 });
});
backupIntervalEl.addEventListener("input", () => {
  const intervalMinutes = Number.parseInt(backupIntervalEl.value, 10);
  presetButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.minutes) === intervalMinutes);
  });
  backupNextEl.textContent = formatNextBackupText(getCurrentBackupSettings());
});
presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const minutes = Number(button.dataset.minutes);
    backupIntervalEl.value = String(minutes);
    presetButtons.forEach((otherButton) => {
      otherButton.classList.toggle("active", otherButton === button);
    });
    backupNextEl.textContent = formatNextBackupText(getCurrentBackupSettings());
  });
});

// ============ EXPORT FUNCTIONALITY ============
async function exportSnapshots() {
  try {
    setStatus("📦 Exporting...", "info");
    const data = await browser.storage.local.get(STORAGE_KEY);
    const snapshots = data[STORAGE_KEY] || [];

    if (snapshots.length === 0) {
      setStatus("⚠️ Koi capture nahi hai export karne ke liye!", "warning");
      return;
    }

    const exportData = {
      version: "1.1",
      exportedAt: new Date().toISOString(),
      totalSnapshots: snapshots.length,
      snapshots: snapshots
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const filename = `Snapshot-Backups/manual-export-${new Date().toISOString().slice(0, 10)}.json`;

    await browser.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    URL.revokeObjectURL(url);
    setStatus(`✅ ${snapshots.length} captures exported!`, "success");
  } catch (err) {
    console.error("Export error:", err);
    setStatus("❌ Export failed: " + err.message, "error");
  }
}

exportBtn.addEventListener("click", exportSnapshots);

// ============ IMPORT FUNCTIONALITY ============
importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    setStatus("📥 Importing...", "info");

    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate import data
    if (!importData.snapshots || !Array.isArray(importData.snapshots)) {
      throw new Error("Invalid backup file format");
    }

    const importedSnapshots = importData.snapshots;

    // Get existing snapshots
    const data = await browser.storage.local.get(STORAGE_KEY);
    const existingSnapshots = data[STORAGE_KEY] || [];

    // Merge: avoid duplicates by id
    const existingIds = new Set(existingSnapshots.map(s => s.id));
    const newSnapshots = importedSnapshots.filter(s => !existingIds.has(s.id));

    // Combine and limit
    const combined = [...existingSnapshots, ...newSnapshots];
    if (combined.length > MAX_SNAPSHOTS) {
      combined.splice(0, combined.length - MAX_SNAPSHOTS); // Keep newest
    }

    await browser.storage.local.set({ [STORAGE_KEY]: combined });
    renderGallery(combined);

    setStatus(
      `✅ Import done! ${newSnapshots.length} new, ${existingSnapshots.length} existing.`,
      "success"
    );
  } catch (err) {
    console.error("Import error:", err);
    setStatus("❌ Import failed: " + err.message, "error");
  } finally {
    importFile.value = ""; // Reset file input
  }
});

// ============ CAPTURE FUNCTIONALITY ============
captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  setStatus("📸 Capturing...", "info");

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }

    const tab = tabs[0];

    // Capture the visible tab
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });

    // Save to storage
    const data = await browser.storage.local.get(STORAGE_KEY);
    const snapshots = data[STORAGE_KEY] || [];

    // Limit to MAX_SNAPSHOTS
    if (snapshots.length >= MAX_SNAPSHOTS) {
      snapshots.shift(); // Remove oldest
    }

    const snapshot = {
      id: Date.now(),
      dataUrl: dataUrl,
      time: new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      url: tab.url || "unknown",
      title: tab.title || "Untitled"
    };

    snapshots.push(snapshot);
    await browser.storage.local.set({ [STORAGE_KEY]: snapshots });

    setStatus("✅ Capture ho gaya aur store ho gaya!", "success");
    renderGallery(snapshots);
  } catch (err) {
    console.error(err);
    setStatus("❌ Capture fail: " + err.message, "error");
  } finally {
    captureBtn.disabled = false;
  }
});

// Init on popup open
document.addEventListener("DOMContentLoaded", loadGallery);