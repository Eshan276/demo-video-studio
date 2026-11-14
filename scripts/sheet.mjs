#!/usr/bin/env node
/**
 * Contact sheet for reviewing a cut: one labelled thumbnail every N seconds.
 *   node sheet.mjs <video.mp4> [--every 6] [--out sheet.png]
 * Read the PNG to spot black/loading frames, subtitles over the wrong scene, overlaps and blank pages.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from './timeline.mjs';

const video = resolve(process.argv[2] ?? '');
const args = parseArgs(process.argv.slice(3));
const every = Number(args.every ?? 6);
const out = resolve(args.out ?? join(dirname(video), 'sheet.png'));
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
const ts = [];
for (let t = 1; t < dur; t += every) ts.push(+t.toFixed(1));
const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
ts.forEach((t, i) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1',
  '-vf', `scale=480:-1,drawtext=text='${t}s':x=8:y=8:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6`, join(dir, `${String(i).padStart(3, '0')}.png`)]));
const cols = 3;
const rows = Math.ceil(ts.length / cols);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', join(dir, '%03d.png'),
  '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
rmSync(dir, { recursive: true, force: true });
console.log(`${out}  (${ts.length} frames, every ${every}s)`);
