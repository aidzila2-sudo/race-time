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
  let readings = [];
  let speed = 0;
  let maximum = 0;
  let distance = 0;
  let startedAt = null;
  let timer = null;
  let status = "waiting";

  const unitDetails = () => getData().unit === "mph" ? { factor: 0.621371, label: "MPH" } : { factor: 1, label: "KM/J" };
  const displaySpeed = (kmh) => kmh * unitDetails().factor;
  function setStatus(next, label, note) {
    status = next;
    const statusNode = document.getElementById("gpsStatus");
    statusNode.className = `gps-status ${next}`;
    statusNode.innerHTML = `<i></i> ${label}`;
    document.querySelector("#gpsNote span:last-child").textContent = note;
    document.getElementById("connectionDot").classList.toggle("connected", next === "locked");
  }
  function paint() {
    const unit = unitDetails();
    document.getElementById("speedValue").textContent = Math.round(displaySpeed(speed));
    document.getElementById("speedUnit").textContent = unit.label;
    document.getElementById("maxSpeed").textContent = Math.round(displaySpeed(maximum));
    document.getElementById("maxUnit").textContent = unit.label;
    document.getElementById("sessionDistance").textContent = (distance / 1000).toFixed(2);
    document.getElementById("dragSpeed").textContent = Math.round(displaySpeed(speed));
    document.getElementById("dragSpeedUnit").textContent = unit.label;
    const ratio = Math.min(speed / 200, 1);
    progress.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
    const color = speed >= 120 ? "var(--red)" : speed >= 80 ? "var(--amber)" : "var(--cyan)";
    progress.style.stroke = color;
    document.querySelector(".gauge-readout").style.setProperty("--gauge-color", color);
    document.querySelector(".gauge-wrap").classList.toggle("gps-weak", status === "weak");
  }
  function tick() {
    if (startedAt) {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      document.getElementById("sessionDuration").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
  }
  function handlePosition(position) {
    const coords = position.coords;
    if (priorPosition) {
      const elapsed = (position.timestamp - priorPosition.timestamp) / 1000;
      if (elapsed > 0 && elapsed < 30) {
        distance += haversine(priorPosition, coords);
        const calculated = haversine(priorPosition, coords) / elapsed;
        const metersPerSecond = Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : calculated;
        readings.push(metersPerSecond * 3.6);
        if (readings.length > 4) readings.shift();
        speed = readings.reduce((sum, value) => sum + value, 0) / readings.length;
      }
    } else {
      startedAt = Date.now();
      timer = window.setInterval(tick, 1000);
    }
    priorPosition = { latitude: coords.latitude, longitude: coords.longitude, timestamp: position.timestamp };
    maximum = Math.max(maximum, speed);
    document.getElementById("gpsAccuracy").textContent = Math.round(coords.accuracy);
    setStatus(coords.accuracy <= 25 ? "locked" : "weak", coords.accuracy <= 25 ? "TERKUNCI" : "LEMAH", `GPS aktif · akurasi ±${Math.round(coords.accuracy)} meter.`);
    paint();
    window.dispatchEvent(new CustomEvent("racebox:gps", { detail: { speed, maximum, distance, accuracy: coords.accuracy, position: priorPosition } }));
  }
  function handleError(error) {
    const denied = error.code === error.PERMISSION_DENIED;
    setStatus(denied ? "denied" : "weak", denied ? "IZIN DITOLAK" : "LEMAH", denied ? "Izin lokasi ditolak. Aktifkan lokasi dari pengaturan browser." : "Sinyal GPS belum stabil. Pindah ke area terbuka.");
    if (denied) showToast("Izin lokasi ditolak. Aktifkan izin GPS di browser.");
  }
  function start() {
    if (!navigator.geolocation) {
      setStatus("denied", "TIDAK TERSEDIA", "Browser ini tidak mendukung geolokasi.");
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  function reset() {
    distance = 0;
    maximum = 0;
    readings = [];
    speed = 0;
    startedAt = priorPosition ? Date.now() : null;
    document.getElementById("sessionDuration").textContent = "00:00";
    paint();
    showToast("Sesi speedometer direset.");
  }
  document.getElementById("resetSession").addEventListener("click", reset);
  paint();
  start();
  return { getState: () => ({ speed, maximum, distance, status }), paint };
}
