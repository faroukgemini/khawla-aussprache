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

  function timeOf(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return 0;
      const asNum = Number(trimmed);
      if (Number.isFinite(asNum) && String(asNum) === trimmed) return asNum;
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof v === "object") {
      if (typeof v.toMillis === "function") {
        const ms = Number(v.toMillis());
        if (Number.isFinite(ms)) return ms;
      }
      if (typeof v.seconds === "number" && Number.isFinite(v.seconds)) {
        const nanos = Number(v.nanoseconds) || 0;
        return v.seconds * 1000 + Math.floor(nanos / 1e6);
      }
    }
    return 0;
  }

  function emptyPet() {
    return { count: 0, countAt: 0, mute: false, muteAt: 0 };
  }

  function readPet(src) {
    const pet = (src && src.pet) || {};
    return {
      count: Math.max(0, Math.floor(Number(pet.count) || 0)),
      countAt: timeOf(pet.countAt),
      mute: !!pet.mute,
      muteAt: timeOf(pet.muteAt),
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
      ? (timeOf(a.countAt) >= timeOf(b.countAt) ? a : b)
      : (a.count > b.count ? a : b);
    const muteSide = timeOf(a.muteAt) >= timeOf(b.muteAt) ? a : b;
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
    return { value: raw, at: timeOf(v.at), explicit: true };
  }

  function readStrictness(src) {
    const s = src && src.strictness;
    const value = s && (s.value === "gentle" || s.value === "normal" || s.value === "strict") ? s.value : "";
    return { value, at: timeOf(s && s.at) };
  }

  function readGuide(src) {
    const g = src && src.guide;
    const done = !!(g && g.done);
    let seenVersion = Math.max(0, Math.floor(Number(g && g.seenVersion) || 0));
    if (!seenVersion && done) seenVersion = 1;
    return { done: done || seenVersion > 0, at: timeOf(g && g.at), seenVersion };
  }

  function laterOf(a, b) {
    return timeOf(a && a.at) >= timeOf(b && b.at) ? a : b;
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
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return { score: v, at: 0 };
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return { score: Number(v), at: 0 };
    if (typeof v === "object") {
      const raw = v.score;
      const score = typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null);
      if (score == null) return null;
      return { score, at: timeOf(v.at) };
    }
    return null;
  }

  function normalizeAttempt(att) {
    if (!att || typeof att !== "object") return null;
    const at = timeOf(att.at != null ? att.at : att.ts);
    const sentenceId = att.sentenceId ? String(att.sentenceId) : "";
    const rawScore = att.score;
    const score = typeof rawScore === "number" && Number.isFinite(rawScore)
      ? rawScore
      : (typeof rawScore === "string" && rawScore.trim() !== "" && Number.isFinite(Number(rawScore)) ? Number(rawScore) : null);
    let id = att.id != null && String(att.id) ? String(att.id) : "";
    if (!id) {
      const text = att.text ? String(att.text).slice(0, 80) : "";
      id = "att-" + [sentenceId, at, score == null ? "" : score, text].join("-");
    }
    const copy = Object.assign({}, att);
    copy.id = id;
    copy.at = at;
    if (sentenceId) copy.sentenceId = sentenceId;
    if (score != null) copy.score = score;
    return copy;
  }

  function attemptList(src) {
    const raw = src && src.attempts;
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
    const out = [];
    for (const item of list) {
      const att = normalizeAttempt(item);
      if (att) out.push(att);
    }
    return out;
  }

  function stampCursor(c) {
    if (!c) return null;
    const at = timeOf(c.at);
    if (!c.sentenceId && !c.unitId && !at) return null;
    return { sentenceId: c.sentenceId || null, unitId: c.unitId || null, at };
  }

function stripCleared(src, clearedAt) {
  const p = src || emptyProgress();
  const cut = timeOf(clearedAt);
  if (!cut) return p;
  const best = {};
  for (const [id, raw] of Object.entries(p.best || {})) {
    const b = asBest(raw);
    if (b && timeOf(b.at) > cut) best[id] = b;
  }
  const attempts = attemptList(p).filter((a) => timeOf(a.at) > cut);
  const reviews = {};
  for (const [id, r] of Object.entries(p.reviews || {})) {
    if (r && timeOf(r.last) > cut) reviews[id] = r;
  }
  const cursor = p.cursor && timeOf(p.cursor.at) > cut ? p.cursor : null;
  const showTrans = p.showTrans && timeOf(p.showTrans.at) > cut ? p.showTrans : { value: true, at: 0 };
  return { ...p, best, attempts, reviews, cursor, showTrans };
}

