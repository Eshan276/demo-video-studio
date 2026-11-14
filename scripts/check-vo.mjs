#!/usr/bin/env node
/**
 * Check voice-over takes before and after mixing.
 *   node check-vo.mjs --out demo/out [--name my-demo]
 * Per take: length vs target, mean/peak level, clipping (flat factor), missing lines.
 * If <name>-voiced.mp4 exists: integrated loudness and voice onset vs subtitle start for every line.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTimeline, parseArgs, scriptLines } from './timeline.mjs';

const args = parseArgs();
const tl = loadTimeline(args.out ?? 'demo/out');
const name = args.name ?? tl.meta.name ?? 'demo';
const lines = scriptLines(tl);
const VO = resolve(tl.OUT, 'vo');
const nn = (n) => String(n).padStart(2, '0');
const ff = (a) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...a, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;

console.log('line  take    aim   mean   peak  flat  verdict');
for (const l of lines) {
  const f = ['webm', 'wav', 'mp3', 'm4a', 'ogg'].map((x) => resolve(VO, `${nn(l.n)}.${x}`)).find(existsSync);
  if (!f) { console.log(`${nn(l.n)}    —       ~${l.aim}s                     MISSING`); continue; }
  const s = ff(['-i', f, '-af', 'astats=metadata=0:reset=0,volumedetect']);
  const secs = [...s.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].map((m) => +m[1] * 3600 + +m[2] * 60 + +m[3]).at(-1) ?? 0;
  const mean = +(s.match(/mean_volume: ([-\d.]+)/)?.[1] ?? NaN);
  const peak = +(s.match(/max_volume: ([-\d.]+)/)?.[1] ?? NaN);
  const flat = +(s.match(/Flat factor: ([\d.]+)/)?.[1] ?? 0);
  const [lo, hi] = [Math.max(2, l.aim - 1), l.aim + 2];
  const v = [];
  if (secs < lo) v.push('quick');
  if (secs > hi + 1) v.push('long');
  if (flat > 0.5) v.push('CLIPPED, re-record further from the mic');
  else if (peak >= -0.1) v.push('touches 0 dB (brief peak, ok if it sounds clean)');
  if (mean < -40) v.push('very quiet');
  console.log(`${nn(l.n)}  ${secs.toFixed(1).padStart(5)}s  ~${String(l.aim).padStart(2)}s  ${mean.toFixed(1).padStart(5)}  ${peak.toFixed(1).padStart(5)}  ${flat.toFixed(1).padStart(4)}  ${v.join('; ') || 'ok'}`);
}

const voiced = resolve(tl.OUT, `${name}-voiced.mp4`);
if (existsSync(voiced)) {
  const lufs = ff(['-i', voiced, '-af', 'ebur128=framelog=quiet']).match(/I:\s+([-\d.]+) LUFS/)?.[1];
  console.log(`\n${name}-voiced.mp4 integrated loudness: ${lufs} LUFS (target -16)`);
  const srt = readFileSync(resolve(tl.OUT, `${name}-voiced.srt`), 'utf8');
  const starts = [...srt.matchAll(/(\d\d):(\d\d):(\d\d),(\d\d\d) -->/g)].map((m) => +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000);
  const onsets = [...ff(['-i', voiced, '-af', 'silencedetect=n=-38dB:d=0.25']).matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  console.log('sync (voice onset − subtitle start; 0.2–0.5 s is the intended lead):');
  starts.forEach((s, i) => {
    const v = onsets.find((x) => x >= s - 0.2);
    console.log(`  ${nn(i + 1)}  ${v === undefined ? 'no voice found' : `${(v - s >= 0 ? '+' : '') + (v - s).toFixed(2)}s`}`);
  });
}
