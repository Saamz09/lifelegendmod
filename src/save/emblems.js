'use strict';
// Écussons des clubs, lus dans les fichiers déjà installés sur ce PC (rien n'est téléchargé, rien n'est modifié) :
// d'abord l'écusson importé par l'option file (fichier TEMBLEM de la sauvegarde, numéro noté dans la fiche du club),
// sinon celui des archives du jeu (common/render/symbol/flag/e_<numéro du club>_r.png pour les clubs sous licence).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { listCpk, readCpkEntry } = require('./cpk');
const { decryptSave } = require('./pesCrypt');

// Variantes : _b / _w (même écusson pour fond clair ou sombre), _l = grande taille.
const EMBLEM_RE = /(?:^|\/)common\/render\/symbol\/flag\/e_(\d{6})_([rf])(_[bw])?(_l)?\.png$/i;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CUSTOM_SIZE = 256, CUSTOM_OFFSET = 80; // TEMBLEM : en-tête de 80 octets puis 256 x 256 pixels BGRA

// Logos des compétitions : common/render/symbol/emblemLc/emb_<numéro>[_b|_w]_l.png (_b = version pour fond clair).
const LOGO_RE = /(?:^|\/)common\/render\/symbol\/emblemLc\/emb_(\d{4})(_[bw])?_l\.png$/i;

// Index des écussons et logos des archives, dans l'ordre de chargement du jeu (download/ récent d'abord, puis Data/).
let cached = null;
function archiveIndex(gameDir) {
  if (cached?.gameDir === gameDir) return cached.map;
  const map = new Map();
  const logos = new Map();
  for (const sub of ['download', 'Data']) {
    let files = [];
    try { files = fs.readdirSync(path.join(gameDir, sub)).filter((f) => f.toLowerCase().endsWith('.cpk')).sort().reverse(); } catch { continue; }
    for (const f of files) {
      const full = path.join(gameDir, sub, f);
      let list = [];
      try { list = listCpk(full); } catch { continue; }
      for (const e of list) {
        const lm = LOGO_RE.exec(e.name);
        if (lm && lm[2] !== '_w') {
          const id = Number(lm[1]), score = lm[2] ? 0 : 1;
          const cur = logos.get(id);
          if (!cur || (cur.file === full && score > cur.score)) logos.set(id, { file: full, entry: e, score });
          continue;
        }
        const m = EMBLEM_RE.exec(e.name);
        if (!m) continue;
        const id = Number(m[1]), kind = m[2].toLowerCase();
        const score = (m[3] ? 0 : 2) + (m[4] ? 1 : 0);
        const cur = map.get(id) || {};
        // La première archive l'emporte ; dans la même archive, la version simple puis la grande taille.
        if (!cur[kind] || (cur[kind].file === full && score > cur[kind].score)) cur[kind] = { file: full, entry: e, score };
        map.set(id, cur);
      }
    }
  }
  cached = { gameDir, map, logos };
  return map;
}
const logoIndex = (gameDir) => { archiveIndex(gameDir); return cached.logos; };