function mergeProgress(local, remote) {
  const clearedAt = Math.max(timeOf(local && local.clearedAt), timeOf(remote && remote.clearedAt));
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
    else best[id] = timeOf(x.at) >= timeOf(y.at) ? x : y;
  }
  const byId = new Map();
  for (const att of [...attemptList(A), ...attemptList(B)]) {
    const prev = byId.get(att.id);
    if (!prev || timeOf(att.at) >= timeOf(prev.at)) byId.set(att.id, att);
  }
  let attempts = [...byId.values()].sort((p, q) => timeOf(p.at) - timeOf(q.at) || String(p.id).localeCompare(String(q.id)));
  if (attempts.length > ATTEMPT_CAP) attempts = attempts.slice(-ATTEMPT_CAP);
  for (const att of attempts) {
    if (!att.sentenceId || typeof att.score !== "number" || att.demo === true) continue;
    const prev = asBest(best[att.sentenceId]);
    const row = { score: att.score, at: timeOf(att.at) };
    if (!prev || row.score > prev.score || (row.score === prev.score && row.at > timeOf(prev.at))) best[att.sentenceId] = row;
  }
  const reviews = {};
  for (const id of new Set([...Object.keys(A.reviews || {}), ...Object.keys(B.reviews || {})])) {
    const x = A.reviews[id];
    const y = B.reviews[id];
    if (!x) reviews[id] = y;
    else if (!y) reviews[id] = x;
    else reviews[id] = timeOf(x.last) >= timeOf(y.last) ? x : y;
  }
  const cursor = stampCursor(!A.cursor ? (B.cursor || null) : !B.cursor ? A.cursor : (timeOf(A.cursor.at) >= timeOf(B.cursor.at) ? A.cursor : B.cursor));
  const stA = A.showTrans || { value: true, at: 0 };
  const stB = B.showTrans || { value: true, at: 0 };
  const showTrans = timeOf(stA.at) >= timeOf(stB.at) ? { value: !!stA.value, at: timeOf(stA.at) } : { value: !!stB.value, at: timeOf(stB.at) };
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
    updatedAt: Math.max(timeOf(A.updatedAt), timeOf(B.updatedAt)),
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

  const OPEN_UNITS = 3;

  function isUnlocked(index, units, progress, passScore) {
    if (index < OPEN_UNITS) return true;
    const prev = units[index - 1];
    if (!prev) return true;
    return unitAverage(prev, progress) >= (passScore || UNLOCK_AVG);
  }

  function lockUnitBrief(u) {
    if (!u) return { id: "", title: "", titleEn: "", emoji: "" };
    return { id: u.id || "", title: u.title || "", titleEn: u.titleEn || "", emoji: u.emoji || "" };
  }

  function lockAdvice(units, index, progress, need) {
    const threshold = Number(need) > 0 ? Number(need) : UNLOCK_AVG;
    const list = units || [];
    if (!(index >= OPEN_UNITS) || !list[index] || isUnlocked(index, list, progress, threshold)) {
      return { locked: false, need: threshold };
    }
    let gate = index;
    while (gate > OPEN_UNITS && !isUnlocked(gate - 1, list, progress, threshold)) gate -= 1;
    const prev = list[gate - 1];
    const rows = ((prev && prev.sentences) || []).map((s) => {
      const raw = scoreForProgress(progress, s.id);
      return { id: s.id, de: s.de, en: s.en || "", score: raw == null ? null : Math.round(raw) };
    });
    const items = rows.filter((r) => r.score != null && r.score < threshold)
      .sort((a, b) => a.score - b.score || String(a.de).localeCompare(String(b.de)));
    const missing = rows.filter((r) => r.score == null);
    const anyScore = rows.some((r) => r.score != null);
    return {
      locked: true,
      kind: anyScore ? "scores" : "start",
      need: threshold,
      average: prev ? unitAverage(prev, progress) : 0,
      later: gate !== index,
      target: lockUnitBrief(list[index]),
      blocked: lockUnitBrief(list[gate]),
      previous: lockUnitBrief(prev),
      items,
      missing,
      startId: rows[0] ? rows[0].id : null,
    };
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
    const rawAttempts = (oldProgress && oldProgress.attempts) || [];
    const attemptRows = Array.isArray(rawAttempts) ? rawAttempts : Object.values(rawAttempts);
    progress.attempts = attemptRows.map((a, i) => {
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

  const ACTIVITY_TZ = "Africa/Casablanca";
  const ACTIVITY_IDLE_MS = 5 * 60 * 1000;
  const ACTIVITY_HEARTBEAT_MS = 60 * 1000;
  const ACTIVITY_ONLINE_MS = 2 * 60 * 1000;
  const ACTIVITY_KEEP_DAYS = 60;
  const ACTIVITY_RECENT_CAP = 40;

  function activityDayKey(ts) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ACTIVITY_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(ts));
  }

  function activityWeekday(ts) {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: ACTIVITY_TZ, weekday: "short" }).format(new Date(ts));
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name] || 0;
  }

  function nextActivityMidnight(ts) {
    const key = activityDayKey(ts);
    let lo = ts + 1;
    let hi = ts + 36 * 3600 * 1000;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (activityDayKey(mid) === key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function activityDayStart(ts) {
    const key = activityDayKey(ts);
    let lo = ts - 36 * 3600 * 1000;
    let hi = ts;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (activityDayKey(mid) === key) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function recentActivityDays(now, n) {
    const count = Math.max(1, Math.floor(n) || 1);
    const out = [];
    let t = now;
    for (let i = 0; i < count; i++) {
      out.push({ key: activityDayKey(t), at: t, weekday: activityWeekday(t) });
      t = activityDayStart(t) - 1;
    }
    return out.reverse();
  }

  function readDeviceId(id) {
    const s = String(id || "");
    return /^[A-Za-z0-9_-]{6,48}$/.test(s) ? s : "";
  }

  function readDeviceLabel(label) {
    return String(label || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  const SAMSUNG_MODELS = {
    "SM-S931": "Galaxy S25", "SM-S936": "Galaxy S25+", "SM-S938": "Galaxy S25 Ultra",
    "SM-S921": "Galaxy S24", "SM-S926": "Galaxy S24+", "SM-S928": "Galaxy S24 Ultra",
    "SM-S911": "Galaxy S23", "SM-S916": "Galaxy S23+", "SM-S918": "Galaxy S23 Ultra",
    "SM-S901": "Galaxy S22", "SM-S906": "Galaxy S22+", "SM-S908": "Galaxy S22 Ultra",
    "SM-G991": "Galaxy S21", "SM-G996": "Galaxy S21+", "SM-G998": "Galaxy S21 Ultra",
    "SM-G990": "Galaxy S21 FE", "SM-G781": "Galaxy S20 FE",
    "SM-A556": "Galaxy A55", "SM-A546": "Galaxy A54", "SM-A536": "Galaxy A53",
    "SM-A528": "Galaxy A52s", "SM-A526": "Galaxy A52 5G", "SM-A525": "Galaxy A52",
    "SM-A356": "Galaxy A35", "SM-A346": "Galaxy A34", "SM-A336": "Galaxy A33",
    "SM-A256": "Galaxy A25", "SM-A245": "Galaxy A24",
    "SM-A166": "Galaxy A16", "SM-A165": "Galaxy A16", "SM-A156": "Galaxy A15", "SM-A155": "Galaxy A15",
    "SM-A146": "Galaxy A14", "SM-A145": "Galaxy A14", "SM-A057": "Galaxy A05s", "SM-A055": "Galaxy A05", "SM-A065": "Galaxy A06",
    "SM-F956": "Galaxy Z Fold6", "SM-F946": "Galaxy Z Fold5", "SM-F741": "Galaxy Z Flip6", "SM-F731": "Galaxy Z Flip5",
    "SM-M546": "Galaxy M54", "SM-M346": "Galaxy M34", "SM-M156": "Galaxy M15",
  };

  function mapPhoneModel(code) {
    const raw = String(code || "").replace(/\s+/g, " ").trim().split(" Build/")[0].trim();
    if (!raw || /^k$/i.test(raw)) return "";
    if (/^pixel\b/i.test(raw)) return raw;
    const upper = raw.toUpperCase().replace(/\s+/g, "");
    return SAMSUNG_MODELS[upper.slice(0, 7)] || SAMSUNG_MODELS[upper] || raw;
  }

  function browserName(ua, brands) {
    const list = Array.isArray(brands) ? brands : [];
    const has = (re) => list.some((b) => re.test(String((b && b.brand) || "")));
    if (has(/edge/i)) return "Edge";
    if (has(/opera|opr/i)) return "Opera";
    if (has(/samsung/i)) return "Samsung Internet";
    if (has(/chrome/i)) return "Chrome";
    if (has(/firefox/i)) return "Firefox";
    if (has(/chromium/i)) return "Chrome";
    const s = String(ua || "");
    if (/Edg\/|EdgiOS/i.test(s)) return "Edge";
    if (/OPR\/|OPiOS|Opera/i.test(s)) return "Opera";
    if (/SamsungBrowser/i.test(s)) return "Samsung Internet";
    if (/FxiOS|Firefox\//i.test(s)) return "Firefox";
    if (/CriOS|Chrome\//i.test(s)) return "Chrome";
    if (/Safari\//i.test(s)) return "Safari";
    return "Browser";
  }

  function iosVersion(ua) {
    const m = String(ua || "").match(/OS (\d+)[_.](\d+)/);
    return m ? m[1] + "." + m[2] : "";
  }

  function androidFromUa(ua) {
    const m = String(ua || "").match(/Android\s+([0-9.]+);\s*([^);]+)/i);
    if (!m) return { version: "", model: "" };
    const model = mapPhoneModel(m[2]);
    return { version: model ? m[1].split(".")[0] : "", model };
  }

  function windowsName(platformVersion, ua) {
    const pv = String(platformVersion || "");
    const major = parseInt(pv.split(".")[0], 10);
    if (pv && Number.isFinite(major)) {
      if (major >= 13) return "Windows 11";
      if (major >= 1) return "Windows 10";
      if (pv.indexOf("0.3") === 0) return "Windows 8.1";
      if (pv.indexOf("0.2") === 0) return "Windows 8";
      if (pv.indexOf("0.1") === 0) return "Windows 7";
    }
    if (/Windows NT 10\.0/i.test(ua)) return "Windows 10";
    if (/Windows NT 6\.3/i.test(ua)) return "Windows 8.1";
    if (/Windows NT 6\.1/i.test(ua)) return "Windows 7";
    return "Windows";
  }

  function macName(platformVersion, ua) {
    const pv = String(platformVersion || "");
    let v = "";
    if (/^\d+\.\d+/.test(pv)) {
      const p = pv.split(".");
      v = p[0] + "." + p[1];
    } else {
      const m = String(ua || "").match(/Mac OS X (\d+)[_.](\d+)/i);
      if (m) v = m[1] + "." + m[2];
    }
    return v ? "Mac · macOS " + v : "Mac";
  }

  function deviceHardwareLabel(ua, hints, standalone) {
    const h = hints || {};
    const browser = browserName(ua, h.fullVersionList);
    const app = standalone ? " · App" : "";
    const s = String(ua || "");
    const platform = String(h.platform || "");
    if (/iPad/i.test(s)) {
      const v = iosVersion(s);
      return "iPad" + (v ? " · iOS " + v : "") + " · " + browser + app;
    }
    if (/iPhone|iPod/i.test(s)) {
      const v = iosVersion(s);
      return "iPhone" + (v ? " · iOS " + v : "") + " · " + browser + app;
    }
    if (/android/i.test(platform) || /Android/i.test(s)) {
      const fromUa = androidFromUa(s);
      const model = mapPhoneModel(h.model) || fromUa.model;
      let ver = "";
      if (h.platformVersion && /^\d+/.test(String(h.platformVersion))) ver = String(h.platformVersion).split(".")[0];
      else ver = fromUa.version;
      if (!model) return "Android" + (ver ? " " + ver : "") + " · " + browser + app;
      return model + (ver ? " · Android " + ver : "") + " · " + browser + app;
    }
    if (/windows/i.test(platform) || /Windows/i.test(s)) return windowsName(h.platformVersion, s) + " · " + browser + app;
    if (/mac/i.test(platform) || /Mac OS X|Macintosh/i.test(s)) return macName(h.platformVersion, s) + " · " + browser + app;
    if (/chrome os/i.test(platform) || /CrOS/i.test(s)) return "Chromebook · " + browser + app;
    if (/linux/i.test(platform) || /Linux/i.test(s)) return "Linux · " + browser + app;
    return "Computer · " + browser + app;
  }

  function deviceAutoLabel(ua, standalone) {
    return deviceHardwareLabel(ua, null, !!standalone);
  }

  function cacheVersionNum(v) {
    const m = String(v || "").match(/v(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  function isOldBuild(reported, current) {
    const have = cacheVersionNum(reported);
    const now = cacheVersionNum(current);
    return have > 0 && now > 0 && have < now;
  }

  function normalizeSyncRow(row, id) {
    const src = row || {};
    let state = src.state;
    if (state !== "synced" && state !== "error" && state !== "notSet") {
      state = src.error ? "error" : ((src.ok || src.lastOk) ? "synced" : "notSet");
    }
    return {
      deviceId: id,
      state,
      ok: state === "synced",
      error: state === "error" ? String(src.error || "").slice(0, 180) : "",
      errorCode: state === "error" ? String(src.errorCode || "").slice(0, 80) : "",
      at: timeOf(src.at),
      lastOk: timeOf(src.lastOk),
      appVersion: String(src.appVersion || "").replace(/[^\w.-]/g, "").slice(0, 24),
      label: readDeviceLabel(src.label),
    };
  }

  function readSyncDevices(doc) {
    const src = doc || {};
    const out = {};
    const map = src.devices && typeof src.devices === "object" ? src.devices : {};
    Object.keys(map).forEach((id) => {
      const clean = readDeviceId(id);
      if (!clean) return;
      out[clean] = normalizeSyncRow(map[id], clean);
    });
    const legacyId = readDeviceId(src.deviceId);
    if (legacyId && !out[legacyId]) out[legacyId] = normalizeSyncRow(src, legacyId);
    return out;
  }

  function activityDeviceViews(activity, syncDoc, currentVersion) {
    const syncMap = readSyncDevices(syncDoc);
    const devices = (activity && activity.devices) || {};
    const seen = new Set();
    const rows = [];
    Object.keys(devices).concat(Object.keys(syncMap)).forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const act = devices[id] || blankDevice();
      const sync = syncMap[id];
      const lastSyncOk = Math.max(timeOf(act.lastSyncOk), sync ? sync.lastOk : 0);
      let state = "notSet";
      let error = "";
      if (sync) {
        state = sync.state;
        error = state === "error" ? sync.error : "";
      } else if (act.lastSyncError && timeOf(act.lastSyncErrorAt) >= lastSyncOk) {
        state = "error";
        error = String(act.lastSyncError || "").slice(0, 180);
      } else if (lastSyncOk) state = "synced";
      const appVersion = (sync && sync.appVersion) || act.appVersion || "";
      rows.push({
        id,
        label: (sync && sync.label) || act.label || "",
        appVersion,
        lastSeen: Math.max(timeOf(act.lastSeen), sync ? sync.at : 0),
        lastSyncOk,
        state,
        error,
        sessions: act.sessions || 0,
        attempts: act.attempts || 0,
        old: isOldBuild(appVersion, currentVersion),
        at: sync ? sync.at : timeOf(act.lastSyncErrorAt),
      });
    });
    rows.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0) || String(a.id).localeCompare(String(b.id)));
    return rows;
  }

  function blankDevice() {
    return { label: "", lastSeen: 0, lastSyncOk: 0, lastSyncError: "", lastSyncErrorAt: 0, appVersion: "", sessions: 0, attempts: 0 };
  }

  function normalizeDevice(d) {
    const src = d || {};
    return {
      label: readDeviceLabel(src.label),
      lastSeen: timeOf(src.lastSeen),
      lastSyncOk: timeOf(src.lastSyncOk),
      lastSyncError: String(src.lastSyncError || "").slice(0, 180),
      lastSyncErrorAt: timeOf(src.lastSyncErrorAt),
      appVersion: String(src.appVersion || "").replace(/[^\w.-]/g, "").slice(0, 24),
      sessions: Math.max(0, Math.floor(Number(src.sessions) || 0)),
      attempts: Math.max(0, Math.floor(Number(src.attempts) || 0)),
    };
  }

  function readDevices(raw) {
    const out = {};
    Object.keys((raw && raw.devices) || {}).forEach((id) => {
      const clean = readDeviceId(id);
      if (!clean) return;
      out[clean] = normalizeDevice(raw.devices[id]);
    });
    return out;
  }

  function normalizeSession(s) {
    if (!s || typeof s !== "object") return null;
    const at = timeOf(s.at);
    if (!at) return null;
    const deviceId = readDeviceId(s.deviceId);
    const id = String(s.id || ("ses-" + at + "-" + (deviceId || "x"))).slice(0, 80);
    return { id, at, deviceId, label: readDeviceLabel(s.label), attempts: Math.max(0, Math.floor(Number(s.attempts) || 0)) };
  }

  function capRecent(list, now) {
    const cutoff = timeOf(now) - (ACTIVITY_KEEP_DAYS - 1) * DAY;
    const rows = [];
    const seen = new Set();
    (list || []).forEach((item) => {
      const row = normalizeSession(item);
      if (!row || row.at < cutoff || seen.has(row.id)) return;
      seen.add(row.id);
      rows.push(row);
    });
    rows.sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id)));
    return rows.slice(0, ACTIVITY_RECENT_CAP);
  }

  function mergeDevices(a, b) {
    const out = {};
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach((id) => {
      if (out[id]) return;
      const x = (a && a[id]) || blankDevice();
      const y = (b && b[id]) || blankDevice();
      const newer = x.lastSeen >= y.lastSeen ? x : y;
      const errSide = x.lastSyncErrorAt >= y.lastSyncErrorAt ? x : y;
      out[id] = {
        label: newer.label || x.label || y.label,
        lastSeen: Math.max(x.lastSeen, y.lastSeen),
        lastSyncOk: Math.max(x.lastSyncOk, y.lastSyncOk),
        lastSyncError: errSide.lastSyncError,
        lastSyncErrorAt: Math.max(x.lastSyncErrorAt, y.lastSyncErrorAt),
        appVersion: newer.appVersion || x.appVersion || y.appVersion,
        sessions: Math.max(x.sessions, y.sessions),
        attempts: Math.max(x.attempts, y.attempts),
      };
    });
    return out;
  }

  function mergePresence(a, b) {
    const left = a || {};
    const right = b || {};
    const win = (left.lastSeen || 0) >= (right.lastSeen || 0) ? left : right;
    const other = win === left ? right : left;
    return {
      lastSeen: Math.max(left.lastSeen || 0, right.lastSeen || 0),
      visible: !!win.visible,
      deviceId: win.deviceId || other.deviceId || "",
      label: win.label || other.label || "",
      appVersion: win.appVersion || other.appVersion || "",
      lastSyncOk: Math.max(left.lastSyncOk || 0, right.lastSyncOk || 0),
    };
  }

  function blankActivityDay() {
    return { sessions: 0, activeMs: 0, attempts: 0, scoreSum: 0, first: 0, last: 0 };
  }

  function normalizeActivityDay(d) {
    const src = d || {};
    return {
      sessions: Math.max(0, Math.floor(Number(src.sessions) || 0)),
      activeMs: Math.max(0, Math.floor(Number(src.activeMs) || 0)),
      attempts: Math.max(0, Math.floor(Number(src.attempts) || 0)),
      scoreSum: Math.max(0, Number(src.scoreSum) || 0),
      first: Math.max(0, Number(src.first) || 0),
      last: Math.max(0, Number(src.last) || 0),
    };
  }

  function emptyActivity() {
    return {
      presence: { lastSeen: 0, visible: false, deviceId: "", label: "", appVersion: "", lastSyncOk: 0 },
      track: { sessionOpen: false, hiddenAt: 0, visibleSince: 0, sessionId: "" },
      days: {},
      devices: {},
      recent: [],
      updatedAt: 0,
    };
  }

  function pruneActivityDays(days, now) {
    const cutoff = activityDayKey(now - (ACTIVITY_KEEP_DAYS - 1) * DAY);
    const out = {};
    Object.keys(days || {}).forEach((k) => {
      if (k >= cutoff) out[k] = days[k];
    });
    return out;
  }

  function readActivity(src) {
    const raw = src || {};
    const days = {};
    Object.keys(raw.days || {}).forEach((k) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = normalizeActivityDay(raw.days[k]);
    });
    const p = raw.presence || {};
    const t = raw.track || {};
    return {
      presence: {
        lastSeen: timeOf(p.lastSeen),
        visible: !!p.visible,
        deviceId: readDeviceId(p.deviceId),
        label: readDeviceLabel(p.label),
        appVersion: String(p.appVersion || "").replace(/[^\w.-]/g, "").slice(0, 24),
        lastSyncOk: timeOf(p.lastSyncOk),
      },
      track: {
        sessionOpen: !!t.sessionOpen,
        hiddenAt: timeOf(t.hiddenAt),
        visibleSince: timeOf(t.visibleSince),
        sessionId: typeof t.sessionId === "string" ? t.sessionId.slice(0, 80) : "",
      },
      days,
      devices: readDevices(raw),
      recent: capRecent(raw.recent, raw.updatedAt || Date.now()),
      updatedAt: timeOf(raw.updatedAt),
    };
  }

  function touchActivityDay(days, key) {
    if (!days[key]) days[key] = blankActivityDay();
    return days[key];
  }

  function addActiveMs(days, from, to) {
    if (!(to > from)) return;
    let cursor = from;
    let guard = 0;
    while (cursor < to && guard < 70) {
      guard += 1;
      const slice = Math.min(to, nextActivityMidnight(cursor));
      const day = touchActivityDay(days, activityDayKey(cursor));
      day.activeMs += slice - cursor;
      if (!day.first || cursor < day.first) day.first = cursor;
      if (slice > (day.last || 0)) day.last = slice;
      cursor = slice;
    }
  }

  function applyActivity(src, event) {
    const now = Math.max(0, Number(event && event.at) || 0);
    const kind = event && event.kind;
    const deviceId = readDeviceId(event && event.deviceId);
    const label = readDeviceLabel(event && event.label);
    const appVersion = String((event && event.appVersion) || "").replace(/[^\w.-]/g, "").slice(0, 24);
    const a = readActivity(src);

    function touchDev() {
      if (!deviceId) return null;
      if (!a.devices[deviceId]) a.devices[deviceId] = blankDevice();
      const row = a.devices[deviceId];
      if (label) row.label = label;
      if (appVersion) row.appVersion = appVersion;
      if (now > row.lastSeen) row.lastSeen = now;
      return row;
    }

    function markPresenceDevice() {
      const row = touchDev();
      if (!deviceId) return;
      a.presence.deviceId = deviceId;
      a.presence.label = label || (row && row.label) || a.presence.label;
      if (appVersion) a.presence.appVersion = appVersion;
    }

    function startSession() {
      const day = touchActivityDay(a.days, activityDayKey(now));
      day.sessions += 1;
      if (!day.first) day.first = now;
      if (now > (day.last || 0)) day.last = now;
      a.track.sessionOpen = true;
      const sessionId = "ses-" + now + "-" + (deviceId || "x");
      a.track.sessionId = sessionId;
      const row = touchDev();
      if (row) row.sessions += 1;
      a.recent.push({ id: sessionId, at: now, deviceId, label: label || (row && row.label) || "", attempts: 0 });
      a.recent = capRecent(a.recent, now);
    }

    function closeSession() {
      a.track.sessionOpen = false;
      a.track.visibleSince = 0;
    }

    function creditVisible(until) {
      const since = a.track.visibleSince;
      if (!since || until <= since) {
        a.track.visibleSince = until || since || 0;
        return;
      }
      if (until - since >= ACTIVITY_IDLE_MS) {
        closeSession();
        return;
      }
      addActiveMs(a.days, since, until);
      a.track.visibleSince = until;
    }

    if (kind === "show") {
      const already = a.presence.visible && a.track.visibleSince && !a.track.hiddenAt && a.track.sessionOpen;
      if (already) {
        creditVisible(now);
      } else {
        if (a.presence.visible && a.track.visibleSince) creditVisible(now);
        const hiddenFor = a.track.hiddenAt ? now - a.track.hiddenAt : Infinity;
        if (!a.track.sessionOpen || hiddenFor >= ACTIVITY_IDLE_MS) startSession();
        a.track.visibleSince = now;
      }
      a.track.hiddenAt = 0;
      a.presence.visible = true;
      a.presence.lastSeen = now;
      markPresenceDevice();
    } else if (kind === "hide") {
      if (a.presence.visible && a.track.visibleSince) creditVisible(now);
      a.presence.visible = false;
      a.presence.lastSeen = now;
      a.track.hiddenAt = now;
      a.track.visibleSince = 0;
      markPresenceDevice();
    } else if (kind === "tick") {
      if (a.presence.visible) {
        const since = a.track.visibleSince;
        if (since && now - since >= ACTIVITY_IDLE_MS) {
          closeSession();
          startSession();
          a.track.visibleSince = now;
        } else {
          creditVisible(now);
        }
        a.presence.lastSeen = now;
        a.presence.visible = true;
      } else {
        return a;
      }
    } else if (kind === "attempt") {
      if (!a.track.sessionOpen || (a.track.hiddenAt && now - a.track.hiddenAt >= ACTIVITY_IDLE_MS)) startSession();
      if (a.presence.visible && a.track.visibleSince) creditVisible(now);
      else a.track.visibleSince = a.track.visibleSince || now;
      const day = touchActivityDay(a.days, activityDayKey(now));
      const score = Math.max(0, Math.min(100, Number(event.score) || 0));
      day.attempts += 1;
      day.scoreSum += score;
      if (!day.first) day.first = now;
      if (now > (day.last || 0)) day.last = now;
      const row = touchDev();
      if (row) row.attempts += 1;
      const open = a.track.sessionId && a.recent.find((s) => s.id === a.track.sessionId);
      if (open) open.attempts += 1;
      a.track.hiddenAt = 0;
      a.presence.visible = true;
      a.presence.lastSeen = now;
      markPresenceDevice();
    } else {
      return a;
    }

    a.days = pruneActivityDays(a.days, now);
    a.recent = capRecent(a.recent, now);
    a.updatedAt = now;
    return a;
  }

  function noteDeviceSync(src, info) {
    const a = readActivity(src);
    const id = readDeviceId(info && info.deviceId);
    const at = timeOf(info && info.at);
    if (!id) return a;
    if (!a.devices[id]) a.devices[id] = blankDevice();
    const row = a.devices[id];
    const label = readDeviceLabel(info && info.label);
    const appVersion = String((info && info.appVersion) || "").replace(/[^\w.-]/g, "").slice(0, 24);
    if (label) row.label = label;
    if (appVersion) row.appVersion = appVersion;
    if (at > row.lastSeen) row.lastSeen = at;
    if (info && info.sync) {
      if (info.ok) {
        row.lastSyncOk = Math.max(row.lastSyncOk, at);
        row.lastSyncError = "";
        row.lastSyncErrorAt = 0;
        a.presence.lastSyncOk = Math.max(a.presence.lastSyncOk || 0, at);
      } else if (info.error) {
        row.lastSyncError = String(info.error).slice(0, 180);
        row.lastSyncErrorAt = at;
      }
    }
    if (label && a.track.sessionId) {
      const open = a.recent.find((s) => s.id === a.track.sessionId && s.deviceId === id);
      if (open) open.label = label;
    }
    if (at >= a.presence.lastSeen) {
      a.presence.lastSeen = at || a.presence.lastSeen;
      a.presence.deviceId = id;
      a.presence.label = row.label;
      if (row.appVersion) a.presence.appVersion = row.appVersion;
    }
    a.updatedAt = Math.max(a.updatedAt, at);
    return a;
  }

  function mergeActivity(local, remote, now) {
    const a = readActivity(local);
    const b = readActivity(remote);
    const days = {};
    Object.keys(a.days).concat(Object.keys(b.days)).forEach((k) => {
      if (days[k]) return;
      const x = a.days[k] || blankActivityDay();
      const y = b.days[k] || blankActivityDay();
      const attempts = Math.max(x.attempts, y.attempts);
      days[k] = {
        sessions: Math.max(x.sessions, y.sessions),
        activeMs: Math.max(x.activeMs, y.activeMs),
        attempts,
        scoreSum: attempts === x.attempts && attempts === y.attempts
          ? Math.max(x.scoreSum, y.scoreSum)
          : (x.attempts >= y.attempts ? x.scoreSum : y.scoreSum),
        first: x.first && y.first ? Math.min(x.first, y.first) : (x.first || y.first),
        last: Math.max(x.last, y.last),
      };
    });
    const presence = mergePresence(a.presence, b.presence);
    const remoteTrack = remote && remote.track && (remote.track.sessionOpen || remote.track.hiddenAt || remote.track.visibleSince);
    const track = remoteTrack && b.updatedAt >= a.updatedAt ? b.track : a.track;
    const at = Math.max(0, Number(now) || 0, a.updatedAt, b.updatedAt, presence.lastSeen);
    return {
      presence,
      track,
      days: pruneActivityDays(days, at || Date.now()),
      devices: mergeDevices(a.devices, b.devices),
      recent: capRecent([].concat(a.recent || [], b.recent || []), at || Date.now()),
      updatedAt: Math.max(a.updatedAt, b.updatedAt),
    };
  }

  function isExactSpeechKey(s) {
    return /^[0-9a-fA-F]{32}$/.test(s) || /^[A-Za-z0-9+/_-]{84}$/.test(s);
  }

  function stripKeyWrapping(s) {
    return String(s || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/^[\s`'"""''«»]+|[\s`'"""''«»]+$/g, "")
      .trim();
  }

  function extractSpeechKey(raw) {
    const text = stripKeyWrapping(raw);
    if (!text) return "";
    const compact = text.replace(/[\s`'"""''«»]+/g, "");
    if (isExactSpeechKey(compact)) return compact;
    const tokens = text.split(/\s+/).map(stripKeyWrapping).filter(Boolean);
    const token84 = tokens.find((t) => /^[A-Za-z0-9+/_-]{84}$/.test(t));
    if (token84) return token84;
    let buf = "";
    const chunks = [];
    tokens.forEach((tok) => {
      if (tok.length >= 16 && /^[A-Za-z0-9+/_-]+$/.test(tok)) buf += tok;
      else {
        if (buf) chunks.push(buf);
        buf = "";
      }
    });
    if (buf) chunks.push(buf);
    const wrapped84 = chunks.find((c) => /^[A-Za-z0-9+/_-]{84}$/.test(c));
    if (wrapped84) return wrapped84;
    const wrapped32 = chunks.find((c) => /^[0-9a-fA-F]{32}$/.test(c));
    if (wrapped32) return wrapped32;
    const token32 = tokens.find((t) => /^[0-9a-fA-F]{32}$/.test(t));
    if (token32) return token32;
    if (tokens.length === 1) return tokens[0];
    return "";
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
    lockAdvice,
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
    ACTIVITY_TZ,
    ACTIVITY_IDLE_MS,
    ACTIVITY_HEARTBEAT_MS,
    ACTIVITY_ONLINE_MS,
    ACTIVITY_KEEP_DAYS,
    ACTIVITY_RECENT_CAP,
    deviceAutoLabel,
    deviceHardwareLabel,
    mapPhoneModel,
    isOldBuild,
    readSyncDevices,
    activityDeviceViews,
    noteDeviceSync,
    activityDayKey,
    activityWeekday,
    recentActivityDays,
    emptyActivity,
    readActivity,
    applyActivity,
    mergeActivity,
    extractSpeechKey,
  };
});
