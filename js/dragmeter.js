import { addResult, getData } from "./storage.js";

const toRad = (degrees) => degrees * Math.PI / 180;

function haversine(first, second) {
  const radius = 6371000;
  const latitude = toRad(second.latitude - first.latitude);
  const longitude = toRad(second.longitude - first.longitude);
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(toRad(first.latitude)) * Math.cos(toRad(second.latitude)) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function initDragMeter(showToast, getGpsState) {
  const templateSelect = document.getElementById("dragTemplate");
  const bikeSelect = document.getElementById("dragBike");
  const startButton = document.getElementById("startRun");
  const cancelButton = document.getElementById("cancelRun");
  const statusNode = document.getElementById("dragStatus");
  const timeNode = document.getElementById("dragTime");
  const progressNode = document.getElementById("dragProgress");
  const progressLabel = document.getElementById("dragProgressLabel");
  const progressBar = document.getElementById("dragProgressBar");
  const distanceNode = document.getElementById("dragDistance");
  const speedNode = document.getElementById("dragSpeed");
  const resultPanel = document.getElementById("runResult");

  let mode = "idle";
  let selectedTemplate = null;
  let latestFix = null;
  let stationaryFix = null;
  let previousFix = null;
  let startTimestamp = 0;
  let runDistance = 0;
  let previousProgress = 0;
  let previousSpeed = 0;
  let maximum = 0;
  let stoppedSince = null;
  let frame = null;

  function defaultTemplate(templates) {
    return templates.find((item) => item.id === "builtin-201m")
      || templates.find((item) => item.type === "distance" && Number(item.target) === 201)
      || templates[0];
  }

  function refreshChoices() {
    const { templates, bikes, unit } = getData();
    const primary = defaultTemplate(templates);
    const orderedTemplates = primary ? [primary, ...templates.filter((item) => item !== primary)] : templates;
    const previousTemplate = templateSelect.value;
    templateSelect.innerHTML = orderedTemplates.map((template) => `<option value="${template.id}">${template.name}</option>`).join("");
    templateSelect.value = orderedTemplates.some((item) => item.id === previousTemplate)
      ? previousTemplate
      : primary?.id || "";
    bikeSelect.innerHTML = `<option value="">Pilih motor (opsional)</option>${bikes.map((bike) => `<option value="${bike.id}">${bike.name}${bike.cc ? ` · ${bike.cc} cc` : ""}</option>`).join("")}`;
    document.getElementById("dragSpeedUnit").textContent = unit === "mph" ? "MPH" : "KM/J";
    updateProgress();
  }

  function selectDefaultTemplate() {
    const primary = defaultTemplate(getData().templates);
    if (primary && mode === "idle") {
      templateSelect.value = primary.id;
      updateProgress();
    }
  }

  function updateProgress(progress = 0, distance = 0) {
    const template = getData().templates.find((item) => item.id === templateSelect.value);
    if (!template || mode !== "idle") return;
    const unit = getData().unit === "mph" ? "mph" : "km/j";
    const amount = template.type === "speed" && getData().unit === "mph" ? progress * 0.621371 : progress;
    const target = template.type === "speed" && getData().unit === "mph" ? template.target * 0.621371 : template.target;
    progressNode.innerHTML = `${Math.round(amount)} <small>/ ${Math.round(target)} ${template.type === "speed" ? unit : "m"}</small>`;
    progressLabel.textContent = "PROGRES";
    distanceNode.textContent = distance.toFixed(0);
    progressBar.style.width = `${template.type === "distance" ? Math.min(progress / template.target, 1) * 100 : 0}%`;
  }

  function displaySpeed(speed) {
    return speed * (getData().unit === "mph" ? 0.621371 : 1);
  }

  function updateSpeed(speed) {
    speedNode.textContent = Math.round(displaySpeed(speed));
  }

  function showDistanceProgress(progress, distance) {
    const unit = getData().unit === "mph" ? "mph" : "km/j";
    const shownProgress = selectedTemplate.type === "speed" ? displaySpeed(progress) : progress;
    const shownTarget = selectedTemplate.type === "speed" ? displaySpeed(selectedTemplate.target) : selectedTemplate.target;
    progressNode.innerHTML = `${Math.ceil(Math.max(0, shownTarget - shownProgress))} <small>${selectedTemplate.type === "speed" ? unit : "m"} tersisa</small>`;
    progressLabel.textContent = "TERSISA";
    distanceNode.textContent = distance.toFixed(0);
    progressBar.style.width = `${Math.min(progress / selectedTemplate.target, 1) * 100}%`;
  }

  function updateTimer() {
    if (mode !== "running") return;
    const elapsed = Math.max(0, (Date.now() - startTimestamp) / 1000);
    timeNode.innerHTML = `${elapsed.toFixed(2)}<span> s</span>`;
    if (stoppedSince !== null && Date.now() - stoppedSince > 3000) {
      cancel(true);
    }
  }

  function setAttemptControls(active) {
    startButton.classList.toggle("hidden", active);
    cancelButton.classList.toggle("hidden", !active);
    templateSelect.disabled = active;
    bikeSelect.disabled = active;
  }

  function beginRun(firstMovingFix) {
    if (!stationaryFix) return;
    mode = "running";
    startTimestamp = (stationaryFix.timestamp + firstMovingFix.timestamp) / 2;
    previousFix = stationaryFix;
    previousProgress = 0;
    previousSpeed = stationaryFix.speed;
    runDistance = 0;
    maximum = 0;
    stoppedSince = null;
    statusNode.textContent = "OTOMATIS MULAI";
    updateTimer();
    advanceRun(firstMovingFix);
  }

  function finish(seconds, finalSpeed, distance) {
    if (mode !== "running") return;
    mode = "idle";
    window.clearInterval(frame);
    frame = null;
    statusNode.textContent = "RUN SELESAI";
    timeNode.innerHTML = `${seconds.toFixed(2)}<span> s</span>`;
    const { bikes, unit } = getData();
    const factor = unit === "mph" ? 0.621371 : 1;
    const bikeName = bikes.find((bike) => bike.id === bikeSelect.value)?.name || "Motor tidak dipilih";
    const result = addResult({
      templateName: selectedTemplate.name,
      bikeName,
      time: seconds,
      finalSpeed,
      maxSpeed: Math.max(maximum, finalSpeed),
      distance
    });
    resultPanel.innerHTML = `<div class="result-stamp">RUN TEREKAM</div><strong>${seconds.toFixed(2)}<small> s</small></strong><div class="result-detail"><span>KEC. AKHIR<strong>${(finalSpeed * factor).toFixed(0)} ${unit === "mph" ? "MPH" : "KM/J"}</strong></span><span>KEC. MAKS<strong>${(Math.max(maximum, finalSpeed) * factor).toFixed(0)} ${unit === "mph" ? "MPH" : "KM/J"}</strong></span><span>JARAK<strong>${distance.toFixed(0)} m</strong></span></div>`;
    resultPanel.classList.remove("hidden");
    setAttemptControls(false);
    startButton.innerHTML = `<span class="button-icon">↻</span> ULANGI`;
    showToast("Hasil uji tersimpan di riwayat.");
    window.dispatchEvent(new CustomEvent("racebox:result", { detail: result }));
  }

  function advanceRun(fix) {
    if (!previousFix || fix.timestamp <= previousFix.timestamp) return;
    const segment = haversine(previousFix, fix);
    const nextDistance = runDistance + segment;
    const progress = selectedTemplate.type === "distance" ? nextDistance : fix.speed;
    const crossed = progress >= selectedTemplate.target;
    const fraction = crossed && progress > previousProgress
      ? Math.min(1, Math.max(0, (selectedTemplate.target - previousProgress) / (progress - previousProgress)))
      : 1;
    const measuredDistance = runDistance + segment * fraction;
    const eventTime = previousFix.timestamp + (fix.timestamp - previousFix.timestamp) * fraction;
    const finishSpeed = previousSpeed + (fix.speed - previousSpeed) * fraction;

    if (crossed) {
      finish(Math.max(0, (eventTime - startTimestamp) / 1000), finishSpeed, measuredDistance);
      return;
    }

    runDistance = nextDistance;
    previousProgress = progress;
    previousSpeed = fix.speed;
    previousFix = fix;
    maximum = Math.max(maximum, fix.speed);
    showDistanceProgress(progress, runDistance);
    updateSpeed(fix.speed);

    if (fix.speed < 2) {
      if (stoppedSince === null) stoppedSince = Date.now();
    } else {
      stoppedSince = null;
    }
  }

  function handleGps(event) {
    const { accuracy, fixSpeed, position } = event.detail;
    if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
      || !Number.isFinite(position.timestamp)) {
      latestFix = null;
      return;
    }

    const speed = Number.isFinite(fixSpeed) && fixSpeed >= 0 ? fixSpeed : null;
    latestFix = { ...position, accuracy, speed };
    if (!Number.isFinite(accuracy) || accuracy > 20) return;
    if (speed !== null) updateSpeed(speed);

    if (mode === "waiting") {
      if (speed !== null && speed < 2) stationaryFix = latestFix;
      if (speed !== null && speed > 3 && stationaryFix) beginRun(latestFix);
      return;
    }

    if (mode !== "running" || speed === null) return;
    advanceRun(latestFix);
  }

  function begin() {
    if (mode !== "idle") return;
    const fix = latestFix;
    const now = Date.now();
    const gpsState = getGpsState();
    if (!fix || !Number.isFinite(fix.speed) || now - fix.timestamp > 5000
      || fix.accuracy > 15 || fix.speed >= 2 || gpsState.status === "denied") {
      showToast("Tunggu GPS terkunci dan motor diam");
      return;
    }

    selectedTemplate = getData().templates.find((template) => template.id === templateSelect.value);
    if (!selectedTemplate) {
      showToast("Tambahkan template uji terlebih dahulu.");
      return;
    }
    updateProgress(0, 0);
    mode = "waiting";
    stationaryFix = fix;
    previousFix = null;
    startTimestamp = 0;
    runDistance = 0;
    previousProgress = 0;
    previousSpeed = 0;
    maximum = 0;
    stoppedSince = null;
    resultPanel.classList.add("hidden");
    statusNode.textContent = "MENUNGGU MOTOR BERGERAK";
    timeNode.innerHTML = `0.00<span> s</span>`;
    setAttemptControls(true);
    frame = window.setInterval(updateTimer, 50);
  }

  function cancel(stopped = false) {
    if (mode === "idle") return;
    mode = "idle";
    window.clearInterval(frame);
    frame = null;
    startTimestamp = 0;
    stoppedSince = null;
    setAttemptControls(false);
    timeNode.innerHTML = `0.00<span> s</span>`;
    updateProgress(0, 0);
    statusNode.textContent = stopped ? "Percobaan dibatalkan, motor berhenti" : "UJI DIBATALKAN";
    startButton.innerHTML = `<span class="button-icon">▶</span> SIAP`;
    if (stopped) showToast("Percobaan dibatalkan, motor berhenti");
    else showToast("Uji dibatalkan.");
  }

  startButton.addEventListener("click", begin);
  cancelButton.addEventListener("click", () => cancel());
  templateSelect.addEventListener("change", () => updateProgress());
  window.addEventListener("racebox:gps", handleGps);
  refreshChoices();
  return { refreshChoices, onOpen: selectDefaultTemplate };
}
