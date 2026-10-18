/* Pure progression + sync merge helpers. No DOM, no secrets. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AusspracheLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY = 86400000;
  const REVIEW_STEPS = [1, 3, 7, 14, 30, 60];
  const UNLOCK_AVG = 80;
  const ATTEMPT_CAP = 2000;
  const MASTER_STEP = 3;

  const norm = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

  function emptyPet() {
    return { count: 0, countAt: 0, mute: false, muteAt: 0 };
  }

  function readPet(src) {
    const pet = (src && src.pet) || {};
    return {
      count: Math.max(0, Math.floor(Number(pet.count) || 0)),
      countAt: Math.max(0, Number(pet.countAt) || 0),
      mute: !!pet.mute,
      muteAt: Math.max(0, Number(pet.muteAt) || 0),
    };
  }

  function mergePet(local, remote, clearedAt) {
    const keep = (pet) => {
      if (!clearedAt) return pet;
      return {
        count: pet.countAt > clearedAt ? pet.count : 0,
        countAt: pet.countAt > clearedAt ? pet.countAt : 0,
        mute: pet.muteAt > clearedAt ? pet.mute : false,
        muteAt: pet.muteAt > clearedAt ? pet.muteAt : 0,
      };
    };
    const a = keep(readPet(local));
    const b = keep(readPet(remote));
    const countSide = a.count === b.count
      ? ((a.countAt || 0) >= (b.countAt || 0) ? a : b)
      : (a.count > b.count ? a : b);
    const muteSide = (a.muteAt || 0) >= (b.muteAt || 0) ? a : b;
    return {
      count: countSide.count,
      countAt: countSide.countAt,
      mute: muteSide.mute,
      muteAt: muteSide.muteAt,
    };
  }

  function readUiLang(src) {
    const v = src && src.uiLang;
    const raw = v && (v.value === "en" || v.value === "de") ? v.value : "";
    // Only a tap on the DE/EN switch counts. An old automatic default has no explicit flag.
    if (!v || !v.explicit || !raw) return { value: "", at: 0, explicit: false };
    return { value: raw, at: Math.max(0, Number(v.at) || 0), explicit: true };
  }

  function readStrictness(src) {
    const s = src && src.strictness;
    const value = s && (s.value === "gentle" || s.value === "normal" || s.value === "strict") ? s.value : "";
    return { value, at: Math.max(0, Number(s && s.at) || 0) };
  }

  function readGuide(src) {
    const g = src && src.guide;
    const done = !!(g && g.done);
    let seenVersion = Math.max(0, Math.floor(Number(g && g.seenVersion) || 0));
    if (!seenVersion && done) seenVersion = 1;
    return { done: done || seenVersion > 0, at: Math.max(0, Number(g && g.at) || 0), seenVersion };
  }

  function laterOf(a, b) {
    return (a.at || 0) >= (b.at || 0) ? a : b;
  }

  function mergeUiLang(local, remote, clearedAt) {
    let a = readUiLang(local);
    let b = readUiLang(remote);
    if (clearedAt) {
      if (a.at <= clearedAt) a = { value: "", at: 0 };
      if (b.at <= clearedAt) b = { value: "", at: 0 };
    }
    const win = laterOf(a, b);
    return { value: win.value || "", at: win.at || 0, explicit: !!win.explicit };
  }

  function mergeStrictness(local, remote, clearedAt) {
    let a = readStrictness(local);
    let b = readStrictness(remote);
    if (clearedAt) {
      if (a.at <= clearedAt) a = { value: "", at: 0 };
      if (b.at <= clearedAt) b = { value: "", at: 0 };
    }
    const win = laterOf(a, b);
    return { value: win.value || "", at: win.at || 0 };
  }

  function mergeGuide(local, remote, clearedAt) {
    let a = readGuide(local);
    let b = readGuide(remote);
    if (clearedAt) {
      if (a.at <= clearedAt) a = { done: false, at: 0, seenVersion: 0 };
      if (b.at <= clearedAt) b = { done: false, at: 0, seenVersion: 0 };
    }
    const win = laterOf(a, b);
    const seenVersion = Math.max(a.seenVersion || 0, b.seenVersion || 0);
    return { done: seenVersion > 0 || !!win.done, at: Math.max(a.at || 0, b.at || 0), seenVersion };
  }

  function emptyProgress() {
    return {
      schema: 2,
      best: {},
      attempts: [],
      reviews: {},
      cursor: null,
      showTrans: { value: true, at: 0 },
      pet: emptyPet(),
      uiLang: { value: "", at: 0, explicit: false },
      strictness: { value: "", at: 0 },
      guide: { done: false, at: 0, seenVersion: 0 },
      updatedAt: 0,
    };
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(ts, days) {
    const d = new Date(startOfDay(ts));
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function recomputeDays(attempts) {
    const days = {};
    for (const a of attempts || []) {
      if (!a || !a.at) continue;
      const k = dayKey(a.at);
      days[k] = (days[k] || 0) + 1;
    }
    return days;
  }

  function asBest(v) {
    if (v == null) return null;
    if (typeof v === "number") return { score: v, at: 0 };
    if (typeof v === "object" && typeof v.score === "number") return { score: v.score, at: v.at || 0 };
    return null;
  }

function stripCleared(src, clearedAt) {
  const p = src || emptyProgress();
  if (!clearedAt) return p;
  const best = {};
  for (const [id, raw] of Object.entries(p.best || {})) {
    const b = asBest(raw);
    if (b && (b.at || 0) > clearedAt) best[id] = b;
  }
  const attempts = (p.attempts || []).filter((a) => a && (a.at || 0) > clearedAt);
  const reviews = {};
  for (const [id, r] of Object.entries(p.reviews || {})) {
    if (r && (r.last || 0) > clearedAt) reviews[id] = r;
  }
  const cursor = p.cursor && (p.cursor.at || 0) > clearedAt ? p.cursor : null;
  const showTrans = p.showTrans && (p.showTrans.at || 0) > clearedAt ? p.showTrans : { value: true, at: 0 };
  return { ...p, best, attempts, reviews, cursor, showTrans };
}

function mergeProgress(local, remote) {
  const clearedAt = Math.max((local && local.clearedAt) || 0, (remote && remote.clearedAt) || 0);
  const A = stripCleared(local || emptyProgress(), clearedAt);
  const B = stripCleared(remote || emptyProgress(), clearedAt);
  const best = {};
    const ids = new Set([...Object.keys(A.best || {}), ...Object.keys(B.best || {})]);
    for (const id of ids) {
      const x = asBest(A.best[id]);
      const y = asBest(B.best[id]);
      if (!x && !y) continue;
      if (!x) best[id] = y;
      else if (!y) best[id] = x;
      else if (x.score !== y.score) best[id] = x.score > y.score ? x : y;
      else best[id] = (x.at || 0) >= (y.at || 0) ? x : y;
    }
    const byId = new Map();
    for (const att of [...(A.attempts || []), ...(B.attempts || [])]) {
      if (!att || !att.id) continue;
      const prev = byId.get(att.id);
      if (!prev || (att.at || 0) >= (prev.at || 0)) byId.set(att.id, att);
    }
    let attempts = [...byId.values()].sort((p, q) => (p.at || 0) - (q.at || 0) || String(p.id).localeCompare(String(q.id)));
    if (attempts.length > ATTEMPT_CAP) attempts = attempts.slice(-ATTEMPT_CAP);
    const reviews = {};
    for (const id of new Set([...Object.keys(A.reviews || {}), ...Object.keys(B.reviews || {})])) {
      const x = A.reviews[id];
      const y = B.reviews[id];
      if (!x) reviews[id] = y;
      else if (!y) reviews[id] = x;
      else reviews[id] = (x.last || 0) >= (y.last || 0) ? x : y;
    }
    const cursor = !A.cursor ? (B.cursor || null) : !B.cursor ? A.cursor : ((A.cursor.at || 0) >= (B.cursor.at || 0) ? A.cursor : B.cursor);
    const stA = A.showTrans || { value: true, at: 0 };
    const stB = B.showTrans || { value: true, at: 0 };
    const showTrans = (stA.at || 0) >= (stB.at || 0) ? { value: !!stA.value, at: stA.at || 0 } : { value: !!stB.value, at: stB.at || 0 };
    return {
      schema: 2,
      best,
      attempts,
      reviews,
      cursor,
      showTrans,
      days: recomputeDays(attempts),
      clearedAt,
      pet: mergePet(A, B, clearedAt),
      uiLang: mergeUiLang(A, B, clearedAt),
      strictness: mergeStrictness(A, B, clearedAt),
      guide: mergeGuide(A, B, clearedAt),
      updatedAt: Math.max(A.updatedAt || 0, B.updatedAt || 0),
    };
  }

  function contentKey(p) {
    const x = p || emptyProgress();
    return JSON.stringify({
      best: x.best || {},
      attempts: x.attempts || [],
      reviews: x.reviews || {},
      cursor: x.cursor || null,
      showTrans: x.showTrans || { value: true, at: 0 },
      pet: readPet(x),
      uiLang: readUiLang(x),
      strictness: readStrictness(x),
      guide: readGuide(x),
      clearedAt: x.clearedAt || 0,
    });
  }

  function scoreForProgress(progress, id) {
    const attempts = ((progress && progress.attempts) || []).filter((a) => a && a.sentenceId === id && typeof a.score === "number");
    const real = attempts.filter((a) => a.demo !== true);
    const demos = attempts.filter((a) => a.demo === true);
    const saved = progress && progress.best && progress.best[id];
    const savedScore = saved && typeof saved.score === "number" ? saved.score : null;
    const savedAt = saved && saved.at;
    const ownedByDemo = savedScore != null && demos.some((a) => (savedAt != null && a.at === savedAt) || (a.score === savedScore && (savedAt == null || a.at === savedAt)));
    if (real.length) {
      const realBest = real.reduce((m, a) => Math.max(m, a.score), 0);
      if (savedScore != null && savedScore > realBest && !ownedByDemo) return savedScore;
      return realBest;
    }
    if (demos.length) return ownedByDemo || savedScore == null ? null : savedScore;
    return savedScore;
  }

  function countingAttempts(progress) {
    return ((progress && progress.attempts) || []).filter((a) => a && a.demo !== true && typeof a.score === "number");
  }

  function unitAverage(unit, progress) {
    const list = (unit && unit.sentences) || [];
    if (!list.length) return 0;
    const sum = list.reduce((a, s) => a + (scoreForProgress(progress, s.id) || 0), 0);
    return sum / list.length;
  }

  function isUnlocked(index, units, progress, passScore) {
    if (index <= 0) return true;
    const prev = units[index - 1];
    if (!prev) return true;
    return unitAverage(prev, progress) >= (passScore || UNLOCK_AVG);
  }

  function scheduleReview(prev, score, now, marks) {
    const step0 = prev && Number.isFinite(prev.step) ? prev.step : 0;
    const pass = (marks && marks.pass) || 80;
    const master = (marks && marks.master) || 90;
    const retry = (marks && marks.red) || 60;
    let step = step0;
    let days;
    if (score >= pass) {
      days = REVIEW_STEPS[Math.min(step0, REVIEW_STEPS.length - 1)];
      step = Math.min(REVIEW_STEPS.length - 1, step0 + 1);
    } else if (score >= retry) {
      days = 1;
      step = step0;
    } else {
      days = 1;
      step = 0;
    }
    return {
      step,
      due: addDays(now, days),
      last: now,
      lastScore: score,
      mastered: step >= MASTER_STEP && score >= master,
    };
  }

  function dueReviews(progress, now) {
    const end = addDays(now, 1) - 1; // through the end of today
    return Object.entries((progress && progress.reviews) || {})
      .filter(([, r]) => r && typeof r.due === "number" && r.due <= end)
      .map(([sentenceId, r]) => ({ sentenceId, ...r }))
      .sort((a, b) => (a.lastScore ?? 100) - (b.lastScore ?? 100) || a.due - b.due);
  }

  function findSentence(units, id) {
    for (const u of units || []) {
      const s = (u.sentences || []).find((x) => x.id === id);
      if (s) return { unit: u, sentence: s };
    }
    return null;
  }

  function flatUnlocked(units, progress, admin, passScore) {
    const out = [];
    (units || []).forEach((u, i) => {
      if (admin || isUnlocked(i, units, progress, passScore)) {
        (u.sentences || []).forEach((s) => out.push({ ...s, unitId: u.id, level: u.level }));
      }
    });
    return out;
  }

  function resumeId(units, progress, passScore) {
    const need = passScore || UNLOCK_AVG;
    const cur = progress && progress.cursor && progress.cursor.sentenceId;
    if (cur && findSentence(units, cur)) return cur;
    for (let i = 0; i < (units || []).length; i++) {
      if (!isUnlocked(i, units, progress, need)) break;
      const s = units[i].sentences.find((x) => (((progress.best || {})[x.id] || {}).score || 0) < need);
      if (s) return s.id;
    }
    return units && units[0] && units[0].sentences[0] ? units[0].sentences[0].id : null;
  }

  function nextUpId(units, progress, currentId, admin, now, passScore) {
    const need = passScore || UNLOCK_AVG;
    const flat = flatUnlocked(units, progress, admin, need);
    if (!flat.length) return currentId || null;
    const start = Math.max(0, flat.findIndex((s) => s.id === currentId) + (currentId ? 1 : 0));
    const order = flat.slice(start).concat(flat.slice(0, start));
    const needWork = order.find((s) => s.id !== currentId && (((progress.best || {})[s.id] || {}).score || 0) < need);
    if (needWork) return needWork.id;
    const due = dueReviews(progress, now || Date.now()).find((r) => findSentence(units, r.sentenceId));
    if (due && due.sentenceId !== currentId) return due.sentenceId;
    const seq = order.find((s) => s.id !== currentId);
    return seq ? seq.id : currentId;
  }

  const SPEECH_RMS = 0.02;

  function strictnessMarks(level) {
    if (level === "gentle") return { pass: 80, master: 90, red: 60, unlock: 80 };
    if (level === "normal") return { pass: 80, master: 90, red: 70, unlock: 80 };
    return { pass: 85, master: 92, red: 75, unlock: 85 };
  }

  function effectiveStrictness(progress, userId) {
    const saved = readStrictness(progress).value;
    if (saved) return saved;
    return userId === "farouk" ? "normal" : "strict";
  }

  function noSpeech(merged) {
    const words = (merged && merged.words) || [];
    const heard = String((merged && merged.heard) || "").trim();
    const matched = words.filter((w) => w.error !== "Omission" && w.error !== "Insertion");
    if (!heard && !matched.length) return true;
    if (!matched.length) return true;
    if (words.length && words.every((w) => w.error === "Omission" || w.error === "Insertion")) return true;
    return false;
  }

  function finalScore(merged, level) {
    if (noSpeech(merged)) return null;
    const refWords = ((merged && merged.words) || []).filter((w) => w.error !== "Insertion");
    if (!refWords.length) return null;
    const accuracy = Math.round(refWords.reduce((a, w) => a + (Number(w.score) || 0), 0) / refWords.length);
    const matched = refWords.filter((w) => w.error !== "Omission").length;
    const completeness = Math.round((matched / refWords.length) * 100);
    const flu = merged.scores && merged.scores.fluency != null ? Number(merged.scores.fluency) : accuracy;
    let pron;
    if (level === "gentle") {
      pron = Math.round(accuracy * 0.5 + completeness * 0.3 + flu * 0.2);
    } else if (level === "normal") {
      pron = Math.round(accuracy * (completeness / 100) * 0.85 + flu * 0.15);
    } else {
      const raw = Math.round(accuracy * (completeness / 100) * 0.9 + flu * 0.1);
      const weakest = Math.min(...refWords.map((w) => Number(w.score) || 0));
      pron = Math.min(raw, weakest + 15);
    }
    pron = Math.max(0, Math.min(100, Math.round(pron)));
    return { pron, accuracy, fluency: Math.round(flu), completeness, prosody: merged.scores ? merged.scores.prosody : null };
  }

  function countMatches(re, text) {
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    const g = new RegExp(re.source, flags);
    return (String(text || "").match(g) || []).length;
  }

  function soundSamples(text, words, pronScore, patterns) {
    const samples = [];
    for (const pat of patterns || []) {
      const matched = (words || []).filter((w) => w && w.error !== "Insertion" && w.word && pat.test.test(w.word));
      if (matched.length) {
        const avg = Math.round(matched.reduce((a, w) => a + (w.score || 0), 0) / matched.length);
        samples.push({ k: pat.id, s: avg });
      } else if (pat.test.test(text || "") && typeof pronScore === "number") {
        samples.push({ k: pat.id, s: pronScore });
      }
    }
    return samples;
  }

  function weakSounds(progress, minN = 4) {
    const acc = {};
    for (const att of (progress && progress.attempts) || []) {
      if (att && att.demo === true) continue;
      for (const sm of att.sounds || []) {
        if (!sm || sm.s == null || !sm.k) continue;
        acc[sm.k] = acc[sm.k] || { sum: 0, n: 0 };
        acc[sm.k].sum += sm.s;
        acc[sm.k].n += 1;
      }
    }
    return Object.entries(acc)
      .map(([k, v]) => ({ k, avg: v.sum / v.n, n: v.n }))
      .filter((x) => x.n >= minN)
      .sort((a, b) => a.avg - b.avg || b.n - a.n);
  }

  function drillSentenceIds(units, progress, patterns, limit = 6) {
    const weak = weakSounds(progress).slice(0, 3);
    if (!weak.length) return [];
    const weight = {};
    weak.forEach((w) => { weight[w.k] = Math.max(1, 100 - w.avg); });
    const scored = [];
    for (const u of units || []) {
      for (const s of u.sentences || []) {
        let score = 0;
        for (const p of patterns || []) {
          if (!weight[p.id]) continue;
          const n = countMatches(p.test, s.de);
          if (n) score += weight[p.id] * Math.min(3, n);
        }
        if (score > 0) scored.push({ id: s.id, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
    const out = [];
    for (const row of scored) {
      if (out.length >= limit) break;
      out.push(row.id);
    }
    return out;
  }

  function migrateLegacy(oldProgress, legacyList, units) {
    const progress = emptyProgress();
    const byText = new Map();
    for (const u of units || []) {
      for (const s of u.sentences || []) byText.set(norm(s.de), s.id);
    }
    const textByOld = new Map((legacyList || []).map((x) => [x.oldId, x.de]));
    const oldBest = (oldProgress && oldProgress.best) || {};
    for (const [oldId, raw] of Object.entries(oldBest)) {
      const b = asBest(raw);
      if (!b) continue;
      const de = textByOld.get(oldId) || "";
      const id = (de && byText.get(norm(de))) || ("legacy:" + oldId);
      const prev = progress.best[id];
      if (!prev || b.score > prev.score) progress.best[id] = { score: b.score, at: b.at || 1 };
    }
    progress.attempts = ((oldProgress && oldProgress.attempts) || []).map((a, i) => {
      const de = (a && a.text) || "";
      const id = byText.get(norm(de)) || (a && a.id) || ("legacy:" + i);
      return {
        id: "legacy-att-" + ((a && a.ts) || i) + "-" + i,
        sentenceId: id,
        text: de,
        score: a ? a.score : 0,
        at: (a && a.ts) || 0,
        demo: !!(a && a.demo),
        sounds: [],
      };
    });
    progress.days = recomputeDays(progress.attempts);
    progress.updatedAt = 1;
    return progress;
  }

  function cursorFromLegacy(oldPos, legacyList, units) {
    if (!oldPos || !oldPos.level || oldPos.level === "CUSTOM") return null;
    const oldId = `${oldPos.level}-${oldPos.idx && oldPos.idx[oldPos.level] ? oldPos.idx[oldPos.level] : 0}`;
    const row = (legacyList || []).find((x) => x.oldId === oldId);
    if (!row) return null;
    const hit = (units || []).flatMap((u) => u.sentences.map((s) => ({ u, s }))).find((x) => norm(x.s.de) === norm(row.de));
    if (!hit) return null;
    return { sentenceId: hit.s.id, unitId: hit.u.id, at: 1 };
  }

function mergeCatalog(a, b) {
  const map = new Map();
  for (const u of [...(a || []), ...(b || [])]) {
    if (!u || !u.id) continue;
    const prev = map.get(u.id);
    if (!prev || (u.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(u.id, u);
  }
  // Keep deleted tombstones so an older device cannot bring a unit back.
  return [...map.values()];
}

  function diffOps(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push(["equal", i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(["delete", i]); i++; }
      else { ops.push(["insert", j]); j++; }
    }
    while (i < n) { ops.push(["delete", i]); i++; }
    while (j < m) { ops.push(["insert", j]); j++; }
    return ops;
  }

  function mergeUtterance(referenceText, segments) {
    const ref = String(referenceText || "").split(/\s+/).map((w) => w.trim()).filter((w) => norm(w));
    const recognized = [];
    const heardParts = [];
    const flu = [];
    const pros = [];
    for (const seg of segments || []) {
      if (!seg) continue;
      if (seg.heard) heardParts.push(String(seg.heard).trim());
      const words = (seg.words || []).filter((w) => w && w.error !== "Omission" && norm(w.word));
      if (seg.fluency != null && words.length) flu.push({ v: Number(seg.fluency) || 0, w: words.length });
      if (seg.prosody != null) pros.push(Number(seg.prosody) || 0);
      recognized.push(...words);
    }
    const refNorm = ref.map(norm);
    const recNorm = recognized.map((w) => norm(w.word));
    const ops = diffOps(refNorm, recNorm);
    const strip = (w) => String(w || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const words = ops.map((op) => {
      if (op[0] === "equal") {
        const src = recognized[op[2]];
        const score = Math.max(0, Math.round(Number(src.score) || 0));
        let error = src.error && src.error !== "None" ? src.error : "None";
        if ((error === "None" || error === "Mispronunciation") && score < 60) error = "Mispronunciation";
        if (error === "None" && score >= 60) error = "None";
        return { word: strip(ref[op[1]]) || src.word, score, error, phonemes: src.phonemes || [] };
      }
      if (op[0] === "delete") {
        return { word: strip(ref[op[1]]), score: 0, error: "Omission", phonemes: [] };
      }
      const src = recognized[op[1]];
      return { word: src.word, score: Math.max(0, Math.round(Number(src.score) || 0)), error: "Insertion", phonemes: src.phonemes || [] };
    });
    const scored = words.filter((w) => w.error !== "Insertion");
    const accuracy = scored.length ? Math.round(scored.reduce((a, w) => a + w.score, 0) / scored.length) : 0;
    const spoken = words.filter((w) => w.error !== "Insertion" && w.error !== "Omission").length;
    const completeness = ref.length ? Math.round((spoken / ref.length) * 100) : (recognized.length ? 100 : 0);
    const fluency = flu.length ? Math.round(flu.reduce((a, x) => a + x.v * x.w, 0) / flu.reduce((a, x) => a + x.w, 0)) : null;
    const prosody = pros.length ? Math.round(pros.reduce((a, v) => a + v, 0) / pros.length) : null;
    const parts = [accuracy, fluency, completeness, prosody].filter((v) => v != null);
    parts.sort((p, q) => p - q);
    let pron = accuracy;
    if (parts.length >= 4) pron = Math.round(parts[0] * 0.4 + parts[1] * 0.2 + parts[2] * 0.2 + parts[3] * 0.2);
    else if (parts.length === 3) pron = Math.round(parts[0] * 0.6 + parts[1] * 0.2 + parts[2] * 0.2);
    else if (parts.length === 2) pron = Math.round(parts[0] * 0.6 + parts[1] * 0.4);
    return {
      heard: heardParts.join(" ").replace(/\s+/g, " ").trim(),
      words,
      scores: { pron, accuracy, fluency, completeness, prosody },
    };
  }

  function bestScore(progress, id) {
    const b = progress && progress.best && progress.best[id];
    return b && typeof b.score === "number" ? b.score : null;
  }

  return {
    DAY,
    REVIEW_STEPS,
    UNLOCK_AVG,
    ATTEMPT_CAP,
    norm,
    emptyProgress,
    readPet,
    readUiLang,
    readGuide,
    startOfDay,
    addDays,
    dayKey,
    recomputeDays,
    mergeProgress,
    contentKey,
    unitAverage,
    isUnlocked,
    scheduleReview,
    dueReviews,
    findSentence,
    resumeId,
    nextUpId,
    countMatches,
    soundSamples,
    weakSounds,
    drillSentenceIds,
    migrateLegacy,
    cursorFromLegacy,
    mergeCatalog,
    mergeUtterance,
    bestScore,
    scoreForProgress,
    countingAttempts,
    SPEECH_RMS,
    strictnessMarks,
    effectiveStrictness,
    readStrictness,
    noSpeech,
    finalScore,
  };
});
