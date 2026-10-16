import { getData, setUser } from "./storage.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export function getCurrentUser() {
  return getData().user;
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured()) {
    return { error: "Google Login belum disiapkan. Isi konfigurasi Firebase terlebih dahulu." };
  }

  try {
    const [{ initializeApp, getApps }, authSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")
    ]);
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    const credential = await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
    const user = { uid: credential.user.uid, name: credential.user.displayName || "Pengendara", email: credential.user.email || "", photo: credential.user.photoURL || "", guest: false };
    setUser(user);
    return { user };
  } catch (error) {
    const messages = {
      "auth/popup-closed-by-user": "Jendela login ditutup sebelum selesai.",
      "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase Authentication.",
      "auth/popup-blocked": "Popup login diblokir browser. Izinkan popup lalu coba lagi."
    };
    return { error: messages[error.code] || `Login gagal: ${error.message}` };
  }
}

export function continueAsGuest() {
  const user = { uid: "guest", name: "TAMU", email: "", photo: "", guest: true };
  setUser(user);
  return user;
}

export function signOut() {
  setUser(null);
}
