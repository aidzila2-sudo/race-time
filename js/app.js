import { continueAsGuest, getCurrentUser, signInWithGoogle, signOut } from "./auth.js";
import { initDragMeter } from "./dragmeter.js";
import { initHistory, renderHistory } from "./history.js";
import { initRouter } from "./router.js";
import { initSettings } from "./settings.js";
import { initSpeedometer } from "./speedometer.js";
import { getData, resetAllData } from "./storage.js";

const toast = document.getElementById("toast");
let toastTimer;
let activeSpeedometer = null;
export function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
}

function openModal({ kicker = "RACEBOX", title, content }) {
  document.getElementById("modalKicker").textContent = kicker;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalContent").innerHTML = content;
  document.getElementById("modalBackdrop").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modalBackdrop").classList.add("hidden");
}

function updateUserLabel() {
  const user = getCurrentUser();
  document.getElementById("userLabel").textContent = user ? (user.guest ? "MODE TAMU" : user.name.toUpperCase()) : "BELUM MASUK";
  document.getElementById("accountName").textContent = user ? (user.guest ? "Mode Tamu" : user.name || "Pengendara") : "Belum masuk";
  document.getElementById("accountEmail").textContent = user && !user.guest ? user.email : "";
  document.getElementById("accountAction").textContent = user ? "KELUAR" : "MASUK DENGAN GOOGLE";
}

async function googleLogin() {
  const result = await signInWithGoogle();
  if (result.error) return showToast(result.error);
  updateUserLabel();
  activeSpeedometer?.start();
  closeModal();
  showToast(`Selamat datang, ${result.user.name}.`);
}
function showLogin() {
  openModal({ kicker: "GPS MOTOR TELEMETRY", title: "Selamat datang", content: `<p class="login-copy">Catat performa motor Anda dengan pembacaan GPS langsung.</p><div class="login-actions"><button class="button button-google" id="googleLogin" type="button"><span class="google-g">G</span> Masuk dengan Google</button><button class="button button-secondary" id="guestLogin" type="button">Lanjutkan sebagai Tamu <span>→</span></button></div><p class="privacy-note">Data sesi disimpan di perangkat Anda.</p>` });
  document.getElementById("googleLogin").addEventListener("click", googleLogin);
  document.getElementById("guestLogin").addEventListener("click", () => {
    continueAsGuest();
    updateUserLabel();
    activeSpeedometer?.start();
    closeModal();
    showToast("Mode tamu aktif. Semua fitur siap digunakan.");
  });
}

function initialize() {
  const speedometer = initSpeedometer(showToast);
  const dragmeter = initDragMeter(showToast, speedometer.getState);
  activeSpeedometer = speedometer;
  initHistory(showToast);
  const settings = initSettings(openModal, showToast, () => {
    dragmeter.refreshChoices();
    renderHistory();
    speedometer.paint();
  });
  initRouter((route) => {
    if (route === "history") renderHistory();
    if (route === "settings") settings.render();
    if (route === "drag") dragmeter.onOpen();
  });
  document.getElementById("accountAction").addEventListener("click", async () => {
    if (!getCurrentUser()) return showLogin();
    if (!window.confirm("Keluar dari akun? Data motor dan riwayat di perangkat ini tetap tersimpan.")) return;
    dragmeter.stop();
    speedometer.stop();
    let signOutError = null;
    try {
      await signOut();
    } catch (error) {
      console.error("Firebase signOut gagal:", error);
      signOutError = error;
    }
    updateUserLabel();
    showLogin();
    showToast(signOutError
      ? `Anda telah keluar secara lokal, tetapi logout Firebase gagal: ${signOutError.message}`
      : "Anda telah keluar. Data di perangkat tetap tersimpan.");
  });
  document.getElementById("resetAllData").addEventListener("click", async () => {
    if (!window.confirm("Hapus semua data di perangkat ini? Motor, template, riwayat, dan pengaturan akan dihapus.")) return;
    if (window.prompt('Konfirmasi kedua: ketik "HAPUS" untuk melanjutkan.') !== "HAPUS") {
      showToast("Reset dibatalkan.");
      return;
    }
    dragmeter.stop();
    speedometer.stop();
    let signOutError = null;
    try {
      await signOut();
    } catch (error) {
      console.error("Firebase signOut saat reset gagal:", error);
      signOutError = error;
    }
    resetAllData();
    dragmeter.refreshChoices();
    renderHistory();
    settings.render();
    document.documentElement.dataset.unit = getData().unit;
    updateUserLabel();
    showLogin();
    showToast(signOutError
      ? `Data RaceBox dihapus, tetapi logout Firebase gagal: ${signOutError.message}`
      : "Semua data RaceBox di perangkat telah dihapus.");
  });
  document.querySelector(".close-modal").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  window.addEventListener("racebox:result", renderHistory);
  updateUserLabel();
  if (!getCurrentUser()) showLogin();
  else speedometer.start();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker gagal didaftarkan:", error));
  }
  document.documentElement.dataset.unit = getData().unit;
}

initialize();
