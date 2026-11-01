// Mengambil jadwal melalui backend Vercel agar API key tidak terekspos ke browser.
import { JKT48_THEATER_URL, CACHE_MINUTES } from "./jkt48-config.js";

const root = document.getElementById("showSchedule");
const body = root?.querySelector(".sched-body");

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.2 6.3 6.3.2-5 3.9 1.8 6.4L12 15l-5.3 3.8 1.8-6.4-5-3.9 6.3-.2z"/></svg>';

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

// Ubah string/objek apa pun menjadi teks aman (tidak pernah "[object Object]").
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

function getMemberName(member) {
  if (typeof member === "string") return member.trim();
  if (!member || typeof member !== "object") return "";
  return textOf(member.name) || textOf(member.member_name) || textOf(member.nickname) ||
    textOf(member.nama) || textOf(member.full_name) || textOf(member.member) ||
    textOf(member.jkt_key) || textOf(member.url_key) || "";
}

function getMembers(show) {
  const candidates = [
    show.members, show.member, show.lineup, show.line_up,
    show.cast, show.performers, show.participating_members,
    show._detail?.members, show._detail?.lineup
  ];
  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return value.map(getMemberName).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(/[,;|]/).map(name => name.trim()).filter(Boolean);
    }
  }
  return [];
}

function getSetlistTitle(show) {
  return textOf(show.setlist_title) || textOf(show.setlist) ||
    textOf(show._detail?.setlist) || textOf(show.title) || textOf(show.name) || "";
}

const DENA_RE = /danella|denanatalia|^dena$/;
function isDenaShow(show) {
  const raw = [show.members, show.member, show.lineup, show.line_up, show.cast,
    show.performers, show.participating_members, show._detail?.members, show._detail?.lineup]
    .find(v => Array.isArray(v) && v.length) || [];
  return raw.some(m => {
    const ids = typeof m === "string" ? [m]
      : [m?.name, m?.jkt_key, m?.url_key, m?.nickname, m?.member_name];
    return ids.some(id => DENA_RE.test(String(id ?? "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")));
  });
}

function parseShowDate(show) {
  const raw = firstValue(show, ["date", "show_date", "start_date", "start_at", "datetime", "date_start"]);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(show) {
  const date = parseShowDate(show);
  if (!date) return "Tanggal belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta"
  }).format(date);
}

function formatTime(show) {
  const raw = firstValue(show, ["time", "show_time", "start_time", "jam"]);
  if (raw) return `${String(raw).slice(0, 5).replace(".", ":")} WIB`;
  const date = parseShowDate(show);
  if (!date || !/T\d{2}:\d{2}/.test(String(rawDate(show)))) return "";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta"
  }).format(date) + " WIB";
}

function rawDate(show) {
  return firstValue(show, ["date", "show_date", "start_date", "start_at", "datetime", "date_start"]);
}

function safeImageUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch (_) { return ""; }
}

function getScheduleImage(show) {
  const designs = show.schedule_designs || show._detail?.schedule_designs;
  const theme = designs?.jkt48connect || designs?.photobook || designs?.avonera48;
  const image = theme?.banner || theme?.portrait;
  return image?.status === "ready" ? safeImageUrl(image.url) : "";
}

function getSessions(show) {
  const value = show.sessions ?? show.session ?? show._detail?.sessions ?? show._detail?.session;
  if (Array.isArray(value)) {
    return value.map(session => {
      if (typeof session === "string") return session;
      return textOf(firstValue(session, ["name", "title", "label", "time", "status"]));
    }).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value];
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, val]) =>
      typeof val === "string" ? `${key}: ${val}` : key
    );
  }
  return [];
}

function extractShowList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.dena_schedule)) return data.dena_schedule;
  // Endpoint /api/next_schedule dapat mengembalikan satu objek jadwal,
  // bukan array. Normalisasi objek tersebut menjadi satu item.
  for (const key of ["next_schedule", "nextSchedule", "theater", "shows", "data", "results", "schedule", "items"]) {
    const value = data[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = extractShowList(value);
      if (nested) return nested;
    }
  }
  // Fallback untuk respons yang langsung berupa satu objek jadwal.
  if (["date", "show_date", "start_date", "start_at", "datetime", "title", "name", "members", "member"].some(key => data[key] != null)) {
    return [data];
  }
  return null;
}

async function fetchShows() {
  const response = await fetch(JKT48_THEATER_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const errorData = JSON.parse(text);
      detail = errorData.detail || errorData.message || errorData.error || "";
    } catch (_) { detail = text.slice(0, 160); }
    throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("FORMAT: API JKT48Connect tidak mengembalikan JSON yang valid"); }

  if (data?.success === false || data?.error) {
    throw new Error(data.detail || data.error || "API JKT48Connect mengembalikan kesalahan");
  }
  const list = extractShowList(data);
  if (!list) throw new Error("FORMAT: respons /api/next_schedule tidak berisi data jadwal yang dikenali");
  // Jika respons API sudah difilter, gunakan apa adanya; jika tidak,
  // filter jadwal yang memuat Dena.
  const ready = Array.isArray(data?.dena_schedule);
  const shows = ready ? list : (list.length === 1 ? list : list.filter(isDenaShow));
  return {
    shows,
    totalUpcoming: Number(data.upcoming_shows ?? list.length),
    totalDena: Number(data.dena_shows ?? shows.length)
  };
}

