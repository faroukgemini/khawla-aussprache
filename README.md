# Khawlas Aussprache-Garten 🐹🐝

A cute, static web app for practising **German pronunciation** with
**Azure Speech Pronunciation Assessment (de-DE)**, made for Khawla.

Kapi, the capybara in the header and on the practice card, can be tapped or stroked. Hearts, a squint, and a little chirp follow. The speaker button on Kapi mutes that chirp. The pet count and mute are part of that person's progress and sync with everything else.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell, mascot, login, practice / review / progress / settings |
| `styles.css` | Pastel, mobile-first styles |
| `app.js` | Practice, Azure scoring, two users, sync, backup |
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
2. Log in as Farouk, open **Mehr**, paste **Key** and **Region** (default `northeurope`), turn off Demo-Modus, tap **Speichern**, then **Verbindung testen**.
3. The key stays in this browser. It is not in the repository. Khawla's phone uses demo scores until you opt in to putting the key in her setup link (see below). Anyone with that link could then spend the Speech quota.

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
5. **Firestore → Rules**, replace everything with the contents of `firebase/firestore.rules` in this repo, then **Publish**.
6. **Project settings (gear) → General → Your apps → Web (`</>`) → Register app.** Copy `apiKey`, `authDomain`, `projectId`, and `appId` from the `firebaseConfig` snippet. You do not need Analytics.
7. In the app, as Farouk: **Mehr → Cloud-Sync**. Paste those four values and the shared password. Tap **Sync speichern** (the page reloads), then **Sync testen**.
8. **Link und QR erzeugen.** Leave **Azure-Schlüssel in den Link** off unless her phone should score for real. Open the link on her phone, or let her scan the QR, then she types her name. The link's payload is in the URL hash, so GitHub Pages does not receive it, but it stays in browser history — don't post it.

What syncs: each person's progress (`users/khawla`, `users/farouk`) and custom lessons (`shared/catalog`). After every attempt the phone uploads within about a second, and it also syncs when the app opens, comes online, or is hidden. If two phones practised offline, the merge keeps the higher best score per sentence and the union of attempts (same attempt id is stored once). A reset wins over older tries. Farouk's **Fortschritt** page can pull Khawla's latest document and shows when it was fetched.

Export / import on **Mehr** is the backup if Firebase is down. "Alles exportieren" can include the Azure key only if that checkbox is on.

Spark (free) quotas are plenty for two people. You should not need a billing account.

## How it works
* **Recording:** `SpeechRecognizer` (de-DE, default mic) + `PronunciationAssessmentConfig(referenceText, HundredMark, Phoneme, enableMiscue=true)`, `recognizeOnceAsync`. It stops by itself after about 1.5 s of silence. Tap again to cancel.
* **Results:** overall PronScore, Accuracy, Fluency, Completeness, Prosody (when Azure returns it). Each word is coloured green (≥80), yellow (60–79) or red (<60). Words that were left out are grey and crossed through, and extra words are purple. Tap a word to see its phoneme scores.
* **Listen:** Azure neural TTS (Katja / Amala / Seraphina / Conrad / Florian) at normal or slow speed (SSML `prosody rate=-30%`). If no key is set or Azure fails, the browser's `speechSynthesis` (de-DE) is used.
* **Stars:** ≥60 = ★, ≥75 = ★★, ≥90 = ★★★ (best score per sentence counts). Days practised give a streak. Everything is stored in `localStorage`.
* **Demo mode:** scores are simulated and phonemes are a rough guess from the spelling, so the app can be tried without a key.

## Limitations
* For **de-DE, Azure returns a score for each sound but leaves the sound names empty** (even with `phonemeAlphabet = "IPA"`). The app estimates IPA names from the spelling when its sound count matches Azure's (19/19 words in tests). Otherwise it labels them "Laut 1, 2, …". The phoneme panel says that the names are estimated.
* Azure only gives a **Prosody** score for en-US. For German that bar shows "n/a". The setting "Prosodie anfragen" exists in case Azure adds it.
* `recognizeOnceAsync` scores one utterance. A long pause (>1.5 s) in the middle of a sentence ends the recording early.
* The key is sent from the browser (as the Speech SDK does with subscription keys). That's fine for personal use, but for a public site use a small token server instead.
* The browser voice fallback depends on the device having a German voice.
