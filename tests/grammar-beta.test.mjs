import assert from "node:assert/strict";
import fs from "node:fs";
import G from "../grammatik-beta/grammar.js";

const course = G.buildCourse();
const { units, items, placementIds } = course;

assert.ok(items.length >= 1000, "item count " + items.length);
assert.equal(units.length, 50);
assert.equal(placementIds.length, 20);

const ids = new Set();
const byId = new Map();
for (const it of items) {
  assert.ok(!ids.has(it.id), "duplicate " + it.id);
  ids.add(it.id);
  byId.set(it.id, it);
  assert.ok(it.prompt && it.prompt.en && it.prompt.de, it.id);
  assert.ok(it.explain && it.explain.en && it.explain.de, it.id);
  assert.ok(it.answers && it.answers[0], "empty " + it.id);
  assert.equal(it.answers.length, 1, it.id);
  const solved = G.solve(it.check.kind === "transform" ? it.check.to : it.check);
  if (it.type === "order") {
    const words = it.check.kind === "tokens" ? it.check.tokens.slice() : G.clauseWords(it.check);
    assert.equal(it.answers[0], words.join(" "), it.id);
    assert.deepEqual(it.tiles.slice().sort(), words.slice().sort(), it.id);
  } else if (it.type === "spot") {
    assert.equal(it.answers[0], it.check.tokens[it.check.wrongIndex], it.id);
    assert.equal(it.fix, G.solve(it.check.fix), it.id);
    assert.notEqual(it.answers[0], it.fix, it.id);
  } else {
    assert.equal(it.answers[0], solved, it.id);
  }
  if (it.type === "transform") {
    assert.equal(it.sourceText, G.solve(it.check.from), it.id);
    assert.equal(it.answers[0], G.solve(it.check.to), it.id);
  }
  if (it.type === "choice") {
    assert.ok(it.choices.length >= 2, it.id);
    assert.ok(it.choices.some((c) => String(c) === it.answers[0]), it.id + " missing choice");
  }
  if (it.type === "gap" || it.type === "choice" || it.type === "listen" || it.type === "transform") {
    assert.notEqual(it.stimulus, it.answers[0], it.id);
  }
  const wrongs = new Set(G.knownWrong(it.check).map((w) => String(w).toLowerCase()));
  for (const acc of it.accept || []) {
    assert.notEqual(String(acc).toLowerCase(), it.answers[0].toLowerCase(), it.id);
    assert.ok(!wrongs.has(String(acc).toLowerCase()), it.id + " accept conflicts " + acc);
  }
  if (it.check.kind === "passive" && it.check.lemma) {
    assert.equal(it.check.part, G.VERBS[it.check.lemma].part, it.id);
  }
  if (it.check.kind === "article" || it.check.kind === "poss" || it.check.kind === "prepArticle") {
    const kase = it.check.kase || G.prepCase(it.check);
    const det = it.check.kind === "poss" ? "poss" : (it.check.det || "def");
    const form = G.artForm(det, it.check.gender, kase, it.check.owner);
    if (!it.check.phrase && it.type !== "spot") assert.equal(it.answers[0], form, it.id);
  }
  if (it.check.kind === "verb" && it.type !== "spot") {
    const expect = it.check.partOnly ? G.VERBS[it.check.lemma].part : G.verbCell(it.check.lemma, it.check.person, it.check.tense || "präsens").token;
    assert.equal(it.answers[0], expect, it.id);
  }
}

for (const u of units) {
  assert.ok(u.itemIds.length >= 20 && u.itemIds.length <= 24, u.id + " " + u.itemIds.length);
  assert.ok(["A1", "A2", "B1"].includes(u.level), u.id);
  assert.ok(u.dw && u.dw.url.startsWith("https://learngerman.dw.com/de/"), u.id);
  assert.ok(u.blurb.en && u.points.en.length && u.mistakes.en.length, u.id);
  for (const id of u.itemIds) assert.equal(byId.get(id).unitId, u.id);
}
const levels = new Set(placementIds.map((id) => units.find((u) => u.id === byId.get(id).unitId).level));
assert.ok(levels.has("A1") && levels.has("A2") && levels.has("B1"), [...levels].join(","));
for (const id of placementIds) {
  const it = byId.get(id);
  assert.ok(it && (it.type === "choice" || it.type === "gap"), id);
}

