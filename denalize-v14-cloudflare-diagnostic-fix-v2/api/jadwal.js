// Vercel Serverless Function: /api/jadwal
// API key and Firebase Admin credentials must be configured as Vercel env vars.
import admin from "firebase-admin";

function getFirestore() {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) return null;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      })
    });
  }
  return admin.firestore();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = (process.env.JKT48CONNECT_API_KEY || "").trim();
  if (!apiKey) return res.status(500).json({ error: "API key tidak ditemukan. Tambahkan JKT48CONNECT_API_KEY di Vercel lalu Redeploy." });

  const db = getFirestore();
  const cacheRef = db?.collection("theater").doc("jadwal");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch("https://api.jkt48connect.app/api/next_schedule", {
      method: "GET", signal: controller.signal,
      headers: { "X-API-Key": apiKey,
        "User-Agent": "JKT48Connect-Client/1.0 (Denalize Vercel)",
        "Accept": "application/json" }
    });
    for (const header of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-quota-period", "retry-after"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    const raw = await upstream.text();
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!upstream.ok) {
      // Cloudflare challenge pages are HTML, not API JSON. Try the last
      // known-good Firestore payload before returning a safe diagnostic.
      if (cacheRef) {
        try {
          const cached = await cacheRef.get();
          if (cached.exists && cached.data()?.payload) {
            res.setHeader("X-Schedule-Source", "firestore-cache");
            res.setHeader("X-Upstream-Status", String(upstream.status));
            return res.status(200).json(cached.data().payload);
          }
        } catch (e) { console.error("Firestore cache read failed:", e?.message); }
      }

      const isCloudflareChallenge =
        upstream.status === 403 &&
        (/text\/html/i.test(upstream.headers.get("content-type") || "") ||
         /Just a moment|challenge-platform|cf-chl-/i.test(raw));

      if (isCloudflareChallenge) {
        res.setHeader("X-Upstream-Status", "403");
        return res.status(502).json({
          error: "JKT48Connect ditahan oleh pemeriksaan Cloudflare (403).",
          code: "UPSTREAM_CLOUDFLARE_CHALLENGE",
          message: "Vercel menerima halaman verifikasi HTML, bukan JSON API. User-Agent tidak dapat menjamin lolos pemeriksaan. Periksa API key/izin endpoint dan log provider."
        });
      }

      let details = {};
      try { details = JSON.parse(raw); } catch { details = { message: raw.slice(0, 300) }; }
      return res.status(upstream.status).json({
        error: `JKT48Connect API error: ${upstream.status}`,
        details
      });
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "Respons JKT48Connect bukan JSON valid." }); }

    if (cacheRef) {
      try {
        await cacheRef.set({ payload: data, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
        res.setHeader("X-Schedule-Source", "jkt48connect+firestore");
      } catch (e) {
        console.error("Firestore cache write failed:", e?.message);
        res.setHeader("X-Schedule-Source", "jkt48connect");
      }
    } else res.setHeader("X-Schedule-Source", "jkt48connect");
    return res.status(200).json(data);
  } catch (err) {
    console.error("JKT48Connect /api/jadwal:", err?.name || "Error");
    if (cacheRef) {
      try {
        const cached = await cacheRef.get();
        if (cached.exists && cached.data()?.payload) {
          res.setHeader("X-Schedule-Source", "firestore-cache");
          return res.status(200).json(cached.data().payload);
        }
      } catch (e) { console.error("Firestore fallback failed:", e?.message); }
    }
    return res.status(502).json({ error: err?.name === "AbortError" ? "Waktu tunggu API JKT48Connect habis." : "Gagal menghubungi API JKT48Connect." });
  } finally { clearTimeout(timeout); }
}
