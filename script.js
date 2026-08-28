document.addEventListener("DOMContentLoaded", () => {
  // ===== API config =====
  const API_BASE =
    window.location.protocol === "file:"
      ? "http://localhost:3000"
      : "";

  const ADMIN_PASSWORD = "densdens";

  const adminHeaders = () => ({
    "X-Admin-Key": ADMIN_PASSWORD,
  });

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, options);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.error) || "Permintaan gagal.");
    }
    return data;
  }

  // ===== Mobile menu =====
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      menuToggle.classList.toggle("open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuToggle.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ===== Gallery + filter =====
  const filterBtns = document.querySelectorAll(".filter-btn");
  const karyaGrid = document.getElementById("karyaGrid");
  const addFotoBtn = document.getElementById("addFotoBtn");
  const fotoPopup = document.getElementById("fotoPopup");
  const fotoForm = document.getElementById("fotoForm");
  const fotoCancelBtn = document.getElementById("fotoCancelBtn");
  const fotoFile = document.getElementById("fotoFile");
  const fotoFileLabel = document.getElementById("fotoFileLabel");
  const fotoPreviewWrap = document.getElementById("fotoPreviewWrap");
  const fotoPreview = document.getElementById("fotoPreview");
  const fotoError = document.getElementById("fotoError");

  const CATEGORY_LABEL = {
    potret: "Album",
    identitas: "Danella & GEN 11",
    project: "Project",
  };

  let isAdmin = sessionStorage.getItem("danellaAdmin") === "1";
  let galleryCache = [];
  let messagesCache = [];

  function applyKaryaFilter() {
    const active = document.querySelector(".filter-btn.active");
    const filter = active ? active.dataset.filter : "all";
    document.querySelectorAll(".karya-card").forEach((card) => {
      if (filter === "all" || card.dataset.category === filter) {
        card.classList.remove("hidden");
      } else {
        card.classList.add("hidden");
      }
    });
  }

  function imageUrl(src) {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("data:")) return src;
    return API_BASE + src;
  }

  function renderGalleryExtras() {
    if (!karyaGrid) return;
    karyaGrid.querySelectorAll('.karya-card[data-dynamic="1"]').forEach((el) => el.remove());

    galleryCache.forEach((item) => {
      const article = document.createElement("article");
      article.className = "karya-card";
      article.dataset.category = item.category;
      article.dataset.dynamic = "1";
      article.dataset.id = item.id;

      const thumbStyle = item.image
        ? `background-image: url('${imageUrl(item.image)}');`
        : "background: linear-gradient(145deg, #5eb7a8, #3a8f82);";
      const tag = CATEGORY_LABEL[item.category] || item.category;

      article.innerHTML = `
        <button type="button" class="karya-delete" data-id="${item.id}" title="Hapus foto" aria-label="Hapus foto">×</button>
        <div class="karya-thumb has-image" style="${thumbStyle}">
          <span class="karya-tag">${tag}</span>
          <span class="karya-title-overlay">FOTO</span>
        </div>
        <div class="karya-info">
          <h3></h3>
          <p></p>
        </div>
      `;
      article.querySelector("h3").textContent = item.title || "Tanpa judul";
      article.querySelector("p").textContent = item.desc || "";
      karyaGrid.appendChild(article);
    });

    karyaGrid.querySelectorAll(".karya-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!isAdmin) return;
        if (!confirm("Hapus foto ini dari kebersamaan?")) return;
        try {
          await api("/api/gallery/" + btn.dataset.id, {
            method: "DELETE",
            headers: adminHeaders(),
          });
          await loadGallery();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    applyKaryaFilter();
  }

  async function loadGallery() {
    try {
      galleryCache = await api("/api/gallery");
    } catch (err) {
      console.warn("Gagal memuat galeri:", err.message);
      galleryCache = [];
    }
    renderGalleryExtras();
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyKaryaFilter();
    });
  });

  function showFotoPopup() {
    if (!fotoPopup) return;
    if (fotoError) {
      fotoError.hidden = true;
      fotoError.textContent = "";
    }
    if (fotoForm) fotoForm.reset();
    if (fotoFileLabel) fotoFileLabel.textContent = "Pilih gambar (max 2 MB)";
    if (fotoPreviewWrap) fotoPreviewWrap.hidden = true;
    if (fotoPreview) fotoPreview.src = "";
    fotoPopup.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hideFotoPopup() {
    if (!fotoPopup) return;
    fotoPopup.hidden = true;
    document.body.style.overflow = "";
  }

  if (addFotoBtn) {
    addFotoBtn.addEventListener("click", () => {
      if (!isAdmin) return;
      showFotoPopup();
    });
  }
  if (fotoCancelBtn) fotoCancelBtn.addEventListener("click", hideFotoPopup);
  if (fotoPopup) {
    fotoPopup.addEventListener("click", (e) => {
      if (e.target === fotoPopup) hideFotoPopup();
    });
  }
  if (fotoFile) {
    fotoFile.addEventListener("change", () => {
      const file = fotoFile.files && fotoFile.files[0];
      if (!file) return;
      if (fotoFileLabel) fotoFileLabel.textContent = file.name;
      const reader = new FileReader();
      reader.onload = () => {
        if (fotoPreview) fotoPreview.src = reader.result;
        if (fotoPreviewWrap) fotoPreviewWrap.hidden = false;
      };
      reader.readAsDataURL(file);
    });
  }

  if (fotoForm) {
    fotoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin) return;
      if (fotoError) {
        fotoError.hidden = true;
        fotoError.textContent = "";
      }

      const title = document.getElementById("fotoTitle").value.trim();
      const desc = document.getElementById("fotoDesc").value.trim();
      const category = document.getElementById("fotoCategory").value;
      const file = fotoFile && fotoFile.files && fotoFile.files[0];

      if (!title || !desc || !category || !file) {
        if (fotoError) {
          fotoError.textContent = "Lengkapi semua field dan pilih gambar.";
          fotoError.hidden = false;
        }
        return;
      }

      const fd = new FormData();
      fd.append("title", title);
      fd.append("desc", desc);
      fd.append("category", category);
      fd.append("image", file);

      try {
        await api("/api/gallery", {
          method: "POST",
          headers: adminHeaders(),
          body: fd,
        });
        hideFotoPopup();
        await loadGallery();
      } catch (err) {
        if (fotoError) {
          fotoError.textContent = err.message || "Gagal menyimpan foto.";
          fotoError.hidden = false;
        }
      }
    });
  }

  // ===== Messages + slider + admin =====
  const form = document.getElementById("messageForm");
  const messagesList = document.getElementById("messagesList");
  const messagesEmpty = document.getElementById("messagesEmpty");
  const messagesDots = document.getElementById("messagesDots");
  const msgPrev = document.getElementById("msgPrev");
  const msgNext = document.getElementById("msgNext");
  const successPopup = document.getElementById("successPopup");
  const popupOkBtn = document.getElementById("popupOkBtn");
  const adminToggle = document.getElementById("adminToggle");
  const adminBar = document.getElementById("adminBar");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  const adminLogout = document.getElementById("adminLogout");

  const PER_SLIDE = 5;
  const AUTO_MS = 5000;
  let currentSlide = 0;
  let totalSlides = 0;
  let autoTimer = null;

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function goToSlide(index) {
    if (totalSlides === 0) return;
    currentSlide = ((index % totalSlides) + totalSlides) % totalSlides;

    messagesList.querySelectorAll(".messages-slide").forEach((slide, i) => {
      slide.classList.toggle("active", i === currentSlide);
    });

    if (messagesDots) {
      messagesDots.querySelectorAll(".messages-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === currentSlide);
      });
    }

    if (msgPrev) msgPrev.disabled = totalSlides <= 1;
    if (msgNext) msgNext.disabled = totalSlides <= 1;
  }

  function startAuto() {
    stopAuto();
    if (totalSlides <= 1) return;
    autoTimer = setInterval(() => goToSlide(currentSlide + 1), AUTO_MS);
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function renderMessages() {
    if (!messagesList) return;

    messagesList.querySelectorAll(".messages-slide").forEach((el) => el.remove());
    if (messagesDots) messagesDots.innerHTML = "";

    if (messagesCache.length === 0) {
      if (messagesEmpty) messagesEmpty.hidden = false;
      totalSlides = 0;
      currentSlide = 0;
      if (msgPrev) msgPrev.disabled = true;
      if (msgNext) msgNext.disabled = true;
      stopAuto();
      return;
    }

    if (messagesEmpty) messagesEmpty.hidden = true;

    const sorted = [...messagesCache].reverse();
    totalSlides = Math.ceil(sorted.length / PER_SLIDE);
    currentSlide = Math.min(currentSlide, Math.max(0, totalSlides - 1));

    for (let s = 0; s < totalSlides; s++) {
      const slide = document.createElement("div");
      slide.className = "messages-slide" + (s === currentSlide ? " active" : "");

      const chunk = sorted.slice(s * PER_SLIDE, (s + 1) * PER_SLIDE);
      chunk.forEach((msg) => {
        const item = document.createElement("div");
        item.className = "message-item";
        const deleteBtn = isAdmin
          ? `<button type="button" class="message-delete" data-id="${msg.id}" title="Hapus pesan" aria-label="Hapus pesan">×</button>`
          : "";
        item.innerHTML = `
          ${deleteBtn}
          <div class="message-item-header">
            <span class="message-item-name">${escapeHtml(msg.name)}</span>
            <span class="message-item-date">${formatDate(msg.date)}</span>
          </div>
          <p class="message-item-text">${escapeHtml(msg.message)}</p>
        `;
        slide.appendChild(item);
      });

      messagesList.appendChild(slide);
    }

    if (isAdmin) {
      messagesList.querySelectorAll(".message-delete").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!isAdmin) return;
          if (!confirm("Hapus pesan ini?")) return;
          try {
            await api("/api/messages/" + btn.dataset.id, {
              method: "DELETE",
              headers: adminHeaders(),
            });
            await loadMessages();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    if (messagesDots && totalSlides > 1) {
      for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "messages-dot" + (i === currentSlide ? " active" : "");
        dot.setAttribute("aria-label", "Slide " + (i + 1));
        dot.addEventListener("click", () => {
          goToSlide(i);
          startAuto();
        });
        messagesDots.appendChild(dot);
      }
    }

    goToSlide(currentSlide);
    startAuto();
  }

  async function loadMessages() {
    try {
      messagesCache = await api("/api/messages");
    } catch (err) {
      console.warn("Gagal memuat pesan:", err.message);
      messagesCache = [];
    }
    renderMessages();
  }

  async function deleteAllMessages() {
    if (!isAdmin) return;
    if (!confirm("Hapus SEMUA pesan? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await api("/api/messages", {
        method: "DELETE",
        headers: adminHeaders(),
      });
      await loadMessages();
    } catch (err) {
      alert(err.message);
    }
  }

  function setAdminMode(on) {
    isAdmin = on;
    sessionStorage.setItem("danellaAdmin", on ? "1" : "0");
    document.body.classList.toggle("admin-mode", on);
    if (adminBar) adminBar.hidden = !on;
    if (adminToggle) adminToggle.classList.toggle("active", on);
    if (addFotoBtn) addFotoBtn.hidden = !on;
    renderMessages();
    renderGalleryExtras();
  }

  function showPopup() {
    if (!successPopup) return;
    successPopup.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hidePopup() {
    if (!successPopup) return;
    successPopup.hidden = true;
    document.body.style.overflow = "";
  }

  setAdminMode(isAdmin);

  if (adminToggle) {
    adminToggle.addEventListener("click", () => {
      if (isAdmin) {
        setAdminMode(false);
        return;
      }
      const input = prompt("Masukkan password creator:");
      if (input === null) return;
      if (input === ADMIN_PASSWORD) {
        setAdminMode(true);
      } else {
        alert("Password salah.");
      }
    });
  }

  if (adminLogout) adminLogout.addEventListener("click", () => setAdminMode(false));
  if (deleteAllBtn) deleteAllBtn.addEventListener("click", deleteAllMessages);

  if (msgPrev) {
    msgPrev.addEventListener("click", () => {
      goToSlide(currentSlide - 1);
      startAuto();
    });
  }
  if (msgNext) {
    msgNext.addEventListener("click", () => {
      goToSlide(currentSlide + 1);
      startAuto();
    });
  }

  const listBox = document.querySelector(".messages-list-box");
  if (listBox) {
    listBox.addEventListener("mouseenter", stopAuto);
    listBox.addEventListener("mouseleave", startAuto);
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("senderName").value.trim();
      const message = document.getElementById("messageText").value.trim();
      if (!name || !message) return;

      try {
        await api("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, message }),
        });
        form.reset();
        await loadMessages();
        showPopup();
      } catch (err) {
        alert(
          err.message ||
            "Gagal mengirim pesan. Pastikan server API berjalan (http://localhost:3000)."
        );
      }
    });
  }

  if (popupOkBtn) popupOkBtn.addEventListener("click", hidePopup);
  if (successPopup) {
    successPopup.addEventListener("click", (e) => {
      if (e.target === successPopup) hidePopup();
    });
  }

  // Load data bersama dari API
  loadMessages();
  loadGallery();

  // ===== Active nav on scroll =====
  const sections = document.querySelectorAll("section[id]");
  const navAnchors = document.querySelectorAll(".nav-links a");

  function updateActiveNav() {
    const scrollY = window.scrollY + 100;
    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute("id");
      if (scrollY >= top && scrollY < top + height) {
        navAnchors.forEach((a) => {
          a.classList.toggle("active", a.getAttribute("href") === "#" + id);
        });
      }
    });
  }

  window.addEventListener("scroll", updateActiveNav, { passive: true });
  updateActiveNav();
});