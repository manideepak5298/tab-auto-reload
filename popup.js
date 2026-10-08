const intervalValue = document.getElementById("intervalValue");
const intervalUnit = document.getElementById("intervalUnit");
const presets = document.getElementById("presets");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const stateCard = document.getElementById("stateCard");
const stateLabel = document.getElementById("stateLabel");
const countdownEl = document.getElementById("countdown");

const MIN_SECONDS = 5;
const SECONDS_PER_UNIT = { SECOND: 1, MINUTE: 60, HOUR: 3600 };

let refreshTimerId = null;
// Explicit feedback (start, stop, validation) is held briefly so the 1-second
// background refresh cannot overwrite it before it has been read.
let statusHoldUntil = 0;

function setStatus(message, kind, holdMs) {
  if (!holdMs && Date.now() < statusHoldUntil) {
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (kind) {
    statusEl.classList.add(kind);
  }

  statusHoldUntil = holdMs ? Date.now() + holdMs : 0;
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

// "1h 30m" reads better than "5400s" once intervals get long.
function formatInterval(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / SECONDS_PER_UNIT.HOUR);
  const minutes = Math.floor((whole % SECONDS_PER_UNIT.HOUR) / SECONDS_PER_UNIT.MINUTE);
  const secs = whole % SECONDS_PER_UNIT.MINUTE;

  const parts = [];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  if (secs || !parts.length) {
    parts.push(`${secs}s`);
  }

  return parts.join(" ");
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }

  const whole = Math.ceil(seconds);
  const hours = Math.floor(whole / SECONDS_PER_UNIT.HOUR);
  const mins = Math.floor((whole % SECONDS_PER_UNIT.HOUR) / SECONDS_PER_UNIT.MINUTE);
  const secs = whole % SECONDS_PER_UNIT.MINUTE;

  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }

  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
  }

  return `${secs}s`;
}

// Show an interval in the largest unit that divides it exactly, so 300 seconds
// comes back as "5 minutes" rather than "300 seconds".
function splitInterval(seconds) {
  if (seconds > 0 && seconds % SECONDS_PER_UNIT.HOUR === 0) {
    return { value: seconds / SECONDS_PER_UNIT.HOUR, unit: SECONDS_PER_UNIT.HOUR };
  }

  if (seconds > 0 && seconds % SECONDS_PER_UNIT.MINUTE === 0) {
    return { value: seconds / SECONDS_PER_UNIT.MINUTE, unit: SECONDS_PER_UNIT.MINUTE };
  }

  return { value: seconds, unit: SECONDS_PER_UNIT.SECOND };
}

// Only whole seconds can hit the 5-second floor, so the minimum shown depends
// on the selected unit.
function syncMinimum() {
  const unit = Number(intervalUnit.value);
  intervalValue.min = String(unit === SECONDS_PER_UNIT.SECOND ? MIN_SECONDS : 1);
}

function showInterval(seconds) {
  const { value, unit } = splitInterval(seconds);
  intervalUnit.value = String(unit);
  intervalValue.value = String(value);
  syncMinimum();
}

function readIntervalSeconds() {
  const value = Number(intervalValue.value);
  const unit = Number(intervalUnit.value);

  if (!Number.isFinite(value) || value <= 0) {
    return NaN;
  }

  return Math.round(value * unit);
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
      if (document.activeElement !== intervalValue) {
        showInterval(config.intervalSeconds);
      }

      const remainingSeconds = Number.isFinite(config.nextReloadAt)
        ? Math.max(0, (config.nextReloadAt - Date.now()) / 1000)
        : config.intervalSeconds;
      setRunningUi(true, remainingSeconds);
      setStatus(`Active on this tab every ${formatInterval(config.intervalSeconds)}.`, "ok");
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

async function startWithSeconds(intervalSeconds) {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("No active tab found.", "error", 4000);
      return;
    }

    if (!Number.isFinite(intervalSeconds) || intervalSeconds < MIN_SECONDS) {
      setStatus(`Minimum interval is ${MIN_SECONDS} seconds.`, "error", 4000);
      return;
    }

    await sendMessage({
      type: "SET_RELOAD",
      tabId: activeTab.id,
      intervalSeconds,
      enabled: true
    });

    setStatus(`Started: reload every ${formatInterval(intervalSeconds)}.`, "ok", 4000);
    await loadCurrentConfig();
  } catch (error) {
    setStatus(error.message, "error", 4000);
  }
}

intervalUnit.addEventListener("change", syncMinimum);

presets.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) {
    return;
  }

  const seconds = Number(chip.dataset.seconds);
  showInterval(seconds);
  startWithSeconds(seconds);
});

intervalValue.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    startWithSeconds(readIntervalSeconds());
  }
});

startBtn.addEventListener("click", () => {
  startWithSeconds(readIntervalSeconds());
});

stopBtn.addEventListener("click", async () => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("No active tab found.", "error", 4000);
      return;
    }

    await sendMessage({
      type: "SET_RELOAD",
      tabId: activeTab.id,
      intervalSeconds: 0,
      enabled: false
    });

    setStatus("Stopped for this tab.", "ok", 4000);
    await loadCurrentConfig();
  } catch (error) {
    setStatus(error.message, "error", 4000);
  }
});

syncMinimum();
loadCurrentConfig();
startLiveRefresh();
