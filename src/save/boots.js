'use strict';
// Crampons du jeu, lus dans les fichiers déjà installés sur ce PC (rien n'est téléchargé, rien n'est modifié, rien n'est livré
// avec la mod) : la table common/etc/pesdb/Boots.bin (numéro, marque) et les images common/render/thumbnail/spike/k<numéro>_t.dds
// (la paire) et k<numéro>_l.dds (le logo de la marque).

const fs = require('fs');
const path = require('path');
const { listCpk, readCpkEntry, unwrapWesys } = require('./cpk');
const { loadDbTable, siderRoots } = require('./gameDb');
const { decodeDds } = require('./dds');
const { rgbaToPng } = require('./emblems');

const RECORD = 304, ID_AT = 0, BRAND_AT = 204, BRAND_LEN = 100;
const THUMB_DIR = 'common/render/thumbnail/spike';
const THUMB_RE = /(?:^|\/)common\/render\/thumbnail\/spike\/(k\d+_[tl])\.dds$/i;
const BRAND_FIX = { 'New Balace': 'New Balance' }; // une faute de frappe de la table

// Le catalogue : [{ id, brand }]. Une table d'une autre forme (un autre patch) ne donne rien plutôt que des marques fausses.
function parseBoots(data) {
  if (!data || !data.length || data.length % RECORD) return [];
  const out = [];
  for (let o = 0; o + RECORD <= data.length; o += RECORD) {
    const id = data.readUInt16LE(o + ID_AT);
    const raw = data.subarray(o + BRAND_AT, o + BRAND_AT + BRAND_LEN);
    const end = raw.indexOf(0);
    const brand = raw.subarray(0, end < 0 ? raw.length : end).toString('utf8').trim();
    if (id && brand) out.push({ id, brand: BRAND_FIX[brand] || brand });
  }
  return out;
}
function bootCatalog(gameDir) {
  try { return parseBoots(loadDbTable(gameDir, 'Boots.bin')?.data); } catch { return []; }
}

// Index des images des archives, dans l'ordre de chargement du jeu (download/ récent d'abord, puis Data/).
let cached = null;
function thumbIndex(gameDir) {
  if (cached?.gameDir === gameDir) return cached.map;
  const map = new Map();
  for (const sub of ['download', 'Data']) {
    let files = [];
    try { files = fs.readdirSync(path.join(gameDir, sub)).filter((f) => f.toLowerCase().endsWith('.cpk')).sort().reverse(); } catch { continue; }
    for (const f of files) {
      const full = path.join(gameDir, sub, f);
      let list = [];
      try { list = listCpk(full); } catch { continue; }
      for (const e of list) {
        const m = THUMB_RE.exec(e.name);
        if (m && !map.has(m[1].toLowerCase())) map.set(m[1].toLowerCase(), { file: full, entry: e });
      }
    }
  }
  cached = { gameDir, map };
  return map;
}
const bootCode = (id) => `k${String(id).padStart(4, '0')}`;

function readThumb(gameDir, roots, name) {
  // Sider passe avant les archives, comme dans le jeu.
  for (const root of roots) {
    try { return unwrapWesys(fs.readFileSync(path.join(root, THUMB_DIR, `${name}.dds`))); } catch { /* pas dans ce dossier */ }
  }
  const e = thumbIndex(gameDir).get(name);
  return e ? unwrapWesys(readCpkEntry(e.file, e.entry)) : null;
}

// Les images d'une paire, écrites une fois dans outDir. Rend { photo, logo } : un fichier, ou null s'il manque.
function ensureBootImages({ gameDir, id, outDir }) {
  const out = { photo: null, logo: null };
  if (!gameDir) return out;
  fs.mkdirSync(outDir, { recursive: true });
  const roots = siderRoots(gameDir);
  for (const [key, suffix] of [['photo', 't'], ['logo', 'l']]) {
    const base = `${bootCode(id)}_${suffix}`, name = `${base}.png`, file = path.join(outDir, name);
    if (fs.existsSync(file)) { out[key] = name; continue; }
    try {
      const d = decodeDds(readThumb(gameDir, roots, base));
      if (!d) continue;
      fs.writeFileSync(file, rgbaToPng(d.width, d.height, d.rgba));
      out[key] = name;
    } catch { /* image illisible : le nom de la marque reste */ }
  }
  return out;
}

module.exports = { parseBoots, bootCatalog, ensureBootImages, bootCode };