const spot = items.find((it) => it.id === "genitive-20" || (it.unitId === "genitive" && it.type === "spot"));
assert.ok(spot, "genitive spot");
assert.equal(spot.fix, "Mannes");
assert.equal(spot.check.fix.word, "Mannes");

function clause(partial) {
  return G.solve(Object.assign({ kind: "clause", punct: false }, partial));
}
const gold = [
  [{ kind: "article", det: "def", gender: "m", kase: "nom" }, "der"],
  [{ kind: "article", det: "def", gender: "m", kase: "acc" }, "den"],
  [{ kind: "article", det: "def", gender: "m", kase: "dat" }, "dem"],
  [{ kind: "article", det: "def", gender: "f", kase: "nom" }, "die"],
  [{ kind: "article", det: "def", gender: "f", kase: "acc" }, "die"],
  [{ kind: "article", det: "def", gender: "f", kase: "dat" }, "der"],
  [{ kind: "article", det: "def", gender: "n", kase: "nom" }, "das"],
  [{ kind: "article", det: "def", gender: "n", kase: "acc" }, "das"],
  [{ kind: "article", det: "def", gender: "n", kase: "dat" }, "dem"],
  [{ kind: "article", det: "def", gender: "pl", kase: "nom" }, "die"],
  [{ kind: "article", det: "def", gender: "pl", kase: "dat" }, "den"],
  [{ kind: "article", det: "indef", gender: "m", kase: "nom" }, "ein"],
  [{ kind: "article", det: "indef", gender: "m", kase: "acc" }, "einen"],
  [{ kind: "article", det: "indef", gender: "m", kase: "dat" }, "einem"],
  [{ kind: "article", det: "indef", gender: "f", kase: "nom" }, "eine"],
  [{ kind: "article", det: "indef", gender: "f", kase: "dat" }, "einer"],
  [{ kind: "article", det: "indef", gender: "n", kase: "nom" }, "ein"],
  [{ kind: "article", det: "indef", gender: "n", kase: "acc" }, "ein"],
  [{ kind: "article", det: "kein", gender: "m", kase: "acc" }, "keinen"],
  [{ kind: "article", det: "kein", gender: "m", kase: "dat" }, "keinem"],
  [{ kind: "article", det: "kein", gender: "f", kase: "acc", phrase: true, noun: "Zeit" }, "keine Zeit"],
  [{ kind: "verb", lemma: "sein", person: "ich" }, "bin"],
  [{ kind: "verb", lemma: "sein", person: "du" }, "bist"],
  [{ kind: "verb", lemma: "sein", person: "er" }, "ist"],
  [{ kind: "verb", lemma: "sein", person: "wir" }, "sind"],
  [{ kind: "verb", lemma: "sein", person: "ihr" }, "seid"],
  [{ kind: "verb", lemma: "haben", person: "ich" }, "habe"],
  [{ kind: "verb", lemma: "haben", person: "du" }, "hast"],
  [{ kind: "verb", lemma: "haben", person: "er" }, "hat"],
  [{ kind: "verb", lemma: "haben", person: "ihr" }, "habt"],
  [{ kind: "verb", lemma: "spielen", person: "du" }, "spielst"],
  [{ kind: "verb", lemma: "arbeiten", person: "du" }, "arbeitest"],
  [{ kind: "verb", lemma: "arbeiten", person: "er" }, "arbeitet"],
  [{ kind: "verb", lemma: "sprechen", person: "du" }, "sprichst"],
  [{ kind: "verb", lemma: "sprechen", person: "er" }, "spricht"],
  [{ kind: "verb", lemma: "sprechen", person: "ihr" }, "sprecht"],
  [{ kind: "verb", lemma: "fahren", person: "du" }, "fährst"],
  [{ kind: "verb", lemma: "lesen", person: "du" }, "liest"],
  [{ kind: "verb", lemma: "geben", person: "er" }, "gibt"],
  [{ kind: "verb", lemma: "nehmen", person: "du" }, "nimmst"],
  [{ kind: "verb", lemma: "essen", person: "er" }, "isst"],
  [{ kind: "verb", lemma: "können", person: "ich" }, "kann"],
  [{ kind: "verb", lemma: "können", person: "du" }, "kannst"],
  [{ kind: "verb", lemma: "müssen", person: "ich" }, "muss"],
  [{ kind: "verb", lemma: "müssen", person: "du" }, "musst"],
  [{ kind: "verb", lemma: "dürfen", person: "er" }, "darf"],
  [{ kind: "verb", lemma: "wollen", person: "wir" }, "wollen"],
  [{ kind: "verb", lemma: "mögen", person: "du" }, "magst"],
  [{ kind: "verb", lemma: "sein", person: "ich", tense: "praet" }, "war"],
  [{ kind: "verb", lemma: "sein", person: "du", tense: "praet" }, "warst"],
  [{ kind: "verb", lemma: "sein", person: "ihr", tense: "praet" }, "wart"],
  [{ kind: "verb", lemma: "haben", person: "ich", tense: "praet" }, "hatte"],
  [{ kind: "verb", lemma: "haben", person: "du", tense: "praet" }, "hattest"],
  [{ kind: "verb", lemma: "werden", person: "ich", tense: "konj2" }, "würde"],
  [{ kind: "verb", lemma: "haben", person: "ich", tense: "konj2" }, "hätte"],
  [{ kind: "verb", lemma: "sein", person: "ich", tense: "konj2" }, "wäre"],
  [{ kind: "verb", lemma: "können", person: "ich", tense: "konj2" }, "könnte"],
  [{ kind: "prepArticle", prep: "mit", gender: "m" }, "dem"],
  [{ kind: "prepArticle", prep: "für", gender: "m" }, "den"],
  [{ kind: "prepArticle", prep: "aus", gender: "f" }, "der"],
  [{ kind: "prepArticle", prep: "in", gender: "m", where: "wo" }, "dem"],
  [{ kind: "prepArticle", prep: "in", gender: "n", where: "wohin" }, "das"],
  [{ kind: "clause", pattern: "statement", lemma: "spielen", person: "ich", tense: "perfekt", rest: [] }, "Ich habe gespielt."],
  [{ kind: "clause", pattern: "statement", lemma: "gehen", person: "ich", tense: "perfekt", rest: [] }, "Ich bin gegangen."],
  [{ kind: "clause", pattern: "statement", lemma: "aufstehen", person: "ich", tense: "perfekt", rest: [] }, "Ich bin aufgestanden."],
  [{ kind: "clause", pattern: "statement", lemma: "einkaufen", person: "ich", tense: "perfekt", rest: [] }, "Ich habe eingekauft."],
  [{ kind: "clause", pattern: "sub", conj: "weil", lemma: "sein", person: "ich", rest: ["müde"], punct: false }, "weil ich müde bin"],
  [{ kind: "clause", pattern: "sub", conj: "weil", lemma: "aufstehen", person: "ich", rest: ["früh"], punct: false }, "weil ich früh aufstehe"],
  [{ kind: "clause", pattern: "sub", conj: "dass", lemma: "kommen", person: "du", rest: ["morgen"], punct: false }, "dass du morgen kommst"],
  [{ kind: "clause", pattern: "sub", conj: "ob", lemma: "haben", person: "du", rest: ["Zeit"], punct: false }, "ob du Zeit hast"],
  [{ kind: "adjPhrase", decl: "der", det: "def", gender: "m", kase: "nom", stem: "klein", noun: "Hund" }, "der kleine Hund"],
  [{ kind: "adjPhrase", decl: "ein", det: "indef", gender: "m", kase: "nom", stem: "klein", noun: "Hund" }, "ein kleiner Hund"],
  [{ kind: "adjPhrase", decl: "ein", det: "indef", gender: "n", kase: "nom", stem: "klein", noun: "Kind" }, "ein kleines Kind"],
  [{ kind: "adjPhrase", decl: "strong", gender: "n", kase: "nom", stem: "kalt", noun: "Wasser" }, "kaltes Wasser"],
  [{ kind: "adjPhrase", decl: "der", det: "def", gender: "m", kase: "acc", stem: "klein", noun: "Hund" }, "den kleinen Hund"],
  [{ kind: "compare", lemma: "gut", degree: "comp" }, "besser"],
  [{ kind: "compare", lemma: "gut", degree: "sup" }, "am besten"],
  [{ kind: "compare", lemma: "hoch", degree: "comp" }, "höher"],
  [{ kind: "compare", lemma: "gern", degree: "comp" }, "lieber"],
  [{ kind: "compare", lemma: "viel", degree: "comp" }, "mehr"],
  [{ kind: "passive", tense: "präsens", patient: "Der Brief", num: "sg", part: "geschrieben", lemma: "schreiben" }, "Der Brief wird geschrieben."],
  [{ kind: "passive", tense: "praet", patient: "Der Brief", num: "sg", part: "geschrieben", lemma: "schreiben" }, "Der Brief wurde geschrieben."],
  [{ kind: "passive", tense: "praet", patient: "Die Briefe", num: "pl", part: "geschrieben", lemma: "schreiben" }, "Die Briefe wurden geschrieben."],
  [{ kind: "ndecl", lemma: "Student", kase: "acc" }, "Studenten"],
  [{ kind: "ndeclPhrase", lemma: "Student", kase: "acc", det: "def" }, "den Studenten"],
  [{ kind: "ndeclPhrase", lemma: "Herr", kase: "acc", det: "def" }, "den Herrn"],
  [{ kind: "ndeclPhrase", lemma: "Herr", kase: "dat", det: "def" }, "dem Herrn"],
  [{ kind: "genPrep", prep: "wegen", gender: "n", noun: "Wetter", gen: "Wetters" }, "wegen des Wetters"],
  [{ kind: "genPrep", prep: "wegen", gender: "f", noun: "Schule", gen: "Schule" }, "wegen der Schule"],
  [{ kind: "genPrep", prep: "trotz", gender: "m", noun: "Regen", gen: "Regens" }, "trotz des Regens"],
  [{ kind: "poss", owner: "ihr", gender: "m", kase: "acc" }, "euren"],
  [{ kind: "poss", owner: "ich", gender: "f", kase: "nom" }, "meine"],
  [{ kind: "poss", owner: "ich", gender: "m", kase: "acc" }, "meinen"],
  [{ kind: "pronoun", person: "ich", kase: "acc" }, "mich"],
  [{ kind: "pronoun", person: "ich", kase: "dat" }, "mir"],
  [{ kind: "pronoun", person: "du", kase: "acc" }, "dich"],
  [{ kind: "pronoun", person: "du", kase: "dat" }, "dir"],
  [{ kind: "pronoun", person: "er", kase: "acc" }, "ihn"],
  [{ kind: "pronoun", person: "er", kase: "dat" }, "ihm"],
  [{ kind: "pronoun", person: "Sie", kase: "acc" }, "Sie"],
  [{ kind: "pronoun", person: "Sie", kase: "dat" }, "Ihnen"],
  [{ kind: "pronoun", person: "sie_pl", kase: "dat" }, "ihnen"],
  [{ kind: "refl", person: "ich", kase: "acc" }, "mich"],
  [{ kind: "rel", gender: "m", kase: "nom" }, "der"],
  [{ kind: "rel", gender: "m", kase: "acc" }, "den"],
  [{ kind: "rel", gender: "f", kase: "dat" }, "der"],
  [{ kind: "rel", gender: "pl", kase: "dat" }, "denen"],
  [{ kind: "rel", gender: "m", kase: "gen" }, "dessen"],
  [{ kind: "rel", gender: "f", kase: "gen" }, "deren"],
  [{ kind: "article", det: "def", gender: "m", kase: "gen", phrase: true, noun: "Mann" }, "des Mannes"],
  [{ kind: "article", det: "def", gender: "f", kase: "gen", phrase: true, noun: "Frau" }, "der Frau"],
  [{ kind: "zu", lead: "Ich versuche", lemma: "aufstehen", mid: "früh" }, "Ich versuche, früh aufzustehen."],
  [{ kind: "connector", word: "obwohl" }, "obwohl"],
  [{ kind: "connector", word: "trotzdem" }, "trotzdem"],
];
for (const [check, expect] of gold) {
  assert.equal(G.solve(check), expect, JSON.stringify(check));
}
assert.notEqual(G.solve({ kind: "ndeclPhrase", lemma: "Herr", kase: "acc", det: "def" }), "den Herren");

