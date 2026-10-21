// Renders the preview shown in Android's widget picker for the Daily Quest widget:
//   assets/images/widget-preview.png
// Run: node scripts/generate-widget-preview.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = [
  join(ROOT, 'node_modules/@expo-google-fonts/rajdhani/700Bold/Rajdhani_700Bold.ttf'),
  join(ROOT, 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
];

const C = { bg: '#050912', panel: '#0a1a2e', row: '#0b1c31', border: '#3fb8ff', muted: '#1d3d5c', cyan: '#5cd0ff', text: '#e6f6ff', textMuted: '#9cc3dc', textDone: '#7fa3bb', gold: '#ffc857' };

// Same layout as src/widget/quest-widget.tsx at 4×2 cells, drawn at 2× (1 dp = 2 px).
const W = 640;
const H = 300;
const rows = [
  { name: 'Push-ups', value: '60/100 reps', done: false },
  { name: 'Run', value: '0/5 km', done: false },
  { name: 'Read', value: 'CLEAR', done: true },
];

const row = (r, i) => {
  const y = 84 + i * 68;
  return `
  <rect x="20" y="${y}" width="${W - 40}" height="60" rx="12" fill="${r.done ? C.panel : C.row}" stroke="${C.muted}" stroke-width="2"/>
  <text x="44" y="${y + 38}" font-family="Inter" font-weight="500" font-size="26" fill="${r.done ? C.textDone : C.text}">${r.name}</text>
  <text x="${W - 120}" y="${y + 38}" text-anchor="end" font-family="Rajdhani" font-weight="700" font-size="24" fill="${r.done ? C.gold : C.textMuted}">${r.value}</text>
  <line x1="${W - 100}" y1="${y + 2}" x2="${W - 100}" y2="${y + 58}" stroke="${C.muted}" stroke-width="2"/>
  <text x="${W - 60}" y="${y + 42}" text-anchor="middle" font-family="Rajdhani" font-weight="700" font-size="36" fill="${r.done ? C.gold : C.cyan}">${r.done ? '✓' : '○'}</text>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24" fill="${C.bg}" stroke="${C.border}" stroke-width="2"/>
  <text x="22" y="56" font-family="Rajdhani" font-weight="700" font-size="30" letter-spacing="4" fill="${C.cyan}">DAILY QUEST</text>
  <text x="${W - 22}" y="56" text-anchor="end" font-family="Rajdhani" font-weight="700" font-size="26" fill="${C.textMuted}">1/3 · LV 15 · 37d</text>
  ${rows.map(row).join('')}
</svg>`;

const png = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
writeFileSync(join(ROOT, 'assets/images/widget-preview.png'), png);
console.log('wrote assets/images/widget-preview.png');
