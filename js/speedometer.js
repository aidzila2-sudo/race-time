import { getData } from "./storage.js";

const toRad = (degrees) => degrees * Math.PI / 180;
function haversine(first, second) {
  const radius = 6371000;
  const lat = toRad(second.latitude - first.latitude);
  const lon = toRad(second.longitude - first.longitude);
  const value = Math.sin(lat / 2) ** 2 + Math.cos(toRad(first.latitude)) * Math.cos(toRad(second.latitude)) * Math.sin(lon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function initSpeedometer(showToast) {
  const progress = document.getElementById("gaugeProgress");
  const circumference = 2 * Math.PI * 125;
  progress.style.strokeDasharray = `${circumference}`;
  progress.style.strokeDashoffset = `${circumference}`;
  let watchId = null;
  let priorPosition = null;
  let latestObservedTimestamp = null;
  let readings = [];
  let validFixes = [];
  let speed = 0;
  let maximum = 0;
  let distance = 0;
  let startedAt = null;
  let latestTimestamp = null;
  let status = "bad";
  let tickTimer = null;

  const unitDetails = () => getData().unit === "mph" ? { factor: 0.621371, label: "MPH" } : { factor: 1, label: "KM/J" };
  const displaySpeed = (kmh) => kmh * unitDetails().factor;
  function setStatus(next, label, note) {
    status = next;
    const statusNode = document.getElementById("gpsStatus");
    statusNode.className = `gps-status ${next}`;
    statusNode.innerHTML = `<i></i> ${label}`;
    document.querySelector("#gpsNote span:last-child").textContent = note;
    document.getElementById("connectionDot").classList.toggle("connected", next === "good" || next === "fair");
  }
  function paint() {
    const unit = unitDetails();
    document.getElementById("speedValue").textContent = Math.round(displaySpeed(speed));
    document.getElementById("speedUnit").textContent = unit.label;
    document.getElementById("maxSpeed").textContent = Math.round(displaySpeed(maximum));
    document.getElementById("maxUnit").textContent = unit.label;
    document.getElementById("sessionDistance").textContent = (distance / 1000).toFixed(2);
    const ratio = Math.min(speed / 200, 1);
    progress.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
    const color = speed >= 120 ? "var(--red)" : speed >= 80 ? "var(--amber)" : "var(--cyan)";
    progress.style.stroke = color;
    document.querySelector(".gauge-readout").style.setProperty("--gauge-color", color);
    document.querySelector(".gauge-wrap").classList.toggle("gps-weak", status === "bad");
  }
  function tick() {
    if (startedAt !== null && latestTimestamp !== null) {
      const seconds = Math.floor(Math.max(0, latestTimestamp - startedAt) / 1000);
      document.getElementById("sessionDuration").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
  }
  function announce(rawPosition, detail) {
    window.dispatchEvent(new CustomEvent("racebox:gps", { detail: { ...detail, rawPosition } }));
  }
  function handlePosition(position) {
    const coords = position.coords || {};
    const rawPosition = {
      timestamp: position.timestamp,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: coords.speed,
      accuracy: coords.accuracy
    };
    const accuracy = coords.accuracy;
    const timestamp = position.timestamp;
    if (!Number.isFinite(timestamp) || (latestObservedTimestamp !== null && timestamp <= latestObservedTimestamp)) {
      setStatus("bad", "BURUK", "Fix GPS duplikat atau waktunya mundur; diabaikan.");
      announce(rawPosition, { accepted: false, accuracy, reason: "timestamp" });
      paint();
      return;
    }
    latestObservedTimestamp = timestamp;
    if (!Number.isFinite(accuracy) || accuracy > 20) {
      validFixes = [];
      setStatus("bad", "BURUK", `Akurasi GPS ±${Number.isFinite(accuracy) ? Math.round(accuracy) : "--"} meter; menunggu fix yang lebih baik.`);
      announce(rawPosition, { accepted: false, accuracy, reason: "accuracy" });
      paint();
      return;
    }
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      setStatus("bad", "BURUK", "Koordinat GPS tidak valid; fix diabaikan.");
      announce(rawPosition, { accepted: false, accuracy, reason: "coordinates" });
      paint();
      return;
    }

    let segmentDistance = 0;
    let elapsed = 0;
    if (priorPosition) {
      elapsed = (timestamp - priorPosition.timestamp) / 1000;
      segmentDistance = haversine(priorPosition, rawPosition);
      if (elapsed <= 0 || segmentDistance > 100 * elapsed) {
        setStatus("bad", "BURUK", "Loncatan lokasi tidak wajar; fix GPS diabaikan.");
        announce(rawPosition, { accepted: false, accuracy, reason: "jump" });
        paint();
        return;
      }
      distance += segmentDistance;
    }

    const dopplerSpeed = coords.speed;
    const fixSpeed = typeof dopplerSpeed === "number" && Number.isFinite(dopplerSpeed) && dopplerSpeed >= 0
      ? dopplerSpeed * 3.6
      : priorPosition && elapsed > 0 ? segmentDistance / elapsed * 3.6 : null;
    const acceptedPosition = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp,
      accuracy
    };
    priorPosition = acceptedPosition;
    latestTimestamp = timestamp;
    if (startedAt === null) {
      startedAt = timestamp;
      if (tickTimer === null) tickTimer = window.setInterval(tick, 1000);
    }
    validFixes.push(timestamp);
    if (validFixes.length > 5) validFixes.shift();
    if (fixSpeed !== null) {
      readings.push(fixSpeed);
      if (readings.length > 4) readings.shift();
      speed = readings.reduce((sum, value) => sum + value, 0) / readings.length;
      maximum = Math.max(maximum, fixSpeed);
    }

    const quality = accuracy <= 10 && validFixes.length >= 3 ? "good" : "fair";
    const qualityLabel = quality === "good" ? "BAIK" : "CUKUP";
    setStatus(quality, qualityLabel, `GPS ${qualityLabel.toLowerCase()} · ±${Math.round(accuracy)} m · ${validFixes.length} fix valid terakhir.`);
    document.getElementById("gpsAccuracy").textContent = Math.round(accuracy);
    paint();
    announce(rawPosition, {
      accepted: true,
      speed,
      fixSpeed,
      maximum,
      distance,
      accuracy,
      position: acceptedPosition,
      validFixCount: validFixes.length
    });
  }
  function handleError(error) {
    const denied = error.code === error.PERMISSION_DENIED;
    validFixes = [];
    setStatus(denied ? "denied" : "bad", denied ? "IZIN DITOLAK" : "BURUK", denied ? "Izin lokasi ditolak. Aktifkan lokasi dari pengaturan browser." : "Sinyal GPS belum stabil. Pindah ke area terbuka.");
    if (denied) showToast("Izin lokasi ditolak. Aktifkan izin GPS di browser.");
  }
  function start() {
    if (watchId !== null) return;
    if (!navigator.geolocation) {
      setStatus("denied", "TIDAK TERSEDIA", "Browser ini tidak mendukung geolokasi.");
      return;
    }
    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (tickTimer !== null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    priorPosition = null;
    latestObservedTimestamp = null;
    latestTimestamp = null;
    startedAt = null;
    readings = [];
    validFixes = [];
    speed = 0;
    maximum = 0;
    distance = 0;
    document.getElementById("sessionDuration").textContent = "00:00";
    setStatus("bad", "MENUNGGU", "Pelacakan GPS dihentikan.");
    paint();
  }
  function reset() {
    distance = 0;
    maximum = 0;
    readings = [];
    speed = 0;
    startedAt = priorPosition ? priorPosition.timestamp : null;
    latestTimestamp = priorPosition ? priorPosition.timestamp : null;
    document.getElementById("sessionDuration").textContent = "00:00";
    paint();
    showToast("Sesi speedometer direset.");
  }
  document.getElementById("resetSession").addEventListener("click", reset);
  paint();
  return { getState: () => ({ speed, maximum, distance, status }), paint, start, stop };
}
