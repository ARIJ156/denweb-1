// Endpoint cadangan Vercel untuk data Theater JKT48Connect.
// Set JKT48CONNECT_API_KEY sebagai Environment Variable di Vercel.
// Endpoint utama website tetap menggunakan Cloudflare Worker.
const API_BASE = "https://api.jkt48connect.app";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.JKT48CONNECT_API_KEY || process.env.JKT48_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Secret JKT48CONNECT_API_KEY belum dipasang di Vercel"
    });
  }

  try {
    const url = new URL("/api/theater", API_BASE);
    url.searchParams.set("page", "1");
    url.searchParams.set("perpage", "100");

    const upstream = await fetch(url.toString(), {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      }
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "JKT48Connect API error",
        upstreamStatus: upstream.status,
        detail: raw.slice(0, 300)
      });
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "Respons API bukan JSON" }); }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=10800, stale-while-revalidate=3600");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Gagal mengambil jadwal theater",
      detail: String(error?.message || error).slice(0, 250)
    });
  }
};
