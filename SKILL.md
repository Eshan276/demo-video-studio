---
name: demo-video-studio
description: Make a product demo video from the real, running product with burned-in subtitles, then add the user's own voice-over through a local recording studio that re-times every scene to their reading. Use when the user says "demo video", "product walkthrough video", "record a demo", "screen recording with subtitles", "add a voice-over", "narrate the video", "record my voice for the video", "voiceover studio", or needs a hackathon/pitch/launch/internal-update video of a web app, dashboard, API or CLI.
---

# Demo video studio

Produces two files from one recording:
- `<name>.mp4`: silent cut with burned-in subtitles (+ `.srt`), ready to post.
- `<name>-voiced.mp4`: the same cut with the user's narration, each scene stretched or sped up to match their takes, subtitles in sync, loudness -16 LUFS.

Everything is recorded from the real system in a headless Chrome. Title cards, terminal replays and data tables are rendered as HTML in the project's colours, with real values pulled from the system, never mocked.

Scripts live in this skill's `scripts/` folder (call it `$S` below; resolve it to the absolute path of this skill).

## 0. Setup (once per machine)

```bash
node --version          # 18+
ffmpeg -version         # with libass (for subtitles) — `ffmpeg -filters | grep ass`
npm install --prefix $S # installs puppeteer-core next to kit.mjs
```
Chrome or Chromium must be installed; set `CHROME_PATH` if it is not in a standard location. Subtitles use the font in `theme.subtitles.font` (default Noto Sans; check with `fc-list | grep -i "noto sans"` and pick an installed font if missing).

## 1. Plan the video with the user first

Before recording, propose the video and get a yes:
- Audience and where it will be shown (hackathon judges, X post, internal demo, customer).
- 6–10 beats for 60–120 s: hook → problem → the product doing the real thing (2–4 beats) → proof (logs, data, a transaction, a metric) → end card with the link.
- One subtitle line per beat moment: one idea, under ~80 characters, plain words, present tense. These lines double as the voice-over script (target read time ≈ words ÷ 2.5 s).
- What has to be running and seeded so every scene is real (local server, demo account, sample data). Fix product bugs you hit; do not fake screens.

Show the beat list and subtitle lines as a short table and wait for approval.

## 2. Write the scene script

Copy `$S/example-scenes.mjs` to the project (e.g. `demo/record.mjs`), replace `__SKILL_SCRIPTS__` with `$S`, and write the beats with the kit API:

| Call | Does |
|---|---|
| `createStudio({ out, name, title, theme })` | launches Chrome 1440×810 @ 4/3 → 1920×1080 frames |
| `s.start()` / `s.finish()` | start/stop capture; always `finish()` in `finally` |
| `s.cap(text)` | subtitle from now until the next `cap` |
| `s.wait(ms)` | hold the scene (aim ≈ words ÷ 2.5 s + 0.5 s) |
| `s.open(url, { ready, settle })` | navigate; loading time is cut from the video |
| `s.card(html, { dark })` | full-screen card in the theme; load time cut |
| `s.titleCard({kicker,title,lead})`, `s.sectionCard({kicker,title,sub,body})`, `s.term(title, lines)`, `s.rows(pairs, foot)` | card layouts; `s.esc()` real output before putting it in HTML |
| `s.click(text)`, `s.type(selector, text)`, `s.moveTo(x,y)`, `s.scrollTo(selectorOrText)` | visible cursor, human-paced interaction |
| `s.cut(async () => …)` | anything slow (waiting for data, a transaction, a build) is removed |
| `s.page` | the Puppeteer page for anything custom (`page.evaluate`, camera APIs, etc.) |

Pattern for every beat: load the scene (cut) → `cap()` → `wait()`. Call `cap()` only after the scene is visible, so a subtitle never sits over the previous scene.

Keep `demo/` out of the product's git repo unless the user wants it there (add `demo/` to `.gitignore`).

## 3. Record, compose, review

```bash
node demo/record.mjs                          # → demo/out/frames, captions.json, skips.json
node $S/compose.mjs --out demo/out            # → demo/out/<name>.mp4 + .srt + script.json
node $S/sheet.mjs demo/out/<name>.mp4 --every 5   # → demo/out/sheet.png
```
Read `sheet.png` and fix before showing the user:
- black or half-loaded frames → wrap the load in `s.open`/`s.cut`, raise `settle`, or wait for a `ready` selector;
- a subtitle over the wrong scene → `cap()` was before the scene loaded;
- blank sections mid-scroll → scroll-reveal animations; wait longer after `scrollTo`;
- cramped or overflowing text on cards → shorten the copy.
Re-record until clean (recording is cheap). Then give the user the silent cut.

## 4. Voice-over (when the user wants their own voice)

```bash
node $S/voiceover/server.mjs --out demo/out   # → http://localhost:4777 (run in the background)
```
Tell the user: open it in Chrome, allow the microphone, `Space` records/stops, `←/→` changes line; each line shows its target length and a timer; takes save straight to `demo/out/vo/NN.webm`; reloading keeps finished takes. They can re-record any line any time.

When they say they are done:
```bash
node $S/check-vo.mjs --out demo/out           # per take: length vs target, level, clipping, missing lines
node $S/compose-vo.mjs --out demo/out [--music bed.mp3]   # → demo/out/<name>-voiced.mp4 + .srt
node $S/check-vo.mjs --out demo/out           # again: loudness + voice/subtitle sync per line
```
Report honestly: missing lines (they keep original timing), takes that clipped (flat factor > 0.5 → ask for a re-record; a brief 0 dB peak with flat factor 0 is fine), very quiet takes, and the sync table (a steady +0.3–0.4 s means the subtitle appears just before the voice, as intended). You verified sync by measurement, not by listening; say so and ask the user to watch it.

## 5. Deliver

Give the paths (`<name>.mp4`, `<name>-voiced.mp4`, `.srt`, `thumbnail.png`), duration and resolution. Stop background servers you started (studio, app servers) or tell the user they are still running. If the video points to a repo or site, check it is public and live.
