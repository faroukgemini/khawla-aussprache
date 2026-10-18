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

const langA = { uiLang: { value: "de", at: 10, explicit: true }, guide: { done: false, at: 4 }, best: { s: { score: 90, at: 3 } }, attempts: [] };
const langB = { uiLang: { value: "en", at: 20, explicit: true }, guide: { done: true, at: 30 }, best: { s: { score: 70, at: 2 } }, attempts: [] };
const langM = logic.mergeProgress(langA, langB);
assert.equal(langM.best.s.score, 90);
assert.equal(langM.uiLang.value, "en");
assert.equal(langM.uiLang.explicit, true);
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

const oldDefault = logic.mergeProgress({ uiLang: { value: "de", at: 50 }, best: {}, attempts: [] }, null);
assert.equal(oldDefault.uiLang.value, "");
assert.equal(oldDefault.uiLang.explicit, false);
const strictPick = logic.mergeProgress(
  { strictness: { value: "gentle", at: 10 }, best: {}, attempts: [] },
  { strictness: { value: "strict", at: 20 }, best: {}, attempts: [] }
);
assert.equal(strictPick.strictness.value, "strict");
assert.equal(logic.effectiveStrictness({}, "khawla"), "strict");
assert.equal(logic.effectiveStrictness({}, "farouk"), "normal");

const silent = logic.mergeUtterance("Hallo Welt", []);
assert.equal(logic.noSpeech(silent), true);
assert.equal(logic.finalScore(silent, "strict"), null);
const half = logic.mergeUtterance("eins zwei drei vier", [
  { heard: "eins zwei", fluency: 90, words: [
    { word: "eins", score: 90, error: "None" },
    { word: "zwei", score: 90, error: "None" },
  ] },
]);
const gentleScore = logic.finalScore(half, "gentle");
const strictScore = logic.finalScore(half, "strict");
assert.equal(strictScore.accuracy, 45);
assert.equal(strictScore.completeness, 50);
assert.ok(strictScore.pron <= 15);
assert.ok(strictScore.pron < gentleScore.pron);
const weakWord = logic.mergeUtterance("a b c d", [
  { heard: "a b c d", fluency: 90, words: [
    { word: "a", score: 40, error: "Mispronunciation" },
    { word: "b", score: 95, error: "None" },
    { word: "c", score: 95, error: "None" },
    { word: "d", score: 95, error: "None" },
  ] },
]);
assert.ok(logic.finalScore(weakWord, "strict").pron <= 55);

const demoOnly = logic.emptyProgress();
demoOnly.best.s = { score: 88, at: 5 };
demoOnly.attempts = [{ id: "d", sentenceId: "s", score: 88, at: 5, demo: true }];
assert.equal(logic.scoreForProgress(demoOnly, "s"), null);
assert.equal(logic.countingAttempts(demoOnly).length, 0);
demoOnly.attempts.push({ id: "r", sentenceId: "s", score: 70, at: 9, demo: false });
assert.equal(logic.scoreForProgress(demoOnly, "s"), 70);
const unidentified = logic.emptyProgress();
unidentified.best.s = { score: 91, at: 1 };
assert.equal(logic.scoreForProgress(unidentified, "s"), 91);

const strictMarks = logic.strictnessMarks("strict");
assert.equal(strictMarks.pass, 85);
assert.equal(strictMarks.master, 92);
assert.equal(strictMarks.red, 75);
let strictRev = logic.scheduleReview(null, 82, now, strictMarks);
assert.equal(strictRev.step, 0);
strictRev = logic.scheduleReview(null, 86, now, strictMarks);
assert.equal(strictRev.step, 1);

assert.equal(logic.ACTIVITY_TZ, "Africa/Casablanca");
assert.equal(logic.ACTIVITY_HEARTBEAT_MS, 60000);
assert.equal(logic.ACTIVITY_IDLE_MS, 5 * 60 * 1000);
assert.equal(logic.ACTIVITY_ONLINE_MS, 2 * 60 * 1000);
assert.equal(logic.ACTIVITY_KEEP_DAYS, 60);
const t0 = Date.UTC(2026, 9, 18, 12, 0, 0);
assert.equal(logic.activityDayKey(Date.UTC(2026, 9, 18, 22, 30, 0)), "2026-10-18");
assert.equal(logic.activityDayKey(Date.UTC(2026, 9, 18, 23, 30, 0)), "2026-10-19");
assert.equal(logic.activityWeekday(t0), 0);
assert.equal(logic.recentActivityDays(t0, 14).length, 14);
assert.equal(logic.recentActivityDays(t0, 14).at(-1).key, logic.activityDayKey(t0));

