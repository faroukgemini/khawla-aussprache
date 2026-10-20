/* Khawlas Aussprache-Garten – practice, two people, Firebase sync.
 * Azure Speech key and the sync password are entered at runtime, never committed. */
(() => {
  "use strict";

  const L = window.AusspracheLogic;
  const FB_VERSION = "12.4.0";
  const EMAIL = { farouk: "farouk@aussprache.app", khawla: "khawla@aussprache.app" };
  const LS_SETTINGS = "aussprache.settings.v1";
  const LS_SESSION = "aussprache.session.v1";
  const LS_CATALOG = "aussprache.catalog.v1";
  const LS_MIGRATED = "aussprache.migrated.v2";
  const LS_SYNC = "aussprache.syncmeta.v1";
  const LS_ACTIVITY = "aussprache.activity.khawla.v1";
  const LS_DEVICE = "aussprache.device.v1";
  const APP_CACHE = "khawla-aussprache-v17";
  const APP_VERSION = "v17";
  const userKey = (id) => `aussprache.user.${id}.v1`;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const loadRaw = (k, d) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      return v == null ? d : v;
    } catch { return d; }
  };
  const saveRaw = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let hardwareLabel = "";
  let hardwarePromise = null;
  function deviceStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function currentDevice() {
    let saved = loadRaw(LS_DEVICE, null) || {};
    if (!/^[A-Za-z0-9_-]{6,48}$/.test(String(saved.id || ""))) {
      const rnd = Math.random().toString(36).slice(2, 10);
      saved = { id: "d" + rnd + Date.now().toString(36), name: String(saved.name || ""), hardware: String(saved.hardware || "") };
      saveRaw(LS_DEVICE, saved);
    }
    const auto = hardwareLabel || saved.hardware || L.deviceHardwareLabel(navigator.userAgent || "", null, deviceStandalone());
    const name = String(saved.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return { id: saved.id, name, auto, label: auto };
  }
  function saveDeviceName(name) {
    const cur = currentDevice();
    saveRaw(LS_DEVICE, { id: cur.id, name: String(name || "").replace(/\s+/g, " ").trim().slice(0, 40), hardware: cur.label });
    return currentDevice();
  }
  function refineDeviceHardware() {
    if (hardwarePromise) return hardwarePromise;
    hardwarePromise = (async () => {
      let hints = null;
      const uad = navigator.userAgentData;
      if (uad && typeof uad.getHighEntropyValues === "function") {
        try { hints = await uad.getHighEntropyValues(["model", "platform", "platformVersion", "fullVersionList"]); }
        catch (e) { hints = null; }
      }
      const label = L.deviceHardwareLabel(navigator.userAgent || "", hints, deviceStandalone());
      if (label) {
        hardwareLabel = label;
        const cur = currentDevice();
        saveRaw(LS_DEVICE, { id: cur.id, name: cur.name, hardware: label });
      }
      return currentDevice();
    })();
    return hardwarePromise;
  }
  function readyDevice() {
    return Promise.race([
      refineDeviceHardware(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).then(() => currentDevice());
  }

  function defaultSettings() {
    return {
      key: "", region: "northeurope", voice: "de-DE-KatjaNeural", prosody: false,
      firebase: { apiKey: "", authDomain: "", projectId: "", appId: "" },
      syncPassword: "",
    };
  }
  let settings = Object.assign(defaultSettings(), loadRaw(LS_SETTINGS, {}) || {});
  settings.firebase = Object.assign(defaultSettings().firebase, settings.firebase || {});
  if (!settings.region) settings.region = "northeurope";
  if (!settings.voice) settings.voice = "de-DE-KatjaNeural";
  if ("demo" in settings) delete settings.demo;

  let catalog = loadRaw(LS_CATALOG, { customUnits: [] }) || { customUnits: [] };
  if (!Array.isArray(catalog.customUnits)) catalog.customUnits = [];

  let session = null;
  let progress = L.emptyProgress();
  let mode = "path";
  let queue = [];
  let currentId = null;
  let freeText = "";
  let booted = false;
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;
  let syncRetryTimer = null;
  let syncRetryN = 0;
  let syncQueue = Promise.resolve();
  const SYNC_RETRY_MS = [4000, 12000, 30000, 60000];

  const isAdmin = () => session === "farouk";
  const firebaseConfigured = () => {
    const f = settings.firebase || {};
    return !!(f.apiKey && f.authDomain && f.projectId && f.appId && settings.syncPassword);
  };
  const hasKey = () => !!(settings.key && String(settings.key).trim() && settings.region && String(settings.region).trim());
  const showTrans = () => !progress.showTrans || progress.showTrans.value !== false;

function loadProgress(id) {
  const p = loadRaw(userKey(id), null);
  if (!p) return L.emptyProgress();
  const attempts = p.attempts || [];
  return Object.assign(L.emptyProgress(), p, {
    best: p.best || {},
    attempts,
    reviews: p.reviews || {},
    days: L.recomputeDays(attempts),
    showTrans: p.showTrans || { value: true, at: 0 },
    pet: L.readPet(p),
    uiLang: L.readUiLang(p),
    guide: L.readGuide(p),
  });
}
  function saveProgress(id, p) {
    p.days = L.recomputeDays(p.attempts || []);
    saveRaw(userKey(id), p);
  }
  function saveSettings() { saveRaw(LS_SETTINGS, settings); }

  const LS_UILANG = "aussprache.uilang.v1";
  let uiLang = "en";
  let langChosen = false;
  let guideIndex = 0;
  let guideOpen = false;
  let openUnitId = null;
  const GUIDE_VERSION = 2;
  const GUIDE = [
    { sel: "#sentenceCard", key: "guide.sentence", view: "practice" },
    { sel: "#recordBtn", key: "guide.record", view: "practice" },
    { sel: "#nextBar", key: "guide.nextStep", view: "practice" },
    { sel: "#startReview", key: "guide.review", view: "review" },
    { sel: "#mascotMini", key: "guide.kapi", view: "practice" },
    { sel: "#logoutBtn", key: "guide.settings", view: "settings" },
  ];
  function tr(key, vars) {
    const table = (window.I18N && window.I18N[uiLang]) || {};
    const fallback = (window.I18N && window.I18N.en) || {};
    let s = table[key] != null ? table[key] : (fallback[key] != null ? fallback[key] : key);
    if (vars) Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }
  function trIn(lang, key, vars) {
    const prev = uiLang;
    uiLang = lang === "de" ? "de" : "en";
    const s = tr(key, vars);
    uiLang = prev;
    return s;
  }
  function unitName(u) {
    if (!u) return "";
    return uiLang === "en" && u.titleEn ? u.titleEn : (u.title || "");
  }
  function tipText(tip) {
    const parts = String(tip || "").split(/\s·\s/);
    if (parts.length < 2) return tip || "";
    return uiLang === "en" ? parts.slice(1).join(" · ") : parts[0];
  }
  function paintI18n() {
    document.documentElement.lang = uiLang === "en" ? "en" : "de";
    document.title = tr("app.title");
    $$("[data-i18n]").forEach((el) => { el.textContent = tr(el.getAttribute("data-i18n")); });
    $$("[data-i18n-placeholder]").forEach((el) => { el.setAttribute("placeholder", tr(el.getAttribute("data-i18n-placeholder"))); });
    $$("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", tr(el.getAttribute("data-i18n-aria"))); });
    $$("[data-i18n-title]").forEach((el) => { el.title = tr(el.getAttribute("data-i18n-title")); });
    $$("[data-i18n-alt]").forEach((el) => { el.alt = tr(el.getAttribute("data-i18n-alt")); });
    $$(".lang-switch").forEach((sw) => {
      sw.setAttribute("aria-label", tr("nav.lang"));
      sw.querySelectorAll("button").forEach((b) => {
        const on = b.dataset.lang === uiLang;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }
  function applyLang(value, userChoice) {
    uiLang = value === "de" ? "de" : "en";
    const stamp = { value: uiLang, at: Date.now(), explicit: !!userChoice };
    if (userChoice) saveRaw(LS_UILANG, stamp);
    if (userChoice && !session) langChosen = true;
    if (userChoice && session) {
      progress.uiLang = stamp;
      saveProgress(session, progress);
      schedulePush();
    }
    paintI18n();
    if (keyWallKind) renderKeyWall();
    if (session) {
      renderAll();
      greet();
      if (guideOpen) showGuideStep(guideIndex);
    }
  }
  function adoptLang(user) {
    if (langChosen) {
      progress.uiLang = { value: uiLang, at: Date.now(), explicit: true };
      saveProgress(user, progress);
      saveRaw(LS_UILANG, progress.uiLang);
      return;
    }
    const saved = L.readUiLang(progress);
    const device = loadRaw(LS_UILANG, null);
    const deviceOk = !!(device && device.explicit && (device.value === "en" || device.value === "de"));
    if (saved.explicit && deviceOk) uiLang = (device.at || 0) >= (saved.at || 0) ? device.value : saved.value;
    else if (saved.explicit) uiLang = saved.value;
    else if (deviceOk) {
      uiLang = device.value;
      progress.uiLang = { value: uiLang, at: device.at || Date.now(), explicit: true };
      saveProgress(user, progress);
      return;
    } else uiLang = "en";
  }

  let guideTimer = 0;
  function showGuideStep(i) {
    const step = GUIDE[i];
    if (!step) { finishGuide(); return; }
    guideIndex = i;
    guideOpen = true;
    if (step.view) showView(step.view);
    $("#guide").hidden = false;
    $("#guideText").textContent = tr(step.key);
    $("#guideSkip").textContent = tr("guide.skip");
    $("#guideNext").textContent = i === GUIDE.length - 1 ? tr("guide.done") : tr("guide.next");
    $("#guideCount").textContent = (i + 1) + " / " + GUIDE.length;
    const el = $(step.sel);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "nearest" });
    requestAnimationFrame(() => requestAnimationFrame(positionGuide));
    clearTimeout(guideTimer);
    guideTimer = setTimeout(positionGuide, 380);
  }
  function positionGuide() {
    if (!guideOpen) return;
    const step = GUIDE[guideIndex];
    const el = step && $(step.sel);
    const hole = $("#guideHole");
    const card = $("#guideCard");
    if (!el || !hole || !card) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const pad = 8;
    const top = Math.max(8, r.top - pad);
    const left = Math.max(8, r.left - pad);
    const width = Math.min(window.innerWidth - 16, Math.max(24, r.width + pad * 2));
    const height = Math.min(window.innerHeight - 16, Math.max(24, r.height + pad * 2));
    hole.style.top = top + "px";
    hole.style.left = left + "px";
    hole.style.width = width + "px";
    hole.style.height = height + "px";
    card.style.visibility = "hidden";
    card.style.top = "0px";
    card.style.left = "12px";
    const ch = card.offsetHeight;
    const cw = card.offsetWidth;
    card.style.visibility = "";
    const gap = 12;
    let cardTop = top + height + gap;
    if (cardTop + ch > window.innerHeight - 8) cardTop = Math.max(8, top - ch - gap);
    const cardLeft = Math.min(Math.max(12, left), Math.max(12, window.innerWidth - cw - 12));
    card.style.top = cardTop + "px";
    card.style.left = cardLeft + "px";
  }
  function finishGuide() {
    guideOpen = false;
    clearTimeout(guideTimer);
    const layer = $("#guide");
    if (layer) layer.hidden = true;
    if (session) {
      progress.guide = { done: true, at: Date.now(), seenVersion: GUIDE_VERSION };
      saveProgress(session, progress);
      schedulePush();
    }
    showView("practice");
  }
  function maybeStartGuide() {
    if (keyWallKind) return;
    if (!session || guideOpen) return;
    if ($("#app").hidden) return;
    if (!$("#loveModal").hidden || !$("#faroukModal").hidden) return;
    if ((L.readGuide(progress).seenVersion || 0) >= GUIDE_VERSION) return;
    showGuideStep(0);
  }

  function units() {
    const custom = (catalog.customUnits || []).filter((u) => u && !u.deleted && u.sentences && u.sentences.length);
    return [...(window.UNITS || []), ...custom];
  }

  function migrate() {
    if (localStorage.getItem(LS_MIGRATED)) return;
    const oldS = loadRaw("khawla.settings.v1", null);
    const oldP = loadRaw("khawla.progress.v1", null);
    const oldPos = loadRaw("khawla.position.v1", null);
    if (oldS) {
      if (oldS.key) settings.key = oldS.key;
      if (oldS.region) settings.region = oldS.region;
      if (oldS.voice) settings.voice = oldS.voice;
      if (typeof oldS.prosody === "boolean") settings.prosody = oldS.prosody;
      saveSettings();
    }
    const hasOld = oldP && ((oldP.best && Object.keys(oldP.best).length) || (oldP.attempts && oldP.attempts.length));
    if (hasOld && !localStorage.getItem(userKey("khawla"))) {
      const prog = L.migrateLegacy(oldP, window.LEGACY || [], window.UNITS || []);
      if (oldS && typeof oldS.showTrans === "boolean") prog.showTrans = { value: oldS.showTrans, at: 1 };
      const cur = L.cursorFromLegacy(oldPos, window.LEGACY || [], window.UNITS || []);
      if (cur) prog.cursor = cur;
      saveProgress("khawla", prog);
    }
    localStorage.setItem(LS_MIGRATED, "1");
  }

  function absorbLegacyProgress() {
    const oldP = loadRaw("khawla.progress.v1", null);
    const oldPos = loadRaw("khawla.position.v1", null);
    const hasOld = oldP && ((oldP.best && Object.keys(oldP.best).length) || (oldP.attempts && oldP.attempts.length));
    if (!hasOld && !oldPos) return;
    const legacy = hasOld ? L.migrateLegacy(oldP, window.LEGACY || [], window.UNITS || []) : L.emptyProgress();
    const cur = L.cursorFromLegacy(oldPos, window.LEGACY || [], window.UNITS || []);
    if (cur) legacy.cursor = legacy.cursor && (legacy.cursor.at || 0) >= (cur.at || 0) ? legacy.cursor : cur;
    const current = loadProgress("khawla");
    const merged = L.mergeProgress(current, legacy);
    if (L.contentKey(merged) !== L.contentKey(current)) saveProgress("khawla", merged);
  }

  function fromB64Url(s) {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function toB64Url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function consumeSetup() {
    const h = location.hash || "";
    if (!h.startsWith("#setup=")) return;
    try {
      const data = fromB64Url(decodeURIComponent(h.slice(7)));
      if (data && data.fb && data.fb.apiKey && data.fb.projectId) {
        settings.firebase = Object.assign(defaultSettings().firebase, data.fb);
        if (data.pw) settings.syncPassword = String(data.pw);
        if (data.az && data.az.key) {
          settings.key = String(data.az.key);
          if (data.az.region) settings.region = String(data.az.region);
          if (data.az.voice) settings.voice = String(data.az.voice);
        }
        saveSettings();
      }
    } catch (e) { console.warn("setup link", e); }
    history.replaceState(null, "", location.pathname + location.search);
  }

  /* ---------------- helpers ---------------- */
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const round = (v) => (v == null || isNaN(v) ? null : Math.round(v));
  function marksFor(prog, userId) {
    return L.strictnessMarks(L.effectiveStrictness(prog || progress, userId || session));
  }
  function passFor(prog, userId) {
    return marksFor(prog, userId).pass;
  }
  function band(s, userId, prog) {
    const m = marksFor(prog, userId);
    return s >= m.pass ? "good" : s >= m.red ? "ok" : "bad";
  }
  const starsFor = (s) => (s >= 90 ? 3 : s >= 75 ? 2 : s >= 60 ? 1 : 0);
  const starStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const dayKey = (d = new Date()) => L.dayKey(d.getTime ? d.getTime() : d);
  const escXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let toastTimer;
  function toast(msg, ms = 2800) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  function textFor(id) {
    const hit = L.findSentence(units(), id);
    if (hit) return { de: hit.sentence.de, en: hit.sentence.en || "", unit: hit.unit, sentence: hit.sentence };
    if (mode === "free" && freeText.trim()) return { de: freeText.trim(), en: "", unit: null, sentence: null };
    const att = [...(progress.attempts || [])].reverse().find((a) => a.sentenceId === id);
    return { de: att ? att.text : "", en: "", unit: null, sentence: null };
  }

  function current() {
    if (mode === "free") {
      const text = freeText.trim();
      return { id: text ? "free:" + L.norm(text) : null, de: text, en: "", level: "Frei", unit: null };
    }
    const info = textFor(currentId);
    const hit = L.findSentence(units(), currentId);
    const i = hit ? hit.unit.sentences.findIndex((s) => s.id === currentId) : -1;
    return {
      id: info.de ? currentId : null,
      de: info.de,
      en: info.en,
      unit: info.unit,
      level: info.unit ? info.unit.level : (mode === "review" ? "Wiederholen" : mode === "drill" ? "Laute" : ""),
      i,
      n: hit ? hit.unit.sentences.length : 0,
    };
  }

  function setMood(m) {
    ["#mascotMini", "#mascotBig"].forEach((s) => {
      const el = $(s);
      if (!el) return;
      el.classList.remove("happy", "listen");
      if (m) { void el.offsetWidth; el.classList.add(m); }
    });
  }

  /* ---------------- petting ---------------- */
  const PET_SLEEPY = 18;
  let pet = L.readPet(null);
  let petAudio = null;
  let lastPetAt = 0;

  function loadPet() { pet = L.readPet(progress); }
  function savePet() {
    progress.pet = {
      count: pet.count,
      countAt: pet.countAt,
      mute: !!pet.mute,
      muteAt: pet.muteAt,
    };
    if (!session) return;
    saveProgress(session, progress);
    schedulePush();
  }
  function renderPet() {
    loadPet();
    const label = (pet.count >= PET_SLEEPY ? "💤 " : "") + pet.count;
    $$(".pet-count").forEach((el) => { el.textContent = label; });
    ["#mascotMini", "#mascotBig"].forEach((s) => {
      const el = $(s);
      if (el) el.classList.toggle("sleepy", pet.count >= PET_SLEEPY);
    });
    const mute = $("#petMute");
    if (mute) {
      mute.setAttribute("aria-pressed", pet.mute ? "true" : "false");
      mute.textContent = pet.mute ? "🔇" : "🔊";
      mute.title = pet.mute ? tr("kapi.quiet") : tr("kapi.chirp");
      mute.setAttribute("aria-label", pet.mute ? tr("kapi.soundOff") : tr("kapi.soundOn"));
    }
  }
  function spawnHeart(host) {
    const hearts = host.querySelectorAll(".pet-heart");
    if (hearts.length >= 8) hearts[0].remove();
    const e = document.createElement("span");
    e.className = "pet-heart";
    e.setAttribute("aria-hidden", "true");
    e.textContent = pet.count >= PET_SLEEPY ? "💤" : pick(["💖", "💗", "💛", "✨"]);
    e.style.left = (28 + Math.random() * 44) + "%";
    host.appendChild(e);
    setTimeout(() => e.remove(), 950);
  }
  function chirp() {
    if (pet.mute) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!petAudio) petAudio = new AC();
      if (petAudio.state === "suspended") petAudio.resume().catch(() => {});
      const t = petAudio.currentTime;
      const o = petAudio.createOscillator();
      const g = petAudio.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(640, t);
      o.frequency.exponentialRampToValueAtTime(920, t + 0.11);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(petAudio.destination);
      o.start(t);
      o.stop(t + 0.2);
    } catch { /* autoplay or missing audio */ }
  }
  function reactPet(host, opts) {
    if (!host) return;
    const count = !opts || opts.count !== false;
    const now = performance.now();
    if (now - lastPetAt < 140) return;
    lastPetAt = now;
    const before = pet.count;
    if (count) {
      pet.count += 1;
      pet.countAt = Date.now();
      savePet();
    }
    host.classList.remove("petting");
    void host.offsetWidth;
    host.classList.add("petting", "happy");
    spawnHeart(host);
    chirp();
    renderPet();
    if (count && before < PET_SLEEPY && pet.count >= PET_SLEEPY) toast(tr("toast.sleepy"));
    clearTimeout(host._petTimer);
    host._petTimer = setTimeout(() => host.classList.remove("petting"), 460);
  }
  function capyCheer() {
    ["#mascotMini", "#mascotBig"].forEach((s) => {
      const el = $(s);
      if (!el || el.closest("[hidden]")) return;
      el.classList.add("happy");
      el.classList.remove("petting");
      void el.offsetWidth;
      el.classList.add("petting");
      spawnHeart(el);
      clearTimeout(el._petTimer);
      el._petTimer = setTimeout(() => el.classList.remove("petting"), 460);
    });
    chirp();
  }
  function bindPets() {
    if (bindPets.done) return;
    bindPets.done = true;
    loadPet();
    renderPet();
    const mute = $("#petMute");
    if (mute) mute.onclick = (e) => {
      e.stopPropagation();
      pet.mute = !pet.mute;
      pet.muteAt = Date.now();
      savePet();
      renderPet();
      if (!pet.mute) chirp();
    };
    $$(".pet-target").forEach((el) => {
      let down = false;
      let moved = false;
      let lx = 0;
      let ly = 0;
      let trail = 0;
      const stroked = (e) => {
        const dx = e.clientX - lx;
        const dy = e.clientY - ly;
        lx = e.clientX;
        ly = e.clientY;
        trail += Math.hypot(dx, dy);
        if (trail < 12) return false;
        trail = 0;
        return true;
      };
      el.addEventListener("pointerenter", (e) => {
        lx = e.clientX;
        ly = e.clientY;
        trail = 0;
        el._hoverReady = true;
      });
      el.addEventListener("pointerleave", () => { el._hoverReady = false; down = false; trail = 0; });
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        down = true;
        moved = false;
        trail = 0;
        el._fromPointer = true;
        lx = e.clientX;
        ly = e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      });
      el.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse" && !down) {
          if (!el._hoverReady) { lx = e.clientX; ly = e.clientY; el._hoverReady = true; trail = 0; return; }
          if (stroked(e)) reactPet(el);
          return;
        }
        if (!down) return;
        if (stroked(e)) { moved = true; reactPet(el); }
      });
      el.addEventListener("pointerup", () => {
        if (!down) return;
        down = false;
        if (!moved) reactPet(el);
      });
      el.addEventListener("pointercancel", () => { down = false; });
      el.addEventListener("click", () => {
        if (el._fromPointer) { el._fromPointer = false; return; }
        reactPet(el);
      });
    });
  }

  /* ---------------- rendering ---------------- */
  function renderHeader() {
    const name = session === "farouk" ? "Farouk" : "Khawla";
    $("#helloTitle").textContent = tr("hello", { name });
    $("#whoChip").textContent = isAdmin() ? tr("who.admin") : tr("who.learner");
    $("#streakCount").textContent = computeStreak(progress);
    $("#starCount").textContent = totalStars(progress);
    const due = L.dueReviews(progress, Date.now()).length;
    $("#reviewCount").textContent = String(due);
    renderSyncStatus();
  }

  function renderPractice() {
    const c = current();
    const isFree = mode === "free";
    $("#deckSentence").hidden = isFree;
    $("#customBox").hidden = !isFree;
    $("#toggleTrans").hidden = isFree;
    if (isFree) $("#customInput").value = freeText;
    if (!isFree) {
      $("#germanText").textContent = c.de || "…";
      $("#englishText").textContent = c.en || "";
      $("#englishText").classList.toggle("hide", !showTrans());
    }
    const place = { i: Math.max(1, queue.indexOf(currentId) + 1), n: queue.length || 0 };
    let label = tr("lessons.one");
    if (mode === "review") label = tr("deck.review", place);
    else if (mode === "drill") label = tr("deck.drill", place);
    else if (isFree) label = tr("deck.free");
    else if (c.unit) label = tr("deck.unit", { level: c.level, name: `${c.unit.emoji || ""} ${unitName(c.unit)}`.trim(), i: c.i + 1, n: c.n });
    $("#deckLabel").textContent = label;
    $("#toggleTrans").textContent = showTrans() ? tr("trans.hide") : tr("trans.show");
    const best = c.id ? L.scoreForProgress(progress, c.id) : null;
    $("#bestStars").textContent = starStr(best != null ? starsFor(best) : 0);
    $("#bestStars").title = best != null ? tr("best.score", { n: best }) : tr("best.none");
    const tips = $("#tips");
    tips.innerHTML = "";
    if (c.de) {
      (window.SOUND_TIPS || []).filter((t) => t.test.test(c.de)).slice(0, 2).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = "💡 " + tipText(t.tip);
        tips.appendChild(li);
      });
    }
    $("#recordBtn").disabled = !c.de;
    const nxt = L.nextUpId(units(), progress, currentId, isAdmin(), Date.now(), passFor());
    const nh = L.findSentence(units(), nxt);
    $("#nextHint").textContent = mode === "review"
      ? tr("hint.review")
      : mode === "drill"
        ? tr("hint.drill")
        : nh
          ? tr("hint.next", { unit: unitName(nh.unit), de: nh.sentence.de })
          : "";
    if (!$("#pathWrap").hidden) {
      renderPath();
      if (openUnitId && !$("#unitDetail").hidden) refreshOpenUnit();
    }
  }

  function renderPath() {
    const list = units();
    const grid = $("#pathGrid");
    grid.innerHTML = "";
    list.forEach((u, i) => {
      const pass = passFor();
      const unlocked = isAdmin() || L.isUnlocked(i, list, progress, pass);
      const avg = L.unitAverage(u, progress);
      const done = u.sentences.filter((s) => (L.scoreForProgress(progress, s.id) || 0) >= pass).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "unit-node" + (unlocked ? "" : " locked") + (avg >= pass ? " done" : "") + (progress.cursor && progress.cursor.unitId === u.id ? " current" : "");
      b.innerHTML = `<span class="emoji"></span><b></b><small></small><div class="mini-track"><span></span></div>`;
      b.querySelector(".emoji").textContent = unlocked ? (u.emoji || "🌱") : "🔒";
      b.querySelector("b").textContent = unitName(u);
      b.querySelector("small").textContent = `${u.level} · ${done}/${u.sentences.length} · Ø ${Math.round(avg)}`;
      b.querySelector(".mini-track span").style.width = Math.round(avg) + "%";
      b.onclick = () => openUnit(u.id);
      grid.appendChild(b);
    });
  }

  function closeLock() {
    const el = $("#lockDialog");
    if (el) el.hidden = true;
  }
  function practiceFromLock(id) {
    if (!id) return;
    closeLock();
    mode = "path";
    queue = [];
    showSentence(id);
    showView("practice");
    const wrap = $("#pathWrap");
    if (wrap) wrap.hidden = true;
    const toggle = $("#pathToggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    const card = $("#sentenceCard");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showLock(index) {
    const advice = L.lockAdvice(units(), index, progress, passFor());
    if (!advice.locked) return;
    const nameOf = (u) => unitName(u);
    const prevName = nameOf(advice.previous);
    const avg = Math.round(advice.average);
    $("#lockKapi").textContent = tr("lock.kapi");
    $("#lockTitle").textContent = tr("lock.title", { name: nameOf(advice.target) });
    $("#lockLead").textContent = advice.kind === "start"
      ? tr("lock.start", { prev: prevName })
      : advice.later
        ? tr("lock.whyLater", { blocked: nameOf(advice.blocked), prev: prevName, n: advice.need })
        : tr("lock.why", { prev: prevName, n: advice.need });
    $("#lockAvg").textContent = tr("lock.avg", { avg });
    const box = $("#lockItems");
    box.innerHTML = "";
    const addRow = (item, scoreText) => {
      const row = document.createElement("div");
      row.className = "lock-item";
      const text = document.createElement("div");
      const de = document.createElement("b");
      de.textContent = item.de;
      de.lang = "de";
      text.appendChild(de);
      if (uiLang !== "de" && item.en) {
        const en = document.createElement("span");
        en.className = "lock-en";
        en.textContent = item.en;
        text.appendChild(en);
      }
      const score = document.createElement("span");
      score.className = "lock-score";
      score.textContent = scoreText;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.textContent = advice.kind === "start" ? tr("lock.begin") : tr("lock.practice");
      btn.onclick = () => practiceFromLock(item.id);
      row.append(text, score, btn);
      box.appendChild(row);
    };
    if (advice.kind === "start") {
      const first = (advice.previous && units().find((u) => u.id === advice.previous.id));
      const sentence = first && (first.sentences || []).find((s) => s.id === advice.startId);
      if (sentence) addRow({ de: sentence.de, en: sentence.en, id: sentence.id }, "—");
    } else {
      advice.items.forEach((item) => addRow(item, String(item.score)));
      advice.missing.forEach((item) => addRow(item, tr("lock.notTried")));
    }
    $("#lockClose").textContent = tr("lock.close");
    $("#lockDialog").hidden = false;
  }
  function openUnit(unitId) {
    const list = units();
    const i = list.findIndex((u) => u.id === unitId);
    if (i < 0) return;
    if (!isAdmin() && !L.isUnlocked(i, list, progress, passFor())) {
      showLock(i);
      return;
    }
    const u = list[i];
    openUnitId = unitId;
    $("#unitDetail").hidden = false;
    $("#unitDetailTitle").textContent = `${u.emoji || ""} ${unitName(u)}`.trim();
    const box = $("#unitSentences");
    box.innerHTML = "";
    u.sentences.forEach((s, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sentence-jump" + (s.id === currentId ? " on" : "");
      const label = document.createElement("span");
      label.textContent = `${idx + 1}. ${s.de}`;
      const sc = document.createElement("small");
      const best = L.scoreForProgress(progress, s.id);
      sc.textContent = best == null ? "☆☆☆" : `${starStr(starsFor(best))} ${best}`;
      btn.append(label, sc);
      btn.onclick = () => {
        mode = "path";
        queue = [];
        showSentence(s.id);
        $("#pathWrap").hidden = true;
        $("#pathToggle").setAttribute("aria-expanded", "false");
        showView("practice");
      };
      box.appendChild(btn);
    });
    $("#unitDetail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function refreshOpenUnit() {
    if (!openUnitId || $("#unitDetail").hidden) return;
    const u = units().find((x) => x.id === openUnitId);
    if (!u) return;
    $("#unitDetailTitle").textContent = `${u.emoji || ""} ${unitName(u)}`.trim();
  }

  function hideResult() {
    $("#resultCard").hidden = true;
    $("#emptyCard").hidden = false;
    setMood(null);
  }

  function computeStreak(prog) {
    const days = (prog && prog.days) || {};
    const d = new Date();
    let n = 0;
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function totalStars(prog) {
    const ids = new Set(Object.keys((prog && prog.best) || {}));
    ((prog && prog.attempts) || []).forEach((a) => { if (a && a.sentenceId) ids.add(a.sentenceId); });
    let n = 0;
    ids.forEach((id) => {
      const s = L.scoreForProgress(prog, id);
      if (s != null) n += starsFor(s);
    });
    return n;
  }

  function renderProgress() {
    const att = progress.attempts || [];
    const counted = L.countingAttempts(progress);
    $("#pStreak").textContent = computeStreak(progress);
    $("#pStars").textContent = totalStars(progress);
    $("#pAttempts").textContent = att.length;
    $("#pAvg").textContent = counted.length ? Math.round(counted.reduce((a, x) => a + x.score, 0) / counted.length) : "–";
    const week = $("#week");
    week.innerHTML = "";
    const days = [];
    for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(d); }
    const max = Math.max(1, ...days.map((d) => (progress.days || {})[dayKey(d)] || 0));
    days.forEach((d, k) => {
      const v = (progress.days || {})[dayKey(d)] || 0;
      const el = document.createElement("div");
      el.className = "day" + (k === 6 ? " today" : "");
      el.innerHTML = `<span></span><div class="col ${v ? "" : "zero"}" style="height:${v ? 10 + (v / max) * 80 : 4}%"></div><span></span>`;
      const labels = el.querySelectorAll("span");
      labels[0].textContent = v ? String(v) : "";
      labels[1].textContent = tr("day." + d.getDay());
      week.appendChild(el);
    });
    const lp = $("#levelProgress");
    lp.innerHTML = "";
    units().forEach((u, i) => {
      const unlocked = isAdmin() || L.isUnlocked(i, units(), progress, passFor());
      const avg = Math.round(L.unitAverage(u, progress));
      const el = document.createElement("div");
      el.className = "lvl" + (unlocked ? "" : " locked");
      if (!unlocked && !isAdmin()) el.onclick = () => showLock(i);
      const top = document.createElement("div");
      top.className = "lvl-top";
      const name = document.createElement("span");
      name.textContent = `${unlocked ? (u.emoji || "") : "🔒"} ${unitName(u)}`.trim();
      const meta = document.createElement("span");
      meta.textContent = unlocked ? `Ø ${avg}` : tr("locked.short");
      top.append(name, meta);
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = (unlocked ? avg : 0) + "%";
      track.appendChild(fill);
      el.append(top, track);
      lp.appendChild(el);
    });
    const rec = $("#recent");
    rec.innerHTML = "";
    if (!att.length) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = tr("recent.empty");
      li.appendChild(span);
      rec.appendChild(li);
    }
    att.slice(-8).reverse().forEach((a) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = a.text || "";
      const s = document.createElement("span");
      s.className = "sc " + band(a.score);
      s.textContent = a.score + (a.demo ? tr("recent.demo") : "");
      li.append(t, s);
      rec.appendChild(li);
    });
  }

  function renderKhawla() {
    if (!isAdmin()) return;
    const hers = loadProgress("khawla");
    const meta = (loadRaw(LS_SYNC, {}) || {}).khawla || {};
    const line = $("#khawlaSync");
    if (!firebaseConfigured()) line.textContent = tr("her.offline");
    else if (meta.error) line.textContent = tr("her.err", { err: meta.error });
    else if (meta.at) line.textContent = tr("her.at", { when: new Date(meta.at).toLocaleString() }) + (meta.remoteUpdatedAt ? tr("her.stand", { when: new Date(meta.remoteUpdatedAt).toLocaleString() }) : "");
    else line.textContent = tr("her.never");
    const stats = $("#khawlaStats");
    stats.innerHTML = "";
    const cells = [
      ["🔥", computeStreak(hers), tr("her.streak")],
      ["⭐", totalStars(hers), tr("stat.stars")],
      ["🎤", (hers.attempts || []).length, tr("stat.tries")],
      ["💯", L.countingAttempts(hers).length ? Math.round(L.countingAttempts(hers).reduce((a, x) => a + x.score, 0) / L.countingAttempts(hers).length) : "–", tr("stat.avg")],
    ];
    cells.forEach(([emo, n, lab]) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = `<span>${emo}</span><b></b><small></small>`;
      d.querySelector("b").textContent = n;
      d.querySelector("small").textContent = lab;
      stats.appendChild(d);
    });
    const box = $("#khawlaUnits");
    box.innerHTML = "";
    units().forEach((u) => {
      const avg = Math.round(L.unitAverage(u, hers));
      if (!avg) return;
      const el = document.createElement("div");
      el.className = "lvl";
      el.innerHTML = `<div class="lvl-top"><span></span><span></span></div><div class="track"><div class="fill"></div></div>`;
      el.querySelector("span").textContent = `${u.emoji || ""} ${unitName(u)}`.trim();
      el.querySelectorAll("span")[1].textContent = "Ø " + avg;
      el.querySelector(".fill").style.width = avg + "%";
      box.appendChild(el);
    });
    const rec = $("#khawlaRecent");
    rec.innerHTML = "";
    const att = hers.attempts || [];
    if (!att.length) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = tr("her.none");
      li.appendChild(span);
      rec.appendChild(li);
    }
    att.slice(-6).reverse().forEach((a) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = a.text || "";
      const s = document.createElement("span");
      s.className = "sc " + band(a.score, "khawla", hers);
      s.textContent = a.score + (a.demo ? tr("recent.demo") : "");
      li.append(t, s);
      rec.appendChild(li);
    });
  }

  function renderReview() {
    const due = L.dueReviews(progress, Date.now());
    $("#reviewLead").textContent = due.length
      ? (due.length === 1 ? tr("review.due1") : tr("review.due", { n: due.length }))
      : tr("review.none");
    const list = $("#reviewList");
    list.innerHTML = "";
    due.slice(0, 30).forEach((r) => {
      const info = textFor(r.sentenceId);
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = info.de || r.sentenceId;
      const s = document.createElement("span");
      s.className = "sc " + band(r.lastScore || 0);
      s.textContent = (r.lastScore ?? "–") + (r.mastered ? " ★" : "");
      li.append(t, s);
      list.appendChild(li);
    });
    const weak = L.weakSounds(progress);
    const box = $("#weakList");
    box.innerHTML = "";
    $("#weakLead").textContent = weak.length ? tr("weak.some") : tr("weak.empty");
    weak.slice(0, 6).forEach((w) => {
      const pat = (window.SOUND_PATTERNS || []).find((p) => p.id === w.k);
      const row = document.createElement("div");
      row.className = "weak-row";
      const name = document.createElement("span");
      name.textContent = pat ? pat.label : w.k;
      const sc = document.createElement("span");
      sc.textContent = `Ø ${Math.round(w.avg)} · ${w.n}×`;
      row.append(name, sc);
      box.appendChild(row);
    });
    $("#startDrill").disabled = !L.drillSentenceIds(units(), progress, window.SOUND_PATTERNS, 6).length;
  }

  function syncAgeText(ts) {
    if (!ts) return "";
    const min = Math.floor(Math.max(0, Date.now() - ts) / 60000);
    if (min < 1) return tr("sync.just");
    if (min < 60) return tr("sync.minAgo", { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 48) return tr("sync.hourAgo", { n: hr });
    return tr("sync.dayAgo", { n: Math.floor(hr / 24) });
  }
  function renderSyncStatus() {
    const version = tr("sync.version", { v: APP_VERSION });
    let line = "";
    let bad = false;
    if (session && !firebaseConfigured()) {
      line = tr("sync.notSet");
      bad = true;
    } else if (session && !navigator.onLine) {
      line = tr("sync.offline");
      bad = true;
    } else if (session) {
      const meta = (loadRaw(LS_SYNC, {}) || {})[session] || {};
      if (syncing) line = tr("sync.syncing");
      else if (meta.error) { line = tr("sync.errorLine", { err: meta.error }); bad = true; }
      else if (meta.lastOk || (meta.ok && meta.at)) line = syncAgeText(meta.lastOk || meta.at);
      else line = tr("sync.soon");
    }
    const text = line ? version + " · " + line : version;
    ["#syncPill", "#syncStatus"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("bad", bad);
    });
    const auto = $("#deviceAuto");
    const dev = currentDevice();
    if (auto) auto.textContent = tr("device.auto", { label: dev.auto });
    const input = $("#deviceName");
    if (input && document.activeElement !== input) input.value = dev.name || "";
  }

  function renderSettings() {
    $("#settingsWho").textContent = isAdmin() ? tr("you.whoAdmin") : tr("you.whoLearner");
    $("#transToggle").checked = showTrans();
    renderSyncStatus();
    $("#secureNote").textContent = window.isSecureContext ? tr("secure.ok") : tr("secure.no");
    if (!isAdmin()) return;
    $("#keyInput").value = settings.key || "";
    $("#regionInput").value = settings.region || "";
    $("#voiceSelect").value = settings.voice;
    const strictSel = $("#strictnessSelect");
    if (strictSel) strictSel.value = L.effectiveStrictness(loadProgress("khawla"), "khawla");
    const strictHelp = $("#strictnessHelp");
    if (strictHelp) strictHelp.textContent = tr("strictness.help");
    $("#prosodyToggle").checked = !!settings.prosody;
    const f = settings.firebase || {};
    $("#fbApiKey").value = f.apiKey || "";
    $("#fbAuthDomain").value = f.authDomain || "";
    $("#fbProjectId").value = f.projectId || "";
    $("#fbAppId").value = f.appId || "";
    $("#syncPassword").value = settings.syncPassword || "";
    renderCustomUnits();
  }

  function renderCustomUnits() {
    const box = $("#customUnitList");
    if (!box) return;
    box.innerHTML = "";
    (catalog.customUnits || []).filter((u) => !u.deleted).forEach((u) => {
      const row = document.createElement("div");
      row.className = "sentence-jump";
      const t = document.createElement("span");
      t.textContent = `${u.emoji || "✏️"} ${u.title} (${(u.sentences || []).length})`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-ghost danger";
      del.textContent = tr("custom.delete");
      del.onclick = () => {
        u.deleted = true;
        u.updatedAt = Date.now();
        saveRaw(LS_CATALOG, catalog);
        renderCustomUnits();
        renderPath();
        pushCatalog().catch((e) => console.warn(e));
      };
      row.append(t, del);
      box.appendChild(row);
    });
  }

  function renderAll() {
    renderHeader();
    renderPractice();
    if ($("#view-review").classList.contains("active")) renderReview();
    if ($("#view-progress").classList.contains("active")) { renderProgress(); renderKhawla(); renderActivity(); }
    if ($("#view-settings").classList.contains("active")) renderSettings();
    renderSyncStatus();
    renderPet();
  }

  function showView(v) {
    if (!["practice", "review", "progress", "settings"].includes(v)) v = "practice";
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + v));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    if (v === "progress") { renderProgress(); renderKhawla(); renderActivity(); }
    if (v === "settings") renderSettings();
    if (v === "review") renderReview();
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.scrollTo(0, 0);
    if (keyWallPaused && v !== "settings") {
      keyWallPaused = false;
      refreshKeyWall(true);
    }
  }
  const viewFromHash = () => (["practice", "review", "progress", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "practice");

  function showSentence(id) {
    if (mode === "free") mode = "path";
    currentId = id;
    const hit = L.findSentence(units(), id);
    progress.cursor = { sentenceId: id, unitId: hit ? hit.unit.id : (progress.cursor && progress.cursor.unitId), at: Date.now() };
    progress.updatedAt = Date.now();
    saveProgress(session, progress);
    schedulePush();
    hideResult();
    renderPractice();
    renderHeader();
  }

  function goWeiter() {
    if (mode === "review" || mode === "drill") {
      const i = queue.indexOf(currentId);
      const next = queue[i + 1];
      if (next) { showSentence(next); return; }
      toast(mode === "review" ? tr("toast.reviewDone") : tr("toast.drillDone"));
      mode = "path";
      queue = [];
    }
    const id = L.nextUpId(units(), progress, mode === "free" ? null : currentId, isAdmin(), Date.now(), passFor());
    if (!id || id === currentId) { toast(tr("toast.upToDate")); return; }
    const list = units();
    const idx = list.findIndex((u) => (u.sentences || []).some((s) => s.id === id));
    if (idx >= 0 && !isAdmin() && !L.isUnlocked(idx, list, progress, passFor())) {
      showLock(idx);
      return;
    }
    mode = "path";
    showSentence(id);
    $("#sentenceCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function recordAttempt(c, score, demo, sounds) {
    const now = Date.now();
    const id = (crypto.randomUUID && crypto.randomUUID()) || ("att-" + now + "-" + Math.random().toString(16).slice(2));
    const dev = currentDevice();
    progress.attempts.push({ id, sentenceId: c.id, text: c.de, score, at: now, demo: !!demo, sounds: sounds || [], deviceId: dev.id, label: dev.label });
    if (progress.attempts.length > L.ATTEMPT_CAP) progress.attempts = progress.attempts.slice(-L.ATTEMPT_CAP);
    const prevScore = L.bestScore(progress, c.id);
    if (prevScore == null || score > prevScore) progress.best[c.id] = { score, at: now };
    progress.reviews[c.id] = L.scheduleReview(progress.reviews[c.id], score, now, marksFor());
    progress.updatedAt = now;
    progress.cursor = { sentenceId: c.id, unitId: c.unit ? c.unit.id : null, at: now };
    saveProgress(session, progress);
    schedulePush();
    if (session === "khawla" && !demo) activityEvent("attempt", { score });
    const prevStars = prevScore == null ? 0 : starsFor(prevScore);
    return { newStars: Math.max(0, starsFor(score) - prevStars), improved: prevScore != null && score > prevScore };
  }

  /* ---------------- Azure ---------------- */
  let sdkPromise;
  function loadSdk() {
    if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "vendor/speech-sdk-1.52.0.min.js";
        s.onload = () => (window.SpeechSDK ? res(window.SpeechSDK) : rej(new Error(tr("err.sdk"))));
        s.onerror = () => { sdkPromise = null; rej(new Error(tr("err.sdk"))); };
        document.head.appendChild(s);
      });
    }
    return sdkPromise;
  }
  function speechConfig(sdk) {
    return sdk.SpeechConfig.fromSubscription(settings.key.trim(), settings.region.trim().toLowerCase());
  }
  const ttsCache = new Map();
  let currentAudio = null;
  function azureTts(text, slow) {
    const ck = `${settings.voice}|${slow ? 1 : 0}|${text}`;
    if (ttsCache.has(ck)) return Promise.resolve(ttsCache.get(ck));
    return loadSdk().then((sdk) => new Promise((resolve, reject) => {
      const cfg = speechConfig(sdk);
      cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      const synth = new sdk.SpeechSynthesizer(cfg, null);
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE"><voice name="${settings.voice}"><prosody rate="${slow ? "-30%" : "0%"}">${escXml(text)}</prosody></voice></speak>`;
      synth.speakSsmlAsync(ssml, (r) => {
        synth.close();
        if (r.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const url = URL.createObjectURL(new Blob([r.audioData], { type: "audio/mpeg" }));
          ttsCache.set(ck, url);
          resolve(url);
        } else reject(new Error(r.errorDetails || "TTS failed"));
      }, (e) => { synth.close(); reject(new Error(e)); });
    }));
  }
  function browserTts(text, slow) {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window)) return reject(new Error(tr("err.noTts")));
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE";
      u.rate = slow ? 0.7 : 0.95;
      const voices = speechSynthesis.getVoices().filter((v) => /^de(-|_|$)/i.test(v.lang));
      u.voice = voices.find((v) => /google/i.test(v.name)) || voices.find((v) => /de-DE/i.test(v.lang)) || voices[0] || null;
      u.onend = resolve;
      u.onerror = (e) => reject(new Error(e.error || "speechSynthesis error"));
      speechSynthesis.speak(u);
    });
  }
  async function speak(text, slow, btn) {
    if (!text) return;
    if (btn) btn.disabled = true;
    try {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      if (hasKey()) {
        try {
          const url = await azureTts(text, slow);
          currentAudio = new Audio(url);
          await currentAudio.play();
          return;
        } catch (e) {
          console.warn("Azure TTS failed, using browser voice:", e);
          toast(tr("toast.ttsFallback"));
        }
      }
      await browserTts(text, slow);
    } catch (e) {
      console.warn(e);
      toast(tr("toast.audio"));
    } finally { if (btn) btn.disabled = false; }
  }

  let state = "idle";
  let activeRecognizer = null;
  let holdId = 0;
  let holding = false;
  let holdPointer = null;
  let pressAt = 0;
  let heardAt = 0;
  let audioFlowing = false;
  let wantStop = false;
  let tailTimer = 0;
  let capTimer = 0;
  let tickTimer = 0;
  let micStream = null;
  let micCtx = null;
  let micSource = null;
  let micNode = null;
  let micMute = null;
  let pushStream = null;
  let pendingPcm = [];
  let holdSentence = null;
  let peakRms = 0;
  let azureReady = Promise.resolve();
  const HOLD_TAP_MS = 400;
  const HOLD_TAIL_MS = 300;
  const HOLD_MAX_MS = 60000;
  function setState(s, status, hint) {
    state = s;
    document.body.classList.toggle("listening", s === "listening");
    document.body.classList.toggle("thinking", s === "thinking");
    if (status != null) $("#status").textContent = status;
    if (hint != null) $("#hint").textContent = hint;
    $("#recordBtn").setAttribute("aria-label", s === "listening" ? tr("record.stop") : tr("record.aria"));
    const meta = $("#recMeta");
    if (meta) meta.hidden = s !== "listening";
    setMood(s === "listening" ? "listen" : null);
  }
  function fmtHold(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function tickHold() {
    const start = heardAt || pressAt;
    if ($("#recTimer")) $("#recTimer").textContent = fmtHold(Date.now() - start);
  }
  function setLevel(float32) {
    if (!float32 || !float32.length) return;
    let sum = 0;
    for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
    const rms = Math.sqrt(sum / float32.length);
    if (rms > peakRms) peakRms = rms;
    const fill = $("#recLevelFill");
    if (fill) fill.style.width = Math.max(4, Math.min(100, Math.round(rms * 340))) + "%";
  }
  const SPEECH_REGIONS = new Set(["northeurope", "westeurope", "germanywestcentral", "francecentral", "swedencentral", "norwayeast", "switzerlandnorth", "uksouth", "ukwest", "eastus", "eastus2", "westus", "westus2", "westus3", "centralus", "southcentralus", "northcentralus", "canadacentral", "brazilsouth", "centralindia", "southindia", "southeastasia", "eastasia", "japaneast", "japanwest", "koreacentral", "australiaeast", "uaenorth", "southafricanorth"]);
  const KEY_OK_MS = 10 * 60 * 1000;
  const LS_KEYOK = "aussprache.keyok.v1";
  let keyWallKind = "";
  let keyWallPaused = false;
  let keyWallErrorCode = "";
  let keyWallRaw = "";
  let keyCheckSeq = 0;
  function keyFp() {
    const raw = String(settings.key || "").trim() + "\n" + String(settings.region || "").trim().toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function cachedKeyOk() {
    const v = loadRaw(LS_KEYOK, null);
    return !!(v && v.fp === keyFp() && Date.now() - v.at < KEY_OK_MS);
  }
  function rememberKeyOk() { saveRaw(LS_KEYOK, { fp: keyFp(), at: Date.now() }); }
  function forgetKeyOk() { try { localStorage.removeItem(LS_KEYOK); } catch {} }
  function renderKeyWall() {
    const el = $("#keyWall");
    if (!el) return;
    const show = keyWallKind === "bad" || keyWallKind === "offline";
    el.hidden = !show;
    el.classList.toggle("offline", keyWallKind === "offline");
    const title = $("#keyWallTitle");
    const body = $("#keyWallBody");
    if (title) title.textContent = tr(keyWallKind === "offline" ? "keywall.offlineTitle" : "keywall.title");
    if (body) body.textContent = tr(keyWallKind === "offline" ? "keywall.offlineBody" : "keywall.body");
    const again = $("#keyWallAgain");
    if (again) again.textContent = tr("keywall.again");
    const settingsBtn = $("#keyWallSettings");
    if (settingsBtn) {
      settingsBtn.hidden = keyWallKind !== "bad" || !isAdmin();
      settingsBtn.textContent = tr("keywall.settings");
    }
    const err = $("#keyWallError");
    if (err) err.textContent = keyWallErrorCode ? tr(keyWallErrorCode) : "";
    const eye = $("#keyWallEye");
    const keyInput = $("#keyWallKey");
    if (eye && keyInput) {
      const shown = keyInput.classList.contains("revealed");
      eye.setAttribute("aria-label", tr(shown ? "keywall.hide" : "key.show"));
      eye.setAttribute("aria-pressed", shown ? "true" : "false");
    }
    const regionInput = $("#keyWallRegion");
    if (regionInput && document.activeElement !== regionInput && !regionInput.value.trim()) {
      regionInput.value = (settings.region || "northeurope").trim().toLowerCase() || "northeurope";
    }
  }
  function setKeyWallError(code) {
    keyWallErrorCode = code || "";
    const err = $("#keyWallError");
    if (err) err.textContent = keyWallErrorCode ? tr(keyWallErrorCode) : "";
  }
  function openKeyWall(kind) {
    keyWallPaused = false;
    keyWallErrorCode = "";
    keyWallKind = kind === "offline" ? "offline" : "bad";
    const mascot = $("#keyWallMascot");
    if (mascot) {
      mascot.classList.remove("happy");
      mascot.classList.add("worried");
    }
    if (guideOpen) {
      guideOpen = false;
      clearTimeout(guideTimer);
      const layer = $("#guide");
      if (layer) layer.hidden = true;
    }
    renderKeyWall();
  }
  function closeKeyWall() {
    const was = keyWallKind;
    keyWallKind = "";
    renderKeyWall();
    if (was) maybeStartGuide();
  }
  function keyWallErrorFor(status) {
    if (status === "quota") return "keywall.errQuota";
    if (status === "region") return "keywall.errRegion";
    if (status === "offline") return "keywall.errOffline";
    if (status === "bad") return "keywall.errKey";
    return "";
  }
  async function probeSpeechKey(force) {
    if (!hasKey()) { forgetKeyOk(); return "missing"; }
    const region = String(settings.region || "").trim().toLowerCase();
    if (!SPEECH_REGIONS.has(region)) { forgetKeyOk(); return "region"; }
    if (!force && cachedKeyOk()) return "ok";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("https://" + region + ".api.cognitive.microsoft.com/sts/v1.0/issueToken", {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": String(settings.key).trim(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
        signal: ctrl.signal,
      });
      if (res.ok) { rememberKeyOk(); return "ok"; }
      forgetKeyOk();
      if (res.status === 429) return "quota";
      if (res.status === 404) return "region";
      if (res.status >= 500) return "offline";
      return "bad";
    } catch (e) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
      if (!SPEECH_REGIONS.has(region)) return "region";
      return "offline";
    } finally { clearTimeout(timer); }
  }
  async function refreshKeyWall(force) {
    const seq = ++keyCheckSeq;
    const status = await probeSpeechKey(!!force);
    if (seq !== keyCheckSeq || !session) return status;
    if (status === "ok") {
      setKeyWallError("");
      closeKeyWall();
    } else {
      openKeyWall(status === "offline" ? "offline" : "bad");
      setKeyWallError(keyWallErrorFor(status));
    }
    return status;
  }
  async function pasteWallKey() {
    const input = $("#keyWallKey");
    if (!input) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("clipboard");
      const text = await navigator.clipboard.readText();
      if (text) {
        keyWallRaw = text;
        input.value = text;
      }
      input.focus();
      setKeyWallError("");
    } catch (e) {
      input.focus();
      setKeyWallError("keywall.pasteHint");
    }
  }
  async function saveWallKey() {
    const input = $("#keyWallKey");
    const saveBtn = $("#keyWallSave");
    if (!input || !saveBtn) return;
    const visible = input.value;
    const rawPaste = keyWallRaw.replace(/\r\n/g, "\n");
    const flatPaste = rawPaste.replace(/\n/g, "");
    const raw = rawPaste && (visible.replace(/\r\n/g, "\n") === rawPaste || visible.replace(/\r?\n/g, "") === flatPaste) ? rawPaste : visible;
    const extracted = L.extractSpeechKey(raw);
    if (!extracted) {
      setKeyWallError(String(raw || "").trim() ? "keywall.errShape" : "keywall.errEmpty");
      return;
    }
    const advanced = $("#keyWallAdvanced");
    const regionInput = $("#keyWallRegion");
    const typedRegion = regionInput ? regionInput.value.trim().toLowerCase() : "";
    const region = advanced && !advanced.hidden
      ? (typedRegion || "northeurope")
      : ((settings.region && String(settings.region).trim().toLowerCase()) || "northeurope");
    settings.key = extracted;
    settings.region = region;
    saveSettings();
    ttsCache.clear();
    forgetKeyOk();
    const settingsKey = $("#keyInput");
    if (settingsKey) settingsKey.value = settings.key;
    const settingsRegion = $("#regionInput");
    if (settingsRegion) settingsRegion.value = settings.region;
    input.value = extracted;
    saveBtn.disabled = true;
    const seq = ++keyCheckSeq;
    try {
      const status = await probeSpeechKey(true);
      if (seq !== keyCheckSeq || !session) return;
      if (status === "ok") {
        setKeyWallError("");
        keyWallRaw = "";
        input.value = "";
        const mascot = $("#keyWallMascot");
        if (mascot) {
          mascot.classList.remove("worried");
          mascot.classList.add("happy");
        }
        confetti(140);
        floatEmojis(["💛", "🐹", "✨", "💖"]);
        await sleep(700);
        if (seq !== keyCheckSeq) return;
        closeKeyWall();
        capyCheer();
        return;
      }
      openKeyWall(status === "offline" ? "offline" : "bad");
      setKeyWallError(keyWallErrorFor(status));
    } finally {
      saveBtn.disabled = false;
    }
  }
  function showSetupNeeded() {
    openKeyWall("bad");
    setState("idle", tr("status.tap"), "");
  }
  function showSilence() {
    setState("idle", tr("status.tap"), tr("err.heardNothing"));
  }
  function downsample(buffer, fromRate, toRate) {
    if (!buffer || fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const len = Math.max(0, Math.floor(buffer.length / ratio));
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      let n = 0;
      for (let j = start; j < end; j++) { sum += buffer[j]; n++; }
      out[i] = n ? sum / n : 0;
    }
    return out;
  }
  function floatTo16(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  function stopMicGraph() {
    if (micNode) { try { micNode.disconnect(); } catch {} micNode.onaudioprocess = null; micNode = null; }
    if (micSource) { try { micSource.disconnect(); } catch {} micSource = null; }
    if (micMute) { try { micMute.disconnect(); } catch {} micMute = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (pushStream) { try { pushStream.close(); } catch {} pushStream = null; }
    pendingPcm = [];
    if (activeRecognizer) {
      const rec = activeRecognizer;
      activeRecognizer = null;
      try { rec.close(); } catch {}
    }
  }
  function resetHoldTimers() {
    clearTimeout(tailTimer);
    clearTimeout(capTimer);
    clearInterval(tickTimer);
    tailTimer = capTimer = tickTimer = 0;
  }
  function abortHold(kind) {
    holdId++;
    holding = false;
    wantStop = false;
    audioFlowing = false;
    holdPointer = null;
    resetHoldTimers();
    stopMicGraph();
    if (kind === "short") setState("idle", tr("status.tap"), tr("hint.tapShort"));
    else if (kind === "cancel") setState("idle", tr("status.cancel"), tr("hint.cancel"));
    else setState("idle", tr("status.tap"), tr("hint.ready"));
  }
  function markFlowing(id) {
    if (id !== holdId || audioFlowing) return;
    audioFlowing = true;
    heardAt = Date.now();
    setState("listening", tr("status.listen"), tr("hint.speakNow"));
    tickHold();
    clearInterval(tickTimer);
    tickTimer = setInterval(tickHold, 200);
    if (wantStop) {
      clearTimeout(tailTimer);
      tailTimer = setTimeout(() => finishHold(id), HOLD_TAIL_MS);
    }
  }
  function beginHold(pointerId) {
    if ($("#app").hidden || guideOpen || keyWallKind || state === "thinking" || holding) return;
    if (!hasKey()) { showSetupNeeded(); return; }
    if (typeof pointerId === "number") {
      try { $("#recordBtn").setPointerCapture(pointerId); } catch {}
    }
    const c = current();
    if (!c.de || !c.id) { toast(tr("toast.pick")); return; }
    const id = ++holdId;
    holding = true;
    wantStop = false;
    audioFlowing = false;
    heardAt = 0;
    holdPointer = pointerId;
    pressAt = Date.now();
    holdSentence = c;
    pendingPcm = [];
    peakRms = 0;
    azureReady = Promise.resolve();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!micCtx) micCtx = new AC();
      if (micCtx.state === "suspended") micCtx.resume().catch(() => {});
    }
    clearTimeout(capTimer);
    capTimer = setTimeout(() => finishHold(id), HOLD_MAX_MS);
    const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      : Promise.reject(new Error("mic-none"));
    gum.then((stream) => {
      if (id !== holdId) { stream.getTracks().forEach((t) => t.stop()); return; }
      micStream = stream;
      wireMeter(id, stream);
      azureReady = startAzure(id, c.de);
      return azureReady;
    }).catch((e) => {
      if (id !== holdId) return;
      console.warn(e);
      abortHold();
      setState("idle", tr("status.oh"), friendlyError(e));
    });
  }
  function wireMeter(id, stream) {
    if (!micCtx) { markFlowing(id); return; }
    try {
      micSource = micCtx.createMediaStreamSource(stream);
      const size = 2048;
      micNode = micCtx.createScriptProcessor(size, 1, 1);
      micMute = micCtx.createGain();
      micMute.gain.value = 0;
      micNode.onaudioprocess = (ev) => {
        if (id !== holdId) return;
        const data = ev.inputBuffer.getChannelData(0);
        setLevel(data);
        markFlowing(id);
        const down = downsample(data, ev.inputBuffer.sampleRate || micCtx.sampleRate || 48000, 16000);
        if (down && down.length) {
          const pcm = floatTo16(down);
          const copy = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
          if (pushStream) pushStream.write(copy);
          else if (pendingPcm.length < 400) pendingPcm.push(copy);
        }
      };
      micSource.connect(micNode);
      micNode.connect(micMute);
      micMute.connect(micCtx.destination);
    } catch (e) {
      console.warn(e);
      markFlowing(id);
    }
  }
  function endHold() {
    if (!holding) return;
    holding = false;
    holdPointer = null;
    const elapsed = Date.now() - pressAt;
    if (!audioFlowing && elapsed < HOLD_TAP_MS) { abortHold("short"); return; }
    wantStop = true;
    if (audioFlowing) {
      clearTimeout(tailTimer);
      tailTimer = setTimeout(() => finishHold(holdId), HOLD_TAIL_MS);
    }
  }
  async function finishHold(id) {
    if (id !== holdId || state === "thinking") return;
    const c = holdSentence || current();
    wantStop = false;
    holding = false;
    resetHoldTimers();
    if (!hasKey()) {
      showSetupNeeded();
      audioFlowing = false;
      stopMicGraph();
      return;
    }
    if (peakRms < L.SPEECH_RMS) {
      showSilence();
      audioFlowing = false;
      stopMicGraph();
      return;
    }
    setState("thinking", tr("status.scoring"), tr("hint.moment"));
    try {
      await azureReady;
      if (id !== holdId) return;
      const rec = activeRecognizer;
      if (micNode) { micNode.onaudioprocess = null; try { micNode.disconnect(); } catch {} micNode = null; }
      if (pushStream) { try { pushStream.close(); } catch {} pushStream = null; }
      const result = await collectAzure(id, rec);
      if (id !== holdId || !result) return;
      if (L.noSpeech(result)) { showSilence(); return; }
      const scored = L.finalScore(result, L.effectiveStrictness(progress, session));
      if (!scored) { showSilence(); return; }
      result.scores = Object.assign({}, result.scores, scored);
      result.demo = false;
      setState("idle", tr("status.tap"), tr("status.again"));
      showResult(c, result);
    } catch (e) {
      if (id !== holdId) return;
      const msg = String((e && e.message) || e);
      if (/NoMatch|heard nothing|nichts gehört/i.test(msg)) { showSilence(); return; }
      if (/429|quota|Too Many Requests|401|403|unauthori|forbidden|authentication|invalid subscription/i.test(msg)) {
        forgetKeyOk();
        setState("idle", tr("status.tap"), "");
        openKeyWall("bad");
        return;
      }
      if (/1006|Unable to contact server|ConnectionFailure|Failed to fetch|offline|network/i.test(msg)) {
        setState("idle", tr("status.tap"), "");
        openKeyWall("offline");
        return;
      }
      console.warn(e);
      setState("idle", tr("status.oh"), friendlyError(e));
    } finally {
      if (id === holdId) {
        audioFlowing = false;
        stopMicGraph();
      }
    }
  }
  function bindHold() {
    const btn = $("#recordBtn");
    const down = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();
      beginHold(e.pointerId);
    };
    const up = (e) => {
      if (holdPointer != null && e.pointerId !== holdPointer) return;
      endHold();
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", (e) => {
      if (holdPointer == null || e.pointerId !== holdPointer) return;
      let captured = false;
      try { captured = btn.hasPointerCapture(e.pointerId); } catch {}
      if (!captured) endHold();
    });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("selectstart", (e) => e.preventDefault());
    document.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && t.closest && t.id !== "recordBtn" && t.closest("button, a, input, textarea, select")) return;
      if ($("#app").hidden || guideOpen) return;
      e.preventDefault();
      beginHold("key");
    });
    document.addEventListener("keyup", (e) => { if (e.code === "Space") endHold(); });
  }
  function friendlyError(e) {
    const m = String((e && e.message) || e);
    if (/secure|https/i.test(m)) return tr("err.https");
    if (/NotAllowed|Permission|denied/i.test(m)) return tr("err.micDenied");
    if (/NotFound|no.*device|mic-none/i.test(m)) return tr("err.micNone");
    if (/429|quota|Too Many Requests/i.test(m)) return tr("err.quota");
    if (/1006|Unable to contact server|ConnectionFailure/i.test(m)) return tr("err.azureNet");
    if (/401|403|unauthori|forbidden|authentication|invalid subscription/i.test(m)) return tr("err.azureAuth");
    if (/nichts gehört|NoMatch|heard nothing/i.test(m)) return tr("err.heardNothing");
    return m.length < 160 ? m : tr("err.generic");
  }
  function wordsFromAzureJson(json, heard) {
    const best = (json.NBest && json.NBest[0]) || {};
    const pa = best.PronunciationAssessment || {};
    const words = (best.Words || []).map((w) => {
      const wpa = w.PronunciationAssessment || {};
      const error = wpa.ErrorType || "None";
      const phonemes = (w.Phonemes || []).map((p) => ({ p: p.Phoneme || "", score: round(p.PronunciationAssessment ? p.PronunciationAssessment.AccuracyScore : p.AccuracyScore) }));
      if (phonemes.length && phonemes.every((p) => !p.p)) {
        const guess = g2p(w.Word || "");
        if (guess.length === phonemes.length) phonemes.forEach((p, i) => (p.p = guess[i]));
      }
      return { word: w.Word || "", score: round(wpa.AccuracyScore ?? 0), error, phonemes };
    });
    return {
      heard: heard || best.Display || "",
      fluency: round(pa.FluencyScore),
      prosody: round(pa.ProsodyScore),
      words,
    };
  }
  async function startAzure(id, referenceText) {
    const sdk = await loadSdk();
    if (id !== holdId) return;
    const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    pushStream = sdk.AudioInputStream.createPushStream(format);
    pendingPcm.forEach((buf) => { try { pushStream.write(buf); } catch {} });
    pendingPcm = [];
    const cfg = speechConfig(sdk);
    cfg.speechRecognitionLanguage = "de-DE";
    cfg.outputFormat = sdk.OutputFormat.Detailed;
    // Segmentation silence must be 100–5000 ms. Push-to-talk ends on release, so the other silence timeouts stay at the service defaults.
    cfg.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "5000");
    const audio = sdk.AudioConfig.fromStreamInput(pushStream);
    const pa = new sdk.PronunciationAssessmentConfig(referenceText, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true);
    pa.phonemeAlphabet = "IPA";
    const rec = new sdk.SpeechRecognizer(cfg, audio);
    pa.applyTo(rec);
    rec._segments = [];
    rec._done = new Promise((resolve) => { rec._resolveDone = resolve; });
    rec.recognized = (_, e) => {
      if (!e.result || e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      let json = {};
      try { json = JSON.parse(e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) || "{}"); } catch {}
      rec._segments.push(wordsFromAzureJson(json, e.result.text));
    };
    rec.canceled = (_, e) => {
      if (e.reason === sdk.CancellationReason.Error) rec._error = new Error(`${e.errorCode || ""} ${e.errorDetails || ""}`.trim());
    };
    rec.sessionStopped = () => { if (rec._resolveDone) rec._resolveDone(); };
    activeRecognizer = rec;
    await new Promise((resolve, reject) => rec.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(err))));
  }
  async function collectAzure(id, rec) {
    if (!rec) throw new Error("NoMatch");
    await new Promise((resolve, reject) => {
      try { rec.stopContinuousRecognitionAsync(resolve, (err) => reject(new Error(err))); }
      catch (e) { reject(e); }
    });
    if (id !== holdId) return null;
    await Promise.race([rec._done || Promise.resolve(), sleep(8000)]);
    if (rec._error) throw rec._error;
    const reference = (holdSentence && holdSentence.de) || "";
    const merged = L.mergeUtterance(reference, rec._segments || []);
    if (L.noSpeech(merged)) throw new Error("NoMatch");
    return { demo: false, heard: merged.heard, scores: merged.scores, words: merged.words };
  }

  const G2P = [
    [/^tsch/, "tʃ"], [/^sch/, "ʃ"], [/^ch/, null], [/^ei|^ai|^ey/, "aɪ"], [/^eu|^äu/, "ɔʏ"], [/^au/, "aʊ"], [/^ie/, "iː"],
    [/^ng/, "ŋ"], [/^nk/, "ŋk"], [/^pf/, "pf"], [/^qu/, "kv"], [/^tz|^z/, "ts"], [/^ß|^ss/, "s"], [/^ck/, "k"],
    [/^ph/, "f"], [/^th/, "t"], [/^w/, "v"], [/^v/, "f"], [/^ä/, "ɛ"], [/^ö/, "ø"], [/^ü|^y/, "y"], [/^j/, "j"],
    [/^r/, "ʁ"], [/^x/, "ks"], [/^c/, "k"], [/^s(?=[aeiouäöü])/, "z"], [/^[a-z]/, "*"],
  ];
  function g2p(word) {
    let w = word.toLowerCase().replace(/[^a-zäöüß]/g, "");
    const out = [];
    let i = 0, prev = "";
    if (/^s[pt]/.test(w)) { out.push("ʃ"); w = w.slice(1); }
    while (w.length) {
      if (w === "er" && out.length) { out.push("ɐ"); break; }
      if (w === "e" && out.length) { out.push("ə"); break; }
      if (w === "r" && out.length) { out.push("ɐ"); break; }
      if (/^er(?![aeiouäöüh])/.test(w)) {
        const firstVowel = !out.some((x) => /[aeiouyøɛɔʊɪə]/.test(x));
        if (firstVowel) out.push("eː", "ɐ"); else if (out.length) out.push("ɐ"); else out.push("ɛ", "ʁ");
        w = w.slice(2); prev = "r"; continue;
      }
      if (/^h/.test(w) && /[aeiouäöü]/.test(prev)) { if (out.length) out[out.length - 1] += "ː"; w = w.slice(1); continue; }
      let matched = false;
      for (const [re, ph] of G2P) {
        const m = w.match(re);
        if (!m) continue;
        let sym = ph;
        if (sym === null) sym = /[aou]$/.test(prev) ? "x" : "ç";
        if (sym === "*") sym = m[0];
        if (!(out.length && out[out.length - 1] === sym && !/[aeiou]/.test(sym))) out.push(sym);
        prev = m[0].slice(-1);
        w = w.slice(m[0].length);
        matched = true;
        break;
      }
      if (!matched) w = w.slice(1);
      if (++i > 40) break;
    }
    return out;
  }
  const MESSAGES = [
    [90, "msg.90a", "msg.90b"],
    [80, "msg.80a", "msg.80b"],
    [70, "msg.70a", "msg.70b"],
    [60, "msg.60a", "msg.60b"],
    [0, "msg.0a", "msg.0b"],
  ];
  let lastResult = null;
  function showResult(c, res) {
    lastResult = res;
    const s = res.scores;
    const pron = s.pron ?? s.accuracy ?? 0;
    const sounds = L.soundSamples(c.de, res.words, pron, window.SOUND_PATTERNS || []);
    if (res.demo) return;
    const { newStars, improved } = recordAttempt(c, pron, false, sounds);
    const st = starsFor(pron);
    $("#emptyCard").hidden = true;
    const card = $("#resultCard");
    card.hidden = false;
    const ring = $("#scoreRing");
    ring.style.setProperty("--c", `var(--${band(pron)})`);
    ring.style.setProperty("--p", 0);
    animateNumber($("#pronScore"), pron);
    let p = 0;
    const step = () => { p = Math.min(pron, p + 3); ring.style.setProperty("--p", p); if (p < pron) requestAnimationFrame(step); };
    step();
    $("#earnedStars").textContent = st ? "⭐".repeat(st) + (st < 3 ? "☆".repeat(3 - st) : "") : "🌱";
    const [, aKey, bKey] = MESSAGES.find(([min]) => pron >= min);
    const primary = pick([aKey, bKey]);
    const other = primary === aKey ? bKey : aKey;
    const otherLang = uiLang === "en" ? "de" : "en";
    const weakest = res.words.filter((w) => w.error !== "Insertion" && w.error !== "Omission").sort((a, b) => a.score - b.score)[0];
    $("#msgDe").textContent = tr(primary) + (improved ? " " + tr("result.record") : "") + (weakest && weakest.score < passFor() ? tr("result.tip", { word: weakest.word }) : "");
    $("#msgEn").textContent = trIn(otherLang, other);
    const bars = $("#bars");
    bars.innerHTML = "";
    [["accuracy", "bar.accuracy"], ["fluency", "bar.fluency"], ["completeness", "bar.completeness"], ["prosody", "bar.prosody"]].forEach(([k, labelKey]) => {
      const v = s[k];
      const el = document.createElement("div");
      el.className = "bar" + (v == null ? " na" : "");
      el.innerHTML = `<span class="name"></span><span class="val"></span><div class="track"><div class="fill"></div></div>`;
      el.querySelector(".name").textContent = tr(labelKey);
      el.querySelector(".val").textContent = v == null ? "n/a" : String(v);
      bars.appendChild(el);
      if (v != null) {
        const f = el.querySelector(".fill");
        f.style.background = `var(--${band(v)})`;
        requestAnimationFrame(() => requestAnimationFrame(() => (f.style.width = v + "%")));
      }
    });
    const wrap = $("#words");
    wrap.innerHTML = "";
    res.words.forEach((w) => {
      const b = document.createElement("button");
      b.type = "button";
      const cls = w.error === "Omission" ? "miss" : w.error === "Insertion" ? "ins" : band(w.score);
      b.className = "word " + cls;
      b.lang = "de";
      b.append(document.createTextNode(w.word));
      const sm = document.createElement("small");
      sm.textContent = w.error === "Omission" ? "–" : w.error === "Insertion" ? "+" : w.score;
      b.appendChild(sm);
      b.onclick = () => openSheet(w);
      wrap.appendChild(b);
    });
    $("#heard").textContent = res.heard ? tr(res.demo ? "heard.demo" : "heard.live", { text: res.heard }) : "";
    if (st >= 2 || newStars > 0) {
      setMood("happy");
      confetti(st >= 3 ? 140 : 80);
      floatEmojis(st >= 3 ? ["🌟", "🐹", "🐝", "💖"] : ["⭐", "🐝"]);
    } else if (st >= 1) setMood("happy");
    if (pron >= 80) capyCheer();
    const rev = progress.reviews[c.id];
    if (rev && rev.due) {
      const when = new Date(rev.due);
      $("#hint").textContent = rev.mastered
        ? tr("review.whenMaster")
        : tr("review.when", { when: when.toLocaleDateString() });
    }
    if (window.innerWidth < 900) card.scrollIntoView({ behavior: "smooth", block: "start" });
    renderHeader();
    renderPractice();
  }
  function animateNumber(el, to) {
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  let sheetWord = null;
  function openSheet(w) {
    sheetWord = w;
    $("#sheetWord").textContent = w.word;
    const sc = $("#sheetScore");
    sc.textContent = w.error === "Omission" ? tr("sheet.omitted") : w.error === "Insertion" ? tr("sheet.extra") : `${w.score} / 100`;
    const errText = {
      None: w.score >= 80 ? tr("sheet.good") : tr("sheet.look"),
      Mispronunciation: tr("sheet.mis"),
      Omission: tr("sheet.miss"),
      Insertion: tr("sheet.ins"),
    };
    $("#sheetError").textContent = errText[w.error] || w.error || "";
    const ph = $("#phonemes");
    ph.innerHTML = "";
    if (!w.phonemes.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = tr("sheet.none");
      ph.appendChild(p);
    }
    w.phonemes.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "ph " + band(p.score ?? 0);
      const b = document.createElement("b");
      b.textContent = p.p ? `/${p.p}/` : tr("sheet.sound", { n: i + 1 });
      const sm = document.createElement("small");
      sm.textContent = p.score ?? "–";
      d.append(b, sm);
      ph.appendChild(d);
    });
    $("#sheet").hidden = false;
    $("#sheetBackdrop").hidden = false;
  }
  function closeSheet() { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; }

  function confetti(n = 100) {
    const cv = $("#confetti");
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ["#ff9fc0", "#f06d9b", "#ffc93c", "#5cc8a0", "#9b87f5", "#8fd3ff"];
    const parts = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4, r: 4 + Math.random() * 5,
      c: pick(colors), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, shape: Math.random() < 0.3 ? "c" : "r",
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        if (p.shape === "c") { ctx.beginPath(); ctx.arc(0, 0, p.r / 1.4, 0, 7); ctx.fill(); } else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      });
      if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function floatEmojis(list) {
    for (let i = 0; i < 8; i++) {
      const e = document.createElement("span");
      e.className = "float-emoji";
      e.textContent = pick(list);
      e.style.left = 8 + Math.random() * 80 + "vw";
      e.style.top = 30 + Math.random() * 40 + "vh";
      e.style.animationDelay = i * 0.08 + "s";
      document.body.appendChild(e);
      setTimeout(() => e.remove(), 2200);
    }
  }

  /* ---------------- sync ---------------- */
  let fbAuth = null, fbDb = null, fbReady = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const abs = new URL(src, location.href).href;
      if ([...document.scripts].some((s) => s.src === abs)) { res(); return; }
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => res();
      el.onerror = () => rej(new Error(tr("err.firebaseScript")));
      document.head.appendChild(el);
    });
  }
  async function ensureFirebase() {
    if (!firebaseConfigured()) throw new Error(tr("err.syncOff"));
    if (fbDb) return;
    if (!fbReady) {
      fbReady = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
        await loadScript(base + "firebase-app-compat.js");
        await loadScript(base + "firebase-auth-compat.js");
        await loadScript(base + "firebase-firestore-compat.js");
        const cfg = settings.firebase;
        if (!firebase.apps.length) {
          firebase.initializeApp({ apiKey: cfg.apiKey.trim(), authDomain: cfg.authDomain.trim(), projectId: cfg.projectId.trim(), appId: cfg.appId.trim() });
        }
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();
      })().catch((e) => { fbReady = null; throw e; });
    }
    await fbReady;
  }
  async function signInRole(role) {
    await ensureFirebase();
    const email = EMAIL[role];
    if (fbAuth.currentUser && fbAuth.currentUser.email === email) return;
    if (fbAuth.currentUser) await fbAuth.signOut();
    await fbAuth.signInWithEmailAndPassword(email, settings.syncPassword);
  }
  function authRole() { return session === "farouk" ? "farouk" : "khawla"; }
  async function fetchRemote(userId) {
    await signInRole(authRole());
    const snap = await fbDb.collection("users").doc(userId).get();
    return snap.exists ? snap.data() : null;
  }
  function progressPayload(prog) {
    const src = prog || L.emptyProgress();
    return JSON.parse(JSON.stringify({
      schema: 2,
      best: src.best || {},
      attempts: src.attempts || [],
      reviews: src.reviews || {},
      cursor: src.cursor || null,
      showTrans: src.showTrans || { value: true, at: 0 },
      pet: L.readPet(src),
      uiLang: L.readUiLang(src),
      strictness: L.readStrictness(src),
      guide: L.readGuide(src),
      clearedAt: src.clearedAt || 0,
      updatedAt: Date.now(),
    }));
  }
  function liveProgress(userId) {
    return userId === session ? progress : null;
  }
  function settleLocal(userId, remote) {
    const settled = L.mergeProgress(L.mergeProgress(loadProgress(userId), liveProgress(userId)), remote);
    saveProgress(userId, settled);
    if (userId === session) progress = L.mergeProgress(progress, loadProgress(userId));
    if (userId === session && L.contentKey(progress) !== L.contentKey(loadProgress(userId))) saveProgress(userId, progress);
    return userId === session ? progress : loadProgress(userId);
  }
  function setSyncMeta(user, patch) {
    const all = loadRaw(LS_SYNC, {}) || {};
    all[user] = Object.assign({}, all[user] || {}, patch);
    saveRaw(LS_SYNC, all);
  }
  function friendlySync(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email/i.test(m)) return tr("err.syncLogin");
    if (/permission-denied/i.test(m)) return tr("err.syncRules");
    if (/offline|network|unavailable|Failed to get/i.test(m)) return tr("err.syncNet");
    return m.slice(0, 180);
  }
  async function pullCatalog() {
    const snap = await fbDb.collection("shared").doc("catalog").get();
    const remote = snap.exists ? (snap.data().units || []) : [];
    const merged = L.mergeCatalog(catalog.customUnits, remote);
    const changed = JSON.stringify(merged) !== JSON.stringify(remote);
    catalog.customUnits = merged;
    saveRaw(LS_CATALOG, catalog);
    if (changed && isAdmin()) await fbDb.collection("shared").doc("catalog").set({ units: merged, updatedAt: Date.now() });
  }
  async function pushCatalog() {
    if (!firebaseConfigured() || !isAdmin()) return;
    await signInRole("farouk");
    await pullCatalog();
  }
  async function syncUserBody(userId, applyCursor) {
    await signInRole(authRole());
    const ref = fbDb.collection("users").doc(userId);
    let remoteUpdatedAt = 0;
    for (let pass = 0; pass < 3; pass++) {
      await fbDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const remote = snap.exists ? snap.data() : null;
        const merged = L.mergeProgress(L.mergeProgress(loadProgress(userId), liveProgress(userId)), remote);
        const payload = progressPayload(merged);
        if (!remote || L.contentKey(payload) !== L.contentKey(remote)) tx.set(ref, payload);
      });
      const snap = await ref.get();
      const confirmed = snap.exists ? snap.data() : null;
      const settled = settleLocal(userId, confirmed);
      remoteUpdatedAt = (confirmed && confirmed.updatedAt) || 0;
      if (confirmed && L.contentKey(settled) === L.contentKey(confirmed)) break;
      if (!confirmed && L.contentKey(settled) === L.contentKey(L.emptyProgress())) break;
    }
    if (applyCursor && userId === session && progress.cursor && progress.cursor.sentenceId && L.findSentence(units(), progress.cursor.sentenceId)) {
      currentId = progress.cursor.sentenceId;
    }
    rememberSync(userId, { ok: true, at: Date.now(), remoteUpdatedAt, error: "", errorCode: "" });
  }
  function syncErrorCode(e) {
    const code = e && e.code ? String(e.code) : "";
    if (code) return code.slice(0, 80);
    const m = String((e && e.message) || e || "");
    if (/permission-denied/i.test(m)) return "permission-denied";
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/i.test(m)) return "auth";
    if (/unavailable|offline|network|Failed to get/i.test(m)) return "unavailable";
    return "unknown";
  }
  function rememberSync(userId, patch) {
    const prev = (loadRaw(LS_SYNC, {}) || {})[userId] || {};
    const next = Object.assign({}, prev, patch);
    if (patch.ok) {
      next.lastOk = patch.at;
      next.error = "";
      next.errorCode = "";
      syncRetryN = 0;
      clearTimeout(syncRetryTimer);
    } else if (!next.lastOk && prev.ok && prev.at) next.lastOk = prev.at;
    setSyncMeta(userId, next);
    if (session === "khawla" && userId === "khawla") {
      const dev = currentDevice();
      saveActivity(L.noteDeviceSync(loadActivity(), {
        deviceId: dev.id, label: dev.label, appVersion: APP_VERSION, at: patch.at,
        sync: true, ok: !!patch.ok, error: patch.ok ? "" : (patch.error || ""),
      }));
      pushActivity();
    }
    writeSyncDiag(userId, next).catch(() => {});
    renderSyncStatus();
    if (!patch.ok && userId === session) scheduleSyncRetry();
  }
  function scheduleSyncRetry() {
    if (!session || !firebaseConfigured()) return;
    if (syncRetryN >= SYNC_RETRY_MS.length) return;
    clearTimeout(syncRetryTimer);
    const wait = SYNC_RETRY_MS[syncRetryN];
    syncRetryN += 1;
    syncRetryTimer = setTimeout(() => { syncNow().catch(() => {}); }, wait);
  }
  async function writeSyncDiag(userId, meta) {
    if (!firebaseConfigured() || !session) return;
    await signInRole(authRole());
    const dev = await readyDevice();
    const src = meta || {};
    const state = src.error ? "error" : ((src.ok || src.lastOk) ? "synced" : "notSet");
    const row = {
      state,
      ok: state === "synced",
      error: state === "error" ? String(src.error || "").slice(0, 180) : "",
      errorCode: state === "error" ? String(src.errorCode || "").slice(0, 80) : "",
      at: src.at || Date.now(),
      lastOk: src.lastOk || 0,
      appVersion: APP_VERSION,
      deviceId: dev.id,
      label: dev.label,
    };
    const ref = fbDb.collection("users").doc(userId).collection("meta").doc("syncStatus");
    const patch = { updatedAt: Date.now() };
    patch["devices." + dev.id] = row;
    try {
      await ref.update(patch);
    } catch (e) {
      const code = e && e.code ? String(e.code) : "";
      const missing = code === "not-found" || /No document to update/i.test(String((e && e.message) || ""));
      if (!missing) throw e;
      await ref.set({ devices: { [dev.id]: row }, updatedAt: patch.updatedAt });
    }
  }
  async function publishPresenceOpen() {
    if (!session || !firebaseConfigured()) return;
    try {
      await signInRole(authRole());
      const dev = currentDevice();
      const meta = (loadRaw(LS_SYNC, {}) || {})[session] || {};
      await fbDb.collection("users").doc(session).collection("meta").doc("presence").set({
        appVersion: APP_VERSION,
        lastSyncOk: meta.lastOk || (meta.ok ? meta.at : 0) || 0,
        deviceId: dev.id,
        label: dev.label,
        lastSeen: Date.now(),
        visible: document.visibilityState !== "hidden",
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (e) { console.warn(e); }
  }
  function syncUser(userId, applyCursor) {
    const job = syncQueue.then(() => syncUserBody(userId, applyCursor).catch((e) => {
      rememberSync(userId, { ok: false, at: Date.now(), error: friendlySync(e), errorCode: syncErrorCode(e) });
      throw e;
    }));
    syncQueue = job.then(() => {}, () => {});
    return job;
  }
  async function syncNow() {
    if (!session || !firebaseConfigured()) { renderSyncStatus(); return; }
    if (syncing) { syncAgain = true; return; }
    clearTimeout(syncRetryTimer);
    syncing = true;
    try {
      do {
        syncAgain = false;
        await syncUser(session, !booted);
        try { await pullCatalog(); } catch (e) { console.warn(e); }
        booted = true;
        renderAll();
      } while (syncAgain);
    } catch (e) {
      console.warn(e);
      booted = true;
      syncAgain = false;
      renderSyncStatus();
    } finally { syncing = false; }
    if (session === "khawla") reconcileActivity().catch((e) => console.warn(e));
  }
  function schedulePush() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, 1200);
  }

  /* ---------------- Khawla's activity (separate from progress) ---------------- */
  let activityTimer = null;
  let activityClock = null;
  let activityUnsub = [];
  let activityReadyToPush = false;
  let activityListenError = "";
  let activityPushing = null;
  let activityHiddenAt = 0;
  let khawlaSyncDiag = null;

  function loadActivity() {
    return L.readActivity(loadRaw(LS_ACTIVITY, null));
  }
  function saveActivity(state) {
    saveRaw(LS_ACTIVITY, state);
  }
  function activityEvent(kind, extra) {
    if (session !== "khawla") return loadActivity();
    const dev = currentDevice();
    const next = L.applyActivity(loadActivity(), Object.assign({
      kind, at: Date.now(), deviceId: dev.id, label: dev.label, appVersion: APP_VERSION,
    }, extra || {}));
    saveActivity(next);
    pushActivity();
    return next;
  }
  function startActivityHeartbeat() {
    if (activityTimer || session !== "khawla" || document.visibilityState !== "visible") return;
    activityTimer = setInterval(() => {
      if (session !== "khawla" || document.visibilityState !== "visible") {
        stopActivityHeartbeat();
        return;
      }
      activityEvent("tick");
    }, L.ACTIVITY_HEARTBEAT_MS);
  }
  function stopActivityHeartbeat() {
    if (activityTimer) clearInterval(activityTimer);
    activityTimer = null;
  }
  function onKhawlaVisible() {
    if (session !== "khawla" || document.visibilityState !== "visible") return;
    activityHiddenAt = 0;
    activityEvent("show");
    startActivityHeartbeat();
  }
  function onKhawlaHidden() {
    if (session !== "khawla") return;
    stopActivityHeartbeat();
    const now = Date.now();
    if (now - activityHiddenAt < 1000) return;
    activityHiddenAt = now;
    activityEvent("hide");
  }
  async function fetchActivityRemote() {
    await signInRole(authRole());
    const base = fbDb.collection("users").doc("khawla").collection("meta");
    const [pres, act, diag] = await Promise.all([
      base.doc("presence").get(),
      base.doc("activity").get(),
      base.doc("syncStatus").get(),
    ]);
    const presence = pres.exists ? (pres.data() || {}) : {};
    const body = act.exists ? (act.data() || {}) : {};
    const syncStatus = diag.exists ? (diag.data() || {}) : null;
    return {
      presence: {
        lastSeen: Number(presence.lastSeen) || 0,
        visible: !!presence.visible,
        deviceId: presence.deviceId || "",
        label: presence.label || "",
        appVersion: presence.appVersion || "",
        lastSyncOk: Number(presence.lastSyncOk) || 0,
      },
      days: body.days || {},
      devices: body.devices || {},
      recent: body.recent || [],
      syncStatus,
      updatedAt: Number(body.updatedAt) || Number(presence.updatedAt) || 0,
    };
  }
  async function writeActivityRemote(state) {
    await signInRole("khawla");
    const base = fbDb.collection("users").doc("khawla").collection("meta");
    const at = state.updatedAt || Date.now();
    const dev = currentDevice();
    const meta = (loadRaw(LS_SYNC, {}) || {}).khawla || {};
    const days = {};
    Object.keys(state.days || {}).forEach((k) => {
      const d = state.days[k];
      days[k] = {
        sessions: d.sessions || 0,
        activeMs: d.activeMs || 0,
        attempts: d.attempts || 0,
        scoreSum: d.scoreSum || 0,
        first: d.first || 0,
        last: d.last || 0,
      };
    });
    const devices = {};
    Object.keys(state.devices || {}).forEach((id) => {
      const d = state.devices[id] || {};
      devices[id] = {
        label: d.label || "",
        lastSeen: d.lastSeen || 0,
        lastSyncOk: d.lastSyncOk || 0,
        lastSyncError: d.lastSyncError || "",
        lastSyncErrorAt: d.lastSyncErrorAt || 0,
        appVersion: d.appVersion || "",
        sessions: d.sessions || 0,
        attempts: d.attempts || 0,
      };
    });
    const recent = (state.recent || []).slice(0, 40).map((s) => ({
      id: s.id, at: s.at || 0, deviceId: s.deviceId || "", label: s.label || "", attempts: s.attempts || 0,
    }));
    await Promise.all([
      base.doc("presence").set({
        lastSeen: state.presence.lastSeen || 0,
        visible: !!state.presence.visible,
        deviceId: (state.presence && state.presence.deviceId) || dev.id,
        label: (state.presence && state.presence.label) || dev.label,
        appVersion: (state.presence && state.presence.appVersion) || APP_VERSION,
        lastSyncOk: (state.presence && state.presence.lastSyncOk) || meta.lastOk || 0,
        updatedAt: at,
      }, { merge: true }),
      base.doc("activity").set({ days, devices, recent, updatedAt: at }, { merge: true }),
    ]);
  }
  function pushActivity() {
    if (session !== "khawla" || !firebaseConfigured()) return;
    const run = () => {
      if (session !== "khawla" || !activityReadyToPush) return null;
      return writeActivityRemote(loadActivity()).catch((e) => { console.warn(e); });
    };
    activityPushing = activityPushing ? activityPushing.then(run, run) : run();
  }
  async function reconcileActivity() {
    if (session !== "khawla" || !firebaseConfigured()) return;
    const run = async () => {
      try {
        const remote = await fetchActivityRemote();
        if (session !== "khawla") return;
        if (remote.syncStatus) khawlaSyncDiag = remote.syncStatus;
        saveActivity(L.mergeActivity(loadActivity(), remote, Date.now()));
        activityReadyToPush = true;
        await writeActivityRemote(loadActivity());
      } catch (e) {
        console.warn(e);
      }
    };
    const job = activityPushing ? activityPushing.then(run, run) : run();
    activityPushing = job;
    await job;
  }
  function stopActivityWatch() {
    activityUnsub.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    activityUnsub = [];
    if (activityClock) clearInterval(activityClock);
    activityClock = null;
  }
  function startActivityClock() {
    if (activityClock) clearInterval(activityClock);
    if (session !== "farouk") { activityClock = null; return; }
    activityClock = setInterval(() => {
      if (session === "farouk" && $("#view-progress") && $("#view-progress").classList.contains("active")) renderActivity();
    }, 30000);
  }
  async function watchKhawlaActivity() {
    stopActivityWatch();
    startActivityClock();
    if (session !== "farouk" || !firebaseConfigured()) return;
    try {
      await signInRole("farouk");
      if (session !== "farouk" || !fbDb) return;
      const base = fbDb.collection("users").doc("khawla").collection("meta");
      const onErr = (e) => {
        console.warn(e);
        activityListenError = friendlySync(e);
        renderActivity();
      };
      const absorb = (partial) => {
        if (session !== "farouk") return;
        saveActivity(L.mergeActivity(loadActivity(), partial, Date.now()));
        activityListenError = "";
        renderActivity();
      };
      activityUnsub.push(base.doc("presence").onSnapshot((snap) => {
        const data = snap.exists ? (snap.data() || {}) : {};
        absorb({
          presence: {
            lastSeen: Number(data.lastSeen) || 0,
            visible: !!data.visible,
            deviceId: data.deviceId || "",
            label: data.label || "",
            appVersion: data.appVersion || "",
            lastSyncOk: Number(data.lastSyncOk) || 0,
          },
          updatedAt: Number(data.updatedAt) || 0,
        });
      }, onErr));
      activityUnsub.push(base.doc("activity").onSnapshot((snap) => {
        const data = snap.exists ? (snap.data() || {}) : {};
        absorb({ days: data.days || {}, devices: data.devices || {}, recent: data.recent || [], updatedAt: Number(data.updatedAt) || 0 });
      }, onErr));
      activityUnsub.push(base.doc("syncStatus").onSnapshot((snap) => {
        khawlaSyncDiag = snap.exists ? (snap.data() || {}) : null;
        if (session === "farouk") renderActivity();
      }, onErr));
    } catch (e) {
      console.warn(e);
      activityListenError = friendlySync(e);
      renderActivity();
    }
  }
  function formatActivityClock(ts) {
    return new Intl.DateTimeFormat(uiLang === "de" ? "de-DE" : "en-GB", {
      timeZone: L.ACTIVITY_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(ts));
  }
  function formatActivityWhen(ts, now) {
    const same = L.activityDayKey(ts) === L.activityDayKey(now);
    const opt = { timeZone: L.ACTIVITY_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    if (!same) { opt.day = "numeric"; opt.month = "short"; }
    return new Intl.DateTimeFormat(uiLang === "de" ? "de-DE" : "en-GB", opt).format(new Date(ts));
  }
  function formatLastActive(ts, now) {
    const min = Math.floor(Math.max(0, now - ts) / 60000);
    if (min < 1) return tr("activity.just");
    if (min === 1) return tr("activity.last", { when: tr("activity.minOne") });
    if (min < 60) return tr("activity.last", { when: tr("activity.minAgo", { n: min }) });
    const hr = Math.floor(min / 60);
    if (hr === 1) return tr("activity.last", { when: tr("activity.hourOne") });
    if (hr < 48) return tr("activity.last", { when: tr("activity.hourAgo", { n: hr }) });
    const days = Math.floor(hr / 24);
    if (days === 1) return tr("activity.last", { when: tr("activity.dayOne") });
    return tr("activity.last", { when: tr("activity.dayAgo", { n: days }) });
  }
  function formatActiveMinutes(ms) {
    const n = Math.round((ms || 0) / 60000);
    if (ms > 0 && n === 0) return "<1";
    return String(n);
  }
  function renderActivity() {
    if (!isAdmin() || !$("#activityToday")) return;
    const now = Date.now();
    const data = loadActivity();
    const seen = data.presence.lastSeen || 0;
    const online = !!(seen && now - seen < L.ACTIVITY_ONLINE_MS);
    const dot = $("#activityDot");
    if (dot) dot.classList.toggle("on", online);
    const text = $("#activityPresenceText");
    if (text) text.textContent = online ? tr("activity.online") : (seen ? formatLastActive(seen, now) : tr("activity.never"));
    const when = $("#activityWhen");
    if (when) when.textContent = seen ? tr("activity.at", { time: formatActivityWhen(seen, now) }) : "";
    const today = data.days[L.activityDayKey(now)] || { sessions: 0, activeMs: 0, attempts: 0, scoreSum: 0, first: 0, last: 0 };
    const avg = today.attempts ? String(Math.round(today.scoreSum / today.attempts)) : "–";
    const stats = $("#activityToday");
    stats.innerHTML = "";
    [
      ["🌿", String(today.sessions || 0), tr("activity.sessions")],
      ["⏱️", formatActiveMinutes(today.activeMs), tr("activity.minutes")],
      ["🎤", String(today.attempts || 0), tr("activity.sentences")],
      ["💯", avg, tr("activity.avg")],
    ].forEach(([emo, n, lab]) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = `<span></span><b></b><small></small>`;
      d.querySelector("span").textContent = emo;
      d.querySelector("b").textContent = n;
      d.querySelector("small").textContent = lab;
      stats.appendChild(d);
    });
    const span = $("#activitySpan");
    if (span) {
      span.textContent = today.first
        ? tr("activity.span", { from: formatActivityClock(today.first), to: formatActivityClock(today.last || today.first) })
        : tr("activity.spanEmpty");
    }
    const recent = L.recentActivityDays(now, 14);
    const minutes = recent.map((d) => Math.round((((data.days || {})[d.key] || {}).activeMs || 0) / 60000));
    const max = Math.max(1, ...minutes);
    const box = $("#activityBars");
    box.innerHTML = "";
    recent.forEach((d, i) => {
      const v = minutes[i];
      const el = document.createElement("div");
      el.className = "day" + (i === recent.length - 1 ? " today" : "");
      el.innerHTML = `<span></span><div class="col ${v ? "" : "zero"}" style="height:${v ? 10 + (v / max) * 80 : 4}%"></div><span></span>`;
      const labels = el.querySelectorAll("span");
      labels[0].textContent = v ? String(v) : "";
      labels[1].textContent = tr("day." + d.weekday);
      box.appendChild(el);
    });
    const deviceRows = L.activityDeviceViews(data, khawlaSyncDiag, APP_VERSION);
    const version = (data.presence && data.presence.appVersion) || "";
    const lastOk = Math.max(
      (data.presence && data.presence.lastSyncOk) || 0,
      ...deviceRows.map((d) => d.lastSyncOk || 0)
    );
    const errRow = deviceRows.filter((d) => d.state === "error" && d.error).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    const versionEl = $("#activityVersion");
    if (versionEl) {
      const base = version ? tr("sync.version", { v: version }) : tr("activity.versionUnknown");
      versionEl.textContent = L.isOldBuild(version, APP_VERSION) ? base + " · " + tr("activity.oldBuild") : base;
    }
    const okEl = $("#activitySyncOk");
    if (okEl) {
      const who = deviceRows.filter((d) => d.lastSyncOk === lastOk && d.label)[0];
      okEl.textContent = lastOk
        ? tr("activity.syncOk", { when: formatActivityWhen(lastOk, now) }) + (who ? " · " + who.label : "")
        : tr("activity.syncOkNever");
    }
    const errEl = $("#activitySyncErr");
    if (errEl) errEl.textContent = errRow ? tr("sync.errorLine", { err: errRow.error }) + (errRow.label ? " · " + errRow.label : "") : tr("activity.syncErrNone");
    const mine = currentDevice().id;
    const devicesEl = $("#activityDevices");
    if (devicesEl) {
      devicesEl.innerHTML = "";
      if (!deviceRows.length) devicesEl.textContent = tr("activity.noDevices");
      deviceRows.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      deviceRows.forEach((d) => {
        const el = document.createElement("div");
        el.className = "device-row";
        const title = document.createElement("b");
        title.textContent = d.label || d.id;
        if (d.id === mine) {
          const tag = document.createElement("span");
          tag.className = "you-tag";
          tag.textContent = tr("activity.thisDevice");
          title.appendChild(tag);
        }
        if (d.old) {
          const old = document.createElement("span");
          old.className = "old-tag";
          old.textContent = tr("activity.oldBuild");
          title.appendChild(old);
        }
        const meta = document.createElement("p");
        meta.className = "muted small";
        const bits = [];
        if (d.appVersion) bits.push(tr("sync.version", { v: d.appVersion }));
        else bits.push(tr("activity.versionUnknown"));
        if (d.lastSeen) bits.push(tr("activity.seen", { when: formatActivityWhen(d.lastSeen, now) }));
        if (d.state === "notSet" && !d.lastSyncOk) bits.push(tr("sync.notSet"));
        else bits.push(d.lastSyncOk ? tr("activity.deviceSync", { when: formatActivityWhen(d.lastSyncOk, now) }) : tr("activity.deviceSyncNever"));
        meta.textContent = bits.join(" · ");
        const counts = document.createElement("p");
        counts.className = "muted small";
        counts.textContent = tr("activity.deviceCounts", { sessions: d.sessions || 0, attempts: d.attempts || 0 });
        el.append(title, meta, counts);
        if (d.error) {
          const line = document.createElement("p");
          line.className = "status small";
          line.textContent = tr("sync.errorLine", { err: d.error });
          el.appendChild(line);
        }
        devicesEl.appendChild(el);
      });
    }
    const sessionsEl = $("#activitySessions");
    if (sessionsEl) {
      sessionsEl.innerHTML = "";
      const sessions = (data.recent || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
      if (!sessions.length) {
        const li = document.createElement("li");
        li.textContent = tr("activity.noSessions");
        sessionsEl.appendChild(li);
      }
      sessions.forEach((s) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        const live = deviceRows.find((d) => d.id === s.deviceId);
        name.textContent = ((live && live.label) || s.label || tr("activity.unknownDevice")) + (s.deviceId === mine ? " · " + tr("activity.thisDevice") : "");
        const when = document.createElement("span");
        when.textContent = (s.at ? formatActivityWhen(s.at, now) : "") + " · " + tr("activity.sessionTries", { n: s.attempts || 0 });
        li.append(name, when);
        sessionsEl.appendChild(li);
      });
    }
    const status = $("#activitySync");
    if (status) {
      if (activityListenError) status.textContent = tr("activity.err", { err: activityListenError });
      else if (!firebaseConfigured()) status.textContent = tr("activity.offline");
      else status.textContent = tr("activity.live");
    }
  }
  async function refreshActivity() {
    const status = $("#activitySync");
    if (status) status.textContent = tr("toast.pulling");
    try {
      if (!firebaseConfigured()) { renderActivity(); return; }
      await signInRole("farouk");
      const remote = await fetchActivityRemote();
      if (session !== "farouk") return;
      khawlaSyncDiag = remote.syncStatus || null;
      saveActivity(L.mergeActivity(loadActivity(), remote, Date.now()));
      activityListenError = "";
      renderActivity();
      const line = $("#activitySync");
      if (line) line.textContent = tr("activity.refreshed");
    } catch (e) {
      console.warn(e);
      activityListenError = friendlySync(e);
      renderActivity();
    }
  }

  /* ---------------- backup ---------------- */
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function exportMine() {
    download(`aussprache-${session}.json`, {
      kind: "aussprache-backup", version: 1, exportedAt: new Date().toISOString(), user: session, progress: loadProgress(session),
    });
  }
  function exportAll() {
    const copy = JSON.parse(JSON.stringify(settings));
    if (!$("#exportKey").checked) copy.key = "";
    download("aussprache-backup.json", {
      kind: "aussprache-backup", version: 1, exportedAt: new Date().toISOString(), user: session,
      users: { khawla: loadProgress("khawla"), farouk: loadProgress("farouk") },
      catalog, settings: copy, progress: loadProgress(session),
    });
  }
  function importBackup(obj) {
    if (!obj || obj.kind !== "aussprache-backup") throw new Error(tr("err.backup"));
    if (isAdmin() && obj.users) {
      ["khawla", "farouk"].forEach((id) => {
        if (obj.users[id]) saveProgress(id, L.mergeProgress(loadProgress(id), obj.users[id]));
      });
    } else if (obj.progress) {
      const target = obj.user === "farouk" || obj.user === "khawla" ? obj.user : session;
      if (!isAdmin() && target !== session) throw new Error(tr("err.importOwn"));
      saveProgress(target, L.mergeProgress(loadProgress(target), obj.progress));
    }
    if (isAdmin() && obj.catalog && Array.isArray(obj.catalog.customUnits)) {
      catalog.customUnits = L.mergeCatalog(catalog.customUnits, obj.catalog.customUnits);
      saveRaw(LS_CATALOG, catalog);
    }
    if (isAdmin() && obj.settings) {
      const s = obj.settings;
      if (s.key) settings.key = s.key;
      if (s.region) settings.region = s.region;
      if (s.voice) settings.voice = s.voice;
      if (typeof s.prosody === "boolean") settings.prosody = s.prosody;
      if (s.firebase) settings.firebase = Object.assign(settings.firebase, s.firebase);
      if (s.syncPassword) settings.syncPassword = s.syncPassword;
      saveSettings();
      fbReady = null; fbDb = null; fbAuth = null;
    }
    progress = loadProgress(session);
    currentId = (progress.cursor && progress.cursor.sentenceId) || L.resumeId(units(), progress, passFor());
    renderAll();
    schedulePush();
    if (isAdmin()) pushCatalog().catch(() => {});
  }

  function resetUser(id) {
    const prev = loadProgress(id);
    const now = Date.now();
    const empty = L.emptyProgress();
    empty.clearedAt = now;
    empty.updatedAt = now;
    empty.showTrans = { value: !(prev.showTrans && prev.showTrans.value === false), at: now + 1 };
    saveProgress(id, empty);
    if (id === session) {
      progress = empty;
      mode = "path";
      queue = [];
      currentId = L.resumeId(units(), progress, passFor());
      renderAll();
    } else renderKhawla();
    if (firebaseConfigured()) {
      syncUser(id, false).then(() => { if (id !== session) renderKhawla(); else renderAll(); }).catch((e) => toast(friendlySync(e)));
    }
  }

  function readAdminForm() {
    settings.key = $("#keyInput").value.trim();
    settings.region = $("#regionInput").value.trim().toLowerCase() || "northeurope";
    settings.voice = $("#voiceSelect").value;
    settings.prosody = $("#prosodyToggle").checked;
    saveSettings();
    ttsCache.clear();
  }
  function readSyncForm() {
    settings.firebase = {
      apiKey: $("#fbApiKey").value.trim(),
      authDomain: $("#fbAuthDomain").value.trim(),
      projectId: $("#fbProjectId").value.trim(),
      appId: $("#fbAppId").value.trim(),
    };
    settings.syncPassword = $("#syncPassword").value;
    saveSettings();
    fbReady = null; fbDb = null; fbAuth = null;
  }

  /* ---------------- love dodge ---------------- */
  let loveReady = false;
  function noCenter() {
    const b = $("#loveNo").getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, b };
  }
  function nearNo(x, y) {
    const c = noCenter();
    return Math.hypot(x - c.x, y - c.y) < 78;
  }
  function moveNo(x, y) {
    const arena = $("#loveArena");
    const btn = $("#loveNo");
    const ar = arena.getBoundingClientRect();
    if (ar.width < 40 || ar.height < 40) return;
    const bw = btn.offsetWidth || 96;
    const bh = btn.offsetHeight || 46;
    const pad = 8;
    const spots = [
      [pad, pad],
      [Math.max(pad, ar.width - bw - pad), pad],
      [pad, Math.max(pad, ar.height - bh - pad)],
      [Math.max(pad, ar.width - bw - pad), Math.max(pad, ar.height - bh - pad)],
      [(ar.width - bw) / 2, pad],
      [pad, (ar.height - bh) / 2],
    ];
    for (let i = 0; i < 10; i++) {
      spots.push([
        pad + Math.random() * Math.max(8, ar.width - bw - pad * 2),
        pad + Math.random() * Math.max(8, ar.height - bh - pad * 2),
      ]);
    }
    let best = spots[0], bestD = -1;
    for (const [left, top] of spots) {
      const cx = ar.left + left + bw / 2;
      const cy = ar.top + top + bh / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d > bestD) { bestD = d; best = [left, top]; }
    }
    btn.style.left = best[0] + "px";
    btn.style.top = best[1] + "px";
    btn.style.transform = Math.random() < 0.45 ? "scale(0.62)" : "scale(1)";
  }
  function armLove() {
    if (loveReady) return;
    loveReady = true;
    const arena = $("#loveArena");
    const btn = $("#loveNo");
    const flee = (x, y, ev) => {
      if (!nearNo(x, y) && ev && ev.target !== btn) return;
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      moveNo(x, y);
    };
    arena.addEventListener("pointermove", (e) => { if (nearNo(e.clientX, e.clientY)) moveNo(e.clientX, e.clientY); });
    arena.addEventListener("pointerdown", (e) => flee(e.clientX, e.clientY, e.target === btn || nearNo(e.clientX, e.clientY) ? e : null));
    btn.addEventListener("pointerenter", (e) => moveNo(e.clientX, e.clientY));
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); moveNo(e.clientX, e.clientY); });
    const touch = (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (e.target === btn || nearNo(t.clientX, t.clientY)) {
        e.preventDefault();
        moveNo(t.clientX, t.clientY);
      }
    };
    arena.addEventListener("touchstart", touch, { passive: false });
    arena.addEventListener("touchmove", touch, { passive: false });
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveNo(e.clientX || 0, e.clientY || 0); });
    btn.addEventListener("keydown", (e) => e.preventDefault());
  }

  /* ---------------- wiring ---------------- */
  function greet() {
    const h = new Date().getHours();
    const g = h < 11 ? tr("greet.morning") : h < 17 ? tr("greet.day") : tr("greet.evening");
    const s = computeStreak(progress);
    $("#helloSub").textContent = s >= 2 ? tr("greet.streak", { n: s }) : g;
  }
  function enterApp(user) {
    session = user;
    saveRaw(LS_SESSION, { user });
    progress = loadProgress(user);
    adoptLang(user);
    paintI18n();
    document.body.dataset.role = isAdmin() ? "admin" : "learner";
    $("#gate").hidden = true;
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#app").hidden = false;
    mode = "path";
    queue = [];
    currentId = L.resumeId(units(), progress, passFor());
    bindApp();
    renderAll();
    greet();
    showView(viewFromHash());
    if (session === "khawla") onKhawlaVisible();
    else startActivityClock();
    if (!hasKey()) openKeyWall("bad");
    else refreshKeyWall(false).finally(() => { if (!keyWallKind) maybeStartGuide(); });
    syncNow().finally(() => { if (session === "farouk") watchKhawlaActivity(); }).catch(() => {});
    publishPresenceOpen();
    publishHardwareLabel();
  }
  function publishHardwareLabel() {
    refineDeviceHardware().then((dev) => {
      renderSyncStatus();
      if (!session || !dev) return;
      if (session === "khawla") {
        saveActivity(L.noteDeviceSync(loadActivity(), {
          deviceId: dev.id, label: dev.label, appVersion: APP_VERSION, at: Date.now(),
        }));
        pushActivity();
      }
      const meta = (loadRaw(LS_SYNC, {}) || {})[session] || null;
      if (meta && (meta.at || meta.lastOk || meta.error)) writeSyncDiag(session, meta).catch(() => {});
      publishPresenceOpen();
    }).catch(() => {});
  }
  function logout() {
    if (session === "khawla") onKhawlaHidden();
    stopActivityHeartbeat();
    stopActivityWatch();
    activityReadyToPush = false;
    activityListenError = "";
    activityHiddenAt = 0;
    guideOpen = false;
    clearTimeout(guideTimer);
    const layer = $("#guide");
    if (layer) layer.hidden = true;
    localStorage.removeItem(LS_SESSION);
    session = null;
    keyWallKind = "";
    keyWallPaused = false;
    renderKeyWall();
    $("#app").hidden = true;
    document.body.removeAttribute("data-role");
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#gate").hidden = false;
    $("#nameInput").value = "";
    $("#nameError").textContent = "";
    paintI18n();
  }
  function onName() {
    const n = $("#nameInput").value.trim().toLowerCase();
    $("#nameError").textContent = "";
    if (n === "khawla" || n === "farouk") {
      if (!langChosen) {
        const saved = L.readUiLang(loadProgress(n));
        uiLang = saved.explicit ? saved.value : "en";
        paintI18n();
      }
    }
    if (n === "khawla") {
      $("#gate").hidden = true;
      $("#loveModal").hidden = false;
      const btn = $("#loveNo");
      btn.style.left = "58%";
      btn.style.top = "34%";
      btn.style.transform = "scale(1)";
      return;
    }
    if (n === "farouk") {
      $("#gate").hidden = true;
      $("#faroukModal").hidden = false;
      return;
    }
    $("#nameError").textContent = tr("gate.unknown");
  }

  function bindApp() {
    if (bindApp.done) return;
    bindApp.done = true;
    $$(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));
    $("#weiterBtn").onclick = goWeiter;
    $("#weiterBtn2").onclick = goWeiter;
    $("#nextAfter").onclick = goWeiter;
    $("#pathToggle").onclick = () => {
      const wrap = $("#pathWrap");
      wrap.hidden = !wrap.hidden;
      $("#pathToggle").setAttribute("aria-expanded", String(!wrap.hidden));
      if (!wrap.hidden) renderPath();
    };
    $("#pathClose").onclick = () => { $("#pathWrap").hidden = true; $("#pathToggle").setAttribute("aria-expanded", "false"); };
    $("#reviewJump").onclick = () => showView("review");
    $("#againBtn").onclick = () => { hideResult(); setState("idle", tr("status.tap"), tr("hint.ready")); };
    bindHold();
    $("#playNormal").onclick = (e) => speak(current().de, false, e.currentTarget);
    $("#playSlow").onclick = (e) => speak(current().de, true, e.currentTarget);
    $("#toggleTrans").onclick = () => {
      progress.showTrans = { value: !showTrans(), at: Date.now() };
      progress.updatedAt = Date.now();
      saveProgress(session, progress);
      schedulePush();
      renderPractice();
    };
    $("#englishText").onclick = () => { if (!showTrans()) $("#englishText").classList.toggle("hide"); };
    $("#freeToggle").onclick = () => {
      mode = mode === "free" ? "path" : "free";
      if (mode === "free") freeText = $("#customInput").value;
      hideResult();
      renderPractice();
    };
    $("#useCustom").onclick = () => {
      freeText = $("#customInput").value.trim().replace(/\s+/g, " ");
      if (!freeText) { toast(tr("toast.freeEmpty")); return; }
      mode = "free";
      hideResult();
      renderPractice();
      toast(tr("toast.freeReady"));
    };
    $("#customInput").addEventListener("input", (e) => { freeText = e.target.value; $("#recordBtn").disabled = !freeText.trim(); });
    $("#sheetClose").onclick = closeSheet;
    $("#sheetBackdrop").onclick = closeSheet;
    $("#sheetPlay").onclick = (e) => sheetWord && speak(sheetWord.word, true, e.currentTarget);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeLock(); } });
    $("#startReview").onclick = () => {
      const due = L.dueReviews(progress, Date.now()).map((r) => r.sentenceId).filter((id) => textFor(id).de);
      if (!due.length) { toast(tr("toast.nothingDue")); return; }
      mode = "review";
      queue = due;
      showSentence(due[0]);
      showView("practice");
    };
    $("#startDrill").onclick = () => {
      const ids = L.drillSentenceIds(units(), progress, window.SOUND_PATTERNS, 6);
      if (!ids.length) { toast(tr("toast.needTries")); return; }
      mode = "drill";
      queue = ids;
      showSentence(ids[0]);
      showView("practice");
    };
    $("#transToggle").onchange = () => {
      progress.showTrans = { value: $("#transToggle").checked, at: Date.now() };
      progress.updatedAt = Date.now();
      saveProgress(session, progress);
      schedulePush();
      renderPractice();
    };
    $("#logoutBtn").onclick = logout;
    const lockDialog = $("#lockDialog");
    if (lockDialog) lockDialog.addEventListener("click", (e) => { if (e.target === lockDialog) closeLock(); });
    const lockClose = $("#lockClose");
    if (lockClose) lockClose.onclick = () => closeLock();
    const syncNowBtn = $("#syncNowBtn");
    if (syncNowBtn) syncNowBtn.onclick = () => {
      syncRetryN = 0;
      clearTimeout(syncRetryTimer);
      if (!firebaseConfigured()) { toast(tr("sync.notSet")); return; }
      syncNow().catch(() => {});
    };
    const deviceName = $("#deviceName");
    if (deviceName) deviceName.addEventListener("change", () => {
      saveDeviceName(deviceName.value);
      renderSyncStatus();
    });
    $("#exportMine").onclick = exportMine;
    $("#importMine").onclick = () => $("#importFile").click();
    $("#importFile").onchange = () => {
      const file = $("#importFile").files && $("#importFile").files[0];
      $("#importFile").value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { importBackup(JSON.parse(String(reader.result || ""))); toast(tr("toast.imported")); }
        catch (e) { toast(e.message || tr("toast.importFail")); }
      };
      reader.readAsText(file);
    };
    $("#saveSettings").onclick = () => {
      readAdminForm();
      $("#settingsStatus").textContent = hasKey() ? tr("toast.saved") : tr("toast.savedNoKey");
      renderHeader();
      keyWallPaused = false;
      refreshKeyWall(true);
    };
    const strictSel = $("#strictnessSelect");
    if (strictSel) strictSel.onchange = () => {
      const value = strictSel.value === "gentle" || strictSel.value === "normal" ? strictSel.value : "strict";
      const hers = loadProgress("khawla");
      hers.strictness = { value, at: Date.now() };
      hers.updatedAt = Date.now();
      saveProgress("khawla", hers);
      if (session === "khawla") progress = hers;
      const help = $("#strictnessHelp");
      if (help) help.textContent = tr("strictness.help");
      if (firebaseConfigured()) syncUser("khawla", false).catch((e) => toast(friendlySync(e)));
      else toast(tr("toast.strictness"));
    };
    $("#testConn").onclick = async () => {
      readAdminForm();
      const st = $("#settingsStatus");
      if (!hasKey()) { st.textContent = tr("toast.needKey"); return; }
      st.textContent = tr("toast.testing");
      try {
        ttsCache.clear();
        const who = session === "farouk" ? "Farouk" : "Khawla";
        const url = await azureTts(`Hallo ${who}! Die Verbindung funktioniert.`, false);
        st.textContent = tr("toast.azureOk");
        new Audio(url).play().catch(() => {});
      } catch (e) { st.textContent = friendlyError(e); }
    };
    $("#showKey").onclick = () => { const i = $("#keyInput"); i.type = i.type === "password" ? "text" : "password"; };
    $("#saveSync").onclick = () => {
      readSyncForm();
      if (!firebaseConfigured()) {
        $("#syncAdminStatus").textContent = tr("toast.syncFields");
        renderSyncStatus();
        return;
      }
      location.reload();
    };
    $("#testSync").onclick = async () => {
      readSyncForm();
      const st = $("#syncAdminStatus");
      st.textContent = tr("toast.syncTesting");
      try {
        await syncNow();
        st.textContent = tr("toast.syncOk", { user: session });
      } catch (e) { st.textContent = friendlySync(e); }
    };
    $("#makeSetup").onclick = () => {
      readSyncForm();
      if (!firebaseConfigured()) { toast(tr("toast.syncFirst")); return; }
      const payload = {
        v: 1,
        fb: settings.firebase,
        pw: settings.syncPassword,
      };
      if ($("#includeAzure").checked && settings.key) payload.az = { key: settings.key, region: settings.region, voice: settings.voice };
      const link = location.origin + location.pathname + "#setup=" + toB64Url(payload);
      $("#setupLink").value = link;
      try {
        if (window.qrcode && window.qrcode.stringToBytesFuncs) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
        const qr = window.qrcode(0, "M");
        qr.addData(link);
        qr.make();
        $("#setupQr").src = qr.createDataURL(4, 8);
        $("#setupQr").hidden = false;
      } catch (e) {
        console.warn(e);
        $("#setupQr").hidden = true;
        toast(tr("toast.qr"));
      }
    };
    $("#setupLink").addEventListener("focus", (e) => e.target.select());
    $("#addUnit").onclick = () => {
      const title = $("#customTitle").value.trim();
      const lines = $("#customLines").value.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const sentences = lines.map((line, i) => {
        const parts = line.split("|");
        const de = (parts[0] || "").trim();
        const en = (parts.slice(1).join("|") || "").trim();
        return { id: "c-" + Date.now().toString(36) + "-" + i, de, en };
      }).filter((s) => s.de);
      if (!title || !sentences.length) { toast(tr("toast.unitNeed")); return; }
      catalog.customUnits.push({
        id: "cu-" + Date.now().toString(36),
        level: $("#customLevel").value || "A1",
        emoji: $("#customEmoji").value.trim() || "✏️",
        title,
        titleEn: "Custom",
        sentences,
        updatedAt: Date.now(),
      });
      saveRaw(LS_CATALOG, catalog);
      $("#customTitle").value = "";
      $("#customLines").value = "";
      renderCustomUnits();
      toast(tr("toast.unitAdded"));
      pushCatalog().catch((e) => toast(friendlySync(e)));
    };
    $("#exportAll").onclick = exportAll;
    $("#resetMine").onclick = () => { if (confirm(tr("confirm.resetMe"))) resetUser(session); };
    $("#resetKhawla").onclick = () => { if (confirm(tr("confirm.resetHer"))) resetUser("khawla"); };
    $("#refreshKhawla").onclick = async () => {
      $("#khawlaSync").textContent = tr("toast.pulling");
      try {
        if (!firebaseConfigured()) throw new Error(tr("err.syncOff"));
        await syncUser("khawla", false);
        toast(tr("toast.pulled"));
      } catch (e) {
        setSyncMeta("khawla", { ok: false, at: Date.now(), error: friendlySync(e) });
        toast(friendlySync(e));
      }
      renderKhawla();
    };
    $("#refreshActivity").onclick = () => { refreshActivity().catch((e) => console.warn(e)); };
    $("#showGuide").onclick = () => showGuideStep(0);
    window.addEventListener("hashchange", () => { if (session && !guideOpen) showView(viewFromHash()); });
    document.addEventListener("visibilitychange", () => {
      if (session === "khawla") {
        if (document.visibilityState === "visible") onKhawlaVisible();
        else onKhawlaHidden();
      }
      if (document.visibilityState === "visible") publishPresenceOpen();
      if (session) syncNow().catch(() => {});
    });
    window.addEventListener("pagehide", () => { if (session === "khawla") onKhawlaHidden(); });
    window.addEventListener("online", () => { if (session) syncNow().catch(() => {}); });
  }

  function bindGate() {
    if (bindGate.done) return;
    bindGate.done = true;
    $("#nameGo").onclick = onName;
    $("#nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") onName(); });
    $("#loveYes").onclick = () => {
      confetti(120);
      floatEmojis(["💛", "🐹", "🐝", "💖", "✨"]);
      setTimeout(() => enterApp("khawla"), 700);
    };
    $("#faroukYes").onclick = () => enterApp("farouk");
    armLove();
  }

  function listenForAppUpdate() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext || /[?&]nosw/.test(location.search)) return;
    const startedControlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    const reloadOnce = (cacheName) => {
      if (!startedControlled || reloading) return;
      try {
        if (cacheName && sessionStorage.getItem("aussprache.swreload") === cacheName) return;
        if (cacheName) sessionStorage.setItem("aussprache.swreload", cacheName);
      } catch { /* private mode */ }
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => reloadOnce(APP_CACHE));
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "sw-activated") reloadOnce(e.data.cache || APP_CACHE);
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      const check = () => { reg.update().catch(() => {}); };
      check();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    }).catch((e) => console.warn("SW", e));
  }

  function init() {
    refineDeviceHardware();
    migrate();
    absorbLegacyProgress();
    consumeSetup();
    const deviceLang = loadRaw(LS_UILANG, null);
    if (deviceLang && deviceLang.explicit && (deviceLang.value === "en" || deviceLang.value === "de")) uiLang = deviceLang.value;
    paintI18n();
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".lang-switch button");
      if (!b || !b.dataset.lang) return;
      applyLang(b.dataset.lang, true);
    });
    $("#guideSkip").onclick = () => finishGuide();
    $("#guideNext").onclick = () => {
      if (guideIndex >= GUIDE.length - 1) finishGuide();
      else showGuideStep(guideIndex + 1);
    };
    window.addEventListener("resize", () => { if (guideOpen) positionGuide(); });
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
    $("#keyWallAgain").onclick = () => {
      const btn = $("#keyWallAgain");
      btn.disabled = true;
      refreshKeyWall(true).finally(() => { btn.disabled = false; });
    };
    const keyWallForm = $("#keyWallForm");
    if (keyWallForm) keyWallForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveWallKey().catch((err) => console.warn("key check", err && err.name ? err.name : "failed"));
    });
    const keyWallPaste = $("#keyWallPaste");
    if (keyWallPaste) keyWallPaste.onclick = () => { pasteWallKey().catch(() => {}); };
    const keyWallEye = $("#keyWallEye");
    if (keyWallEye) keyWallEye.onclick = () => {
      const input = $("#keyWallKey");
      if (!input) return;
      input.classList.toggle("revealed");
      const shown = input.classList.contains("revealed");
      keyWallEye.setAttribute("aria-label", tr(shown ? "keywall.hide" : "key.show"));
      keyWallEye.setAttribute("aria-pressed", shown ? "true" : "false");
    };
    const keyWallAdvancedBtn = $("#keyWallAdvancedBtn");
    if (keyWallAdvancedBtn) keyWallAdvancedBtn.onclick = () => {
      const box = $("#keyWallAdvanced");
      if (!box) return;
      box.hidden = !box.hidden;
      keyWallAdvancedBtn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
      const regionInput = $("#keyWallRegion");
      if (!box.hidden && regionInput) {
        regionInput.value = (settings.region || "northeurope").trim().toLowerCase() || "northeurope";
      }
    };
    const keyWallKey = $("#keyWallKey");
    if (keyWallKey) {
      keyWallKey.addEventListener("paste", (e) => {
        const text = e.clipboardData && e.clipboardData.getData("text");
        if (typeof text === "string" && text) keyWallRaw = text;
      });
      keyWallKey.addEventListener("input", () => {
        if (keyWallRaw) {
          const rawPaste = keyWallRaw.replace(/\r\n/g, "\n");
          const visible = keyWallKey.value.replace(/\r\n/g, "\n");
          if (visible !== rawPaste && visible.replace(/\n/g, "") !== rawPaste.replace(/\n/g, "")) keyWallRaw = "";
        }
        if (keyWallErrorCode) setKeyWallError("");
      });
    }
    $("#keyWallSettings").onclick = () => {
      keyWallPaused = true;
      keyWallKind = "";
      renderKeyWall();
      showView("settings");
      const input = $("#keyInput");
      if (input) input.focus();
    };
    bindGate();
    bindPets();
    const saved = loadRaw(LS_SESSION, null);
    if (saved && (saved.user === "khawla" || saved.user === "farouk")) enterApp(saved.user);
    listenForAppUpdate();
  }
  init();

    window.__khawla = {
    g2p, moveNo, nearNo,
    cheer: capyCheer,
    get petState() { return { count: pet.count, mute: pet.mute }; },
    get units() { return units(); },
    get progress() { return progress; },
    get settings() { return settings; },
    get lang() { return uiLang; },
    get guideOn() { return guideOpen; },
    get activity() { return loadActivity(); },
    noteActivity: (kind, extra) => activityEvent(kind, extra),
  };
})();