const banned = [/wegen dem/, /den Herren/, /\bdes Mann\b(?!es)/, /am bestensten/, /Sie bist/, /des Namens/];
for (const it of items) {
  if (it.type === "spot") continue;
  const blob = it.answers[0] + " " + (it.accept || []).join(" ");
  for (const re of banned) assert.ok(!re.test(blob), it.id + " " + blob);
}

assert.equal(G.grade({ answers: ["den"], accept: [], check: { kind: "article", det: "def", gender: "m", kase: "acc" }, cap: "token" }, "DEN").ok, true);
assert.equal(G.grade({ answers: ["den Mann"], accept: [], check: { kind: "article", phrase: true }, cap: "sentence" }, "Den Mann").ok, true);
assert.equal(G.grade({ answers: ["den Mann"], accept: [], check: { kind: "article", phrase: true }, cap: "sentence" }, "den mann").ok, false);
assert.equal(G.grade({ answers: ["Ich habe den Apfel"], accept: [], check: { kind: "clause" }, cap: "sentence" }, "ich habe den Apfel").ok, true);
assert.equal(G.grade({ answers: ["Ich habe den Apfel"], accept: [], check: { kind: "clause" }, cap: "sentence" }, "ich habe den apfel").ok, false);
assert.equal(G.grade({ answers: ["Mädchen"], accept: [], check: { kind: "ndecl" }, cap: "noun" }, "Maedchen").ok, true);
assert.equal(G.grade({ answers: ["neue"], accept: [], check: { kind: "predicate", stem: "neu" }, cap: "token" }, "neue").ok, true);
assert.equal(G.sameAnswer("neue", "nüe", "token"), false);
assert.equal(G.sameAnswer("sie", "Sie", "exact"), false);
assert.equal(G.sameAnswer("ich sehe sie", "ich sehe Sie", "sentence"), false);

