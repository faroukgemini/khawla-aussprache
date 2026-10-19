/* Hidden grammar beta. Storage keys start with grammar-beta. and nothing else. */
(function () {
  "use strict";
  const G = window.GrammarBeta;
  const I = window.GrammarI18n;
  const course = G.buildCourse();
  const units = course.units;
  const items = course.items;
  const byId = {};
  items.forEach((it) => { byId[it.id] = it; });
  const byUnit = {};
  units.forEach((u) => { byUnit[u.id] = u; });

  const K = {
    session: "grammar-beta.session",
    settings: "grammar-beta.settings",
    uilang: "grammar-beta.uilang",
    pet: "grammar-beta.pet",
  };
  const progressKey = (user) => "grammar-beta.progress." + user;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let lang = "en";
  let session = null;
  let progress = null;
  let settings = { geminiKey: "", azureKey: "", azureRegion: "northeurope" };
  let placeRun = null;
  let answered = false;

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function emptyProgress() {
    return { v: 1, correct: {}, attempts: {}, review: {}, unlockThrough: 0, placementDone: false };
  }
  function t(key, vars) { return I.t(lang, key, vars); }
  function bi(obj) {
    if (!obj) return "";
    return lang === "de" ? (obj.de || obj.en || "") : (obj.en || obj.de || "");
  }
  function list(obj) {
    const arr = lang === "de" ? obj.de : obj.en;
    return Array.isArray(arr) ? arr : [];
  }

  function readLang() {
    const v = localStorage.getItem(K.uilang);
    lang = v === "de" || v === "en" ? v : "en";
    document.documentElement.lang = lang;
  }
  function setLang(next) {
    lang = next === "de" ? "de" : "en";
    localStorage.setItem(K.uilang, lang);
    document.documentElement.lang = lang;
    paintStatic();
    render();
  }
  function paintStatic() {
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"))); });
    document.querySelectorAll("[data-lang]").forEach((b) => {
      const on = b.getAttribute("data-lang") === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const tabs = { home: "home", review: "review", weak: "weak", place: "place", about: "about" };
    const route = parseHash();
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.getAttribute("data-go") === (tabs[route.a] || "")));
  }

  function dueItems() {
    const now = Date.now();
    return Object.keys(progress.review || {}).filter((id) => byId[id] && progress.review[id].due <= now);
  }
  function unitIndex(id) { return units.findIndex((u) => u.id === id); }
  function openUnit(i) { return G.isUnitOpen(i, units, progress, session); }
  function mastery(u) { return G.unitMastery(u, progress.correct); }
  function correctCount(u) { return u.itemIds.filter((id) => progress.correct[id]).length; }

  function record(item, ok, mode) {
    progress.attempts[item.unitId] = (progress.attempts[item.unitId] || 0) + 1;
    if (ok) progress.correct[item.id] = 1;
    if (mode === "review") {
      const nxt = G.nextReview(progress.review[item.id], ok, Date.now());
      if (nxt) progress.review[item.id] = nxt;
      else delete progress.review[item.id];
    } else if (!ok) {
      progress.review[item.id] = G.nextReview(progress.review[item.id], false, Date.now());
    }
    save(progressKey(session), progress);
  }

  function parseHash() {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "");
    const bits = raw.split("/").filter(Boolean);
    return { a: bits[0] || "home", b: decodeURIComponent(bits[1] || ""), c: bits[2] || "" };
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function render() {
    if (!session) return;
    paintStatic();
    const route = parseHash();
    const view = $("#view");
    view.setAttribute("data-screen", route.a);
    if (route.a === "u") renderLesson(view, route.b);
    else if (route.a === "q" || route.a === "r") renderExercise(view, route.b, route.a === "r" ? "review" : "unit");
    else if (route.a === "review") renderReview(view);
    else if (route.a === "weak") renderWeak(view);
    else if (route.a === "place") renderPlace(view);
    else if (route.a === "tutor") renderTutor(view, route.b);
    else if (route.a === "about") renderAbout(view);
    else if (route.a === "settings") renderSettings(view);
    else renderHome(view);
    window.scrollTo(0, 0);
  }

  function renderHome(view) {
    const due = dueItems().length;
    const place = progress.placementDone ? "" : `<article class="card"><h2>${esc(t("home.place"))}</h2><p>${esc(t("home.placeLead"))}</p><button class="btn btn-primary" type="button" data-go="place">${esc(t("place.start"))}</button></article>`;
    const tutor = settings.geminiKey
      ? `<article class="card"><h2>${esc(t("home.tutor"))}</h2><button class="btn btn-primary" type="button" data-go="tutor">${esc(t("tutor.send"))}</button></article>`
      : `<article class="card"><p class="muted">${esc(t("home.tutorOff"))}</p></article>`;
    const cards = units.map((u, i) => {
      const locked = !openUnit(i);
      const pct = Math.round(mastery(u) * 100);
      return `<button type="button" class="unit-card${locked ? " locked" : ""}${pct >= 85 ? " done" : ""}" data-unit="${esc(u.id)}">
        <span class="lvl">${esc(u.level)} · ${esc(u.topic)}</span>
        <h2>${esc(bi(u.title))}</h2>
        <div class="track" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <small>${esc(t("unit.mastery", { ok: correctCount(u), n: u.itemIds.length, pct }))}</small>
      </button>`;
    }).join("");
    view.innerHTML = `<p class="muted">${esc(t("home.lead"))}</p>
      <article class="card"><h2>${esc(t("home.review"))}</h2><p>${esc(due ? t("home.due", { n: due }) : t("home.none"))}</p>
      <button class="btn" type="button" data-go="review">${esc(t("review.go"))}</button></article>
      ${place}${tutor}
      <div class="unit-list">${cards}</div>`;
    view.querySelectorAll("[data-unit]").forEach((btn) => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-unit");
      const i = unitIndex(id);
      if (!openUnit(i)) { toast(t("unit.locked")); return; }
      go("#/u/" + id);
    }));
    bindGo(view);
    $("#helloTitle").textContent = t("home.hi");
  }

  function renderLesson(view, id) {
    const u = byUnit[id];
    if (!u) { go("#/home"); return; }
    const i = unitIndex(id);
    if (!openUnit(i)) { toast(t("unit.locked")); go("#/home"); return; }
    const pct = Math.round(mastery(u) * 100);
    const examples = (u.examples || []).map((row) => `<p class="example-row">${row.map(tokenHtml).join(" ")}</p>`).join("");
    const table = u.table ? `<h3>${esc(t("unit.table"))}</h3><table class="gtable"><thead><tr>${u.table.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${u.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
    const compare = u.compare ? `<div class="compare"><h3>${esc(t("unit.compare"))}</h3><p>${esc(bi(u.compare))}</p></div>` : "";
    const tutorBtn = settings.geminiKey ? `<button class="btn" type="button" id="tutorFromUnit">${esc(t("home.tutor"))}</button>` : "";
    view.innerHTML = `<p class="lvl">${esc(u.level)}</p><h2>${esc(bi(u.title))}</h2>
      <p>${esc(bi(u.blurb))}</p>
      <p class="muted">${esc(t("unit.mastery", { ok: correctCount(u), n: u.itemIds.length, pct }))}</p>
      <div class="dw"><a class="btn btn-primary" id="dwLink" href="${esc(u.dw.url)}" target="_blank" rel="noopener noreferrer">${esc(t("unit.watch"))}</a><small>${esc(u.dw.title)}</small></div>
      ${examples ? `<h3>${esc(t("unit.examples"))}</h3>${examples}` : ""}
      ${table}
      <h3>${esc(t("unit.points"))}</h3><ul>${list(u.points).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <h3>${esc(t("unit.mistakes"))}</h3><ul>${list(u.mistakes).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      ${compare}
      <div class="row"><button class="btn btn-primary" type="button" id="startPractice">${esc(t("unit.practice"))}</button>${tutorBtn}</div>`;
    $("#helloTitle").textContent = bi(u.title);
    $("#startPractice").onclick = () => go("#/q/" + u.itemIds[0]);
    const tutor = $("#tutorFromUnit");
    if (tutor) tutor.onclick = () => go("#/tutor/" + u.id);
  }
  function tokenHtml(b) {
    const cls = ["ex"];
    if (b.g) cls.push("g-" + b.g);
    if (b.kase) cls.push("k-" + b.kase);
    if (b.verb) cls.push("verb");
    return `<span class="${cls.join(" ")}">${esc(b.t)}</span>`;
  }

  function renderExercise(view, id, mode) {
    const item = byId[id];
    if (!item) { go("#/home"); return; }
    const u = byUnit[item.unitId];
    if (mode === "unit" && !openUnit(unitIndex(u.id))) { go("#/home"); return; }
    answered = false;
    const pos = u.itemIds.indexOf(item.id) + 1;
    view.innerHTML = `<p class="muted">${esc(bi(u.title))} · ${pos}/${u.itemIds.length}</p>
      <h2>${esc(bi(item.prompt))}</h2>
      <div id="exBody"></div>
      <div id="feedback"></div>`;
    $("#helloTitle").textContent = bi(u.title);
    const body = $("#exBody");
    if (item.type === "choice") renderChoice(body, item, mode);
    else if (item.type === "order") renderOrder(body, item, mode);
    else if (item.type === "spot") renderSpot(body, item, mode);
    else renderTyped(body, item, mode);
  }

  function showFeedback(item, result, mode) {
    answered = true;
    const box = $("#feedback");
    const why = result.ok ? (bi(item.explain)) : (result.why ? (lang === "de" ? result.why.de : result.why.en) : bi(item.explain));
    box.innerHTML = `<div class="fb ${result.ok ? "good" : "bad"}">
      <p><strong>${esc(result.ok ? t("ex.right") : t("ex.wrong"))}</strong></p>
      <p class="ans">${esc(t("ex.answer"))}: ${esc(item.answers[0])}</p>
      <p>${esc(why)}</p>
      <button class="btn btn-primary" type="button" id="nextEx">${esc(t("ex.next"))}</button>
    </div>`;
    $("#nextEx").onclick = () => nextAfter(item, mode);
  }
  function finishAttempt(item, user, mode) {
    if (answered) return;
    const result = G.grade(item, user);
    record(item, result.ok, mode);
    showFeedback(item, result, mode);
  }
  function nextAfter(item, mode) {
    if (mode === "review") {
      const due = dueItems().filter((id) => id !== item.id);
      if (due.length) go("#/r/" + due[0]);
      else go("#/review");
      return;
    }
    const u = byUnit[item.unitId];
    const i = u.itemIds.indexOf(item.id);
    if (i >= 0 && i < u.itemIds.length - 1) go("#/q/" + u.itemIds[i + 1]);
    else {
      const pct = Math.round(mastery(u) * 100);
      const nxt = units[unitIndex(u.id) + 1];
      $("#view").innerHTML = `<article class="card"><h2>${esc(t("unit.done"))}</h2><p>${esc(bi(u.title))}</p><p>${esc(t("unit.mastery", { ok: correctCount(u), n: u.itemIds.length, pct }))}</p>
        <button class="btn" type="button" id="backUnits">${esc(t("unit.back"))}</button>
        ${nxt && openUnit(unitIndex(nxt.id)) ? `<button class="btn btn-primary" type="button" id="nextUnit">${esc(t("unit.next"))}</button>` : ""}</article>`;
      $("#backUnits").onclick = () => go("#/home");
      const nbtn = $("#nextUnit");
      if (nbtn) nbtn.onclick = () => go("#/u/" + nxt.id);
    }
  }

  function renderChoice(body, item, mode) {
    const stim = item.stimulus ? `<p class="prompt-line">${esc(item.stimulus)}</p>` : "";
    body.innerHTML = stim + `<div class="choice-grid">${item.choices.map((c, i) => `<button type="button" class="btn" data-i="${i}">${esc(c)}</button>`).join("")}</div>`;
    body.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      if (answered) return;
      finishAttempt(item, item.choices[Number(btn.getAttribute("data-i"))], mode);
    }));
  }
  function renderTyped(body, item, mode) {
    const stim = item.type === "transform"
      ? `<p class="prompt-line">${esc(item.sourceText || item.stimulus)}</p><p class="muted">${esc(t("ex.transform"))}</p>`
      : (item.stimulus ? `<p class="prompt-line">${esc(item.stimulus)}</p>` : "");
    const listen = item.type === "listen" ? `<button class="btn" type="button" id="playBtn">${esc(t("ex.listen"))}</button>` : "";
    body.innerHTML = `${stim}${listen}
      <p class="muted">${esc(t("ex.gap"))} ${esc(t("ex.nouns"))}</p>
      <div class="umlauts">${["ä", "ö", "ü", "ß"].map((ch) => `<button type="button" data-ch="${ch}">${ch}</button>`).join("")}</div>
      <input class="gap-input" id="gapInput" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <div class="row"><button class="btn btn-primary" type="button" id="checkBtn">${esc(t("ex.check"))}</button></div>`;
    const input = $("#gapInput");
    body.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => insertChar(input, b.getAttribute("data-ch"))));
    const submit = () => finishAttempt(item, input.value, mode);
    $("#checkBtn").onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    const play = $("#playBtn");
    if (play) play.onclick = () => speak(item.audio || item.answers[0]);
  }
  function insertChar(input, ch) {
    const s = input.selectionStart == null ? input.value.length : input.selectionStart;
    const e = input.selectionEnd == null ? s : input.selectionEnd;
    input.value = input.value.slice(0, s) + ch + input.value.slice(e);
    input.focus();
    const n = s + ch.length;
    input.setSelectionRange(n, n);
  }
  function renderOrder(body, item, mode) {
    const pool = item.tiles.map((w, i) => ({ w, i }));
    let built = [];
    body.innerHTML = `<p class="muted">${esc(t("ex.tiles"))}</p><div class="built" id="built"></div><div class="tile-bank" id="bank"></div><button class="btn btn-primary" type="button" id="checkBtn">${esc(t("ex.check"))}</button>`;
    function paint() {
      $("#built").innerHTML = built.map((p, i) => `<button type="button" class="tile" data-b="${i}">${esc(p.w)}</button>`).join("") || "<span class='muted'> </span>";
      const used = new Set(built.map((p) => p.i));
      $("#bank").innerHTML = pool.map((p) => `<button type="button" class="tile${used.has(p.i) ? " used" : ""}" data-p="${p.i}" ${used.has(p.i) ? "disabled" : ""}>${esc(p.w)}</button>`).join("");
      $("#bank").querySelectorAll("[data-p]").forEach((btn) => btn.addEventListener("click", () => {
        if (answered) return;
        const i = Number(btn.getAttribute("data-p"));
        if (built.some((p) => p.i === i)) return;
        built.push(pool.find((p) => p.i === i));
        paint();
      }));
      $("#built").querySelectorAll("[data-b]").forEach((btn) => btn.addEventListener("click", () => {
        if (answered) return;
        built.splice(Number(btn.getAttribute("data-b")), 1);
        paint();
      }));
    }
    paint();
    $("#checkBtn").onclick = () => {
      if (built.length < pool.length) { toast(t("ex.needTiles")); return; }
      finishAttempt(item, built.map((p) => p.w).join(" "), mode);
    };
  }
  function renderSpot(body, item, mode) {
    body.innerHTML = `<p class="muted">${esc(t("ex.spot"))}</p><div class="tile-bank">${item.tokens.map((w, i) => `<button type="button" class="spot-word" data-i="${i}">${esc(w)}</button>`).join("")}</div>`;
    body.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      if (answered) return;
      const i = Number(btn.getAttribute("data-i"));
      const ok = i === item.check.wrongIndex;
      record(item, ok, mode);
      answered = true;
      const why = bi(item.explain);
      $("#feedback").innerHTML = `<div class="fb ${ok ? "good" : "bad"}">
        <p><strong>${esc(ok ? t("ex.right") : t("ex.wrong"))}</strong></p>
        <p class="ans">${esc(item.fix)}</p>
        <p>${esc(why)}</p>
        <button class="btn btn-primary" type="button" id="nextEx">${esc(t("ex.next"))}</button>
      </div>`;
      $("#nextEx").onclick = () => nextAfter(item, mode);
    }));
  }

  function renderReview(view) {
    const due = dueItems();
    view.innerHTML = `<h2>${esc(t("review.title"))}</h2><p>${esc(t("review.lead"))}</p>` +
      (due.length
        ? `<p>${esc(t("home.due", { n: due.length }))}</p><button class="btn btn-primary" type="button" id="startReview">${esc(t("review.go"))}</button>`
        : `<p>${esc(t("review.empty"))}</p>`);
    const btn = $("#startReview");
    if (btn) btn.onclick = () => go("#/r/" + due[0]);
    $("#helloTitle").textContent = t("review.title");
  }
  function renderWeak(view) {
    const ids = G.weakUnitIds(units, progress);
    view.innerHTML = `<h2>${esc(t("weak.title"))}</h2><p>${esc(t("weak.lead"))}</p>` +
      (ids.length ? `<div class="weak-list">${ids.map((id) => {
        const u = byUnit[id];
        const pct = Math.round(mastery(u) * 100);
        return `<div class="weak-row"><span>${esc(bi(u.title))} · ${pct}%</span><button class="btn" type="button" data-unit="${esc(id)}">${esc(t("weak.open"))}</button></div>`;
      }).join("")}</div>` : `<p>${esc(t("weak.empty"))}</p>`);
    view.querySelectorAll("[data-unit]").forEach((b) => b.addEventListener("click", () => go("#/u/" + b.getAttribute("data-unit"))));
    $("#helloTitle").textContent = t("weak.title");
  }

  function renderPlace(view) {
    if (!placeRun) {
      view.innerHTML = `<h2>${esc(t("place.title"))}</h2><p>${esc(t("place.lead"))}</p>
        <button class="btn btn-primary" type="button" id="placeStart">${esc(t("place.start"))}</button>
        <button class="btn" type="button" id="placeSkip">${esc(t("place.skip"))}</button>`;
      $("#placeStart").onclick = () => {
        placeRun = { i: 0, results: [] };
        render();
      };
      $("#placeSkip").onclick = () => {
        progress.placementDone = true;
        progress.unlockThrough = 0;
        save(progressKey(session), progress);
        placeRun = null;
        go("#/u/" + units[0].id);
      };
      $("#helloTitle").textContent = t("place.title");
      return;
    }
    if (placeRun.i >= course.placementIds.length) {
      const startId = G.suggestStart(units, items, course.placementIds, placeRun.results);
      const u = byUnit[startId];
      view.innerHTML = `<h2>${esc(t("place.result"))}</h2><p class="prompt-line">${esc(u.level)} · ${esc(bi(u.title))}</p>
        <button class="btn btn-primary" type="button" id="placeUse">${esc(t("place.use"))}</button>
        <button class="btn" type="button" id="placeFrom1">${esc(t("place.from1"))}</button>`;
      $("#placeUse").onclick = () => {
        progress.placementDone = true;
        progress.unlockThrough = unitIndex(startId);
        save(progressKey(session), progress);
        placeRun = null;
        go("#/u/" + startId);
      };
      $("#placeFrom1").onclick = () => {
        progress.placementDone = true;
        progress.unlockThrough = 0;
        save(progressKey(session), progress);
        placeRun = null;
        go("#/u/" + units[0].id);
      };
      return;
    }
    const item = byId[course.placementIds[placeRun.i]];
    view.innerHTML = `<p class="muted">${esc(t("place.progress", { i: placeRun.i + 1, n: course.placementIds.length }))}</p>
      <h2>${esc(bi(item.prompt))}</h2><div id="exBody"></div>`;
    const body = $("#exBody");
    const take = (user) => {
      const result = G.grade(item, user);
      record(item, result.ok, "place");
      placeRun.results.push({ id: item.id, ok: result.ok });
      placeRun.i += 1;
      const why = result.ok ? bi(item.explain) : ((result.why && (lang === "de" ? result.why.de : result.why.en)) || bi(item.explain));
      view.insertAdjacentHTML("beforeend", `<div class="fb ${result.ok ? "good" : "bad"}" id="feedback">
        <p><strong>${esc(result.ok ? t("ex.right") : t("ex.wrong"))}</strong></p>
        <p class="ans">${esc(item.answers[0])}</p><p>${esc(why)}</p>
        <button class="btn btn-primary" type="button" id="placeNext">${esc(t("ex.next"))}</button></div>`);
      body.querySelectorAll("button,input").forEach((el) => { el.disabled = true; });
      $("#placeNext").onclick = () => render();
    };
    if (item.type === "choice") {
      body.innerHTML = (item.stimulus ? `<p class="prompt-line">${esc(item.stimulus)}</p>` : "") +
        `<div class="choice-grid">${item.choices.map((c, i) => `<button type="button" class="btn" data-i="${i}">${esc(c)}</button>`).join("")}</div>`;
      body.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => take(item.choices[Number(btn.getAttribute("data-i"))])));
    } else {
      body.innerHTML = (item.stimulus ? `<p class="prompt-line">${esc(item.stimulus)}</p>` : "") +
        `<div class="umlauts">${["ä", "ö", "ü", "ß"].map((ch) => `<button type="button" data-ch="${ch}">${ch}</button>`).join("")}</div>
        <input class="gap-input" id="gapInput" autocomplete="off" autocapitalize="off" />
        <button class="btn btn-primary" type="button" id="checkBtn">${esc(t("ex.check"))}</button>`;
      const input = $("#gapInput");
      body.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => insertChar(input, b.getAttribute("data-ch"))));
      $("#checkBtn").onclick = () => take(input.value);
    }
    $("#helloTitle").textContent = t("place.title");
  }

  function renderTutor(view, unitId) {
    const u = byUnit[unitId] || units[0];
    if (!settings.geminiKey) {
      view.innerHTML = `<h2>${esc(t("tutor.title"))}</h2><p>${esc(t("tutor.off"))}</p>`;
      $("#helloTitle").textContent = t("tutor.title");
      return;
    }
    const say = settings.azureKey ? `<button class="btn" type="button" id="sayBtn">${esc(t("tutor.say"))}</button>` : "";
    view.innerHTML = `<h2>${esc(t("tutor.title"))}</h2><p>${esc(t("tutor.lead"))}</p>
      <p><strong>${esc(t("tutor.topic"))}:</strong> ${esc(bi(u.title))} — ${esc(u.topic)}</p>
      <label class="label" for="tutorBox">${esc(t("tutor.topic"))}</label>
      <textarea class="gap-input" id="tutorBox" rows="4"></textarea>
      <div class="umlauts">${["ä", "ö", "ü", "ß"].map((ch) => `<button type="button" data-ch="${ch}">${ch}</button>`).join("")}</div>
      <div class="row"><button class="btn btn-primary" type="button" id="tutorSend">${esc(t("tutor.send"))}</button>${say}</div>
      <div id="tutorOut"></div>`;
    const box = $("#tutorBox");
    view.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => insertChar(box, b.getAttribute("data-ch"))));
    $("#tutorSend").onclick = () => runTutor(u, box.value);
    const sayBtn = $("#sayBtn");
    if (sayBtn) sayBtn.onclick = () => sayInto(box, sayBtn);
    $("#helloTitle").textContent = t("tutor.title");
  }
  async function runTutor(unit, text) {
    const out = $("#tutorOut");
    const clean = String(text || "").trim();
    if (!clean) return;
    out.innerHTML = `<p>${esc(t("tutor.wait"))}</p>`;
    try {
      const data = await askGemini(clean, unit);
      const changes = Array.isArray(data.changes) ? data.changes : [];
      const bits = changes.map((ch) => `<li class="change"><del>${esc(ch.original || "")}</del> <ins>${esc(ch.fixed || "")}</ins><br>${esc(ch.whyEn || "")} <span class="muted">(${esc(ch.unitRef || bi(unit.title))})</span></li>`).join("");
      out.innerHTML = `<article class="card"><h3>${esc(t("tutor.corrected"))}</h3><p class="prompt-line">${esc(data.corrected || "")}</p>
        <h3>${esc(t("tutor.changes"))}</h3>${bits ? `<ul>${bits}</ul>` : `<p>${esc(t("tutor.none"))}</p>`}
        <h3>${esc(t("tutor.try"))}</h3><p>${esc(data.tryNext || "")}</p></article>`;
    } catch (e) {
      out.innerHTML = `<p class="fb bad">${esc(t("tutor.fail"))}</p>`;
    }
  }
  async function askGemini(text, unit) {
    const key = settings.geminiKey;
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key);
    const sys = [
      "You correct German written by an A2/B1 learner named Khawla.",
      "Lesson title: " + unit.title.en + ". Topic: " + unit.topic + ".",
      "Return JSON only. corrected is the full corrected German.",
      "changes lists each real error: original, fixed, whyEn (one short English sentence), unitRef (this lesson title when the error belongs to it, otherwise the grammar name).",
      "tryNext is one new German sentence on the same topic for her to try.",
      "If the German is already correct, changes is an empty array.",
      "Do not invent errors. Do not ask for a key. Explanations stay in English.",
    ].join(" ");
    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            corrected: { type: "STRING" },
            changes: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  original: { type: "STRING" },
                  fixed: { type: "STRING" },
                  whyEn: { type: "STRING" },
                  unitRef: { type: "STRING" },
                },
                required: ["original", "fixed", "whyEn", "unitRef"],
              },
            },
            tryNext: { type: "STRING" },
          },
          required: ["corrected", "changes", "tryNext"],
        },
      },
    };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("status");
    const data = await res.json();
    const raw = ((data.candidates || [])[0] || {}).content;
    const textOut = raw && raw.parts ? raw.parts.map((p) => p.text || "").join("") : "";
    const parsed = JSON.parse(textOut);
    if (typeof parsed.corrected !== "string" || !Array.isArray(parsed.changes)) throw new Error("shape");
    return parsed;
  }

  function speak(text) {
    if (settings.azureKey && window.SpeechSDK) {
      try {
        const cfg = window.SpeechSDK.SpeechConfig.fromSubscription(settings.azureKey, settings.azureRegion || "northeurope");
        cfg.speechSynthesisLanguage = "de-DE";
        const synth = new window.SpeechSDK.SpeechSynthesizer(cfg);
        synth.speakTextAsync(text, () => synth.close(), () => { synth.close(); speakLocal(text); });
        return;
      } catch (e) { /* local voice below */ }
    }
    speakLocal(text);
  }
  function speakLocal(text) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function ensureSpeech() {
    if (!settings.azureKey || window.SpeechSDK || document.getElementById("betaSpeech")) return;
    const s = document.createElement("script");
    s.id = "betaSpeech";
    s.src = "../vendor/speech-sdk-1.52.0.min.js";
    document.body.appendChild(s);
  }
  function sayInto(box, btn) {
    if (!window.SpeechSDK || !settings.azureKey) return;
    btn.disabled = true;
    btn.textContent = t("tutor.hearing");
    const cfg = window.SpeechSDK.SpeechConfig.fromSubscription(settings.azureKey, settings.azureRegion || "northeurope");
    cfg.speechRecognitionLanguage = "de-DE";
    const rec = new window.SpeechSDK.SpeechRecognizer(cfg, window.SpeechSDK.AudioConfig.fromDefaultMicrophoneInput());
    rec.recognizeOnceAsync((res) => {
      rec.close();
      if (res && res.text) box.value = (box.value ? box.value.trim() + " " : "") + res.text;
      btn.disabled = false;
      btn.textContent = t("tutor.say");
    }, () => {
      rec.close();
      btn.disabled = false;
      btn.textContent = t("tutor.say");
    });
  }

  function renderAbout(view) {
    view.innerHTML = `<h2>${esc(t("about.title"))}</h2>
      <p>${esc(t("about.p1"))}</p><p>${esc(t("about.p2"))}</p><p>${esc(t("about.p3"))}</p>
      <p>${esc(t("about.p4"))}</p><p>${esc(t("about.p5"))}</p>`;
    $("#helloTitle").textContent = t("about.title");
  }
  function renderSettings(view) {
    if (session !== "farouk") { go("#/home"); return; }
    view.innerHTML = `<h2>${esc(t("set.title"))}</h2><p>${esc(t("set.lead"))}</p>
      <form class="settings-form" id="setForm">
        <label for="gemKey">${esc(t("set.gemini"))}</label>
        <div class="eye-row"><input id="gemKey" type="password" autocomplete="off" value="${esc(settings.geminiKey)}" /><button class="btn" type="button" id="gemEye">${esc(t("set.show"))}</button></div>
        <label for="azKey">${esc(t("set.azure"))}</label>
        <div class="eye-row"><input id="azKey" type="password" autocomplete="off" value="${esc(settings.azureKey)}" /><button class="btn" type="button" id="azEye">${esc(t("set.show"))}</button></div>
        <label for="azRegion">${esc(t("set.region"))}</label>
        <input id="azRegion" autocomplete="off" value="${esc(settings.azureRegion || "northeurope")}" />
        <div class="row"><button class="btn btn-primary" type="submit">${esc(t("set.save"))}</button>
        <button class="btn" type="button" id="clearKeys">${esc(t("set.clear"))}</button></div>
      </form>`;
    const flip = (id, eye) => {
      const input = $(id);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      eye.textContent = t(show ? "set.hide" : "set.show");
    };
    $("#gemEye").onclick = () => flip("#gemKey", $("#gemEye"));
    $("#azEye").onclick = () => flip("#azKey", $("#azEye"));
    $("#setForm").onsubmit = (e) => {
      e.preventDefault();
      settings = {
        geminiKey: $("#gemKey").value.trim(),
        azureKey: $("#azKey").value.trim(),
        azureRegion: ($("#azRegion").value.trim() || "northeurope").toLowerCase(),
      };
      save(K.settings, settings);
      ensureSpeech();
      toast(t("set.saved"));
    };
    $("#clearKeys").onclick = () => {
      settings = { geminiKey: "", azureKey: "", azureRegion: "northeurope" };
      save(K.settings, settings);
      render();
    };
    $("#helloTitle").textContent = t("set.title");
  }

  function bindGo(view) {
    view.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go("#/" + b.getAttribute("data-go"))));
  }

  function enter(user) {
    session = user;
    save(K.session, { user });
    progress = load(progressKey(user), null) || emptyProgress();
    if (!progress.correct) progress = emptyProgress();
    document.body.dataset.role = user === "farouk" ? "admin" : "learner";
    $("#gate").hidden = true;
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#app").hidden = false;
    paintStatic();
    ensureSpeech();
    if (!location.hash) location.hash = "#/home";
    render();
  }
  function logout() {
    localStorage.removeItem(K.session);
    session = null;
    progress = null;
    placeRun = null;
    document.body.removeAttribute("data-role");
    $("#app").hidden = true;
    $("#loveModal").hidden = true;
    $("#faroukModal").hidden = true;
    $("#gate").hidden = false;
    $("#nameInput").value = "";
    $("#nameError").textContent = "";
    paintStatic();
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
    $("#nameError").textContent = t("gate.unknown");
  }
  function armLove() {
    const arena = $("#loveArena");
    const btn = $("#loveNo");
    function moveNo(x, y) {
      const ar = arena.getBoundingClientRect();
      const bw = btn.offsetWidth || 96;
      const bh = btn.offsetHeight || 46;
      const pad = 8;
      let best = [pad, pad];
      let bestD = -1;
      for (let i = 0; i < 8; i++) {
        const left = pad + Math.random() * Math.max(8, ar.width - bw - pad * 2);
        const top = pad + Math.random() * Math.max(8, ar.height - bh - pad * 2);
        const d = (ar.left + left - x) ** 2 + (ar.top + top - y) ** 2;
        if (d > bestD) { bestD = d; best = [left, top]; }
      }
      btn.style.left = best[0] + "px";
      btn.style.top = best[1] + "px";
    }
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); moveNo(e.clientX, e.clientY); });
    btn.addEventListener("click", (e) => { e.preventDefault(); moveNo(e.clientX || 0, e.clientY || 0); });
  }

  function boot() {
    readLang();
    settings = Object.assign({ geminiKey: "", azureKey: "", azureRegion: "northeurope" }, load(K.settings, {}) || {});
    paintStatic();
    document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.getAttribute("data-lang"))));
    $("#nameGo").onclick = onName;
    $("#nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") onName(); });
    $("#loveYes").onclick = () => enter("khawla");
    $("#faroukYes").onclick = () => enter("farouk");
    $("#logoutBtn").onclick = logout;
    $("#settingsBtn").onclick = () => go("#/settings");
    $("#pet").onclick = () => {
      const n = (Number(localStorage.getItem(K.pet)) || 0) + 1;
      localStorage.setItem(K.pet, String(n));
      $("#pet").classList.add("petting");
      setTimeout(() => $("#pet").classList.remove("petting"), 420);
    };
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => go("#/" + b.getAttribute("data-go"))));
    armLove();
    window.addEventListener("hashchange", render);
    const saved = load(K.session, null);
    if (saved && (saved.user === "khawla" || saved.user === "farouk")) enter(saved.user);
  }
  boot();
})();
