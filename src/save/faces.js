'use strict';
// Minifaces des joueurs, lues dans les fichiers déjà installés sur ce PC (rien n'est téléchargé, rien n'est modifié, rien n'est
// livré avec la mod) : common/render/symbol/player/<numéro du joueur>.dds et common/render/symbol/coach/coach_<numéro de l'entraîneur>.png,
// dans un dossier Sider ou dans les archives du jeu.

const fs = require('fs');
const path = require('path');
const { listCpk, readCpkEntry, unwrapWesys } = require('./cpk');
const { siderRoots } = require('./gameDb');
const { decodeDds } = require('./dds');
const { rgbaToPng } = require('./emblems');

const FACE_DIR = 'common/render/symbol/player';
const FACE_RE = /(?:^|\/)common\/render\/symbol\/player\/(\d+)\.dds$/i;
const COACH_DIR = 'common/render/symbol/coach';
const COACH_RE = /(?:^|\/)common\/render\/symbol\/coach\/coach_(\d+)\.png$/i;
const COACH_RECORD = 100, COACH_NAME_AT = 8, COACH_NAME_LEN = 46;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// La table Coach.bin : [{ id, name }]. Une table d'une autre forme (un autre patch) ne donne rien plutôt que de mauvais visages.
function parseCoaches(data) {
  if (!data || !data.length || data.length % COACH_RECORD) return [];
  const out = [];
  for (let o = 0; o + COACH_RECORD <= data.length; o += COACH_RECORD) {
    const raw = data.subarray(o + COACH_NAME_AT, o + COACH_NAME_AT + COACH_NAME_LEN);
    const end = raw.indexOf(0);
    const id = data.readUInt32LE(o), name = raw.subarray(0, end < 0 ? raw.length : end).toString('utf8').trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

// Index des minifaces des archives, dans l'ordre de chargement du jeu (download/ récent d'abord, puis Data/).
let cached = null;
function faceIndex(gameDir) {
  if (cached?.gameDir === gameDir) return cached.map;
  const map = new Map(), coaches = new Map();
  for (const sub of ['download', 'Data']) {
    let files = [];
    try { files = fs.readdirSync(path.join(gameDir, sub)).filter((f) => f.toLowerCase().endsWith('.cpk')).sort().reverse(); } catch { continue; }
    for (const f of files) {
      const full = path.join(gameDir, sub, f);
      let list = [];
      try { list = listCpk(full); } catch { continue; }
      for (const e of list) {
        const m = FACE_RE.exec(e.name);
        if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), { file: full, entry: e });
        const c = COACH_RE.exec(e.name);
        if (c && !coaches.has(Number(c[1]))) coaches.set(Number(c[1]), { file: full, entry: e });
      }
    }
  }
  cached = { gameDir, map, coaches };
  return map;
}
const coachImages = (gameDir) => { faceIndex(gameDir); return cached.coaches; };

function readFace(gameDir, roots, id) {
  // Sider passe avant les archives, comme dans le jeu.
  for (const root of roots) {
    try { return unwrapWesys(fs.readFileSync(path.join(root, FACE_DIR, `${id}.dds`))); } catch { /* pas dans ce dossier */ }
  }
  const e = faceIndex(gameDir).get(id);
  return e ? unwrapWesys(readCpkEntry(e.file, e.entry)) : null;
}

// Minifaces des joueurs demandés, écrites une fois dans outDir (<numéro>.png). Rend { numéro: fichier }.
function ensureFaces({ gameDir, ids, outDir }) {
  const out = {};
  if (!gameDir) return out;
  fs.mkdirSync(outDir, { recursive: true });
  const roots = siderRoots(gameDir);
  for (const id of ids) {
    const name = `${id}.png`, file = path.join(outDir, name);
    if (fs.existsSync(file)) { out[id] = name; continue; }
    try {
      const d = decodeDds(readFace(gameDir, roots, id));
      if (!d) continue;
      fs.writeFileSync(file, rgbaToPng(d.width, d.height, d.rgba));
      out[id] = name;
    } catch { /* image illisible : les initiales restent */ }
  }
  return out;
}

function readCoachFace(gameDir, roots, id) {
  for (const root of roots) {
    try { return unwrapWesys(fs.readFileSync(path.join(root, COACH_DIR, `coach_${id}.png`))); } catch { /* pas dans ce dossier */ }
  }
  const e = coachImages(gameDir).get(id);
  return e ? unwrapWesys(readCpkEntry(e.file, e.entry)) : null;
}

// Visages des entraîneurs demandés, écrits une fois dans outDir (coach-<numéro>.png). Rend { numéro: fichier }.
function ensureCoachFaces({ gameDir, ids, outDir }) {
  const out = {};
  if (!gameDir) return out;
  fs.mkdirSync(outDir, { recursive: true });
  const roots = siderRoots(gameDir);
  for (const id of ids) {
    const name = `coach-${id}.png`, file = path.join(outDir, name);
    if (fs.existsSync(file)) { out[id] = name; continue; }
    try {
      const png = readCoachFace(gameDir, roots, id);
      if (!png || !png.subarray(0, 8).equals(PNG_MAGIC)) continue;
      fs.writeFileSync(file, png);
      out[id] = name;
    } catch { /* image illisible : les initiales restent */ }
  }
  return out;
}

module.exports = { ensureFaces, ensureCoachFaces, parseCoaches };
