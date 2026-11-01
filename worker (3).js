// Cloudflare Worker — Denalize: jadwal Theater + detail show JKT48Connect.
// Secret utama: JKT48CONNECT_API_KEY. Kompatibilitas nama lama: JKT48_API_KEY.
// Simpan sebagai Secret di Cloudflare Workers. Jangan pernah letakkan key di frontend.

const API_BASE = "https://api.jkt48connect.app";
const CACHE_SECONDS = 21600; // 6 jam; paket Free hanya 1.000 request/bulan.
const MAX_DETAIL_REQUESTS = 3;
const ALIASES = new Set(["dena", "danella", "denanataliaang"]);

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

function arraysDeep(value, keys, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return [];
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = arraysDeep(child, keys, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function listFrom(data) {
  return arraysDeep(data, ["theater", "shows", "data", "results", "schedule", "items"]);
}

function unwrapDetail(data) {
  if (!data || typeof data !== "object") return {};
  if (Array.isArray(data)) return data[0] || {};
  for (const key of ["show", "shows", "theater", "detail", "data", "result"]) {
    const value = data[key];
    if (value && !Array.isArray(value) && typeof value === "object") return value;
    if (Array.isArray(value) && value[0]) return value[0];
  }
  return data;
}

function showId(show) {
  const value = show?.id ?? show?.theater_id ?? show?.show_id ??
    show?._id ?? show?.data_id ?? show?.slug;
  return value == null ? "" : String(value);
}

function rawDate(show) {
  return show?.date ?? show?.show_date ?? show?.start_date ??
    show?.start_at ?? show?.datetime ?? show?.date_start ?? "";
}

function parseDate(show) {
  const raw = rawDate(show);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUpcoming(show) {
  if (show?.is_upcoming === false) return false;
  const date = parseDate(show);
  if (!date) return show?.is_upcoming === true;
  return date.getTime() >= Date.now() - 6 * 60 * 60 * 1000;
}

// Ubah nilai apa pun (string / objek) menjadi teks aman. Tidak pernah "[object Object]".
function textOf(value, depth = 0) {
  if (value == null || depth > 3) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(v => textOf(v, depth + 1)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    for (const key of ["name", "title", "setlist_name", "setlist_title", "label", "text", "nama"]) {
      const t = textOf(value[key], depth + 1);
      if (t) return t;
    }
  }
  return "";
}

// Semua penanda identitas satu member: name, jkt_key, url_key, dll.
function memberIds(member) {
  if (typeof member === "string") return [member];
  if (!member || typeof member !== "object") return [];
  return ["name", "jkt_key", "url_key", "member_name", "nickname", "nama",
    "full_name", "slug", "key", "member"]
    .map(k => textOf(member[k])).filter(Boolean);
}

function memberName(member) {
  if (typeof member === "string") return member.trim();
  if (!member || typeof member !== "object") return "";
  return textOf(member.name) || textOf(member.member_name) || textOf(member.nickname) ||
    textOf(member.nama) || textOf(member.full_name) || textOf(member.member) ||
    textOf(member.jkt_key) || textOf(member.url_key) || "";
}

const MEMBER_FIELDS = [
  "members", "member", "lineup", "line_up", "cast", "performers",
  "participating_members", "member_list", "memberList", "show_members", "出演メンバー"
];

function toMemberList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Daftar member mentah (string atau objek). Juga mencari di dalam detail (_detail) dan
// satu tingkat objek bersarang jika field tidak berada di level atas.
function getRawMembers(show, depth = 0) {
  if (!show || typeof show !== "object" || depth > 2) return [];
  for (const field of MEMBER_FIELDS) {
    const list = toMemberList(show[field]);
    if (list.length) return list;
  }
  for (const key of ["_detail", "detail", "data", "show", "theater"]) {
    const child = show[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const list = getRawMembers(child, depth + 1);
      if (list.length) return list;
    }
  }
  return [];
}

function getMembers(show) {
  return getRawMembers(show).map(memberName).filter(Boolean);
}

function isDenaId(value) {
  const n = normalize(value);
  return !!n && (ALIASES.has(n) || n.includes("danella") || n.includes("denanatalia"));
}

function hasDena(show) {
  return getRawMembers(show).some(m => memberIds(m).some(isDenaId));
}

// Judul setlist: bisa string atau objek { name | title | ... }.
function getSetlistTitle(show) {
  const detail = show?._detail || {};
  return textOf(show?.setlist) || textOf(detail.setlist) ||
    textOf(show?.setlist_name) || textOf(detail.setlist_name) ||
    textOf(show?.title) || textOf(detail.title) || textOf(show?.name) || "";
}

function fetchJson(path, key) {
  return fetch(new URL(path, API_BASE), {
    method: "GET",
    headers: { "X-API-Key": key, "Accept": "application/json" }
  }).then(async response => {
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`JKT48Connect HTTP ${response.status}`);
      error.status = response.status;
      let detail = text.slice(0, 350);
      try {
        const j = JSON.parse(text);
        detail = String(j.message || j.detail || j.error || detail).slice(0, 350);
        if (response.status === 429 && j.resets_at) detail += ` (reset: ${j.resets_at})`;
      } catch {}
      error.detail = detail;
      throw error;
    }
    try { return JSON.parse(text); }
    catch { throw new Error(`Respons bukan JSON untuk ${path}: ${text.slice(0, 150)}`); }
  });
}

function mergeDetail(base, detail) {
  const unwrapped = unwrapDetail(detail);
  // Detail ditempatkan di depan agar field detail mengungguli ringkasan daftar.
  return { ...base, ...unwrapped, _detail: unwrapped };
}

async function fetchDetails(shows, key) {
  const targets = shows
    .filter(show => showId(show))
    // Detail dibutuhkan untuk show yang sudah cocok dengan Dena atau belum punya lineup.
    // Jika lineup tersedia dan tidak memuat Dena, detail tidak perlu diminta.
    .filter(show => getRawMembers(show).length === 0 || hasDena(show))
    .slice(0, MAX_DETAIL_REQUESTS);
  const result = new Map();
  // Batasi paralelisme agar tidak membebani API dan kuota.
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(async show => [showId(show), await fetchJson(
        `/api/theater/${encodeURIComponent(showId(show))}`, key
      )])
    );
    for (const item of settled) {
      if (item.status === "fulfilled") result.set(item.value[0], item.value[1]);
    }
  }
  return result;
}

