'use strict';
// Icônes de LifeLegend, à partir du logo de la barre du haut (police et couleurs de l'app, voir icon-page.html) :
// assets/icon.png (256 px, fenêtre), assets/icon-1024.png, assets/icon.ico (16, 24, 32, 48 en BMP, 256 en PNG).
// Logo sur deux lignes (LIFE au-dessus de LEGEND), ou sur une ligne avec --une-ligne.
// Lancé par Electron (fenêtre invisible) : npm run icons   (ou : electron tools/make-icons.js [--une-ligne] [dossier de sortie])

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const ARGS = process.versions.electron ? process.argv.slice(2) : [];
const OUT_ARG = ARGS.find((a) => !a.startsWith('--'));
const ASSETS = OUT_ARG ? path.resolve(OUT_ARG) : path.join(ROOT, 'assets');
const LAYOUT = ARGS.includes('--une-ligne') ? 'une-ligne' : 'deux-lignes';
const SMALL = [16, 24, 32, 48];

// Image BMP d'icône (DIB 32 bits, de bas en haut, masque AND vide) à partir de pixels RGBA.
function dib(rgba, S) {
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0); head.writeInt32LE(S, 4); head.writeInt32LE(S * 2, 8);
  head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14); head.writeUInt32LE(S * S * 4, 20);
  const px = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const s = (y * S + x) * 4, d = ((S - 1 - y) * S + x) * 4;
      px[d] = rgba[s + 2]; px[d + 1] = rgba[s + 1]; px[d + 2] = rgba[s]; px[d + 3] = rgba[s + 3];
    }
  }
  const mask = Buffer.alloc(Math.ceil(S / 32) * 4 * S);
  return Buffer.concat([head, px, mask]);
}

// Fichier .ico : en-tête, répertoire, puis les images.
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((img, k) => {
    const e = 6 + k * 16;
    head[e] = img.size >= 256 ? 0 : img.size; head[e + 1] = img.size >= 256 ? 0 : img.size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(img.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

// Images de l'.ico, lues dans le fichier (pour l'icône du .exe : tools/build-portable.js).
function readIco(file) {
  const b = fs.readFileSync(file);
  return Array.from({ length: b.readUInt16LE(4) }, (_, k) => {
    const e = 6 + k * 16;
    return { size: b[e] || 256, bpp: b.readUInt16LE(e + 6), data: b.subarray(b.readUInt32LE(e + 12), b.readUInt32LE(e + 12) + b.readUInt32LE(e + 8)) };
  });
}

module.exports = { readIco };

// Lancé par Electron (et non chargé par build-portable.js sous Node) : on fabrique les icônes.
if (process.versions.electron && process.type === 'browser') {
  // Dossier de données jetable : ce script ne touche jamais aux données de LifeLegend.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lifelegend-icones-')));
  app.whenReady().then(async () => {
    try {
      const win = new BrowserWindow({ show: false });
      await win.loadFile(path.join(__dirname, 'icon-page.html'));
      const out = await win.webContents.executeJavaScript(`renderIcons(${JSON.stringify(SMALL)}, ${JSON.stringify(LAYOUT)})`);
      const png256 = Buffer.from(out.png256, 'base64');
      fs.writeFileSync(path.join(ASSETS, 'icon-1024.png'), Buffer.from(out.png1024, 'base64'));
      fs.writeFileSync(path.join(ASSETS, 'icon.png'), png256);
      const images = SMALL.map((S) => ({ size: S, data: dib(Buffer.from(out.raw[S], 'base64'), S) }));
      fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico([...images, { size: 256, data: png256 }]));
      console.log(`icônes écrites dans ${ASSETS} : icon.png, icon-1024.png, icon.ico (${[...SMALL, 256].join(', ')} px)`);
      app.exit(0);
    } catch (err) {
      // La console d'Electron n'est pas toujours visible sous Windows : l'erreur est aussi écrite à côté.
      console.error(err);
      fs.writeFileSync(path.join(__dirname, 'make-icons-erreur.txt'), String(err.stack || err));
      app.exit(1);
    }
  });
}
