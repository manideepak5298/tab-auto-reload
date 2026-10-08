const ALARM_PREFIX = "reload-tab-";
const STORAGE_KEY = "tabReloadSettings";
const BADGE_TICK_MS = 1000;

let badgeTickerId = null;

function alarmNameForTab(tabId) {
  return `${ALARM_PREFIX}${tabId}`;
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function formatBadgeText(remainingSeconds) {
  if (remainingSeconds <= 0) {
    return "0";
  }

  if (remainingSeconds < 60) {
    return String(remainingSeconds);
  }

  const minutes = Math.ceil(remainingSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.ceil(minutes / 60);
  if (hours > 99) {
    return "99h+";
  }

  return `${hours}h`;
}

async function setBadge(tabId, text) {
  await chrome.action.setBadgeText({ tabId, text });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#0068D6" });
  }
}

async function updateBadgeForTab(tabId, config) {
  if (!config || !config.enabled || !Number.isFinite(config.nextReloadAt)) {
    await setBadge(tabId, "");
    return;
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((Number(config.nextReloadAt) - Date.now()) / 1000)
  );

  await setBadge(tabId, formatBadgeText(remainingSeconds));
}

async function refreshAllBadges() {
  const settings = await getSettings();
  const tabIds = Object.keys(settings);

  await Promise.all(
    tabIds.map(async (tabIdRaw) => {
      const tabId = Number(tabIdRaw);
      if (!Number.isInteger(tabId)) {
        return;
      }

      try {
        await updateBadgeForTab(tabId, settings[tabIdRaw]);
      } catch {
        // Ignore transient tab/action errors.
      }
    })
  );
}

async function ensureBadgeTicker() {
  const settings = await getSettings();
  const hasAnyEnabled = Object.values(settings).some((config) => config?.enabled);

  if (!hasAnyEnabled) {
    if (badgeTickerId !== null) {
      clearInterval(badgeTickerId);
      badgeTickerId = null;
    }
    return;
  }

  if (badgeTickerId === null) {
    badgeTickerId = setInterval(() => {
      refreshAllBadges().catch(() => {
        // Ignore periodic refresh errors.
      });
    }, BADGE_TICK_MS);
  }
}

async function setTabReload(tabId, intervalSeconds, enabled) {
  const settings = await getSettings();

  if (!enabled) {
    delete settings[tabId];
    await chrome.alarms.clear(alarmNameForTab(tabId));
    await saveSettings(settings);
    await setBadge(tabId, "");
    await ensureBadgeTicker();
    return;
  }

  const normalizedSeconds = Math.max(5, Number(intervalSeconds));
  settings[tabId] = {
    intervalSeconds: normalizedSeconds,
    enabled: true,
    nextReloadAt: Date.now() + normalizedSeconds * 1000
  };

  await saveSettings(settings);

  await chrome.alarms.create(alarmNameForTab(tabId), {
    delayInMinutes: normalizedSeconds / 60,
    periodInMinutes: normalizedSeconds / 60
  });

  await updateBadgeForTab(tabId, settings[tabId]);
  await ensureBadgeTicker();
}

async function getTabReload(tabId) {
  const settings = await getSettings();
  return settings[tabId] || null;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  for (const [tabId, config] of Object.entries(settings)) {
    if (!config.enabled || !Number.isFinite(config.intervalSeconds)) {
      continue;
    }

    const seconds = Math.max(5, Number(config.intervalSeconds));
    settings[tabId].intervalSeconds = seconds;
    settings[tabId].nextReloadAt = Date.now() + seconds * 1000;
    await chrome.alarms.create(alarmNameForTab(tabId), {
      delayInMinutes: seconds / 60,
      periodInMinutes: seconds / 60
    });
  }

  await saveSettings(settings);
  await refreshAllBadges();
  await ensureBadgeTicker();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  for (const [tabId, config] of Object.entries(settings)) {
    if (!config.enabled || !Number.isFinite(config.intervalSeconds)) {
      continue;
    }

    const seconds = Math.max(5, Number(config.intervalSeconds));
    settings[tabId].intervalSeconds = seconds;
    settings[tabId].nextReloadAt = Date.now() + seconds * 1000;
    await chrome.alarms.create(alarmNameForTab(tabId), {
      delayInMinutes: seconds / 60,
      periodInMinutes: seconds / 60
    });
  }

  await saveSettings(settings);
  await refreshAllBadges();
  await ensureBadgeTicker();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }

  const tabId = Number(alarm.name.slice(ALARM_PREFIX.length));
  if (!Number.isInteger(tabId)) {
    return;
  }

  try {
    const config = await getTabReload(tabId);
    if (!config || !config.enabled) {
      await chrome.alarms.clear(alarm.name);
      await setBadge(tabId, "");
      return;
    }

    await chrome.tabs.reload(tabId);

    const settings = await getSettings();
    if (settings[tabId]) {
      const seconds = Math.max(5, Number(settings[tabId].intervalSeconds));
      settings[tabId].nextReloadAt = Date.now() + seconds * 1000;
      await saveSettings(settings);
      await updateBadgeForTab(tabId, settings[tabId]);
      await ensureBadgeTicker();
    }
  } catch {
    await chrome.alarms.clear(alarm.name);
    const settings = await getSettings();
    delete settings[tabId];
    await saveSettings(settings);
    await setBadge(tabId, "");
    await ensureBadgeTicker();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.alarms.clear(alarmNameForTab(tabId));
  const settings = await getSettings();
  if (settings[tabId]) {
    delete settings[tabId];
    await saveSettings(settings);
  }
  await setBadge(tabId, "");
  await ensureBadgeTicker();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const config = await getTabReload(activeInfo.tabId);
  await updateBadgeForTab(activeInfo.tabId, config);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (message.type === "SET_RELOAD") {
      await setTabReload(message.tabId, message.intervalSeconds, message.enabled);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_RELOAD") {
      const config = await getTabReload(message.tabId);
      sendResponse({ ok: true, config });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  };

  run().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
