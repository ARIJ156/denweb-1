DENALIZE V14 — PANDUAN FULLSTACK JADWAL JKT48CONNECT

File ini menggunakan frontend Denalize yang sudah ada dan menambahkan endpoint backend khusus jadwal.
Frontend memanggil /api/jadwal. Backend Vercel yang menghubungi JKT48Connect.
API key hanya disimpan di Vercel Environment Variables, tidak pernah ditaruh di frontend.

1. SIMPAN API KEY DI VERCEL ENVIRONMENT VARIABLES
- Buka https://vercel.com/dashboard
- Pilih project Denalize.
- Buka Settings > Environment Variables.
- Tambahkan:
    Name  : JKT48CONNECT_API_KEY
    Value : salin API key dari https://api.jkt48connect.app/dashboard/keys
- Pilih environment yang digunakan (Production; tambahkan Preview/Development bila diperlukan).
- Klik Save.
- Jangan menaruh key di jkt48-config.js, schedule-v14.js, script.js, HTML, atau repository publik.
- Jangan mengirim API key ke siapa pun.

2. SERVERLESS FUNCTION YANG DIGUNAKAN ZIP INI
Untuk proyek Vercel dengan struktur function biasa (bukan Next.js App Router), file yang dipakai:
    /api/jadwal.js

File ini sudah disertakan di ZIP. Ia membaca process.env.JKT48CONNECT_API_KEY di server,
lalu memanggil:
    https://api.jkt48connect.app/api/next_schedule
dengan header:
    X-API-Key: [key dari Environment Variables]

Jika proyekmu benar-benar memakai Next.js App Router, padanan lokasinya adalah:
    /app/api/jadwal/route.js
Namun jangan membuat dua implementasi sekaligus. ZIP ini memakai format Vercel Serverless Function / Pages-style di /api/jadwal.js.

3. FRONTEND
File jkt48-config.js sudah diarahkan ke:
    /api/jadwal
schedule-v14.js menggunakan endpoint tersebut. Browser tidak mengetahui dan tidak mengirim API key.

4. DEPLOY DAN REDEPLOY
- Ekstrak ZIP ini, lalu unggah/commit seluruh isi proyek ke repository GitHub yang terhubung ke Vercel.
- Pastikan folder api ikut terunggah dan file api/jadwal.js ada di repository.
- Setelah menyimpan Environment Variable, buka Vercel > Deployments.
- Pilih deployment terbaru lalu lakukan Redeploy (atau push commit baru).
- Tunggu deployment berstatus Ready.

5. TEST MANUAL
Buka endpoint ini di browser:
    https://ALAMAT-PROJECT-VERCEL/api/jadwal
Ganti ALAMAT-PROJECT-VERCEL dengan domain project milikmu.
Jika berhasil, endpoint akan menampilkan JSON jadwal dari JKT48Connect.
Jika gagal, perhatikan status dan pesan error:
- 500 "API key tidak ditemukan": Environment Variable belum ada/salah nama atau belum Redeploy.
- 401: key ditolak/tidak valid; salin ulang key dari dashboard JKT48Connect.
- 403: key tidak memiliki izin/akses untuk endpoint tersebut.
- 429: kuota/rate limit; periksa dashboard JKT48Connect.
- 502: backend tidak berhasil menghubungi API atau upstream mengirim respons tidak valid.

6. DEBUGGING
- Vercel: Project > Deployments > pilih deployment > Functions/Logs.
- JKT48Connect: https://api.jkt48connect.app/dashboard/logs
  Periksa apakah request dari Vercel tercatat.
- Jangan pernah menyalin API key ke log publik atau mengirimkannya dalam chat.

7. CATATAN PENTING
- Nama Environment Variable harus persis: JKT48CONNECT_API_KEY.
- Setelah mengubah Environment Variables, lakukan Redeploy.
- Jangan mengetes endpoint upstream langsung dari browser dengan API key. Tes endpoint Vercel /api/jadwal.
- File api/next_schedule.js tetap disertakan sebagai alias kompatibilitas untuk konfigurasi lama.
- File package.json menetapkan type=module agar export default pada function berjalan sebagai ES Module.

8. FIRESTORE SEBAGAI DATABASE/CACHE JADWAL (SUDAH DIINTEGRASIKAN)
Function api/jadwal.js akan menyimpan respons JKT48Connect terbaru ke Firestore:
    Collection: theater
    Document : jadwal
    Fields   : payload (respons JSON utuh), lastUpdated (server timestamp)
Jika upstream gagal/kuota API sedang bermasalah, function mencoba menampilkan payload terakhir yang tersimpan.
Integrasi ini opsional; tanpa tiga env Firebase di bawah ini, endpoint tetap mengambil data langsung dari JKT48Connect.

9. ENV FIREBASE ADMIN DI VERCEL
Di Firebase Console > Project settings > Service accounts, buat/generate private key service account.
Masukkan variabel berikut ke Vercel > Settings > Environment Variables:
    FIREBASE_PROJECT_ID     = project ID Firebase
    FIREBASE_CLIENT_EMAIL   = client_email dari service account JSON
    FIREBASE_PRIVATE_KEY    = private_key dari service account JSON
Untuk FIREBASE_PRIVATE_KEY, tempel keseluruhan nilai private_key. Simpan newline sebagai \n jika dashboard meminta satu baris.
Jangan gunakan Firebase Web API key sebagai private key Admin, dan jangan letakkan credential Admin di file frontend.
Pastikan Firestore Database sudah dibuat di Firebase Console. Service account Admin mengakses Firestore melalui IAM; jangan membuka rules Firestore ke publik.
Setelah menambahkan/mengubah env, lakukan Redeploy.
