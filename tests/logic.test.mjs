import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import logic from "../logic.js";

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL("../sentences.js", import.meta.url), "utf8"), sandbox);
const UNITS = sandbox.window.UNITS;
const LEGACY = sandbox.window.LEGACY;
const PATTERNS = sandbox.window.SOUND_PATTERNS;

const n = UNITS.reduce((a, u) => a + u.sentences.length, 0);
assert.equal(n, 300, "expected 300 sentences, got " + n);
assert.equal(UNITS.length, 30);
const ids = new Set();
for (const u of UNITS) {
  assert.ok(["A1", "A2", "B1"].includes(u.level), u.id);
  assert.ok(u.sentences.length >= 8 && u.sentences.length <= 12, u.id);
  for (const s of u.sentences) {
    assert.ok(!ids.has(s.id), "dup " + s.id);
    ids.add(s.id);
    assert.ok(s.de && s.en, s.id);
    assert.ok(!s.de.includes("|"), s.id);
  }
}
const byText = new Map(UNITS.flatMap((u) => u.sentences.map((s) => [logic.norm(s.de), s.id])));
for (const row of LEGACY) assert.ok(byText.has(logic.norm(row.de)), "legacy missing " + row.oldId);

const prog = logic.emptyProgress();
assert.equal(logic.isUnlocked(0, UNITS, prog), true);
assert.equal(logic.isUnlocked(1, UNITS, prog), false);
UNITS[0].sentences.forEach((s) => { prog.best[s.id] = { score: 80, at: 10 }; });
assert.ok(logic.unitAverage(UNITS[0], prog) >= 80);
assert.equal(logic.isUnlocked(1, UNITS, prog), true);
assert.equal(logic.isUnlocked(2, UNITS, prog), false);

const now = new Date(2026, 9, 18, 15, 0, 0).getTime();
let rev = logic.scheduleReview(null, 92, now);
assert.equal(rev.step, 1);
assert.equal(rev.due, logic.addDays(now, 1));
rev = logic.scheduleReview(rev, 95, rev.due + 1000);
assert.equal(rev.step, 2);
assert.equal(rev.due, logic.addDays(rev.last, 3));
rev = logic.scheduleReview(rev, 40, rev.due + 1000);
assert.equal(rev.step, 0);
assert.equal(rev.due, logic.addDays(rev.last, 1));
const due = logic.dueReviews({ reviews: { a: { due: logic.startOfDay(now), lastScore: 40, last: 1 } } }, now);
assert.equal(due.length, 1);
const later = logic.dueReviews({ reviews: { a: { due: logic.addDays(now, 1), lastScore: 90, last: 1 } } }, now);
assert.equal(later.length, 0);

const local = logic.emptyProgress();
local.best["s"] = { score: 70, at: 5 };
local.attempts = [{ id: "a", sentenceId: "s", text: "Hallo", score: 70, at: 5, sounds: [] }];
const remote = logic.emptyProgress();
remote.best["s"] = { score: 88, at: 9 };
remote.attempts = [
  { id: "a", sentenceId: "s", text: "Hallo", score: 70, at: 5, sounds: [] },
  { id: "b", sentenceId: "s", text: "Hallo", score: 88, at: 9, sounds: [{ k: "r", s: 50 }] },
];
const merged = logic.mergeProgress(local, remote);
assert.equal(merged.best.s.score, 88);
assert.equal(merged.attempts.length, 2);
assert.equal(logic.mergeProgress(merged, remote).attempts.length, 2);
assert.equal(logic.contentKey(logic.mergeProgress(merged, remote)), logic.contentKey(merged));

const wiped = logic.mergeProgress({ ...merged, clearedAt: 100, best: {}, attempts: [], reviews: {}, updatedAt: 100 }, remote);
assert.equal(wiped.attempts.length, 0);
assert.equal(wiped.best.s, undefined);