const day = logic.activityDayKey(t0);
let act = logic.applyActivity(logic.emptyActivity(), { kind: "show", at: t0 });
act = logic.applyActivity(act, { kind: "show", at: t0 + 1000 });
assert.equal(act.days[day].sessions, 1);
assert.equal(act.days[day].activeMs, 1000);
act = logic.applyActivity(act, { kind: "hide", at: t0 + 61000 });
assert.equal(act.presence.visible, false);
assert.equal(act.days[day].activeMs, 61000);
act = logic.applyActivity(act, { kind: "show", at: t0 + 61000 + 2 * 60 * 1000 });
assert.equal(act.days[day].sessions, 1, "a return inside 5 min stays one session");
assert.equal(act.days[day].activeMs, 61000, "hidden time is not practice");
act = logic.applyActivity(act, { kind: "hide", at: t0 + 61000 + 2 * 60 * 1000 + 10000 });
assert.equal(act.days[day].activeMs, 71000);
act = logic.applyActivity(act, { kind: "show", at: t0 + 61000 + 2 * 60 * 1000 + 10000 + 5 * 60 * 1000 });
assert.equal(act.days[day].sessions, 2);
assert.equal(act.days[day].activeMs, 71000);
act = logic.applyActivity(act, { kind: "attempt", at: t0 + 61000 + 2 * 60 * 1000 + 10000 + 5 * 60 * 1000 + 1000, score: 80 });
act = logic.applyActivity(act, { kind: "attempt", at: t0 + 61000 + 2 * 60 * 1000 + 10000 + 5 * 60 * 1000 + 2000, score: 100 });
assert.equal(act.days[day].attempts, 2);
assert.equal(act.days[day].scoreSum, 180);
assert.equal(act.days[day].sessions, 2);

let slept = logic.applyActivity(logic.emptyActivity(), { kind: "show", at: t0 });
slept = logic.applyActivity(slept, { kind: "tick", at: t0 + 6 * 60 * 1000 });
assert.equal(slept.days[day].sessions, 2);
assert.equal(slept.days[day].activeMs, 0);

const late = Date.UTC(2026, 9, 18, 22, 59, 0);
let crossed = logic.applyActivity(logic.emptyActivity(), { kind: "show", at: late });
crossed = logic.applyActivity(crossed, { kind: "tick", at: late + 120000 });
assert.equal(crossed.days["2026-10-18"].activeMs, 60000);
assert.equal(crossed.days["2026-10-19"].activeMs, 60000);
assert.equal(crossed.days["2026-10-18"].sessions, 1);
assert.equal(crossed.days["2026-10-19"].sessions || 0, 0);

const noon = Date.UTC(2026, 5, 15, 11, 0, 0);
const oldKey = logic.activityDayKey(noon - 70 * 86400000);
const keepKey = logic.activityDayKey(noon - 10 * 86400000);
let pruned = logic.emptyActivity();
pruned.days[oldKey] = { sessions: 4, activeMs: 5, attempts: 1, scoreSum: 9, first: 1, last: 2 };
pruned.days[keepKey] = { sessions: 2, activeMs: 8, attempts: 0, scoreSum: 0, first: 1, last: 2 };
pruned = logic.applyActivity(pruned, { kind: "show", at: noon });
assert.equal(pruned.days[oldKey], undefined);
assert.equal(pruned.days[keepKey].sessions, 2);
assert.equal(pruned.days[logic.activityDayKey(noon)].sessions, 1);
assert.ok(Object.keys(pruned.days).length <= 60);

const localAct = logic.applyActivity(logic.applyActivity(logic.emptyActivity(), { kind: "show", at: t0 }), { kind: "tick", at: t0 + 60000 });
const remoteAct = {
  presence: { lastSeen: t0 + 5000, visible: true },
  days: { [day]: { sessions: 1, activeMs: 1000, attempts: 3, scoreSum: 210, first: t0, last: t0 } },
  updatedAt: t0,
};
const mergedAct = logic.mergeActivity(localAct, remoteAct, t0 + 60000);
assert.equal(mergedAct.days[day].activeMs, 60000);
assert.equal(mergedAct.days[day].attempts, 3);
assert.equal(mergedAct.days[day].scoreSum, 210);
assert.equal(mergedAct.presence.lastSeen, t0 + 60000);
assert.equal(mergedAct.track.sessionOpen, true);
const echoed = logic.mergeActivity(mergedAct, remoteAct, t0 + 60000);
assert.equal(echoed.days[day].activeMs, 60000);
assert.equal(echoed.days[day].attempts, 3);

console.log("logic tests ok", n, "sentences", UNITS.length, "units");