function renderShows(shows, totalUpcoming, totalDena) {
  if (!shows.length) {
    body.innerHTML = `
      <div class="sched-empty">
        <span class="sched-empty-ico">${star}</span>
        <p><strong>Belum ada Dena</strong> di lineup show mendatang.</p>
        <small>${totalUpcoming} show mendatang telah diperiksa.</small>
      </div>`;
    return;
  }

  body.innerHTML = shows.map(show => {
    const title = getSetlistTitle(show) || "Show Theater JKT48";
    const subTitle = textOf(show.title);
    const showName = subTitle && subTitle !== title
      ? `<p class="sched-sub-title">${escapeHTML(subTitle)}</p>` : "";
    const team = textOf(show.team);
    const venue = textOf(firstValue(show, ["venue", "location", "place"])) ||
      (team ? `Tim ${team}` : "");
    const members = getMembers(show);
    const lineup = members.length
      ? `<div class="sched-detail"><strong>Member tampil</strong><p>${escapeHTML(members.join(", "))}</p></div>` : "";
    const sessions = getSessions(show);
    const sessionHTML = sessions.length
      ? `<div class="sched-detail"><strong>Sesi tersedia</strong><p>${sessions.map(escapeHTML).join(" · ")}</p></div>` : "";
    const image = getScheduleImage(show);
    const imageHTML = image
      ? `<img class="sched-poster" src="${escapeHTML(image)}" alt="Poster ${escapeHTML(title)}" loading="lazy">`
      : "";
    const ticket = safeImageUrl(show.ticket_url || show.booking_url || show.purchase_url || show.url);
    const ticketHTML = ticket
      ? `<p class="sched-ticket"><a href="${escapeHTML(ticket)}" target="_blank" rel="noopener noreferrer">Informasi tiket resmi</a></p>` : "";
    const time = formatTime(show);

    return `
      <article class="sched-item">
        <div class="sched-badge">${star}<span>Ada Dena!</span></div>
        ${imageHTML}
        <h4>${escapeHTML(title)}</h4>
        ${showName}
        <p class="sched-date">${escapeHTML(formatDate(show))}${time ? ` • ${escapeHTML(time)}` : ""}</p>
        ${venue ? `<p class="sched-venue">${escapeHTML(venue)}</p>` : ""}
        ${lineup}
        ${sessionHTML}
        ${ticketHTML}
      </article>`;
  }).join("") + `<small class="sched-foot">Menampilkan ${shows.length} show dengan Dena dari ${totalUpcoming} show mendatang.</small>`;
}

function renderError(error) {
  console.error("[Jadwal JKT48]", error);
  const message = String(error?.message || error);
  let explanation = message;

  if (message.includes("Failed to fetch") || message.includes("NETWORK")) {
    explanation = "API JKT48Connect tidak dapat dihubungi. Periksa koneksi internet atau kemungkinan pembatasan CORS dari server API.";
  } else if (message.includes("HTTP 1016") || message.includes("error code: 1016")) {
    explanation = "Alamat host upstream tidak ditemukan. Periksa konfigurasi API JKT48Connect di api/theater.js.";
  } else if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    explanation = "Key yang dikirim backend Vercel ditolak atau tidak memiliki akses. Periksa Environment Variable JKT48CONNECT_API_KEY di Vercel (bukan jkt48-config.js), pastikan key masih aktif dan sesuai akun/proyek.";
  } else if (message.includes("HTTP 429")) {
    explanation = "Kuota API JKT48Connect habis. Periksa dashboard kuota.";
  } else if (message.includes("HTTP 5")) {
    explanation = `Server API Vercel atau upstream sedang bermasalah (${message}).`;
  }

  body.innerHTML = `
    <p class="sched-msg">
      Jadwal belum bisa dimuat: ${escapeHTML(explanation)}.
      <br><small>Silakan muat ulang halaman beberapa saat lagi.</small>
      <br><small style="opacity:.6">Sumber: JKT48Connect melalui backend Denalize</small>
    </p>`;
}

async function init() {
  if (!root || !body) return;
  const cacheKey = "denalize_jkt48_theater_v14";

  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.savedAt < CACHE_MINUTES * 60_000) {
      renderShows(cached.shows, cached.totalUpcoming, cached.totalDena);
      return;
    }
  } catch (_) {}

  try {
    const result = await fetchShows();
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        savedAt: Date.now(),
        shows: result.shows,
        totalUpcoming: result.totalUpcoming,
        totalDena: result.totalDena
      }));
    } catch (_) {}
    renderShows(result.shows, result.totalUpcoming, result.totalDena);
  } catch (error) {
    renderError(error);
  }
}

init();
