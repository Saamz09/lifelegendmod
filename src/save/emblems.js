'use strict';
// Écussons des clubs, lus dans les fichiers déjà installés sur ce PC (rien n'est téléchargé, rien n'est modifié) :
// d'abord l'écusson importé par l'option file (fichier TEMBLEM de la sauvegarde, numéro noté dans la fiche du club),
// sinon celui du jeu (common/render/symbol/flag/e_<numéro du club>_r.png pour les clubs sous licence), pris d'abord dans
// les dossiers déclarés à Sider (packs en fichiers libres), puis dans les archives.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { listCpk, readCpkEntry } = require('./cpk');
const { decryptSave } = require('./pesCrypt');
const { siderRoots } = require('./gameDb');

// Variantes : _b / _w (même écusson pour fond clair ou sombre), _l = grande taille.
const EMBLEM_RE = /(?:^|\/)common\/render\/symbol\/flag\/e_(\d{6})_([rf])(_[bw])?(_l)?\.png$/i;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CUSTOM_SIZE = 256, CUSTOM_OFFSET = 80; // TEMBLEM : en-tête de 80 octets puis 256 x 256 pixels BGRA

// Logos des compétitions : common/render/symbol/emblemLc/emb_<numéro>[_b|_w]_l.png (_b = version pour fond clair).
const LOGO_RE = /(?:^|\/)common\/render\/symbol\/emblemLc\/emb_(\d{4})(_[bw])?_l\.png$/i;

const FLAG_DIR = 'common/render/symbol/flag', LOGO_DIR = 'common/render/symbol/emblemLc';

// Ce qui change quand un pack est installé, mis à jour ou retiré : sider.ini et ses dossiers, download/, Data/.
function sourcesStamp(gameDir, roots) {
  const t = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  const paths = [path.join(gameDir, 'sider.ini'), path.join(gameDir, 'SiderAddons', 'sider.ini'), path.join(gameDir, 'download'), path.join(gameDir, 'Data'), ...roots.flatMap((r) => [path.join(r, FLAG_DIR), path.join(r, LOGO_DIR)])];
  return `${paths.map(t).join('|')}|${roots.join(';')}`;
}

// Index des écussons et logos, dans l'ordre où le jeu les charge : d'abord les dossiers déclarés à Sider (packs en
// fichiers libres, comme le GigaPack de Matozanato : 13 482 écussons et 3 846 logos dans livecpk, vu le 2026-11-23),
// par ordre de priorité, puis les archives (download/ récent d'abord, puis Data/). Une source : { from, loose } pour un
// fichier libre, { from, file, entry } pour une archive.
let cached = null;
function archiveIndex(gameDir) {
  const roots = siderRoots(gameDir);
  const stamp = sourcesStamp(gameDir, roots);
  if (cached?.gameDir === gameDir && cached.stamp === stamp) return cached;
  const map = new Map();
  const logos = new Map();
  // La première source l'emporte ; dans la même source, la version simple puis la grande taille.
  const add = (name, src) => {
    const lm = LOGO_RE.exec(name);
    if (lm) {
      if (lm[2] === '_w') return;
      const id = Number(lm[1]), score = lm[2] ? 0 : 1;
      const cur = logos.get(id);
      if (!cur || (cur.from === src.from && score > cur.score)) logos.set(id, { ...src, score });
      return;
    }
    const m = EMBLEM_RE.exec(name);
    if (!m) return;
    const id = Number(m[1]), kind = m[2].toLowerCase();
    const score = (m[3] ? 0 : 2) + (m[4] ? 1 : 0);
    const cur = map.get(id) || {};
    if (!cur[kind] || (cur[kind].from === src.from && score > cur[kind].score)) cur[kind] = { ...src, score };
    map.set(id, cur);
  };
  for (const root of roots) {
    for (const dir of [FLAG_DIR, LOGO_DIR]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, dir)); } catch { continue; }
      for (const f of files) add(`${dir}/${f}`, { from: root, loose: path.join(root, dir, f) });
    }
  }
  for (const sub of ['download', 'Data']) {
    let files = [];
    try { files = fs.readdirSync(path.join(gameDir, sub)).filter((f) => f.toLowerCase().endsWith('.cpk')).sort().reverse(); } catch { continue; }
    for (const f of files) {
      const full = path.join(gameDir, sub, f);
      let list = [];
      try { list = listCpk(full); } catch { continue; }
      for (const e of list) add(e.name, { from: full, file: full, entry: e });
    }
  }
  cached = { gameDir, stamp, map, logos };
  return cached;
}

