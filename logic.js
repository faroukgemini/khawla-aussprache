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
    const value = v && (v.value === "en" || v.value === "de") ? v.value : "";
    return { value, at: Math.max(0, Number(v && v.at) || 0) };
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
      uiLang: { value: "", at: 0 },
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
      guide: readGuide(x),
      clearedAt: x.clearedAt || 0,
    });
  }

  function unitAverage(unit, progress) {
    const list = (unit && unit.sentences) || [];
    if (!list.length) return 0;
    const sum = list.reduce((a, s) => a + (((progress.best || {})[s.id] && progress.best[s.id].score) || 0), 0);
    return sum / list.length;
  }

  function isUnlocked(index, units, progress) {
    if (index <= 0) return true;
    const prev = units[index - 1];
    if (!prev) return true;
    return unitAverage(prev, progress) >= UNLOCK_AVG;
  }

  function scheduleReview(prev, score, now) {
    const step0 = prev && Number.isFinite(prev.step) ? prev.step : 0;
    let step = step0;
    let days;
    if (score >= 80) {
      days = REVIEW_STEPS[Math.min(step0, REVIEW_STEPS.length - 1)];
      step = Math.min(REVIEW_STEPS.length - 1, step0 + 1);
    } else if (score >= 60) {
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
      mastered: step >= MASTER_STEP && score >= 90,
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

  function flatUnlocked(units, progress, admin) {
    const out = [];
    (units || []).forEach((u, i) => {
      if (admin || isUnlocked(i, units, progress)) {
        (u.sentences || []).forEach((s) => out.push({ ...s, unitId: u.id, level: u.level }));
      }
    });
    return out;
  }

  function resumeId(units, progress) {
    const cur = progress && progress.cursor && progress.cursor.sentenceId;
    if (cur && findSentence(units, cur)) return cur;
    for (let i = 0; i < (units || []).length; i++) {
      if (!isUnlocked(i, units, progress)) break;
      const s = units[i].sentences.find((x) => (((progress.best || {})[x.id] || {}).score || 0) < 80);
      if (s) return s.id;
    }
    return units && units[0] && units[0].sentences[0] ? units[0].sentences[0].id : null;
  }

  function nextUpId(units, progress, currentId, admin, now) {
    const flat = flatUnlocked(units, progress, admin);
    if (!flat.length) return currentId || null;
    const start = Math.max(0, flat.findIndex((s) => s.id === currentId) + (currentId ? 1 : 0));
    const order = flat.slice(start).concat(flat.slice(0, start));
    const need = order.find((s) => s.id !== currentId && (((progress.best || {})[s.id] || {}).score || 0) < 80);
    if (need) return need.id;
    const due = dueReviews(progress, now || Date.now()).find((r) => findSentence(units, r.sentenceId));
    if (due && due.sentenceId !== currentId) return due.sentenceId;
    const seq = order.find((s) => s.id !== currentId);
    return seq ? seq.id : currentId;
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
    bestScore,
  };
});
