// Renders Questline's logo ("Sun Shield & Sword", original artwork inspired by
// Solaire of Astora) and every app icon from it:
//   assets/brand/questline-logo.svg   master SVG
//   assets/images/icon.png            1024 app icon
//   assets/images/android-icon-*.png  adaptive icon layers (foreground / background / monochrome)
//   assets/images/splash-icon.png     splash mark
//   assets/images/notification-icon.png, favicon.png
// Run: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = join(ROOT, 'assets', 'images');
const BRAND = join(ROOT, 'assets', 'brand');
mkdirSync(BRAND, { recursive: true });

const C = {
  bg: '#050912',
  bgGlow: '#101a38',
  field: '#130f20',
  fieldEdge: '#07060d',
  gold1: '#FFE9A8',
  gold2: '#F6B93B',
  gold3: '#C9781F',
  gold4: '#7A4510',
  sun: '#FFD66B',
  ember: '#E8892B',
  cream: '#FFF6DC',
  steel1: '#f4f7fb',
  steel2: '#c3ccd8',
  steel3: '#7d8899',
  steel4: '#4b5465',
  leather: '#4a2c18',
  leatherDark: '#2b180c',
  gem: '#ff9a3c',
};

const P = (cx, cy, a, r) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;

function straightRays(cx, cy, r1, r2, n, offset, w) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2 - Math.PI / 2;
    d += `M${P(cx, cy, a - w, r1)} L${P(cx, cy, a, r2)} L${P(cx, cy, a + w, r1)} Z `;
  }
  return d;
}

function flameRays(cx, cy, r1, rLong, rShort, n, offset) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0;
    const r2 = long ? rLong : rShort;
    const w = (Math.PI / n) * (long ? 0.62 : 0.5);
    const mid = r1 + (r2 - r1) * 0.55;
    d += `M${P(cx, cy, a - w, r1)} C${P(cx, cy, a - w * 1.5, mid)} ${P(cx, cy, a + w * 0.2, mid)} ${P(cx, cy, a + w * 0.45, r2)} C${P(cx, cy, a + w * 0.1, mid)} ${P(cx, cy, a + w * 1.25, mid)} ${P(cx, cy, a + w, r1)} Z `;
  }
  return d;
}

// Geometry (1024 canvas). The mark spans y≈101 (pommel) to 968 (blade tip).
const SH = 'M296 300 Q512 246 728 300 L728 528 Q728 742 512 852 Q296 742 296 528 Z';
const SH_IN = 'M328 326 Q512 280 696 326 L696 528 Q696 722 512 816 Q328 722 328 528 Z';
const BLADE = 'M491 262 L533 262 L529 900 L512 968 L495 900 Z';
const GUARD = 'M378 236 Q512 220 646 236 L660 252 Q646 262 632 262 Q512 252 392 262 Q378 262 364 252 Z';
const RIVETS = [
  [512, 273], [338, 300], [686, 300],
  [312, 420], [712, 420], [312, 540], [712, 540],
  [338, 660], [686, 660], [400, 760], [624, 760], [512, 832],
];
const SX = 512;
const SUN_Y = 540;
const MARK_CY = 535; // vertical centre of the mark's bounding box

