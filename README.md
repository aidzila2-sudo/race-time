# RaceBox

Aplikasi web telemetri kecepatan motor berbasis GPS. Dibuat dengan HTML, CSS, dan JavaScript ES modules tanpa framework atau build tool.

## Menjalankan lokal

Geolocation dan service worker memerlukan secure context. Jalankan melalui `http://localhost` (bukan dengan membuka file HTML langsung):

```bash
cd racebox-app
python -m http.server 8000
```

Buka `http://localhost:8000`. Berikan izin lokasi dan uji di area terbuka. Untuk GitHub Pages, unggah isi folder `racebox-app` ke repository; semua URL aset memakai path relatif sehingga aplikasi dapat dijalankan dari subfolder.

## Setup Google Login Firebase

1. Buat project di Firebase Console, tambahkan aplikasi Web, lalu aktifkan **Authentication > Sign-in method > Google**.
2. Tambahkan domain aplikasi di **Authentication > Settings > Authorized domains** (contoh `localhost` dan `username.github.io`).
3. Salin nilai `apiKey`, `authDomain`, `projectId`, dan `appId` dari konfigurasi aplikasi Firebase.
4. Ganti nilai `GANTI_DENGAN_...` pada `js/firebase-config.js`.

SDK Firebase v10.12.0 dimuat dari CDN ketika pengguna memilih Google login. Tanpa konfigurasi, tombol Google memberi pesan penyiapan dan mode tamu tetap dapat digunakan. Data profil motor, template, riwayat, preferensi, serta sesi pengguna disimpan di localStorage perangkat.

Drag Meter mengutamakan kecepatan Doppler dari GPS, memfilter fix yang tidak akurat, dan dapat memakai sensor gerak untuk deteksi start serta estimasi eksperimental antar-fix (dapat dimatikan di Setelan). Percobaan yang selesai menyimpan ringkasan GPS dan sampel sensor di localStorage; log CSV dapat diunduh dari Riwayat.

## Install sebagai PWA

Deploy melalui HTTPS (GitHub Pages sudah menyediakan HTTPS), buka situs di browser ponsel, lalu gunakan **Tambahkan ke layar utama / Install app** dari menu browser. Pada iOS, gunakan **Bagikan > Tambahkan ke Layar Utama**. Geolocation memerlukan izin browser dan koneksi HTTPS atau localhost.