const now = Date.UTC(2026, 9, 19);
assert.deepEqual(G.nextReview(null, false, now), { box: 0, due: now });
let rev = G.nextReview({ box: 0, due: now }, true, now);
assert.equal(rev.box, 1);
assert.equal(rev.due, now + 86400000);
rev = G.nextReview(rev, true, now);
assert.equal(rev.box, 2);
assert.equal(rev.due, now + 3 * 86400000);
rev = G.nextReview(rev, true, now);
assert.equal(rev.box, 3);
rev = G.nextReview(rev, true, now);
assert.equal(rev.box, 4);
assert.equal(G.nextReview(rev, true, now), null);
assert.equal(G.MASTER_AT, 0.85);

const fakeUnits = [{ id: "a", itemIds: ["a1", "a2"] }, { id: "b", itemIds: ["b1"] }];
assert.equal(G.isUnitOpen(0, fakeUnits, { correct: {} }, "khawla"), true);
assert.equal(G.isUnitOpen(1, fakeUnits, { correct: {}, unlockThrough: 0 }, "khawla"), false);
assert.equal(G.isUnitOpen(1, fakeUnits, { correct: { a1: 1, a2: 1 }, unlockThrough: 0 }, "khawla"), true);
assert.equal(G.isUnitOpen(1, fakeUnits, { correct: {}, unlockThrough: 0 }, "farouk"), true);
assert.deepEqual(G.weakUnitIds(units.slice(0, 1), { correct: {}, attempts: { [units[0].id]: 4 } }), [units[0].id]);
const suggested = G.suggestStart(units, items, placementIds, placementIds.map((id, i) => ({ id, ok: i !== 3 })));
assert.equal(suggested, byId.get(placementIds[3]).unitId);

