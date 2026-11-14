#!/usr/bin/env node
/**
 * Silent cut with burned-in subtitles.
 *   node compose.mjs --out demo/out [--name my-demo]
 * → <out>/<name>.mp4, <name>.srt, thumbnail.png, script.json (lines for the voice-over studio)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ass, concatList, loadTimeline, parseArgs, scriptLines, srt } from './timeline.mjs';

const args = parseArgs();
const tl = loadTimeline(args.out ?? 'demo/out');
const name = args.name ?? tl.meta.name ?? 'demo';
const { OUT, frames, caps, duration } = tl;

writeFileSync(resolve(OUT, 'frames.txt'), concatList(frames, duration));
writeFileSync(resolve(OUT, `${name}.srt`), srt(caps));
writeFileSync(resolve(OUT, 'subs.ass'), ass(caps, tl.meta.subtitles));
writeFileSync(resolve(OUT, 'script.json'), JSON.stringify({ name, title: tl.meta.title, duration, lines: scriptLines(tl) }, null, 2));

const final = resolve(OUT, `${name}.mp4`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,setsar=1,ass=subs.ass', '-t', duration.toFixed(3),
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final], { stdio: 'inherit', cwd: OUT });
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(3, duration / 2)), '-i', final, '-frames:v', '1', resolve(OUT, 'thumbnail.png')]);
console.log(`${final}  ${duration.toFixed(1)}s · ${caps.length} subtitles`);