const defs = `
<defs>
  <radialGradient id="bgGlow" cx="50%" cy="52%" r="62%">
    <stop offset="0" stop-color="${C.bgGlow}"/><stop offset="1" stop-color="${C.bg}"/>
  </radialGradient>
  <linearGradient id="rim" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="${C.gold1}"/><stop offset="0.28" stop-color="${C.gold2}"/>
    <stop offset="0.62" stop-color="${C.gold3}"/><stop offset="0.82" stop-color="${C.gold2}"/><stop offset="1" stop-color="${C.gold4}"/>
  </linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.gold1}"/><stop offset="0.5" stop-color="${C.gold2}"/><stop offset="1" stop-color="${C.gold3}"/>
  </linearGradient>
  <radialGradient id="field" cx="50%" cy="42%" r="70%">
    <stop offset="0" stop-color="#241b3b"/><stop offset="0.6" stop-color="${C.field}"/><stop offset="1" stop-color="${C.fieldEdge}"/>
  </radialGradient>
  <radialGradient id="sunCore" cx="42%" cy="38%" r="62%">
    <stop offset="0" stop-color="${C.cream}"/><stop offset="0.35" stop-color="${C.sun}"/>
    <stop offset="0.8" stop-color="${C.gold2}"/><stop offset="1" stop-color="${C.ember}"/>
  </radialGradient>
  <radialGradient id="rivet" cx="35%" cy="30%" r="70%">
    <stop offset="0" stop-color="${C.cream}"/><stop offset="0.5" stop-color="${C.gold2}"/><stop offset="1" stop-color="${C.gold4}"/>
  </radialGradient>
  <radialGradient id="gem" cx="35%" cy="30%" r="70%">
    <stop offset="0" stop-color="#fff1d6"/><stop offset="0.4" stop-color="${C.gem}"/><stop offset="1" stop-color="#8a3a08"/>
  </radialGradient>
  <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.steel3}"/><stop offset="0.3" stop-color="${C.steel1}"/>
    <stop offset="0.5" stop-color="${C.steel2}"/><stop offset="0.52" stop-color="${C.steel3}"/>
    <stop offset="0.8" stop-color="${C.steel2}"/><stop offset="1" stop-color="${C.steel4}"/>
  </linearGradient>
  <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.leatherDark}"/><stop offset="0.45" stop-color="${C.leather}"/><stop offset="1" stop-color="${C.leatherDark}"/>
  </linearGradient>
  <filter id="glowL" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="glowM" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
  <clipPath id="fieldClip"><path d="${SH_IN}"/></clipPath>
  <mask id="outsideShield" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#fff"/><path d="${SH}" fill="#000"/>
  </mask>
</defs>`;

const sword = `
  <path d="${BLADE}" fill="url(#blade)" stroke="${C.steel4}" stroke-width="3"/>
  <path d="M${SX - 3} 280 L${SX + 3} 280 L${SX + 2} 880 L${SX - 2} 880 Z" fill="${C.steel4}" opacity="0.7"/>
  <path d="M${SX - 17} 268 L${SX - 13} 900" stroke="#ffffff" stroke-width="2.5" opacity="0.7"/>
  <path d="${GUARD}" fill="url(#goldV)" stroke="${C.gold4}" stroke-width="3"/>
  <path d="M396 240 Q${SX} 228 628 240" fill="none" stroke="${C.gold1}" stroke-width="3" opacity="0.8"/>
  <rect x="${SX - 26}" y="224" width="52" height="46" rx="10" fill="url(#goldV)" stroke="${C.gold4}" stroke-width="3"/>
  <circle cx="${SX}" cy="247" r="11" fill="url(#gem)" stroke="${C.gold4}" stroke-width="2"/>
  <rect x="${SX - 15}" y="146" width="30" height="80" rx="6" fill="url(#grip)"/>
  ${[156, 172, 188, 204].map((y) => `<path d="M${SX - 15} ${y + 10} L${SX + 15} ${y}" stroke="${C.leatherDark}" stroke-width="4" opacity="0.9"/>`).join('')}
  <circle cx="${SX}" cy="128" r="27" fill="url(#rivet)" stroke="${C.gold4}" stroke-width="3"/>
  <circle cx="${SX}" cy="128" r="11" fill="url(#gem)"/>`;

