// Isi nilai berikut dari Firebase Console untuk mengaktifkan Google Authentication.
export const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY",
  authDomain: "GANTI_DENGAN_AUTH_DOMAIN",
  projectId: "GANTI_DENGAN_PROJECT_ID",
  appId: "GANTI_DENGAN_APP_ID"
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => value && !value.startsWith("GANTI_DENGAN"));
}
