import { clearDragHistory, clearLegacyHistory, CURRENT_SESSION_ID, deleteResult, getAttemptLog, getData } from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
let selectedBike = "";
let selectedRange = "session";
let bikeFilterInitialized = false;

function isCorruptResult(item) {
  if (item.valid === false || item.isValid === false) return true;
  const time = Number(item.time);
  const distance = Number(item.distance);
  if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(distance) || distance <= 0) return true;
  const target = Number(item.target);
  const shortDistanceRun = item.templateType === "distance"
    ? Number.isFinite(target) && target <= 500
    : !item.templateType && distance <= 500;
  const averageSpeed = distance / time * 3.6;
  return (shortDistanceRun && time > 60) || averageSpeed > 400 || averageSpeed < 3;
}

function formatRunDate(value) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${datePart} ${timePart}`;
}

function splitTable(splits, className = "", distances = []) {
  const splitByDistance = new Map(splits.map((split) => [Number(split.distance), split]));
  const rows = distances.map((distance) => {
    const split = splitByDistance.get(Number(distance));
    return `<tr class="${Number(distance) === 201 ? "primary-split" : ""}"><td>${Number(distance).toFixed(0)}</td><td>${split ? Number(split.time).toFixed(2) : "--"}</td><td>${split ? Number(split.speed).toFixed(2) : "--"}</td></tr>`;
  }).join("");
  return `<table class="split-table ${className}"><thead><tr><th>JARAK (m)</th><th>WAKTU (s)</th><th>KECEPATAN (km/j)</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="no-splits">Belum mencapai jarak split.</td></tr>`}</tbody></table>`;
}

function downloadDragCsv(runs) {
  const columns = ["run", "tanggal", "motor", "rollout", "jarak_m", "waktu_s", "kecepatan_kmh", "kecepatan_maks_kmh"];
  const rows = runs.flatMap((run, index) => (run.dragSplits || []).map((split) => [
    index + 1, run.createdAt, run.bikeName, run.rolloutStatus || (run.rolloutEnabled ? "ON" : "OFF"),
    split.distance, Number(split.time).toFixed(2), Number(split.speed).toFixed(2), Number(run.maxSpeed || 0).toFixed(2)
  ]));
  const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "racebox-drag-history.csv";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderDragHistory() {
  const data = getData();
  const allRuns = data.history.filter((item) => item.dragRun && item.valid !== false);
  const filter = document.getElementById("historyBikeFilter");
  if (!bikeFilterInitialized) {
    selectedBike = data.activeBikeId || "";
    bikeFilterInitialized = true;
  }
  filter.innerHTML = `<option value="">Semua motor</option>${data.bikes.map((bike) => `<option value="${escapeHtml(bike.id)}">${escapeHtml(bike.name)}</option>`).join("")}`;
  filter.value = data.bikes.some((bike) => bike.id === selectedBike) ? selectedBike : "";
  selectedBike = filter.value;

  const today = new Date().toDateString();
  const runs = allRuns.filter((run) => {
    if (selectedBike && run.bikeId !== selectedBike) return false;
    if (selectedRange === "session" && run.sessionId !== CURRENT_SESSION_ID) return false;
    if (selectedRange === "today" && new Date(run.createdAt).toDateString() !== today) return false;
    return true;
  });
  const latest = runs[0];
  document.getElementById("dragHistoryDate").textContent = latest ? formatRunDate(latest.createdAt) : "--";
  document.getElementById("dragHistoryRollout").textContent = `1ft rollout: ${latest
    ? latest.rolloutStatus || (latest.rolloutEnabled ? "ON" : "OFF")
    : data.oneFootRollout ? "ON" : "OFF"}`;
  document.getElementById("bestResultsLabel").textContent = `Best results of ${runs.length} runs:`;
  document.querySelectorAll("[data-history-range]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.historyRange === selectedRange);
  });

  const bestByDistance = new Map();
  runs.forEach((run) => (run.dragSplits || []).forEach((split) => {
    const prior = bestByDistance.get(Number(split.distance));
    if (!prior || Number(split.time) < Number(prior.time)) bestByDistance.set(Number(split.distance), split);
  }));
  const bestSplits = [...bestByDistance.entries()]
    .sort(([first], [second]) => first - second)
    .map(([, split]) => split);
  document.getElementById("bestSplitTable").innerHTML = splitTable(bestSplits, "", data.splitDistances);
  document.getElementById("dragRunsList").innerHTML = runs.length ? runs.map((run, index) => `
    <details class="drag-run-item">
      <summary><span><strong>Run ${index + 1}</strong><small>${escapeHtml(formatRunDate(run.createdAt))} · ${escapeHtml(run.bikeName || "Motor tidak dipilih")}</small></span><b>${Number(run.maxSpeed || 0).toFixed(2)} km/j maks</b></summary>
      <div class="drag-run-details">${splitTable(run.dragSplits || [], "run-split-table", run.dragSplitDistances || data.splitDistances)}<button class="text-button delete-drag-run" data-run-id="${escapeHtml(run.id)}" type="button">HAPUS PERCOBAAN</button></div>
    </details>`).join("") : `<p class="drag-empty">Belum ada percobaan drag untuk filter ini.</p>`;
}

