import {
  clearLegacyHistory, deleteDragSession, deleteResult, getAttemptLog, getData, getMotorNameSuggestions, renameDragSession
} from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
let selectedBikeName = "";
let selectedDistance = "";

function isCorruptResult(item) {
  if (item.valid === false || item.isValid === false) return true;
  const time = Number(item.time);
  const distance = Number(item.distance);
  if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(distance) || distance <= 0) return true;
  const averageSpeed = distance / time * 3.6;
  return averageSpeed > 400 || averageSpeed < 3;
}

function formatRunDate(value) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${datePart} ${timePart}`;
}

function formatSessionDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day))
    : formatRunDate(value);
}

function splitTable(splits, className = "", distances = []) {
  const splitByDistance = new Map((Array.isArray(splits) ? splits : []).map((split) => [Number(split.distance), split]));
  const rows = distances.map((distance) => {
    const split = splitByDistance.get(Number(distance));
    return `<tr class="${Number(distance) === 201 ? "primary-split" : ""}"><td>${Number(distance).toFixed(0)}</td><td>${split ? Number(split.time).toFixed(2) : "--"}</td><td>${split ? Number(split.speed).toFixed(2) : "--"}</td></tr>`;
  }).join("");
  return `<table class="split-table ${className}"><thead><tr><th>JARAK (m)</th><th>WAKTU (s)</th><th>KECEPATAN (km/j)</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="no-splits">Belum ada data split.</td></tr>`}</tbody></table>`;
}

