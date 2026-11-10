'use strict';
// Lecture des textures DDS du jeu (DXT1, DXT3, DXT5) : le navigateur ne sait pas les afficher. Seul le premier niveau de
// détail est décodé. Rend { width, height, rgba } ou null pour un format qu'on ne connaît pas.

const HEADER_SIZE = 128;
const FLAG_FOURCC = 4;

// Couleur 16 bits (5-6-5) en composantes de 0 à 255.
const rgb565 = (c) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];

// Les 4 couleurs d'un bloc. En DXT1, c0 <= c1 annonce le mode à 3 couleurs et un transparent.
function blockColors(c0, c1, threeAllowed) {
  const a = rgb565(c0), b = rgb565(c1);
  const mix = (p, q, x, y, d) => p.map((v, i) => (v * x + q[i] * y) / d);
  if (threeAllowed && c0 <= c1) return [[...a, 255], [...b, 255], [...mix(a, b, 1, 1, 2), 255], [0, 0, 0, 0]];
  return [[...a, 255], [...b, 255], [...mix(a, b, 2, 1, 3), 255], [...mix(a, b, 1, 2, 3), 255]];
}

// Les 8 valeurs d'alpha d'un bloc DXT5.
function blockAlphas(a0, a1) {
  if (a0 > a1) return [a0, a1, ...[1, 2, 3, 4, 5, 6].map((k) => ((7 - k) * a0 + k * a1) / 7)];
  return [a0, a1, ...[1, 2, 3, 4].map((k) => ((5 - k) * a0 + k * a1) / 5), 0, 255];
}

function decodeDds(buf) {
  if (!buf || buf.length < HEADER_SIZE || buf.toString('latin1', 0, 4) !== 'DDS ') return null;
  const height = buf.readUInt32LE(12), width = buf.readUInt32LE(16);
  if (!(buf.readUInt32LE(80) & FLAG_FOURCC) || !width || !height) return null;
  const format = buf.toString('latin1', 84, 88);
  const blockSize = format === 'DXT1' ? 8 : format === 'DXT3' || format === 'DXT5' ? 16 : 0;
  if (!blockSize) return null;
  const blocksX = Math.ceil(width / 4), blocksY = Math.ceil(height / 4);
  if (buf.length < HEADER_SIZE + blocksX * blocksY * blockSize) return null;

  const rgba = Buffer.alloc(width * height * 4);
  let o = HEADER_SIZE;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++, o += blockSize) {
      const colorAt = o + blockSize - 8;
      const colors = blockColors(buf.readUInt16LE(colorAt), buf.readUInt16LE(colorAt + 2), format === 'DXT1');
      const colorBits = buf.readUInt32LE(colorAt + 4);
      const alphas = format === 'DXT5' ? blockAlphas(buf[o], buf[o + 1]) : null;
      // 16 indices d'alpha de 3 bits, sur 6 octets : plus de 32 bits, donc des divisions plutôt que des décalages.
      const alphaBits = alphas ? buf.readUIntLE(o + 2, 6) : 0;
      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) break;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) continue;
          const n = py * 4 + px;
          const c = colors[(colorBits >>> (n * 2)) & 3];
          let a = c[3];
          if (alphas) a = alphas[Math.floor(alphaBits / 2 ** (n * 3)) % 8];
          else if (format === 'DXT3') a = ((buf.readUInt16LE(o + py * 2) >> (px * 4)) & 15) * 17;
          const at = (y * width + x) * 4;
          rgba[at] = Math.round(c[0]); rgba[at + 1] = Math.round(c[1]); rgba[at + 2] = Math.round(c[2]); rgba[at + 3] = Math.round(a);
        }
      }
    }
  }
  return { width, height, rgba };
}

module.exports = { decodeDds };
