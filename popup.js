const intervalInput = document.getElementById("intervalInput");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const stateCard = document.getElementById("stateCard");
const stateLabel = document.getElementById("stateLabel");
const countdownEl = document.getElementById("countdown");

let refreshTimerId = null;

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (kind) {
    statusEl.classList.add(kind);
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Operation failed"));
        return;
      }

      resolve(response);
    });
  });
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }

  const whole = Math.ceil(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;

  if (mins <= 0) {
    return `${secs}s`;
  }

  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function setRunningUi(isRunning, remainingSeconds) {
  stateCard.classList.toggle("running", isRunning);
  stateCard.classList.toggle("stopped", !isRunning);
  stateLabel.textContent = isRunning ? "Running" : "Stopped";
  countdownEl.textContent = isRunning ? formatCountdown(remainingSeconds) : "--";

  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function loadCurrentConfig() {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("No active tab found.", "error");
      setRunningUi(false);
      return;
    }

    const response = await sendMessage({ type: "GET_RELOAD", tabId: activeTab.id });
    const config = response.config;

    if (config?.enabled) {
      intervalInput.value = String(config.intervalSeconds);
      const remainingSeconds = Number.isFinite(config.nextReloadAt)
        ? Math.max(0, (config.nextReloadAt - Date.now()) / 1000)
        : config.intervalSeconds;
      setRunningUi(true, remainingSeconds);
      setStatus(`Active on this tab every ${config.intervalSeconds}s.`, "ok");
    } else {
      setRunningUi(false);
      setStatus("Not active on this tab.");
    }
  } catch (error) {
    setRunningUi(false);
    setStatus(error.message, "error");
  }
}

function startLiveRefresh() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
  }

  refreshTimerId = setInterval(() => {
    loadCurrentConfig();
  }, 1000);
}

startBtn.addEventListener("click", async () => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("No active tab found.", "error");
      return;
    }

    const intervalSeconds = Number(intervalInput.value);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
      setStatus("Enter a number >= 5.", "error");
      return;
    }

    await sendMessage({
      type: "SET_RELOAD",
      tabId: activeTab.id,
      intervalSeconds,
      enabled: true
    });

    setStatus(`Started: reload every ${intervalSeconds}s.`, "ok");
    await loadCurrentConfig();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("No active tab found.", "error");
      return;
    }

    await sendMessage({
      type: "SET_RELOAD",
      tabId: activeTab.id,
      intervalSeconds: 0,
      enabled: false
    });

    setStatus("Stopped for this tab.", "ok");
    await loadCurrentConfig();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

loadCurrentConfig();
startLiveRefresh();
