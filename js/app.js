import { continueAsGuest, getCurrentUser, signInWithGoogle, signOut } from "./auth.js";
import { initDragMeter } from "./dragmeter.js";
import { initHistory, renderHistory } from "./history.js";
import { initRouter } from "./router.js";
import { initSettings } from "./settings.js";
import { initSpeedometer } from "./speedometer.js";
import { getData } from "./storage.js";

const toast = document.getElementById("toast");
let toastTimer;
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
  document.getElementById("accountAction").textContent = user?.guest ? "MASUK DENGAN GOOGLE" : user ? "KELUAR DARI AKUN" : "MASUK DENGAN GOOGLE";
}

async function googleLogin() {
  const result = await signInWithGoogle();
  if (result.error) return showToast(result.error);
  updateUserLabel();
  closeModal();
  showToast(`Selamat datang, ${result.user.name}.`);
}
function showLogin() {
  openModal({ kicker: "GPS MOTOR TELEMETRY", title: "Selamat datang", content: `<p class="login-copy">Catat performa motor Anda dengan pembacaan GPS langsung.</p><div class="login-actions"><button class="button button-google" id="googleLogin" type="button"><span class="google-g">G</span> Masuk dengan Google</button><button class="button button-secondary" id="guestLogin" type="button">Lanjutkan sebagai Tamu <span>→</span></button></div><p class="privacy-note">Data sesi disimpan di perangkat Anda.</p>` });
  document.getElementById("googleLogin").addEventListener("click", googleLogin);
  document.getElementById("guestLogin").addEventListener("click", () => {
    continueAsGuest();
    updateUserLabel();
    closeModal();
    showToast("Mode tamu aktif. Semua fitur siap digunakan.");
  });
}

function initialize() {
  const speedometer = initSpeedometer(showToast);
  const dragmeter = initDragMeter(showToast, speedometer.getState);
  initHistory(showToast);
  const settings = initSettings(openModal, showToast, () => {
    dragmeter.refreshChoices();
    renderHistory();
    speedometer.paint();
  });
  initRouter((route) => {
    if (route === "history") renderHistory();
    if (route === "settings") settings.render();
  });
  document.getElementById("accountAction").addEventListener("click", () => {
    if (getCurrentUser() && !getCurrentUser().guest) {
      signOut();
      updateUserLabel();
      showToast("Anda telah keluar.");
      showLogin();
    } else showLogin();
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
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker gagal didaftarkan:", error));
  }
  document.documentElement.dataset.unit = getData().unit;
}

initialize();
