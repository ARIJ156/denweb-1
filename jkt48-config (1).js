// KONFIGURASI JADWAL THEATER JKT48 - DENALIZE
// URL ini adalah alamat Worker Cloudflare khusus API jadwal (BUKAN Worker denweb22 yang
// menayangkan website, dan bukan alamat API JKT48Connect).
// API key hanya disimpan sebagai Secret di Cloudflare Worker.
export const JKT48_THEATER_URL =
  "https://denalize-jadwal.arjunramadhan31.workers.dev";

// Cache sisi browser (menit). Worker sendiri meng-cache data selama 6 jam.
export const CACHE_MINUTES = 60;
