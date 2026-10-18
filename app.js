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

  function defaultSettings() {
    return {
      key: "", region: "northeurope", voice: "de-DE-KatjaNeural", demo: null, prosody: false,
      firebase: { apiKey: "", authDomain: "", projectId: "", appId: "" },
      syncPassword: "",
    };
  }
  let settings = Object.assign(defaultSettings(), loadRaw(LS_SETTINGS, {}) || {});
  settings.firebase = Object.assign(defaultSettings().firebase, settings.firebase || {});
  if (!settings.region) settings.region = "northeurope";
  if (!settings.voice) settings.voice = "de-DE-KatjaNeural";
  if (settings.demo == null) settings.demo = !settings.key;

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
  let syncTimer = null;

  const isAdmin = () => session === "farouk";
  const firebaseConfigured = () => {
    const f = settings.firebase || {};
    return !!(f.apiKey && f.authDomain && f.projectId && f.appId && settings.syncPassword);
  };
  const hasKey = () => !!(settings.key && settings.region);
  const useDemo = () => !hasKey() || !!settings.demo;
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
  });
}
  function saveProgress(id, p) {
    p.days = L.recomputeDays(p.attempts || []);
    saveRaw(userKey(id), p);
  }
  function saveSettings() { saveRaw(LS_SETTINGS, settings); }

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
      if (typeof oldS.demo === "boolean") settings.demo = oldS.demo;
      if (typeof oldS.prosody === "boolean") settings.prosody = oldS.prosody;
      if (settings.demo == null) settings.demo = !settings.key;
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
          settings.demo = false;
        }
        saveSettings();
      }
    } catch (e) { console.warn("setup link", e); }
    history.replaceState(null, "", location.pathname + location.search);
  }

  /* ---------------- helpers ---------------- */
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const round = (v) => (v == null || isNaN(v) ? null : Math.round(v));
  const band = (s) => (s >= 80 ? "good" : s >= 60 ? "ok" : "bad");
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

  /* ---------------- rendering ---------------- */
  function renderHeader() {
    const name = session === "farouk" ? "Farouk" : "Khawla";
    $("#helloTitle").textContent = `Hallo ${name}!`;
    $("#whoChip").textContent = isAdmin() ? "Farouk · Admin" : "Khawla";
    $("#streakCount").textContent = computeStreak(progress);
    $("#starCount").textContent = totalStars(progress);
    $("#demoBadge").hidden = !useDemo();
    const due = L.dueReviews(progress, Date.now()).length;
    $("#reviewCount").textContent = String(due);
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
    let label = "Lektion";
    if (mode === "review") label = `Wiederholen · ${Math.max(1, queue.indexOf(currentId) + 1)} / ${queue.length}`;
    else if (mode === "drill") label = `Laute · ${Math.max(1, queue.indexOf(currentId) + 1)} / ${queue.length}`;
    else if (isFree) label = "Freier Satz";
    else if (c.unit) label = `${c.level} · ${c.unit.emoji || ""} ${c.unit.title} · ${c.i + 1} / ${c.n}`;
    $("#deckLabel").textContent = label;
    $("#toggleTrans").textContent = showTrans() ? "🙈 EN" : "👀 EN";
    const best = c.id ? L.bestScore(progress, c.id) : null;
    $("#bestStars").textContent = starStr(best != null ? starsFor(best) : 0);
    $("#bestStars").title = best != null ? `Bestes Ergebnis: ${best}` : "Noch nicht geübt";
    const tips = $("#tips");
    tips.innerHTML = "";
    if (c.de) {
      (window.SOUND_TIPS || []).filter((t) => t.test.test(c.de)).slice(0, 2).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = "💡 " + t.tip;
        tips.appendChild(li);
      });
    }
    $("#recordBtn").disabled = !c.de;
    const nxt = L.nextUpId(units(), progress, currentId, isAdmin(), Date.now());
    const nh = L.findSentence(units(), nxt);
    $("#nextHint").textContent = mode === "review"
      ? "Wiederholungsrunde · review round"
      : mode === "drill"
        ? "Kurzer Laut-Drill · short sound drill"
        : nh
          ? `Als Nächstes · next: ${nh.unit.title} — ${nh.sentence.de}`
          : "";
    if (!$("#pathWrap").hidden) renderPath();
  }

  function renderPath() {
    const list = units();
    const grid = $("#pathGrid");
    grid.innerHTML = "";
    list.forEach((u, i) => {
      const unlocked = isAdmin() || L.isUnlocked(i, list, progress);
      const avg = L.unitAverage(u, progress);
      const done = u.sentences.filter((s) => (L.bestScore(progress, s.id) || 0) >= 80).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "unit-node" + (unlocked ? "" : " locked") + (avg >= 80 ? " done" : "") + (progress.cursor && progress.cursor.unitId === u.id ? " current" : "");
      b.innerHTML = `<span class="emoji"></span><b></b><small></small><div class="mini-track"><span></span></div>`;
      b.querySelector(".emoji").textContent = unlocked ? (u.emoji || "🌱") : "🔒";
      b.querySelector("b").textContent = u.title;
      b.querySelector("small").textContent = `${u.level} · ${done}/${u.sentences.length} · Ø ${Math.round(avg)}`;
      b.querySelector(".mini-track span").style.width = Math.round(avg) + "%";
      b.onclick = () => openUnit(u.id);
      grid.appendChild(b);
    });
  }

  function openUnit(unitId) {
    const list = units();
    const i = list.findIndex((u) => u.id === unitId);
    if (i < 0) return;
    if (!isAdmin() && !L.isUnlocked(i, list, progress)) {
      toast("Noch zu. Die vorige Lektion braucht Ø 80. · Locked until the previous unit averages 80.");
      return;
    }
    const u = list[i];
    $("#unitDetail").hidden = false;
    $("#unitDetailTitle").textContent = `${u.emoji || ""} ${u.title} · ${u.titleEn || ""}`;
    const box = $("#unitSentences");
    box.innerHTML = "";
    u.sentences.forEach((s, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sentence-jump" + (s.id === currentId ? " on" : "");
      const label = document.createElement("span");
      label.textContent = `${idx + 1}. ${s.de}`;
      const sc = document.createElement("small");
      const best = L.bestScore(progress, s.id);
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
  const totalStars = (prog) => Object.values((prog && prog.best) || {}).reduce((a, s) => a + starsFor((s && s.score) || 0), 0);

  function renderProgress() {
    const att = progress.attempts || [];
    $("#pStreak").textContent = computeStreak(progress);
    $("#pStars").textContent = totalStars(progress);
    $("#pAttempts").textContent = att.length;
    $("#pAvg").textContent = att.length ? Math.round(att.reduce((a, x) => a + x.score, 0) / att.length) : "–";
    const week = $("#week");
    week.innerHTML = "";
    const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const days = [];
    for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(d); }
    const max = Math.max(1, ...days.map((d) => (progress.days || {})[dayKey(d)] || 0));
    days.forEach((d, k) => {
      const v = (progress.days || {})[dayKey(d)] || 0;
      const el = document.createElement("div");
      el.className = "day" + (k === 6 ? " today" : "");
      el.innerHTML = `<span>${v || ""}</span><div class="col ${v ? "" : "zero"}" style="height:${v ? 10 + (v / max) * 80 : 4}%"></div><span>${names[d.getDay()]}</span>`;
      week.appendChild(el);
    });
    const lp = $("#levelProgress");
    lp.innerHTML = "";
    units().forEach((u, i) => {
      const unlocked = isAdmin() || L.isUnlocked(i, units(), progress);
      const avg = Math.round(L.unitAverage(u, progress));
      const el = document.createElement("div");
      el.className = "lvl";
      const top = document.createElement("div");
      top.className = "lvl-top";
      const name = document.createElement("span");
      name.textContent = `${unlocked ? (u.emoji || "") : "🔒"} ${u.title}`;
      const meta = document.createElement("span");
      meta.textContent = unlocked ? `Ø ${avg}` : "zu";
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
    if (!att.length) rec.innerHTML = `<li><span>Noch nichts – leg los! 🐹</span></li>`;
    att.slice(-8).reverse().forEach((a) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = a.text || "";
      const s = document.createElement("span");
      s.className = "sc " + band(a.score);
      s.textContent = a.score + (a.demo ? " ·demo" : "");
      li.append(t, s);
      rec.appendChild(li);
    });
  }

  function renderKhawla() {
    if (!isAdmin()) return;
    const hers = loadProgress("khawla");
    const meta = (loadRaw(LS_SYNC, {}) || {}).khawla || {};
    const line = $("#khawlaSync");
    if (!firebaseConfigured()) line.textContent = "Cloud noch nicht eingerichtet – hier siehst du nur, was auf diesem Gerät von Khawla liegt.";
    else if (meta.error) line.textContent = "Letzter Abruf fehlgeschlagen: " + meta.error;
    else if (meta.at) line.textContent = "Zuletzt geholt · pulled: " + new Date(meta.at).toLocaleString() + (meta.remoteUpdatedAt ? " · Stand: " + new Date(meta.remoteUpdatedAt).toLocaleString() : "");
    else line.textContent = "Noch nicht aus der Cloud geholt.";
    const stats = $("#khawlaStats");
    stats.innerHTML = "";
    const cells = [
      ["🔥", computeStreak(hers), "Serie"],
      ["⭐", totalStars(hers), "Sterne"],
      ["🎤", (hers.attempts || []).length, "Versuche"],
      ["💯", (hers.attempts || []).length ? Math.round(hers.attempts.reduce((a, x) => a + x.score, 0) / hers.attempts.length) : "–", "Ø"],
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
      el.querySelector("span").textContent = `${u.emoji || ""} ${u.title}`;
      el.querySelectorAll("span")[1].textContent = "Ø " + avg;
      el.querySelector(".fill").style.width = avg + "%";
      box.appendChild(el);
    });
    const rec = $("#khawlaRecent");
    rec.innerHTML = "";
    const att = hers.attempts || [];
    if (!att.length) rec.innerHTML = `<li><span>Noch keine Versuche.</span></li>`;
    att.slice(-6).reverse().forEach((a) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = a.text || "";
      const s = document.createElement("span");
      s.className = "sc " + band(a.score);
      s.textContent = String(a.score);
      li.append(t, s);
      rec.appendChild(li);
    });
  }

  function renderReview() {
    const due = L.dueReviews(progress, Date.now());
    $("#reviewLead").textContent = due.length
      ? `${due.length} Satz${due.length === 1 ? "" : "sätze"} sind heute fällig. Schwache kommen zuerst.`
      : "Heute ist nichts fällig. Neue Sätze warten unter Üben. · Nothing due today.";
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
    $("#weakLead").textContent = weak.length
      ? "Die drei schwierigsten Laute, aus deinen Versuchen. · Your three hardest sounds."
      : "Nach ein paar Versuchen erscheinen hier ü, ö, ch, r und die anderen.";
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

  function renderSyncStatus() {
    const el = $("#syncStatus");
    if (!el || !session) return;
    if (!firebaseConfigured()) {
      el.textContent = isAdmin()
        ? "Cloud-Sync ist noch nicht eingerichtet."
        : "Sync ist hier noch nicht eingerichtet. Farouk kann dir einen Link schicken. Dein Üben bleibt auf diesem Gerät.";
      return;
    }
    const meta = (loadRaw(LS_SYNC, {}) || {})[session] || {};
    if (!navigator.onLine) el.textContent = "Offline – auf diesem Gerät gespeichert. Sync holt nach, sobald Netz da ist.";
    else if (meta.error) el.textContent = "Gespeichert auf diesem Gerät. Sync: " + meta.error;
    else if (meta.at) el.textContent = "Zuletzt synchronisiert · last sync: " + new Date(meta.at).toLocaleString();
    else el.textContent = "Sync ist eingerichtet und startet gleich.";
  }

  function renderSettings() {
    $("#settingsWho").textContent = isAdmin() ? "Farouk · Admin" : "Khawla";
    $("#transToggle").checked = showTrans();
    renderSyncStatus();
    $("#secureNote").textContent = window.isSecureContext
      ? "Sichere Verbindung – das Mikrofon kann benutzt werden."
      : "Keine sichere Verbindung. Das Mikrofon braucht HTTPS.";
    if (!isAdmin()) return;
    $("#keyInput").value = settings.key || "";
    $("#regionInput").value = settings.region || "";
    $("#voiceSelect").value = settings.voice;
    $("#demoToggle").checked = !!settings.demo;
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
      del.textContent = "Löschen";
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
    if ($("#view-progress").classList.contains("active")) { renderProgress(); renderKhawla(); }
    renderSyncStatus();
  }

  function showView(v) {
    if (!["practice", "review", "progress", "settings"].includes(v)) v = "practice";
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + v));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    if (v === "progress") { renderProgress(); renderKhawla(); }
    if (v === "settings") renderSettings();
    if (v === "review") renderReview();
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.scrollTo(0, 0);
  }
  const viewFromHash = () => (["practice", "review", "progress", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "practice");

  function showSentence(id) {
    if (mode === "free") mode = "path";
    currentId = id;
    const hit = L.findSentence(units(), id);
    progress.cursor = { sentenceId: id, unitId: hit ? hit.unit.id : (progress.cursor && progress.cursor.unitId), at: Date.now() };
    progress.updatedAt = Date.now();
    saveProgress(session, progress);
    hideResult();
    renderPractice();
    renderHeader();
  }

  function goWeiter() {
    if (mode === "review" || mode === "drill") {
      const i = queue.indexOf(currentId);
      const next = queue[i + 1];
      if (next) { showSentence(next); return; }
      toast(mode === "review" ? "Wiederholung geschafft! 🌷" : "Laut-Drill geschafft! 🐝");
      mode = "path";
      queue = [];
    }
    const id = L.nextUpId(units(), progress, mode === "free" ? null : currentId, isAdmin(), Date.now());
    if (!id || id === currentId) { toast("Du bist auf dem neuesten Stand. 🌟"); return; }
    const list = units();
    const idx = list.findIndex((u) => (u.sentences || []).some((s) => s.id === id));
    if (idx >= 0 && !isAdmin() && !L.isUnlocked(idx, list, progress)) {
      toast("Die nächste Lektion ist noch zu. Ø 80 in dieser Lektion öffnet sie.");
      return;
    }
    mode = "path";
    showSentence(id);
    $("#sentenceCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function recordAttempt(c, score, demo, sounds) {
    const now = Date.now();
    const id = (crypto.randomUUID && crypto.randomUUID()) || ("att-" + now + "-" + Math.random().toString(16).slice(2));
    progress.attempts.push({ id, sentenceId: c.id, text: c.de, score, at: now, demo: !!demo, sounds: sounds || [] });
    if (progress.attempts.length > L.ATTEMPT_CAP) progress.attempts = progress.attempts.slice(-L.ATTEMPT_CAP);
    const prevScore = L.bestScore(progress, c.id);
    if (prevScore == null || score > prevScore) progress.best[c.id] = { score, at: now };
    progress.reviews[c.id] = L.scheduleReview(progress.reviews[c.id], score, now);
    progress.updatedAt = now;
    progress.cursor = { sentenceId: c.id, unitId: c.unit ? c.unit.id : null, at: now };
    saveProgress(session, progress);
    schedulePush();
    const prevStars = prevScore == null ? 0 : starsFor(prevScore);
    return { newStars: Math.max(0, starsFor(score) - prevStars), improved: prevScore != null && score > prevScore };
  }

  /* ---------------- Azure (unchanged behaviour) ---------------- */
  let sdkPromise;
  function loadSdk() {
    if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "vendor/speech-sdk-1.52.0.min.js";
        s.onload = () => (window.SpeechSDK ? res(window.SpeechSDK) : rej(new Error("SDK not found")));
        s.onerror = () => { sdkPromise = null; rej(new Error("Speech SDK konnte nicht geladen werden")); };
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
      if (!("speechSynthesis" in window)) return reject(new Error("Keine Sprachausgabe im Browser"));
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
      if (!useDemo() && hasKey()) {
        try {
          const url = await azureTts(text, slow);
          currentAudio = new Audio(url);
          await currentAudio.play();
          return;
        } catch (e) {
          console.warn("Azure TTS failed, using browser voice:", e);
          toast("Azure-Stimme nicht verfügbar – Browser-Stimme 🔈");
        }
      }
      await browserTts(text, slow);
    } catch (e) {
      console.warn(e);
      toast("Audio konnte nicht abgespielt werden 😕");
    } finally { if (btn) btn.disabled = false; }
  }

  let state = "idle";
  let activeRecognizer = null;
  let cancelled = false;
  function setState(s, status, hint) {
    state = s;
    document.body.classList.toggle("listening", s === "listening");
    document.body.classList.toggle("thinking", s === "thinking");
    if (status != null) $("#status").textContent = status;
    if (hint != null) $("#hint").textContent = hint;
    $("#recordBtn").setAttribute("aria-label", s === "listening" ? "Stopp · Stop" : "Aufnehmen · Record");
    setMood(s === "listening" ? "listen" : null);
  }
  async function onRecord() {
    const c = current();
    if (!c.de || !c.id) { toast("Wähl einen Satz oder schreib einen. ✏️"); return; }
    if (state === "listening") { cancelListening(); return; }
    if (state !== "idle") return;
    cancelled = false;
    if (currentAudio) currentAudio.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    try {
      let result;
      if (useDemo()) {
        setState("listening", "Ich höre zu… 👂 (Demo)", hasKey() ? "Sprich jetzt – Demo simuliert. · Simulated." : "Kein Azure-Schlüssel auf diesem Gerät – Demo. · No key on this device, so this is a demo.");
        await sleep(1400);
        if (cancelled) return;
        setState("thinking", "Ich bewerte… 🐝", "Einen Moment");
        await sleep(500);
        result = simulate(c.de);
      } else {
        result = await assessAzure(c.de);
        if (!result) return;
      }
      setState("idle", "Tippen & sprechen · Tap & speak", "Nochmal? Übung macht die Meisterin! 🐹");
      showResult(c, result);
    } catch (e) {
      if (cancelled) return;
      console.warn(e);
      setState("idle", "Oh nein! 🙈", friendlyError(e));
    }
  }
  function cancelListening() {
    cancelled = true;
    if (activeRecognizer) { try { activeRecognizer.close(); } catch {} activeRecognizer = null; }
    setState("idle", "Abgebrochen · Cancelled", "Tippe nochmal, wenn du bereit bist.");
  }
  function friendlyError(e) {
    const m = String((e && e.message) || e);
    if (/secure|https/i.test(m)) return "Das Mikrofon braucht HTTPS (oder localhost).";
    if (/NotAllowed|Permission|denied/i.test(m)) return "Bitte erlaube den Mikrofon-Zugriff 🎤";
    if (/NotFound|no.*device/i.test(m)) return "Kein Mikrofon gefunden.";
    if (/1006|Unable to contact server|ConnectionFailure/i.test(m)) return "Keine Verbindung zu Azure – Schlüssel, Region, Internet prüfen.";
    if (/401|403|unauthori|forbidden|authentication/i.test(m)) return "Azure-Schlüssel oder Region stimmt nicht.";
    if (/nichts gehört|NoMatch/i.test(m)) return "Ich habe nichts gehört 🙉";
    return m.length < 160 ? m : "Etwas ist schiefgelaufen.";
  }
  async function ensureMic() {
    if (!window.isSecureContext) throw new Error("Mic needs a secure context (HTTPS)");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Kein Mikrofon-Zugriff in diesem Browser");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  }
  async function assessAzure(referenceText) {
    setState("thinking", "Einen Moment… 🐝", "Mikrofon wird vorbereitet");
    await ensureMic();
    const sdk = await loadSdk();
    const cfg = speechConfig(sdk);
    cfg.speechRecognitionLanguage = "de-DE";
    cfg.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1500");
    cfg.outputFormat = sdk.OutputFormat.Detailed;
    const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const pa = new sdk.PronunciationAssessmentConfig(referenceText, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true);
    pa.phonemeAlphabet = "IPA";
    if (settings.prosody) pa.enableProsodyAssessment = true;
    const rec = new sdk.SpeechRecognizer(cfg, audio);
    pa.applyTo(rec);
    activeRecognizer = rec;
    setState("listening", "Ich höre zu… 👂", "Lies den Satz jetzt laut vor.");
    const r = await new Promise((resolve, reject) => {
      rec.canceled = (_, ev) => { if (ev.reason === sdk.CancellationReason.Error) reject(new Error(`${ev.errorCode}: ${ev.errorDetails}`)); };
      rec.recognizeOnceAsync(resolve, (err) => reject(new Error(err)));
    }).finally(() => { try { rec.close(); } catch {} if (activeRecognizer === rec) activeRecognizer = null; });
    if (cancelled) return null;
    setState("thinking", "Ich bewerte… 🐝", "Einen Moment");
    if (r.reason === sdk.ResultReason.NoMatch) throw new Error("Ich habe nichts gehört (NoMatch)");
    if (r.reason === sdk.ResultReason.Canceled) {
      const cd = sdk.CancellationDetails.fromResult(r);
      throw new Error(`${cd.ErrorCode || cd.errorCode || ""} ${cd.errorDetails || "Abgebrochen"}`);
    }
    const json = JSON.parse(r.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) || "{}");
    return parseAzure(json, referenceText, r.text);
  }
  function parseAzure(json, referenceText, heard) {
    const best = (json.NBest && json.NBest[0]) || {};
    const pa = best.PronunciationAssessment || {};
    const refTokens = referenceText.split(/\s+/).filter(Boolean);
    let ri = 0;
    const words = (best.Words || []).map((w) => {
      const wpa = w.PronunciationAssessment || {};
      const error = wpa.ErrorType || "None";
      let display = w.Word;
      if (error !== "Insertion") {
        for (let k = ri; k < Math.min(refTokens.length, ri + 3); k++) {
          if (L.norm(refTokens[k]) === L.norm(w.Word)) { display = refTokens[k].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); ri = k + 1; break; }
        }
      }
      const phonemes = (w.Phonemes || []).map((p) => ({ p: p.Phoneme || "", score: round(p.PronunciationAssessment ? p.PronunciationAssessment.AccuracyScore : p.AccuracyScore) }));
      let labels = "azure";
      if (phonemes.length && phonemes.every((p) => !p.p)) {
        const guess = g2p(display);
        if (guess.length === phonemes.length) { phonemes.forEach((p, i) => (p.p = guess[i])); labels = "guess"; }
        else { phonemes.forEach((p, i) => (p.p = "")); labels = "numbered"; }
      }
      return { word: display, score: round(wpa.AccuracyScore ?? 0), error, phonemes, labels };
    });
    return {
      demo: false,
      heard: heard || best.Display || "",
      scores: { pron: round(pa.PronScore), accuracy: round(pa.AccuracyScore), fluency: round(pa.FluencyScore), completeness: round(pa.CompletenessScore), prosody: round(pa.ProsodyScore) },
      words,
    };
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
  const tricky = (w) => (/[äöüß]|ch|r|eu|äu|z/i.test(w) ? 1 : 0) + (w.length > 9 ? 1 : 0);
  function simulate(text) {
    const tokens = text.split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
    const base = 72 + Math.random() * 22;
    const words = tokens.map((t, idx) => {
      if (tokens.length > 5 && idx > 0 && Math.random() < 0.05) return { word: t, score: 0, error: "Omission", phonemes: [] };
      const s = clamp(Math.round(base + (Math.random() * 24 - 14) - tricky(t) * (6 + Math.random() * 12)), 25, 100);
      const phonemes = g2p(t).map((p) => ({ p, score: clamp(Math.round(s + (Math.random() * 30 - 16)), 10, 100) }));
      return { word: t, score: s, error: s < 60 ? "Mispronunciation" : "None", phonemes };
    });
    const spoken = words.filter((w) => w.error !== "Omission");
    const accuracy = Math.round(spoken.reduce((a, w) => a + w.score, 0) / Math.max(1, spoken.length));
    const completeness = Math.round((spoken.length / Math.max(1, words.length)) * 100);
    const fluency = clamp(Math.round(base + Math.random() * 14 - 4), 40, 100);
    const prosody = clamp(Math.round(base + Math.random() * 12 - 8), 40, 100);
    const pron = Math.round(accuracy * 0.4 + fluency * 0.2 + completeness * 0.2 + prosody * 0.2);
    return { demo: true, heard: spoken.map((w) => w.word).join(" "), scores: { pron, accuracy, fluency, completeness, prosody }, words };
  }

  const MESSAGES = [
    [90, ["Wunderbar! 🌟", "Wonderful!"], ["Perfekt! Das Wasserschwein ist stolz! 🐹", "Perfect!"]],
    [80, ["Super gemacht! 🎉", "Great job!"], ["Klasse! Das klingt richtig deutsch! 🐝", "That sounds really German!"]],
    [70, ["Sehr gut! Fast perfekt. 💪", "Very good."], ["Toll! Noch ein kleines bisschen. ✨", "Just a tiny bit more."]],
    [60, ["Gut! Weiter so! 🌱", "Good! Keep going!"], ["Schön! Mit Übung wird es besser. 🌷", "It'll get better with practice."]],
    [0, ["Kein Problem – Übung macht die Meisterin! 💛", "Practice makes perfect!"], ["Mutig! Hör nochmal zu. 🐹", "Listen again and try once more."]],
  ];
  let lastResult = null;
  function showResult(c, res) {
    lastResult = res;
    const s = res.scores;
    const pron = s.pron ?? s.accuracy ?? 0;
    const sounds = L.soundSamples(c.de, res.words, pron, window.SOUND_PATTERNS || []);
    const { newStars, improved } = recordAttempt(c, pron, res.demo, sounds);
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
    const [, ...variants] = MESSAGES.find(([min]) => pron >= min);
    const [de, en] = pick(variants);
    const weakest = res.words.filter((w) => w.error !== "Insertion" && w.error !== "Omission").sort((a, b) => a.score - b.score)[0];
    $("#msgDe").textContent = de + (improved ? " Neuer Rekord! 🏆" : "");
    $("#msgEn").textContent = en + (weakest && weakest.score < 80 ? ` · Tipp: übe „${weakest.word}“` : "");
    const bars = $("#bars");
    bars.innerHTML = "";
    [["accuracy", "Genauigkeit", "Accuracy"], ["fluency", "Flüssigkeit", "Fluency"], ["completeness", "Vollständigkeit", "Completeness"], ["prosody", "Prosodie", "Prosody"]].forEach(([k, labelDe, labelEn]) => {
      const v = s[k];
      const el = document.createElement("div");
      el.className = "bar" + (v == null ? " na" : "");
      el.innerHTML = `<span class="name">${labelDe} <small>${labelEn}</small></span><span class="val">${v == null ? "n/a" : v}</span><div class="track"><div class="fill"></div></div>`;
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
    $("#heard").textContent = res.heard ? `${res.demo ? "Demo · " : ""}Gehört: „${res.heard}“` : "";
    if (st >= 2 || newStars > 0) {
      setMood("happy");
      confetti(st >= 3 ? 140 : 80);
      floatEmojis(st >= 3 ? ["🌟", "🐹", "🐝", "💖"] : ["⭐", "🐝"]);
    } else if (st >= 1) setMood("happy");
    const rev = progress.reviews[c.id];
    if (rev && rev.due) {
      const when = new Date(rev.due);
      $("#hint").textContent = rev.mastered
        ? "Gemeistert – die nächste Wiederholung ist später. 🌟"
        : `Wiederholung am ${when.toLocaleDateString()} · review scheduled`;
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
    sc.textContent = w.error === "Omission" ? "ausgelassen" : w.error === "Insertion" ? "extra" : `${w.score} / 100`;
    const errText = {
      None: w.score >= 80 ? "Sehr schön ausgesprochen!" : "Schau dir die Laute an.",
      Mispronunciation: "Die roten Laute brauchen noch Übung.",
      Omission: "Dieses Wort habe ich nicht gehört.",
      Insertion: "Dieses Wort steht nicht im Satz.",
    };
    $("#sheetError").textContent = errText[w.error] || w.error || "";
    const ph = $("#phonemes");
    ph.innerHTML = "";
    if (!w.phonemes.length) ph.innerHTML = `<p class="muted">Keine Laut-Details.</p>`;
    w.phonemes.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "ph " + band(p.score ?? 0);
      const b = document.createElement("b");
      b.textContent = p.p ? `/${p.p}/` : `Laut ${i + 1}`;
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
      el.onerror = () => rej(new Error("Firebase-Skript nicht geladen"));
      document.head.appendChild(el);
    });
  }
  async function ensureFirebase() {
    if (!firebaseConfigured()) throw new Error("Sync ist noch nicht eingerichtet.");
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
  async function writeRemote(userId, prog) {
    await signInRole(authRole());
    const data = JSON.parse(JSON.stringify({
      schema: 2,
      best: prog.best || {},
      attempts: prog.attempts || [],
      reviews: prog.reviews || {},
      cursor: prog.cursor || null,
      showTrans: prog.showTrans || { value: true, at: 0 },
      clearedAt: prog.clearedAt || 0,
      updatedAt: Date.now(),
    }));
    await fbDb.collection("users").doc(userId).set(data);
    return data.updatedAt;
  }
  function setSyncMeta(user, patch) {
    const all = loadRaw(LS_SYNC, {}) || {};
    all[user] = Object.assign({}, all[user] || {}, patch);
    saveRaw(LS_SYNC, all);
  }
  function friendlySync(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email/i.test(m)) return "Anmeldung fehlgeschlagen. Sync-Passwort und die Nutzer farouk@aussprache.app und khawla@aussprache.app prüfen.";
    if (/permission-denied/i.test(m)) return "Firestore-Regeln haben den Zugriff abgelehnt.";
    if (/offline|network|unavailable|Failed to get/i.test(m)) return "Keine Verbindung.";
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
  async function syncUser(userId, applyCursor) {
    const remote = await fetchRemote(userId);
    const local = loadProgress(userId);
    const merged = L.mergeProgress(local, remote);
    saveProgress(userId, merged);
    if (userId === session) progress = loadProgress(session);
    if (!remote || L.contentKey(merged) !== L.contentKey(remote)) {
      const at = await writeRemote(userId, loadProgress(userId));
      const saved = loadProgress(userId);
      saved.updatedAt = at;
      saveProgress(userId, saved);
      if (userId === session) progress = saved;
    }
    if (applyCursor && progress.cursor && progress.cursor.sentenceId && L.findSentence(units(), progress.cursor.sentenceId)) {
      currentId = progress.cursor.sentenceId;
    }
    setSyncMeta(userId, { ok: true, at: Date.now(), remoteUpdatedAt: (remote && remote.updatedAt) || 0, error: "" });
  }
  async function syncNow() {
    if (!session || !firebaseConfigured()) { renderSyncStatus(); return; }
    if (syncing) return;
    syncing = true;
    try {
      await syncUser(session, !booted);
      await pullCatalog();
      booted = true;
      renderAll();
    } catch (e) {
      console.warn(e);
      booted = true;
      setSyncMeta(session, { ok: false, at: Date.now(), error: friendlySync(e) });
      renderSyncStatus();
    } finally { syncing = false; }
  }
  function schedulePush() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, 1200);
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
    if (!obj || obj.kind !== "aussprache-backup") throw new Error("Das ist keine Aussprache-Datei.");
    if (isAdmin() && obj.users) {
      ["khawla", "farouk"].forEach((id) => {
        if (obj.users[id]) saveProgress(id, L.mergeProgress(loadProgress(id), obj.users[id]));
      });
    } else if (obj.progress) {
      const target = obj.user === "farouk" || obj.user === "khawla" ? obj.user : session;
      if (!isAdmin() && target !== session) throw new Error("Du kannst nur deinen eigenen Fortschritt importieren.");
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
      if (typeof s.demo === "boolean") settings.demo = s.demo;
      if (typeof s.prosody === "boolean") settings.prosody = s.prosody;
      if (s.firebase) settings.firebase = Object.assign(settings.firebase, s.firebase);
      if (s.syncPassword) settings.syncPassword = s.syncPassword;
      saveSettings();
      fbReady = null; fbDb = null; fbAuth = null;
    }
    progress = loadProgress(session);
    currentId = (progress.cursor && progress.cursor.sentenceId) || L.resumeId(units(), progress);
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
      currentId = L.resumeId(units(), progress);
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
    settings.demo = $("#demoToggle").checked;
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
    const g = h < 11 ? "Guten Morgen ☀️" : h < 17 ? "Schön, dass du da bist! 🌼" : "Guten Abend 🌙";
    const s = computeStreak(progress);
    $("#helloSub").textContent = s >= 2 ? `🔥 ${s} Tage in Folge – weiter so!` : g;
  }
  function enterApp(user) {
    session = user;
    saveRaw(LS_SESSION, { user });
    progress = loadProgress(user);
    document.body.dataset.role = isAdmin() ? "admin" : "learner";
    $("#gate").hidden = true;
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#app").hidden = false;
    mode = "path";
    queue = [];
    currentId = L.resumeId(units(), progress);
    bindApp();
    renderAll();
    greet();
    showView(viewFromHash());
    syncNow().catch(() => {});
  }
  function logout() {
    localStorage.removeItem(LS_SESSION);
    session = null;
    $("#app").hidden = true;
    document.body.removeAttribute("data-role");
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#gate").hidden = false;
    $("#nameInput").value = "";
    $("#nameError").textContent = "";
  }
  function onName() {
    const n = $("#nameInput").value.trim().toLowerCase();
    $("#nameError").textContent = "";
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
    $("#nameError").textContent = "Ich kenne nur Khawla und Farouk.";
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
    $("#againBtn").onclick = () => { hideResult(); onRecord(); };
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
    $("#recordBtn").onclick = onRecord;
    $("#freeToggle").onclick = () => {
      mode = mode === "free" ? "path" : "free";
      if (mode === "free") freeText = $("#customInput").value;
      hideResult();
      renderPractice();
    };
    $("#useCustom").onclick = () => {
      freeText = $("#customInput").value.trim().replace(/\s+/g, " ");
      if (!freeText) { toast("Schreib einen deutschen Satz."); return; }
      mode = "free";
      hideResult();
      renderPractice();
      toast("Bereit! Mikro antippen 🎤");
    };
    $("#customInput").addEventListener("input", (e) => { freeText = e.target.value; $("#recordBtn").disabled = !freeText.trim(); });
    $("#sheetClose").onclick = closeSheet;
    $("#sheetBackdrop").onclick = closeSheet;
    $("#sheetPlay").onclick = (e) => sheetWord && speak(sheetWord.word, true, e.currentTarget);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    $("#startReview").onclick = () => {
      const due = L.dueReviews(progress, Date.now()).map((r) => r.sentenceId).filter((id) => textFor(id).de);
      if (!due.length) { toast("Heute ist nichts fällig. 🌷"); return; }
      mode = "review";
      queue = due;
      showSentence(due[0]);
      showView("practice");
    };
    $("#startDrill").onclick = () => {
      const ids = L.drillSentenceIds(units(), progress, window.SOUND_PATTERNS, 6);
      if (!ids.length) { toast("Üb erst ein paar Sätze, dann kenn ich deine Laute."); return; }
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
    $("#exportMine").onclick = exportMine;
    $("#importMine").onclick = () => $("#importFile").click();
    $("#importFile").onchange = () => {
      const file = $("#importFile").files && $("#importFile").files[0];
      $("#importFile").value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { importBackup(JSON.parse(String(reader.result || ""))); toast("Importiert und zusammengeführt. ✅"); }
        catch (e) { toast(e.message || "Import fehlgeschlagen"); }
      };
      reader.readAsText(file);
    };
    $("#saveSettings").onclick = () => {
      readAdminForm();
      $("#settingsStatus").textContent = !settings.demo && !hasKey() ? "Ohne Schlüssel läuft automatisch der Demo-Modus." : "Gespeichert.";
      renderHeader();
    };
    $("#demoToggle").onchange = () => { if (isAdmin()) { readAdminForm(); renderHeader(); } };
    $("#testConn").onclick = async () => {
      readAdminForm();
      const st = $("#settingsStatus");
      if (!hasKey()) { st.textContent = "Bitte Schlüssel und Region eintragen."; return; }
      st.textContent = "Teste…";
      try {
        ttsCache.clear();
        const who = session === "farouk" ? "Farouk" : "Khawla";
        const url = await azureTts(`Hallo ${who}! Die Verbindung funktioniert.`, false);
        st.textContent = "Verbindung ok. Azure spricht.";
        new Audio(url).play().catch(() => {});
      } catch (e) { st.textContent = friendlyError(e); }
    };
    $("#showKey").onclick = () => { const i = $("#keyInput"); i.type = i.type === "password" ? "text" : "password"; };
    $("#saveSync").onclick = () => {
      readSyncForm();
      if (!firebaseConfigured()) {
        $("#syncAdminStatus").textContent = "Es fehlen noch Felder oder das Passwort.";
        renderSyncStatus();
        return;
      }
      location.reload();
    };
    $("#testSync").onclick = async () => {
      readSyncForm();
      const st = $("#syncAdminStatus");
      st.textContent = "Teste Anmeldung…";
      try {
        await syncNow();
        st.textContent = "Sync ok. Fortschritt liegt in users/" + session + ".";
      } catch (e) { st.textContent = friendlySync(e); }
    };
    $("#makeSetup").onclick = () => {
      readSyncForm();
      if (!firebaseConfigured()) { toast("Zuerst Firebase-Daten und Passwort speichern."); return; }
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
        toast("QR ging nicht – den Link kannst du trotzdem kopieren.");
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
      if (!title || !sentences.length) { toast("Titel und mindestens eine Zeile „Deutsch | Englisch“."); return; }
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
      toast("Lektion liegt am Ende des Pfads.");
      pushCatalog().catch((e) => toast(friendlySync(e)));
    };
    $("#exportAll").onclick = exportAll;
    $("#resetMine").onclick = () => { if (confirm("Deinen Fortschritt wirklich löschen?")) resetUser(session); };
    $("#resetKhawla").onclick = () => { if (confirm("Khawlas Fortschritt auf diesem Gerät und in der Cloud löschen?")) resetUser("khawla"); };
    $("#refreshKhawla").onclick = async () => {
      $("#khawlaSync").textContent = "Hole Khawlas Stand…";
      try {
        if (!firebaseConfigured()) throw new Error("Sync ist noch nicht eingerichtet.");
        await syncUser("khawla", false);
        toast("Khawlas Fortschritt ist da.");
      } catch (e) {
        setSyncMeta("khawla", { ok: false, at: Date.now(), error: friendlySync(e) });
        toast(friendlySync(e));
      }
      renderKhawla();
    };
    window.addEventListener("hashchange", () => { if (session) showView(viewFromHash()); });
    document.addEventListener("visibilitychange", () => { if (session) syncNow().catch(() => {}); });
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

  function init() {
    migrate();
    consumeSetup();
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
    bindGate();
    const saved = loadRaw(LS_SESSION, null);
    if (saved && (saved.user === "khawla" || saved.user === "farouk")) enterApp(saved.user);
    if ("serviceWorker" in navigator && window.isSecureContext && !/[?&]nosw/.test(location.search)) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
    }
  }
  init();

  window.__khawla = {
    simulate, g2p, moveNo, nearNo,
    get units() { return units(); },
    get progress() { return progress; },
    get settings() { return settings; },
  };
})();