// PNG à partir de pixels RGBA (pour les écussons importés).
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function rgbaToPng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([PNG_MAGIC, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function customEmblem(saveDir, slot) {
  const file = path.join(saveDir, `TEMBLEM${slot.toString(16).toUpperCase().padStart(8, '0')}`);
  if (!fs.existsSync(file)) return null;
  const d = decryptSave(fs.readFileSync(file)).data;
  if (!d || d.length < CUSTOM_OFFSET + CUSTOM_SIZE * CUSTOM_SIZE * 4) return null;
  // Pixels rangés en BGRA : on remet le rouge et le bleu à leur place.
  const px = Buffer.from(d.subarray(CUSTOM_OFFSET, CUSTOM_OFFSET + CUSTOM_SIZE * CUSTOM_SIZE * 4));
  for (let i = 0; i < px.length; i += 4) { const b = px[i]; px[i] = px[i + 2]; px[i + 2] = b; }
  return rgbaToPng(CUSTOM_SIZE, CUSTOM_SIZE, px);
}

function archiveEmblem(gameDir, id, allowFake) {
  const e = archiveIndex(gameDir).get(id);
  const pick = e?.r || (allowFake ? e?.f : null);
  if (!pick) return null;
  const buf = readCpkEntry(pick.file, pick.entry);
  return buf.subarray(0, 8).equals(PNG_MAGIC) ? buf : null;
}

// Écussons des clubs demandés, écrits une fois dans outDir (<numéro>.png). Rend { numéro: fichier }.
// clubs : [{ id, emblemSlot, fakeOk }] ; fakeOk = le faux écusson de PES est le sien (club inventé par le jeu).
function ensureEmblems({ gameDir, savePath, clubs, outDir }) {
  const out = {};
  const saveDir = path.dirname(savePath);
  fs.mkdirSync(outDir, { recursive: true });
  for (const c of clubs) {
    const name = c.emblemSlot != null ? `${c.id}-t${c.emblemSlot}.png` : `${c.id}.png`; // un autre écusson importé = un autre fichier
    const file = path.join(outDir, name);
    if (fs.existsSync(file)) { out[c.id] = name; continue; }
    let png = null;
    try {
      png = (c.emblemSlot != null ? customEmblem(saveDir, c.emblemSlot) : null) || (gameDir ? archiveEmblem(gameDir, c.id, c.fakeOk) : null);
    } catch { png = null; }
    if (!png) continue;
    fs.writeFileSync(file, png);
    out[c.id] = name;
  }
  return out;
}

// Un jeu patché : Football Life (son exécutable FL_xxxx.exe, ou Sider dans SiderAddons/). Ses archives portent les vrais
// logos des compétitions que PES 2021 n'avait pas sous licence (vu dans Football Life 2027 le 2026-11-10 : Ligue des
// champions, Ligue Europa, Premier League, LaLiga, Coupe de France… dans Data/dt15_x64.cpk).
function isPatchedGame(gameDir) {
  try {
    return fs.existsSync(path.join(gameDir, 'SiderAddons', 'sider.ini')) || fs.readdirSync(gameDir).some((f) => /^FL_?\d+\.exe$/i.test(f));
  } catch {
    return false;
  }
}

// Logos des compétitions demandées, écrits une fois dans outDir (comp-<numéro>.png). Rend { numéro: fichier }.
// logos : [{ logo, fakeOk }] ; un faux logo de PES n'est gardé que pour une compétition sans vrai compte. Ces numéros
// ne sont faux que dans PES 2021 tel quel : un jeu patché, ou un logo venu d'une archive de download/ (un patch), est vrai.
function ensureCompetitionLogos({ gameDir, logos, fakeLogos, outDir }) {
  const out = {};
  if (!gameDir) return out;
  fs.mkdirSync(outDir, { recursive: true });
  const patched = isPatchedGame(gameDir);
  for (const { logo, fakeOk } of logos) {
    if (logo == null) continue;
    if (fakeLogos.has(logo) && !fakeOk && !patched) {
      const e = logoIndex(gameDir).get(logo);
      if (!e || !/[\\/]download[\\/]/i.test(e.file)) continue;
    }
    const name = `comp-${logo}.png`;
    const file = path.join(outDir, name);
    if (fs.existsSync(file)) { out[logo] = name; continue; }
    try {
      const e = logoIndex(gameDir).get(logo);
      const buf = e && readCpkEntry(e.file, e.entry);
      if (!buf || !buf.subarray(0, 8).equals(PNG_MAGIC)) continue;
      fs.writeFileSync(file, buf);
      out[logo] = name;
    } catch { /* logo illisible : avatar par défaut */ }
  }
  return out;
}

module.exports = { ensureEmblems, ensureCompetitionLogos, rgbaToPng, isPatchedGame };
