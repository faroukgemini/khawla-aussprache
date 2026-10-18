/* Khawlas Aussprache-Garten – German pronunciation practice
 * Azure Speech Pronunciation Assessment (de-DE) + Azure TTS, with a demo mode.
 * Pure static JS, no build step. */
(() => {
  "use strict";

  const SDK_URL = "vendor/speech-sdk-1.52.0.min.js";
  const LS_SETTINGS = "khawla.settings.v1";
  const LS_PROGRESS = "khawla.progress.v1";
  const LS_POS = "khawla.position.v1";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------------- storage ---------------- */
  const load = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || "{}")); } catch { return { ...d }; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let settings = load(LS_SETTINGS, { key: "", region: "northeurope", voice: "de-DE-KatjaNeural", demo: null, prosody: false, showTrans: true });
  if (!settings.region) settings.region = "northeurope";
  if (settings.demo === null) settings.demo = !settings.key; // no key yet → start in demo mode
  let progress = load(LS_PROGRESS, { best: {}, attempts: [], days: {} });
  let pos = load(LS_POS, { level: "A1", idx: { A1: 0, A2: 0, B1: 0 }, custom: "" });

  /* ---------------- helpers ---------------- */
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const round = (v) => (v == null || isNaN(v) ? null : Math.round(v));
  const band = (s) => (s >= 80 ? "good" : s >= 60 ? "ok" : "bad");
  const starsFor = (s) => (s >= 90 ? 3 : s >= 75 ? 2 : s >= 60 ? 1 : 0);
  const starStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const escXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  /* ---------------- current sentence ---------------- */
  function current() {
    if (pos.level === "CUSTOM") {
      const text = (pos.custom || "").trim();
      return { id: text ? "C:" + text.toLowerCase() : null, de: text, en: "", level: "CUSTOM" };
    }
    const deck = DECKS[pos.level];
    const i = clamp(pos.idx[pos.level] || 0, 0, deck.sentences.length - 1);
    return { id: `${pos.level}-${i}`, ...deck.sentences[i], level: pos.level, i, n: deck.sentences.length };
  }

  /* ---------------- mascot mood ---------------- */
  function setMood(m) {
    ["#mascotMini", "#mascotBig"].forEach((s) => {
      const el = $(s);
      el.classList.remove("happy", "listen");
      if (m) { void el.offsetWidth; el.classList.add(m); }
    });
  }

  /* ---------------- rendering: practice ---------------- */
  function renderPractice() {
    $$(".level").forEach((b) => {
      const on = b.dataset.level === pos.level;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    const c = current();
    const isCustom = pos.level === "CUSTOM";
    $("#deckSentence").hidden = isCustom;
    $("#customBox").hidden = !isCustom;
    $("#navArrows").hidden = isCustom;

    if (isCustom) {
      $("#deckLabel").textContent = "✏️ Eigener Satz";
      $("#customInput").value = pos.custom || "";
      $("#customActive").hidden = true;
    } else {
      $("#deckLabel").textContent = `${c.level} · ${c.i + 1} / ${c.n}`;
      $("#germanText").textContent = c.de;
      $("#englishText").textContent = c.en;
      $("#englishText").classList.toggle("hide", !settings.showTrans);
      renderDots();
    }
    $("#toggleTrans").textContent = settings.showTrans ? "🙈 EN" : "👀 EN";
    $("#toggleTrans").hidden = isCustom;
    const best = c.id ? progress.best[c.id] : null;
    $("#bestStars").textContent = starStr(best != null ? starsFor(best) : 0);
    $("#bestStars").title = best != null ? `Bestes Ergebnis: ${best}` : "Noch nicht geübt · not practised yet";

    // sound tips (max 2)
    const tips = $("#tips");
    tips.innerHTML = "";
    if (c.de) {
      SOUND_TIPS.filter((t) => t.test.test(c.de)).slice(0, 2).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = "💡 " + t.tip;
        tips.appendChild(li);
      });
    }
    $("#recordBtn").disabled = !c.de;
  }

  function renderDots() {
    const deck = DECKS[pos.level];
    const wrap = $("#dots");
    wrap.innerHTML = "";
    deck.sentences.forEach((s, i) => {
      const b = document.createElement("button");
      const best = progress.best[`${pos.level}-${i}`];
      const st = best != null ? starsFor(best) : 0;
      if (st) b.classList.add("done" + st);
      if (i === pos.idx[pos.level]) b.classList.add("cur");
      b.setAttribute("aria-label", `Satz ${i + 1}`);
      b.onclick = () => go(i);
      wrap.appendChild(b);
    });
  }

  function go(i) {
    const n = DECKS[pos.level].sentences.length;
    pos.idx[pos.level] = (i + n) % n;
    save(LS_POS, pos);
    hideResult();
    renderPractice();
  }

  function hideResult() {
    $("#resultCard").hidden = true;
    $("#emptyCard").hidden = false;
    setMood(null);
  }

  /* ---------------- header + progress ---------------- */
  function computeStreak() {
    const d = new Date();
    let n = 0;
    if (!progress.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not yet done → count from yesterday
    while (progress.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const totalStars = () => Object.values(progress.best).reduce((a, s) => a + starsFor(s), 0);

  function renderHeader() {
    $("#streakCount").textContent = computeStreak();
    $("#starCount").textContent = totalStars();
    $("#demoBadge").hidden = !settings.demo;
  }

  function renderProgress() {
    const att = progress.attempts;
    $("#pStreak").textContent = computeStreak();
    $("#pStars").textContent = totalStars();
    $("#pAttempts").textContent = att.length;
    $("#pAvg").textContent = att.length ? Math.round(att.reduce((a, x) => a + x.score, 0) / att.length) : "–";

    const week = $("#week");
    week.innerHTML = "";
    const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const days = [];
    for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(d); }
    const max = Math.max(1, ...days.map((d) => progress.days[dayKey(d)] || 0));
    days.forEach((d, k) => {
      const v = progress.days[dayKey(d)] || 0;
      const el = document.createElement("div");
      el.className = "day" + (k === 6 ? " today" : "");
      el.innerHTML = `<span>${v || ""}</span><div class="col ${v ? "" : "zero"}" style="height:${v ? 10 + (v / max) * 80 : 4}%"></div><span>${names[d.getDay()]}</span>`;
      week.appendChild(el);
    });

    const lp = $("#levelProgress");
    lp.innerHTML = "";
    Object.entries(DECKS).forEach(([lvl, deck]) => {
      const n = deck.sentences.length;
      const done = deck.sentences.filter((_, i) => starsFor(progress.best[`${lvl}-${i}`] ?? 0) >= 2).length;
      const el = document.createElement("div");
      el.className = "lvl";
      el.innerHTML = `<div class="lvl-top"><span>${deck.emoji} ${deck.title}</span><span>${done} / ${n}</span></div><div class="track"><div class="fill" style="width:${(done / n) * 100}%"></div></div>`;
      lp.appendChild(el);
    });

    const rec = $("#recent");
    rec.innerHTML = "";
    if (!att.length) {
      rec.innerHTML = `<li><span>Noch nichts – leg los! 🐹 · Nothing yet – let's go!</span></li>`;
    }
    att.slice(-8).reverse().forEach((a) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = a.text;
      const s = document.createElement("span");
      s.className = "sc " + band(a.score);
      s.textContent = a.score + (a.demo ? " ·demo" : "");
      li.append(t, s);
      rec.appendChild(li);
    });
  }

  function recordAttempt(c, score, demo) {
    const k = dayKey();
    progress.days[k] = (progress.days[k] || 0) + 1;
    const prevBest = progress.best[c.id];
    const prevStars = prevBest != null ? starsFor(prevBest) : 0;
    if (prevBest == null || score > prevBest) progress.best[c.id] = score;
    progress.attempts.push({ id: c.id, text: c.de, score, ts: Date.now(), demo: !!demo });
    if (progress.attempts.length > 300) progress.attempts = progress.attempts.slice(-300);
    save(LS_PROGRESS, progress);
    renderHeader();
    return { newStars: Math.max(0, starsFor(score) - prevStars), improved: prevBest != null && score > prevBest };
  }

  /* ---------------- views ---------------- */
  function showView(v) {
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + v));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    if (v === "progress") renderProgress();
    if (v === "settings") renderSettings();
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.scrollTo(0, 0);
  }

  /* ---------------- Azure SDK loader ---------------- */
  let sdkPromise;
  function loadSdk() {
    if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = SDK_URL;
        s.onload = () => (window.SpeechSDK ? res(window.SpeechSDK) : rej(new Error("SDK not found")));
        s.onerror = () => { sdkPromise = null; rej(new Error("Speech SDK konnte nicht geladen werden")); };
        document.head.appendChild(s);
      });
    }
    return sdkPromise;
  }
  const hasKey = () => !!(settings.key && settings.region);
  function speechConfig(sdk) {
    return sdk.SpeechConfig.fromSubscription(settings.key.trim(), settings.region.trim().toLowerCase());
  }

  /* ---------------- audio playback (TTS) ---------------- */
  const ttsCache = new Map();
  let currentAudio = null;

  function azureTts(text, slow) {
    const ck = `${settings.voice}|${slow ? 1 : 0}|${text}`;
    if (ttsCache.has(ck)) return Promise.resolve(ttsCache.get(ck));
    return loadSdk().then((sdk) => new Promise((resolve, reject) => {
      const cfg = speechConfig(sdk);
      cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      const synth = new sdk.SpeechSynthesizer(cfg, null); // null = give us the bytes, we play them ourselves
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
      if (!settings.demo && hasKey()) {
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
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- recording / assessment ---------------- */
  let state = "idle"; // idle | listening | thinking
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
    if (!c.de) { toast("Schreib zuerst einen Satz ✏️ · Type a sentence first"); return; }
    if (state === "listening") { cancelListening(); return; }
    if (state !== "idle") return;
    cancelled = false;

    if (!settings.demo && !hasKey()) {
      toast("Bitte Azure-Schlüssel eintragen oder Demo-Modus nutzen ⚙️", 3500);
      showView("settings");
      return;
    }
    if (currentAudio) currentAudio.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();

    try {
      let result;
      if (settings.demo) {
        setState("listening", "Ich höre zu… 👂 (Demo)", "Sprich jetzt – im Demo-Modus wird simuliert. · Speak now (simulated)");
        await sleep(1800);
        if (cancelled) return;
        setState("thinking", "Ich bewerte… 🐝", "Einen Moment · one moment");
        await sleep(700);
        result = simulate(c.de);
      } else {
        result = await assessAzure(c.de);
        if (!result) return; // cancelled
      }
      setState("idle", "Tippen & sprechen · Tap & speak", "Nochmal? Übung macht die Meisterin! 🐹");
      showResult(c, result);
    } catch (e) {
      if (cancelled) return; // user tapped stop – not an error
      console.warn(e);
      setState("idle", "Oh nein! 🙈", friendlyError(e));
    }
  }

  function cancelListening() {
    cancelled = true;
    if (activeRecognizer) { try { activeRecognizer.close(); } catch {} activeRecognizer = null; }
    setState("idle", "Abgebrochen · Cancelled", "Tippe nochmal, wenn du bereit bist. · Tap again when ready.");
  }

  function friendlyError(e) {
    const m = String((e && e.message) || e);
    if (/secure|https/i.test(m)) return "Das Mikrofon braucht HTTPS (oder localhost). · Mic needs HTTPS.";
    if (/NotAllowed|Permission|denied/i.test(m)) return "Bitte erlaube den Mikrofon-Zugriff 🎤 · Please allow microphone access.";
    if (/NotFound|no.*device/i.test(m)) return "Kein Mikrofon gefunden. · No microphone found.";
    if (/1006|Unable to contact server|ConnectionFailure/i.test(m)) return "Keine Verbindung zu Azure – prüfe Schlüssel, Region und Internet. ⚙️ · Can't reach Azure: check key, region, internet.";
    if (/401|403|unauthori|forbidden|authentication/i.test(m)) return "Azure-Schlüssel oder Region stimmt nicht. ⚙️ · Key/region wrong.";
    if (/nichts gehört|NoMatch/i.test(m)) return "Ich habe nichts gehört 🙉 – etwas lauter? · I didn't hear anything.";
    return m.length < 160 ? m : "Etwas ist schiefgelaufen. · Something went wrong.";
  }

  async function ensureMic() {
    if (!window.isSecureContext) throw new Error("Mic needs a secure context (HTTPS)");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Kein Mikrofon-Zugriff in diesem Browser");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  }

  async function assessAzure(referenceText) {
    setState("thinking", "Einen Moment… 🐝", "Mikrofon wird vorbereitet · getting the mic ready");
    await ensureMic();
    const sdk = await loadSdk();
    const cfg = speechConfig(sdk);
    cfg.speechRecognitionLanguage = "de-DE";
    cfg.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1500"); // allow small pauses
    cfg.outputFormat = sdk.OutputFormat.Detailed;
    const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const pa = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true // enableMiscue
    );
    pa.phonemeAlphabet = "IPA"; // ask for IPA names (Azure may still return empty names for de-DE)
    if (settings.prosody) pa.enableProsodyAssessment = true;
    const rec = new sdk.SpeechRecognizer(cfg, audio);
    pa.applyTo(rec);
    activeRecognizer = rec;
    setState("listening", "Ich höre zu… 👂", "Lies den Satz jetzt laut vor. · Read the sentence aloud now.");

    const r = await new Promise((resolve, reject) => {
      rec.canceled = (_, ev) => { if (ev.reason === sdk.CancellationReason.Error) reject(new Error(`${ev.errorCode}: ${ev.errorDetails}`)); };
      rec.recognizeOnceAsync(resolve, (err) => reject(new Error(err)));
    }).finally(() => { try { rec.close(); } catch {} if (activeRecognizer === rec) activeRecognizer = null; });

    if (cancelled) return null; // user cancelled
    setState("thinking", "Ich bewerte… 🐝", "Einen Moment · one moment");
    if (r.reason === sdk.ResultReason.NoMatch) throw new Error("Ich habe nichts gehört (NoMatch)");
    if (r.reason === sdk.ResultReason.Canceled) {
      const cd = sdk.CancellationDetails.fromResult(r);
      throw new Error(`${cd.ErrorCode || cd.errorCode || ""} ${cd.errorDetails || "Abgebrochen"}`);
    }
    const json = JSON.parse(r.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) || "{}");
    window.__khawlaLastJson = json; // for debugging (no secrets in here)
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
        // map back to the original spelling/case of the reference text
        for (let k = ri; k < Math.min(refTokens.length, ri + 3); k++) {
          if (norm(refTokens[k]) === norm(w.Word)) { display = refTokens[k].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); ri = k + 1; break; }
        }
      }
      const phonemes = (w.Phonemes || []).map((p) => ({ p: p.Phoneme || "", score: round(p.PronunciationAssessment ? p.PronunciationAssessment.AccuracyScore : p.AccuracyScore) }));
      // Azure returns scores but EMPTY phoneme names for de-DE. Fill in estimated names from the
      // spelling when the sound count matches; otherwise number the sounds.
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
      scores: {
        pron: round(pa.PronScore),
        accuracy: round(pa.AccuracyScore),
        fluency: round(pa.FluencyScore),
        completeness: round(pa.CompletenessScore),
        prosody: round(pa.ProsodyScore),
      },
      words,
    };
  }

  /* ---------------- demo simulation ---------------- */
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

  /* ---------------- result rendering ---------------- */
  const MESSAGES = [
    [90, ["Wunderbar! Wie eine Muttersprachlerin! 🌟", "Wonderful – like a native speaker!"], ["Perfekt, Khawla! Das Wasserschwein ist stolz! 🐹", "Perfect! The capybara is proud!"]],
    [80, ["Super gemacht, Khawla! 🎉", "Great job!"], ["Klasse! Das klingt richtig deutsch! 🐝", "Awesome – that sounds really German!"]],
    [70, ["Sehr gut! Fast perfekt. 💪", "Very good – almost perfect."], ["Toll! Noch ein kleines bisschen. ✨", "Great! Just a tiny bit more."]],
    [60, ["Gut! Weiter so! 🌱", "Good! Keep going!"], ["Schön! Mit Übung wird es noch besser. 🌷", "Nice! It'll get even better with practice."]],
    [0, ["Kein Problem – Übung macht die Meisterin! 💛", "No worries – practice makes perfect!"], ["Mutig! Hör nochmal zu und versuch es wieder. 🐹", "Brave! Listen again and try once more."]],
  ];
  let lastResult = null;

  function showResult(c, res) {
    lastResult = res;
    const s = res.scores;
    const pron = s.pron ?? s.accuracy ?? 0;
    const { newStars, improved } = recordAttempt(c, pron, res.demo);
    const st = starsFor(pron);

    $("#emptyCard").hidden = true;
    const card = $("#resultCard");
    card.hidden = false;

    const ring = $("#scoreRing");
    ring.style.setProperty("--c", `var(--${band(pron)})`);
    ring.style.setProperty("--p", 0);
    animateNumber($("#pronScore"), pron);
    // conic-gradient custom property isn't animatable everywhere – step it
    let p = 0; const step = () => { p = Math.min(pron, p + 3); ring.style.setProperty("--p", p); if (p < pron) requestAnimationFrame(step); }; step();

    $("#earnedStars").textContent = st ? "⭐".repeat(st) + (st < 3 ? "☆".repeat(3 - st) : "") : "🌱";
    const [, ...variants] = MESSAGES.find(([min]) => pron >= min);
    const [de, en] = pick(variants);
    const weakest = res.words.filter((w) => w.error !== "Insertion" && w.error !== "Omission").sort((a, b) => a.score - b.score)[0];
    $("#msgDe").textContent = de + (improved ? " Neuer Rekord! 🏆" : "");
    $("#msgEn").textContent = en + (weakest && weakest.score < 80 ? ` · Tipp: übe „${weakest.word}“ 🔍` : "");

    // score bars
    const bars = $("#bars");
    bars.innerHTML = "";
    [
      ["accuracy", "Genauigkeit", "Accuracy"],
      ["fluency", "Flüssigkeit", "Fluency"],
      ["completeness", "Vollständigkeit", "Completeness"],
      ["prosody", "Prosodie", "Prosody"],
    ].forEach(([k, de, en]) => {
      const v = s[k];
      const el = document.createElement("div");
      el.className = "bar" + (v == null ? " na" : "");
      el.innerHTML = `<span class="name">${de} <small>${en}</small></span><span class="val">${v == null ? "n/a (nur en-US)" : v}</span><div class="track"><div class="fill"></div></div>`;
      bars.appendChild(el);
      if (v != null) {
        const f = el.querySelector(".fill");
        f.style.background = `var(--${band(v)})`;
        requestAnimationFrame(() => requestAnimationFrame(() => (f.style.width = v + "%")));
      }
    });

    // words
    const wrap = $("#words");
    wrap.innerHTML = "";
    res.words.forEach((w) => {
      const b = document.createElement("button");
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
    $("#heard").textContent = res.heard ? `${res.demo ? "🧪 Demo · " : ""}Gehört · heard: „${res.heard}“` : "";

    if (st >= 2 || newStars > 0) {
      setMood("happy");
      confetti(st >= 3 ? 160 : 90);
      floatEmojis(st >= 3 ? ["🌟", "🐹", "🐝", "💖", "🎉"] : ["⭐", "🐝", "🌼"]);
    } else if (st >= 1) {
      setMood("happy");
      floatEmojis(["🌱", "💛"]);
    }
    if (window.innerWidth < 900) card.scrollIntoView({ behavior: "smooth", block: "start" });
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

  /* ---------------- phoneme sheet ---------------- */
  let sheetWord = null;
  function openSheet(w) {
    sheetWord = w;
    $("#sheetWord").textContent = w.word;
    const sc = $("#sheetScore");
    sc.textContent = w.error === "Omission" ? "ausgelassen" : w.error === "Insertion" ? "extra" : `${w.score} / 100`;
    const errText = {
      None: w.score >= 80 ? "Sehr schön ausgesprochen! 🎉 · Nicely pronounced!" : "Okay – schau dir die Laute an. · Check the sounds below.",
      Mispronunciation: "Hier kannst du noch üben. Die roten Laute sind schwierig. · The red sounds need practice.",
      Omission: "Dieses Wort habe ich nicht gehört. · I didn't hear this word.",
      Insertion: "Dieses Wort steht nicht im Satz. · This word isn't in the sentence.",
      UnexpectedBreak: "Hier war eine unerwartete Pause. · Unexpected pause here.",
      MissingBreak: "Hier fehlt eine kleine Pause. · A short pause is missing here.",
      Monotone: "Etwas mehr Melodie! · A bit more melody!",
    };
    $("#sheetError").textContent = errText[w.error] || w.error;
    const ph = $("#phonemes");
    ph.innerHTML = "";
    if (!w.phonemes.length) {
      ph.innerHTML = `<p class="muted">Keine Laut-Details. · No phoneme details.</p>`;
    }
    w.phonemes.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "ph " + band(p.score ?? 0);
      const b = document.createElement("b");
      b.textContent = p.p ? `/${p.p}/` : `Laut ${i + 1}`;
      if (!p.p) b.style.fontSize = "1rem";
      const s = document.createElement("small");
      s.textContent = p.score ?? "–";
      d.append(b, s);
      ph.appendChild(d);
    });
    const note = !w.phonemes.length ? "" : lastResult && lastResult.demo
      ? "🧪 Demo: Laute sind geschätzt. · Demo phonemes are approximate."
      : w.labels === "guess" ? "ℹ️ Die Werte kommen von Azure; die Laut-Namen sind aus der Schreibung geschätzt (Azure liefert für Deutsch keine Namen). · Scores from Azure, sound names estimated."
      : w.labels === "numbered" ? "ℹ️ Werte von Azure, Laute in Reihenfolge des Wortes (für Deutsch liefert Azure keine Laut-Namen). · Sounds in word order." : "";
    if (note) {
      const n = document.createElement("p");
      n.className = "muted small";
      n.style.gridColumn = "1/-1";
      n.textContent = note;
      ph.appendChild(n);
    }
    $("#sheet").hidden = false;
    $("#sheetBackdrop").hidden = false;
  }
  function closeSheet() { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; }

  /* ---------------- confetti ---------------- */
  function confetti(n = 100) {
    const cv = $("#confetti");
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
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
      if (t - t0 < 2800) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function floatEmojis(list) {
    for (let i = 0; i < 6; i++) {
      const e = document.createElement("span");
      e.className = "float-emoji";
      e.textContent = pick(list);
      e.style.left = 10 + Math.random() * 80 + "vw";
      e.style.top = 45 + Math.random() * 30 + "vh";
      e.style.animationDelay = i * 0.12 + "s";
      document.body.appendChild(e);
      setTimeout(() => e.remove(), 2400);
    }
  }

  /* ---------------- settings ---------------- */
  function renderSettings() {
    $("#keyInput").value = settings.key || "";
    $("#regionInput").value = settings.region || "";
    $("#voiceSelect").value = settings.voice;
    $("#demoToggle").checked = !!settings.demo;
    $("#prosodyToggle").checked = !!settings.prosody;
    $("#transToggle").checked = !!settings.showTrans;
    $("#secureNote").textContent = window.isSecureContext
      ? "✅ Sichere Verbindung – Mikrofon kann benutzt werden. · Secure context: mic OK."
      : "⚠️ Keine sichere Verbindung (HTTP). Das Mikrofon funktioniert nur über HTTPS. · Not HTTPS: mic will not work.";
  }
  function readSettingsForm() {
    settings.key = $("#keyInput").value.trim();
    settings.region = $("#regionInput").value.trim().toLowerCase() || "northeurope";
    settings.voice = $("#voiceSelect").value;
    settings.demo = $("#demoToggle").checked;
    settings.prosody = $("#prosodyToggle").checked;
    settings.showTrans = $("#transToggle").checked;
  }
  function saveSettings() {
    readSettingsForm();
    if (!settings.demo && !hasKey()) $("#settingsStatus").textContent = "⚠️ Ohne Schlüssel + Region geht nur der Demo-Modus.";
    else $("#settingsStatus").textContent = "✅ Gespeichert! · Saved!";
    save(LS_SETTINGS, settings);
    ttsCache.clear();
    renderHeader();
    renderPractice();
  }
  async function testConnection() {
    readSettingsForm();
    const st = $("#settingsStatus");
    if (!hasKey()) { st.textContent = "⚠️ Bitte Schlüssel und Region eintragen. · Enter key and region."; return; }
    st.textContent = "⏳ Teste… · testing…";
    try {
      ttsCache.clear();
      const url = await azureTts("Hallo Khawla! Die Verbindung funktioniert.", false);
      st.textContent = "✅ Verbindung ok! Azure spricht. · Connection works!";
      new Audio(url).play().catch(() => {});
    } catch (e) {
      console.warn(e);
      st.textContent = "❌ " + friendlyError(e);
    }
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    $$(".level").forEach((b) => (b.onclick = () => { pos.level = b.dataset.level; save(LS_POS, pos); hideResult(); renderPractice(); }));
    $("#prevBtn").onclick = () => go(pos.idx[pos.level] - 1);
    $("#nextBtn").onclick = () => go(pos.idx[pos.level] + 1);
    $("#nextAfter").onclick = () => {
      if (pos.level === "CUSTOM") { hideResult(); $("#customInput").focus(); return; }
      go(pos.idx[pos.level] + 1);
      $("#sentenceCard").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    $("#againBtn").onclick = () => { hideResult(); onRecord(); };
    $("#playNormal").onclick = (e) => speak(current().de, false, e.currentTarget);
    $("#playSlow").onclick = (e) => speak(current().de, true, e.currentTarget);
    $("#toggleTrans").onclick = () => { settings.showTrans = !settings.showTrans; save(LS_SETTINGS, settings); renderPractice(); };
    $("#englishText").onclick = () => { if (!settings.showTrans) { $("#englishText").classList.toggle("hide"); } };
    $("#recordBtn").onclick = onRecord;
    $("#useCustom").onclick = () => {
      const t = $("#customInput").value.trim().replace(/\s+/g, " ");
      if (!t) { toast("Schreib einen deutschen Satz ✏️ · Type a German sentence"); return; }
      pos.custom = t; save(LS_POS, pos); hideResult(); renderPractice();
      const a = $("#customActive"); a.hidden = false; a.textContent = "🎯 " + t;
      toast("Bereit! Hör zu oder drück aufs Mikro 🎤");
    };
    $("#customInput").addEventListener("input", (e) => { pos.custom = e.target.value; save(LS_POS, pos); $("#recordBtn").disabled = !pos.custom.trim(); });
    $$(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));
    $("#sheetClose").onclick = closeSheet;
    $("#sheetBackdrop").onclick = closeSheet;
    $("#sheetPlay").onclick = (e) => sheetWord && speak(sheetWord.word, true, e.currentTarget);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    $("#saveSettings").onclick = saveSettings;
    $("#testConn").onclick = testConnection;
    $("#demoToggle").onchange = saveSettings;
    $("#showKey").onclick = () => { const i = $("#keyInput"); i.type = i.type === "password" ? "text" : "password"; };
    $("#resetProgress").onclick = () => {
      if (confirm("Wirklich alles zurücksetzen? · Really reset all progress?")) {
        progress = { best: {}, attempts: [], days: {} }; save(LS_PROGRESS, progress); renderProgress(); renderHeader(); renderPractice();
      }
    };
    window.addEventListener("hashchange", () => showView(viewFromHash()));
    // swipe left/right on the sentence card
    let sx = null;
    $("#sentenceCard").addEventListener("touchstart", (e) => (sx = e.touches[0].clientX), { passive: true });
    $("#sentenceCard").addEventListener("touchend", (e) => {
      if (sx == null || pos.level === "CUSTOM") return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) go(pos.idx[pos.level] + (dx < 0 ? 1 : -1));
    });
  }
  const viewFromHash = () => (["practice", "progress", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "practice");

  function greet() {
    const h = new Date().getHours();
    const g = h < 11 ? "Guten Morgen ☀️ · Good morning!" : h < 17 ? "Schön, dass du da bist! 🌼 · Nice to see you!" : "Guten Abend 🌙 · Good evening!";
    const s = computeStreak();
    $("#helloSub").textContent = s >= 2 ? `🔥 ${s} Tage in Folge – weiter so! · ${s}-day streak!` : g;
  }

  function init() {
    if ("speechSynthesis" in window) speechSynthesis.getVoices(); // warm up voice list
    bind();
    renderHeader();
    renderPractice();
    greet();
    showView(viewFromHash());
    if ("serviceWorker" in navigator && window.isSecureContext && !/[?&]nosw/.test(location.search)) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
    }
  }
  init();

  // tiny debug hook (handy for testing)
  window.__khawla = { simulate, g2p, get settings() { return settings; } };
})();