function downloadAttemptLog(resultId) {
  const log = getData().history.find((item) => item.id === resultId);
  if (!log) throw new Error("Hasil uji tidak ditemukan.");
  const attemptLog = getAttemptLog(resultId);
  const columns = [
    "position_timestamp", "arrival_perf_ms", "latency_ms", "fix_perf_ms", "cumulative_distance_m",
    "speed_kmh", "start_perf_ms", "finish_perf_ms", "type", "latitude", "longitude", "accuracy",
    "sensor_samples", "valid", "reason"
  ];
  const rows = attemptLog.map((item) => [
    item.type === "gps" ? item.positionTimestamp ?? item.timestamp : "",
    item.arrivalPerf, item.latency, item.fixPerf, item.cumulativeDistance, item.speed, item.startPerf,
    item.finishPerf, item.type, item.latitude, item.longitude, item.accuracy, item.sensorSamples, item.valid, item.reason
  ]);
  const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `racebox-${resultId}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderHistory() {
  renderDragHistory();
  const { history, unit } = getData();
  const archive = history.filter((item) => !item.dragRun);
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  const summary = document.getElementById("historySummary");
  empty.classList.toggle("hidden", archive.length > 0);
  list.classList.toggle("hidden", archive.length === 0);
  const factor = unit === "mph" ? 0.621371 : 1;
  const validHistory = archive.filter((item) => !isCorruptResult(item));
  summary.innerHTML = archive.length
    ? `<span>${validHistory.length} HASIL VALID · ${archive.length} RUN TERSIMPAN</span><strong>${(Math.max(0, ...validHistory.map((item) => Number(item.maxSpeed) || 0)) * factor).toFixed(0)} <small>${unit === "mph" ? "MPH" : "KM/J"} MAX</small></strong>`
    : "";
  list.innerHTML = archive.map((item) => {
    const date = new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const time = Number(item.time || 0).toFixed(2);
    const accuracy = item.averageAccuracy !== null && Number.isFinite(Number(item.averageAccuracy)) ? `±${Number(item.averageAccuracy).toFixed(1)} m` : "--";
    const startSource = item.startSource === "sensor" ? "SENSOR" : "GPS";
    const corrupt = isCorruptResult(item);
    const title = corrupt ? `DATA RUSAK · ${item.templateName}` : item.templateName;
    return `<article class="history-item"><div class="history-top"><span class="history-template">${escapeHtml(title)}</span><time>${escapeHtml(date)}</time></div><div class="history-bike">${escapeHtml(item.bikeName || "Motor tidak dipilih")}</div><div class="history-metrics"><div><span>WAKTU</span><strong>${time}<small> s</small></strong></div><div><span>KEC. MAKS</span><strong>${(Number(item.maxSpeed || 0) * factor).toFixed(0)}<small> ${unit === "mph" ? "MPH" : "KM/J"}</small></strong></div><div><span>JARAK</span><strong>${Number(item.distance || 0).toFixed(0)}<small> m</small></strong></div><div><span>AKURASI GPS</span><strong>${escapeHtml(accuracy)}</strong></div><div><span>SUMBER START</span><strong>${startSource}</strong></div></div>${corrupt ? "<p>Data rusak — tidak dihitung sebagai hasil valid.</p>" : ""}<button class="text-button download-log" data-id="${escapeHtml(item.id)}" type="button">UNDUH LOG CSV</button></article>`;
  }).join("");
}

export function initHistory(showToast) {
  renderHistory();
  document.getElementById("historyList").addEventListener("click", (event) => {
    const button = event.target.closest(".download-log");
    if (!button) return;
    try {
      downloadAttemptLog(button.dataset.id);
    } catch (error) {
      console.error("Log percobaan gagal diunduh:", error);
      showToast("Log percobaan tidak dapat dibaca.");
    }
  });
  document.getElementById("historyBikeFilter").addEventListener("change", (event) => {
    selectedBike = event.currentTarget.value;
    renderHistory();
  });
  document.querySelectorAll("[data-history-range]").forEach((button) => button.addEventListener("click", () => {
    selectedRange = button.dataset.historyRange;
    renderHistory();
  }));
  document.getElementById("dragRunsList").addEventListener("click", (event) => {
    const button = event.target.closest(".delete-drag-run");
    if (!button || !window.confirm("Hapus percobaan drag ini?")) return;
    deleteResult(button.dataset.runId);
    renderHistory();
    showToast("Percobaan drag dihapus.");
  });
  document.getElementById("downloadDragCsv").addEventListener("click", () => {
    try {
      downloadDragCsv(getData().history.filter((item) => item.dragRun && item.valid !== false));
    } catch (error) {
      console.error("CSV Drag History gagal diunduh:", error);
      showToast("CSV Drag History tidak dapat diunduh.");
    }
  });
  document.getElementById("clearDragHistory").addEventListener("click", () => {
    if (!getData().history.some((item) => item.dragRun)) return showToast("Drag History masih kosong.");
    if (window.confirm("Hapus semua percobaan Drag History?")) {
      clearDragHistory();
      renderHistory();
      showToast("Drag History berhasil dihapus.");
    }
  });
  document.getElementById("clearHistory").addEventListener("click", () => {
    if (!getData().history.some((item) => !item.dragRun)) return showToast("Riwayat uji lainnya masih kosong.");
    if (window.confirm("Hapus semua hasil uji lainnya?")) {
      clearLegacyHistory();
      renderHistory();
      showToast("Riwayat berhasil dihapus.");
    }
  });
  window.addEventListener("racebox:gps", (event) => {
    const indicator = document.getElementById("historyGpsStatus");
    const state = event.detail.accepted && event.detail.validFixCount >= 3
      ? "good"
      : event.detail.accepted ? "fair" : "bad";
    indicator.className = `gps-history-indicator ${state}`;
    indicator.setAttribute("aria-label", `GPS ${state === "good" ? "terkunci" : state === "fair" ? "cukup" : "menunggu"}`);
  });
}