const readSource = (src) => (src.loose ? fs.readFileSync(src.loose) : readCpkEntry(src.file, src.entry));
// La version du fichier source : quand elle change (pack installé, mis à jour ou retiré), l'image est relue.
function sourceKey(src) {
  if (!src.loose) return `${src.file}|${src.entry.offset}|${src.entry.size}`;
  const st = fs.statSync(src.loose);
  return `${src.loose}|${st.size}|${Math.round(st.mtimeMs)}`;
}
// D'où vient chaque image de outDir (sources.json), pour savoir quand la relire.
const MANIFEST = 'sources.json';
function readManifest(outDir) { try { return JSON.parse(fs.readFileSync(path.join(outDir, MANIFEST), 'utf8')) || {}; } catch { return {}; } }
function writeManifest(outDir, manifest) { try { fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest)); } catch { /* facultatif */ } }

// Écrit l'image d'une source dans outDir, ou garde celle qui y est déjà si elle vient de la même version du fichier.
// Rend le nom du fichier, ou null (rien de lisible).
function extract(src, outDir, name, manifest) {
  const file = path.join(outDir, name);
  let key;
  try { key = sourceKey(src); } catch { return fs.existsSync(file) ? name : null; }
  if (manifest[name] === key && fs.existsSync(file)) return name;
  try {
    const buf = readSource(src);
    if (!buf || !buf.subarray(0, 8).equals(PNG_MAGIC)) return fs.existsSync(file) ? name : null;
    fs.writeFileSync(file, buf);
    manifest[name] = key;
    return name;
  } catch {
    return fs.existsSync(file) ? name : null;
  }
}

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

function archivePick(gameDir, id, allowFake) {
  const e = archiveIndex(gameDir).map.get(id);
  return e?.r || (allowFake ? e?.f : null) || null;
}

// Écussons des clubs demandés, écrits dans outDir (<numéro>.png) et relus quand leur fichier source change. Rend
// { numéro: fichier }. clubs : [{ id, emblemSlot, fakeOk }] ; fakeOk = le faux écusson de PES est le sien (club
// inventé par le jeu).
function ensureEmblems({ gameDir, savePath, clubs, outDir }) {
  const out = {};
  const saveDir = path.dirname(savePath);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = readManifest(outDir);
  for (const c of clubs) {
    // Écusson importé par l'option file : écrit une fois (un autre écusson importé = un autre fichier).
    if (c.emblemSlot != null) {
      const name = `${c.id}-t${c.emblemSlot}.png`, file = path.join(outDir, name);
      if (fs.existsSync(file)) { out[c.id] = name; continue; }
      let png = null;
      try { png = customEmblem(saveDir, c.emblemSlot); } catch { png = null; }
      if (png) { fs.writeFileSync(file, png); out[c.id] = name; continue; }
    }
    const name = `${c.id}.png`;
    let src = null;
    try { src = gameDir ? archivePick(gameDir, c.id, c.fakeOk) : null; } catch { src = null; }
    const got = src ? extract(src, outDir, name, manifest) : (fs.existsSync(path.join(outDir, name)) ? name : null);
    if (got) out[c.id] = got;
  }
  writeManifest(outDir, manifest);
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
  const manifest = readManifest(outDir);
  for (const { logo, fakeOk } of logos) {
    if (logo == null) continue;
    let e = null;
    try { e = archiveIndex(gameDir).logos.get(logo) || null; } catch { e = null; }
    // Un logo d'un patch (dossier de Sider ou archive de download/) est vrai.
    if (fakeLogos.has(logo) && !fakeOk && !patched && !(e && (e.loose || /[\\/]download[\\/]/i.test(e.file)))) continue;
    const name = `comp-${logo}.png`;
    const got = e ? extract(e, outDir, name, manifest) : (fs.existsSync(path.join(outDir, name)) ? name : null);
    if (got) out[logo] = got; // sinon : avatar par défaut
  }
  writeManifest(outDir, manifest);
  return out;
}

module.exports = { ensureEmblems, ensureCompetitionLogos, rgbaToPng, isPatchedGame };
