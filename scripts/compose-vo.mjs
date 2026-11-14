#!/usr/bin/env node
/**
 * Voiced cut: <out>/vo/NN.webm (one take per subtitle line, from the studio) → <out>/<name>-voiced.mp4
 *   node compose-vo.mjs --out demo/out [--name my-demo] [--music path/to/bed.mp3]
 * Each scene is re-timed to its take (edge silence trimmed), subtitles follow the voice, the mix is
 * loudness-normalised to -16 LUFS. Lines without a take keep their original timing. Optional music bed is ducked under the voice.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ass, concatList, loadTimeline, parseArgs, srt } from './timeline.mjs';

const args = parseArgs();
const tl = loadTimeline(args.out ?? 'demo/out');
const name = args.name ?? tl.meta.name ?? 'demo';
const { OUT, frames, caps, duration: end } = tl;
const VO = resolve(OUT, 'vo');
const LEAD = Number(args.lead ?? 0.3);       // voice starts this long after its scene
const TAIL = Number(args.tail ?? 0.5);       // breathing room after each line
const MAX_SPEED = Number(args['max-speed'] ?? 1.8);

const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12';
mkdirSync(resolve(VO, '.trimmed'), { recursive: true });
const nn = (n) => String(n).padStart(2, '0');
const takes = caps.map((_, i) => {
  const src = ['webm', 'wav', 'mp3', 'm4a', 'ogg'].map((x) => resolve(VO, `${nn(i + 1)}.${x}`)).find(existsSync);
  if (!src) return null;
  const dest = resolve(VO, '.trimmed', `${nn(i + 1)}.wav`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `${TRIM},areverse,${TRIM},areverse,highpass=f=80`, '-ar', '48000', '-ac', '1', dest]);
  const dur = probe(dest);
  return dur > 0.3 ? { file: dest, dur } : null;
});
console.log(`${takes.filter(Boolean).length}/${caps.length} takes`);

// Re-time: line i's scene runs from its subtitle start to the next one's.
const knots = [{ raw: 0, out: 0 }];
caps.forEach((c, i) => {
  const segEnd = i + 1 < caps.length ? caps[i + 1].start : end;
  const len = segEnd - knots.at(-1).raw;
  const target = takes[i] ? Math.max(takes[i].dur + LEAD + TAIL, len / MAX_SPEED) : len;
  knots.push({ raw: segEnd, out: knots.at(-1).out + target });
});
const map = (t) => {
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (t <= b.raw) return a.out + ((t - a.raw) / Math.max(1e-6, b.raw - a.raw)) * (b.out - a.out);
  }
  return knots.at(-1).out;
};
const duration = knots.at(-1).out;
const lines = caps.map((c, i) => ({ text: c.text, start: knots[i].out, end: knots[i + 1].out }));

writeFileSync(resolve(OUT, 'frames-vo.txt'), concatList(frames, duration, map));
writeFileSync(resolve(OUT, `${name}-voiced.srt`), srt(lines));
writeFileSync(resolve(OUT, 'subs-vo.ass'), ass(lines, tl.meta.subtitles));

const clips = takes.map((t, i) => (t ? { ...t, at: lines[i].start + LEAD } : null)).filter(Boolean);
const music = args.music && existsSync(resolve(args.music)) ? resolve(args.music) : null;
const ain = [...clips.flatMap((c) => ['-i', c.file]), ...(music ? ['-stream_loop', '-1', '-i', music] : [])];
let afc = '';
if (clips.length) {
  afc += clips.map((c, k) => `[${k + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[v${k}];`).join('');
  afc += `${clips.map((_, k) => `[v${k}]`).join('')}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration.toFixed(3)}[voice];`;
  if (music) {
    const m = clips.length + 1;
    afc += `[voice]asplit[vmain][vkey];[${m}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.2,atrim=0:${duration.toFixed(3)},afade=t=out:st=${Math.max(0, duration - 3).toFixed(2)}:d=3[bed];`;
    afc += `[bed][vkey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked];[vmain][ducked]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  } else afc += `[voice]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
}
const final = resolve(OUT, `${name}-voiced.mp4`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames-vo.txt', ...ain,
  '-filter_complex', `[0:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,ass=subs-vo.ass[vout]${afc ? ';' + afc : ''}`,
  '-map', '[vout]', ...(afc ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []), '-t', duration.toFixed(3),
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final], { stdio: 'inherit', cwd: OUT });
console.log(`${final}  ${duration.toFixed(1)}s`);
