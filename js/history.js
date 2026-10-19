import { clearHistory, getAttemptLog, getData } from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function downloadAttemptLog(resultId) {
  const log = getAttemptLog(resultId);
  const columns = [
    "position_timestamp", "arrival_perf_ms", "latency_ms", "fix_perf_ms", "cumulative_distance_m",
    "speed_kmh", "start_perf_ms", "finish_perf_ms", "type", "latitude", "longitude", "accuracy",
    "sensor_samples", "valid", "reason"
  ];
  const rows = log.map((item) => [
    item.type === "gps" ? item.positionTimestamp ?? item.timestamp : "",
    item.arrivalPerf,
    item.latency,
    item.fixPerf,
    item.cumulativeDistance,
    item.speed,
    item.startPerf,
    item.finishPerf,
    item.type,
    item.latitude,
    item.longitude,
    item.accuracy,
    item.sensorSamples,
    item.valid,
    item.reason
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

export function renderHistory() {
  const { history, unit } = getData();
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  const summary = document.getElementById("historySummary");
  empty.classList.toggle("hidden", history.length > 0);
  list.classList.toggle("hidden", history.length === 0);
  const factor = unit === "mph" ? 0.621371 : 1;
  const validHistory = history.filter((item) => !isCorruptResult(item));
  summary.innerHTML = history.length
    ? `<span>${validHistory.length} HASIL VALID · ${history.length} RUN TERSIMPAN</span><strong>${(Math.max(0, ...validHistory.map((item) => Number(item.maxSpeed) || 0)) * factor).toFixed(0)} <small>${unit === "mph" ? "MPH" : "KM/J"} MAX</small></strong>`
    : "";
  list.innerHTML = history.map((item) => {
    const date = new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const time = Number(item.time || 0).toFixed(2);
    const accuracy = item.averageAccuracy !== null && Number.isFinite(Number(item.averageAccuracy)) ? `±${Number(item.averageAccuracy).toFixed(1)} m` : "--";
    const startSource = item.startSource === "sensor" ? "SENSOR" : "GPS";
    const corrupt = isCorruptResult(item);
    const title = corrupt ? `DATA RUSAK · ${item.templateName}` : item.templateName;
    return `<article class="history-item"><div class="history-top"><span class="history-template">${escapeHtml(title)}</span><time>${escapeHtml(date)}</time></div><div class="history-bike">${escapeHtml(item.bikeName || "Motor tidak dipilih")}</div><div class="history-metrics"><div><span>WAKTU</span><strong>${time}<small> s</small></strong></div><div><span>KEC. MAKS</span><strong>${(Number(item.maxSpeed || 0) * factor).toFixed(0)}<small> ${unit === "mph" ? "MPH" : "KM/J"}</small></strong></div><div><span>JARAK</span><strong>${Number(item.distance || 0).toFixed(0)}<small> m</small></strong></div><div><span>AKURASI GPS</span><strong>${escapeHtml(accuracy)}</strong></div><div><span>SUMBER START</span><strong>${startSource}</strong></div></div>${corrupt ? '<p>Data rusak — tidak dihitung sebagai hasil valid.</p>' : ""}<button class="text-button download-log" data-id="${escapeHtml(item.id)}" type="button">UNDUH LOG CSV</button></article>`;
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
  document.getElementById("clearHistory").addEventListener("click", () => {
    if (!getData().history.length) return showToast("Riwayat masih kosong.");
    if (window.confirm("Hapus semua hasil uji dari riwayat?")) {
      clearHistory();
      renderHistory();
      showToast("Riwayat berhasil dihapus.");
    }
  });
}
