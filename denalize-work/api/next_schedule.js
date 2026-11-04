// Vercel Serverless Function (Pages-style): /api/jadwal
// Set JKT48CONNECT_API_KEY in Vercel > Project > Settings > Environment Variables.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = (process.env.JKT48CONNECT_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "API key tidak ditemukan. Tambahkan JKT48CONNECT_API_KEY di Vercel Environment Variables, lalu Redeploy."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch("https://api.jkt48connect.app/api/next_schedule", {
      method: "GET",
      signal: controller.signal,
      headers: {
        "X-API-Key": apiKey,
        "User-Agent": "JKT48Connect-Client/1.0 (Denalize Vercel)",
        "Accept": "application/json"
      }
    });

    for (const header of [
      "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset",
      "x-quota-period", "retry-after"
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    const rawBody = await upstream.text();
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!upstream.ok) {
      const isCloudflareChallenge =
        upstream.status === 403 &&
        (/text\\/html/i.test(upstream.headers.get("content-type") || "") ||
         /Just a moment|challenge-platform|cf-chl-/i.test(rawBody));
      if (isCloudflareChallenge) {
        return res.status(502).json({
          error: "JKT48Connect ditahan oleh pemeriksaan Cloudflare (403).",
          code: "UPSTREAM_CLOUDFLARE_CHALLENGE",
          message: "Respons upstream berupa halaman verifikasi HTML, bukan JSON API."
        });
      }
      let details = {};
      try { details = JSON.parse(rawBody); } catch { details = { message: rawBody.slice(0, 300) }; }
      return res.status(upstream.status).json({ error: `API error: ${upstream.status}`, details });
    }

    // Preserve the upstream JSON structure for the existing schedule renderer.
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return res.status(502).json({
        error: "Respons JKT48Connect bukan JSON yang valid."
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("JKT48Connect /api/jadwal:", err?.name || "Error");
    return res.status(502).json({
      error: err?.name === "AbortError"
        ? "Waktu tunggu ke API JKT48Connect habis."
        : "Gagal menghubungi API JKT48Connect."
    });
  } finally {
    clearTimeout(timeout);
  }
}
