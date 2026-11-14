#!/usr/bin/env node
/**
 * Voice-over studio: a local teleprompter that plays each scene silently while you read its subtitle line,
 * and saves every take straight to <out>/vo/NN.webm (no downloads to move around).
 *   node voiceover/server.mjs --out demo/out [--name my-demo] [--port 4777]
 * Then open http://localhost:4777 in Chrome and allow the microphone. Space = record/stop, ←/→ = lines.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTimeline, parseArgs, scriptLines } from '../timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const OUT = resolve(args.out ?? 'demo/out');
const PORT = Number(args.port ?? process.env.PORT ?? 4777);
const VO = resolve(OUT, 'vo');
mkdirSync(VO, { recursive: true });
const tl0 = loadTimeline(OUT);
const name = args.name ?? tl0.meta.name ?? 'demo';
const VIDEO = resolve(OUT, `${name}.mp4`);
if (!existsSync(VIDEO)) throw new Error(`${VIDEO} not found — run compose.mjs first`);

const nn = (n) => String(n).padStart(2, '0');
const takes = () => Object.fromEntries(readdirSync(VO).filter((f) => /^\d\d\.webm$/.test(f)).map((f) => [Number(f.slice(0, 2)), statSync(resolve(VO, f)).size]));

function sendFile(req, res, file, type) {
  const size = statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  }
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const take = /^\/take\/(\d{1,2})$/.exec(url.pathname);
  try {
    if (req.method === 'GET' && url.pathname === '/') return sendFile(req, res, resolve(here, 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/script.json') {
      const tl = loadTimeline(OUT);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ title: tl.meta.title, voDir: VO, lines: scriptLines(tl), takes: takes() }));
    }
    if (req.method === 'GET' && url.pathname === '/video.mp4') return sendFile(req, res, VIDEO, 'video/mp4');
    if (take && req.method === 'GET') {
      const f = resolve(VO, `${nn(take[1])}.webm`);
      if (!existsSync(f)) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, f, 'audio/webm');
    }
    if (take && req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 1000) { res.writeHead(400); return res.end('empty take'); }
        writeFileSync(resolve(VO, `${nn(take[1])}.webm`), buf);
        console.log(`saved vo/${nn(take[1])}.webm (${(buf.length / 1024).toFixed(0)} kB)`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (take && req.method === 'DELETE') {
      const f = resolve(VO, `${nn(take[1])}.webm`);
      if (existsSync(f)) unlinkSync(f);
      res.writeHead(200); return res.end();
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500); res.end(String(e.message));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`voice-over studio: http://localhost:${PORT}  (${tl0.caps.length} lines · takes → ${VO})`));