function downloadSessionCsv(session, runs) {
  const columns = [
    "sesi_id", "nama_motor", "tanggal_sesi", "run", "tanggal_run", "jarak_uji_m",
    "waktu_total_s", "kecepatan_akhir_kmh", "kecepatan_maks_kmh", "split_m",
    "split_waktu_s", "split_kecepatan_kmh", "rollout"
  ];
  const rows = runs.flatMap((run, index) => {
    const splits = Array.isArray(run.dragSplits) ? run.dragSplits : [];
    if (!splits.length) return [[
      session.id, session.bikeName, session.date, run.runNumber || index + 1, run.createdAt,
      run.target, run.time, run.finalSpeed, run.maxSpeed, "", "", "", run.rolloutStatus || ""
    ]];
    return splits.map((split) => [
      session.id, session.bikeName, session.date, run.runNumber || index + 1, run.createdAt,
      run.target, Number(run.time).toFixed(2), Number(run.finalSpeed || 0).toFixed(2),
      Number(run.maxSpeed || 0).toFixed(2), split.distance, Number(split.time).toFixed(2),
      Number(split.speed).toFixed(2), run.rolloutStatus || ""
    ]);
  });
  const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `racebox-sesi-${session.date}-${session.id.slice(0, 8)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sessionBestTable(runs, splitDistances) {
  const best = new Map();
  runs.forEach((run) => (run.dragSplits || []).forEach((split) => {
    const prior = best.get(Number(split.distance));
    if (!prior || Number(split.time) < Number(prior.time)) best.set(Number(split.distance), split);
  }));
  const distances = [...new Set([...splitDistances, ...best.keys()])].sort((first, second) => first - second);
  return splitTable([...best.values()], "session-best-table", distances);
}

function renderDragSessions() {
  const data = getData();
  const knownSessionIds = new Set(data.dragSessions.map((session) => session.id));
  const allRuns = data.history.filter((item) => item.dragRun && item.valid !== false && knownSessionIds.has(item.sessionId));
  const legacyRuns = data.history.filter((item) => !knownSessionIds.has(item.sessionId));
  const filterInput = document.getElementById("historyNameFilter");
  selectedBikeName = filterInput.value.trim();
  const suggestions = getMotorNameSuggestions();
  document.getElementById("historyNameSuggestions").innerHTML = suggestions
    .map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  const distanceFilter = document.getElementById("historyDistanceFilter");
  const distances = [...new Set([...allRuns, ...legacyRuns]
    .filter((run) => run.templateType !== "speed")
    .map((run) => Number(run.target)).filter((target) => Number.isFinite(target) && target > 0))]
    .sort((first, second) => first - second);
  distanceFilter.innerHTML = `<option value="">Semua jarak</option>${distances.map((distance) => `<option value="${distance}">${distance} m</option>`).join("")}`;
  if (!distances.includes(Number(selectedDistance))) selectedDistance = "";
  distanceFilter.value = selectedDistance;

  const sessions = data.dragSessions.map((session) => ({
    ...session,
    runs: allRuns.filter((run) => run.sessionId === session.id)
      .filter((run) => !selectedDistance || Number(run.target) === Number(selectedDistance))
      .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt))
  })).filter((session) => session.runs.length
    && (!selectedBikeName || session.bikeName.toLocaleLowerCase().includes(selectedBikeName.toLocaleLowerCase())))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));

  document.getElementById("dragSessionGroups").innerHTML = sessions.length ? sessions.map((session) => `
    <article class="drag-session-card">
      <header class="drag-session-header">
        <div><h2>${escapeHtml(session.bikeName)} <span>· ${escapeHtml(formatSessionDate(session.date))}</span></h2><p>${session.runs.length} run${session.runs.length === 1 ? "" : "s"}${session.bikeProfile ? ` · ${escapeHtml([session.bikeProfile.brand, session.bikeProfile.cc ? `${session.bikeProfile.cc} cc` : "", session.bikeProfile.power ? `${session.bikeProfile.power} hp` : "", session.bikeProfile.weight ? `${session.bikeProfile.weight} kg` : ""].filter(Boolean).join(" · "))}` : ""}</p></div>
        <div class="session-actions">
          <button class="session-action" data-session-action="csv" data-session-id="${escapeHtml(session.id)}" type="button">CSV</button>
          <button class="session-action" data-session-action="rename" data-session-id="${escapeHtml(session.id)}" type="button">GANTI NAMA</button>
          <button class="session-action danger" data-session-action="delete" data-session-id="${escapeHtml(session.id)}" type="button">HAPUS SESI</button>
        </div>
      </header>
      <h3>Hasil terbaik per jarak</h3>${sessionBestTable(session.runs, data.splitDistances)}
      <div class="session-run-list">${session.runs.map((run, index) => `
        <details class="session-run-item">
          <summary><span><strong>Run ${run.runNumber || index + 1} · ${Number(run.target).toFixed(0)} m</strong><small>${escapeHtml(formatRunDate(run.createdAt))}</small></span><b>${Number(run.time).toFixed(2)} s · ${Number(run.finalSpeed || 0).toFixed(2)} km/j</b></summary>
          <div class="session-run-details">${splitTable(run.dragSplits || [], "run-split-table", run.dragSplitDistances || data.splitDistances)}<div class="session-run-metrics"><span>KEC. MAKS<strong>${Number(run.maxSpeed || 0).toFixed(2)} km/j</strong></span><span>KEC. AKHIR<strong>${Number(run.finalSpeed || 0).toFixed(2)} km/j</strong></span></div><button class="text-button delete-session-run" data-run-id="${escapeHtml(run.id)}" type="button">HAPUS PERCOBAAN</button></div>
        </details>`).join("")}</div>
    </article>`).join("") : `<p class="drag-empty">Belum ada sesi untuk filter ini.</p>`;

  const filteredLegacyRuns = legacyRuns
    .filter((run) => !selectedBikeName || String(run.bikeName || "").toLocaleLowerCase().includes(selectedBikeName.toLocaleLowerCase()))
    .filter((run) => !selectedDistance || Number(run.target) === Number(selectedDistance))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  const legacySection = document.getElementById("legacyDragSection");
  legacySection.classList.toggle("hidden", filteredLegacyRuns.length === 0);
  document.getElementById("legacyDragRuns").innerHTML = filteredLegacyRuns.map((run, index) => {
    const target = run.templateType === "speed" ? run.templateName : `${run.target || "--"} m`;
    return `<article class="legacy-drag-run"><strong>${escapeHtml(run.bikeName || "Nama motor tidak tersedia")} · ${escapeHtml(target)}</strong><span>${escapeHtml(formatRunDate(run.createdAt))} · Run ${index + 1}</span><b>${Number(run.time || 0).toFixed(2)} s · ${Number(run.finalSpeed || 0).toFixed(2)} km/j</b></article>`;
  }).join("");
}

function downloadAttemptLog(resultId) {
  const result = getData().history.find((item) => item.id === resultId);
  if (!result) throw new Error("Hasil uji tidak ditemukan.");
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
  renderDragSessions();
  const { history, unit } = getData();
  const sessionIds = new Set(getData().dragSessions.map((session) => session.id));
  const archive = history.filter((item) => !item.dragRun && sessionIds.has(item.sessionId));
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  const summary = document.getElementById("historySummary");
  empty.classList.toggle("hidden", archive.length > 0 || history.length > 0);
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
  document.getElementById("historyNameFilter").addEventListener("input", renderHistory);
  document.getElementById("historyDistanceFilter").addEventListener("change", (event) => {
    selectedDistance = event.currentTarget.value;
    renderHistory();
  });
  document.getElementById("dragSessionGroups").addEventListener("click", (event) => {
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    const data = getData();
    const session = data.dragSessions.find((item) => item.id === button.dataset.sessionId);
    if (!session) return;
    if (button.dataset.sessionAction === "csv") {
      try {
        downloadSessionCsv(session, data.history.filter((run) => run.sessionId === session.id && run.dragRun));
      } catch (error) {
        console.error("CSV sesi gagal diunduh:", error);
        showToast("CSV sesi tidak dapat diunduh.");
      }
    } else if (button.dataset.sessionAction === "rename") {
      const name = window.prompt("Nama motor sesi:", session.bikeName);
      if (name === null) return;
      try {
        renameDragSession(session.id, name);
        if (getData().activeDragSessionId === session.id) {
          document.getElementById("dragBikeName").value = getData().lastMotorName;
        }
        renderHistory();
        showToast("Nama sesi diperbarui.");
      } catch (error) {
        showToast(error.message || "Nama sesi tidak valid.");
      }
    } else if (button.dataset.sessionAction === "delete" && window.confirm(`Hapus sesi ${session.bikeName} beserta semua percobaannya?`)) {
      deleteDragSession(session.id);
      renderHistory();
      showToast("Sesi dihapus.");
    }
  });
  document.getElementById("dragSessionGroups").addEventListener("click", (event) => {
    const button = event.target.closest(".delete-session-run");
    if (!button || !window.confirm("Hapus percobaan ini?")) return;
    deleteResult(button.dataset.runId);
    renderHistory();
    showToast("Percobaan dihapus.");
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
