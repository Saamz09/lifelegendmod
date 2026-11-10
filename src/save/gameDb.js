'use strict';
// Base de joueurs du jeu (noms des coéquipiers et adversaires), lue dans les fichiers de PES 2021
// ou d'un patch comme Football Life. La sauvegarde ne contient que les identifiants.

const fs = require('fs');
const path = require('path');
const { listCpk, readCpkEntry, unwrapWesys } = require('./cpk');

const PESDB = 'common/etc/pesdb/';
const PLAYER_STRIDE = 312;      // fiche joueur : id u32 à +0, nom affiché à +0xF3 (61 octets)
const PLAYER_FIRST = 8;
const NAME_OFFSET = 0xF3;
const POSITION_BYTE = 46;      // poste officiel (code PES 0-12, bits 2-5) : colle au poste joué dans 99 % des compositions
const ASSIGN_STRIDE = 16;       // affectation : joueur u32 à +4, équipe u32 à +8

function steamLibraries() {
  const roots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  for (const root of [...roots]) {
    try {
      const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '\\'));
    } catch { /* pas de Steam ici */ }
  }
  return [...new Set(roots)];
}

// Un dossier de jeu : Data/ et download/, avec l'exécutable de PES 2021 ou celui d'un patch installé à part
// (Football Life : FL_2026.exe et Sider dans SiderAddons/).
function isGameDir(dir) {
  try {
    if (!fs.existsSync(path.join(dir, 'Data')) || !fs.existsSync(path.join(dir, 'download'))) return false;
    if (fs.existsSync(path.join(dir, 'PES2021.exe')) || fs.existsSync(path.join(dir, 'SiderAddons', 'sider.ini'))) return true;
    return fs.readdirSync(dir).some((f) => /^FL_?\d+\.exe$/i.test(f));
  } catch {
    return false;
  }
}

// Installations du jeu : PES 2021 de Steam, puis les patchs installés dans leur propre dossier (Football Life…).
const PATCH_BASES = ['C:\\Program Files (x86)', 'C:\\Program Files', 'C:\\Games', 'D:\\Games', 'D:\\Program Files (x86)'];
function detectGameFolders() {
  const steam = steamLibraries().map((lib) => path.join(lib, 'steamapps', 'common', 'eFootball PES 2021'));
  const patches = [];
  for (const base of PATCH_BASES) {
    let dirs = [];
    try { dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    patches.push(...dirs.filter((d) => /football ?life|pes ?20\d\d|smoke ?patch/i.test(d)).map((d) => path.join(base, d)));
  }
  return [...new Set([...steam, ...patches])].filter(isGameDir);
}

// Dossiers « livecpk » déclarés à Sider (patchs installés en fichiers libres), par ordre de priorité. Le fichier
// sider.ini est à la racine du jeu, ou dans SiderAddons/ (Football Life) ; ses chemins relatifs partent de son dossier.
function siderRoots(gameDir) {
  const out = [];
  for (const ini of [path.join(gameDir, 'sider.ini'), path.join(gameDir, 'SiderAddons', 'sider.ini')]) {
    let text;
    try { text = fs.readFileSync(ini, 'utf8'); } catch { continue; }
    const base = path.dirname(ini);
    for (const m of text.matchAll(/^\s*cpk\.root\s*=\s*"?([^"\r\n]+?)"?\s*$/gim)) out.push(path.isAbsolute(m[1]) ? m[1] : path.join(base, m[1]));
  }
  return out;
}

// Cherche un fichier de la base dans l'ordre où le jeu le charge : Sider, puis download/, puis Data/.
function findDbFile(gameDir, fileName, cpkCache) {
  for (const root of siderRoots(gameDir)) {
    const loose = path.join(root, PESDB, fileName);
    if (fs.existsSync(loose)) return { source: loose, data: unwrapWesys(fs.readFileSync(loose)) };
  }
  for (const sub of ['download', 'Data']) {
    let files = [];
    try { files = fs.readdirSync(path.join(gameDir, sub)).filter((f) => f.toLowerCase().endsWith('.cpk')).sort().reverse(); } catch { continue; }
    for (const f of files) {
      const full = path.join(gameDir, sub, f);
      if (!cpkCache.has(full)) {
        try { cpkCache.set(full, listCpk(full)); } catch { cpkCache.set(full, []); }
      }
      const entry = cpkCache.get(full).find((e) => e.name === PESDB + fileName);
      if (entry) return { source: `${sub}\\${f}`, data: unwrapWesys(readCpkEntry(full, entry)) };
    }
  }
  return null;
}

let cached = null;

function loadGameDb(gameDir) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;
  const stamp = ['download', 'Data'].map((sub) => { try { return fs.statSync(path.join(gameDir, sub)).mtimeMs; } catch { return 0; } }).join('|');
  if (cached && cached.gameDir === gameDir && cached.stamp === stamp) return cached.db;

  const cpkCache = new Map();
  const playerFile = findDbFile(gameDir, 'Player.bin', cpkCache);
  const assignFile = findDbFile(gameDir, 'PlayerAssignment.bin', cpkCache);
  if (!playerFile) return null;

  const names = new Map(), positions = new Map();
  const d = playerFile.data;
  for (let o = PLAYER_FIRST; o + NAME_OFFSET + 61 <= d.length; o += PLAYER_STRIDE) {
    const id = d.readUInt32LE(o);
    const raw = d.subarray(o + NAME_OFFSET, o + NAME_OFFSET + 61);
    const end = raw.indexOf(0);
    const name = raw.subarray(0, end < 0 ? raw.length : end).toString('utf8').trim();
    if (id && name) names.set(id, name);
    if (id) positions.set(id, (d[o + POSITION_BYTE] >> 2) & 0xF);
  }
  const teams = new Map();
  if (assignFile) {
    const a = assignFile.data;
    for (let o = 0; o + ASSIGN_STRIDE <= a.length; o += ASSIGN_STRIDE) {
      const player = a.readUInt32LE(o + 4), team = a.readUInt32LE(o + 8);
      if (!teams.has(team)) teams.set(team, new Set());
      teams.get(team).add(player);
    }
  }
  const db = { source: playerFile.source, names, positions, teams };
  cached = { gameDir, stamp, db };
  return db;
}

// Une table de la base (ex. TacticsFormation.bin), telle que le jeu la charge, ou null.
const tables = new Map();
function loadDbTable(gameDir, fileName) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;
  const stamp = ['download', 'Data'].map((sub) => { try { return fs.statSync(path.join(gameDir, sub)).mtimeMs; } catch { return 0; } }).join('|');
  const key = `${gameDir}|${fileName}`;
  if (tables.get(key)?.stamp !== stamp) tables.set(key, { stamp, file: findDbFile(gameDir, fileName, new Map()) });
  return tables.get(key).file;
}

// Part des joueurs alignés dans la sauvegarde que la base place dans la même équipe.
// Une base d'un autre patch (ex. vanilla pour une carrière Football Life) tombe vers 5 % ;
// la bonne base est proche de 100 % en début de carrière et reste haute malgré les transferts.
function matchRate(career, db) {
  if (!db || !db.teams.size) return 0;
  let ok = 0, total = 0;
  for (const m of career.matches) {
    if (!m.played) continue;
    for (const [team, lineup] of [[m.home, m.homeLineup], [m.away, m.awayLineup]]) {
      const squad = db.teams.get(team.id);
      for (const e of lineup) { total++; if (squad?.has(e.playerId)) ok++; }
    }
  }
  return total ? ok / total : 0;
}

module.exports = { detectGameFolders, isGameDir, loadGameDb, loadDbTable, matchRate, siderRoots };