function safeError(error) {
  return {
    error: "Gagal mengambil jadwal Theater JKT48Connect",
    detail: String(error?.detail || error?.message || error).slice(0, 350),
    upstreamStatus: error?.status || null
  };
}

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS ||
      "https://denanatalia.my.id,https://www.denanatalia.my.id")
      .split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
    const originOK = !origin || allowed.includes("*") || allowed.includes(origin.replace(/\/$/, ""));
    const corsOrigin = origin ? (originOK ? origin : "null") :
      (allowed.includes("*") ? "*" : "https://denanatalia.my.id");

    const cors = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra }
    });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: originOK ? 204 : 403, headers: cors });
    }
    if (request.method !== "GET") return json(405, { error: "Method not allowed" });
    if (!originOK) return json(403, { error: "Origin tidak diizinkan" });

    const key = env.JKT48CONNECT_API_KEY || env.JKT48_API_KEY;
    if (!key) return json(500, {
      error: "Secret API key belum dipasang",
      detail: "Tambahkan Secret JKT48CONNECT_API_KEY di Cloudflare Worker."
    });

    const debug = requestUrl.searchParams.get("debug") === "1";
    const cacheKey = new Request(`${requestUrl.origin}/__denalize_theater_cache_v4`);
    const cache = caches.default;
    if (!debug) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const response = new Response(hit.body, hit);
        Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
        response.headers.set("X-Worker-Cache", "HIT");
        return response;
      }
    }

    try {
      // Ambil daftar Theater. next_schedule hanya dipakai sebagai fallback
      // bila daftar theater kosong, agar request tidak menghabiskan kuota berlebihan.
      let list = listFrom(await fetchJson("/api/theater?page=1&perpage=100", key));
      if (!list.length) {
        const nextData = await fetchJson("/api/next_schedule", key);
        list = listFrom(nextData);
      }
      const byId = new Map();
      for (const show of list) {
        if (!show || typeof show !== "object") continue;
        const id = showId(show);
        const keyOf = id || `${rawDate(show)}|${getSetlistTitle(show)}`;
        byId.set(keyOf, { ...(byId.get(keyOf) || {}), ...show });
      }

      const allShows = [...byId.values()];
      const upcoming = allShows.filter(isUpcoming).sort((a, b) =>
        (parseDate(a)?.getTime() ?? Infinity) - (parseDate(b)?.getTime() ?? Infinity)
      );

      // Ambil detail hanya untuk kandidat Dena atau show yang belum memiliki lineup.
      // Maksimum 3 detail per pembaruan cache; cache 3 jam membantu menjaga kuota Free.
      const details = await fetchDetails(upcoming, key);
      const enriched = upcoming.map(show => {
        const detail = details.get(showId(show));
        return detail ? mergeDetail(show, detail) : show;
      });

      const denaSchedule = enriched.filter(hasDena).map(show => {
        const members = getMembers(show);
        const detail = show._detail || {};
        const setlistTitle = getSetlistTitle(show);
        return {
          ...show,
          members,
          dena_in_lineup: true,
          setlist: setlistTitle,
          setlist_title: setlistTitle,
          title: textOf(show.title) || setlistTitle,
          venue: textOf(show.venue ?? detail.venue ?? show.location ?? show.place),
          sessions: show.sessions ?? show.session ?? detail.sessions ?? detail.session ?? null,
          schedule_designs: show.schedule_designs ?? detail.schedule_designs ?? null
        };
      });

      const payload = {
        success: true,
        source: "JKT48Connect API",
        total_shows: allShows.length,
        upcoming_shows: enriched.length,
        dena_shows: denaSchedule.length,
        details_loaded: details.size,
        details_limit: MAX_DETAIL_REQUESTS,
        dena_schedule: denaSchedule
      };

      const response = json(200, payload, {
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
        "X-Worker-Cache": "MISS"
      });
      if (!debug) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return json(error?.status || 502, safeError(error), { "Cache-Control": "no-store" });
    }
  }
};