const samples = logic.soundSamples("Ich trinke Tee.", [
  { word: "Ich", score: 90, error: "None" },
  { word: "trinke", score: 40, error: "Mispronunciation" },
], 60, PATTERNS);
assert.ok(samples.some((s) => s.k === "r" && s.s === 40) || samples.some((s) => s.k === "ie"));
const practiced = logic.emptyProgress();
for (let i = 0; i < 4; i++) {
  practiced.attempts.push({ id: "w" + i, at: i + 1, sounds: [{ k: "ue", s: 30 }, { k: "r", s: 95 }] });
}
const weak = logic.weakSounds(practiced);
assert.equal(weak[0].k, "ue");
const drill = logic.drillSentenceIds(UNITS, practiced, PATTERNS, 6);
assert.ok(drill.length >= 1);
assert.ok(drill.length <= 6);

const old = logic.migrateLegacy(
  { best: { "A1-0": 77 }, attempts: [{ text: "Hallo, ich heiße Khawla.", score: 77, ts: 50 }] },
  LEGACY,
  UNITS
);
assert.equal(old.best["a1-hallo-01"].score, 77);
assert.equal(old.attempts[0].sentenceId, "a1-hallo-01");

const cat = logic.mergeCatalog(
  [{ id: "cu-1", title: "Alt", updatedAt: 1, sentences: [{ id: "x", de: "A", en: "A" }] }],
  [{ id: "cu-1", title: "Alt", deleted: true, updatedAt: 5 }]
);
assert.equal(cat[0].deleted, true);

const resumed = logic.resumeId(UNITS, { cursor: { sentenceId: "a1-essen-03", at: 3 }, best: {} });
assert.equal(resumed, "a1-essen-03");

const petLocal = logic.emptyProgress();
petLocal.best.s = { score: 91, at: 5 };
petLocal.pet = { count: 4, countAt: 10, mute: false, muteAt: 8 };
const petRemote = logic.emptyProgress();
petRemote.best.s = { score: 70, at: 4 };
petRemote.pet = { count: 9, countAt: 20, mute: true, muteAt: 30 };
const petMerged = logic.mergeProgress(petLocal, petRemote);
assert.equal(petMerged.best.s.score, 91);
assert.equal(petMerged.pet.count, 9);
assert.equal(petMerged.pet.mute, true);
const petMutedEarlier = logic.mergeProgress(
  { pet: { count: 9, countAt: 20, mute: false, muteAt: 40 } },
  { pet: { count: 3, countAt: 12, mute: true, muteAt: 30 } }
);
assert.equal(petMutedEarlier.pet.count, 9);
assert.equal(petMutedEarlier.pet.mute, false);
const petCleared = logic.mergeProgress(
  { clearedAt: 50, pet: { count: 0, countAt: 0, mute: false, muteAt: 0 }, best: {}, attempts: [] },
  { pet: { count: 9, countAt: 20, mute: true, muteAt: 30 }, best: { s: { score: 80, at: 10 } }, attempts: [{ id: "old", at: 10, score: 80 }] }
);
assert.equal(petCleared.pet.count, 0);
assert.equal(petCleared.pet.mute, false);
assert.equal(petCleared.attempts.length, 0);
const bare = logic.mergeProgress({ best: { s: { score: 60, at: 1 } }, attempts: [] }, null);
assert.equal(bare.pet.count, 0);
assert.equal(logic.contentKey(bare), logic.contentKey({ ...bare, pet: { count: 0, countAt: 0, mute: false, muteAt: 0 } }));

