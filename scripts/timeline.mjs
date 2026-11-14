// Shared by compose.mjs, compose-vo.mjs and the voice-over studio: the recording with cut ranges removed.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseArgs(argv = process.argv.slice(2)) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return a;
}

export function loadTimeline(outDir) {
  const OUT = resolve(outDir);
  const need = ['frames.json', 'captions.json'];
  for (const f of need) if (!existsSync(resolve(OUT, f))) throw new Error(`${resolve(OUT, f)} missing — record first`);
  const skips = existsSync(resolve(OUT, 'skips.json')) ? JSON.parse(readFileSync(resolve(OUT, 'skips.json'), 'utf8')) : [];
  const meta = existsSync(resolve(OUT, 'meta.json')) ? JSON.parse(readFileSync(resolve(OUT, 'meta.json'), 'utf8')) : { name: 'demo', title: 'Demo', subtitles: {} };
  const inSkip = (t) => skips.some(([a, b]) => t > a && t < b);
  const shift = (t) => t - skips.reduce((n, [a, b]) => n + (t >= b ? b - a : t > a ? t - a : 0), 0);
  const raw = JSON.parse(readFileSync(resolve(OUT, 'frames.json'), 'utf8')).filter((f) => f.t >= 0);
  // Keep the last frame painted during each cut, re-timed to the cut's end, so the next scene appears at once.
  const carried = skips.map(([a, b]) => { const f = raw.filter((x) => x.t > a && x.t < b).at(-1); return f && { ...f, t: b }; }).filter(Boolean);
  const frames = [...raw.filter((f) => !inSkip(f.t)), ...carried].sort((x, y) => x.t - y.t).map((f) => ({ ...f, t: shift(f.t) }));
  const caps = JSON.parse(readFileSync(resolve(OUT, 'captions.json'), 'utf8'))
    .filter((c) => c.end !== null)
    .map((c) => ({ ...c, start: shift(c.start), end: shift(c.end) }));
  const duration = Math.max(frames.at(-1).t + 0.5, caps.at(-1)?.end ?? 0);
  return { OUT, meta, frames, caps, duration };
}

/** Script lines for narration: one per subtitle, with a target read time at ~2.5 words/second. */
export function scriptLines(tl) {
  return tl.caps.map((c, i) => {
    const words = c.text.split(/\s+/).filter(Boolean).length;
    return { n: i + 1, text: c.text, start: +c.start.toFixed(2), end: +c.end.toFixed(2), words, aim: Math.max(3, Math.round(words / 2.5)) };
  });
}

/** ffmpeg concat list: each frame held until the next one, on a (possibly re-mapped) timeline. */
export function concatList(frames, duration, map = (t) => t) {
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const from = i === 0 ? 0 : map(frames[i].t);
    const to = i + 1 < frames.length ? map(frames[i + 1].t) : duration;
    if (to - from <= 0) continue;
    list.push(`file 'frames/${frames[i].name}'\nduration ${(to - from).toFixed(4)}`);
  }
  list.push(`file 'frames/${frames.at(-1).name}'`);
  return list.join('\n') + '\n';
}

const hexToAss = (hex, alpha = 1) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  const a = Math.round((1 - alpha) * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
};

export const srt = (lines) => {
  const t = (s) => { const ms = Math.max(0, Math.round(s * 1000)); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`; };
  return lines.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join('\n');
};

/** Burned-in subtitle style: a box behind the text near the bottom edge. */
export function ass(lines, style = {}) {
  const s = { font: 'Noto Sans', size: 40, text: '#f8f7f4', box: '#0b0a09', boxAlpha: 0.85, marginV: 54, ...style };
  const t = (x) => { const cs = Math.max(0, Math.round(x * 100)); return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
  const text = hexToAss(s.text), box = hexToAss(s.box, s.boxAlpha);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,${s.font},${s.size},${text},${text},${box},${box},0,0,0,0,100,100,0,0,3,18,0,2,260,260,${s.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((c) => `Dialogue: 0,${t(c.start + 0.12)},${t(c.end - 0.08)},Sub,,0,0,0,,{\\fad(150,150)}${c.text.replace(/\n/g, '\\N')}`).join('\n')}
`;
}
