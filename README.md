# Khawlas Aussprache-Garten 🐹🐝

A cute, static web app for practising **German pronunciation** with
**Azure Speech Pronunciation Assessment (de-DE)**, made for Khawla.

Kapi, the capybara in the header and on the practice card, can be tapped or stroked. Hearts, a squint, and a little chirp follow. The speaker button on Kapi mutes that chirp. The pet count and mute are part of that person's progress and sync with everything else.

The interface language is German or English. The DE/EN switch sits on the login card and in the header. English is the default for everyone, including the login screen and a fresh browser, until that person taps DE or EN. Only that tap is remembered; an old automatic German default is not. The choice is stored per person and syncs with the rest of their progress. Practice sentences stay German. The first time someone logs in, Kapi walks them through the screen. When that walkthrough is updated, everyone sees the new one once, including people who already finished or skipped the old one. **Show guide again** is under More. All interface strings live in `i18n.js` (`de` and `en`). To add a language later (French, Arabic, and so on), copy the `en` object, translate the values, and add a `data-lang` button inside each `.lang-switch`.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell, mascot, login, practice / review / progress / settings |
| `styles.css` | Pastel, mobile-first styles |
| `i18n.js` | Interface strings (`de` / `en`). Practice sentences are not in here |
| `app.js` | Practice, Azure scoring, two users, sync, backup, guide |
| `logic.js` | Unlock rule, review schedule, merge, weak sounds |
| `sentences.js` | 30 themed units (300 sentences, A1–B1) and sound tips |
| `firebase/firestore.rules` | Rules to paste into Firebase (only Farouk and Khawla) |
| `vendor/speech-sdk-1.52.0.min.js` | Azure Speech SDK, loaded only when a key is used |
| `vendor/qrcode.js` | QR code for Khawla's setup link (MIT, Kazuhiko Arase) |
| `manifest.webmanifest`, `icons/` | PWA manifest and icons |
| `sw.js` | Offline shell. Scoring and sync still need the network |

## Run locally
The site files live at the repository root (no build step).
```bash
python3 -m http.server 8080
# open http://localhost:8080   (localhost counts as secure, so the mic works)
```
On a phone the page **must be served over HTTPS** or the browser blocks the microphone.
Published with GitHub Pages at https://faroukgemini.github.io/khawla-aussprache/ (project site, so asset, manifest, and service-worker URLs stay relative to that path).

## People
Type a name on the first screen. **Khawla** is the learner. **Farouk** is the admin (Azure key, sync, custom lessons, her progress). There is no password in the app. Khawla gets a "Liebst du mich?" gate; the No button dodges. Each person has their own progress on the device. Log out from **Mehr**.

The app works fully without cloud sync. Progress stays in `localStorage` until you export it or turn sync on.

## Setup with Azure
1. Create a free (F0) **Speech** resource in the Azure portal.
2. Log in as Farouk, open **Mehr**, paste **Key** and **Region** (default `northeurope`), tap **Speichern**, then **Verbindung testen**.
3. The key stays in this browser. It is not in the repository. A phone set up from the link **without** “Include the Azure key” has no speech key, so holding the microphone shows a message and saves nothing. To score on Khawla's phone, either make a new setup link with **Include the Azure key** ticked, or log in as Farouk on that phone and paste the key and region under **Mehr**. Anyone with a link that contains the key could spend the Speech quota.

## Cloud sync (Firebase, free Spark plan)
Chosen because a static GitHub Pages site can talk to Firestore directly. The web `apiKey` is public by design; **security is the rules file**, not a hidden key. Do not create or paste a service-account / admin SDK key.

Do this once, in order:

1. Open https://console.firebase.google.com/ and create a project (Analytics can stay off).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Authentication → Users → Add user**, twice, with the **same** password (this password is the app's sync password):
   - `khawla@aussprache.app`
   - `farouk@aussprache.app`
   Use those exact addresses. They do not need to be real inboxes. Do not turn on email verification.