const langA = { uiLang: { value: "de", at: 10 }, guide: { done: false, at: 4 }, best: { s: { score: 90, at: 3 } }, attempts: [] };
const langB = { uiLang: { value: "en", at: 20 }, guide: { done: true, at: 30 }, best: { s: { score: 70, at: 2 } }, attempts: [] };
const langM = logic.mergeProgress(langA, langB);
assert.equal(langM.best.s.score, 90);
assert.equal(langM.uiLang.value, "en");
assert.equal(langM.guide.done, true);
assert.equal(langM.guide.seenVersion, 1);
const langReset = logic.mergeProgress(
  { clearedAt: 40, uiLang: { value: "", at: 0 }, guide: { done: false, at: 0 }, best: {}, attempts: [] },
  langB
);
assert.equal(langReset.uiLang.value, "");
assert.equal(langReset.guide.done, false);
assert.equal(langReset.guide.seenVersion, 0);
const legacySeen = logic.mergeProgress({ guide: { done: true, at: 8 }, best: {}, attempts: [] }, null);
assert.equal(legacySeen.guide.seenVersion, 1);
const newerGuide = logic.mergeProgress(
  { guide: { done: true, at: 10, seenVersion: 2 }, best: {}, attempts: [] },
  { guide: { done: true, at: 50 }, best: {}, attempts: [] }
);
assert.equal(newerGuide.guide.seenVersion, 2);
const guideCleared = logic.mergeProgress(
  { clearedAt: 40, guide: { done: false, at: 0, seenVersion: 0 }, best: {}, attempts: [] },
  { guide: { done: true, at: 30, seenVersion: 2 }, best: { s: { score: 91, at: 12 } }, attempts: [] }
);
assert.equal(guideCleared.guide.seenVersion, 0);
assert.equal(guideCleared.best.s, undefined);
const guideKeepsScore = logic.mergeProgress(
  { guide: { done: true, at: 8 }, best: { s: { score: 91, at: 12 } }, attempts: [] },
  { guide: { done: true, at: 9, seenVersion: 2 }, best: {}, attempts: [] }
);
assert.equal(guideKeepsScore.guide.seenVersion, 2);
assert.equal(guideKeepsScore.best.s.score, 91);
assert.equal(
  logic.contentKey({ guide: { done: true, at: 5 }, best: {}, attempts: [] }),
  logic.contentKey({ guide: { done: true, at: 5, seenVersion: 1 }, best: {}, attempts: [] })
);

const said = logic.mergeUtterance("Hallo, ich heiße Khawla.", [
  { heard: "Hallo ich", fluency: 80, prosody: 70, words: [
    { word: "Hallo", score: 90, error: "None", phonemes: [{ p: "h", score: 90 }] },
    { word: "ich", score: 88, error: "None", phonemes: [] },
  ] },
  { heard: "heiße Khawla", fluency: 60, words: [
    { word: "heiße", score: 70, error: "None", phonemes: [{ p: "h", score: 70 }] },
    { word: "Khawla", score: 95, error: "None", phonemes: [] },
  ] },
]);
assert.deepEqual(said.words.map((w) => w.word), ["Hallo", "ich", "heiße", "Khawla"]);
assert.equal(said.words.some((w) => w.error === "Omission"), false);
assert.equal(said.heard, "Hallo ich heiße Khawla");
assert.equal(said.scores.completeness, 100);
assert.equal(said.scores.fluency, 70);
const partial = logic.mergeUtterance("Hallo, ich heiße Khawla.", [
  { heard: "Hallo", fluency: 90, words: [{ word: "Hallo", score: 92, error: "None", phonemes: [] }] },
]);
assert.deepEqual(partial.words.map((w) => w.error), ["None", "Omission", "Omission", "Omission"]);
assert.equal(partial.scores.completeness, 25);
const extra = logic.mergeUtterance("ich heiße", [
  { heard: "ich ja heiße", fluency: 80, words: [
    { word: "ich", score: 80, error: "None" },
    { word: "ja", score: 50, error: "None" },
    { word: "heiße", score: 80, error: "None" },
  ] },
]);
assert.deepEqual(extra.words.map((w) => [w.word, w.error]), [["ich", "None"], ["ja", "Insertion"], ["heiße", "None"]]);

console.log("logic tests ok", n, "sentences", UNITS.length, "units");
