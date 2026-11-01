DEPLOY CEPAT (3 LANGKAH)
1. Cloudflare > Worker denweb22 > Edit code: hapus semua, tempel isi cloudflare-worker/worker.js, klik Deploy.
   Settings > Variables and secrets > tab PRODUCTION: pastikan ada
     Secret JKT48CONNECT_API_KEY  = key jkc_...
     Text   ALLOWED_ORIGINS       = https://denanatalia.my.id,https://www.denanatalia.my.id
2. Upload ke hosting website (timpa): index.html dan schedule-v12.js  (file lain tidak berubah).
   schedule-v12.js adalah nama BARU, jadi tidak terkena cache file schedule.js lama.
3. Buka denanatalia.my.id, tekan Ctrl+Shift+R. Di kartu jadwal, baris kecil "skrip v12" pada pesan error
   menandakan skrip baru yang berjalan, dan menampilkan host Worker yang dipanggil.
Alamat Worker diatur di bagian atas schedule-v12.js (JKT48_THEATER_URL).
