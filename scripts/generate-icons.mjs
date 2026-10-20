// Renders Questline's icon, adaptive icon layers, splash mark, notification icon
// and favicon from one SVG design. Run: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
const BG = '#050912';
const CYAN = '#5cd0ff';

/** The mark: System-window corner brackets around a quest marker "!". Drawn in a 1024 box. */
function mark(color, { glow = true, frame = true } = {}) {
  const b = 232; // bracket square from b to 1024-b
  const e = 1024 - b;
  const arm = 150;
  const brackets = `
    <path d="M${b} ${b + arm} V${b} H${b + arm}" />
    <path d="M${e - arm} ${b} H${e} V${b + arm}" />
    <path d="M${b} ${e - arm} V${e} H${b + arm}" />
    <path d="M${e - arm} ${e} H${e} V${e - arm}" />`;
  const bang = `
    <rect x="466" y="318" width="92" height="262" rx="46" />
    <circle cx="512" cy="676" r="50" />`;
  const shape = `
    <g fill="none" stroke="${color}" stroke-width="36" stroke-linecap="square">${brackets}</g>
    ${frame ? `<rect x="${b + 34}" y="${b + 34}" width="${e - b - 68}" height="${e - b - 68}" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="6" />` : ''}
    <g fill="${color}">${bang}</g>`;
  if (!glow) return shape;
  return `
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22" /></filter></defs>
    <g filter="url(#glow)" opacity="0.95">${shape}</g>
    ${shape}
    <g fill="#e6f6ff" opacity="0.6">
      <rect x="490" y="342" width="44" height="214" rx="22" />
      <circle cx="512" cy="676" r="24" />
    </g>`;
}

function svg(body, { background = null, scale = 1 } = {}) {
  const t = (1 - scale) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${background ? `<rect width="1024" height="1024" fill="${background}" />` : ''}
    <g transform="translate(${t} ${t}) scale(${scale})">${body}</g>
  </svg>`;
}

function png(name, svgText, size) {
  const out = new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(OUT, name), out);
  console.log(`assets/images/${name}  ${size}px`);
}

// Full icon (legacy launchers, store listing).
png('icon.png', svg(mark(CYAN), { background: BG, scale: 0.92 }), 1024);
// Adaptive icon: the mark must sit inside the central safe zone (~66%).
png('android-icon-foreground.png', svg(mark(CYAN), { scale: 0.62 }), 1024);
png('android-icon-background.png', svg('', { background: BG }), 1024);
png('android-icon-monochrome.png', svg(mark('#ffffff', { glow: false, frame: false }), { scale: 0.62 }), 1024);
// Splash mark on the dark splash background.
png('splash-icon.png', svg(mark(CYAN), { scale: 0.9 }), 512);
// Status bar notification icon: white silhouette only.
png('notification-icon.png', svg(mark('#ffffff', { glow: false, frame: false }), { scale: 1.05 }), 96);
png('favicon.png', svg(mark(CYAN, { frame: false }), { background: BG, scale: 1 }), 48);
