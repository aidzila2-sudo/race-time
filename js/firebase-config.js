// Konfigurasi Firebase untuk RaceBox
export const firebaseConfig = {
  apiKey: "AIzaSyBUxZiKafBNfZ9WN26dC4ag9sRe3g5wVY8",
  authDomain: "racebox-7ecd1.firebaseapp.com",
  projectId: "racebox-7ecd1",
  storageBucket: "racebox-7ecd1.firebasestorage.app",
  messagingSenderId: "446833646426",
  appId: "1:446833646426:web:146aa89e2dc3c86550b163",
  measurementId: "G-9YM5K4VKLC"
};

// Bernilai true selama config belum berisi placeholder "GANTI_DENGAN"
export function isFirebaseConfigured() {
  return !Object.values(firebaseConfig).some(v => String(v).includes("GANTI_DENGAN"));
}