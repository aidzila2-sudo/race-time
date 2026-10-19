import { addResult, getData, saveAttemptLog } from "./storage.js";

const toRad = (degrees) => degrees * Math.PI / 180;

function haversine(first, second) {
  const radius = 6371000;
  const latitude = toRad(second.latitude - first.latitude);
  const longitude = toRad(second.longitude - first.longitude);
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(toRad(first.latitude)) * Math.cos(toRad(second.latitude)) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function interpolateFix(first, second, fraction, timestamp) {
  return {
    latitude: first.latitude + (second.latitude - first.latitude) * fraction,
    longitude: first.longitude + (second.longitude - first.longitude) * fraction,
    timestamp,
    speed: first.speed + (second.speed - first.speed) * fraction,
    accuracy: first.accuracy + (second.accuracy - first.accuracy) * fraction
  };
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
  let lastFixSpeed = null;
  let gpsFixes = [];
  let stationaryFix = null;
  let previousFix = null;
  let startPerf = 0;
  let startSource = "GPS";
  let runDistance = 0;
  let previousProgress = 0;
  let previousSpeed = 0;
  let maximum = 0;
  let stoppedSince = null;
  let latestMeasurementTimestamp = null;
  let frame = null;
  let wakeLock = null;
  let attemptLog = [];
  let motionEnabled = false;
  let gpsOnly = false;
  let calibrationStartedAt = null;
  let calibrationSamples = [];
  let sensorBias = null;
  let consecutiveMotionSamples = 0;
  let sensorLastTimestamp = null;
  let sensorEstimatedSpeed = 0;
  let sensorSegmentDistance = 0;
  let sensorSegmentHasSamples = false;
  let runAccuracies = [];
  let gpsIntegralDistance = 0;
  let integralPreviousFix = null;
  let calibrationTimeout = null;

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
    if (lastFixSpeed !== null) updateSpeed(lastFixSpeed);
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
    if (mode !== "running" || latestMeasurementTimestamp === null) return;
    const nowPerf = performance.now();
    const elapsed = Math.max(0, (nowPerf - startPerf) / 1000);
    if (elapsed > 60) {
      cancel(false, false, "Percobaan dibatalkan otomatis setelah 60 detik.");
      return;
    }
    timeNode.innerHTML = `${elapsed.toFixed(2)}<span> s</span>`;
  }

  function setAttemptControls(active) {
    startButton.classList.toggle("hidden", active);
    cancelButton.classList.toggle("hidden", !active);
    templateSelect.disabled = active;
    bikeSelect.disabled = active;
  }

  function logGps(rawPosition, accepted, reason = "", timing = {}, speed = null) {
    if (mode === "idle" || !rawPosition) return null;
    const item = {
      timestamp: rawPosition.timestamp,
      positionTimestamp: rawPosition.timestamp,
      arrivalPerf: timing.arrivalPerf,
      latency: timing.latency,
      fixPerf: timing.fixPerf,
      cumulativeDistance: runDistance + sensorSegmentDistance,
      speed,
      type: "gps",
      latitude: rawPosition.latitude,
      longitude: rawPosition.longitude,
      accuracy: rawPosition.accuracy,
      sensorSamples: "",
      valid: accepted,
      reason,
      startPerf: mode === "running" ? startPerf : "",
      finishPerf: ""
    };
    attemptLog.push(item);
    return item;
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    const heldLock = wakeLock;
    wakeLock = null;
    heldLock.release().catch((error) => console.warn("Wake Lock gagal dilepas:", error));
  }

  function removeMotionListener() {
    window.removeEventListener("devicemotion", handleMotion);
    window.clearTimeout(calibrationTimeout);
    calibrationTimeout = null;
    motionEnabled = false;
  }

  function finish(seconds, finalSpeed, distance, finishPerf) {
    if (mode !== "running") return;
    runDistance = distance;
    mode = "idle";
    window.clearInterval(frame);
    frame = null;
    removeMotionListener();
    releaseWakeLock();
    statusNode.textContent = "RUN SELESAI";
    timeNode.innerHTML = `${seconds.toFixed(2)}<span> s</span>`;
    const { bikes, unit } = getData();
    const factor = unit === "mph" ? 0.621371 : 1;
    const bikeName = bikes.find((bike) => bike.id === bikeSelect.value)?.name || "Motor tidak dipilih";
    const averageAccuracy = runAccuracies.length
      ? runAccuracies.reduce((sum, value) => sum + value, 0) / runAccuracies.length
      : null;
    const averageSpeed = distance / seconds * 3.6;
    const isShortDistanceRun = selectedTemplate.type === "distance" && Number(selectedTemplate.target) <= 500;
    const gpsIntegralAverageSpeed = gpsIntegralDistance / seconds * 3.6;
    const durationFromGpsIntegral = gpsIntegralDistance > 0
      ? distance / (gpsIntegralDistance / seconds)
      : Infinity;
    const integralDeviation = Math.abs(durationFromGpsIntegral - seconds) / seconds;
    const invalidReason = seconds <= 0
      ? "durasi tidak valid"
      : (isShortDistanceRun && seconds > 60)
        ? "durasi lebih dari 60 detik untuk target 500 m atau kurang"
        : (averageSpeed > 400 || averageSpeed < 3)
          ? "kecepatan rata-rata di luar rentang 3-400 km/j"
          : (integralDeviation > 0.3)
            ? "durasi menyimpang lebih dari 30% dari integral kecepatan GPS"
            : "";
    attemptLog.forEach((item) => {
      if (item.type === "gps") {
        item.startPerf = startPerf;
        item.finishPerf = finishPerf;
      }
    });
    console.info("RaceBox Drag Meter run", {
      startPerf,
      finishPerf,
      seconds,
      gpsIntegralDistance,
      gpsIntegralAverageSpeed,
      averageSpeed,
      valid: !invalidReason,
      reason: invalidReason
    });
    if (invalidReason) {
      statusNode.textContent = "PERCOBAAN TIDAK VALID";
      resultPanel.innerHTML = `<div class="result-stamp">PERCOBAAN TIDAK VALID</div><p>${invalidReason}</p>`;
      resultPanel.classList.remove("hidden");
      setAttemptControls(false);
      startButton.innerHTML = `<span class="button-icon">↻</span> ULANGI`;
      showToast("Percobaan tidak valid, coba ulang");
      return;
    }
    const result = addResult({
      templateName: selectedTemplate.name,
      templateType: selectedTemplate.type,
      target: Number(selectedTemplate.target),
      bikeName,
      time: seconds,
      finalSpeed,
      maxSpeed: Math.max(maximum, finalSpeed),
      distance,
      averageAccuracy,
      startSource,
      startPerf,
      finishPerf,
      valid: true
    });
    try {
      saveAttemptLog(result.id, attemptLog);
    } catch (error) {
      console.error("Log percobaan gagal disimpan:", error);
      showToast("Hasil tersimpan, tetapi log CSV gagal disimpan karena ruang penyimpanan.");
    }
    const accuracyText = averageAccuracy === null ? "--" : `±${averageAccuracy.toFixed(1)} m`;
    resultPanel.innerHTML = `<div class="result-stamp">RUN TEREKAM</div><strong>${seconds.toFixed(2)}<small> s</small></strong><div class="result-detail"><span>KEC. AKHIR<strong>${(finalSpeed * factor).toFixed(0)} ${unit === "mph" ? "MPH" : "KM/J"}</strong></span><span>KEC. MAKS<strong>${(Math.max(maximum, finalSpeed) * factor).toFixed(0)} ${unit === "mph" ? "MPH" : "KM/J"}</strong></span><span>JARAK<strong>${distance.toFixed(0)} m</strong></span><span>AKURASI GPS<strong>${accuracyText}</strong></span><span>WAKTU MULAI<strong>${startSource}</strong></span></div>`;
    resultPanel.classList.remove("hidden");
    setAttemptControls(false);
    startButton.innerHTML = `<span class="button-icon">↻</span> ULANGI`;
    showToast("Hasil uji tersimpan di riwayat.");
    window.dispatchEvent(new CustomEvent("racebox:result", { detail: result }));
  }

  function advanceRun(fix) {
    if (!previousFix || fix.timestamp <= previousFix.timestamp) return;
    let segmentStart = previousFix;
    if (startPerf > segmentStart.timestamp && startPerf < fix.timestamp) {
      const fractionFromStart = (startPerf - segmentStart.timestamp) / (fix.timestamp - segmentStart.timestamp);
      segmentStart = interpolateFix(segmentStart, fix, fractionFromStart, startPerf);
    } else if (segmentStart.timestamp < startPerf && fix.timestamp <= startPerf) {
      previousFix = fix;
      return;
    }
    const gpsDistance = haversine(segmentStart, fix);
    const hasSensorEstimate = getData().useMotionSensor !== false && sensorSegmentHasSamples;
    const segment = hasSensorEstimate ? gpsDistance * 0.8 + sensorSegmentDistance * 0.2 : gpsDistance;
    const correctedSpeed = hasSensorEstimate
      ? fix.speed * 0.8 + sensorEstimatedSpeed * 3.6 * 0.2
      : fix.speed;
    const nextDistance = runDistance + segment;
    const progress = selectedTemplate.type === "distance" ? nextDistance : correctedSpeed;
    const crossed = progress >= selectedTemplate.target;
    const fraction = crossed && progress > previousProgress
      ? Math.min(1, Math.max(0, (selectedTemplate.target - previousProgress) / (progress - previousProgress)))
      : 1;
    const measuredDistance = runDistance + segment * fraction;
    const eventTime = segmentStart.timestamp + (fix.timestamp - segmentStart.timestamp) * fraction;
    const finishSpeed = previousSpeed + (correctedSpeed - previousSpeed) * fraction;
    const integralEndFix = crossed
      ? interpolateFix(segmentStart, fix, fraction, eventTime)
      : fix;
    if (!integralPreviousFix) integralPreviousFix = segmentStart;
    const gpsIntervalSeconds = Math.max(0, (integralEndFix.timestamp - integralPreviousFix.timestamp) / 1000);
    gpsIntegralDistance += (integralPreviousFix.speed + integralEndFix.speed) / 2 / 3.6 * gpsIntervalSeconds;
    integralPreviousFix = integralEndFix;

    if (crossed) {
      runAccuracies.push(fix.accuracy);
      finish(Math.max(0, (eventTime - startPerf) / 1000), finishSpeed, measuredDistance, eventTime);
      return;
    }

    runDistance = nextDistance;
    previousProgress = progress;
    previousSpeed = correctedSpeed;
    previousFix = fix;
    maximum = Math.max(maximum, correctedSpeed);
    runAccuracies.push(fix.accuracy);
    showDistanceProgress(progress, runDistance);
    updateSpeed(correctedSpeed);
    sensorSegmentDistance = 0;
    sensorSegmentHasSamples = false;
    sensorEstimatedSpeed = fix.speed / 3.6;
    sensorLastTimestamp = fix.timestamp;
    latestMeasurementTimestamp = fix.timestamp;

    if (fix.speed < 2) {
      if (stoppedSince === null) stoppedSince = fix.timestamp;
      if (fix.timestamp - stoppedSince > 3000) cancel(true);
    } else {
      stoppedSince = null;
    }
  }

  function beginRun(timestamp, source) {
    if (mode !== "ready" || !latestFix) return;
    const anchor = [...gpsFixes].reverse().find((fix) => fix.timestamp <= timestamp) || latestFix;
    mode = "running";
    startPerf = timestamp;
    startSource = source;
    previousFix = anchor;
    previousSpeed = source === "GPS" ? 3 : anchor.speed || 0;
    previousProgress = selectedTemplate.type === "speed" ? previousSpeed : 0;
    runDistance = 0;
    maximum = 0;
    stoppedSince = null;
    sensorSegmentDistance = 0;
    sensorSegmentHasSamples = false;
    gpsIntegralDistance = 0;
    integralPreviousFix = null;
    sensorEstimatedSpeed = (anchor.speed || 0) / 3.6;
    sensorLastTimestamp = timestamp;
    runAccuracies = [anchor.accuracy];
    latestMeasurementTimestamp = timestamp;
    statusNode.textContent = `OTOMATIS MULAI · ${source}`;
    updateTimer();
  }

  function handleGps(event) {
    const { accuracy, fixSpeed, position, accepted, rawPosition, reason, arrivalPerf, latency, fixPerf } = event.detail;
    const timing = { arrivalPerf, latency, fixPerf };
    const logItem = logGps(rawPosition, accepted, reason, timing,
      Number.isFinite(fixSpeed) ? fixSpeed : Number.isFinite(rawPosition?.speed) ? rawPosition.speed * 3.6 : null);
    if (!accepted || !position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
      || !Number.isFinite(fixPerf)) {
      if (logItem) console.info("RaceBox Drag Meter GPS fix", { ...logItem });
      return;
    }

    const speed = Number.isFinite(fixSpeed) && fixSpeed >= 0 ? fixSpeed : null;
    if (speed === null) {
      if (logItem) {
        logItem.valid = false;
        logItem.reason = "speed";
        console.info("RaceBox Drag Meter GPS fix", { ...logItem });
      }
      return;
    }
    const fix = { ...position, timestamp: fixPerf, accuracy, speed };
    const precedingFix = latestFix;
    latestFix = fix;
    lastFixSpeed = speed;
    latestMeasurementTimestamp = fix.timestamp;
    if (mode !== "running") updateSpeed(speed);
    gpsFixes.push(fix);
    if (gpsFixes.length > 8) gpsFixes.shift();

    if (mode === "ready" && gpsOnly && precedingFix && precedingFix.speed < 3 && speed >= 3) {
      const fraction = (3 - precedingFix.speed) / (speed - precedingFix.speed);
      const startTime = precedingFix.timestamp + (fix.timestamp - precedingFix.timestamp) * fraction;
      stationaryFix = precedingFix;
      beginRun(startTime, "GPS");
      advanceRun(fix);
    } else if (mode === "running") {
      advanceRun(fix);
    }
    if (logItem) {
      logItem.cumulativeDistance = runDistance + sensorSegmentDistance;
      logItem.startPerf = mode === "running" ? startPerf : logItem.startPerf;
      console.info("RaceBox Drag Meter GPS fix", { ...logItem });
    }
  }

  function horizontalAcceleration(event) {
    const acceleration = event.acceleration || event.accelerationIncludingGravity;
    if (!acceleration || !Number.isFinite(acceleration.x) || !Number.isFinite(acceleration.y)) return null;
    return { x: acceleration.x, y: acceleration.y, z: Number.isFinite(acceleration.z) ? acceleration.z : 0 };
  }

  function handleMotion(event) {
    const timestamp = performance.now();
    const raw = horizontalAcceleration(event);
    if (!raw) return;
    if (mode !== "idle") {
      attemptLog.push({
        timestamp,
        type: "sensor",
        latitude: "",
        longitude: "",
        speed: "",
        accuracy: "",
        sensorSamples: `${raw.x.toFixed(3)},${raw.y.toFixed(3)},${raw.z.toFixed(3)}`,
        valid: true,
        reason: ""
      });
    }

    if (mode === "ready" && !gpsOnly && sensorBias === null) {
      if (calibrationStartedAt === null) calibrationStartedAt = timestamp;
      if (timestamp - calibrationStartedAt < 1000) {
        calibrationSamples.push(raw);
        statusNode.textContent = "KALIBRASI SENSOR · MOTOR DIAM";
        return;
      }
      if (calibrationSamples.length < 3) return;
      sensorBias = calibrationSamples.reduce((sum, sample) => ({
        x: sum.x + sample.x / calibrationSamples.length,
        y: sum.y + sample.y / calibrationSamples.length,
        z: sum.z + sample.z / calibrationSamples.length
      }), { x: 0, y: 0, z: 0 });
      calibrationSamples = [];
      statusNode.textContent = "SENSOR AKTIF · TUNGGU GERAK";
    }
    if (mode === "ready" && !gpsOnly && sensorBias !== null) {
      const horizontal = Math.hypot(raw.x - sensorBias.x, raw.y - sensorBias.y);
      consecutiveMotionSamples = horizontal > 0.8 ? consecutiveMotionSamples + 1 : 0;
      if (consecutiveMotionSamples >= 3) beginRun(timestamp, "sensor");
      return;
    }

    if (mode !== "running" || sensorBias === null || getData().useMotionSensor === false) return;
    const elapsed = sensorLastTimestamp === null ? 0 : (timestamp - sensorLastTimestamp) / 1000;
    if (elapsed <= 0 || elapsed > 0.5) {
      sensorLastTimestamp = timestamp;
      return;
    }
    const acceleration = Math.hypot(raw.x - sensorBias.x, raw.y - sensorBias.y);
    sensorSegmentDistance += sensorEstimatedSpeed * elapsed + 0.5 * acceleration * elapsed * elapsed;
    sensorEstimatedSpeed += acceleration * elapsed;
    sensorSegmentHasSamples = true;
    sensorLastTimestamp = timestamp;
    latestMeasurementTimestamp = timestamp;
    updateSpeed(sensorEstimatedSpeed * 3.6);
    showDistanceProgress(
      selectedTemplate.type === "distance" ? runDistance + sensorSegmentDistance : sensorEstimatedSpeed * 3.6,
      runDistance + sensorSegmentDistance
    );
  }

  async function requestMotionPermission() {
    if (getData().useMotionSensor === false || !("DeviceMotionEvent" in window)) return false;
    const motion = window.DeviceMotionEvent;
    if (typeof motion.requestPermission === "function") {
      try {
        if (await motion.requestPermission() !== "granted") {
          showToast("Izin sensor gerak ditolak; menggunakan mode GPS saja.");
          return false;
        }
      } catch (error) {
        console.warn("Izin sensor gerak gagal diminta:", error);
        showToast("Sensor gerak tidak diizinkan; menggunakan mode GPS saja.");
        return false;
      }
    }
    return true;
  }

  async function begin() {
    if (mode !== "idle") return;
    selectedTemplate = getData().templates.find((template) => template.id === templateSelect.value);
    if (!selectedTemplate) {
      showToast("Tambahkan template uji terlebih dahulu.");
      return;
    }

    mode = "preparing";
    attemptLog = [];
    setAttemptControls(true);
    const motionPermission = requestMotionPermission();
    let wakeLockRequest = Promise.resolve(null);
    try {
      if (navigator.wakeLock) wakeLockRequest = navigator.wakeLock.request("screen");
      wakeLock = await wakeLockRequest;
    } catch (error) {
      console.warn("Wake Lock tidak tersedia:", error);
      showToast("Layar mungkin meredup; Wake Lock tidak tersedia.");
    }
    const hasMotion = await motionPermission;
    if (mode !== "preparing") {
      releaseWakeLock();
      return;
    }
    const gpsState = getGpsState();
    const fix = latestFix;
    if (!fix || !Number.isFinite(fix.speed) || performance.now() - fix.timestamp > 5000
      || fix.accuracy > 10 || fix.speed >= 2 || gpsState.status === "denied") {
      mode = "idle";
      setAttemptControls(false);
      releaseWakeLock();
      showToast("Tunggu GPS terkunci (akurasi 10 m atau lebih baik) dan motor diam.");
      return;
    }

    mode = "ready";
    stationaryFix = fix;
    previousFix = null;
    startPerf = 0;
    runDistance = 0;
    previousProgress = 0;
    previousSpeed = 0;
    maximum = 0;
    stoppedSince = null;
    gpsOnly = !hasMotion;
    motionEnabled = hasMotion;
    calibrationStartedAt = null;
    calibrationSamples = [];
    sensorBias = null;
    consecutiveMotionSamples = 0;
    runAccuracies = [];
    resultPanel.classList.add("hidden");
    if (motionEnabled) {
      window.addEventListener("devicemotion", handleMotion);
      statusNode.textContent = "KALIBRASI SENSOR · MOTOR DIAM";
      calibrationTimeout = window.setTimeout(() => {
        if (mode !== "ready" || sensorBias !== null) return;
        gpsOnly = true;
        removeMotionListener();
        statusNode.textContent = "MODE GPS SAJA · TUNGGU GERAK";
        showToast("Sensor gerak tidak memberikan sampel; menggunakan mode GPS saja.");
      }, 2200);
    } else {
      gpsOnly = true;
      statusNode.textContent = "MODE GPS SAJA · TUNGGU GERAK";
    }
    timeNode.innerHTML = `0.00<span> s</span>`;
    frame = window.setInterval(updateTimer, 50);
  }

  function cancel(stopped = false, silent = false, message = "") {
    if (mode === "idle") return;
    mode = "idle";
    window.clearInterval(frame);
    frame = null;
    removeMotionListener();
    releaseWakeLock();
    startPerf = 0;
    stoppedSince = null;
    setAttemptControls(false);
    timeNode.innerHTML = `0.00<span> s</span>`;
    updateProgress(0, 0);
    statusNode.textContent = message ? "PERCOBAAN DIBATALKAN · BATAS WAKTU"
      : stopped ? "PERCOBAAN DIBATALKAN · MOTOR BERHENTI" : "UJI DIBATALKAN";
    startButton.innerHTML = `<span class="button-icon">▶</span> SIAP`;
    if (!silent) {
      if (message) showToast(message);
      else if (stopped) showToast("Percobaan dibatalkan, motor berhenti");
      else showToast("Uji dibatalkan.");
    }
  }

  startButton.addEventListener("click", begin);
  cancelButton.addEventListener("click", () => cancel());
  templateSelect.addEventListener("change", () => updateProgress());
  window.addEventListener("racebox:gps", handleGps);
  refreshChoices();
  return {
    refreshChoices,
    onOpen: selectDefaultTemplate,
    stop() {
      cancel(false, true);
      releaseWakeLock();
      removeMotionListener();
    }
  };
}
