/**
 * Example scene script. Copy into the project (e.g. demo/record.mjs), point SKILL at it, and edit the beats.
 *   node demo/record.mjs
 * Rules of thumb (see SKILL.md): one idea per subtitle, show the real product, cut loading time, end on the link.
 */
import { createStudio } from '__SKILL_SCRIPTS__/kit.mjs';

const APP = process.env.APP_URL ?? 'https://example.com';

const s = await createStudio({
  out: 'demo/out',
  name: 'product-demo',          // → demo/out/product-demo.mp4
  title: 'Product',              // shown in the voice-over studio
  theme: {
    accent: '#2563eb',
    // fontFiles: { sans: 'demo/fonts/Inter.woff2', mono: 'demo/fonts/JetBrainsMono.woff2' },
    // subtitles: { font: 'Noto Sans', size: 40, text: '#ffffff', box: '#0b0a09', boxAlpha: 0.85 },
  },
});

try {
  await s.start();

  // 1 · hook
  await s.card(s.titleCard({ kicker: 'Product', title: 'The one-line<br>promise', lead: 'Who it is for and what changes for them.' }));
  s.cap('Product helps <who> do <job> without <pain>.');
  await s.wait(4500);

  // 2 · the problem
  await s.card(s.sectionCard({ kicker: 'The problem', title: 'Today this takes', sub: 'six tools and a spreadsheet.' }));
  s.cap('Today, <job> means <concrete pain>.');
  await s.wait(4000);

  // 3 · the product, for real
  await s.open(APP, { ready: 'body', settle: 1200 });
  s.cap('Here is the real app. <What the viewer is looking at>.');
  await s.wait(3500);
  // await s.click('New invoice');
  // await s.type('input[name=email]', 'rosa@bakery.example');
  // s.cap('…'); await s.wait(3000);

  // 4 · proof (real output, escaped)
  await s.card(s.sectionCard({ kicker: 'Under the hood', title: 'Real output,', sub: 'not a mock-up.', body: s.term('terminal', [
    '<span class="d">$</span> curl -s https://api.example.com/health',
    `<span class="ok">✓</span> ${s.esc('{"ok":true}')}`,
  ]) }), { dark: true });
  s.cap('Everything you see comes from the running system.');
  await s.wait(4500);

  // 5 · end card
  await s.card(s.titleCard({ kicker: 'Product', title: 'Try it today', lead: 'example.com · github.com/you/product' }));
  s.cap('Product. <Repeat the promise>. Try it at example.com.');
  await s.wait(5000);
} finally {
  await s.finish();
}
