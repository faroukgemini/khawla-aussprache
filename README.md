# Khawlas Aussprache-Garten 🐹🐝

A cute, static web app for practising **German pronunciation** with
**Azure Speech Pronunciation Assessment (de-DE)**, made for Khawla.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell, inline SVG mascot (Kapi the capybara + a bee), 3 views |
| `styles.css` | Pastel, mobile-first, responsive styles (2 columns ≥ 900 px) |
| `app.js` | All logic: decks, recording, Azure assessment, TTS, demo mode, progress, settings |
| `sentences.js` | A1/A2/B1 decks (15 sentences each, DE + EN) and sound tips |
| `vendor/speech-sdk-1.52.0.min.js` | Bundled `microsoft-cognitiveservices-speech-sdk` 1.52.0 browser build (lazy-loaded only when a key is used) |
| `manifest.webmanifest`, `icons/` | PWA manifest + icons (SVG, 192, 512, maskable) |
| `sw.js` | Service worker: caches the app shell for offline opening (scoring still needs internet) |

## Run locally
The site files live at the repository root (no build step).
```bash
python3 -m http.server 8080
# open http://localhost:8080   (localhost counts as secure, so the mic works)
```
On a phone the page **must be served over HTTPS** or the browser blocks the microphone.
Published with GitHub Pages at https://faroukgemini.github.io/khawla-aussprache/ (project site, so asset, manifest, and service-worker URLs stay relative to that path).

## Setup with Azure
1. Create a free (F0) **Speech** resource in the Azure portal.
2. In the app, open ⚙️ **Einstellungen**, paste **Key** + **Region** (default `northeurope`), turn off Demo-Modus, tap **Speichern**, then **Verbindung testen**. If it works, it speaks "Hallo Khawla!".
3. The key is stored only in this browser's `localStorage`; nothing secret is in the code.

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
