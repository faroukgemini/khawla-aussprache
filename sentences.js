/* Sentence decks – everyday German, with English translations. */
window.DECKS = {
  A1: {
    title: "A1 · Anfänger",
    subtitle: "Beginner",
    emoji: "🌱",
    sentences: [
      { de: "Hallo, ich heiße Khawla.", en: "Hello, my name is Khawla." },
      { de: "Wie geht es dir?", en: "How are you?" },
      { de: "Mir geht es gut, danke.", en: "I'm fine, thank you." },
      { de: "Ich komme aus Marokko.", en: "I come from Morocco." },
      { de: "Ich trinke gern Tee mit Minze.", en: "I like drinking mint tea." },
      { de: "Wo ist der Bahnhof?", en: "Where is the train station?" },
      { de: "Ich hätte gern ein Brötchen, bitte.", en: "I'd like a bread roll, please." },
      { de: "Das Wetter ist heute schön.", en: "The weather is nice today." },
      { de: "Ich habe eine kleine Schwester.", en: "I have a little sister." },
      { de: "Wie viel kostet das?", en: "How much does that cost?" },
      { de: "Am Wochenende male ich gern.", en: "I like to paint on the weekend." },
      { de: "Entschuldigung, sprechen Sie Englisch?", en: "Excuse me, do you speak English?" },
      { de: "Ich wohne in einer schönen Wohnung.", en: "I live in a nice apartment." },
      { de: "Morgen habe ich leider keine Zeit.", en: "Unfortunately I don't have time tomorrow." },
      { de: "Gute Nacht und süße Träume!", en: "Good night and sweet dreams!" }
    ]
  },
  A2: {
    title: "A2 · Grundlagen",
    subtitle: "Elementary",
    emoji: "🌼",
    sentences: [
      { de: "Gestern bin ich mit dem Fahrrad zur Arbeit gefahren.", en: "Yesterday I rode my bike to work." },
      { de: "Kannst du mir bitte das Salz geben?", en: "Can you pass me the salt, please?" },
      { de: "Ich möchte einen Termin beim Arzt machen.", en: "I'd like to make a doctor's appointment." },
      { de: "Am Samstag gehen wir zusammen ins Kino.", en: "On Saturday we're going to the cinema together." },
      { de: "Der Zug hat leider zehn Minuten Verspätung.", en: "Unfortunately the train is ten minutes late." },
      { de: "Ich habe meinen Schlüssel zu Hause vergessen.", en: "I forgot my key at home." },
      { de: "Im Sommer fahren wir oft ans Meer.", en: "In summer we often go to the seaside." },
      { de: "Könnten Sie das bitte noch einmal wiederholen?", en: "Could you please repeat that once more?" },
      { de: "Mein Lieblingstier ist das Wasserschwein.", en: "My favourite animal is the capybara." },
      { de: "Die Bienen fliegen von Blume zu Blume.", en: "The bees fly from flower to flower." },
      { de: "Ich lerne Deutsch, weil ich in Deutschland arbeiten möchte.", en: "I'm learning German because I'd like to work in Germany." },
      { de: "Wir treffen uns um halb acht vor dem Café.", en: "We'll meet at half past seven in front of the café." },
      { de: "Es regnet, deshalb nehme ich einen Regenschirm mit.", en: "It's raining, so I'm taking an umbrella." },
      { de: "Zum Frühstück esse ich Brot mit Käse.", en: "For breakfast I eat bread with cheese." },
      { de: "Ich freue mich schon auf die Ferien.", en: "I'm already looking forward to the holidays." }
    ]
  },
  B1: {
    title: "B1 · Mittelstufe",
    subtitle: "Intermediate",
    emoji: "🌸",
    sentences: [
      { de: "Obwohl es spät war, haben wir noch lange geredet.", en: "Although it was late, we talked for a long time." },
      { de: "Wenn ich mehr Zeit hätte, würde ich öfter reisen.", en: "If I had more time, I would travel more often." },
      { de: "Ich interessiere mich besonders für Kunst und Malerei.", en: "I'm especially interested in art and painting." },
      { de: "Könnten Sie mir sagen, wann der nächste Bus abfährt?", en: "Could you tell me when the next bus leaves?" },
      { de: "Nachdem ich die Prüfung bestanden hatte, habe ich gefeiert.", en: "After I had passed the exam, I celebrated." },
      { de: "Es ist wichtig, dass man regelmäßig Sport treibt.", en: "It's important to exercise regularly." },
      { de: "Ich habe mich über dein Geschenk sehr gefreut.", en: "I was really happy about your present." },
      { de: "Die Wohnung, die wir besichtigt haben, war leider zu teuer.", en: "The apartment we viewed was unfortunately too expensive." },
      { de: "Je öfter ich übe, desto sicherer werde ich.", en: "The more I practise, the more confident I become." },
      { de: "Ich bin davon überzeugt, dass Fehler zum Lernen gehören.", en: "I'm convinced that mistakes are part of learning." },
      { de: "Trotz des schlechten Wetters sind wir wandern gegangen.", en: "Despite the bad weather, we went hiking." },
      { de: "Würdest du mir bitte bei der Bewerbung helfen?", en: "Would you please help me with the job application?" },
      { de: "Seit ich in der Stadt wohne, fahre ich kaum noch Auto.", en: "Since I've been living in the city, I hardly drive any more." },
      { de: "Eichhörnchen sammeln im Herbst Nüsse für den Winter.", en: "Squirrels gather nuts in autumn for the winter." },
      { de: "Die Aussprache ist am Anfang schwierig, aber es macht Spaß.", en: "Pronunciation is hard at first, but it's fun." }
    ]
  }
};

/* Little sound tips, shown when a sentence contains a tricky sound. */
window.SOUND_TIPS = [
  { test: /ü/i, tip: "ü: Sag „i“ und mach dabei einen Kussmund. · Say “ee” with rounded lips." },
  { test: /ö/i, tip: "ö: Sag „e“ mit runden Lippen. · Say “e” with rounded lips." },
  { test: /(?<![aousc])ch/i, tip: "ich-Laut: wie ein leises Fauchen einer Katze 🐱 · like a soft cat hiss." },
  { test: /(a|o|u|au)ch/i, tip: "ach-Laut: hinten im Hals, wie arabisches „خ“. · Back of the throat, like Arabic “kh”." },
  { test: /ei/i, tip: "ei klingt wie „ai“ (mein = „main“). · “ei” sounds like English “eye”." },
  { test: /ie/i, tip: "ie ist ein langes „i“ (die = „dii“). · “ie” is a long “ee”." },
  { test: /eu|äu/i, tip: "eu/äu klingt wie „oi“ (heute = „hoite“). · Sounds like “oy”." },
  { test: /(^|\s)sp|(^|\s)st/i, tip: "sp/st am Wortanfang: „schp“/„scht“. · At the start of a word say “shp”/“sht”." },
  { test: /z/i, tip: "z klingt wie „ts“ (Zeit = „tsait“). · “z” sounds like “ts”." },
  { test: /w/i, tip: "w klingt wie englisches „v“. · German “w” = English “v”." },
  { test: /r/i, tip: "r: weich hinten im Hals, fast wie arabisches „غ“. · Soft, at the back – close to Arabic “gh”." }
];