const shield = `
  <path d="${SH}" transform="translate(0 12)" fill="#000" opacity="0.38" filter="url(#shadow)"/>
  <path d="${SH}" fill="url(#rim)" stroke="${C.gold4}" stroke-width="4"/>
  <path d="${SH_IN}" fill="url(#field)" stroke="${C.gold4}" stroke-width="5"/>
  <path d="M340 334 Q512 290 684 334" fill="none" stroke="${C.gold1}" stroke-width="3" opacity="0.55"/>
  <path d="M352 346 Q512 306 672 346 L672 528 Q672 706 512 788 Q352 706 352 528 Z" fill="none" stroke="${C.gold2}" stroke-width="3" opacity="0.4"/>
  ${RIVETS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="url(#rivet)" stroke="${C.gold4}" stroke-width="1.5"/>`).join('')}`;

const sun = `
  <g clip-path="url(#fieldClip)">
    <circle cx="${SX}" cy="${SUN_Y}" r="190" fill="${C.ember}" opacity="0.28" filter="url(#glowL)"/>
    <path d="${straightRays(SX, SUN_Y, 96, 248, 16, Math.PI / 16, 0.075)}" fill="${C.ember}" opacity="0.85"/>
    <g filter="url(#glowM)" opacity="0.7"><path d="${flameRays(SX, SUN_Y, 92, 222, 172, 16, 0)}" fill="${C.gold2}"/></g>
    <path d="${flameRays(SX, SUN_Y, 92, 222, 172, 16, 0)}" fill="url(#goldV)"/>
    <circle cx="${SX}" cy="${SUN_Y}" r="98" fill="${C.sun}" opacity="0.6" filter="url(#glowM)"/>
    <circle cx="${SX}" cy="${SUN_Y}" r="92" fill="url(#sunCore)" stroke="${C.gold3}" stroke-width="4"/>
    <circle cx="${SX}" cy="${SUN_Y}" r="70" fill="none" stroke="${C.ember}" stroke-width="3" opacity="0.35"/>
    <ellipse cx="${SX - 30}" cy="${SUN_Y - 36}" rx="30" ry="18" fill="#ffffff" opacity="0.35" transform="rotate(-30 ${SX - 30} ${SUN_Y - 36})"/>
  </g>`;

const MARK = `${sword}${shield}${sun}`;

/** Flat one-colour silhouette for themed (monochrome) and notification icons. */
const MONO = (color) => `
  <g fill="${color}" mask="url(#outsideShield)">
    <path d="${BLADE}"/><path d="${GUARD}"/>
    <rect x="${SX - 26}" y="224" width="52" height="46" rx="10"/>
    <rect x="${SX - 15}" y="146" width="30" height="80" rx="6"/>
    <circle cx="${SX}" cy="128" r="27"/>
  </g>
  <path d="${SH} ${SH_IN}" fill="${color}" fill-rule="evenodd"/>
  <g clip-path="url(#fieldClip)" fill="${color}">
    <path d="${flameRays(SX, SUN_Y, 88, 222, 172, 16, 0)}"/>
    <circle cx="${SX}" cy="${SUN_Y}" r="92"/>
  </g>`;

/** Scale the mark about the canvas centre (it is drawn centred on MARK_CY). */
const fit = (body, scale) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -${MARK_CY})">${body}</g>`;

const svg = (body, { background = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}
  ${background ? `<rect width="1024" height="1024" fill="url(#bgGlow)"/><circle cx="512" cy="540" r="250" fill="${C.ember}" opacity="0.16" filter="url(#glowL)"/>` : ''}
  ${body}</svg>`;

function png(name, svgText, size) {
  writeFileSync(join(IMAGES, name), new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng());
  console.log(`assets/images/${name}  ${size}px`);
}

const master = svg(MARK, { background: true });
writeFileSync(join(BRAND, 'questline-logo.svg'), master);
console.log('assets/brand/questline-logo.svg');

// Full app icon (legacy launchers, store listing).
png('icon.png', svg(fit(MARK, 0.98), { background: true }), 1024);
// Adaptive icon: the launcher masks to a circle/squircle; keep the mark inside the ~66% safe zone.
png('android-icon-foreground.png', svg(fit(MARK, 0.62)), 1024);
png('android-icon-background.png', svg('', { background: true }), 1024);
png('android-icon-monochrome.png', svg(fit(MONO('#ffffff'), 0.62)), 1024);
// Splash mark on the dark splash background.
png('splash-icon.png', svg(fit(MARK, 1)), 512);
// Status bar icon: white silhouette, filling the canvas.
png('notification-icon.png', svg(fit(MONO('#ffffff'), 1.1)), 96);
png('favicon.png', svg(fit(MARK, 1), { background: true }), 48);
