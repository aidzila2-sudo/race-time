import { clearHistory, getData } from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export function renderHistory() {
  const { history, unit } = getData();
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  const summary = document.getElementById("historySummary");
  empty.classList.toggle("hidden", history.length > 0);
  list.classList.toggle("hidden", history.length === 0);
  const factor = unit === "mph" ? 0.621371 : 1;
  summary.innerHTML = history.length ? `<span>${history.length} RUN TERSIMPAN</span><strong>${(Math.max(...history.map((item) => Number(item.maxSpeed) || 0)) * factor).toFixed(0)} <small>${unit === "mph" ? "MPH" : "KM/J"} MAX</small></strong>` : "";
  list.innerHTML = history.map((item) => {
    const date = new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const time = Number(item.time || 0).toFixed(2);
    return `<article class="history-item"><div class="history-top"><span class="history-template">${escapeHtml(item.templateName)}</span><time>${escapeHtml(date)}</time></div><div class="history-bike">${escapeHtml(item.bikeName || "Motor tidak dipilih")}</div><div class="history-metrics"><div><span>WAKTU</span><strong>${time}<small> s</small></strong></div><div><span>KEC. MAKS</span><strong>${(Number(item.maxSpeed || 0) * factor).toFixed(0)}<small> ${unit === "mph" ? "MPH" : "KM/J"}</small></strong></div><div><span>JARAK</span><strong>${Number(item.distance || 0).toFixed(0)}<small> m</small></strong></div></div></article>`;
  }).join("");
}

export function initHistory(showToast) {
  renderHistory();
  document.getElementById("clearHistory").addEventListener("click", () => {
    if (!getData().history.length) return showToast("Riwayat masih kosong.");
    if (window.confirm("Hapus semua hasil uji dari riwayat?")) {
      clearHistory();
      renderHistory();
      showToast("Riwayat berhasil dihapus.");
    }
  });
}