const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.match(sw, /khawla-aussprache-v15/);
assert.match(sw, /skipWaiting/);
assert.match(sw, /clients\.claim/);
assert.match(sw, /sw-activated/);
const appSrc = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.match(appSrc, /khawla-aussprache-v15/);
assert.match(appSrc, /controllerchange/);
assert.match(appSrc, /reg\.update\(/);
assert.match(sw, /grammatik-beta/);
assert.ok(!sw.split("const ASSETS")[1].split("];")[0].includes("grammatik-beta"));
for (const file of ["index.html", "app.js", "manifest.webmanifest", "README.md"]) {
  const text = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.ok(!text.includes("grammatik-beta"), file + " links the beta");
}
const betaSrc = ["grammar.js", "app.js", "i18n.js", "index.html"].map((f) => {
  const p = new URL("../grammatik-beta/" + f, import.meta.url);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}).join("\n");
assert.ok(betaSrc.includes("grammar.js") || betaSrc.length > 1000);
assert.ok(!betaSrc.includes("aussprache."));
assert.ok(!betaSrc.includes("migrate("));
assert.match(fs.readFileSync(new URL("../grammatik-beta/index.html", import.meta.url), "utf8"), /noindex,nofollow/);
assert.ok(!fs.readFileSync(new URL("../grammatik-beta/index.html", import.meta.url), "utf8").includes("manifest"));
assert.ok(!fs.readFileSync(new URL("../grammatik-beta/index.html", import.meta.url), "utf8").includes("serviceWorker"));

const types = {};
for (const it of items) types[it.type] = (types[it.type] || 0) + 1;
console.log("grammar-beta OK", items.length, "items", JSON.stringify(types));
