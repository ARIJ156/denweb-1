PANDUAN FIX JADWAL THEATER DENALIZE
===================================

Isi perbaikan:
- Menggunakan host API yang sesuai dokumentasi: https://api.jkt48connect.app
- Menggunakan endpoint GET /api/theater?page=1&perpage=100.
- Mengirim API key melalui header X-API-Key.
- Mengambil detail GET /api/theater/:id untuk kandidat show yang membutuhkan detail.
- Lineup Danella dicocokkan lewat name, jkt_key, dan url_key (member bisa berupa objek); setlist berupa objek dibaca dari name/title.
- Memeriksa lineup Danella, lalu menampilkan setlist, member, sesi, dan poster jika tersedia.
- Cache Worker 6 jam untuk menghemat kuota API. Detail maksimal 3 show per refresh.
- Frontend membaca format respons baru `dena_schedule`.

LANGKAH 1 — PASANG SECRET DI CLOUDFLARE
1. Buka https://dash.cloudflare.com/
2. Pilih Workers & Pages.
3. Pilih Worker yang alamatnya:
   https://denweb22.arjunramadhan31.workers.dev
4. Buka Settings -> Variables and Secrets.
5. Tambahkan variable:
   Name: JKT48CONNECT_API_KEY
   Type: Secret
   Value: API key aktif dari dashboard JKT48Connect (jkc_...).
6. Jika sebelumnya sudah ada Secret bernama JKT48_API_KEY, Worker baru masih mendukung
   nama lama tersebut. Namun disarankan gunakan JKT48CONNECT_API_KEY.
7. Tambahkan variable ALLOWED_ORIGINS (Type: Text) dengan nilai:
   https://denanatalia.my.id,https://www.denanatalia.my.id
8. Save changes.

LANGKAH 2 — GANTI KODE WORKER
1. Masuk ke tab Edit Code.
2. Buka file cloudflare-worker/worker.js dari ZIP hasil perbaikan.
3. Salin seluruh isinya.
4. Hapus kode lama di editor Cloudflare, lalu tempel kode baru.
5. Klik Deploy.
6. Pastikan deployment selesai tanpa error.

LANGKAH 3 — GANTI FILE WEBSITE
Upload/deploy seluruh isi ZIP hasil perbaikan ke project Vercel yang SAMA dengan website
Denalize saat ini. Jangan membuat project baru karena domain sudah terhubung ke project lama.
File yang diperbarui:
- schedule.js
- jkt48-config.js
- jadwal.css
- api/theater.js (endpoint cadangan Vercel)
Catatan: Worker/ cache lama otomatis diganti (cache key v4), jadi tidak perlu menunggu 3 jam.

Jangan menghapus file gambar, video, HTML, CSS, atau JavaScript lain dari website.
Jika deployment dilakukan dengan Git, timpa file terkait di repository lalu commit dan push.

LANGKAH 4 — TES WORKER
Buka alamat berikut:
https://denweb22.arjunramadhan31.workers.dev/?debug=1

Jika berhasil, respons JSON memiliki struktur:
- success
- total_shows
- upcoming_shows
- dena_shows
- details_loaded
- dena_schedule

`dena_schedule` berisi show yang lineup-nya cocok dengan Danella.
Jika `dena_shows` bernilai 0, periksa apakah API menyediakan lineup untuk jadwal mendatang.
Jangan langsung menganggap tampilan website rusak.

LANGKAH 5 — TES WEBSITE
1. Buka https://denanatalia.my.id/
2. Tekan Ctrl + Shift + R.
3. Periksa bagian "Kapan Dena tampil?"
4. Jika masih gagal, buka URL debug di atas dan salin JSON error/hasilnya ke chat.
   Jangan pernah mengirim API key.

PENANGANAN ERROR
- HTTP 401: API key salah, tidak aktif, atau Secret salah nama/nilai.
- HTTP 403: origin tidak masuk ALLOWED_ORIGINS atau akses API ditolak.
- HTTP 404: endpoint atau ID detail tidak ditemukan; kirim JSON error untuk pemeriksaan.
- HTTP 429: kuota bulanan habis. Periksa dashboard JKT48Connect.
- HTTP 5xx: layanan API/Worker sedang bermasalah.
- `details_loaded: 0`: daftar mungkin sudah menyediakan lineup atau tidak ada ID detail yang valid.
- `dena_shows: 0`: belum ditemukan lineup Danella pada jadwal mendatang yang berhasil diperiksa.

CATATAN KUOTA
Worker menggunakan cache 6 jam. Saat cache kedaluwarsa, ia meminta daftar theater satu kali
dan maksimal tiga detail show yang relevan. Endpoint next_schedule hanya diminta jika daftar
theater kosong. Ini mengurangi pemakaian kuota, tetapi data tidak diperbarui setiap menit.
Jika akun memiliki kuota Fanbase/lebih besar dan ingin pembaruan lebih sering, interval cache
dapat disesuaikan setelah pengujian.

KEAMANAN
- Jangan menaruh API key di jkt48-config.js, schedule.js, index.html, atau repository publik.
- Jangan kirim API key melalui chat atau screenshot.
- Jika key pernah terpublikasi, cabut key tersebut dan buat key baru.