4. **Build → Firestore Database → Create database.** Pick the Native / production mode (rules start locked) and a region near you, for example `eur3` (Europe).
5. **Firestore → Rules**, replace everything with the contents of `firebase/firestore.rules` in this repo, then **Publish**. If an older copy is already published, paste this file again: Khawla's activity uses `users/khawla/meta/*`, and the previous rules denied every subcollection.
6. **Project settings (gear) → General → Your apps → Web (`</>`) → Register app.** Copy `apiKey`, `authDomain`, `projectId`, and `appId` from the `firebaseConfig` snippet. You do not need Analytics.
7. In the app, as Farouk: **Mehr → Cloud-Sync**. Paste those four values and the shared password. Tap **Sync speichern** (the page reloads), then **Sync testen**.
8. **Link und QR erzeugen.** Leave **Azure-Schlüssel in den Link** off if the phone should only sync. Tick it when that phone should score speech for real, then open the new link on her phone (or let her scan the new QR) and type her name. The link's payload is in the URL hash, so GitHub Pages does not receive it, but it stays in browser history — don't post it. An older link that left the key out does not add a key later; make a new one with the box ticked, or enter the key on that phone.

What syncs: each person's progress (`users/khawla`, `users/farouk`) and custom lessons (`shared/catalog`). After every attempt the phone uploads within about a second, and it also syncs when the app opens, comes online, or is hidden. If two phones practised offline, the merge keeps the higher best score per sentence and the union of attempts (same attempt id is stored once). A reset wins over older tries. Farouk's **Fortschritt** page can pull Khawla's latest document and shows when it was fetched.

Khawla's practice activity is separate, so a heartbeat does not rewrite her progress: `users/khawla/meta/presence` (last seen, about once a minute while the app is open and the tab is visible, and once more when it hides) and `users/khawla/meta/activity` (about 60 days of session summaries: sessions, active minutes, sentences, average score, first and last time). A session ends after 5 minutes hidden. Farouk's progress page shows whether she is online, today, and the last 14 days, and it listens for presence while that page is open. The app stores no location and no audio. On **Mehr**, Khawla sees that Farouk can see when she practises and for how long.

Export / import on **Mehr** is the backup if Firebase is down. "Alles exportieren" can include the Azure key only if that checkbox is on.

Spark (free) quotas are plenty for two people. You should not need a billing account.

## How it works
* **Recording:** hold the microphone, speak, then let go. Audio is streamed to `SpeechRecognizer.startContinuousRecognitionAsync` (de-DE) with `PronunciationAssessmentConfig(referenceText, HundredMark, Phoneme, enableMiscue=true)`. There is no demo scorer. Silence, a NoMatch, an empty transcript, or a result that is only omitted words saves nothing and says to hold the button and speak. When the app opens it asks Azure for a short-lived token (cached for 10 minutes). No key, a rejected key, a wrong region, or a used-up quota fills the screen in red — Kapi looks worried and Khawla is told to go to Farouk — and nothing is saved. Farouk gets a button to the Azure settings. Try again re-checks. If the phone is simply offline, that screen stays calm instead of red.
* **Results:** the sentence score is accuracy across every reference word (a missing word is 0), with completeness as a multiplier and fluency weighted lightly. **Strict** (Khawla's default) also caps the sentence at the weakest word + 15. Farouk sets Gentle / Normal / Strict under **Mehr**; it syncs on Khawla's progress. Strict passes at 85 and masters at 92, and words under 75 are red. Gentle and Normal pass at 80. Older saved scores are not rewritten. Attempts stored with `demo: true` are left in the history list (marked demo) and are left out of averages, stars, and unlocks.
* **Listen:** Azure neural TTS (Katja / Amala / Seraphina / Conrad / Florian) at normal or slow speed (SSML `prosody rate=-30%`). If no key is set or Azure fails, the browser's `speechSynthesis` (de-DE) is used. Listening does not create a score.
* **Stars:** ≥60 = ★, ≥75 = ★★, ≥90 = ★★★ (best real score per sentence counts). Days practised give a streak. Everything is stored in `localStorage`.

## Limitations
* For **de-DE, Azure returns a score for each sound but leaves the sound names empty** (even with `phonemeAlphabet = "IPA"`). The app estimates IPA names from the spelling when its sound count matches Azure's (19/19 words in tests). Otherwise it labels them "Laut 1, 2, …". The phoneme panel says that the names are estimated.
* Azure only gives a **Prosody** score for en-US. For German that bar shows "n/a". The setting "Prosodie anfragen" exists in case Azure adds it.
* Scoring needs a valid Azure Speech key and region on that device, plus remaining quota. Without them the microphone does not invent a score.
* The key is sent from the browser (as the Speech SDK does with subscription keys). That's fine for personal use, but for a public site use a small token server instead.
* The browser voice fallback depends on the device having a German voice.
