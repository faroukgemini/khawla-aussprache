/* Original grammar engine for Khawla's hidden course.
   Answers are computed from the tables below. No DW text is stored here. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GrammarBeta = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PERSONS = ["ich", "du", "er", "sie", "es", "wir", "ihr", "sie_pl", "Sie"];
  const MASTER_AT = 0.85;
  const REVIEW_DAYS = [1, 3, 7, 14];

  const PRON = {
    ich: { nom: "ich", acc: "mich", dat: "mir" },
    du: { nom: "du", acc: "dich", dat: "dir" },
    er: { nom: "er", acc: "ihn", dat: "ihm" },
    sie: { nom: "sie", acc: "sie", dat: "ihr" },
    es: { nom: "es", acc: "es", dat: "ihm" },
    wir: { nom: "wir", acc: "uns", dat: "uns" },
    ihr: { nom: "ihr", acc: "euch", dat: "euch" },
    sie_pl: { nom: "sie", acc: "sie", dat: "ihnen" },
    Sie: { nom: "Sie", acc: "Sie", dat: "Ihnen" },
  };
  const REFL = {
    ich: { acc: "mich", dat: "mir" },
    du: { acc: "dich", dat: "dir" },
    er: { acc: "sich", dat: "sich" },
    sie: { acc: "sich", dat: "sich" },
    es: { acc: "sich", dat: "sich" },
    wir: { acc: "uns", dat: "uns" },
    ihr: { acc: "euch", dat: "euch" },
    sie_pl: { acc: "sich", dat: "sich" },
    Sie: { acc: "sich", dat: "sich" },
  };
  const POSS_STEM = {
    ich: "mein", du: "dein", er: "sein", sie: "ihr", es: "sein",
    wir: "unser", ihr: "euer", sie_pl: "ihr", Sie: "Ihr",
  };
  const EIN_END = {
    m: { nom: "", acc: "en", dat: "em", gen: "es" },
    f: { nom: "e", acc: "e", dat: "er", gen: "er" },
    n: { nom: "", acc: "", dat: "em", gen: "es" },
    pl: { nom: "e", acc: "e", dat: "en", gen: "er" },
  };
  const ART = {
    def: {
      m: { nom: "der", acc: "den", dat: "dem", gen: "des" },
      f: { nom: "die", acc: "die", dat: "der", gen: "der" },
      n: { nom: "das", acc: "das", dat: "dem", gen: "des" },
      pl: { nom: "die", acc: "die", dat: "den", gen: "der" },
    },
  };
  const ADJ = {
    strong: {
      m: { nom: "er", acc: "en", dat: "em" },
      f: { nom: "e", acc: "e", dat: "er" },
      n: { nom: "es", acc: "es", dat: "em" },
      pl: { nom: "e", acc: "e", dat: "en" },
    },
    der: {
      m: { nom: "e", acc: "en", dat: "en" },
      f: { nom: "e", acc: "e", dat: "en" },
      n: { nom: "e", acc: "e", dat: "en" },
      pl: { nom: "en", acc: "en", dat: "en" },
    },
    ein: {
      m: { nom: "er", acc: "en", dat: "en" },
      f: { nom: "e", acc: "e", dat: "en" },
      n: { nom: "es", acc: "es", dat: "en" },
      pl: { nom: "en", acc: "en", dat: "en" },
    },
  };
  const REL = {
    m: { nom: "der", acc: "den", dat: "dem", gen: "dessen" },
    f: { nom: "die", acc: "die", dat: "der", gen: "deren" },
    n: { nom: "das", acc: "das", dat: "dem", gen: "dessen" },
    pl: { nom: "die", acc: "die", dat: "denen", gen: "deren" },
  };
  const COMPARE = {
    gut: { comp: "besser", sup: "am besten" },
    gern: { comp: "lieber", sup: "am liebsten" },
    viel: { comp: "mehr", sup: "am meisten" },
    groß: { comp: "größer", sup: "am größten" },
    alt: { comp: "älter", sup: "am ältesten" },
    hoch: { comp: "höher", sup: "am höchsten" },
    nah: { comp: "näher", sup: "am nächsten" },
    klein: { comp: "kleiner", sup: "am kleinsten" },
    schnell: { comp: "schneller", sup: "am schnellsten" },
    kalt: { comp: "kälter", sup: "am kältesten" },
    warm: { comp: "wärmer", sup: "am wärmsten" },
    lang: { comp: "länger", sup: "am längsten" },
    kurz: { comp: "kürzer", sup: "am kürzesten" },
    jung: { comp: "jünger", sup: "am jüngsten" },
    dunkel: { comp: "dunkler", sup: "am dunkelsten" },
    teuer: { comp: "teurer", sup: "am teuersten" },
  };
  const NDECL = {
    Student: { g: "m", nom: "Student", acc: "Studenten", dat: "Studenten", gen: "Studenten", en: "student" },
    Junge: { g: "m", nom: "Junge", acc: "Jungen", dat: "Jungen", gen: "Jungen", en: "boy" },
    Kollege: { g: "m", nom: "Kollege", acc: "Kollegen", dat: "Kollegen", gen: "Kollegen", en: "colleague" },
    Nachbar: { g: "m", nom: "Nachbar", acc: "Nachbarn", dat: "Nachbarn", gen: "Nachbarn", en: "neighbour" },
    Name: { g: "m", nom: "Name", acc: "Namen", dat: "Namen", gen: "Namen", en: "name" },
    Herr: { g: "m", nom: "Herr", acc: "Herrn", dat: "Herrn", gen: "Herrn", en: "Mr / gentleman" },
    Mensch: { g: "m", nom: "Mensch", acc: "Menschen", dat: "Menschen", gen: "Menschen", en: "person" },
  };
  const PREP_CASE = {
    durch: "akk", für: "akk", gegen: "akk", ohne: "akk", um: "akk",
    aus: "dat", bei: "dat", mit: "dat", nach: "dat", seit: "dat", von: "dat", zu: "dat",
    wegen: "gen", trotz: "gen", während: "gen", statt: "gen",
  };
  const TWO_WAY = ["an", "auf", "hinter", "in", "neben", "über", "unter", "vor", "zwischen"];
  const CONTRACT = {
    "zu dem": ["zum"], "zu der": ["zur"], "an dem": ["am"], "an das": ["ans"],
    "in dem": ["im"], "in das": ["ins"], "bei dem": ["beim"], "von dem": ["vom"],
    "auf das": ["aufs"],
  };

  const NOUNS = [
    { de: "Mann", en: "man", g: "m", pl: "Männer", pld: "Männern", gen: "Mannes" },
    { de: "Tisch", en: "table", g: "m", pl: "Tische", pld: "Tischen", gen: "Tisches" },
    { de: "Apfel", en: "apple", g: "m", pl: "Äpfel", pld: "Äpfeln", gen: "Apfels" },
    { de: "Stuhl", en: "chair", g: "m", pl: "Stühle", pld: "Stühlen", gen: "Stuhls" },
    { de: "Hund", en: "dog", g: "m", pl: "Hunde", pld: "Hunden", gen: "Hundes" },
    { de: "Tag", en: "day", g: "m", pl: "Tage", pld: "Tagen", gen: "Tages" },
    { de: "Freund", en: "friend", g: "m", pl: "Freunde", pld: "Freunden", gen: "Freundes" },
    { de: "Lehrer", en: "teacher", g: "m", pl: "Lehrer", pld: "Lehrern", gen: "Lehrers" },
    { de: "Kaffee", en: "coffee", g: "m", pl: "Kaffees", pld: "Kaffees", gen: "Kaffees" },
    { de: "Saft", en: "juice", g: "m", pl: "Säfte", pld: "Säften", gen: "Saftes" },
    { de: "Baum", en: "tree", g: "m", pl: "Bäume", pld: "Bäumen", gen: "Baumes" },
    { de: "Park", en: "park", g: "m", pl: "Parks", pld: "Parks", gen: "Parks" },
    { de: "Frau", en: "woman", g: "f", pl: "Frauen", pld: "Frauen", gen: "Frau" },
    { de: "Schule", en: "school", g: "f", pl: "Schulen", pld: "Schulen", gen: "Schule" },
    { de: "Stadt", en: "city", g: "f", pl: "Städte", pld: "Städten", gen: "Stadt" },
    { de: "Wohnung", en: "flat", g: "f", pl: "Wohnungen", pld: "Wohnungen", gen: "Wohnung" },
    { de: "Tasche", en: "bag", g: "f", pl: "Taschen", pld: "Taschen", gen: "Tasche" },
    { de: "Lampe", en: "lamp", g: "f", pl: "Lampen", pld: "Lampen", gen: "Lampe" },
    { de: "Tür", en: "door", g: "f", pl: "Türen", pld: "Türen", gen: "Tür" },
    { de: "Uhr", en: "clock", g: "f", pl: "Uhren", pld: "Uhren", gen: "Uhr" },
    { de: "Blume", en: "flower", g: "f", pl: "Blumen", pld: "Blumen", gen: "Blume" },
    { de: "Freundin", en: "friend", g: "f", pl: "Freundinnen", pld: "Freundinnen", gen: "Freundin" },
    { de: "Pause", en: "break", g: "f", pl: "Pausen", pld: "Pausen", gen: "Pause" },
    { de: "Wand", en: "wall", g: "f", pl: "Wände", pld: "Wänden", gen: "Wand" },
    { de: "Kind", en: "child", g: "n", pl: "Kinder", pld: "Kindern", gen: "Kindes" },
    { de: "Buch", en: "book", g: "n", pl: "Bücher", pld: "Büchern", gen: "Buches" },
    { de: "Haus", en: "house", g: "n", pl: "Häuser", pld: "Häusern", gen: "Hauses" },
    { de: "Auto", en: "car", g: "n", pl: "Autos", pld: "Autos", gen: "Autos" },
    { de: "Fenster", en: "window", g: "n", pl: "Fenster", pld: "Fenstern", gen: "Fensters" },
    { de: "Zimmer", en: "room", g: "n", pl: "Zimmer", pld: "Zimmern", gen: "Zimmers" },
    { de: "Mädchen", en: "girl", g: "n", pl: "Mädchen", pld: "Mädchen", gen: "Mädchens" },
    { de: "Bild", en: "picture", g: "n", pl: "Bilder", pld: "Bildern", gen: "Bildes" },
    { de: "Brot", en: "bread", g: "n", pl: "Brote", pld: "Broten", gen: "Brotes" },
    { de: "Wetter", en: "weather", g: "n", pl: "Wetter", pld: "Wettern", gen: "Wetters" },
    { de: "Büro", en: "office", g: "n", pl: "Büros", pld: "Büros", gen: "Büros" },
  ];

  function V(lemma, spec) {
    spec.lemma = lemma;
    return spec;
  }
  const reg = (lemma, p, pt, part, aux, imp, alt) => V(lemma, {
    aux: aux || "haben", part, praes: p, praet: pt,
    imp: { du: imp[0], ihr: imp[1], Sie: imp[2], duAlt: alt || [] },
  });
  const VERBS = {
    sein: V("sein", {
      aux: "sein", part: "gewesen",
      praes: ["bin", "bist", "ist", "ist", "ist", "sind", "seid", "sind", "sind"],
      praet: ["war", "warst", "war", "war", "war", "waren", "wart", "waren", "waren"],
      konj2: ["wäre", "wärest", "wäre", "wäre", "wäre", "wären", "wäret", "wären", "wären"],
      imp: { du: "sei", ihr: "seid", Sie: "seien Sie", duAlt: [] },
    }),
    haben: V("haben", {
      aux: "haben", part: "gehabt",
      praes: ["habe", "hast", "hat", "hat", "hat", "haben", "habt", "haben", "haben"],
      praet: ["hatte", "hattest", "hatte", "hatte", "hatte", "hatten", "hattet", "hatten", "hatten"],
      konj2: ["hätte", "hättest", "hätte", "hätte", "hätte", "hätten", "hättet", "hätten", "hätten"],
      imp: { du: "hab", ihr: "habt", Sie: "haben Sie", duAlt: ["habe"] },
    }),
    werden: V("werden", {
      aux: "sein", part: "geworden",
      praes: ["werde", "wirst", "wird", "wird", "wird", "werden", "werdet", "werden", "werden"],
      praet: ["wurde", "wurdest", "wurde", "wurde", "wurde", "wurden", "wurdet", "wurden", "wurden"],
      konj2: ["würde", "würdest", "würde", "würde", "würde", "würden", "würdet", "würden", "würden"],
      imp: { du: "werde", ihr: "werdet", Sie: "werden Sie", duAlt: [] },
    }),
    spielen: reg("spielen",
      ["spiele", "spielst", "spielt", "spielt", "spielt", "spielen", "spielt", "spielen", "spielen"],
      ["spielte", "spieltest", "spielte", "spielte", "spielte", "spielten", "spieltet", "spielten", "spielten"],
      "gespielt", "haben", ["spiel", "spielt", "spielen Sie"], ["spiele"]),
    machen: reg("machen",
      ["mache", "machst", "macht", "macht", "macht", "machen", "macht", "machen", "machen"],
      ["machte", "machtest", "machte", "machte", "machte", "machten", "machtet", "machten", "machten"],
      "gemacht", "haben", ["mach", "macht", "machen Sie"], ["mache"]),
    wohnen: reg("wohnen",
      ["wohne", "wohnst", "wohnt", "wohnt", "wohnt", "wohnen", "wohnt", "wohnen", "wohnen"],
      ["wohnte", "wohntest", "wohnte", "wohnte", "wohnte", "wohnten", "wohntet", "wohnten", "wohnten"],
      "gewohnt", "haben", ["wohn", "wohnt", "wohnen Sie"], ["wohne"]),
    kaufen: reg("kaufen",
      ["kaufe", "kaufst", "kauft", "kauft", "kauft", "kaufen", "kauft", "kaufen", "kaufen"],
      ["kaufte", "kauftest", "kaufte", "kaufte", "kaufte", "kauften", "kauftet", "kauften", "kauften"],
      "gekauft", "haben", ["kauf", "kauft", "kaufen Sie"], ["kaufe"]),
    lernen: reg("lernen",
      ["lerne", "lernst", "lernt", "lernt", "lernt", "lernen", "lernt", "lernen", "lernen"],
      ["lernte", "lerntest", "lernte", "lernte", "lernte", "lernten", "lerntet", "lernten", "lernten"],
      "gelernt", "haben", ["lern", "lernt", "lernen Sie"], ["lerne"]),
    fragen: reg("fragen",
      ["frage", "fragst", "fragt", "fragt", "fragt", "fragen", "fragt", "fragen", "fragen"],
      ["fragte", "fragtest", "fragte", "fragte", "fragte", "fragten", "fragtet", "fragten", "fragten"],
      "gefragt", "haben", ["frag", "fragt", "fragen Sie"], ["frage"]),
    hören: reg("hören",
      ["höre", "hörst", "hört", "hört", "hört", "hören", "hört", "hören", "hören"],
      ["hörte", "hörtest", "hörte", "hörte", "hörte", "hörten", "hörtet", "hörten", "hörten"],
      "gehört", "haben", ["hör", "hört", "hören Sie"], ["höre"]),
    sagen: reg("sagen",
      ["sage", "sagst", "sagt", "sagt", "sagt", "sagen", "sagt", "sagen", "sagen"],
      ["sagte", "sagtest", "sagte", "sagte", "sagte", "sagten", "sagtet", "sagten", "sagten"],
      "gesagt", "haben", ["sag", "sagt", "sagen Sie"], ["sage"]),
    kochen: reg("kochen",
      ["koche", "kochst", "kocht", "kocht", "kocht", "kochen", "kocht", "kochen", "kochen"],
      ["kochte", "kochtest", "kochte", "kochte", "kochte", "kochten", "kochtet", "kochten", "kochten"],
      "gekocht", "haben", ["koch", "kocht", "kochen Sie"], ["koche"]),
    brauchen: reg("brauchen",
      ["brauche", "brauchst", "braucht", "braucht", "braucht", "brauchen", "braucht", "brauchen", "brauchen"],
      ["brauchte", "brauchtest", "brauchte", "brauchte", "brauchte", "brauchten", "brauchtet", "brauchten", "brauchten"],
      "gebraucht", "haben", ["brauch", "braucht", "brauchen Sie"], ["brauche"]),
    suchen: reg("suchen",
      ["suche", "suchst", "sucht", "sucht", "sucht", "suchen", "sucht", "suchen", "suchen"],
      ["suchte", "suchtest", "suchte", "suchte", "suchte", "suchten", "suchtet", "suchten", "suchten"],
      "gesucht", "haben", ["such", "sucht", "suchen Sie"], ["suche"]),
    arbeiten: reg("arbeiten",
      ["arbeite", "arbeitest", "arbeitet", "arbeitet", "arbeitet", "arbeiten", "arbeitet", "arbeiten", "arbeiten"],
      ["arbeitete", "arbeitetest", "arbeitete", "arbeitete", "arbeitete", "arbeiteten", "arbeitetet", "arbeiteten", "arbeiteten"],
      "gearbeitet", "haben", ["arbeite", "arbeitet", "arbeiten Sie"], []),
    spielen2: null,
    sprechen: V("sprechen", {
      aux: "haben", part: "gesprochen",
      praes: ["spreche", "sprichst", "spricht", "spricht", "spricht", "sprechen", "sprecht", "sprechen", "sprechen"],
      praet: ["sprach", "sprachst", "sprach", "sprach", "sprach", "sprachen", "spracht", "sprachen", "sprachen"],
      imp: { du: "sprich", ihr: "sprecht", Sie: "sprechen Sie", duAlt: [] },
    }),
    lesen: V("lesen", {
      aux: "haben", part: "gelesen",
      praes: ["lese", "liest", "liest", "liest", "liest", "lesen", "lest", "lesen", "lesen"],
      praet: ["las", "lasest", "las", "las", "las", "lasen", "last", "lasen", "lasen"],
      imp: { du: "lies", ihr: "lest", Sie: "lesen Sie", duAlt: [] },
    }),
    sehen: V("sehen", {
      aux: "haben", part: "gesehen",
      praes: ["sehe", "siehst", "sieht", "sieht", "sieht", "sehen", "seht", "sehen", "sehen"],
      praet: ["sah", "sahst", "sah", "sah", "sah", "sahen", "saht", "sahen", "sahen"],
      imp: { du: "sieh", ihr: "seht", Sie: "sehen Sie", duAlt: [] },
    }),
    helfen: V("helfen", {
      aux: "haben", part: "geholfen",
      praes: ["helfe", "hilfst", "hilft", "hilft", "hilft", "helfen", "helft", "helfen", "helfen"],
      praet: ["half", "halfst", "half", "half", "half", "halfen", "halft", "halfen", "halfen"],
      imp: { du: "hilf", ihr: "helft", Sie: "helfen Sie", duAlt: [] },
    }),
    geben: V("geben", {
      aux: "haben", part: "gegeben",
      praes: ["gebe", "gibst", "gibt", "gibt", "gibt", "geben", "gebt", "geben", "geben"],
      praet: ["gab", "gabst", "gab", "gab", "gab", "gaben", "gabt", "gaben", "gaben"],
      imp: { du: "gib", ihr: "gebt", Sie: "geben Sie", duAlt: [] },
    }),
    nehmen: V("nehmen", {
      aux: "haben", part: "genommen",
      praes: ["nehme", "nimmst", "nimmt", "nimmt", "nimmt", "nehmen", "nehmt", "nehmen", "nehmen"],
      praet: ["nahm", "nahmst", "nahm", "nahm", "nahm", "nahmen", "nahmt", "nahmen", "nahmen"],
      imp: { du: "nimm", ihr: "nehmt", Sie: "nehmen Sie", duAlt: [] },
    }),
    essen: V("essen", {
      aux: "haben", part: "gegessen",
      praes: ["esse", "isst", "isst", "isst", "isst", "essen", "esst", "essen", "essen"],
      praet: ["aß", "aßest", "aß", "aß", "aß", "aßen", "aßt", "aßen", "aßen"],
      imp: { du: "iss", ihr: "esst", Sie: "essen Sie", duAlt: [] },
    }),
    treffen: V("treffen", {
      aux: "haben", part: "getroffen",
      praes: ["treffe", "triffst", "trifft", "trifft", "trifft", "treffen", "trefft", "treffen", "treffen"],
      praet: ["traf", "trafst", "traf", "traf", "traf", "trafen", "traft", "trafen", "trafen"],
      imp: { du: "triff", ihr: "trefft", Sie: "treffen Sie", duAlt: [] },
    }),
    fahren: V("fahren", {
      aux: "sein", part: "gefahren",
      praes: ["fahre", "fährst", "fährt", "fährt", "fährt", "fahren", "fahrt", "fahren", "fahren"],
      praet: ["fuhr", "fuhrst", "fuhr", "fuhr", "fuhr", "fuhren", "fuhrt", "fuhren", "fuhren"],
      imp: { du: "fahr", ihr: "fahrt", Sie: "fahren Sie", duAlt: ["fahre"] },
    }),
    schlafen: V("schlafen", {
      aux: "haben", part: "geschlafen",
      praes: ["schlafe", "schläfst", "schläft", "schläft", "schläft", "schlafen", "schlaft", "schlafen", "schlafen"],
      praet: ["schlief", "schliefst", "schlief", "schlief", "schlief", "schliefen", "schlieft", "schliefen", "schliefen"],
      imp: { du: "schlaf", ihr: "schlaft", Sie: "schlafen Sie", duAlt: ["schlafe"] },
    }),
    laufen: V("laufen", {
      aux: "sein", part: "gelaufen",
      praes: ["laufe", "läufst", "läuft", "läuft", "läuft", "laufen", "lauft", "laufen", "laufen"],
      praet: ["lief", "liefst", "lief", "lief", "lief", "liefen", "lieft", "liefen", "liefen"],
      imp: { du: "lauf", ihr: "lauft", Sie: "laufen Sie", duAlt: ["laufe"] },
    }),
    waschen: V("waschen", {
      aux: "haben", part: "gewaschen",
      praes: ["wasche", "wäschst", "wäscht", "wäscht", "wäscht", "waschen", "wascht", "waschen", "waschen"],
      praet: ["wusch", "wuschst", "wusch", "wusch", "wusch", "wuschen", "wuscht", "wuschen", "wuschen"],
      imp: { du: "wasch", ihr: "wascht", Sie: "waschen Sie", duAlt: ["wasche"] },
    }),
    gehen: V("gehen", {
      aux: "sein", part: "gegangen",
      praes: ["gehe", "gehst", "geht", "geht", "geht", "gehen", "geht", "gehen", "gehen"],
      praet: ["ging", "gingst", "ging", "ging", "ging", "gingen", "gingt", "gingen", "gingen"],
      imp: { du: "geh", ihr: "geht", Sie: "gehen Sie", duAlt: ["gehe"] },
    }),
    kommen: V("kommen", {
      aux: "sein", part: "gekommen",
      praes: ["komme", "kommst", "kommt", "kommt", "kommt", "kommen", "kommt", "kommen", "kommen"],
      praet: ["kam", "kamst", "kam", "kam", "kam", "kamen", "kamt", "kamen", "kamen"],
      imp: { du: "komm", ihr: "kommt", Sie: "kommen Sie", duAlt: ["komme"] },
    }),
    bleiben: V("bleiben", {
      aux: "sein", part: "geblieben",
      praes: ["bleibe", "bleibst", "bleibt", "bleibt", "bleibt", "bleiben", "bleibt", "bleiben", "bleiben"],
      praet: ["blieb", "bliebst", "blieb", "blieb", "blieb", "blieben", "bliebt", "blieben", "blieben"],
      imp: { du: "bleib", ihr: "bleibt", Sie: "bleiben Sie", duAlt: ["bleibe"] },
    }),
    denken: V("denken", {
      aux: "haben", part: "gedacht",
      praes: ["denke", "denkst", "denkt", "denkt", "denkt", "denken", "denkt", "denken", "denken"],
      praet: ["dachte", "dachtest", "dachte", "dachte", "dachte", "dachten", "dachtet", "dachten", "dachten"],
      imp: { du: "denk", ihr: "denkt", Sie: "denken Sie", duAlt: ["denke"] },
    }),
    bringen: V("bringen", {
      aux: "haben", part: "gebracht",
      praes: ["bringe", "bringst", "bringt", "bringt", "bringt", "bringen", "bringt", "bringen", "bringen"],
      praet: ["brachte", "brachtest", "brachte", "brachte", "brachte", "brachten", "brachtet", "brachten", "brachten"],
      imp: { du: "bring", ihr: "bringt", Sie: "bringen Sie", duAlt: ["bringe"] },
    }),
    kennen: V("kennen", {
      aux: "haben", part: "gekannt",
      praes: ["kenne", "kennst", "kennt", "kennt", "kennt", "kennen", "kennt", "kennen", "kennen"],
      praet: ["kannte", "kanntest", "kannte", "kannte", "kannte", "kannten", "kanntet", "kannten", "kannten"],
      imp: { du: "kenn", ihr: "kennt", Sie: "kennen Sie", duAlt: ["kenne"] },
    }),
    schreiben: V("schreiben", {
      aux: "haben", part: "geschrieben",
      praes: ["schreibe", "schreibst", "schreibt", "schreibt", "schreibt", "schreiben", "schreibt", "schreiben", "schreiben"],
      praet: ["schrieb", "schriebst", "schrieb", "schrieb", "schrieb", "schrieben", "schriebt", "schrieben", "schrieben"],
      imp: { du: "schreib", ihr: "schreibt", Sie: "schreiben Sie", duAlt: ["schreibe"] },
    }),
    trinken: V("trinken", {
      aux: "haben", part: "getrunken",
      praes: ["trinke", "trinkst", "trinkt", "trinkt", "trinkt", "trinken", "trinkt", "trinken", "trinken"],
      praet: ["trank", "trankst", "trank", "trank", "trank", "tranken", "trankt", "tranken", "tranken"],
      imp: { du: "trink", ihr: "trinkt", Sie: "trinken Sie", duAlt: ["trinke"] },
    }),
    finden: V("finden", {
      aux: "haben", part: "gefunden",
      praes: ["finde", "findest", "findet", "findet", "findet", "finden", "findet", "finden", "finden"],
      praet: ["fand", "fandst", "fand", "fand", "fand", "fanden", "fandet", "fanden", "fanden"],
      imp: { du: "find", ihr: "findet", Sie: "finden Sie", duAlt: ["finde"] },
    }),
    heißen: V("heißen", {
      aux: "haben", part: "geheißen",
      praes: ["heiße", "heißt", "heißt", "heißt", "heißt", "heißen", "heißt", "heißen", "heißen"],
      praet: ["hieß", "hießest", "hieß", "hieß", "hieß", "hießen", "hießt", "hießen", "hießen"],
      imp: { du: "heiße", ihr: "heißt", Sie: "heißen Sie", duAlt: [] },
    }),
    können: V("können", {
      aux: "haben", part: "gekonnt",
      praes: ["kann", "kannst", "kann", "kann", "kann", "können", "könnt", "können", "können"],
      praet: ["konnte", "konntest", "konnte", "konnte", "konnte", "konnten", "konntet", "konnten", "konnten"],
      konj2: ["könnte", "könntest", "könnte", "könnte", "könnte", "könnten", "könntet", "könnten", "könnten"],
    }),
    müssen: V("müssen", {
      aux: "haben", part: "gemusst",
      praes: ["muss", "musst", "muss", "muss", "muss", "müssen", "müsst", "müssen", "müssen"],
      praet: ["musste", "musstest", "musste", "musste", "musste", "mussten", "musstet", "mussten", "mussten"],
      konj2: ["müsste", "müsstest", "müsste", "müsste", "müsste", "müssten", "müsstet", "müssten", "müssten"],
    }),
    dürfen: V("dürfen", {
      aux: "haben", part: "gedurft",
      praes: ["darf", "darfst", "darf", "darf", "darf", "dürfen", "dürft", "dürfen", "dürfen"],
      praet: ["durfte", "durftest", "durfte", "durfte", "durfte", "durften", "durftet", "durften", "durften"],
      konj2: ["dürfte", "dürftest", "dürfte", "dürfte", "dürfte", "dürften", "dürftet", "dürften", "dürften"],
    }),
    wollen: V("wollen", {
      aux: "haben", part: "gewollt",
      praes: ["will", "willst", "will", "will", "will", "wollen", "wollt", "wollen", "wollen"],
      praet: ["wollte", "wolltest", "wollte", "wollte", "wollte", "wollten", "wolltet", "wollten", "wollten"],
      konj2: ["wollte", "wolltest", "wollte", "wollte", "wollte", "wollten", "wolltet", "wollten", "wollten"],
    }),
    sollen: V("sollen", {
      aux: "haben", part: "gesollt",
      praes: ["soll", "sollst", "soll", "soll", "soll", "sollen", "sollt", "sollen", "sollen"],
      praet: ["sollte", "solltest", "sollte", "sollte", "sollte", "sollten", "solltet", "sollten", "sollten"],
      konj2: ["sollte", "solltest", "sollte", "sollte", "sollte", "sollten", "solltet", "sollten", "sollten"],
    }),
    mögen: V("mögen", {
      aux: "haben", part: "gemocht",
      praes: ["mag", "magst", "mag", "mag", "mag", "mögen", "mögt", "mögen", "mögen"],
      praet: ["mochte", "mochtest", "mochte", "mochte", "mochte", "mochten", "mochtet", "mochten", "mochten"],
      konj2: ["möchte", "möchtest", "möchte", "möchte", "möchte", "möchten", "möchtet", "möchten", "möchten"],
    }),
    freuen: reg("freuen",
      ["freue", "freust", "freut", "freut", "freut", "freuen", "freut", "freuen", "freuen"],
      ["freute", "freutest", "freute", "freute", "freute", "freuten", "freutet", "freuten", "freuten"],
      "gefreut", "haben", ["freu", "freut", "freuen Sie"], ["freue"]),
    setzen: reg("setzen",
      ["setze", "setzt", "setzt", "setzt", "setzt", "setzen", "setzt", "setzen", "setzen"],
      ["setzte", "setztest", "setzte", "setzte", "setzte", "setzten", "setztet", "setzten", "setzten"],
      "gesetzt", "haben", ["setz", "setzt", "setzen Sie"], ["setze"]),
    aufstehen: V("aufstehen", {
      aux: "sein", part: "aufgestanden", sep: "auf", base: "stehen",
      praes: ["stehe", "stehst", "steht", "steht", "steht", "stehen", "steht", "stehen", "stehen"],
      praet: ["stand", "standest", "stand", "stand", "stand", "standen", "standet", "standen", "standen"],
      imp: { du: "steh", ihr: "steht", Sie: "stehen Sie", duAlt: ["stehe"] },
    }),
    einkaufen: V("einkaufen", {
      aux: "haben", part: "eingekauft", sep: "ein", base: "kaufen",
      praes: ["kaufe", "kaufst", "kauft", "kauft", "kauft", "kaufen", "kauft", "kaufen", "kaufen"],
      praet: ["kaufte", "kauftest", "kaufte", "kaufte", "kaufte", "kauften", "kauftet", "kauften", "kauften"],
      imp: { du: "kauf", ihr: "kauft", Sie: "kaufen Sie", duAlt: ["kaufe"] },
    }),
    mitkommen: V("mitkommen", {
      aux: "sein", part: "mitgekommen", sep: "mit", base: "kommen",
      praes: ["komme", "kommst", "kommt", "kommt", "kommt", "kommen", "kommt", "kommen", "kommen"],
      praet: ["kam", "kamst", "kam", "kam", "kam", "kamen", "kamt", "kamen", "kamen"],
      imp: { du: "komm", ihr: "kommt", Sie: "kommen Sie", duAlt: ["komme"] },
    }),
    anrufen: V("anrufen", {
      aux: "haben", part: "angerufen", sep: "an", base: "rufen",
      praes: ["rufe", "rufst", "ruft", "ruft", "ruft", "rufen", "ruft", "rufen", "rufen"],
      praet: ["rief", "riefst", "rief", "rief", "rief", "riefen", "rieft", "riefen", "riefen"],
      imp: { du: "ruf", ihr: "ruft", Sie: "rufen Sie", duAlt: ["rufe"] },
    }),
    fernsehen: V("fernsehen", {
      aux: "haben", part: "ferngesehen", sep: "fern", base: "sehen",
      praes: ["sehe", "siehst", "sieht", "sieht", "sieht", "sehen", "seht", "sehen", "sehen"],
      praet: ["sah", "sahst", "sah", "sah", "sah", "sahen", "saht", "sahen", "sahen"],
      imp: { du: "sieh", ihr: "seht", Sie: "sehen Sie", duAlt: [] },
    }),
    aufmachen: V("aufmachen", {
      aux: "haben", part: "aufgemacht", sep: "auf", base: "machen",
      praes: ["mache", "machst", "macht", "macht", "macht", "machen", "macht", "machen", "machen"],
      praet: ["machte", "machtest", "machte", "machte", "machte", "machten", "machtet", "machten", "machten"],
      imp: { du: "mach", ihr: "macht", Sie: "machen Sie", duAlt: ["mache"] },
    }),
  };
  delete VERBS.spielen2;

  function nounBy(de) {
    return NOUNS.find((n) => n.de === de) || null;
  }
  function pIndex(person) {
    const i = PERSONS.indexOf(person);
    if (i < 0) throw new Error("person " + person);
    return i;
  }
  function artForm(det, gender, kase, owner) {
    if (det === "def") return ART.def[gender][kase];
    const end = EIN_END[gender][kase];
    if (det === "indef") {
      if (gender === "pl") return null;
      return "ein" + end;
    }
    if (det === "kein") return "kein" + end;
    if (det === "poss") {
      const stem = POSS_STEM[owner];
      if (!stem) throw new Error("owner " + owner);
      if (stem === "euer") return end ? "eur" + end : "euer";
      return stem + end;
    }
    throw new Error("det " + det);
  }
  function verbCell(lemma, person, tense) {
    const v = VERBS[lemma];
    if (!v) throw new Error("verb " + lemma);
    const t = tense === "praet" || tense === "präteritum" ? "praet" : tense === "konj2" ? "konj2" : "praes";
    if (tense === "perfekt") {
      const auxLemma = v.aux === "sein" ? "sein" : "haben";
      return { perf: true, aux: verbCell(auxLemma, person, "präsens").token, part: v.part, prefix: null, token: null, lemma };
    }
    const arr = v[t];
    if (!arr) throw new Error("no " + t + " for " + lemma);
    return { perf: false, token: arr[pIndex(person)], prefix: v.sep || null, part: null, lemma };
  }
  function capFirstWord(words) {
    const w = words.slice();
    if (!w.length) return w;
    if (w[0] === "sie") w[0] = "Sie";
    else if (w[0] !== "Sie" && w[0] !== "Ihnen" && w[0] !== "Ihr") {
      w[0] = w[0].charAt(0).toUpperCase() + w[0].slice(1);
    }
    return w;
  }
  function clauseWords(check) {
    const person = check.person;
    const pron = PRON[person].nom;
    const fin = verbCell(check.lemma, person, check.tense || "präsens");
    const rest = (check.rest || []).slice();
    const pattern = check.pattern || "statement";
    let words;
    if (fin.perf) {
      const core = [pron, fin.aux, ...rest, fin.part];
      if (pattern === "statement") words = capFirstWord(core);
      else if (pattern === "yn") words = capFirstWord([fin.aux, pron, ...rest, fin.part]);
      else if (pattern === "w") words = [check.w, fin.aux, pron, ...rest, fin.part];
      else if (pattern === "sub") words = [check.conj, pron, ...rest, fin.part, fin.aux];
      else if (pattern === "inv") words = capFirstWord([check.front, fin.aux, pron, ...rest, fin.part]);
      else throw new Error("pattern " + pattern);
    } else if (pattern === "statement") {
      words = fin.prefix
        ? capFirstWord([pron, fin.token, ...rest, fin.prefix])
        : capFirstWord([pron, fin.token, ...rest]);
    } else if (pattern === "yn") {
      words = fin.prefix
        ? capFirstWord([fin.token, pron, ...rest, fin.prefix])
        : capFirstWord([fin.token, pron, ...rest]);
    } else if (pattern === "w") {
      words = fin.prefix
        ? [check.w, fin.token, pron, ...rest, fin.prefix]
        : [check.w, fin.token, pron, ...rest];
    } else if (pattern === "sub") {
      const end = fin.prefix ? fin.prefix + fin.token : fin.token;
      const refl = check.refl ? [REFL[person][check.refl]] : [];
      words = [check.conj, pron, ...refl, ...rest, end];
    } else if (pattern === "inv") {
      words = fin.prefix
        ? capFirstWord([check.front, fin.token, pron, ...rest, fin.prefix])
        : capFirstWord([check.front, fin.token, pron, ...rest]);
    } else throw new Error("pattern " + pattern);
      if (!fin.perf && check.refl && pattern !== "sub") {
      const at = (pattern === "w" || pattern === "inv") ? 3 : 2;
      words.splice(at, 0, REFL[person][check.refl]);
    }
    return words;
  }
  function joinWords(words, punct) {
    let s = words.join(" ");
    if (punct === "?" || punct === ".") s += punct;
    else if (punct === true) s += ".";
    return s;
  }

  function solve(check) {
    if (!check || !check.kind) throw new Error("check");
    switch (check.kind) {
      case "article":
      case "poss": {
        const det = check.kind === "poss" ? "poss" : check.det;
        const form = artForm(det, check.gender, check.kase, check.owner);
        if (!form) throw new Error("no article");
        if (check.phrase) {
          const noun = nounPhraseBit(check);
          return form + " " + noun;
        }
        return form;
      }
      case "verb":
        if (check.partOnly) return VERBS[check.lemma].part;
        return verbCell(check.lemma, check.person, check.tense || "präsens").token;
      case "pronoun":
        return PRON[check.person][check.kase];
      case "refl":
        return REFL[check.person][check.kase];
      case "rel":
        return REL[check.gender][check.kase];
      case "adjEnd":
        return ADJ[check.decl][check.gender][check.kase];
      case "adjPhrase": {
        const end = ADJ[check.decl][check.gender][check.kase];
        const adj = check.stem + end;
        if (check.decl === "strong") return adj + " " + check.noun;
        const det = check.det || (check.decl === "der" ? "def" : "indef");
        const art = artForm(det, check.gender, check.kase, check.owner);
        return art + " " + adj + " " + check.noun;
      }
      case "compare":
        return COMPARE[check.lemma][check.degree];
      case "ndecl":
        return NDECL[check.lemma][check.kase];
      case "ndeclPhrase": {
        const art = artForm(check.det || "def", "m", check.kase);
        return art + " " + NDECL[check.lemma][check.kase];
      }
      case "genPrep": {
        const art = artForm("def", check.gender, "gen");
        return check.prep + " " + art + " " + check.gen;
      }
      case "prepArticle": {
        const kase = prepCase(check);
        return artForm(check.det || "def", check.gender, kase);
      }
      case "imp": {
        const v = VERBS[check.lemma];
        const bit = v.imp[check.who];
        let raw;
        if (v.sep) {
          raw = check.who === "Sie" ? bit.replace(" Sie", "") + " Sie " + v.sep : bit + " " + v.sep;
        } else raw = bit;
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
      case "clause": {
        const words = clauseWords(check);
        const punct = check.punct === false ? "" : check.punct || (check.pattern === "yn" || check.pattern === "w" ? "?" : check.pattern === "sub" ? "" : ".");
        return joinWords(words, punct);
      }
      case "passive": {
        const num = check.num === "pl" ? "pl" : "sg";
        const person = num === "pl" ? "sie_pl" : "er";
        const tense = check.tense === "präteritum" || check.tense === "praet" ? "praet" : "praes";
        const fin = verbCell("werden", person, tense).token;
        return check.patient + " " + fin + " " + check.part + ".";
      }
      case "zu": {
        const v = VERBS[check.lemma];
        const zu = v.sep ? v.sep + "zu" + v.base : "zu " + check.lemma;
        const mid = check.mid ? check.mid + " " : "";
        return check.lead + ", " + mid + zu + ".";
      }
      case "predicate":
        return check.stem;
      case "tokens":
        return check.tokens.join(" ");
      case "connector":
      case "literal":
        return check.word;
      case "spot":
        return check.tokens[check.wrongIndex];
      case "transform":
        return solve(check.to);
      case "compose":
        return check.bits.map((b) => (typeof b === "string" ? b : solve(b))).join(" ").replace(/\s+/g, " ").trim();
      default:
        throw new Error("kind " + check.kind);
    }
  }

  function prepCase(check) {
    if (check.kase) return check.kase;
    if (TWO_WAY.includes(check.prep)) return check.where === "wohin" ? "acc" : "dat";
    const c = PREP_CASE[check.prep];
    if (!c) throw new Error("prep " + check.prep);
    if (c === "akk") return "acc";
    return c === "dat" ? "dat" : "gen";
  }
  function nounPhraseBit(check) {
    const n = nounBy(check.noun) || { de: check.noun, pl: check.noun, pld: check.noun, gen: check.gen || check.noun };
    if (check.gender === "pl" && check.kase === "dat") return n.pld;
    if (check.gender === "pl") return n.pl;
    if (check.kase === "gen" && check.gender !== "pl") return n.gen || check.gen;
    return n.de;
  }

  function knownWrong(check) {
    const right = solve(check);
    const out = new Set();
    const add = (s) => { if (s && s !== right) out.add(s); };
    if (check.kind === "article" || check.kind === "poss" || check.kind === "prepArticle") {
      const det = check.kind === "poss" ? "poss" : (check.det || "def");
      const gender = check.gender;
      const owner = check.owner;
      for (const k of ["nom", "acc", "dat", "gen"]) add(check.phrase ? null : artForm(det, gender, k, owner));
      if (check.kind === "prepArticle") {
        for (const k of ["nom", "acc", "dat", "gen"]) add(artForm(det, gender, k, owner));
      }
      if (gender !== "pl") {
        for (const g of ["m", "f", "n"]) {
          if (g !== gender) add(artForm(det, g, check.kase || prepCase(check), owner));
        }
      }
    } else if (check.kind === "verb") {
      const v = VERBS[check.lemma];
      const tense = check.tense || "präsens";
      if (check.partOnly) {
        add(check.lemma);
        add("ge" + check.lemma);
      } else {
        for (const p of PERSONS) add(verbCell(check.lemma, p, tense).token);
        if (v.praet && check.person && tense !== "praet" && tense !== "präteritum") add(verbCell(check.lemma, check.person, "praet").token);
      }
    } else if (check.kind === "pronoun" || check.kind === "refl") {
      const table = check.kind === "pronoun" ? PRON : REFL;
      for (const k of ["nom", "acc", "dat"]) if (table[check.person][k]) add(table[check.person][k]);
    } else if (check.kind === "rel") {
      for (const k of ["nom", "acc", "dat", "gen"]) add(REL[check.gender][k]);
    } else if (check.kind === "adjEnd") {
      for (const k of ["nom", "acc", "dat"]) add(ADJ[check.decl][check.gender][k]);
      for (const d of ["strong", "der", "ein"]) add(ADJ[d][check.gender][check.kase]);
    } else if (check.kind === "compare") {
      add(COMPARE[check.lemma].comp);
      add(COMPARE[check.lemma].sup);
      add(check.lemma);
    } else if (check.kind === "ndecl" || check.kind === "ndeclPhrase") {
      for (const k of ["nom", "acc", "dat"]) {
        add(check.kind === "ndecl" ? NDECL[check.lemma][k] : artForm("def", "m", k) + " " + NDECL[check.lemma][k]);
      }
      if (check.kind === "ndeclPhrase") add(artForm("def", "m", check.kase) + " " + NDECL[check.lemma].nom);
    } else if (check.kind === "genPrep") {
      add(check.prep + " " + artForm("def", check.gender, "dat") + " " + (nounBy(check.noun)?.de || check.noun));
      add(check.prep + " " + artForm("def", check.gender, "acc") + " " + (nounBy(check.noun)?.de || check.noun));
      add(check.prep + " " + artForm("def", check.gender, "gen") + " " + (nounBy(check.noun)?.de || check.noun));
    } else if (check.kind === "clause") {
      const alts = ["ich", "du", "er", "wir", "ihr", "sie_pl", "Sie"];
      alts.forEach((p) => { if (p !== check.person) add(solve(Object.assign({}, check, { person: p }))); });
      if (check.tense === "perfekt") {
        const v = VERBS[check.lemma];
        const saved = v.aux;
        v.aux = saved === "sein" ? "haben" : "sein";
        try { add(solve(check)); } finally { v.aux = saved; }
      }
    } else if (check.kind === "passive") {
      const other = check.tense === "praet" || check.tense === "präteritum" ? "präsens" : "praet";
      add(solve(Object.assign({}, check, { tense: other })));
      const num = check.num === "pl" ? "sg" : "pl";
      add(solve(Object.assign({}, check, { num })));
    } else if (check.kind === "imp") {
      const v = VERBS[check.lemma];
      for (const who of ["du", "ihr", "Sie"]) {
        if (v.imp && v.imp[who]) add(solve(Object.assign({}, check, { who })));
      }
    } else if (check.kind === "predicate") {
      ["e", "er", "es", "en", "em"].forEach((end) => add(check.stem + end));
    } else if (check.kind === "connector") {
      for (const w of ["weil", "dass", "wenn", "als", "ob", "obwohl", "deshalb", "trotzdem", "darum", "deswegen", "Wo", "Woher", "Wohin", "Wann", "Wie", "Was", "Wer", "Warum", "nicht", "kein"]) add(w);
    } else if (check.kind === "spot") {
      add(solve(check.fix));
    }
    out.delete(right);
    return [...out];
  }

  function extraAccept(check) {
    const acc = [];
      if (check.kind === "imp" && check.who === "du") {
      const v = VERBS[check.lemma];
      (v.imp.duAlt || []).forEach((a) => {
        const raw = v.sep ? a + " " + v.sep : a;
        acc.push(raw.charAt(0).toUpperCase() + raw.slice(1));
      });
    }
    if (check.kind === "prepArticle" || (check.kind === "article" && check.prep && check.phrase)) {
      const phrase = check.kind === "article" ? solve(check) : check.prep + " " + solve(check);
      const key = phrase.toLowerCase();
      // contractions handled by the caller when the full phrase is the answer
    }
    if (check.kind === "compose" || check.kind === "genPrep") {
      const answer = solve(check);
      Object.keys(CONTRACT).forEach((full) => {
        if (answer.toLowerCase().includes(full)) {
          CONTRACT[full].forEach((short) => {
            const re = new RegExp(full, "i");
            acc.push(answer.replace(re, (m) => (m[0] === m[0].toUpperCase() ? short.charAt(0).toUpperCase() + short.slice(1) : short)));
          });
        }
      });
    }
    return acc;
  }

  const CASE_EN = { nom: "nominative", acc: "accusative", dat: "dative", gen: "genitive" };
  const CASE_DE = { nom: "Nominativ", acc: "Akkusativ", dat: "Dativ", gen: "Genitiv" };
  const G_EN = { m: "masculine", f: "feminine", n: "neuter", pl: "plural" };
  const G_DE = { m: "maskulin", f: "feminin", n: "neutral", pl: "Plural" };
  const PERSON_EN = {
    ich: "ich (I)", du: "du (you, one friend)", er: "er (he)", sie: "sie (she)", es: "es (it)",
    wir: "wir (we)", ihr: "ihr (you all)", sie_pl: "sie (they)", Sie: "Sie (you, formal)",
  };

  function explain(check) {
    const answer = solve(check);
    let en = "";
    let de = "";
    if (check.kind === "article" || check.kind === "poss" || check.kind === "prepArticle") {
      const kase = check.kase || prepCase(check);
      if (check.prep && TWO_WAY.includes(check.prep)) {
        const dir = (check.where === "wohin");
        en = (dir ? "Direction (wohin) takes the accusative" : "Location (wo) takes the dative") + " after " + check.prep + ": " + answer + ".";
        de = (dir ? "Wohin steht mit dem Akkusativ" : "Wo steht mit dem Dativ") + " nach " + check.prep + ": " + answer + ".";
      } else if (check.prep) {
        en = check.prep + " takes the " + CASE_EN[kase] + ": " + answer + ".";
        de = check.prep + " steht mit dem " + CASE_DE[kase] + ": " + answer + ".";
      } else {
        en = G_EN[check.gender] + " " + CASE_EN[kase] + " is " + answer + ".";
        de = G_DE[check.gender] + ", " + CASE_DE[kase] + ": " + answer + ".";
      }
    } else if (check.kind === "verb") {
      if (check.partOnly) {
        en = "The participle of " + check.lemma + " is " + answer + ".";
        de = "Das Partizip von " + check.lemma + " ist " + answer + ".";
      } else {
        en = check.lemma + " with " + PERSON_EN[check.person] + " is " + answer + ".";
        de = check.lemma + " mit " + PRON[check.person].nom + ": " + answer + ".";
      }
    } else if (check.kind === "pronoun" || check.kind === "refl") {
      en = "The " + CASE_EN[check.kase] + " form is " + answer + ".";
      de = CASE_DE[check.kase] + ": " + answer + ".";
    } else if (check.kind === "adjEnd" || check.kind === "adjPhrase") {
      en = "This ending is -" + (check.kind === "adjEnd" ? answer : ADJ[check.decl][check.gender][check.kase]) + " (" + check.decl + " declension, " + G_EN[check.gender] + " " + CASE_EN[check.kase] + ").";
      de = "Die Endung ist -" + (check.kind === "adjEnd" ? answer : ADJ[check.decl][check.gender][check.kase]) + ".";
    } else if (check.kind === "compare") {
      en = "The " + (check.degree === "comp" ? "comparative" : "superlative") + " of " + check.lemma + " is " + answer + ".";
      de = (check.degree === "comp" ? "Komparativ" : "Superlativ") + " von " + check.lemma + ": " + answer + ".";
    } else if (check.kind === "clause") {
      if (check.pattern === "sub") {
        en = "In a weil/dass/wenn/ob/obwohl clause the conjugated verb goes to the end.";
        de = "Im Nebensatz steht das konjugierte Verb am Ende.";
      } else if (check.pattern === "yn") {
        en = "A yes/no question starts with the conjugated verb.";
        de = "Eine Ja/Nein-Frage beginnt mit dem konjugierten Verb.";
      } else if (check.pattern === "w" || check.pattern === "inv") {
        en = "The conjugated verb stays in position 2.";
        de = "Das konjugierte Verb bleibt auf Position 2.";
      } else if (check.tense === "perfekt") {
        en = "Perfekt uses " + (VERBS[check.lemma].aux === "sein" ? "sein" : "haben") + " plus the participle " + VERBS[check.lemma].part + ".";
        de = "Perfekt: " + (VERBS[check.lemma].aux === "sein" ? "sein" : "haben") + " + " + VERBS[check.lemma].part + ".";
      } else {
        en = "The conjugated verb is in position 2.";
        de = "Das konjugierte Verb steht auf Position 2.";
      }
    } else if (check.kind === "passive") {
      en = "Passive: a form of werden plus the participle at the end.";
      de = "Passiv: werden + Partizip am Ende.";
    } else if (check.kind === "zu") {
      en = "zu sits in front of the infinitive. With a separable verb it slides between the prefix and the verb.";
      de = "zu steht vor dem Infinitiv. Beim trennbaren Verb steht zu zwischen Präfix und Verb.";
    } else if (check.kind === "genPrep") {
      en = check.prep + " takes the genitive: " + answer + ".";
      de = check.prep + " steht mit dem Genitiv: " + answer + ".";
    } else if (check.kind === "ndecl" || check.kind === "ndeclPhrase") {
      en = "This masculine noun adds -n or -en after der. Herr only adds -n.";
      de = "Dieses Nomen bekommt -n oder -en nach der. Herr bekommt nur -n.";
    } else if (check.kind === "imp") {
      en = "Imperative: du drops the -st, ihr looks like the present, Sie keeps the infinitive plus Sie.";
      de = "Imperativ: du ohne -st, ihr wie im Präsens, Sie mit Infinitiv + Sie.";
    } else if (check.kind === "predicate") {
      en = "After sein, the adjective has no ending: " + answer + ".";
      de = "Nach sein hat das Adjektiv keine Endung: " + answer + ".";
    } else if (check.kind === "tokens") {
      en = check.whyEn || "The conjugated verb has to sit in the right slot.";
      de = check.whyDe || "Das konjugierte Verb steht an der richtigen Stelle.";
    } else if (check.kind === "connector") {
      en = "This linker is " + answer + ".";
      de = "Die Verbindung ist " + answer + ".";
    } else if (check.kind === "literal") {
      en = check.whyEn || ("The form is " + answer + ".");
      de = check.whyDe || ("Die Form ist " + answer + ".");
    } else if (check.kind === "spot") {
      const fix = solve(check.fix);
      en = "The odd word is " + answer + ". Better: " + fix + ". " + explain(check.fix).en;
      de = "Falsch ist " + answer + ". Besser: " + fix + ". " + explain(check.fix).de;
    } else if (check.kind === "transform") {
      en = explain(check.to).en;
      de = explain(check.to).de;
    } else if (check.kind === "rel") {
      en = "The relative pronoun for " + G_EN[check.gender] + " " + CASE_EN[check.kase] + " is " + answer + ".";
      de = "Relativpronomen, " + G_DE[check.gender] + " " + CASE_DE[check.kase] + ": " + answer + ".";
    } else {
      en = "Answer: " + answer + ".";
      de = "Antwort: " + answer + ".";
    }
    return { en, de };
  }

  function wrongMap(check, choices) {
    const map = {};
    const right = solve(check).toLowerCase();
    const pool = new Set(knownWrong(check));
    (choices || []).forEach((c) => pool.add(c));
    pool.forEach((w) => {
      if (!w || String(w).toLowerCase() === right) return;
      if (check.prep && TWO_WAY.includes(check.prep)) {
        const kase = check.kase || prepCase(check);
        const why = check.where === "wohin" ? "Direction (wohin) takes the accusative" : "Location (wo) takes the dative";
        map[w] = {
          en: why + " after " + check.prep + ": " + solve(check) + ", not " + w + ".",
          de: (check.where === "wohin" ? "Wohin" : "Wo") + " mit " + check.prep + ": " + solve(check) + ", nicht " + w + ".",
        };
      } else if (check.prep) {
        const kase = check.kase || (check.kind === "prepArticle" ? prepCase(check) : check.kase);
        map[w] = {
          en: check.prep + " takes the " + CASE_EN[kase] + ": " + solve(check) + ", not " + w + ".",
          de: check.prep + " steht mit dem " + CASE_DE[kase] + ": " + solve(check) + ", nicht " + w + ".",
        };
      } else if (check.kind === "article" || check.kind === "poss" || check.kind === "prepArticle") {
        map[w] = {
          en: "Here the " + G_EN[check.gender] + " " + CASE_EN[check.kase || prepCase(check)] + " form is " + solve(check) + ", not " + w + ".",
          de: "Hier steht " + solve(check) + ", nicht " + w + ".",
        };
      } else if (check.kind === "genPrep") {
        map[w] = {
          en: check.prep + " takes the genitive: " + solve(check) + ", not " + w + ".",
          de: check.prep + " steht mit dem Genitiv: " + solve(check) + ", nicht " + w + ".",
        };
      } else {
        const base = explain(check);
        const shown = String(w).replace(/[?.!]+$/g, "");
        map[w] = {
          en: base.en + " Not " + shown + ".",
          de: base.de + " Nicht " + shown + ".",
        };
      }
    });
    return map;
  }

  function canon(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim()
      .replace(/[?!.;:…]+$/g, "")
      .replace(/^[¿¡]+/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function umlautVariants(s) {
    const map = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "Ae", Ö: "Oe", Ü: "Ue" };
    let outs = [""];
    for (const ch of s) {
      const next = [];
      const alt = map[ch];
      for (const o of outs) {
        next.push(o + ch);
        if (alt) next.push(o + alt);
      }
      outs = next;
      if (outs.length > 64) break;
    }
    return outs;
  }
  function inferCap(answer, check) {
    if (check.cap) return check.cap;
    if (check.kind === "imp") return String(answer).includes(" ") ? "sentence" : "token";
    const single = ["article", "verb", "pronoun", "refl", "rel", "adjEnd", "compare", "ndecl", "connector", "prepArticle", "poss"];
    if (single.includes(check.kind) && !String(answer).includes(" ")) {
      if (answer === "Sie" || answer === "Ihnen" || answer === "Ihr") return "exact";
      if (check.kind === "ndecl" || check.kind === "compare") {
        if (answer === "besser" || answer === "lieber" || answer === "mehr" || answer === "höher" || answer === "größer") return "token";
      }
      if (/^[A-ZÄÖÜ]/.test(answer) && answer !== "Sie") return "noun";
      return "token";
    }
    if (check.kind === "compare" && String(answer).includes(" ")) return "sentence";
    if (!String(answer).includes(" ")) {
      if (/^[A-ZÄÖÜ]/.test(answer) && !["Sie", "Ihnen", "Ihr"].includes(answer)) return "noun";
      return "token";
    }
    return "sentence";
  }
  function sameAnswer(user, expected, cap) {
    const u = canon(user);
    return umlautVariants(canon(expected)).some((ev) => {
      if (!u && !ev) return true;
      if (cap === "exact" || cap === "noun") return u === ev;
      if (cap === "token") return u.toLowerCase() === ev.toLowerCase();
      if (!u || !ev) return false;
      return u.charAt(0).toLowerCase() === ev.charAt(0).toLowerCase() && u.slice(1) === ev.slice(1);
    });
  }
  function grade(item, user) {
    const cap = item.cap || inferCap(item.answers[0], item.check);
    const keys = [item.answers[0]].concat(item.accept || []);
    const ok = keys.some((a) => sameAnswer(user, a, cap));
    if (ok) return { ok: true, answer: item.answers[0] };
    let nearPool = [];
    try { nearPool = knownWrong(item.check) || []; } catch (e) { nearPool = []; }
    const near = nearPool.find((w) => sameAnswer(user, w, cap === "noun" ? "noun" : "token") || sameAnswer(user, w, "sentence"));
    const bag = item.wrong || {};
    const why = (near && (bag[near] || bag[String(near).toLowerCase()])) || item.explain;
    return { ok: false, answer: item.answers[0], why, near: near || "" };
  }

  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return h >>> 0;
  }
  function shuffle(arr, seed) {
    const a = arr.slice();
    let x = seed || 1;
    for (let i = a.length - 1; i > 0; i--) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      const j = x % (i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    if (a.join("\u0000") === arr.join("\u0000") && a.length > 1) {
      const t = a[0]; a[0] = a[1]; a[1] = t;
    }
    return a;
  }
  function choicesFor(check, n) {
    const right = solve(check);
    const opts = [right];
    knownWrong(check).forEach((w) => {
      if (opts.length >= (n || 4)) return;
      if (!opts.some((o) => o.toLowerCase() === String(w).toLowerCase())) opts.push(w);
    });
    return opts.slice(0, n || 4);
  }
  function assertVerbSlot(check, words) {
    const fin = verbCell(check.lemma, check.person, check.tense || "präsens");
    const pat = check.pattern || "statement";
    const bad = (msg) => { throw new Error(msg + ": " + words.join(" ")); };
    if (fin.perf) {
      if (pat === "sub") { if (words[words.length - 1] !== fin.aux) bad("perfekt aux not final"); }
      else if (pat === "yn") { if (words[0].toLowerCase() !== fin.aux) bad("perfekt yn"); }
      else if (words[1] !== fin.aux) bad("perfekt v2");
      return;
    }
    if (pat === "sub") {
      const end = fin.prefix ? fin.prefix + fin.token : fin.token;
      if (words[words.length - 1] !== end) bad("sub verb");
    } else if (pat === "yn") {
      if (words[0].toLowerCase() !== fin.token) bad("yn verb");
      if (fin.prefix && words[words.length - 1] !== fin.prefix) bad("yn prefix");
    } else {
      if (words[1] !== fin.token) bad("v2 verb");
      if (fin.prefix && words[words.length - 1] !== fin.prefix) bad("prefix");
    }
  }

  function makeItem(partial) {
    const answer = solve(partial.check);
    if (!answer) throw new Error("empty " + JSON.stringify(partial.check));
    const choices = partial.type === "choice" ? (partial.choices || choicesFor(partial.check, 4)) : null;
    const cap = partial.cap || inferCap(answer, partial.check);
    const item = {
      type: partial.type,
      prompt: partial.prompt,
      stimulus: partial.stimulus || "",
      choices,
      tiles: partial.tiles || null,
      answers: [answer],
      accept: (partial.accept || extraAccept(partial.check)).filter((a) => a && a !== answer),
      explain: partial.explain || explain(partial.check),
      wrong: partial.wrong || wrongMap(partial.check, choices),
      check: partial.check,
      cap,
      audio: partial.audio || (partial.type === "listen" ? answer : null),
      sourceText: partial.sourceText || "",
    };
    if (partial.type === "order") {
      const words = partial.check.kind === "tokens" ? partial.check.tokens.slice() : clauseWords(partial.check);
      if (partial.check.kind === "clause" && !partial.check.refl) assertVerbSlot(partial.check, words);
      if (partial.check.kind === "tokens" && partial.check.finiteIndex != null) {
        if (words[partial.check.finiteIndex] !== partial.check.finite) {
          throw new Error("finite slot " + words.join(" "));
        }
      }
      item.tiles = shuffle(words, hash(partial.salt || words.join(" ")));
      item.answers = [words.join(" ")];
      item.cap = "sentence";
      item.check = partial.check;
    }
    if (partial.type === "spot") {
      item.tokens = partial.check.tokens.slice();
      item.fix = solve(partial.check.fix);
    }
    return item;
  }

  function nounShown(noun, kase) {
    if (noun.g === "pl" || noun.forcePl) {
      if (kase === "dat") return noun.pld;
      return noun.pl;
    }
    return noun.de;
  }

  function unitMastery(unit, correct) {
    const ids = (unit && unit.itemIds) || [];
    if (!ids.length) return 0;
    let n = 0;
    ids.forEach((id) => { if (correct && correct[id]) n += 1; });
    return n / ids.length;
  }
  function isUnitOpen(index, units, progress, role) {
    if (role === "farouk") return true;
    if (index <= 0) return true;
    const through = (progress && progress.unlockThrough) || 0;
    if (index <= through) return true;
    return unitMastery(units[index - 1], progress && progress.correct) >= MASTER_AT;
  }
  function nextReview(prev, ok, now) {
    if (!ok) return { box: 0, due: now };
    const box = ((prev && prev.box) || 0) + 1;
    if (box > REVIEW_DAYS.length) return null;
    return { box, due: now + REVIEW_DAYS[box - 1] * 86400000 };
  }
  function weakUnitIds(units, progress) {
    const correct = (progress && progress.correct) || {};
    const attempts = (progress && progress.attempts) || {};
    return units.filter((u) => (attempts[u.id] || 0) >= 4 && unitMastery(u, correct) < MASTER_AT).map((u) => u.id);
  }
  function suggestStart(units, items, placementIds, results) {
    const byId = {};
    items.forEach((it) => { byId[it.id] = it; });
    const map = {};
    (results || []).forEach((r) => { map[r.id] = r.ok; });
    let missed = false;
    let start = units[0] ? units[0].id : "";
    for (const id of placementIds || []) {
      if (map[id] === false) {
        start = byId[id] ? byId[id].unitId : start;
        missed = true;
        break;
      }
    }
    if (!missed && placementIds && placementIds.length) {
      const last = byId[placementIds[placementIds.length - 1]];
      if (last) start = last.unitId;
    }
    return start;
  }

  const api = {
    PERSONS, PRON, REFL, ART, ADJ, REL, COMPARE, NDECL, VERBS, NOUNS, PREP_CASE, TWO_WAY,
    MASTER_AT, REVIEW_DAYS, POSS_STEM,
    solve, knownWrong, grade, explain, artForm, verbCell, canon, sameAnswer, inferCap,
    makeItem, choicesFor, nounBy, prepCase, clauseWords, shuffle, nounShown,
    unitMastery, isUnitOpen, nextReview, weakUnitIds, suggestStart,
  };

  api.buildCourse = function buildCourse() {
    return buildCourseImpl(api);
  };
  return api;

  function buildCourseImpl(G) {
    const units = [];
    const items = [];
    function addUnit(meta, raw) {
      if (raw.length < 20) throw new Error(meta.id + " has " + raw.length);
      const sliced = raw.slice(0, 24);
      sliced.forEach((it, i) => {
        it.unitId = meta.id;
        it.id = meta.id + "-" + String(i + 1).padStart(2, "0");
        if (!it.prompt || !it.prompt.en || !it.prompt.de) throw new Error("prompt " + it.id);
        if (!it.explain || !it.explain.en) throw new Error("explain " + it.id);
      });
      const ids = sliced.map((it) => it.id);
      units.push({
        id: meta.id,
        level: meta.level,
        title: meta.title,
        topic: meta.topic,
        dw: meta.dw,
        blurb: meta.blurb,
        points: meta.points,
        mistakes: meta.mistakes,
        compare: meta.compare || null,
        examples: meta.examples || [],
        table: meta.table || null,
        itemIds: ids,
      });
      items.push(...sliced);
    }
    function P(en, de) { return { en, de }; }
    function gap(prompt, stimulus, check, type) {
      return G.makeItem({ type: type || "gap", prompt, stimulus, check });
    }
    function choice(prompt, stimulus, check) {
      return G.makeItem({ type: "choice", prompt, stimulus, check });
    }
    function order(prompt, check) {
      return G.makeItem({ type: "order", prompt, check, stimulus: "" });
    }
    function listen(prompt, check) {
      return G.makeItem({ type: "listen", prompt, check, stimulus: "" });
    }
    function spot(prompt, check) {
      const item = G.makeItem({ type: "spot", prompt, check, stimulus: check.tokens.join(" ") });
      return item;
    }
    function xform(prompt, from, to) {
      const source = G.solve(from);
      return G.makeItem({
        type: "transform",
        prompt,
        stimulus: source,
        sourceText: source,
        check: { kind: "transform", from, to },
      });
    }

    const people = ["Mann", "Frau", "Kind", "Freund", "Freundin"].map((d) => G.nounBy(d));
    const things = ["Tisch", "Apfel", "Buch", "Lampe", "Auto", "Stadt", "Haus", "Fenster"].map((d) => G.nounBy(d));
    const mix = ["Mann", "Frau", "Kind", "Tisch", "Schule", "Buch", "Hund", "Blume", "Auto", "Stadt"].map((d) => G.nounBy(d));

    function artSet(list, det, cases, frame) {
      const out = [];
      cases.forEach((kase) => {
        list.forEach((noun) => {
          const g = noun.g;
          if (det === "indef" && g === "pl") return;
          const shown = (kase === "dat" && frame.plDat) ? frame.plDat(noun) : (frame.forcePl ? noun.pld && kase === "dat" ? noun.pld : noun.pl : G.nounShown(noun, kase));
          const gender = frame.forcePl ? "pl" : g;
          const stim = frame.stim(kase, shown);
          const check = { kind: det === "poss" ? "poss" : "article", det, gender, kase, noun: noun.de, owner: frame.owner, prep: frame.prep || null };
          const prompt = P(frame.en(kase, noun.en), frame.de(kase));
          out.push((out.length % 3 === 0 ? choice : gap)(prompt, stim, check));
        });
      });
      return out;
    }

    // ---------- units ----------
    addUnit({
      id: "du-sie", level: "A1",
      title: P("du or Sie", "du oder Sie"),
      topic: "informal du versus formal Sie",
      dw: { title: "Hallo!", url: "https://learngerman.dw.com/de/hallo/l-40322767" },
      blurb: P(
        "German has two words for you. du is for one friend, a child, or your family. Sie is for adults you do not know, and it is always written with a capital S. The verb with Sie matches they: Sie sind, Sie haben, Sie wohnen.",
        "du benutzt du für eine Freundin oder die Familie. Sie ist höflich und immer groß. Das Verb ist wie im Plural: Sie sind, Sie haben."
      ),
      points: P(
        ["du bist / du hast / du wohnst", "Sie sind / Sie haben / Sie wohnen", "A capital Sie in the middle of a sentence means you, formal."],
        ["du bist / du hast / du wohnst", "Sie sind / Sie haben / Sie wohnen", "Sie mitten im Satz ist die höfliche Anrede."]
      ),
      mistakes: P(
        ["Sie bist mixes the formal pronoun with the du verb.", "sie sind with a small s means they are, not you are."],
        ["Sie bist mischt Sie und die du-Form.", "sie sind mit kleinem s heißt sie (Plural)."]
      ),
      compare: P(
        "French tu and vous work the same way. Arabic uses أنت with someone close, and a more distant form with a stranger.",
        "Wie französisch tu und vous. Im Arabischen ist أنت nah, die höfliche Form ist distanzierter."
      ),
      examples: [
        [{ t: "Wie" }, { t: "heißt", verb: 1 }, { t: "du", g: "du" }, { t: "?" }],
        [{ t: "Wie" }, { t: "heißen", verb: 1 }, { t: "Sie", g: "Sie" }, { t: "?" }],
      ],
    }, (function () {
      const rows = [
        ["sein", "nett"], ["haben", "Zeit"], ["wohnen", "hier"], ["kommen", "aus Berlin"],
        ["heißen", "Khawla"], ["sprechen", "Deutsch"], ["arbeiten", "heute"], ["lernen", "Deutsch"],
      ];
      const out = [];
      rows.forEach(([lemma, bit]) => {
        const rest = bit.split(" ");
        out.push(choice(
          P("How do you ask one friend?", "Wie fragst du eine Freundin?"),
          "",
          { kind: "clause", pattern: "yn", lemma, person: "du", rest }
        ));
        out.push(gap(
          P("How do you ask an adult you do not know? Type the question.", "Wie fragst du höflich? Schreib die Frage."),
          G.solve({ kind: "clause", pattern: "yn", lemma, person: "du", rest }).replace(G.verbCell(lemma, "du", "präsens").token, "___").replace(/\bdu\b/, "___"),
          { kind: "clause", pattern: "yn", lemma, person: "Sie", rest }
        ));
      });
      out.push(spot(P("Tap the word that does not fit a formal sentence.", "Tipp auf das Wort, das nicht höflich passt."), {
        kind: "spot", tokens: ["Wohnen", "Sie", "bist", "hier?"], wrongIndex: 2,
        fix: { kind: "verb", lemma: "sein", person: "Sie", tense: "präsens" },
      }));
      out.push(order(P("Build the formal question.", "Bau die höfliche Frage."), {
        kind: "clause", pattern: "yn", lemma: "heißen", person: "Sie", rest: ["Frau", "Berg"], punct: false,
      }));
      out.push(order(P("Build the sentence to one friend.", "Bau den Satz für eine Freundin."), {
        kind: "clause", pattern: "statement", lemma: "sein", person: "du", rest: ["nett"], punct: false,
      }));
      out.push(listen(P("Listen and type the formal sentence.", "Hör zu und schreib den höflichen Satz."), {
        kind: "clause", pattern: "statement", lemma: "wohnen", person: "Sie", rest: ["in", "Berlin"],
      }));
      return out;
    })());

    addUnit({
      id: "present", level: "A1",
      title: P("Present tense verbs", "Verben im Präsens"),
      topic: "present conjugation including stem-changing verbs",
      dw: { title: "Woher kommst du?", url: "https://learngerman.dw.com/de/woher-kommst-du/l-40368715" },
      blurb: P(
        "The ending tells you who does the action. ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en. A few verbs change the vowel for du and er/sie/es only: sprechen → du sprichst, fahren → du fährst, lesen → du liest.",
        "Die Endung zeigt die Person. ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en. Manche Verben wechseln den Vokal nur bei du und er/sie/es: du sprichst, du fährst, du liest."
      ),
      points: P(
        ["wir and Sie share the infinitive ending -en.", "du arbeitest and er arbeitet keep an extra e, because the stem ends in -t.", "The vowel change does not happen for wir, ihr, or Sie."],
        ["wir und Sie enden auf -en.", "du arbeitest hat ein Extra-e.", "Der Vokalwechsel gilt nicht für wir, ihr und Sie."]
      ),
      mistakes: P(
        ["du spielen keeps the infinitive. du takes -st: du spielst.", "er spricht, not er sprecht. sprecht is the ihr form."],
        ["du spielen ist der Infinitiv. Richtig: du spielst.", "er spricht, nicht er sprecht."]
      ),
      examples: [
        [{ t: "Ich", g: "ich" }, { t: "wohne", verb: 1 }, { t: "hier." }],
        [{ t: "Du", g: "du" }, { t: "fährst", verb: 1 }, { t: "nach", kase: "dat" }, { t: "Hause." }],
      ],
      table: {
        headers: ["", "ich", "du", "er", "wir", "ihr", "Sie"],
        rows: [
          ["wohnen", "wohne", "wohnst", "wohnt", "wohnen", "wohnt", "wohnen"],
          ["sprechen", "spreche", "sprichst", "spricht", "sprechen", "sprecht", "sprechen"],
          ["fahren", "fahre", "fährst", "fährt", "fahren", "fahrt", "fahren"],
        ],
      },
    }, (function () {
      const verbs = ["wohnen", "spielen", "arbeiten", "sprechen", "fahren", "lesen", "geben", "nehmen", "essen", "schlafen"];
      const persons = ["ich", "du", "er", "wir", "ihr", "Sie"];
      const out = [];
      verbs.forEach((lemma, vi) => {
        persons.forEach((person, pi) => {
          if ((vi + pi) % 3 === 2 && out.length > 8) return;
          const check = { kind: "verb", lemma, person, tense: "präsens" };
          const prompt = P("Type the " + person + " form of " + lemma + ".", "Schreib " + lemma + " für " + person + ".");
          out.push((out.length % 4 === 0 ? choice : gap)(prompt, person + " ___", check));
        });
      });
      out.push(spot(P("Tap the wrong verb form.", "Tipp auf die falsche Form."), {
        kind: "spot", tokens: ["Du", "spielen", "heute", "Fußball."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "spielen", person: "du", tense: "präsens" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), {
        kind: "clause", pattern: "statement", lemma: "sprechen", person: "du", rest: ["Deutsch"],
      }));
      return out;
    })());

    addUnit({
      id: "sein-haben", level: "A1",
      title: P("sein and haben", "sein und haben"),
      topic: "present of sein and haben",
      dw: { title: "Nico hat ein Problem", url: "https://learngerman.dw.com/de/nico-hat-ein-problem/l-40330734" },
      blurb: P(
        "sein and haben are the two verbs you need every day, and they do not follow the normal endings. Learn ich bin / du bist / er ist / wir sind / ihr seid / sie sind, and ich habe / du hast / er hat / wir haben / ihr habt.",
        "sein und haben sind unregelmäßig. ich bin, du bist, er ist, wir sind, ihr seid. ich habe, du hast, er hat, wir haben, ihr habt."
      ),
      points: P(
        ["ihr seid is easy to mix with Sie sind.", "du hast has no b. ich habe keeps the b.", "es ist uses the same form as er ist."],
        ["ihr seid und Sie sind sind verschieden.", "du hast ohne b.", "es ist wie er ist."]
      ),
      mistakes: P(
        ["ich bist copies du. ich bin.", "wir seid uses the ihr ending. wir sind."],
        ["ich bist ist falsch. ich bin.", "wir seid ist falsch. wir sind."]
      ),
      compare: P(
        "French être and avoir are just as irregular. Arabic ليس is not a good match for sein; think of a simple “is/are” that changes with the person.",
        "Wie être und avoir im Französischen. Die Formen muss man lernen."
      ),
      table: {
        headers: ["", "ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"],
        rows: [
          ["sein", "bin", "bist", "ist", "sind", "seid", "sind"],
          ["haben", "habe", "hast", "hat", "haben", "habt", "haben"],
        ],
      },
      examples: [
        [{ t: "Ich" }, { t: "bin", verb: 1 }, { t: "Khawla." }],
        [{ t: "Er" }, { t: "hat", verb: 1 }, { t: "ein", g: "n" }, { t: "Problem." }],
      ],
    }, (function () {
      const out = [];
      ["sein", "haben"].forEach((lemma) => {
        ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"].forEach((person) => {
          out.push((out.length % 3 === 0 ? choice : gap)(
            P("Form of " + lemma + " for " + person + ".", lemma + " für " + person + "."),
            person.replace("_pl", "") + " ___",
            { kind: "verb", lemma, person, tense: "präsens" }
          ));
        });
      });
      out.push(xform(
        P("Make a normal sentence: wir / sein / müde.", "Mach einen Satz: wir / sein / müde."),
        { kind: "connector", word: "wir sein müde" },
        { kind: "clause", pattern: "statement", lemma: "sein", person: "wir", rest: ["müde"] }
      ));
      // The transform above uses a dummy from. Fix by not using a fake connector.
      out.pop();
      out.push(order(P("Put the words in order.", "Bring die Wörter in Ordnung."), {
        kind: "clause", pattern: "statement", lemma: "haben", person: "ihr", rest: ["Zeit"], punct: false,
      }));
      out.push(gap(P("Type the form.", "Schreib die Form."), "Ich ___ müde.", { kind: "verb", lemma: "sein", person: "ich", tense: "präsens" }));
      out.push(gap(P("Type the form.", "Schreib die Form."), "Wir ___ ein Buch.", { kind: "verb", lemma: "haben", person: "wir", tense: "präsens" }));
      out.push(choice(P("Which one fits ihr?", "Was passt zu ihr?"), "Ihr ___ heute da.", { kind: "verb", lemma: "sein", person: "ihr", tense: "präsens" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "sein", person: "ich", rest: ["in", "Berlin"] }));
      out.push(spot(P("Tap the wrong form.", "Tipp auf die falsche Form."), {
        kind: "spot", tokens: ["Ihr", "bist", "sehr", "nett."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "sein", person: "ihr", tense: "präsens" },
      }));
      return out;
    })());

    addUnit({
      id: "w-questions", level: "A1",
      title: P("W questions", "W-Fragen"),
      topic: "wer, was, wo, woher, wohin, wann, wie, warum",
      dw: { title: "Adressen", url: "https://learngerman.dw.com/de/adressen/l-40375386" },
      blurb: P(
        "A W question starts with the question word, and the conjugated verb is the next word. Wo wohnst du? not Wo du wohnst? That second pattern is for a later lesson, inside a sentence.",
        "Eine W-Frage beginnt mit dem Fragewort, dann kommt das Verb. Wo wohnst du? Nicht: Wo du wohnst?"
      ),
      points: P(
        ["wo is a place, woher is an origin, wohin is a destination.", "wer asks for a person, was asks for a thing.", "The verb is in position 2, right after the W word."],
        ["wo = Ort, woher = Herkunft, wohin = Ziel.", "wer = Person, was = Sache.", "Das Verb steht auf Position 2."]
      ),
      mistakes: P(
        ["Wo du wohnst? keeps the verb at the end. That is a statement pattern, not a direct question.", "Woher answers with aus, wohin answers with nach or in."],
        ["Wo du wohnst? ist keine direkte Frage.", "woher mit aus, wohin mit nach oder in."]
      ),
      examples: [
        [{ t: "Wo", kase: "nom" }, { t: "wohnst", verb: 1 }, { t: "du?" }],
        [{ t: "Woher", kase: "nom" }, { t: "kommst", verb: 1 }, { t: "du?" }],
      ],
    }, (function () {
      const specs = [
        ["Wo", "wohnen", "du", []],
        ["Woher", "kommen", "du", []],
        ["Wohin", "gehen", "ihr", []],
        ["Wann", "spielen", "wir", ["Fußball"]],
        ["Wie", "heißen", "Sie", []],
        ["Was", "machen", "du", ["heute"]],
        ["Warum", "lernen", "du", ["Deutsch"]],
        ["Wer", "sein", "es", []],
        ["Wo", "arbeiten", "Sie", []],
        ["Wann", "kommen", "du", []],
        ["Wie", "gehen", "es", ["dir"]],
        ["Was", "trinken", "du", []],
      ];
      return (function () {
        const fixed = [];
        specs.forEach(([w, lemma, person, rest], i) => {
          const check = { kind: "clause", pattern: "w", w, lemma, person, rest, punct: false };
          if (i % 2 === 0) fixed.push(order(P("Build the question with " + w + ".", "Bau die Frage mit " + w + "."), check));
          else fixed.push(gap(P("Type the full question.", "Schreib die ganze Frage."), w + " ___", { kind: "clause", pattern: "w", w, lemma, person, rest }));
        });
        fixed.push(spot(P("Tap the verb that does not match du.", "Tipp auf das Verb, das nicht zu du passt."), {
          kind: "spot",
          tokens: ["Wo", "wohnt", "du?"],
          wrongIndex: 1,
          fix: { kind: "verb", lemma: "wohnen", person: "du", tense: "präsens" },
        }));
        fixed.push(choice(P("Which word asks for a destination?", "Welches Wort fragt nach dem Ziel?"), "___ gehst du?", { kind: "connector", word: "Wohin" }));
        fixed.push(choice(P("Which word asks for an origin?", "Welches Wort fragt nach der Herkunft?"), "___ kommst du?", { kind: "connector", word: "Woher" }));
        fixed.push(listen(P("Listen and type the question.", "Hör zu und schreib die Frage."), {
          kind: "clause", pattern: "w", w: "Wo", lemma: "wohnen", person: "du", rest: [],
        }));
        fixed.push(order(P("Build: Where does she work?", "Bau: Wo arbeitet sie?"), {
          kind: "clause", pattern: "w", w: "Wo", lemma: "arbeiten", person: "sie", rest: [], punct: false,
        }));
        fixed.push(gap(P("Type the question.", "Schreib die Frage."), "___", {
          kind: "clause", pattern: "w", w: "Warum", lemma: "bleiben", person: "du", rest: ["hier"],
        }));
        fixed.push(choice(P("Which word asks for a time?", "Welches Wort fragt nach der Zeit?"), "___ kommt sie?", { kind: "connector", word: "Wann" }));
        fixed.push(choice(P("Which word asks for a person?", "Welches Wort fragt nach einer Person?"), "___ ist das?", { kind: "connector", word: "Wer" }));
        return fixed;
      })();
    })());

    // The rest of the course is attached below by courseUnits().
    courseUnits(G, addUnit, { P, gap, choice, order, listen, spot, xform, artSet, people, things, mix });

    const ids = items.map((it) => it.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) throw new Error("duplicate " + dup[0]);
    const placementIds = pickPlacement(units, items);
    return { units, items, placementIds, masterAt: MASTER_AT, reviewDays: REVIEW_DAYS };
  }

  function pickPlacement(units, items) {
    const want = [];
    const used = new Set();
    function take(unit) {
      const pool = items.filter((it) => it.unitId === unit.id && (it.type === "choice" || it.type === "gap") && !used.has(it.id));
      if (!pool.length) return;
      used.add(pool[0].id);
      want.push(pool[0].id);
    }
    const n = Math.min(20, units.length);
    for (let k = 0; k < n; k++) {
      const i = Math.round(k * (units.length - 1) / Math.max(1, n - 1));
      take(units[i]);
    }
    let cursor = 0;
    while (want.length < 20 && cursor < items.length) {
      const it = items[cursor++];
      if ((it.type === "choice" || it.type === "gap") && !used.has(it.id)) {
        used.add(it.id);
        want.push(it.id);
      }
    }
    return want.slice(0, 20);
  }

  function courseUnits(G, addUnit, H) {
    const { P, gap, choice, order, listen, spot, xform } = H;
    const who = { ich: "ich", du: "du", er: "er", sie: "sie", es: "es", wir: "wir", ihr: "ihr", sie_pl: "sie", Sie: "Sie" };
    function forms(lemmas, persons, tense) {
      const out = [];
      lemmas.forEach((lemma) => persons.forEach((person) => {
        const check = { kind: "verb", lemma, person, tense: tense || "präsens" };
        const prompt = P("Which form of " + lemma + " goes with " + who[person] + "?", "Welche Form von " + lemma + " passt zu " + who[person] + "?");
        const stim = who[person] + " ___";
        out.push(out.length % 3 === 0 ? choice(prompt, stim, check) : gap(prompt, stim, check));
      }));
      return out;
    }
    function L(id, level, en, de, topic, dwTitle, url, be, bd, pe, pd, me, md, ce, cd, examples) {
      return {
        id, level, topic,
        title: P(en, de),
        dw: { title: dwTitle, url },
        blurb: P(be, bd),
        points: P(pe, pd),
        mistakes: P(me, md),
        compare: ce ? P(ce, cd) : null,
        examples: examples || [],
      };
    }
    const ex = (bits) => bits;

    addUnit(L("gender", "A1", "der, die or das", "der, die oder das", "noun gender",
      "Was trinkst du?", "https://learngerman.dw.com/de/was-trinkst-du/l-40378760",
      "Every German noun is masculine (der), feminine (die), or neuter (das). The plural is die for all of them. The ending of the noun does not always tell you the gender, so learn the article with the word. Mädchen means girl and is still das, because the ending -chen makes a noun neuter.",
      "Jedes Nomen ist der, die oder das. Der Plural ist immer die. Mädchen ist das, weil -chen neutral macht.",
      ["der Mann, der Tisch, der Apfel", "die Frau, die Schule, die Lampe", "das Kind, das Buch, das Mädchen", "die Kinder, die Bücher"],
      ["der Mann, der Tisch", "die Frau, die Schule", "das Kind, das Buch", "die Kinder"],
      ["A girl is not automatically die. das Mädchen.", "Plural die does not tell you the singular gender."],
      ["Mädchen ist nicht die. Es ist das.", "die im Plural sagt nichts über den Singular."],
      "Arabic and French have two genders. German has three. Learn der, die or das as part of the noun.",
      "Arabisch und Französisch haben zwei Genera. Deutsch hat drei.",
      [ex([{ t: "der", g: "m" }, { t: "Mann", g: "m" }, { t: "·" }, { t: "die", g: "f" }, { t: "Frau", g: "f" }, { t: "·" }, { t: "das", g: "n" }, { t: "Kind", g: "n" }])]
    ), (function () {
      const rows = [["Mann", "m", "man"], ["Frau", "f", "woman"], ["Kind", "n", "child"], ["Tisch", "m", "table"], ["Schule", "f", "school"], ["Buch", "n", "book"], ["Hund", "m", "dog"], ["Blume", "f", "flower"], ["Auto", "n", "car"], ["Stadt", "f", "city"], ["Apfel", "m", "apple"], ["Mädchen", "n", "girl"], ["Lampe", "f", "lamp"], ["Haus", "n", "house"], ["Lehrer", "m", "teacher"], ["Tür", "f", "door"]];
      const out = [];
      rows.forEach(([de, g, en]) => {
        out.push(choice(P("Which article fits this " + en + "?", "Welcher Artikel passt?"), "___ " + de, { kind: "article", det: "def", gender: g, kase: "nom", noun: de }));
      });
      [["Kinder", "children"], ["Bücher", "books"], ["Frauen", "women"], ["Autos", "cars"]].forEach(([de, en]) => {
        out.push(gap(P("Plural article for " + en + ".", "Artikel im Plural."), "___ " + de + " sind hier.", { kind: "article", det: "def", gender: "pl", kase: "nom", noun: de }));
      });
      out.push(spot(P("Tap the article that does not match.", "Tipp auf den falschen Artikel."), {
        kind: "spot", tokens: ["Das", "Frau", "ist", "hier."], wrongIndex: 0,
        fix: { kind: "article", det: "def", gender: "f", kase: "nom" },
      }));
      out.push(spot(P("Tap the article that does not match.", "Tipp auf den falschen Artikel."), {
        kind: "spot", tokens: ["Die", "Mädchen", "liest."], wrongIndex: 0,
        fix: { kind: "article", det: "def", gender: "n", kase: "nom" },
      }));
      return out;
    })());

    addUnit(L("praet-sein", "A1", "sein in the past", "sein im Präteritum", "Präteritum of sein",
      "Ich war schon in Berlin", "https://learngerman.dw.com/de/ich-war-schon-in-berlin/l-40382809",
      "The past of sein is war. It is the first past tense to learn because you need it for where you were and how you were. ich war, du warst, er war, wir waren, ihr wart, sie waren.",
      "Die Vergangenheit von sein ist war. ich war, du warst, er war, wir waren, ihr wart, sie waren.",
      ["ich war / du warst / er war", "wir waren / ihr wart / Sie waren", "Use it for place and feelings: Ich war müde. Ich war in Berlin."],
      ["ich war, du warst, er war", "wir waren, ihr wart, Sie waren", "Ich war müde. Ich war in Berlin."],
      ["ihr wart is the past. ihr seid is the present.", "du warst still has the -st of du."],
      ["ihr wart ist Vergangenheit. ihr seid ist Präsens.", "du warst hat -st."],
      null, null,
      [ex([{ t: "Ich" }, { t: "war", verb: 1 }, { t: "in", kase: "dat" }, { t: "Berlin." }])]
    ), forms(["sein"], ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"], "praet").concat([
      gap(P("Where was I?", "Wo war ich?"), "Ich ___ in Berlin.", { kind: "verb", lemma: "sein", person: "ich", tense: "praet" }),
      gap(P("du in the past.", "du in der Vergangenheit."), "Du ___ müde.", { kind: "verb", lemma: "sein", person: "du", tense: "praet" }),
      gap(P("wir in the past.", "wir in der Vergangenheit."), "Wir ___ zu Hause.", { kind: "verb", lemma: "sein", person: "wir", tense: "praet" }),
      choice(P("she in the past.", "sie in der Vergangenheit."), "Sie ___ nett.", { kind: "verb", lemma: "sein", person: "sie", tense: "praet" }),
      order(P("Build: Were you at home?", "Bau: Warst du zu Hause?"), { kind: "clause", pattern: "yn", lemma: "sein", person: "du", tense: "praet", rest: ["zu", "Hause"], punct: false }),
      order(P("Build the sentence.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "sein", person: "wir", tense: "praet", rest: ["zu", "Hause"], punct: false }),
      order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "sein", person: "du", tense: "praet", rest: ["müde"], punct: false }),
      xform(P("Put the sentence in the past with war.", "Setze den Satz in die Vergangenheit."),
        { kind: "clause", pattern: "statement", lemma: "sein", person: "ich", rest: ["müde"] },
        { kind: "clause", pattern: "statement", lemma: "sein", person: "ich", tense: "praet", rest: ["müde"] }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "sein", person: "sie", tense: "praet", rest: ["in", "Berlin"] }),
      spot(P("Tap the present-tense form that does not belong in the past.", "Tipp auf die Präsensform."), {
        kind: "spot", tokens: ["Wir", "seid", "gestern", "müde."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "sein", person: "wir", tense: "praet" },
      }),
      gap(P("Formal you, past of sein.", "Sie, Vergangenheit von sein."), "___ Sie gestern da?", { kind: "verb", lemma: "sein", person: "Sie", tense: "praet" }),
      choice(P("ihr in the past.", "ihr in der Vergangenheit."), "Wo ___ ihr?", { kind: "verb", lemma: "sein", person: "ihr", tense: "praet" }),
    ]));

    addUnit(L("verb-second", "A1", "The verb in second place", "Das Verb auf Position 2", "verb-second word order",
      "Wo liegt das?", "https://learngerman.dw.com/de/wo-liegt-das/l-40383952",
      "In a normal German statement the conjugated verb is the second idea, not always the second word after the subject. Heute lerne ich Deutsch. The subject ich steps aside so the verb can stay in slot 2. A yes/no question starts with that verb: Lernst du Deutsch?",
      "Im Aussagesatz steht das konjugierte Verb auf Position 2. Heute lerne ich Deutsch. Eine Ja/Nein-Frage beginnt mit dem Verb.",
      ["Ich lerne heute Deutsch.", "Heute lerne ich Deutsch.", "Lernst du heute Deutsch?"],
      ["Ich lerne heute Deutsch.", "Heute lerne ich Deutsch.", "Lernst du heute Deutsch?"],
      ["Heute ich lerne keeps the English order. The verb must be the second piece.", "A question does not keep the verb at the end."],
      ["Heute ich lerne ist englische Reihenfolge.", "Eine Frage hat das Verb nicht am Ende."],
      "English and French usually keep subject then verb. Arabic does too. German moves the verb into slot 2 whenever something else starts the sentence.",
      "Englisch, Französisch und Arabisch lassen oft das Subjekt vor dem Verb. Deutsch setzt das Verb auf Platz 2.",
      [ex([{ t: "Heute", kase: "nom" }, { t: "lerne", verb: 1 }, { t: "ich" }, { t: "Deutsch." }])]
    ), (function () {
      const rows = [
        ["statement", "spielen", "ich", ["heute", "Fußball"], null],
        ["inv", "spielen", "ich", ["Fußball"], "Heute"],
        ["yn", "spielen", "du", ["Fußball"], null],
        ["inv", "lernen", "ich", ["Deutsch"], "Heute"],
        ["statement", "wohnen", "sie", ["in", "Berlin"], null],
        ["inv", "wohnen", "ich", ["in", "Berlin"], "Jetzt"],
        ["yn", "kommen", "du", ["heute"], null],
        ["inv", "kommen", "sie", [], "Morgen"],
        ["w", "wohnen", "du", [], "Wo"],
        ["statement", "lernen", "wir", ["Deutsch"], null],
        ["inv", "bleiben", "ich", ["zu", "Hause"], "Heute"],
        ["yn", "arbeiten", "Sie", ["heute"], null],
      ];
      const out = [];
      rows.forEach(([pattern, lemma, person, rest, front]) => {
        const check = { kind: "clause", pattern, lemma, person, rest, punct: false };
        if (pattern === "inv") check.front = front;
        if (pattern === "w") check.w = front;
        out.push(order(P("Put the verb in the right slot.", "Setze das Verb an die richtige Stelle."), check));
      });
      out.push(xform(P("Start the sentence with Heute.", "Beginne den Satz mit Heute."),
        { kind: "clause", pattern: "statement", lemma: "lernen", person: "ich", rest: ["Deutsch"] },
        { kind: "clause", pattern: "inv", front: "Heute", lemma: "lernen", person: "ich", rest: ["Deutsch"] }));
      out.push(xform(P("Make a yes/no question.", "Mach eine Ja/Nein-Frage."),
        { kind: "clause", pattern: "statement", lemma: "spielen", person: "du", rest: ["Fußball"] },
        { kind: "clause", pattern: "yn", lemma: "spielen", person: "du", rest: ["Fußball"] }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "inv", front: "Heute", lemma: "bleiben", person: "wir", rest: ["zu", "Hause"] }));
      out.push(spot(P("Tap the verb that does not match ich.", "Tipp auf das Verb, das nicht zu ich passt."), {
        kind: "spot", tokens: ["Heute", "lernst", "ich", "Deutsch."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "lernen", person: "ich", tense: "präsens" },
      }));
      ["Morgen", "Dann", "Hier", "Dort"].forEach((front) => {
        out.push(order(P("Start with " + front + ".", "Beginne mit " + front + "."), {
          kind: "clause", pattern: "inv", front, lemma: "lernen", person: "ich", rest: ["Deutsch"], punct: false,
        }));
      });
      return out;
    })());

    addUnit(L("def-articles", "A1", "the in three cases", "der, die, das in drei Fällen", "definite articles in nominative, accusative and dative",
      "Was ist das?", "https://learngerman.dw.com/de/was-ist-das/l-40393598",
      "The little word the changes with gender and with the job of the noun. Nominative is the subject (Der Mann ist hier). Accusative is the thing you see or buy (Ich sehe den Mann). Dative is the person you help or give something to (Ich helfe dem Mann). Masculine changes the most: der, den, dem.",
      "der wird zum den im Akkusativ und zum dem im Dativ. die bleibt die im Akkusativ und wird der im Dativ. das bleibt das und wird dem im Dativ.",
      ["der Mann / den Mann / dem Mann", "die Frau / die Frau / der Frau", "das Kind / das Kind / dem Kind", "die Kinder / die Kinder / den Kindern"],
      ["der, den, dem Mann", "die, die, der Frau", "das, das, dem Kind", "die, die, den Kindern"],
      ["den is not dative. dem is.", "Plural dative is den, and the noun often adds -n: den Kindern."],
      ["den ist nicht Dativ. dem ist Dativ.", "Im Plural-Dativ: den Kindern."],
      null, null,
      [ex([{ t: "Ich" }, { t: "sehe", verb: 1 }, { t: "den", g: "m", kase: "acc" }, { t: "Mann", g: "m" }, { t: "." }])]
    ), (function () {
      const nouns = ["Mann", "Frau", "Kind", "Tisch", "Schule", "Buch", "Hund", "Auto"].map((d) => G.nounBy(d));
      const out = [];
      const frames = {
        nom: (shown) => "___ " + shown + " ist hier.",
        acc: (shown) => "Ich sehe ___ " + shown + ".",
        dat: (shown) => "Das gehört ___ " + shown + ".",
      };
      const en = { nom: "subject", acc: "the thing I see", dat: "after gehören" };
      ["nom", "acc", "dat"].forEach((kase) => nouns.forEach((noun) => {
        const shown = G.nounShown(noun, kase);
        out.push((out.length % 3 === 0 ? choice : gap)(
          P("Article for the " + en[kase] + " (" + noun.en + ").", "Artikel, " + kase + "."),
          frames[kase](shown),
          { kind: "article", det: "def", gender: noun.g, kase, noun: noun.de }
        ));
      }));
      return out;
    })());

    addUnit(L("indef-articles", "A1", "a and an", "ein und eine", "indefinite articles",
      "Wem gehört das?", "https://learngerman.dw.com/de/wem-gehört-das/l-40393806",
      "ein is a or an. It follows the same three cases, but masculine nominative has no ending: ein Mann, einen Mann, einem Mann. Neuter looks like masculine: ein Kind, ein Kind, einem Kind. Feminine is eine, eine, einer. There is no ein in the plural. Use die or keine.",
      "ein Mann, einen Mann, einem Mann. ein Kind, ein Kind, einem Kind. eine Frau, eine Frau, einer Frau. Im Plural gibt es kein ein.",
      ["ein / einen / einem for masculine", "eine / eine / einer for feminine", "ein / ein / einem for neuter"],
      ["maskulin: ein, einen, einem", "feminin: eine, eine, einer", "neutral: ein, ein, einem"],
      ["einen is accusative, not dative.", "ein Kind stays ein in the accusative. The noun Kind is neuter."],
      ["einen ist Akkusativ.", "ein Kind bleibt ein im Akkusativ."],
      null, null, []), (function () {
      const nouns = ["Mann", "Freund", "Hund", "Frau", "Schule", "Tasche", "Kind", "Buch"].map((d) => G.nounBy(d));
      const out = [];
      const frames = {
        nom: (s) => "___ " + s + " ist neu.",
        acc: (s) => "Ich kaufe ___ " + s + ".",
        dat: (s) => "Das gehört ___ " + s + ".",
      };
      ["nom", "acc", "dat"].forEach((kase) => nouns.forEach((noun) => {
        out.push((out.length % 3 === 0 ? choice : gap)(
          P("a/an, " + noun.en + ", " + kase + ".", "ein, " + kase + "."),
          frames[kase](noun.de),
          { kind: "article", det: "indef", gender: noun.g, kase, noun: noun.de }
        ));
      }));
      return out;
    })());

    addUnit(L("akk-kein", "A1", "Accusative and kein", "Akkusativ und kein", "nominative versus accusative, kein, and accusative prepositions",
      "Ich habe kein …", "https://learngerman.dw.com/de/ich-habe-kein/l-40402575",
      "The accusative is the object of sehen, kaufen, haben and essen. Masculine is the visible change: der becomes den, ein becomes einen. kein means not a and takes those same endings: keinen Mann, keine Frau, kein Kind, keine Bücher. The prepositions durch, für, gegen, ohne and um always take the accusative.",
      "Im Akkusativ wird der zu den und ein zu einen. kein hat dieselben Endungen. durch, für, gegen, ohne und um stehen immer mit dem Akkusativ.",
      ["Ich sehe den Mann.", "Ich habe keinen Apfel.", "Das Geschenk ist für den Mann.", "Ohne den Schlüssel geht es nicht."],
      ["Ich sehe den Mann.", "Ich habe keinen Apfel.", "für den Mann", "ohne den Schlüssel"],
      ["für den, not für dem. für never takes dative.", "kein Buch, not nicht Buch, when a noun is there."],
      ["für steht mit dem Akkusativ: für den.", "Vor einem Nomen steht kein, nicht nicht."],
      null, null,
      [ex([{ t: "für", kase: "acc" }, { t: "den", g: "m", kase: "acc" }, { t: "Mann", g: "m" }])]
    ), (function () {
      const out = [];
      [["Mann", "m"], ["Freund", "m"], ["Apfel", "m"], ["Frau", "f"], ["Tasche", "f"], ["Kind", "n"], ["Buch", "n"], ["Auto", "n"]].forEach(([de, g]) => {
        out.push(gap(P("I do not have a " + de + ".", "Ich habe kein …"), "Ich habe ___ " + de + ".", { kind: "article", det: "kein", gender: g, kase: "acc", noun: de }));
      });
      [["für", "Mann", "m"], ["für", "Frau", "f"], ["für", "Kind", "n"], ["ohne", "Schlüssel", "m"], ["ohne", "Tasche", "f"], ["durch", "Park", "m"], ["gegen", "Tisch", "m"], ["um", "Haus", "n"]].forEach(([prep, de, g]) => {
        const noun = de === "Schlüssel" ? { de: "Schlüssel", g: "m" } : G.nounBy(de);
        out.push(choice(P(prep + " needs which article?", prep + " – welcher Artikel?"), prep + " ___ " + noun.de, { kind: "prepArticle", prep, gender: g, kase: "acc", noun: noun.de }));
      });
      out.push(spot(P("Tap the article that does not match für.", "Tipp auf den Artikel, der nicht zu für passt."), {
        kind: "spot", tokens: ["Das", "ist", "für", "dem", "Mann."], wrongIndex: 3,
        fix: { kind: "article", det: "def", gender: "m", kase: "acc", prep: "für" },
      }));
      out.push(gap(P("Nominative or accusative? The man is the subject.", "Subjekt oder Objekt?"), "___ Mann liest.", { kind: "article", det: "def", gender: "m", kase: "nom", noun: "Mann" }));
      out.push(gap(P("Nominative or accusative? I see the man.", "Subjekt oder Objekt?"), "Ich sehe ___ Mann.", { kind: "article", det: "def", gender: "m", kase: "acc", noun: "Mann" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Ich habe", { kind: "article", det: "kein", gender: "m", kase: "acc" }, "Apfel."] }));
      return out;
    })());

    addUnit(L("nicht", "A1", "nicht and kein", "nicht und kein", "negation",
      "Meine Wohnung", "https://learngerman.dw.com/de/meine-wohnung/l-40401371",
      "kein replaces a or the in front of a noun: Ich habe keinen Hund. nicht negates the verb, an adjective, or a whole phrase: Ich arbeite nicht. Das ist nicht neu. Ich gehe nicht nach Hause. If you can put a or the in front of the word, you usually want kein instead of nicht.",
      "kein steht vor einem Nomen: Ich habe keinen Hund. nicht steht beim Verb oder Adjektiv: Ich arbeite nicht. Das ist nicht neu.",
      ["Ich habe keinen Hund.", "Ich arbeite nicht.", "Das ist nicht rot.", "Sie kommt nicht aus Berlin."],
      ["keinen Hund", "arbeite nicht", "nicht rot", "kommt nicht"],
      ["Ich habe nicht Hund is missing the article ending. Ich habe keinen Hund.", "nicht ein Buch is stiff. Say kein Buch."],
      ["Nicht: Ich habe nicht Hund. Sondern: keinen Hund.", "Besser kein Buch als nicht ein Buch."],
      "French uses ne…pas, and pas de in front of a noun. kein is the pas de piece. Arabic ma / laysa does not mark the noun the way kein does.",
      "kein ist wie französisch pas de vor einem Nomen.",
      [ex([{ t: "Ich" }, { t: "habe", verb: 1 }, { t: "keinen", g: "m", kase: "acc" }, { t: "Hund." }])]
    ), (function () {
      const out = [];
      ["Ich arbeite ___.", "Er schläft ___.", "Sie kommt ___.", "Wir spielen ___.", "Sie wohnen ___ hier.", "Das ist ___ neu.", "Ich lerne heute ___.", "Er bleibt ___ zu Hause."].forEach((stim) => {
        out.push(gap(P("Negate the verb or the adjective.", "Verneine."), stim, { kind: "connector", word: "nicht" }));
      });
      [["Hund", "m", "acc"], ["Tasche", "f", "acc"], ["Auto", "n", "acc"], ["Zeit", "f", "acc"], ["Buch", "n", "nom"], ["Schule", "f", "nom"]].forEach(([de, g, kase]) => {
        const stim = kase === "nom" ? "Das ist ___ " + de + "." : "Ich habe ___ " + de + ".";
        out.push(choice(P("kein or a form of it, not nicht.", "kein, nicht nicht."), stim, { kind: "article", det: "kein", gender: g, kase, noun: de }));
      });
      out.push(spot(P("Tap the word that cannot negate a noun by itself.", "Tipp auf das Wort, das hier nicht passt."), {
        kind: "spot", tokens: ["Ich", "habe", "nicht", "Hund."], wrongIndex: 2,
        fix: { kind: "article", det: "kein", gender: "m", kase: "acc", noun: "Hund" },
      }));
      out.push(order(P("Build the negative sentence.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "kommen", person: "ich", rest: ["nicht"], punct: false }));
      out.push(order(P("Build the negative sentence.", "Bau den Satz."), { kind: "tokens", tokens: ["Das", "ist", "nicht", "rot"], finite: "ist", finiteIndex: 1, whyEn: "nicht comes before the adjective.", whyDe: "nicht steht vor dem Adjektiv." }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "arbeiten", person: "ich", rest: ["nicht"] }));
      out.push(gap(P("Negate the adjective.", "Verneine das Adjektiv."), "Der Film ist ___ lang.", { kind: "connector", word: "nicht" }));
      out.push(choice(P("Noun or verb? Pick the negator.", "Nomen oder Verb?"), "Ich habe ___ Zeit.", { kind: "article", det: "kein", gender: "f", kase: "acc", noun: "Zeit" }));
      out.push(xform(P("Negate the sentence with nicht.", "Verneine den Satz mit nicht."),
        { kind: "clause", pattern: "statement", lemma: "schlafen", person: "ich", rest: [] },
        { kind: "clause", pattern: "statement", lemma: "schlafen", person: "ich", rest: ["nicht"] }));
      return out;
    })());
    addUnit(L("possessives", "A1", "my, your, our", "mein, dein, unser", "possessive articles",
      "Unser Haus", "https://learngerman.dw.com/de/unser-haus/l-40471950",
      "mein, dein, sein, ihr, unser, euer and Ihr take the same endings as ein. mein Mann, meinen Mann, meinem Mann. Feminine is meine. euer drops the middle e when an ending appears: euer Freund, but euren Freund. Formal Ihr keeps the capital.",
      "mein, dein, sein, ihr, unser, euer und Ihr haben die Endungen von ein. euer verliert das e vor der Endung: euren. Ihr bleibt groß.",
      ["mein Freund / meinen Freund / meinem Freund", "meine Tasche / meine Tasche / meiner Tasche", "euer Freund, but euren Freund", "Ihr Name with a capital"],
      ["mein, meinen, meinem", "meine, meine, meiner", "euer, aber euren", "Ihr groß"],
      ["sein is his or its. ihr is her, or their.", "euer Freund is nominative. The accusative is euren Freund."],
      ["sein = sein. ihr = ihr oder their.", "Akkusativ: euren Freund."],
      null, null, []), (function () {
      const owners = ["ich", "du", "er", "sie", "wir", "ihr", "Sie"];
      const rows = [["Freund", "m"], ["Tasche", "f"], ["Buch", "n"]];
      const out = [];
      owners.forEach((owner) => rows.forEach(([de, g]) => {
        ["nom", "acc"].forEach((kase) => {
          const stim = kase === "nom" ? "___ " + de + " ist neu." : "Ich sehe ___ " + de + ".";
          out.push((out.length % 3 === 0 ? choice : gap)(P("Possessive for " + owner + ".", "Possessivartikel."), stim, { kind: "poss", owner, gender: g, kase }));
        });
      }));
      return out;
    })());

    addUnit(L("separable", "A1", "Separable verbs", "Trennbare Verben", "separable prefixes",
      "Tageszeiten", "https://learngerman.dw.com/de/tageszeiten/l-40406333",
      "In a main sentence the prefix of aufstehen, einkaufen, anrufen or mitkommen goes to the end. Ich stehe um sieben auf. In a weil clause the prefix sticks back on and the whole verb goes to the end: weil ich um sieben aufstehe. The participle keeps the prefix: aufgestanden, eingekauft.",
      "Im Hauptsatz steht das Präfix am Ende: Ich stehe auf. Im weil-Satz bleibt es dran: weil ich aufstehe.",
      ["Ich stehe früh auf.", "Stehst du früh auf?", "weil ich früh aufstehe", "Ich habe eingekauft. Ich bin aufgestanden."],
      ["Ich stehe früh auf.", "Stehst du früh auf?", "weil ich früh aufstehe", "eingekauft / aufgestanden"],
      ["weil ich stehe auf leaves the verb in the middle.", "The participle is aufgestanden, not geaufstanden."],
      ["Nicht: weil ich stehe auf.", "Nicht geaufstanden, sondern aufgestanden."],
      null, null,
      [ex([{ t: "Ich" }, { t: "stehe", verb: 1 }, { t: "früh" }, { t: "auf", verb: 1 }, { t: "." }])]), (function () {
      const out = [];
      [["aufstehen", "ich", ["früh"], "statement"], ["aufstehen", "du", ["früh"], "yn"], ["einkaufen", "ich", ["heute"], "statement"], ["anrufen", "sie", ["später"], "statement"], ["mitkommen", "du", ["heute"], "yn"], ["fernsehen", "wir", ["heute"], "statement"], ["aufmachen", "du", ["das", "Fenster"], "statement"]].forEach(([lemma, person, rest, pattern]) => {
        out.push(order(P("Put the prefix in the right place.", "Setze das Präfix richtig."), { kind: "clause", pattern, lemma, person, rest, punct: false }));
      });
      [["aufstehen", "ich", ["früh"]], ["einkaufen", "wir", ["heute"]], ["anrufen", "du", ["mich"]], ["mitkommen", "sie", ["heute"]], ["fernsehen", "er", ["heute"]], ["aufmachen", "ich", ["die", "Tür"]]].forEach(([lemma, person, rest]) => {
        out.push(xform(P("Move it into a weil clause.", "Mach einen weil-Satz."),
          { kind: "clause", pattern: "statement", lemma, person, rest },
          { kind: "clause", pattern: "sub", conj: "weil", lemma, person, rest }));
      });
      out.push(gap(P("Type the participle.", "Schreib das Partizip."), "Ich bin früh ___.", { kind: "verb", lemma: "aufstehen", partOnly: true }));
      out.push(gap(P("Type the participle.", "Schreib das Partizip."), "Ich habe heute ___.", { kind: "verb", lemma: "einkaufen", partOnly: true }));
      out.push(order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "anrufen", person: "du", rest: ["mich"], punct: false }));
      out.push(order(P("Build the sentence.", "Bau den Satz."), { kind: "clause", pattern: "inv", front: "Heute", lemma: "aufstehen", person: "ich", rest: [], punct: false }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "einkaufen", person: "ich", rest: ["heute"] }));
      out.push(spot(P("Tap the verb that split inside a weil clause.", "Tipp auf das Verb, das im weil-Satz getrennt ist."), {
        kind: "spot", tokens: ["weil", "ich", "stehe", "früh", "auf"], wrongIndex: 2,
        fix: { kind: "clause", pattern: "sub", conj: "weil", lemma: "aufstehen", person: "ich", rest: ["früh"], punct: false },
      }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "fernsehen", person: "ich", rest: ["heute"], punct: false }));
      return out;
    })());

    addUnit(L("koennen", "A1", "können", "können", "modal verb können",
      "Wann spielen wir?", "https://learngerman.dw.com/de/wann-spielen-wir/l-40446324",
      "können means can or be able to. ich kann, du kannst, er kann, wir können, ihr könnt, Sie können. The second verb is a plain infinitive at the end: Ich kann heute schwimmen. In a weil clause, kann itself goes to the end: weil ich heute schwimmen kann.",
      "ich kann, du kannst, er kann, wir können, ihr könnt. Der Infinitiv steht am Ende: Ich kann schwimmen. Im weil-Satz: weil ich schwimmen kann.",
      ["Ich kann Deutsch sprechen.", "Kannst du morgen kommen?", "weil wir heute spielen können"],
      ["Ich kann Deutsch sprechen.", "Kannst du kommen?", "weil wir spielen können"],
      ["ich kanne does not exist. ich kann.", "Du kannst sprechen, not du kannst sprichst. Only one conjugated verb."],
      ["ich kann, nicht kanne.", "Nur ein konjugiertes Verb."],
      null, null, []), forms(["können"], ["ich", "du", "er", "wir", "ihr", "Sie"], "präsens").concat([
      order(P("Build the sentence.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "können", person: "ich", rest: ["heute", "schwimmen"], punct: false }),
      order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "können", person: "du", rest: ["morgen", "kommen"], punct: false }),
      order(P("Build the weil clause.", "Bau den weil-Satz."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "können", person: "wir", rest: ["heute", "spielen"], punct: false }),
      xform(P("Put the sentence into a weil clause.", "Mach einen weil-Satz."),
        { kind: "clause", pattern: "statement", lemma: "können", person: "ich", rest: ["Deutsch", "sprechen"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "können", person: "ich", rest: ["Deutsch", "sprechen"] }),
      gap(P("Type the form.", "Schreib die Form."), "Ihr ___ gut kochen.", { kind: "verb", lemma: "können", person: "ihr", tense: "präsens" }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "können", person: "sie", rest: ["Klavier", "spielen"] }),
      spot(P("Tap the second conjugated verb.", "Tipp auf das zweite konjugierte Verb."), {
        kind: "spot", tokens: ["Ich", "kann", "heute", "schwimme"], wrongIndex: 3,
        fix: { kind: "connector", word: "schwimmen" },
      }),
      gap(P("wir form.", "wir."), "Wir ___ morgen kommen.", { kind: "verb", lemma: "können", person: "wir", tense: "präsens" }),
      gap(P("du form.", "du."), "Du ___ gut kochen.", { kind: "verb", lemma: "können", person: "du", tense: "präsens" }),
      choice(P("Sie form.", "Sie."), "Sie ___ Deutsch sprechen.", { kind: "verb", lemma: "können", person: "Sie", tense: "präsens" }),
      order(P("Question with wo.", "Frage mit Wo."), { kind: "clause", pattern: "w", w: "Wo", lemma: "können", person: "du", rest: ["arbeiten"], punct: false }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "können", person: "ihr", rest: ["heute", "bleiben"], punct: false }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "yn", lemma: "können", person: "Sie", rest: ["morgen", "kommen"] }),
      gap(P("she form.", "sie."), "Sie ___ gut singen.", { kind: "verb", lemma: "können", person: "sie", tense: "präsens" }),
    ]));

    addUnit(L("praet-haben", "A1", "haben in the past", "haben im Präteritum", "Präteritum of haben",
      "Zu spät!?", "https://learngerman.dw.com/de/zu-spät/l-40445447",
      "The past of haben is hatte. ich hatte, du hattest, er hatte, wir hatten, ihr hattet, Sie hatten. Use it for what you had or had to deal with yesterday: Ich hatte gestern Zeit. Ich hatte keine Zeit.",
      "ich hatte, du hattest, er hatte, wir hatten, ihr hattet, Sie hatten.",
      ["ich hatte Zeit.", "du hattest keine Zeit.", "wir hatten Glück."],
      ["ich hatte", "du hattest", "wir hatten"],
      ["ihr hattet is the past. ihr habt is the present.", "hatte is not the participle. The participle is gehabt."],
      ["ihr hattet ist Vergangenheit.", "Das Partizip ist gehabt."],
      null, null, []), forms(["haben"], ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"], "praet").concat([
      order(P("Build the sentence.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "haben", person: "ich", tense: "praet", rest: ["Zeit"], punct: false }),
      order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "haben", person: "du", tense: "praet", rest: ["Zeit"], punct: false }),
      xform(P("Put haben into the past.", "Setze haben in die Vergangenheit."),
        { kind: "clause", pattern: "statement", lemma: "haben", person: "wir", rest: ["Glück"] },
        { kind: "clause", pattern: "statement", lemma: "haben", person: "wir", tense: "praet", rest: ["Glück"] }),
      gap(P("Type the past form.", "Schreib die Vergangenheitsform."), "Ihr ___ gestern Zeit.", { kind: "verb", lemma: "haben", person: "ihr", tense: "praet" }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "haben", person: "sie", tense: "praet", rest: ["keine", "Zeit"] }),
      spot(P("Tap the present form.", "Tipp auf die Präsensform."), {
        kind: "spot", tokens: ["Ich", "habe", "gestern", "Zeit."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "haben", person: "ich", tense: "praet" },
      }),
      gap(P("du, past.", "du, Vergangenheit."), "Du ___ keine Zeit.", { kind: "verb", lemma: "haben", person: "du", tense: "praet" }),
      gap(P("Sie, past.", "Sie, Vergangenheit."), "Sie ___ Glück.", { kind: "verb", lemma: "haben", person: "Sie", tense: "praet" }),
      choice(P("er, past.", "er, Vergangenheit."), "Er ___ ein Problem.", { kind: "verb", lemma: "haben", person: "er", tense: "praet" }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "inv", front: "Gestern", lemma: "haben", person: "ich", tense: "praet", rest: ["Zeit"], punct: false }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "haben", person: "wir", tense: "praet", rest: ["Zeit"] }),
      gap(P("es, past.", "es, Vergangenheit."), "Es ___ ein Ende.", { kind: "verb", lemma: "haben", person: "es", tense: "praet" }),
    ]));

    addUnit(L("modals", "A1", "must, want, should, like", "müssen, wollen, sollen, mögen", "modal verbs",
      "Mein Beruf", "https://learngerman.dw.com/de/mein-beruf/l-40449209",
      "Modal verbs pair with an infinitive at the end. müssen is must, wollen is want, sollen is should or supposed to, mögen is like. ich muss, du musst, er muss, wir müssen. ich will, du willst. ich soll, du sollst. ich mag, du magst. möchte is the softer would like: ich möchte.",
      "müssen = müssen, wollen = wollen, sollen = sollen, mögen = mögen. Der Infinitiv steht am Ende. möchte ist die höfliche Form.",
      ["Ich muss heute arbeiten.", "Willst du mitkommen?", "Du sollst pünktlich sein.", "Ich möchte einen Kaffee."],
      ["Ich muss arbeiten.", "Willst du mitkommen?", "Du sollst pünktlich sein.", "Ich möchte einen Kaffee."],
      ["ich musse does not exist. ich muss.", "möchte is not the plain present. The plain present is mag."],
      ["ich muss, nicht musse.", "Präsens: mag. Höflich: möchte."],
      null, null, []), (function () {
      const out = forms(["müssen", "wollen", "sollen"], ["ich", "du", "er", "wir"], "präsens");
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "müssen", person: "ich", rest: ["heute", "arbeiten"], punct: false }));
      out.push(order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "wollen", person: "du", rest: ["mitkommen"], punct: false }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "sollen", person: "du", rest: ["pünktlich", "sein"], punct: false }));
      out.push(gap(P("would like, ich.", "möchte."), "Ich ___ einen Kaffee.", { kind: "verb", lemma: "mögen", person: "ich", tense: "konj2" }));
      out.push(gap(P("would like, du.", "möchtest."), "___ du Wasser?", { kind: "verb", lemma: "mögen", person: "du", tense: "konj2" }));
      out.push(choice(P("Plain present of mögen, ich.", "Präsens von mögen."), "Ich ___ Musik.", { kind: "verb", lemma: "mögen", person: "ich", tense: "präsens" }));
      out.push(xform(P("Make a weil clause.", "Mach einen weil-Satz."),
        { kind: "clause", pattern: "statement", lemma: "müssen", person: "ich", rest: ["arbeiten"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "müssen", person: "ich", rest: ["arbeiten"] }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "wollen", person: "wir", rest: ["Deutsch", "lernen"] }));
      return out;
    })());

    addUnit(L("dative", "A1", "The dative", "Der Dativ", "dative articles",
      "Wo ist der Aufzug?", "https://learngerman.dw.com/de/wo-ist-der-aufzug/l-40458805",
      "The dative is the person you help, give to, or who owns something after gehören. Masculine and neuter use dem. Feminine uses der. Plural uses den, and the noun usually adds -n: den Kindern, den Freunden. helfen, danken, gehören and gefallen take the dative.",
      "Maskulin und neutral: dem. Feminin: der. Plural: den Kindern. helfen, danken und gehören stehen mit dem Dativ.",
      ["Ich helfe dem Mann.", "Ich helfe der Frau.", "Ich helfe dem Kind.", "Ich helfe den Kindern."],
      ["dem Mann", "der Frau", "dem Kind", "den Kindern"],
      ["Ich helfe den Mann uses the accusative. helfen wants dem.", "der Frau can be dative feminine. It is not the masculine nominative."],
      ["helfen steht mit dem, nicht mit den.", "der Frau kann Dativ feminin sein."],
      null, null,
      [ex([{ t: "Ich" }, { t: "helfe", verb: 1 }, { t: "dem", g: "m", kase: "dat" }, { t: "Mann", g: "m" }, { t: "." }])]), (function () {
      const out = [];
      [["Mann", "m", "Mann"], ["Freund", "m", "Freund"], ["Frau", "f", "Frau"], ["Freundin", "f", "Freundin"], ["Kind", "n", "Kind"], ["Lehrer", "m", "Lehrer"]].forEach(([de, g]) => {
        out.push(gap(P("helfen + dative.", "helfen + Dativ."), "Ich helfe ___ " + de + ".", { kind: "article", det: "def", gender: g, kase: "dat", noun: de }));
        out.push(choice(P("gehören + dative.", "gehören + Dativ."), "Das gehört ___ " + de + ".", { kind: "article", det: "def", gender: g, kase: "dat", noun: de }));
      });
      [["Kindern", "pl"], ["Freunden", "pl"], ["Frauen", "pl"]].forEach(([shown]) => {
        out.push(gap(P("Plural dative.", "Dativ Plural."), "Ich helfe ___ " + shown + ".", { kind: "article", det: "def", gender: "pl", kase: "dat" }));
      });
      out.push(spot(P("Tap the accusative article after helfen.", "Tipp auf den Akkusativ nach helfen."), {
        kind: "spot", tokens: ["Ich", "helfe", "den", "Mann."], wrongIndex: 2,
        fix: { kind: "article", det: "def", gender: "m", kase: "dat", prep: "helfen" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Ich helfe", { kind: "article", det: "def", gender: "f", kase: "dat" }, "Frau."] }));
      out.push(gap(P("danken takes the dative.", "danken steht mit dem Dativ."), "Ich danke ___ Frau.", { kind: "article", det: "def", gender: "f", kase: "dat", prep: "danken" }));
      out.push(gap(P("danken, masculine.", "danken, maskulin."), "Ich danke ___ Mann.", { kind: "article", det: "def", gender: "m", kase: "dat", prep: "danken" }));
      out.push(choice(P("ein-word dative.", "ein im Dativ."), "Ich helfe ___ Kind.", { kind: "article", det: "indef", gender: "n", kase: "dat" }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "tokens", tokens: ["Ich", "helfe", "dem", "Mann"], finite: "helfe", finiteIndex: 1, whyEn: "helfen takes the dative: dem.", whyDe: "helfen steht mit dem Dativ: dem." }));
      return out;
    })());

    addUnit(L("prep-dat", "A1", "Dative prepositions", "Präpositionen mit Dativ", "aus, bei, mit, nach, seit, von, zu",
      "Mit Bus und Bahn", "https://learngerman.dw.com/de/mit-bus-und-bahn/l-40461864",
      "These prepositions always take the dative: aus, bei, mit, nach, seit, von, zu. mit dem Bus, aus der Stadt, bei der Freundin, nach dem Kurs, von dem Lehrer, zu der Schule. zu dem shrinks to zum, and zu der shrinks to zur. You can write either.",
      "aus, bei, mit, nach, seit, von und zu stehen immer mit dem Dativ. zu dem = zum, zu der = zur.",
      ["mit dem Bus", "aus der Stadt", "bei der Freundin", "zum Arzt = zu dem Arzt"],
      ["mit dem Bus", "aus der Stadt", "bei der Freundin", "zum = zu dem"],
      ["mit den Mann is accusative. mit dem Mann.", "nach is dative even when it means to a city: nach Berlin has no article."],
      ["mit steht mit dem Dativ: mit dem.", "nach Berlin ohne Artikel."],
      "French au and du are contractions too. zum and zur work the same way: the preposition swallows the article.",
      "zum und zur sind Zusammenziehungen, ähnlich wie au und du.",
      [ex([{ t: "mit", kase: "dat" }, { t: "dem", g: "m", kase: "dat" }, { t: "Bus" }])]), (function () {
      const out = [];
      [["mit", "Bus", "m"], ["mit", "Freundin", "f"], ["mit", "Auto", "n"], ["aus", "Stadt", "f"], ["aus", "Haus", "n"], ["bei", "Freundin", "f"], ["bei", "Arzt", "m"], ["nach", "Kurs", "m"], ["seit", "Woche", "f"], ["von", "Lehrer", "m"], ["von", "Freundin", "f"], ["zu", "Schule", "f"], ["zu", "Arzt", "m"], ["zu", "Bahnhof", "m"]].forEach(([prep, de, g]) => {
        out.push((out.length % 2 === 0 ? choice : gap)(P(prep + " + dative.", prep + " + Dativ."), prep + " ___ " + de, { kind: "prepArticle", prep, gender: g, kase: "dat" }));
      });
      out.push(gap(P("Type the full phrase. zum is also fine.", "Schreib die Wendung. zum geht auch."), "Ich gehe ___ Arzt.", { kind: "compose", bits: ["zu", { kind: "prepArticle", prep: "zu", gender: "m", kase: "dat" }] }));
      out.push(gap(P("Type the full phrase. zur is also fine.", "Schreib die Wendung. zur geht auch."), "Ich gehe ___ Schule.", { kind: "compose", bits: ["zu", { kind: "prepArticle", prep: "zu", gender: "f", kase: "dat" }] }));
      out.push(spot(P("Tap the accusative after mit.", "Tipp auf den Akkusativ nach mit."), {
        kind: "spot", tokens: ["Ich", "fahre", "mit", "den", "Bus."], wrongIndex: 3,
        fix: { kind: "article", det: "def", gender: "m", kase: "dat", prep: "mit" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Ich fahre mit", { kind: "article", det: "def", gender: "m", kase: "dat", prep: "mit" }, "Bus."] }));
      out.push(order(P("Build the sentence.", "Bau den Satz."), { kind: "tokens", tokens: ["Ich", "komme", "aus", "der", "Stadt"], finite: "komme", finiteIndex: 1, whyEn: "aus takes der for a feminine noun.", whyDe: "aus steht mit der bei einem femininen Nomen." }));
      out.push(gap(P("seit + dative.", "seit + Dativ."), "seit ___ Woche", { kind: "prepArticle", prep: "seit", gender: "f", kase: "dat" }));
      out.push(choice(P("bei + dative.", "bei + Dativ."), "bei ___ Freund", { kind: "prepArticle", prep: "bei", gender: "m", kase: "dat" }));
      return out;
    })());
    addUnit(L("two-way", "A1", "Two-way prepositions", "Wechselpräpositionen", "wo dative, wohin accusative",
      "Im Büro", "https://learngerman.dw.com/de/im-büro/l-40463291",
      "an, auf, hinter, in, neben, über, unter, vor and zwischen take the dative for a place (wo?) and the accusative for a direction (wohin?). Das Buch ist auf dem Tisch. Ich lege das Buch auf den Tisch. in dem shrinks to im, in das shrinks to ins.",
      "Wo? Dativ: auf dem Tisch. Wohin? Akkusativ: auf den Tisch. in dem = im, in das = ins.",
      ["Wo? in dem Büro / im Büro", "Wohin? in das Büro / ins Büro", "auf dem Tisch / auf den Tisch", "an der Wand / an die Wand"],
      ["Wo: in dem Büro", "Wohin: in das Büro", "auf dem / auf den", "an der / an die"],
      ["in den Büro mixes a masculine article with a neuter noun. Büro is das.", "Direction is not always accusative with nach or zu. Those two are always dative."],
      ["Büro ist das.", "nach und zu bleiben Dativ."],
      null, null,
      [ex([{ t: "auf", kase: "dat" }, { t: "dem", g: "m", kase: "dat" }, { t: "Tisch" }, { t: "·" }, { t: "auf", kase: "acc" }, { t: "den", g: "m", kase: "acc" }, { t: "Tisch" }])]), (function () {
      const pairs = [
        ["in", "wo", "n", "Büro", "dat"], ["in", "wohin", "n", "Büro", "acc"],
        ["auf", "wo", "m", "Tisch", "dat"], ["auf", "wohin", "m", "Tisch", "acc"],
        ["an", "wo", "f", "Wand", "dat"], ["an", "wohin", "f", "Wand", "acc"],
        ["neben", "wo", "n", "Haus", "dat"], ["neben", "wohin", "n", "Haus", "acc"],
        ["über", "wo", "m", "Tisch", "dat"], ["über", "wohin", "m", "Tisch", "acc"],
        ["unter", "wo", "m", "Stuhl", "dat"], ["unter", "wohin", "m", "Stuhl", "acc"],
        ["vor", "wo", "f", "Tür", "dat"], ["vor", "wohin", "f", "Tür", "acc"],
        ["in", "wo", "f", "Stadt", "dat"], ["in", "wohin", "f", "Stadt", "acc"],
        ["in", "wo", "n", "Haus", "dat"], ["in", "wohin", "n", "Haus", "acc"],
        ["auf", "wo", "f", "Lampe", "dat"], ["auf", "wohin", "f", "Lampe", "acc"],
      ];
      const out = [];
      pairs.forEach(([prep, where, g, de, kase], i) => {
        const hint = where === "wo" ? "place (wo)" : "direction (wohin)";
        out.push((i % 2 === 0 ? choice : gap)(P(prep + ", " + hint + ".", prep + ", " + (where === "wo" ? "Wo?" : "Wohin?")), prep + " ___ " + de, { kind: "prepArticle", prep, where, gender: g, kase }));
      });
      out.push(gap(P("im or in dem.", "im oder in dem."), "Ich bin ___ Büro.", { kind: "compose", bits: ["in", { kind: "prepArticle", prep: "in", where: "wo", gender: "n", kase: "dat" }] }));
      out.push(gap(P("ins or in das.", "ins oder in das."), "Ich gehe ___ Büro.", { kind: "compose", bits: ["in", { kind: "prepArticle", prep: "in", where: "wohin", gender: "n", kase: "acc" }] }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Das Buch ist auf", { kind: "prepArticle", prep: "auf", where: "wo", gender: "m", kase: "dat" }, "Tisch."] }));
      out.push(spot(P("Tap the article that marks a direction in a place sentence.", "Tipp auf den Artikel, der hier eine Richtung markiert."), {
        kind: "spot", tokens: ["Das", "Buch", "ist", "auf", "den", "Tisch."], wrongIndex: 4,
        fix: { kind: "prepArticle", prep: "auf", where: "wo", gender: "m", kase: "dat" },
      }));
      return out;
    })());

    addUnit(L("comparative", "A1", "Comparative and superlative", "Komparativ und Superlativ", "comparison",
      "Ich mag (nicht)!", "https://learngerman.dw.com/de/ich-mag-nicht/l-40465223",
      "The comparative adds -er, often with an umlaut: alt, älter. The superlative with am is am + -sten: am ältesten. A few are irregular and must be memorised: gut, besser, am besten. gern, lieber, am liebsten. viel, mehr, am meisten. Use als after a comparative: größer als.",
      "Komparativ -er, oft mit Umlaut. Superlativ mit am …sten. Unregelmäßig: gut, besser, am besten. gern, lieber, am liebsten. viel, mehr, am meisten.",
      ["klein, kleiner, am kleinsten", "gut, besser, am besten", "gern, lieber, am liebsten", "hoch, höher, am höchsten"],
      ["kleiner, am kleinsten", "besser, am besten", "lieber, am liebsten", "höher, am höchsten"],
      ["am bestensten doubles the ending.", "mehr, not vieler, is the comparative of viel."],
      ["Nicht am bestensten.", "viel → mehr, nicht vieler."],
      null, null, []), (function () {
      const out = [];
      ["teuer", "dunkel", "gut", "gern", "viel", "hoch"].forEach((lemma) => {
        out.push(choice(P("Comparative of " + lemma + ".", "Komparativ von " + lemma + "."), "___", { kind: "compare", lemma, degree: "comp" }));
      });
      Object.keys(G.COMPARE).forEach((lemma) => {
        ["comp", "sup"].forEach((degree) => {
          out.push((out.length % 3 === 0 ? choice : gap)(
            P((degree === "comp" ? "Comparative" : "Superlative") + " of " + lemma + ".", (degree === "comp" ? "Komparativ" : "Superlativ") + " von " + lemma + "."),
            "___",
            { kind: "compare", lemma, degree }
          ));
        });
      });
      return out;
    })());

    addUnit(L("perfekt-haben", "A1", "Perfekt with haben", "Perfekt mit haben", "Perfekt auxiliary haben and the participle",
      "Wie war dein Urlaub?", "https://learngerman.dw.com/de/wie-war-dein-urlaub/l-40481449",
      "Most verbs make the past you use in speech with haben plus a participle at the end. Regular participles look like ge + stem + t: gespielt, gekauft, gemacht. Stems in -t or -d add -et: gearbeitet. The participle of a separable verb keeps the prefix: eingekauft. In a weil clause, habe goes to the very end.",
      "Die meisten Verben bilden das Perfekt mit haben und dem Partizip am Ende: gespielt, gemacht, gearbeitet, eingekauft. Im weil-Satz steht habe ganz am Ende.",
      ["Ich habe Fußball gespielt.", "Ich habe gearbeitet.", "Ich habe eingekauft.", "weil ich Fußball gespielt habe"],
      ["gespielt", "gearbeitet", "eingekauft", "weil … gespielt habe"],
      ["Ich habe gehen is not the participle. Ich bin gegangen uses sein, and the participle is gegangen.", "The participle does not take a personal ending."],
      ["gehen benutzt sein: Ich bin gegangen.", "Das Partizip hat keine Personalendung."],
      "French passé composé with avoir is the same idea: a helper plus a participle. German haben is that avoir.",
      "Wie das französische passé composé mit avoir.",
      [ex([{ t: "Ich" }, { t: "habe", verb: 1 }, { t: "Fußball" }, { t: "gespielt", verb: 1 }, { t: "." }])]), (function () {
      const lemmas = ["spielen", "machen", "kaufen", "arbeiten", "hören", "kochen", "fragen", "lernen"];
      const out = [];
      lemmas.forEach((lemma) => {
        out.push(xform(P("Write the Perfekt.", "Schreib das Perfekt."),
          { kind: "clause", pattern: "statement", lemma, person: "ich", rest: [] },
          { kind: "clause", pattern: "statement", lemma, person: "ich", tense: "perfekt", rest: [] }));
        out.push(gap(P("Participle of " + lemma + ".", "Partizip von " + lemma + "."), "Ich habe ___.", { kind: "verb", lemma, partOnly: true }));
      });
      out.push(xform(P("Put the Perfekt into a weil clause.", "Mach einen weil-Satz im Perfekt."),
        { kind: "clause", pattern: "statement", lemma: "spielen", person: "ich", tense: "perfekt", rest: ["Fußball"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "spielen", person: "ich", tense: "perfekt", rest: ["Fußball"] }));
      out.push(order(P("Build the Perfekt.", "Bau das Perfekt."), { kind: "clause", pattern: "statement", lemma: "einkaufen", person: "ich", tense: "perfekt", rest: ["heute"], punct: false }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "kochen", person: "wir", tense: "perfekt", rest: ["heute"] }));
      out.push(spot(P("Tap the infinitive that should be a participle.", "Tipp auf den Infinitiv."), {
        kind: "spot", tokens: ["Ich", "habe", "gestern", "spielen"], wrongIndex: 3,
        fix: { kind: "verb", lemma: "spielen", partOnly: true },
      }));
      return out;
    })());

    addUnit(L("perfekt-sein", "A1", "Perfekt with sein", "Perfekt mit sein", "sein as the Perfekt auxiliary",
      "Der Ausflug", "https://learngerman.dw.com/de/der-ausflug/l-40481556",
      "Verbs of movement and change, and bleiben and sein itself, take sein. Ich bin gegangen. Ich bin gekommen. Ich bin gefahren. Ich bin geblieben. Ich bin aufgestanden. Ich bin gewesen. The participle still goes to the end.",
      "Verben der Bewegung und bleiben und sein selbst nehmen sein: Ich bin gegangen, gekommen, gefahren, geblieben, aufgestanden, gewesen.",
      ["Ich bin nach Hause gegangen.", "Bist du mitgekommen?", "Ich bin früh aufgestanden.", "Ich bin müde gewesen."],
      ["bin gegangen", "bist mitgekommen", "bin aufgestanden", "bin gewesen"],
      ["Ich habe gegangen uses the wrong helper. Movement takes bin.", "aufgestanden, not geaufstanden."],
      ["Nicht ich habe gegangen.", "aufgestanden, nicht geaufstanden."],
      "This is the same split as French être verbs: aller, venir, rester. If you would use être in French, try sein in German.",
      "Wie die être-Verben im Französischen: aller, venir, rester.",
      [ex([{ t: "Ich" }, { t: "bin", verb: 1 }, { t: "nach" }, { t: "Hause" }, { t: "gegangen", verb: 1 }, { t: "." }])]), (function () {
      const lemmas = ["gehen", "kommen", "fahren", "bleiben", "aufstehen", "mitkommen", "laufen", "sein"];
      const out = [];
      lemmas.forEach((lemma) => {
        const rest = lemma === "gehen" ? ["nach", "Hause"] : lemma === "aufstehen" ? ["früh"] : [];
        out.push(xform(P("Write the Perfekt with sein.", "Schreib das Perfekt mit sein."),
          { kind: "clause", pattern: "statement", lemma, person: "ich", rest },
          { kind: "clause", pattern: "statement", lemma, person: "ich", tense: "perfekt", rest }));
        out.push(gap(P("Helper or participle.", "Hilfsverb oder Partizip."), "Ich ___ " + (rest.concat([G.VERBS[lemma].part]).join(" ")) + ".", { kind: "verb", lemma: "sein", person: "ich", tense: "präsens" }));
      });
      out.push(spot(P("Tap the wrong helper.", "Tipp auf das falsche Hilfsverb."), {
        kind: "spot", tokens: ["Ich", "habe", "nach", "Hause", "gegangen."], wrongIndex: 1,
        fix: { kind: "verb", lemma: "sein", person: "ich", tense: "präsens" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "kommen", person: "du", tense: "perfekt", rest: ["heute"] }));
      out.push(order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "mitkommen", person: "du", tense: "perfekt", rest: [], punct: false }));
      out.push(gap(P("Participle of gehen.", "Partizip von gehen."), "Ich bin ___.", { kind: "verb", lemma: "gehen", partOnly: true }));
      out.push(choice(P("Helper for fahren.", "Hilfsverb für fahren."), "Ich ___ gefahren.", { kind: "verb", lemma: "sein", person: "ich", tense: "präsens" }));
      return out;
    })());

    addUnit(L("adj-der", "A1", "Adjective endings after der", "Adjektiv nach der", "weak adjective declension and no ending after sein",
      "Das ist jetzt modern", "https://learngerman.dw.com/de/das-ist-jetzt-modern/l-40483077",
      "After sein the adjective has no ending: Das Auto ist rot. Before a noun, the ending depends on the article. After der, die, das, den, dem the ending is usually -e or -en. Nominative singular is -e: der kleine Hund, die kleine Tasche, das kleine Kind. Accusative masculine and every dative take -en: den kleinen Hund, dem kleinen Hund, der kleinen Tasche.",
      "Nach sein keine Endung: Das Auto ist rot. Nach der/die/das meist -e oder -en. Nominativ Singular -e. Akkusativ maskulin und jeder Dativ -en.",
      ["der kleine Hund", "den kleinen Hund", "dem kleinen Hund", "Das Auto ist rot."],
      ["der kleine Hund", "den kleinen Hund", "dem kleinen Hund", "Das Auto ist rot."],
      ["den kleiner Hund puts the nominative ending in the accusative.", "das rotes Auto doubles the signal. After das the ending is -e: das rote Auto."],
      ["Nicht den kleiner Hund.", "Nicht das rotes Auto, sondern das rote Auto."],
      "French adjectives often sit after the noun and agree in gender. German adjectives usually sit before the noun, and the ending also depends on the article in front.",
      "Im Deutschen steht das Adjektiv meist vor dem Nomen, und die Endung hängt vom Artikel ab.",
      [ex([{ t: "der", g: "m" }, { t: "kleine", g: "m" }, { t: "Hund", g: "m" }])]), (function () {
      const out = [];
      const rows = [
        ["der", "m", "nom", "klein", "Hund"], ["der", "m", "acc", "klein", "Hund"], ["der", "m", "dat", "klein", "Hund"],
        ["der", "f", "nom", "klein", "Tasche"], ["der", "f", "acc", "klein", "Tasche"], ["der", "f", "dat", "klein", "Tasche"],
        ["der", "n", "nom", "klein", "Kind"], ["der", "n", "acc", "rot", "Auto"], ["der", "n", "dat", "klein", "Kind"],
        ["der", "pl", "nom", "klein", "Hunde"], ["der", "pl", "acc", "klein", "Hunde"], ["der", "pl", "dat", "klein", "Hunden"],
      ];
      rows.forEach(([decl, g, kase, stem, noun]) => {
        out.push(gap(P("Ending after the definite article.", "Endung nach dem bestimmten Artikel."), "___", { kind: "adjPhrase", decl, gender: g, kase, stem, noun }));
      });
      ["rot", "neu", "klein", "alt", "schön"].forEach((stem) => {
        out.push(choice(P("After sein there is no ending.", "Nach sein keine Endung."), "Das ist ___.", { kind: "predicate", stem }));
      });
      out.push(spot(P("Tap the ending that does not belong after sein.", "Tipp auf die Endung nach sein."), {
        kind: "spot", tokens: ["Das", "Auto", "ist", "rote"], wrongIndex: 3,
        fix: { kind: "predicate", stem: "rot" },
      }));
      out.push(gap(P("Type only the ending.", "Nur die Endung."), "den klein___ Hund", { kind: "adjEnd", decl: "der", gender: "m", kase: "acc" }));
      out.push(gap(P("Type only the ending.", "Nur die Endung."), "dem klein___ Kind", { kind: "adjEnd", decl: "der", gender: "n", kase: "dat" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "adjPhrase", decl: "der", gender: "m", kase: "nom", stem: "klein", noun: "Hund" }));
      return out;
    })());

    addUnit(L("acc-pronouns", "A1", "Accusative pronouns", "Pronomen im Akkusativ", "mich, dich, ihn, sie, uns, euch",
      "Meine Eltern", "https://learngerman.dw.com/de/meine-eltern/l-40490319",
      "When the person is the object, use the accusative pronoun. ich → mich, du → dich, er → ihn, sie → sie, es → es, wir → uns, ihr → euch, sie → sie, Sie → Sie. Sie stays capital. ihn replaces der Mann. sie replaces die Frau.",
      "ich → mich, du → dich, er → ihn, sie → sie, wir → uns, ihr → euch, Sie → Sie.",
      ["Siehst du mich?", "Ich sehe ihn.", "Wir sehen euch.", "Ich liebe Sie."],
      ["mich", "ihn", "euch", "Sie"],
      ["Ich sehe er keeps the nominative. Ich sehe ihn.", "mir is dative. The object of sehen is mich."],
      ["Nicht ich sehe er, sondern ihn.", "sehen steht mit dem Akkusativ: mich, nicht mir."],
      null, null, []), (function () {
      const out = [];
      ["ich", "du", "er", "sie", "es", "wir", "ihr", "sie_pl", "Sie"].forEach((person) => {
        out.push((out.length % 2 === 0 ? choice : gap)(P("Accusative of " + who[person] + ".", "Akkusativ von " + who[person] + "."), "Ich sehe ___.", { kind: "pronoun", person, kase: "acc" }));
      });
      out.push(order(P("Build the question.", "Bau die Frage."), { kind: "tokens", tokens: ["Siehst", "du", "mich"], finite: "Siehst", finiteIndex: 0, whyEn: "A yes/no question starts with the verb.", whyDe: "Eine Ja/Nein-Frage beginnt mit dem Verb." }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "tokens", tokens: ["Ich", "sehe", "ihn", "heute"], finite: "sehe", finiteIndex: 1, whyEn: "ihn replaces a masculine noun.", whyDe: "ihn ersetzt ein maskulines Nomen." }));
      out.push(gap(P("für + accusative pronoun.", "für + Akkusativ."), "Das ist für ___.", { kind: "pronoun", person: "du", kase: "acc" }));
      out.push(gap(P("für + formal you.", "für + Sie."), "Das ist für ___.", { kind: "pronoun", person: "Sie", kase: "acc" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Ich sehe", { kind: "pronoun", person: "sie", kase: "acc" }, "heute."] }));
      out.push(spot(P("Tap the nominative pronoun in object position.", "Tipp auf das Nominativpronomen."), {
        kind: "spot", tokens: ["Ich", "sehe", "er", "heute."], wrongIndex: 2,
        fix: { kind: "pronoun", person: "er", kase: "acc" },
      }));
      ["mich", "dich", "ihn", "uns", "euch"].forEach((word, i) => {
        const person = ["ich", "du", "er", "wir", "ihr"][i];
        out.push(choice(P("Object pronoun.", "Objektpronomen."), "Kennst du ___?", { kind: "pronoun", person, kase: "acc" }));
      });
      return out;
    })());

    addUnit(L("imperative", "A1", "Imperatives", "Imperativ", "du, ihr and Sie commands",
      "Ist das gesund?", "https://learngerman.dw.com/de/ist-das-gesund/l-40502885",
      "A command to one friend drops the -st and usually the ending: Komm! Spiel! Sprich! Lies! Gib! A command to several friends looks like the ihr present: Kommt! Spielt! A polite command is the infinitive plus Sie: Kommen Sie! Seien Sie pünktlich! Separable prefixes stay at the end: Steh auf!",
      "du: Komm, Spiel, Sprich, Lies, Gib. ihr: Kommt, Spielt. Sie: Kommen Sie, Seien Sie pünktlich. Steh auf!",
      ["Komm!", "Kommt!", "Kommen Sie!", "Sei pünktlich!", "Steh auf!"],
      ["Komm", "Kommt", "Kommen Sie", "Sei pünktlich", "Steh auf"],
      ["Kommst! still has the du ending.", "Kommen! without Sie is not the polite command."],
      ["Nicht Kommst.", "Höflich: Kommen Sie."],
      null, null, []), (function () {
      const out = [];
      ["kommen", "aufstehen", "sein", "sprechen", "lesen", "geben", "nehmen", "spielen"].forEach((lemma) => {
        ["du", "ihr", "Sie"].forEach((who) => {
          out.push(gap(P("Command, " + who + ", " + lemma + ".", "Imperativ, " + who + "."), "___", { kind: "imp", lemma, who }));
        });
      });
      return out;
    })());

    addUnit(L("duerfen", "A1", "dürfen", "dürfen", "dürfen and nicht dürfen",
      "Beim Arzt", "https://learngerman.dw.com/de/beim-arzt/l-40505561",
      "dürfen means may or to be allowed. ich darf, du darfst, er darf, wir dürfen, ihr dürft, Sie dürfen. The infinitive goes to the end. nicht sits in front of that infinitive: Du darfst hier nicht rauchen. In the negative, dürfen means must not, not do not have to.",
      "ich darf, du darfst, er darf, wir dürfen. nicht steht vor dem Infinitiv: Du darfst hier nicht rauchen. nicht dürfen heißt nicht erlaubt.",
      ["Ich darf gehen.", "Darfst du das essen?", "Du darfst hier nicht rauchen.", "Sie dürfen hier bleiben."],
      ["darf", "darfst", "nicht rauchen", "dürfen bleiben"],
      ["nicht dürfen is must not. nicht müssen is do not have to.", "ich darf, not ich dürfe, in the present."],
      ["nicht dürfen = nicht erlaubt. nicht müssen = nicht nötig.", "Präsens: ich darf."],
      null, null, []), forms(["dürfen"], ["ich", "du", "er", "wir", "ihr", "sie_pl", "Sie"], "präsens").concat([
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "du", rest: ["hier", "bleiben"], punct: false }),
      order(P("Build the ban.", "Bau das Verbot."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "du", rest: ["hier", "nicht", "rauchen"], punct: false }),
      order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "dürfen", person: "ich", rest: ["here".replace("here", "hier"), "essen"], punct: false }),
      xform(P("Make a weil clause.", "Mach einen weil-Satz."),
        { kind: "clause", pattern: "statement", lemma: "dürfen", person: "wir", rest: ["gehen"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "dürfen", person: "wir", rest: ["gehen"] }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "Sie", rest: ["hier", "bleiben"] }),
      gap(P("ihr form.", "ihr."), "Ihr ___ das sagen.", { kind: "verb", lemma: "dürfen", person: "ihr", tense: "präsens" }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "ich", rest: ["das", "essen"], punct: false }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "Sie", rest: ["hier", "parken"], punct: false }),
      order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "dürfen", person: "wir", rest: ["bleiben"], punct: false }),
      gap(P("er form.", "er."), "Er ___ nicht kommen.", { kind: "verb", lemma: "dürfen", person: "er", tense: "präsens" }),
      choice(P("sie plural.", "sie Plural."), "Sie ___ das machen.", { kind: "verb", lemma: "dürfen", person: "sie_pl", tense: "präsens" }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "du", rest: ["das", "sagen"] }),
      xform(P("Make a question.", "Mach eine Frage."),
        { kind: "clause", pattern: "statement", lemma: "dürfen", person: "ich", rest: ["gehen"] },
        { kind: "clause", pattern: "yn", lemma: "dürfen", person: "ich", rest: ["gehen"] }),
    ]));

    addUnit(L("dat-pronouns", "A1", "Dative pronouns", "Pronomen im Dativ", "mir, dir, ihm, ihr, uns, euch, ihnen, Ihnen",
      "Leben in Deutschland", "https://learngerman.dw.com/de/leben-in-deutschland/l-40508882",
      "helfen, danken and gefallen take the dative pronoun. ich → mir, du → dir, er → ihm, sie → ihr, wir → uns, ihr → euch, sie → ihnen, Sie → Ihnen. Ihnen has a capital i. ihr can mean to her. ihnen means to them.",
      "ich → mir, du → dir, er → ihm, sie → ihr, wir → uns, ihr → euch, sie → ihnen, Sie → Ihnen.",
      ["Kannst du mir helfen?", "Ich danke dir.", "Ich helfe ihm.", "Ich danke Ihnen."],
      ["mir", "dir", "ihm", "Ihnen"],
      ["Ich helfe ihn is accusative. helfen wants ihm.", "Ihnen is formal. ihnen is them."],
      ["helfen: ihm, nicht ihn.", "Ihnen ist höflich. ihnen ist ihnen."],
      null, null, []), (function () {
      const out = [];
      ["ich", "du", "er", "sie", "es", "wir", "ihr", "sie_pl", "Sie"].forEach((person) => {
        out.push((out.length % 2 === 0 ? choice : gap)(P("Dative of " + who[person] + ".", "Dativ von " + who[person] + "."), "Ich helfe ___.", { kind: "pronoun", person, kase: "dat" }));
      });
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "tokens", tokens: ["Kannst", "du", "mir", "helfen"], finite: "Kannst", finiteIndex: 0, whyEn: "mir is the dative of ich. The infinitive helfen stays at the end.", whyDe: "mir ist der Dativ von ich. helfen bleibt am Ende." }));
      out.push(gap(P("Formal dative.", "Höflicher Dativ."), "Ich danke ___.", { kind: "pronoun", person: "Sie", kase: "dat" }));
      out.push(gap(P("them, dative.", "ihnen."), "Ich helfe ___.", { kind: "pronoun", person: "sie_pl", kase: "dat" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["Ich danke", { kind: "pronoun", person: "du", kase: "dat" }] }));
      out.push(spot(P("Tap the accusative after helfen.", "Tipp auf den Akkusativ nach helfen."), {
        kind: "spot", tokens: ["Ich", "helfe", "ihn", "morgen."], wrongIndex: 2,
        fix: { kind: "pronoun", person: "er", kase: "dat" },
      }));
      ["ich", "du", "er", "wir", "ihr", "Sie"].forEach((person) => {
        out.push(gap(P("Dative again.", "Noch einmal Dativ."), "Das Buch gefällt ___.", { kind: "pronoun", person, kase: "dat" }));
      });
      return out;
    })());

    addUnit(L("wuerde-gern", "A1", "würde gern and hätte gern", "würde gern und hätte gern", "polite wishes",
      "Ich träume von …", "https://learngerman.dw.com/de/ich-träume-von/l-40511139",
      "Two soft patterns cover a lot of wishes. ich würde gern plus an infinitive at the end: Ich würde gern reisen. And ich hätte gern plus a noun: Ich hätte gern einen Kaffee. würde is the Konjunktiv II of werden. hätte is the Konjunktiv II of haben. du would like is du würdest and du hättest.",
      "Ich würde gern reisen. Ich hätte gern einen Kaffee. du: würdest, hättest.",
      ["Ich würde gern in Berlin wohnen.", "Würdest du gern kommen?", "Ich hätte gern Zeit.", "Hättest du gern Kaffee?"],
      ["würde gern wohnen", "Würdest du gern kommen", "hätte gern Zeit", "Hättest du gern"],
      ["ich würde gern wohne conjugates the second verb. Keep the infinitive: wohnen.", "hätte is not hatte. hatte is the plain past."],
      ["Nicht wohne, sondern wohnen.", "hätte ist nicht hatte."],
      null, null, []), (function () {
      const out = forms(["werden"], ["ich", "du", "er", "wir", "ihr", "Sie"], "konj2");
      ["ich", "du", "er", "wir", "ihr", "Sie"].forEach((person) => {
        out.push(gap(P("hätte for " + who[person] + ".", "hätte."), who[person] + " ___", { kind: "verb", lemma: "haben", person, tense: "konj2" }));
      });
      out.push(order(P("Build the wish.", "Bau den Wunsch."), { kind: "clause", pattern: "statement", lemma: "werden", person: "ich", tense: "konj2", rest: ["gern", "reisen"], punct: false }));
      out.push(order(P("Build the question.", "Bau die Frage."), { kind: "clause", pattern: "yn", lemma: "werden", person: "du", tense: "konj2", rest: ["gern", "kommen"], punct: false }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "haben", person: "ich", tense: "konj2", rest: ["gern", "Zeit"], punct: false }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "werden", person: "wir", tense: "konj2", rest: ["gern", "bleiben"] }));
      out.push(spot(P("Tap the conjugated second verb.", "Tipp auf das konjugierte zweite Verb."), {
        kind: "spot", tokens: ["Ich", "würde", "gern", "wohne"], wrongIndex: 3,
        fix: { kind: "connector", word: "wohnen" },
      }));
      out.push(order(P("Build the question with hätte.", "Bau die Frage mit hätte."), { kind: "clause", pattern: "yn", lemma: "haben", person: "du", tense: "konj2", rest: ["gern", "Kaffee"], punct: false }));
      out.push(gap(P("wir, würde.", "wir, würde."), "Wir ___ gern bleiben.", { kind: "verb", lemma: "werden", person: "wir", tense: "konj2" }));
      out.push(choice(P("she, hätte.", "sie, hätte."), "Sie ___ gern Zeit.", { kind: "verb", lemma: "haben", person: "sie", tense: "konj2" }));
      return out;
    })());
    addUnit(L("dass", "A2", "Clauses with dass", "Nebensätze mit dass", "dass sends the verb to the end",
      "Pläne machen", "https://learngerman.dw.com/de/pläne-machen/l-40553926",
      "dass means that and starts a clause. The conjugated verb goes to the end. Ich weiß, dass du morgen kommst. Ich hoffe, dass wir Zeit haben. In the main clause the verb stays in position 2. Only the dass clause is verb-final.",
      "dass schickt das Verb ans Ende: Ich weiß, dass du morgen kommst.",
      ["dass du morgen kommst", "dass sie müde ist", "dass wir Deutsch lernen"],
      ["dass du morgen kommst", "dass sie müde ist", "dass wir Deutsch lernen"],
      ["dass du kommst morgen leaves the verb in the middle.", "dass is not das. das is the article or the pronoun."],
      ["Nicht: dass du kommst morgen.", "dass ist nicht das."],
      null, null, []), (function () {
      const rows = [
        ["kommen", "du", ["morgen"]], ["sein", "sie", ["müde"]], ["lernen", "wir", ["Deutsch"]],
        ["haben", "ich", ["Zeit"]], ["wohnen", "er", ["in", "Berlin"]], ["spielen", "ihr", ["Fußball"]],
        ["bleiben", "Sie", ["hier"]], ["aufstehen", "ich", ["früh"]],
        ["machen", "du", ["das"]], ["sprechen", "sie", ["Deutsch"]],
      ];
      const out = [];
      rows.forEach(([lemma, person, rest]) => {
        out.push(order(P("Build the dass clause.", "Bau den dass-Satz."), { kind: "clause", pattern: "sub", conj: "dass", lemma, person, rest, punct: false }));
        out.push(xform(P("Turn the sentence into a dass clause.", "Mach einen dass-Satz."),
          { kind: "clause", pattern: "statement", lemma, person, rest },
          { kind: "clause", pattern: "sub", conj: "dass", lemma, person, rest }));
      });
      out.push(spot(P("Tap the verb that is not at the end.", "Tipp auf das Verb, das nicht am Ende steht."), {
        kind: "spot", tokens: ["dass", "du", "kommst", "morgen"], wrongIndex: 2,
        fix: { kind: "clause", pattern: "sub", conj: "dass", lemma: "kommen", person: "du", rest: ["morgen"], punct: false },
      }));
      out.push(choice(P("Which word starts a verb-final clause meaning that?", "Welches Wort heißt that und schickt das Verb ans Ende?"), "Ich weiß, ___ du kommst.", { kind: "connector", word: "dass" }));
      return out;
    })());

    addUnit(L("ob-indirect", "A2", "Indirect questions", "Indirekte Fragen", "ob and verb-final questions",
      "Sprichst du Deutsch?", "https://learngerman.dw.com/de/sprichst-du-deutsch/l-40555428",
      "A direct question puts the verb early: Wohnst du hier? An indirect question, after ich weiß nicht or ich frage mich, sends the verb to the end. Yes/no questions use ob: Ich weiß nicht, ob du hier wohnst. W questions keep the W word and still put the verb last: Ich weiß nicht, wo du wohnst.",
      "Direkt: Wohnst du hier? Indirekt: ob du hier wohnst. Wo du wohnst, nicht wo wohnst du.",
      ["ob du Zeit hast", "wo du wohnst", "wann sie kommt", "warum er bleibt"],
      ["ob du Zeit hast", "wo du wohnst", "wann sie kommt", "warum er bleibt"],
      ["Ich weiß nicht, wo wohnst du keeps the direct-question order.", "ob is whether, not wo."],
      ["Nicht: wo wohnst du, nach ich weiß nicht.", "ob heißt ob, nicht wo."],
      null, null,
      [ex([{ t: "ob" }, { t: "du" }, { t: "hier" }, { t: "wohnst", verb: 1 }])]), (function () {
      const rows = [
        ["ob", "haben", "du", ["Zeit"]], ["ob", "wohnen", "du", ["hier"]], ["ob", "kommen", "sie", ["morgen"]],
        ["wo", "wohnen", "du", []], ["wo", "arbeiten", "Sie", []], ["wann", "kommen", "sie", []],
        ["warum", "bleiben", "er", ["hier"]], ["was", "machen", "du", ["heute"]],
      ];
      const out = [];
      rows.forEach(([conj, lemma, person, rest]) => {
        const sub = { kind: "clause", pattern: "sub", conj, lemma, person, rest, punct: false };
        out.push(order(P("Build the indirect question.", "Bau die indirekte Frage."), sub));
        if (conj !== "ob") {
          out.push(xform(P("Make it indirect.", "Mach die Frage indirekt."),
            { kind: "clause", pattern: "w", w: conj.charAt(0).toUpperCase() + conj.slice(1), lemma, person, rest },
            sub));
        }
      });
      out.push(choice(P("whether", "ob"), "Ich weiß nicht, ___ du Zeit hast.", { kind: "connector", word: "ob" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "sub", conj: "ob", lemma: "sprechen", person: "du", rest: ["Deutsch"], punct: false }));
      out.push(spot(P("Tap the verb that is still in question order.", "Tipp auf das Verb in der Frage-Reihenfolge."), {
        kind: "spot", tokens: ["wo", "wohnst", "du"], wrongIndex: 1,
        fix: { kind: "clause", pattern: "sub", conj: "wo", lemma: "wohnen", person: "du", rest: [], punct: false },
      }));
      out.push(order(P("whether she is tired.", "ob sie müde ist."), { kind: "clause", pattern: "sub", conj: "ob", lemma: "sein", person: "sie", rest: ["müde"], punct: false }));
      out.push(order(P("whether you speak German.", "ob du Deutsch sprichst."), { kind: "clause", pattern: "sub", conj: "ob", lemma: "sprechen", person: "du", rest: ["Deutsch"], punct: false }));
      out.push(xform(P("Make where-are-you-going indirect.", "Mach die Frage indirekt."),
        { kind: "clause", pattern: "w", w: "Wohin", lemma: "gehen", person: "du", rest: [] },
        { kind: "clause", pattern: "sub", conj: "wohin", lemma: "gehen", person: "du", rest: [], punct: false }));
      out.push(gap(P("Type the indirect question.", "Schreib die indirekte Frage."), "Ich weiß nicht, ___", { kind: "clause", pattern: "sub", conj: "ob", lemma: "kommen", person: "er", rest: ["heute"] }));
      return out;
    })());

    addUnit(L("weil", "A2", "Because: weil", "weil", "weil and verb-final clauses",
      "Geld ist für mich …", "https://learngerman.dw.com/de/geld-ist-für-mich/l-40555142",
      "weil means because and sends the conjugated verb to the end. Ich bleibe zu Hause, weil ich müde bin. Ich lerne Deutsch, weil ich in Berlin wohne. Separable verbs join up again: weil ich früh aufstehe. In the Perfekt, the helper is the last word: weil ich Fußball gespielt habe.",
      "weil schickt das Verb ans Ende: weil ich müde bin. weil ich früh aufstehe. weil ich gespielt habe.",
      ["weil ich müde bin", "weil sie keine Zeit hat", "weil ich früh aufstehe", "weil wir gespielt haben"],
      ["weil ich müde bin", "weil sie keine Zeit hat", "weil ich früh aufstehe", "weil wir gespielt haben"],
      ["weil ich bin müde is English word order.", "denn does not send the verb to the end. weil does."],
      ["Nicht: weil ich bin müde.", "denn lässt das Verb auf Position 2."],
      null, null,
      [ex([{ t: "weil" }, { t: "ich" }, { t: "müde" }, { t: "bin", verb: 1 }])]), (function () {
      const rows = [
        ["sein", "ich", ["müde"], "präsens"], ["haben", "sie", ["keine", "Zeit"], "präsens"],
        ["wohnen", "ich", ["in", "Berlin"], "präsens"], ["aufstehen", "ich", ["früh"], "präsens"],
        ["spielen", "wir", ["Fußball"], "perfekt"], ["kommen", "du", ["heute"], "perfekt"],
        ["bleiben", "er", ["hier"], "präsens"], ["lernen", "ihr", ["Deutsch"], "präsens"],
      ];
      const out = [];
      rows.forEach(([lemma, person, rest, tense]) => {
        const t = tense === "perfekt" ? "perfekt" : "präsens";
        out.push(xform(P("Give the reason with weil.", "Gib den Grund mit weil."),
          { kind: "clause", pattern: "statement", lemma, person, tense: t, rest },
          { kind: "clause", pattern: "sub", conj: "weil", lemma, person, tense: t, rest }));
      });
      out.push(order(P("Build the clause.", "Bau den Satz."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "sein", person: "ich", rest: ["müde"], punct: false }));
      out.push(order(P("Build the Perfekt clause.", "Bau den Perfekt-Satz."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "gehen", person: "ich", tense: "perfekt", rest: ["nach", "Hause"], punct: false }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "haben", person: "ich", rest: ["keine", "Zeit"], punct: false }));
      out.push(spot(P("Tap the verb that is too early.", "Tipp auf das Verb, das zu früh steht."), {
        kind: "spot", tokens: ["weil", "ich", "bin", "müde"], wrongIndex: 2,
        fix: { kind: "clause", pattern: "sub", conj: "weil", lemma: "sein", person: "ich", rest: ["müde"], punct: false },
      }));
      out.push(choice(P("Which linker means because and sends the verb to the end?", "Welches Wort heißt because?"), "Ich bleibe, ___ ich müde bin.", { kind: "connector", word: "weil" }));
      out.push(order(P("Build the Perfekt clause with spielen.", "Bau den Perfekt-Satz."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "spielen", person: "wir", tense: "perfekt", rest: ["Fußball"], punct: false }));
      out.push(order(P("Separable verb at the end.", "Trennbare Verben am Ende."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "aufstehen", person: "ich", rest: ["früh"], punct: false }));
      out.push(order(P("kommen in the Perfekt.", "kommen im Perfekt."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "kommen", person: "du", tense: "perfekt", rest: ["heute"], punct: false }));
      out.push(xform(P("Give the reason with weil.", "Gib den Grund mit weil."),
        { kind: "clause", pattern: "statement", lemma: "kochen", person: "ich", rest: ["heute"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "kochen", person: "ich", rest: ["heute"] }));
      out.push(xform(P("Perfekt with fahren.", "Perfekt mit fahren."),
        { kind: "clause", pattern: "statement", lemma: "fahren", person: "wir", tense: "perfekt", rest: ["nach", "Berlin"] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "fahren", person: "wir", tense: "perfekt", rest: ["nach", "Berlin"] }));
      out.push(gap(P("Finish the clause.", "Beende den Satz."), "weil er ___", { kind: "clause", pattern: "sub", conj: "weil", lemma: "bleiben", person: "er", rest: ["hier"], punct: false }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "sub", conj: "weil", lemma: "wohnen", person: "ich", rest: ["in", "Berlin"], punct: false }));
      return out;
    })());

    addUnit(L("adj-ein", "A2", "Endings after ein and with no article", "Endungen nach ein und ohne Artikel", "ein-word and strong declension",
      "Personen beschreiben", "https://learngerman.dw.com/de/personen-beschreiben/l-40558163",
      "After ein, kein or a possessive, the adjective shows the gender the article is hiding. Nominative masculine is -er: ein kleiner Hund. Nominative neuter is -es: ein kleines Kind. Feminine is -e: eine kleine Tasche. With no article at all, the adjective carries the full signal: kalter Saft, kaltes Wasser, kalte Milch. Dative plural with no article is -en: guten Freunden.",
      "Nach ein: ein kleiner Hund, ein kleines Kind, eine kleine Tasche. Ohne Artikel: kalter Saft, kaltes Wasser. Dativ Plural: guten Freunden.",
      ["ein kleiner Hund", "ein kleines Kind", "eine kleine Tasche", "kaltes Wasser", "mit kaltem Wasser"],
      ["ein kleiner Hund", "ein kleines Kind", "eine kleine Tasche", "kaltes Wasser", "mit kaltem Wasser"],
      ["ein klein Hund has no ending.", "ein kleiner Kind uses the masculine ending on a neuter noun."],
      ["Nicht ein klein Hund.", "Nicht ein kleiner Kind."],
      null, null, []), (function () {
      const out = [];
      const rows = [
        ["ein", "indef", "m", "nom", "klein", "Hund"], ["ein", "indef", "m", "acc", "klein", "Hund"], ["ein", "indef", "m", "dat", "klein", "Hund"],
        ["ein", "indef", "n", "nom", "klein", "Kind"], ["ein", "indef", "n", "acc", "rot", "Auto"], ["ein", "indef", "n", "dat", "kalt", "Wasser"],
        ["ein", "indef", "f", "nom", "klein", "Tasche"], ["ein", "indef", "f", "acc", "neu", "Tasche"], ["ein", "indef", "f", "dat", "klein", "Tasche"],
        ["ein", "kein", "pl", "nom", "klein", "Kinder"], ["ein", "kein", "m", "acc", "neu", "Hund"],
        ["strong", null, "m", "nom", "kalt", "Saft"], ["strong", null, "n", "nom", "kalt", "Wasser"], ["strong", null, "f", "nom", "kalt", "Milch"],
        ["strong", null, "m", "dat", "kalt", "Saft"], ["strong", null, "n", "dat", "kalt", "Wasser"], ["strong", null, "pl", "dat", "gut", "Freunden"],
        ["strong", null, "pl", "nom", "gut", "Freunde"],
      ];
      rows.forEach(([decl, det, g, kase, stem, noun]) => {
        const check = { kind: "adjPhrase", decl, gender: g, kase, stem, noun };
        if (det) check.det = det;
        out.push(gap(P("Write the article and the adjective with the noun.", "Schreib Artikel, Adjektiv und Nomen."), "___", check));
      });
      out.push(gap(P("Ending only.", "Nur die Endung."), "ein klein___ Hund", { kind: "adjEnd", decl: "ein", gender: "m", kase: "nom" }));
      out.push(gap(P("Ending only.", "Nur die Endung."), "ein klein___ Kind", { kind: "adjEnd", decl: "ein", gender: "n", kase: "nom" }));
      out.push(spot(P("Tap the ending that belongs after der, not after ein.", "Tipp auf die Endung, die nach der gehört."), {
        kind: "spot", tokens: ["ein", "kleine", "Hund"], wrongIndex: 1,
        fix: { kind: "adjPhrase", decl: "ein", det: "indef", gender: "m", kase: "nom", stem: "klein", noun: "Hund" },
      }));
      return out;
    })());

    addUnit(L("reflexive", "A2", "Reflexive verbs", "Reflexive Verben", "mich and mir with reflexive verbs",
      "Alltag und Freizeit", "https://learngerman.dw.com/de/alltag-und-freizeit/l-40565833",
      "A reflexive verb points back to the subject. Accusative: ich freue mich, du freust dich, er freut sich, wir freuen uns, ihr freut euch. Dative when another object is there: Ich wasche mir die Hände, but Ich wasche mich. The pronoun changes with the person. sich is for er, sie, sie and Sie.",
      "ich freue mich, du freust dich, er freut sich, wir freuen uns. Ich wasche mich, aber ich wasche mir die Hände.",
      ["Ich freue mich.", "Freust du dich?", "Er wäscht sich.", "Ich wasche mir die Hände."],
      ["mich", "dich", "sich", "mir die Hände"],
      ["Ich freue mich nicht mir. freuen takes the accusative mich.", "du wäschst dir die Hände, not du wäschst dich die Hände, because Hände is already the accusative object."],
      ["freuen: mich, nicht mir.", "die Hände ist schon Akkusativ, also mir."],
      null, null, []), (function () {
      const out = [];
      ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"].forEach((person) => {
        out.push(order(P("Build the reflexive sentence.", "Bau den reflexiven Satz."), { kind: "clause", pattern: "statement", lemma: "freuen", person, refl: "acc", rest: [], punct: false }));
      });
      ["ich", "du", "er", "wir"].forEach((person) => {
        out.push(gap(P("Accusative reflexive pronoun for " + who[person] + ".", "Reflexivpronomen Akkusativ."), who[person] + " → ___", { kind: "refl", person, kase: "acc" }));
        out.push(gap(P("Dative reflexive pronoun for " + who[person] + ", when the hands are the object.", "Reflexivpronomen Dativ."), who[person] + " → ___", { kind: "refl", person, kase: "dat" }));
      });
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "waschen", person: "ich", refl: "dat", rest: ["die", "Hände"], punct: false }));
      out.push(xform(P("Make a weil clause.", "Mach einen weil-Satz."),
        { kind: "clause", pattern: "statement", lemma: "freuen", person: "ich", refl: "acc", rest: [] },
        { kind: "clause", pattern: "sub", conj: "weil", lemma: "freuen", person: "ich", refl: "acc", rest: [] }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "yn", lemma: "freuen", person: "du", refl: "acc", rest: [] }));
      out.push(spot(P("Tap the dative pronoun. This verb wants the accusative.", "Tipp auf den Dativ."), {
        kind: "spot", tokens: ["Ich", "freue", "mir"], wrongIndex: 2,
        fix: { kind: "refl", person: "ich", kase: "acc" },
      }));
      return out;
    })());

    addUnit(L("rel-nom", "A2", "Relative clauses, nominative", "Relativsätze im Nominativ", "der, die, das as relative pronouns",
      "Essen gehen", "https://learngerman.dw.com/de/essen-gehen/l-40575951",
      "A relative clause describes a noun and starts with a little der, die or das that matches the noun's gender. The verb goes to the end. der Mann, der hier wohnt. die Frau, die gut kocht. das Kind, das liest. Plural: die Freunde, die kommen. The pronoun is nominative when it is the subject of the little clause.",
      "der Mann, der hier wohnt. die Frau, die gut kocht. das Kind, das liest. Das Verb steht am Ende.",
      ["der Mann, der hier wohnt", "die Frau, die gut kocht", "das Buch, das neu ist", "die Freunde, die kommen"],
      ["der … der", "die … die", "das … das", "die … die"],
      ["der Mann, den hier wohnt uses the accusative pronoun for a subject.", "The verb does not stay in position 2 inside the relative clause."],
      ["Subjekt: der, nicht den.", "Das Verb steht am Ende."],
      null, null, []), (function () {
      const out = [];
      [["m", "der Mann,", "hier wohnt"], ["f", "die Frau,", "gut kocht"], ["n", "das Kind,", "gern liest"], ["pl", "die Freunde,", "heute kommen"], ["m", "der Lehrer,", "Deutsch spricht"], ["f", "die Lampe,", "neu ist"], ["n", "das Buch,", "auf dem Tisch liegt"], ["pl", "die Kinder,", "Fußball spielen"]].forEach(([g, left, right]) => {
        out.push(gap(P("Nominative relative pronoun.", "Relativpronomen Nominativ."), left + " ___ " + right, { kind: "rel", gender: g, kase: "nom" }));
        out.push(choice(P("Pick the pronoun.", "Wähle das Pronomen."), left + " ___ " + right, { kind: "rel", gender: g, kase: "nom" }));
      });
      out.push(order(P("Build the clause.", "Bau den Satz."), { kind: "tokens", tokens: ["der", "Mann", "der", "hier", "wohnt"], finite: "wohnt", finiteIndex: 4, whyEn: "The relative verb wohnt is at the end.", whyDe: "wohnt steht am Ende." }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["die Frau,", { kind: "rel", gender: "f", kase: "nom" }, "gut kocht"] }));
      out.push(gap(P("Nominative relative pronoun.", "Relativpronomen Nominativ."), "der Hund, ___ bellt", { kind: "rel", gender: "m", kase: "nom" }));
      out.push(choice(P("Pick the pronoun.", "Wähle das Pronomen."), "das Auto, ___ neu ist", { kind: "rel", gender: "n", kase: "nom" }));
      return out;
    })());

    addUnit(L("rel-acc", "A2", "Relative clauses, accusative", "Relativsätze im Akkusativ", "den, die, das as objects",
      "Was darf es sein?", "https://learngerman.dw.com/de/was-darf-es-sein/l-40577405",
      "When the noun is the object inside the relative clause, masculine changes to den. der Mann, den ich sehe. Feminine and neuter look the same as the nominative: die Frau, die ich sehe. das Buch, das ich lese. Plural stays die. The verb is still at the end.",
      "der Mann, den ich sehe. die Frau, die ich sehe. das Buch, das ich lese. Das Verb bleibt am Ende.",
      ["der Mann, den ich sehe", "die Tasche, die ich kaufe", "das Buch, das ich lese", "die Freunde, die ich einlade"],
      ["den ich sehe", "die ich kaufe", "das ich lese", "die ich einlade"],
      ["der Mann, der ich sehe uses the subject pronoun. ich is the subject, so the man is den.", "den is not the dative. The dative masculine relative pronoun is dem."],
      ["Ich ist das Subjekt, also den.", "Dativ maskulin ist dem."],
      null, null, []), (function () {
      const out = [];
      [["m", "der Mann,", "ich sehe"], ["m", "der Apfel,", "du isst"], ["f", "die Tasche,", "ich kaufe"], ["f", "die Frau,", "wir kennen"], ["n", "das Buch,", "ich lese"], ["n", "das Auto,", "er kauft"], ["pl", "die Freunde,", "ich einlade"], ["pl", "die Bücher,", "sie liest"]].forEach(([g, left, right]) => {
        out.push(gap(P("Accusative relative pronoun.", "Relativpronomen Akkusativ."), left + " ___ " + right, { kind: "rel", gender: g, kase: "acc" }));
        out.push(choice(P("Pick the object pronoun.", "Wähle das Objektpronomen."), left + " ___ " + right, { kind: "rel", gender: g, kase: "acc" }));
      });
      out.push(choice(P("Subject or object?", "Subjekt oder Objekt?"), "der Mann, ___ ich sehe", { kind: "rel", gender: "m", kase: "acc" }));
      out.push(choice(P("Subject or object?", "Subjekt oder Objekt?"), "der Mann, ___ hier wohnt", { kind: "rel", gender: "m", kase: "nom" }));
      out.push(order(P("Build it.", "Bau den Satz."), { kind: "tokens", tokens: ["der", "Mann", "den", "ich", "sehe"], finite: "sehe", finiteIndex: 4, whyEn: "den is the object. sehe is at the end.", whyDe: "den ist das Objekt. sehe steht am Ende." }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "compose", bits: ["das Buch,", { kind: "rel", gender: "n", kase: "acc" }, "ich lese"] }));
      out.push(spot(P("Tap the subject pronoun used for an object.", "Tipp auf das Subjektpronomen."), {
        kind: "spot", tokens: ["der", "Mann", "der", "ich", "sehe"], wrongIndex: 2,
        fix: { kind: "rel", gender: "m", kase: "acc" },
      }));
      return out;
    })());

    addUnit(L("praet-mod-md", "A2", "musste and durfte", "musste und durfte", "Präteritum of müssen and dürfen",
      "Das Leben heute und damals", "https://learngerman.dw.com/de/das-leben-heute-und-damals/l-40582739",
      "The past of müssen is musste. ich musste, du musstest, er musste, wir mussten. The past of dürfen is durfte. ich durfte, du durftest, wir durften. The infinitive stays at the end: Ich musste früh aufstehen. Als Kind durfte ich lange spielen.",
      "müssen → musste, musstest, musste, mussten. dürfen → durfte, durftest, durfte, durften.",
      ["Ich musste arbeiten.", "Du musstest bleiben.", "Ich durfte spielen.", "Wir durften nicht rauchen."],
      ["musste", "musstest", "durfte", "durften"],
      ["ich musste, not ich muss-te with an extra e in the wrong place. The form is musste.", "durfte has no umlaut. The present darf has none either. The Konjunktiv dürfte does."],
      ["musste, nicht müsste, für die Vergangenheit.", "durfte ohne Umlaut. dürfte ist Konjunktiv."],
      null, null, []), forms(["müssen", "dürfen"], ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"], "praet").concat([
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "müssen", person: "ich", tense: "praet", rest: ["früh", "aufstehen"], punct: false }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "ich", tense: "praet", rest: ["lange", "spielen"], punct: false }),
      xform(P("Put the modal in the past.", "Setze das Modalverb in die Vergangenheit."),
        { kind: "clause", pattern: "statement", lemma: "müssen", person: "wir", rest: ["arbeiten"] },
        { kind: "clause", pattern: "statement", lemma: "müssen", person: "wir", tense: "praet", rest: ["arbeiten"] }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "dürfen", person: "du", tense: "praet", rest: ["das", "essen"] }),
    ]));

    addUnit(L("praet-mod-kw", "A2", "konnte and wollte", "konnte und wollte", "Präteritum of können and wollen",
      "Frauensache?", "https://learngerman.dw.com/de/frauensache/l-40583406",
      "können in the past is konnte. ich konnte, du konntest, wir konnten. wollen in the past is wollte. ich wollte, du wolltest, wir wollten. Ich konnte nicht kommen. Sie wollte Ärztin werden. The infinitive stays at the end.",
      "können → konnte, konntest, konnten. wollen → wollte, wolltest, wollten.",
      ["Ich konnte schwimmen.", "Du konntest helfen.", "Ich wollte bleiben.", "Wir wollten reisen."],
      ["konnte", "konntest", "wollte", "wollten"],
      ["konnte is the past. könnte with an umlaut is would be able to.", "wollte is both the past and the Konjunktiv of wollen. Context tells you which."],
      ["konnte ist Vergangenheit. könnte ist Konjunktiv.", "wollte kann beides sein."],
      null, null, []), forms(["können", "wollen"], ["ich", "du", "er", "sie", "wir", "ihr", "sie_pl", "Sie"], "praet").concat([
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "können", person: "ich", tense: "praet", rest: ["nicht", "kommen"], punct: false }),
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "wollen", person: "sie", tense: "praet", rest: ["Ärztin", "werden"], punct: false }),
      xform(P("Put können in the past.", "Setze können in die Vergangenheit."),
        { kind: "clause", pattern: "statement", lemma: "können", person: "du", rest: ["helfen"] },
        { kind: "clause", pattern: "statement", lemma: "können", person: "du", tense: "praet", rest: ["helfen"] }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "wollen", person: "wir", tense: "praet", rest: ["bleiben"] }),
    ]));

    addUnit(L("praet-reg", "A2", "Regular past", "Regelmäßiges Präteritum", "regular Präteritum",
      "Damals", "https://learngerman.dw.com/de/damals/l-40616254",
      "Regular past tense adds -te. ich spielte, du spieltest, er spielte, wir spielten, ihr spieltet, sie spielten. Verbs whose stem ends in -t or -d use -ete: ich arbeitete, du arbeitetest. You will meet this tense in stories. In conversation, Perfekt is still more common.",
      "spielte, spieltest, spielte, spielten, spieltet, spielten. arbeitete, arbeitetest.",
      ["ich spielte", "du machtest", "sie wohnte", "wir arbeiteten"],
      ["spielte", "machtest", "wohnte", "arbeiteten"],
      ["ich spielte not ich gespielt. gespielt needs habe.", "du spieltest has both -te and -st."],
      ["spielte ist Präteritum. gespielt ist das Partizip.", "du spieltest."],
      null, null, []), forms(["spielen", "machen", "wohnen", "arbeiten"], ["ich", "du", "er", "wir", "ihr"], "praet").concat([
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "wohnen", person: "sie", tense: "praet", rest: ["in", "Berlin"], punct: false }),
      xform(P("Write the Präteritum.", "Schreib das Präteritum."),
        { kind: "clause", pattern: "statement", lemma: "spielen", person: "wir", rest: ["Fußball"] },
        { kind: "clause", pattern: "statement", lemma: "spielen", person: "wir", tense: "praet", rest: ["Fußball"] }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "arbeiten", person: "ich", tense: "praet", rest: ["viel"] }),
      spot(P("Tap the participle used as a finite verb.", "Tipp auf das Partizip."), {
        kind: "spot", tokens: ["Ich", "gespielt", "gestern", "Fußball"], wrongIndex: 1,
        fix: { kind: "verb", lemma: "spielen", person: "ich", tense: "praet" },
      }),
    ]));

    addUnit(L("praet-irr", "A2", "Irregular past", "Unregelmäßiges Präteritum", "common irregular Präteritum",
      "Ein Bürger dieser Stadt", "https://learngerman.dw.com/de/ein-bürger-dieser-stadt/l-40608781",
      "A handful of verbs change the stem instead of adding -te. gehen → ging, kommen → kam, sehen → sah, schreiben → schrieb, trinken → trank, fahren → fuhr, bleiben → blieb, sprechen → sprach. du still adds -st: du gingst, du kamst, du trankst. wir adds -en: wir gingen.",
      "ging, kam, sah, schrieb, trank, fuhr, blieb, sprach. du gingst, wir gingen.",
      ["ich ging", "du kamst", "sie sah", "wir schrieben", "ihr trankt", "Sie blieben"],
      ["ging", "kamst", "sah", "schrieben", "trankt", "blieben"],
      ["ich ging not ich gehte.", "du kamst, not du kammst. One m."],
      ["Nicht gehte.", "du kamst."],
      null, null, []), forms(["gehen", "kommen", "sehen", "schreiben"], ["ich", "du", "er", "wir"], "praet").concat(forms(["trinken", "fahren", "bleiben", "sprechen"], ["ich", "du", "wir", "Sie"], "praet")).concat([
      order(P("Build it.", "Bau den Satz."), { kind: "clause", pattern: "statement", lemma: "gehen", person: "ich", tense: "praet", rest: ["nach", "Hause"], punct: false }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "kommen", person: "sie", tense: "praet", rest: ["zu", "spät"] }),
      spot(P("Tap the present form in a past sentence.", "Tipp auf die Präsensform."), {
        kind: "spot", tokens: ["Gestern", "gehe", "ich", "nach", "Hause"], wrongIndex: 1,
        fix: { kind: "verb", lemma: "gehen", person: "ich", tense: "praet" },
      }),
    ]));
    addUnit(L("wenn-als", "A2", "wenn and als", "wenn und als", "when and if",
      "Was passiert, wenn …?", "https://learngerman.dw.com/de/was-passiert-wenn/l-40587540",
      "wenn and als both send the verb to the end. wenn means if, or when something happens more than once. als means when it happened once in the past. Wenn ich Zeit habe, koche ich. Als ich ein Kind war, wohnte ich in Kairo. Use als with a single past event. Use wenn for the future, for if, and for repeated times.",
      "wenn = wenn oder falls, auch für Wiederholungen. als = einmal in der Vergangenheit. Das Verb steht am Ende.",
      ["wenn ich Zeit habe", "Wenn es regnet, bleibe ich zu Hause.", "als ich ein Kind war", "als wir in Berlin wohnten"],
      ["wenn ich Zeit habe", "wenn es regnet", "als ich ein Kind war", "als wir wohnten"],
      ["als ich bin jung uses the present and the wrong linker for a state that is still true. A one-time past event is als plus a past verb.", "wenn ich war ein Kind keeps the verb in the middle."],
      ["Einmal in der Vergangenheit: als.", "Nicht: wenn ich war ein Kind."],
      null, null, []), (function () {
      const out = [];
      const wenns = [
        ["haben", "ich", ["Zeit"]], ["regnen", "es", []], ["kommen", "du", ["spät"]], ["sein", "wir", ["müde"]],
      ];
      wenns.forEach(([lemma, person, rest]) => {
        if (lemma === "regnen") return;
        out.push(order(P("Build the wenn clause.", "Bau den wenn-Satz."), { kind: "clause", pattern: "sub", conj: "wenn", lemma, person, rest, punct: false }));
      });
      [["sein", "ich", ["ein", "Kind"], "praet"], ["wohnen", "wir", ["in", "Berlin"], "praet"], ["kommen", "sie", ["nach", "Hause"], "praet"]].forEach(([lemma, person, rest, tense]) => {
        out.push(order(P("One past event: als.", "Einmal in der Vergangenheit: als."), { kind: "clause", pattern: "sub", conj: "als", lemma, person, tense, rest, punct: false }));
        out.push(xform(P("Make an als clause.", "Mach einen als-Satz."),
          { kind: "clause", pattern: "statement", lemma, person, tense, rest },
          { kind: "clause", pattern: "sub", conj: "als", lemma, person, tense, rest }));
      });
      out.push(choice(P("One time in the past.", "Einmal in der Vergangenheit."), "___ ich ein Kind war", { kind: "connector", word: "als" }));
      out.push(choice(P("If, or every time.", "Falls, oder jedes Mal."), "___ ich Zeit habe, koche ich.", { kind: "connector", word: "wenn" }));
      out.push(order(P("Build the whole sentence. The main verb is in slot 2 after the clause.", "Bau den Satz."), { kind: "tokens", tokens: ["Wenn", "ich", "Zeit", "habe", "koche", "ich"], finite: "koche", finiteIndex: 4, whyEn: "habe ends the wenn clause. koche is the verb of the main clause.", whyDe: "habe beendet den wenn-Satz. koche ist das Verb im Hauptsatz." }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "sub", conj: "als", lemma: "sein", person: "ich", tense: "praet", rest: ["ein", "Kind"], punct: false }));
      ["kommen", "bleiben", "spielen", "lernen", "kochen", "schlafen"].forEach((lemma) => {
        out.push(gap(P("Finish the wenn clause.", "Beende den wenn-Satz."), "wenn ich ___", { kind: "clause", pattern: "sub", conj: "wenn", lemma, person: "ich", rest: [], punct: false }));
      });
      out.push(gap(P("One time in the past. Type the whole clause.", "Einmal in der Vergangenheit. Schreib den ganzen Satz."), "als wir ___", { kind: "clause", pattern: "sub", conj: "als", lemma: "wohnen", person: "wir", tense: "praet", rest: ["in", "Berlin"], punct: false }));
      return out;
    })());

    addUnit(L("genitive", "A2", "The genitive", "Der Genitiv", "des and der for possession",
      "Der Film war toll!", "https://learngerman.dw.com/de/der-film-war-toll/l-40601058",
      "The genitive shows possession. Masculine and neuter use des plus an -s or -es on the noun: des Mannes, des Kindes, des Buches. Feminine and plural use der and the noun usually stays the same: der Frau, der Kinder. You can often say das Auto von dem Mann instead, and that is very normal in speech. The genitive is still the form you meet in writing.",
      "Maskulin und neutral: des Mannes, des Kindes. Feminin und Plural: der Frau, der Kinder. Mündlich oft von dem.",
      ["das Auto des Mannes", "der Name des Kindes", "die Tasche der Frau", "die Bücher der Kinder"],
      ["des Mannes", "des Kindes", "der Frau", "der Kinder"],
      ["des Mann without -s is incomplete.", "von dem Mann is dative, and it is a different pattern from des Mannes."],
      ["des Mannes, nicht des Mann.", "von dem ist Dativ."],
      "French de and Arabic idafa both show possession. German writes it as des or der plus the noun.",
      "Wie französisch de oder die arabische Idāfa, aber mit des oder der.",
      []), (function () {
      const out = [];
      [["Mann", "m"], ["Freund", "m"], ["Lehrer", "m"], ["Tag", "m"], ["Kind", "n"], ["Buch", "n"], ["Haus", "n"], ["Auto", "n"], ["Frau", "f"], ["Schule", "f"], ["Stadt", "f"], ["Mutter", "f"], ["Tisch", "m"], ["Hund", "m"], ["Apfel", "m"], ["Fenster", "n"], ["Mädchen", "n"], ["Freundin", "f"]].forEach(([de, g]) => {
        const noun = G.nounBy(de) || { de, g, gen: de };
        out.push(gap(P("Genitive phrase.", "Genitiv."), "___", { kind: "article", det: "def", gender: g, kase: "gen", phrase: true, noun: de, gen: noun.gen || de }));
      });
      out.push(choice(P("von uses the dative. Which article?", "von steht mit dem Dativ."), "von ___ Mann", { kind: "prepArticle", prep: "von", gender: "m", kase: "dat" }));
      out.push(spot(P("Tap the noun that is missing its genitive -s.", "Tipp auf das Nomen ohne Genitiv-s."), {
        kind: "spot", tokens: ["das", "Auto", "des", "Mann"], wrongIndex: 3,
        fix: { kind: "literal", word: "Mannes", whyEn: "Masculine genitive adds -es: des Mannes, not des Mann.", whyDe: "Maskuliner Genitiv: des Mannes, nicht des Mann." },
      }));
      return out;
    })());

    addUnit(L("passive", "A2", "The passive", "Das Passiv", "werden plus participle, present and past",
      "Das funktioniert so!", "https://learngerman.dw.com/de/das-funktioniert-so/l-40607874",
      "The passive says what happens to something, without focusing on who does it. Use a form of werden plus the participle at the end. Present: Der Brief wird geschrieben. Die Briefe werden geschrieben. Past: Der Brief wurde geschrieben. Die Briefe wurden geschrieben. The person who does it, if you need them, comes after von plus the dative: von dem Lehrer.",
      "Präsens: wird / werden + Partizip. Präteritum: wurde / wurden + Partizip. von + Dativ für die Person.",
      ["Der Brief wird geschrieben.", "Die Briefe werden geschrieben.", "Der Kuchen wurde gemacht.", "Die Fenster wurden geöffnet."],
      ["wird geschrieben", "werden geschrieben", "wurde gemacht", "wurden geöffnet"],
      ["Der Brief wird schreiben uses the infinitive. The passive wants the participle geschrieben.", "wurde is the past. wird is the present."],
      ["Partizip, nicht Infinitiv.", "wurde ist Vergangenheit, wird ist Präsens."],
      null, null, []), (function () {
      const rows = [
        ["schreiben", "Der Brief", "sg", "präsens"], ["schreiben", "Die Briefe", "pl", "präsens"],
        ["machen", "Der Kuchen", "sg", "präsens"], ["machen", "Die Bilder", "pl", "präsens"],
        ["kaufen", "Das Auto", "sg", "präsens"], ["finden", "Die Schlüssel", "pl", "präsens"],
        ["schreiben", "Der Brief", "sg", "praet"], ["schreiben", "Die Briefe", "pl", "praet"],
        ["machen", "Der Kuchen", "sg", "praet"], ["öffnen", "Die Fenster", "pl", "praet"],
      ];
      const out = [];
      rows.forEach(([lemma, patient, num, tense]) => {
        const part = lemma === "öffnen" ? "geöffnet" : G.VERBS[lemma].part;
        out.push(gap(P("Passive, " + (tense === "praet" ? "past" : "present") + ".", "Passiv."), "___", { kind: "passive", tense, patient, num, part, lemma: lemma === "öffnen" ? null : lemma }));
      });
      out.push(xform(P("Make it passive.", "Mach das Passiv."),
        { kind: "clause", pattern: "statement", lemma: "schreiben", person: "er", rest: ["den", "Brief"] },
        { kind: "passive", tense: "präsens", patient: "Der Brief", num: "sg", part: "geschrieben", lemma: "schreiben" }));
      out.push(xform(P("Make the past passive.", "Mach das Passiv in der Vergangenheit."),
        { kind: "clause", pattern: "statement", lemma: "machen", person: "sie", rest: ["den", "Kuchen"] },
        { kind: "passive", tense: "praet", patient: "Der Kuchen", num: "sg", part: "gemacht", lemma: "machen" }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "passive", tense: "präsens", patient: "Der Brief", num: "sg", part: "geschrieben", lemma: "schreiben" }));
      out.push(spot(P("Tap the infinitive that should be a participle.", "Tipp auf den Infinitiv."), {
        kind: "spot", tokens: ["Der", "Brief", "wird", "schreiben"], wrongIndex: 3,
        fix: { kind: "verb", lemma: "schreiben", partOnly: true },
      }));
      ["wird", "wirst", "wurde", "wurden", "werden", "werdet"].forEach((form) => {
        const map = { wird: ["er", "präsens"], werden: ["sie_pl", "präsens"], wurde: ["er", "praet"], wurden: ["sie_pl", "praet"], wirst: ["du", "präsens"], werdet: ["ihr", "präsens"] };
        out.push(gap(P("Form of werden.", "Form von werden."), "___", { kind: "verb", lemma: "werden", person: map[form][0], tense: map[form][1] }));
      });
      return out;
    })());

    addUnit(L("deshalb", "B1", "deshalb, darum, deswegen", "deshalb, darum, deswegen", "reason adverbs and verb-second",
      "Geldprobleme", "https://learngerman.dw.com/de/geldprobleme/l-38466214",
      "deshalb, darum and deswegen all mean that is why. They are not weil. They start a main clause, so the verb stays in position 2. Ich bin müde. Deshalb bleibe ich zu Hause. Darum lerne ich Deutsch. Deswegen komme ich zu spät. The subject follows the verb.",
      "deshalb, darum und deswegen sind Hauptsätze. Das Verb bleibt auf Position 2: Deshalb bleibe ich zu Hause.",
      ["Deshalb bleibe ich zu Hause.", "Darum lerne ich Deutsch.", "Deswegen komme ich später."],
      ["Deshalb bleibe ich.", "Darum lerne ich.", "Deswegen komme ich."],
      ["Deshalb ich bleibe copies English. The verb must come right after deshalb.", "weil ich bleibe zu Hause mixes the two patterns."],
      ["Nicht: Deshalb ich bleibe.", "weil schickt das Verb ans Ende."],
      null, null, []), (function () {
      const fronts = ["Deshalb", "Darum", "Deswegen"];
      const rows = [["bleiben", "ich", ["zu", "Hause"]], ["lernen", "ich", ["Deutsch"]], ["kommen", "sie", ["später"]], ["bleiben", "wir", ["hier"]], ["spielen", "wir", ["Fußball"]], ["kochen", "ich", ["heute"]]];
      const out = [];
      fronts.forEach((front) => rows.forEach(([lemma, person, rest]) => {
        out.push(order(P("Start with " + front + ".", "Beginne mit " + front + "."), { kind: "clause", pattern: "inv", front, lemma, person, rest, punct: false }));
      }));
      out.push(choice(P("Which word means that is why and keeps verb-second?", "Welches Wort heißt that is why?"), "Ich bin müde. ___ bleibe ich hier.", { kind: "connector", word: "deshalb" }));
      out.push(choice(P("A synonym of deshalb.", "Ein Synonym."), "___ lerne ich Deutsch.", { kind: "connector", word: "darum" }));
      out.push(choice(P("Another synonym.", "Noch ein Synonym."), "___ komme ich später.", { kind: "connector", word: "deswegen" }));
      out.push(spot(P("Tap the subject that is sitting in the verb's slot.", "Tipp auf das Subjekt auf Platz 2."), {
        kind: "spot", tokens: ["Deshalb", "ich", "bleibe", "hier"], wrongIndex: 1,
        fix: { kind: "verb", lemma: "bleiben", person: "ich", tense: "präsens" },
      }));
      return out;
    })());

    addUnit(L("konj-modals", "B1", "könnte, müsste, sollte", "könnte, müsste, sollte", "Konjunktiv II of modal verbs",
      "Tipps und Ratschläge", "https://learngerman.dw.com/de/tipps-und-ratschläge/l-38466970",
      "These forms give advice. könnte is could, müsste is would have to, sollte is should. ich könnte, du könntest, wir könnten. The infinitive stays at the end: Du könntest früher schlafen. Du müsstest mehr trinken. Du solltest einen Arzt fragen. sollte looks like the past of sollen. Here it means advice.",
      "könnte, könntest, könnte, könnten. müsste, müsstest. sollte, solltest. Der Infinitiv steht am Ende.",
      ["Du könntest früher schlafen.", "Du müsstest mehr trinken.", "Du solltest einen Arzt fragen."],
      ["könntest schlafen", "müsstest trinken", "solltest fragen"],
      ["könnte is advice or a soft can. konnte is the plain past.", "solltest is the advice form. sollst is the plain present."],
      ["könnte ist Konjunktiv. konnte ist Vergangenheit.", "solltest ist ein Rat. sollst ist Präsens."],
      null, null, []), forms(["können", "müssen", "sollen"], ["ich", "du", "er", "sie", "wir", "ihr"], "konj2").concat([
      order(P("Build the advice.", "Bau den Rat."), { kind: "clause", pattern: "statement", lemma: "können", person: "du", tense: "konj2", rest: ["früher", "schlafen"], punct: false }),
      order(P("Build the advice.", "Bau den Rat."), { kind: "clause", pattern: "statement", lemma: "müssen", person: "du", tense: "konj2", rest: ["mehr", "trinken"], punct: false }),
      order(P("Build the advice.", "Bau den Rat."), { kind: "clause", pattern: "statement", lemma: "sollen", person: "du", tense: "konj2", rest: ["einen", "Arzt", "fragen"], punct: false }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "können", person: "wir", tense: "konj2", rest: ["helfen"] }),
    ]));

    addUnit(L("obwohl", "B1", "obwohl and trotzdem", "obwohl und trotzdem", "although versus nevertheless",
      "Rollenverteilung", "https://learngerman.dw.com/de/rollenverteilung/l-38481220",
      "obwohl means although and sends the verb to the end: obwohl ich müde bin. trotzdem means nevertheless and keeps verb-second: Trotzdem gehe ich arbeiten. Same idea, two shapes. obwohl is a subordinating conjunction. trotzdem behaves like deshalb.",
      "obwohl + Verb am Ende. trotzdem + Verb auf Position 2. obwohl ich müde bin. Trotzdem gehe ich.",
      ["obwohl ich müde bin", "obwohl es regnet", "Trotzdem gehe ich.", "Trotzdem lernen wir."],
      ["obwohl ich müde bin", "obwohl es regnet", "Trotzdem gehe ich", "Trotzdem lernen wir"],
      ["obwohl ich bin müde is the wrong order.", "Trotzdem ich gehe puts the subject in the verb slot."],
      ["Nicht: obwohl ich bin müde.", "Nicht: Trotzdem ich gehe."],
      null, null, []), (function () {
      const out = [];
      [["sein", "ich", ["müde"]], ["haben", "sie", ["keine", "Zeit"]], ["regnen", "es", []], ["wohnen", "wir", ["klein"], "skip"]].forEach(([lemma, person, rest, skip]) => {
        if (skip || lemma === "regnen") return;
        out.push(order(P("although…", "obwohl…"), { kind: "clause", pattern: "sub", conj: "obwohl", lemma, person, rest, punct: false }));
      });
      [["gehen", "ich", ["arbeiten"]], ["lernen", "wir", ["Deutsch"]], ["bleiben", "sie", ["hier"]], ["kommen", "er", ["später"]]].forEach(([lemma, person, rest]) => {
        out.push(order(P("nevertheless…", "trotzdem…"), { kind: "clause", pattern: "inv", front: "Trotzdem", lemma, person, rest, punct: false }));
      });
      out.push(choice(P("although, verb at the end.", "obwohl, Verb am Ende."), "___ ich müde bin", { kind: "connector", word: "obwohl" }));
      out.push(choice(P("nevertheless, verb second.", "trotzdem, Verb auf Position 2."), "___ gehe ich arbeiten.", { kind: "connector", word: "trotzdem" }));
      out.push(xform(P("Make an obwohl clause.", "Mach einen obwohl-Satz."),
        { kind: "clause", pattern: "statement", lemma: "sein", person: "ich", rest: ["müde"] },
        { kind: "clause", pattern: "sub", conj: "obwohl", lemma: "sein", person: "ich", rest: ["müde"] }));
      ["spielen", "kochen", "arbeiten", "schlafen", "bleiben", "lernen", "kommen", "wohnen"].forEach((lemma) => {
        out.push(gap(P("Finish obwohl.", "Beende obwohl."), "obwohl wir ___", { kind: "clause", pattern: "sub", conj: "obwohl", lemma, person: "wir", rest: [], punct: false }));
      });
      ["arbeiten", "schlafen"].forEach((lemma) => {
        out.push(gap(P("Finish obwohl for ich.", "Beende obwohl für ich."), "obwohl ich ___", { kind: "clause", pattern: "sub", conj: "obwohl", lemma, person: "ich", rest: [], punct: false }));
      });
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "inv", front: "Trotzdem", lemma: "gehen", person: "ich", rest: ["arbeiten"] }));
      return out;
    })());

    addUnit(L("zu-inf", "B1", "Infinitive with zu", "Infinitiv mit zu", "zu before the infinitive",
      "Partnerschaft", "https://learngerman.dw.com/de/partnerschaft/l-38481801",
      "After verbs and expressions such as versuchen, vorhaben, vergessen and es ist wichtig, the second verb takes zu. Ich versuche, Deutsch zu lernen. The comma is normal. With a separable verb, zu slides into the middle: Ich versuche, früh aufzustehen. Ich habe vor, heute einzukaufen. um … zu gives a purpose: Ich lerne Deutsch, um in Berlin zu arbeiten.",
      "Ich versuche, Deutsch zu lernen. Trennbare Verben: aufzustehen, einzukaufen. um … zu nennt einen Zweck.",
      ["Deutsch zu lernen", "früh aufzustehen", "heute einzukaufen", "um pünktlich zu sein"],
      ["zu lernen", "aufzustehen", "einzukaufen", "um … zu sein"],
      ["Ich versuche, Deutsch lernen is missing zu.", "A separable verb takes zu in the middle: aufzustehen, not aufstehen."],
      ["zu fehlt.", "aufzustehen."],
      null, null, []), (function () {
      const rows = [
        ["Ich versuche", "lernen", "Deutsch"], ["Ich versuche", "aufstehen", "früh"], ["Ich habe vor", "einkaufen", "heute"],
        ["Es ist wichtig", "sein", "pünktlich"], ["Vergiss nicht", "anrufen", ""], ["Ich versuche", "mitkommen", "heute"],
        ["Es ist schön", "bleiben", "hier"], ["Ich habe keine Zeit", "kochen", "heute"],
      ];
      const out = [];
      rows.forEach(([lead, lemma, mid]) => {
        out.push(gap(P("Add zu.", "Setze zu ein."), "___", { kind: "zu", lead, lemma, mid }));
      });
      ["lesen", "schreiben", "fragen", "hören", "suchen"].forEach((lemma) => {
        out.push(gap(P("zu + infinitive.", "zu + Infinitiv."), "Ich versuche, das ___", { kind: "zu", lead: "Ich versuche", lemma, mid: "das" }));
      });
      out.push(gap(P("zu + infinitive.", "zu + Infinitiv."), "Ich versuche, dir ___", { kind: "zu", lead: "Ich versuche", lemma: "helfen", mid: "dir" }));
      out.push(gap(P("zu + infinitive.", "zu + Infinitiv."), "Ich versuche, pünktlich ___", { kind: "zu", lead: "Ich versuche", lemma: "kommen", mid: "pünktlich" }));
      out.push(gap(P("zu + infinitive.", "zu + Infinitiv."), "Ich versuche, jetzt ___", { kind: "zu", lead: "Ich versuche", lemma: "gehen", mid: "jetzt" }));
      out.push(gap(P("zu + infinitive.", "zu + Infinitiv."), "Ich versuche, hier ___", { kind: "zu", lead: "Ich versuche", lemma: "bleiben", mid: "hier" }));
      out.push(order(P("Purpose with um … zu.", "Zweck mit um … zu."), { kind: "tokens", tokens: ["Ich", "lerne", "Deutsch", "um", "zu", "arbeiten"], finite: "lerne", finiteIndex: 1, whyEn: "um zu arbeiten gives the purpose. lernen is the main verb in slot 2.", whyDe: "um zu arbeiten nennt den Zweck." }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "zu", lead: "Ich versuche", lemma: "aufstehen", mid: "früh" }));
      out.push(spot(P("Tap the infinitive that is missing zu inside it.", "Tipp auf den Infinitiv ohne zu."), {
        kind: "spot", tokens: ["Ich", "versuche", "früh", "aufstehen"], wrongIndex: 3,
        fix: { kind: "zu", lead: "Ich versuche", lemma: "aufstehen", mid: "früh" },
      }));
      return out;
    })());

    addUnit(L("konj-hs", "B1", "hätte, wäre, würde", "hätte, wäre, würde", "Konjunktiv II of haben, sein and werden",
      "Schulalltag", "https://learngerman.dw.com/de/schulalltag/l-38485158",
      "hätte is the would-have form of haben. wäre is the would-be form of sein. würde plus an infinitive softens almost any verb. Wenn ich Zeit hätte, würde ich kommen. Wenn ich in Berlin wäre, wäre ich glücklich. The wenn clause is verb-final. The main clause is verb-second: würde ich kommen.",
      "hätte, wäre, würde. Wenn ich Zeit hätte, würde ich kommen. Im wenn-Satz steht das Verb am Ende.",
      ["ich hätte, du hättest, wir hätten", "ich wäre, du wärest, wir wären", "Wenn ich Zeit hätte, würde ich kommen."],
      ["hätte, hättest, hätten", "wäre, wärest, wären", "würde ich kommen"],
      ["hätte is not hatte. hatte is the plain past.", "Wenn ich würde haben is heavier than Wenn ich hätte. Prefer hätte."],
      ["hätte ist nicht hatte.", "Besser hätte als würde haben."],
      null, null, []), forms(["haben", "sein", "werden"], ["ich", "du", "er", "wir", "Sie"], "konj2").concat([
      order(P("Build the wenn clause.", "Bau den wenn-Satz."), { kind: "clause", pattern: "sub", conj: "wenn", lemma: "haben", person: "ich", tense: "konj2", rest: ["Zeit"], punct: false }),
      order(P("Build the wenn clause.", "Bau den wenn-Satz."), { kind: "clause", pattern: "sub", conj: "wenn", lemma: "sein", person: "ich", tense: "konj2", rest: ["in", "Berlin"], punct: false }),
      order(P("Build the result.", "Bau den Hauptsatz."), { kind: "clause", pattern: "inv", front: "Dann", lemma: "werden", person: "ich", tense: "konj2", rest: ["kommen"], punct: false }),
      order(P("Build the whole sentence.", "Bau den ganzen Satz."), { kind: "tokens", tokens: ["Wenn", "ich", "Zeit", "hätte", "würde", "ich", "kommen"], finite: "würde", finiteIndex: 4, whyEn: "hätte ends the wenn clause. würde is the main verb.", whyDe: "hätte beendet den wenn-Satz. würde ist das Verb im Hauptsatz." }),
      listen(P("Listen and type.", "Hör zu und schreib."), { kind: "clause", pattern: "statement", lemma: "sein", person: "ich", tense: "konj2", rest: ["glücklich"] }),
    ]));

    addUnit(L("wegen", "B1", "Genitive prepositions", "Präpositionen mit Genitiv", "wegen, trotz, während, statt",
      "Wegen des Wetters", "https://learngerman.dw.com/de/wegen-des-wetters/l-38489408",
      "wegen, trotz, während and statt take the genitive in careful German. wegen des Wetters, trotz des Regens, während der Pause, statt des Autos. Masculine and neuter: des plus -s. Feminine: der. In everyday speech you will hear wegen dem. This course keeps the genitive.",
      "wegen des Wetters, trotz des Regens, während der Pause, statt des Autos. Umgangssprachlich hört man wegen dem. Hier bleibt der Genitiv.",
      ["wegen des Wetters", "wegen der Schule", "trotz des Regens", "während der Pause", "statt des Autos"],
      ["wegen des Wetters", "wegen der Schule", "trotz des Regens", "während der Pause", "statt des Autos"],
      ["wegen dem Wetter is the casual dative. The written form here is wegen des Wetters.", "während der Pause uses der, because Pause is feminine."],
      ["wegen des Wetters, nicht wegen dem Wetter.", "Pause ist feminin: der."],
      null, null, []), (function () {
      const rows = [
        ["wegen", "n", "Wetter", "Wetters"], ["wegen", "f", "Schule", "Schule"], ["wegen", "m", "Mann", "Mannes"],
        ["wegen", "n", "Kind", "Kindes"], ["wegen", "f", "Stadt", "Stadt"], ["trotz", "m", "Regen", "Regens"],
        ["trotz", "n", "Wetter", "Wetters"], ["während", "f", "Pause", "Pause"], ["während", "m", "Tag", "Tages"],
        ["während", "f", "Schule", "Schule"], ["statt", "n", "Auto", "Autos"], ["statt", "m", "Kaffee", "Kaffees"],
        ["statt", "f", "Tasche", "Tasche"], ["wegen", "n", "Haus", "Hauses"],
        ["wegen", "m", "Freund", "Freundes"], ["trotz", "n", "Kind", "Kindes"],
        ["während", "n", "Jahr", "Jahres"], ["statt", "m", "Tisch", "Tisches"],
      ];
      const out = [];
      rows.forEach(([prep, g, noun, gen]) => {
        out.push((out.length % 2 === 0 ? choice : gap)(P(prep + " + genitive.", prep + " + Genitiv."), "___", { kind: "genPrep", prep, gender: g, noun, gen }));
      });
      out.push(spot(P("Tap the dative article after wegen.", "Tipp auf den Dativ nach wegen."), {
        kind: "spot", tokens: ["wegen", "dem", "Wetter"], wrongIndex: 1,
        fix: { kind: "genPrep", prep: "wegen", gender: "n", noun: "Wetter", gen: "Wetters" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "genPrep", prep: "wegen", gender: "n", noun: "Wetter", gen: "Wetters" }));
      return out;
    })());

    addUnit(L("rel-gen", "B1", "Relative clauses in the genitive and dative", "Relativsätze im Genitiv und Dativ", "dessen, deren, dem, denen",
      "Hin und zurück?", "https://learngerman.dw.com/de/hin-und-zurück/l-38585901",
      "Dative relative pronouns: dem for masculine and neuter, der for feminine, denen for plural. der Mann, dem ich helfe. die Frau, der ich danke. die Freunde, denen ich schreibe. Genitive: dessen for masculine and neuter, deren for feminine and plural. der Mann, dessen Auto neu ist. die Frau, deren Tasche rot ist.",
      "Dativ: dem, der, denen. Genitiv: dessen, deren. der Mann, dem ich helfe. der Mann, dessen Auto neu ist.",
      ["der Mann, dem ich helfe", "die Frau, der ich danke", "die Freunde, denen ich schreibe", "der Mann, dessen Auto neu ist", "die Frau, deren Kind hier wohnt"],
      ["dem ich helfe", "der ich danke", "denen ich schreibe", "dessen Auto", "deren Kind"],
      ["denen is plural dative. dem is singular.", "dessen does not change for the thing possessed. The car can be any gender."],
      ["denen ist Plural. dem ist Singular.", "dessen bleibt dessen."],
      null, null, []), (function () {
      const out = [];
      [["m", "dat", "der Mann,", "ich helfe"], ["n", "dat", "das Kind,", "ich helfe"], ["f", "dat", "die Frau,", "ich danke"], ["pl", "dat", "die Freunde,", "ich schreibe"], ["m", "gen", "der Mann,", "Auto neu ist"], ["n", "gen", "das Kind,", "Buch neu ist"], ["f", "gen", "die Frau,", "Tasche rot ist"], ["pl", "gen", "die Freunde,", "Haus groß ist"], ["m", "dat", "der Lehrer,", "ich helfe"], ["f", "dat", "die Freundin,", "ich schreibe"]].forEach(([g, kase, left, right]) => {
        out.push(gap(P("Relative pronoun, " + kase + ".", "Relativpronomen."), left + " ___ " + right, { kind: "rel", gender: g, kase }));
        out.push(choice(P("Pick the pronoun.", "Wähle das Pronomen."), left + " ___ " + right, { kind: "rel", gender: g, kase }));
      });
      return out;
    })());

    addUnit(L("n-decl", "B1", "The n-declension", "Die n-Deklination", "masculine nouns that add -n or -en",
      "Zukunftspläne", "https://learngerman.dw.com/de/zukunftspläne/l-38574989",
      "A small group of masculine nouns adds -n or -en in every case except the nominative singular. der Student, den Studenten, dem Studenten, des Studenten. Same pattern: Junge, Kollege, Nachbar, Name, Mensch. Herr is the odd one. It only adds -n: den Herrn, dem Herrn, des Herrn. Not den Herren, which is the plural.",
      "der Student, den Studenten, dem Studenten. Herr nur -n: den Herrn, dem Herrn. den Herren ist Plural.",
      ["den Studenten", "dem Kollegen", "des Namen", "den Herrn", "dem Herrn"],
      ["den Studenten", "dem Kollegen", "den Namen", "den Herrn", "dem Herrn"],
      ["den Student keeps the nominative form. Accusative is den Studenten.", "den Herren is plural. The singular accusative is den Herrn."],
      ["Nicht den Student.", "Singular: den Herrn. Plural: die Herren."],
      null, null, []), (function () {
      const out = [];
      Object.keys(G.NDECL).forEach((lemma) => {
        ["acc", "dat", "gen"].forEach((kase) => {
          out.push(gap(P(lemma + ", " + kase + ".", lemma + ", " + kase + "."), "___", { kind: "ndeclPhrase", lemma, kase, det: "def" }));
        });
      });
      out.push(spot(P("Tap the nominative form used after den.", "Tipp auf die Nominativform nach den."), {
        kind: "spot", tokens: ["Ich", "sehe", "den", "Student"], wrongIndex: 3,
        fix: { kind: "ndecl", lemma: "Student", kase: "acc" },
      }));
      out.push(spot(P("Tap the plural form used for one Herr.", "Tipp auf die Pluralform."), {
        kind: "spot", tokens: ["Ich", "sehe", "den", "Herren"], wrongIndex: 3,
        fix: { kind: "ndecl", lemma: "Herr", kase: "acc" },
      }));
      out.push(listen(P("Listen and type.", "Hör zu und schreib."), { kind: "ndeclPhrase", lemma: "Herr", kase: "dat", det: "def" }));
      return out;
    })());
  }
});
