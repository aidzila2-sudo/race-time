import { addResult, getData } from "./storage.js";

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function initDragMeter(showToast, getGpsState) {
  const templateSelect = document.getElementById("dragTemplate");
  const bikeSelect = document.getElementById("dragBike");
  const startButton = document.getElementById("startRun");
  const cancelButton = document.getElementById("cancelRun");
  const lamps = [...document.querySelectorAll("#startSequence span")];
  let running = false;
  let canceled = false;
  let goAt = 0;
  let gpsAtGo = 0;
  let currentSpeed = 0;
  let currentDistance = 0;
  let currentGpsTimestamp = 0;
  let sessionDistanceAtGo = 0;
  let previousDistanceProgress = 0;
  let previousDistanceTime = 0;
  let goWallTime = 0;
  let maximum = 0;
  let selectedTemplate = null;
  let frame = null;

  function refreshChoices() {
    const { templates, bikes, unit } = getData();
    templateSelect.innerHTML = templates.map((template) => `<option value="${template.id}">${template.name}</option>`).join("");
    bikeSelect.innerHTML = `<option value="">Pilih motor (opsional)</option>${bikes.map((bike) => `<option value="${bike.id}">${bike.name}${bike.cc ? ` · ${bike.cc} cc` : ""}</option>`).join("")}`;
    document.getElementById("dragSpeedUnit").textContent = unit === "mph" ? "MPH" : "KM/J";
    updateProgress();
  }
  function updateProgress() {
    const template = getData().templates.find((item) => item.id === templateSelect.value) || getData().templates[0];
    if (!template || running) return;
    const unit = getData().unit === "mph" ? "mph" : "km/j";
    document.getElementById("dragProgress").innerHTML = `0 <small>/ ${template.target} ${template.type === "speed" ? unit : "m"}</small>`;
  }
  function updateLive(event) {
    const { speed, distance, position } = event.detail;
    currentSpeed = speed;
    currentDistance = distance;
    currentGpsTimestamp = Number(position?.timestamp) || 0;
    if (running && goAt) maximum = Math.max(maximum, speed);
    document.getElementById("dragSpeed").textContent = Math.round(speed * (getData().unit === "mph" ? 0.621371 : 1));
    if (!running || !goAt) return;
    const elapsed = (performance.now() - goAt) / 1000;
    const progress = selectedTemplate.type === "speed" ? currentSpeed : Math.max(0, currentDistance - sessionDistanceAtGo);
    const displayProgress = selectedTemplate.type === "speed" ? progress * (getData().unit === "mph" ? 0.621371 : 1) : progress;
    const displayTarget = selectedTemplate.type === "speed" && getData().unit === "mph" ? selectedTemplate.target * 0.621371 : selectedTemplate.target;
    const percent = Math.min(progress / selectedTemplate.target, 1);
    document.getElementById("dragTime").innerHTML = `${elapsed.toFixed(2)}<span> s</span>`;
    document.getElementById("dragProgress").innerHTML = `${Math.round(displayProgress)} <small>/ ${Math.round(displayTarget)} ${selectedTemplate.type === "speed" ? (getData().unit === "mph" ? "mph" : "km/j") : "m"}</small>`;
    document.getElementById("dragDistance").textContent = Math.max(0, currentDistance - sessionDistanceAtGo).toFixed(0);
    document.getElementById("dragProgressBar").style.width = `${percent * 100}%`;
    if (selectedTemplate.type === "distance") {
      const sampleElapsed = currentGpsTimestamp ? (currentGpsTimestamp - goWallTime) / 1000 : elapsed;
      if (progress >= selectedTemplate.target) {
        const span = progress - previousDistanceProgress;
        const fraction = span > 0 ? Math.min(1, Math.max(0, (selectedTemplate.target - previousDistanceProgress) / span)) : 1;
        const interpolatedTime = previousDistanceTime + (sampleElapsed - previousDistanceTime) * fraction;
        finish(Math.max(0, interpolatedTime), selectedTemplate.target);
        return;
      }
      previousDistanceProgress = progress;
      previousDistanceTime = sampleElapsed;
    } else if (progress >= selectedTemplate.target) {
      finish(elapsed);
    }
  }
  function paintLamps(count, color = "red") {
    lamps.forEach((lamp, index) => {
      lamp.className = index < count ? `lit ${color}` : "";
    });
  }
  async function begin() {
    if (running) return;
    const data = getData();
    selectedTemplate = data.templates.find((template) => template.id === templateSelect.value);
    if (!selectedTemplate) return showToast("Tambahkan template uji terlebih dahulu.");
    if (getGpsState().status === "denied" || getGpsState().status === "waiting") return showToast("Tunggu hingga GPS mendapatkan sinyal sebelum memulai.");
    running = true;
    canceled = false;
    maximum = 0;
    document.getElementById("runResult").classList.add("hidden");
    document.getElementById("dragStatus").textContent = "BERSIAP...";
    startButton.classList.add("hidden");
    cancelButton.classList.remove("hidden");
    templateSelect.disabled = true;
    bikeSelect.disabled = true;
    paintLamps(0);
    for (let index = 1; index <= lamps.length; index += 1) {
      if (canceled) return;
      paintLamps(index);
      await wait(500);
    }
    await wait(400 + Math.random() * 800);
    if (canceled) return;
    paintLamps(lamps.length, "green");
    goAt = performance.now();
    gpsAtGo = getGpsState().distance;
    sessionDistanceAtGo = gpsAtGo;
    goWallTime = Date.now();
    previousDistanceProgress = Math.max(0, currentDistance - sessionDistanceAtGo);
    previousDistanceTime = currentGpsTimestamp ? (currentGpsTimestamp - goWallTime) / 1000 : 0;
    document.getElementById("dragStatus").textContent = "GO! GAS POLL";
    frame = window.setInterval(() => {
      if (running && goAt) document.getElementById("dragTime").innerHTML = `${((performance.now() - goAt) / 1000).toFixed(2)}<span> s</span>`;
    }, 50);
  }
  function finish(seconds, finishedDistance = null) {
    if (!running) return;
    running = false;
    window.clearInterval(frame);
    paintLamps(lamps.length, "green");
    document.getElementById("dragStatus").textContent = "RUN SELESAI";
    const template = selectedTemplate;
    const unitFactor = getData().unit === "mph" ? 0.621371 : 1;
    const runDistance = finishedDistance ?? Math.max(0, currentDistance - gpsAtGo);
    const result = addResult({ templateName: template.name, bikeName: getData().bikes.find((bike) => bike.id === bikeSelect.value)?.name || "Motor tidak dipilih", time: seconds, maxSpeed: maximum, distance: runDistance });
    const panel = document.getElementById("runResult");
    panel.innerHTML = `<div class="result-stamp">RUN TEREKAM</div><strong>${seconds.toFixed(2)}<small> s</small></strong><div class="result-detail"><span>KEC. MAKS<strong>${(maximum * unitFactor).toFixed(0)} ${getData().unit === "mph" ? "MPH" : "KM/J"}</strong></span><span>JARAK<strong>${runDistance.toFixed(0)} m</strong></span></div>`;
    panel.classList.remove("hidden");
    cancelButton.classList.add("hidden");
    startButton.classList.remove("hidden");
    templateSelect.disabled = false;
    bikeSelect.disabled = false;
    showToast("Hasil uji tersimpan di riwayat.");
    window.dispatchEvent(new CustomEvent("racebox:result", { detail: result }));
    goAt = 0;
  }
  function cancel() {
    canceled = true;
    running = false;
    goAt = 0;
    window.clearInterval(frame);
    paintLamps(0);
    document.getElementById("dragStatus").textContent = "UJI DIBATALKAN";
    cancelButton.classList.add("hidden");
    startButton.classList.remove("hidden");
    templateSelect.disabled = false;
    bikeSelect.disabled = false;
    showToast("Uji dibatalkan.");
  }

  startButton.addEventListener("click", begin);
  cancelButton.addEventListener("click", cancel);
  templateSelect.addEventListener("change", updateProgress);
  window.addEventListener("racebox:gps", updateLive);
  refreshChoices();
  return { refreshChoices };
}
