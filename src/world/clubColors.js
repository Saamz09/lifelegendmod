'use strict';
// Couleurs d'un club tirées de son écusson (images du jeu) : la teinte dominante et une seconde couleur,
// pour habiller le blog des supporters aux couleurs du club. Même calcul que dans l'interface (aperçu).

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function hsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

// pixels : tampon RGBA (order 'rgba') ou BGRA (order 'bgra', nativeImage sous Windows).
function dominantColors(pixels, width, height, order = 'rgba') {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 6000)));
  const bins = new Map(); // teinte (24 secteurs) -> { n, r, g, b }
  let light = 0, dark = 0, darkSum = [0, 0, 0];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = pixels[i + 3];
      if (a < 160) continue;
      const r = order === 'bgra' ? pixels[i + 2] : pixels[i], g = pixels[i + 1], b = order === 'bgra' ? pixels[i] : pixels[i + 2];
      const c = hsl(r, g, b);
      if (c.s > 0.3 && c.l > 0.12 && c.l < 0.88) {
        const k = Math.floor(c.h / 15) % 24;
        const e = bins.get(k) || { k, n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += r; e.g += g; e.b += b;
        bins.set(k, e);
      } else if (c.l >= 0.6) light++;
      else { dark++; darkSum = [darkSum[0] + r, darkSum[1] + g, darkSum[2] + b]; }
    }
  }
  const ranked = [...bins.values()].sort((p, q) => q.n - p.n);
  const avg = (e) => hex(e.r / e.n, e.g / e.n, e.b / e.n);
  const darkHex = dark ? hex(darkSum[0] / dark, darkSum[1] / dark, darkSum[2] / dark) : '#1b1b1b';
  const top = ranked[0];
  // Écusson sans couleur franche (noir et blanc) : le blog prend le sombre.
  if (!top || top.n < (dark + light) * 0.08) return { primary: darkHex, secondary: light >= dark ? '#ffffff' : '#9a9a9a' };
  const far = (e) => Math.min(Math.abs(e.k - top.k), 24 - Math.abs(e.k - top.k)) >= 3;
  const second = ranked.find((e) => e !== top && far(e) && e.n >= top.n * 0.15);
  return { primary: avg(top), secondary: second ? avg(second) : light >= dark ? '#ffffff' : darkHex };
}

module.exports = { dominantColors };
