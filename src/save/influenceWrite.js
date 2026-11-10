'use strict';
// Influence : ce que LifeLegend écrit dans la sauvegarde quand le joueur a convaincu son entraîneur ou son club.
// Vérifié en jeu le 26/10/2026 sur la carrière Abline (Heerenveen) :
// - formation : les 3 phases des tactiques A et B du club (+0x4B0, +0x550) et des 3 tactiques de son entraîneur
//   (+0x48, +0xE8, +0x188 de sa fiche). Affichée dans le plan de jeu, jouée au match suivant, gardée par la sauvegarde
//   du jeu. Les réglages de chaque tactique (61 octets après les phases) ne changent pas.
// - transfert : dans les fiches des deux clubs, l'effectif (paires [numéro interne][id] à +0x19C), les numéros de
//   maillot (u16 × 40 à +0x2EA, même ordre) et le nombre de joueurs (u8 à +0x476), comme le jeu le fait (relevé sur les
//   183 clubs qui ont bougé entre octobre 2020 et février 2021). Le joueur garde son numéro interne. Sans le nombre de
//   joueurs, le jeu ne l'affichait dans aucun des deux effectifs. Gardé par les sauvegardes du jeu et un match joué
//   (carrière Bozok, J. Livolant à Troyes du 21 au 31/08/2020).
// - message du jeu qui l'annonce (vérifié en jeu le 31/10/2026, carrière Bozok) : la liste des messages de Vers une
//   Légende, partagée avec la Ligue des Masters. « Infos marché transferts » n'est pas écrit : le jeu choisit lui-même
//   les transferts qu'il y garde et retire les autres en relisant la sauvegarde (essayé deux fois).

const fs = require('fs');
const path = require('path');
const { splitSave, joinSave, decryptSave } = require('./pesCrypt');
const { gameRunning } = require('./offerRedirect');
const { PHASE, readPhase } = require('./formations');

const TEAM_STRIDE = 0x690;
const ROSTER = 0x19C;
const SHIRTS = 0x2EA;
const COUNT = 0x476;
const MAX = 40;
const CLUB_TACTICS = [0x4B0, 0x550];
const COACH_TABLE = 0x133A38;   // nom de l'entraîneur de l'équipe 0 ; la fiche commence 0x10 octets avant
const COACH_STRIDE = 0x258;
const COACH_TACTICS = [0x48, 0xE8, 0x188];
// Messages : 128 lignes de 0x50 octets rangées par date, au même endroit dans les sauvegardes vues (0xBE8B84) mais
// cherchées par la forme d'une ligne vide. Ligne : type u32, date (u16 année, u8 mois, u8 jour), drapeau « non lu » à
// +0x10, club à +0x18, numéro interne et id du joueur à +0x24 / +0x28.
const MESSAGE = 0x50;
const MESSAGES = 128;
const ARRIVAL = 35;   // « Arrivée d'un nouveau » (Bras droit) : « … comme prévu, <joueur> a rejoint le club aujourd'hui. »
const DEPARTURE = 33; // « Départ d'un joueur » (Bras droit)
const EMPTY_MESSAGE = Buffer.from('ff000000ffff000000000000ff0000000000000000000000ffffffffffff0000ffffffffffff000000000000'
  + 'ffff000000000000ffff000000000000ffffffffffffff7fff00ffffffff0000ffffff00', 'hex');

function teamOffset(d, ref) {
  for (let k = 0; k < 4096; k++) {
    const o = TEAM_STRIDE * k;
    if (o + 0x9A > d.length || d[o + 0x54] === 0 || d[o + 0x54] === 0xFF) return -1;
    if (d.readUInt32LE(o + 0x50) === ref) return o;
  }
  return -1;
}

function rosterAt(d, o) {
  const players = [];
  for (let r = 0; r < MAX; r++) {
    const e = o + ROSTER + 8 * r;
    if ((d.readUInt32LE(e) & 0xFFFF) === 0xFFFF) break;
    players.push({ slot: d.readUInt32LE(e), id: d.readUInt32LE(e + 4), shirt: d.readUInt16LE(o + SHIRTS + 2 * r) });
  }
  return players;
}

// Réécrit les trois zones d'un club : les joueurs, puis des places vides au format du jeu ([ffff 0000][0000 0000], maillot 0).
function writeRoster(d, o, players) {
  for (let r = 0; r < MAX; r++) {
    const e = o + ROSTER + 8 * r, p = players[r];
    d.writeUInt32LE(p ? p.slot : 0xFFFF, e);
    d.writeUInt32LE(p ? p.id : 0, e + 4);
    d.writeUInt16LE(p ? p.shirt : 0, o + SHIRTS + 2 * r);
  }
  d[o + COUNT] = players.length;
}

// Change la formation d'un club : phases = 3 blocs de 33 octets (ceux d'une tactique de la base du jeu).
function formationInData(source, { clubRef, phases }) {
  const d = Buffer.from(source);
  const o = teamOffset(d, clubRef);
  if (o < 0) throw new Error('Club introuvable dans ta sauvegarde.');
  if (phases.length !== 3 || phases.some((p) => p.length !== PHASE || !readPhase(p))) throw new Error('Formation illisible.');
  const changes = [];
  const put = (at) => phases.forEach((p, i) => p.copy(d, at + PHASE * i));
  for (const t of CLUB_TACTICS) {
    if (!readPhase(d, o + t)) throw new Error('Les tactiques de ce club ne sont pas à la place attendue : rien n’a été modifié.');
    put(o + t);
  }
  changes.push('tactiques du club');
  // Fiche de l'entraîneur : ses 3 tactiques, si elles sont bien là (un club sans entraîneur garde les siennes).
  const slot = clubRef & 0x3FFF, name = COACH_TABLE + COACH_STRIDE * slot;
  if (name + COACH_STRIDE <= d.length && d.readUInt32LE(name - 8) === slot) {
    const rec = name - 0x10;
    const found = COACH_TACTICS.filter((t) => readPhase(d, rec + t));
    found.forEach((t) => put(rec + t));
    if (found.length) changes.push(`tactiques de l’entraîneur (${found.length})`);
  }
  return { data: d, changes };
}

// Transfert d'un joueur, comme le jeu le fait : le club de départ resserre ses listes, le club d'arrivée l'ajoute à la
// fin, avec son numéro s'il y est libre, sinon le plus petit numéro libre.
// Début de la liste des messages, ou -1 : la plus longue suite de lignes vides, puis les lignes remplies juste avant.
function messagesAt(d) {
  let i = -1, best = null;
  while ((i = d.indexOf(EMPTY_MESSAGE, i + 1)) >= 0) {
    let n = 1;
    while (d.subarray(i + n * MESSAGE, i + (n + 1) * MESSAGE).equals(EMPTY_MESSAGE)) n++;
    if (!best || n > best.n) best = { at: i, n };
    i += (n - 1) * MESSAGE;
  }
  if (!best) return -1;
  let start = best.at;
  while (start >= MESSAGE && d.readUInt32LE(start - MESSAGE + 8) === 0 && d.readUInt32LE(start - MESSAGE + 12) === 0xFF) start -= MESSAGE;
  return best.at + best.n * MESSAGE - start === MESSAGES * MESSAGE ? start : -1;
}

// Ajoute un message non lu à sa date (après ceux du même jour). Renvoie false si la liste est introuvable ou pleine.
function addMessage(d, { type, date, clubRef, slot, playerId }) {
  const start = messagesAt(d);
  if (start < 0) return false;
  const rows = [];
  for (let r = 0; r < MESSAGES; r++) {
    const o = start + r * MESSAGE;
    if (d.readUInt32LE(o) !== 0xFF) rows.push(Buffer.from(d.subarray(o, o + MESSAGE)));
  }
  if (rows.length >= MESSAGES) return false;
  const [y, m, day] = date.split('-').map(Number);
  const key = (b) => b.readUInt16LE(4) * 10000 + b[6] * 100 + b[7];
  const msg = Buffer.from(EMPTY_MESSAGE);
  msg.writeUInt32LE(type, 0);
  msg.writeUInt16LE(y, 4); msg[6] = m; msg[7] = day;
  msg[0x10] = 1;
  msg.writeUInt32LE(clubRef, 0x18);
  msg.writeUInt32LE(slot, 0x24);
  msg.writeUInt32LE(playerId, 0x28);
  const at = rows.findIndex((b) => key(b) > key(msg));
  rows.splice(at < 0 ? rows.length : at, 0, msg);
  for (let r = 0; r < MESSAGES; r++) (rows[r] || EMPTY_MESSAGE).copy(d, start + r * MESSAGE);
  return true;
}

// news = { clubRef, date } : le club du joueur et la date du jeu ; le message dit l'arrivée ou le départ dans son club.
function transferInData(source, { playerId, fromRef, toRef, news }) {
  const d = Buffer.from(source);
  const from = teamOffset(d, fromRef), to = teamOffset(d, toRef);
  if (from < 0 || to < 0) throw new Error('Club introuvable dans ta sauvegarde.');
  if (from === to) throw new Error('Ce joueur est déjà dans ce club.');
  const a = rosterAt(d, from), b = rosterAt(d, to);
  for (const [o, list] of [[from, a], [to, b]]) {
    if (d[o + COUNT] !== list.length) throw new Error('Effectif d’un des deux clubs inhabituel dans la sauvegarde : rien n’a été modifié.');
  }
  const player = a.find((p) => p.id === playerId);
  if (!player) throw new Error('Ce joueur n’est plus dans ce club : synchronise d’abord.');
  if (b.some((p) => p.id === playerId)) throw new Error('Ce joueur est déjà dans ce club.');
  if (b.length >= MAX) throw new Error('Effectif complet (40 joueurs) : le club doit d’abord libérer une place.');
  const used = new Set(b.map((p) => p.shirt));
  let shirt = player.shirt;
  if (!shirt || used.has(shirt)) { shirt = 1; while (used.has(shirt)) shirt++; }
  writeRoster(d, from, a.filter((p) => p.id !== playerId));
  writeRoster(d, to, [...b, { ...player, shirt }]);
  const changes = ['effectifs', 'numéros de maillot', 'nombre de joueurs'];
  const type = news?.clubRef === toRef ? ARRIVAL : news?.clubRef === fromRef ? DEPARTURE : null;
  const message = type !== null && addMessage(d, { type, date: news.date, clubRef: news.clubRef, slot: player.slot, playerId }) ? type : null;
  if (message !== null) changes.push('message');
  return { data: d, shirt, message, changes };
}

// Écriture dans le fichier de sauvegarde : jeu fermé, copie de sécurité, écriture puis relecture.
function writeInSave({ savePath, backupDir, edit, check, tag = 'influence' }) {
  if (gameRunning()) throw new Error('Le jeu est ouvert : sauvegarde ta partie, quitte-le, puis recommence.');
  const before = fs.statSync(savePath);
  const original = fs.readFileSync(savePath);
  const parts = splitSave(original);
  const result = edit(parts.data);
  parts.data = result.data;
  const out = joinSave(parts);
  if (!decryptSave(out).data.equals(result.data)) throw new Error('Vérification de l’écriture échouée : rien n’a été modifié.');

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `${path.basename(savePath)}-${stamp}-avant-${tag}`);
  fs.writeFileSync(backup, original);
  for (const f of fs.readdirSync(backupDir).filter((x) => x.includes(`-avant-${tag}`)).sort().slice(0, -10)) fs.rmSync(path.join(backupDir, f));

  const now = fs.statSync(savePath);
  if (now.mtimeMs !== before.mtimeMs || now.size !== before.size || gameRunning()) throw new Error('La sauvegarde a changé entre-temps (jeu relancé ?) : rien n’a été modifié.');
  const tmp = `${savePath}.legendlife-tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, savePath);
  if (!check(decryptSave(fs.readFileSync(savePath)).data)) throw new Error(`Relecture inattendue après écriture. Ta sauvegarde d’origine est ici : ${backup}`);
  return { ...result, data: undefined, backup };
}

function applyFormation({ savePath, backupDir, clubRef, phases }) {
  const blocks = phases.map((h) => Buffer.from(h, 'hex'));
  return writeInSave({
    savePath,
    backupDir,
    edit: (data) => formationInData(data, { clubRef, phases: blocks }),
    check: (d) => { const o = teamOffset(d, clubRef); return o >= 0 && CLUB_TACTICS.every((t) => blocks.every((b, i) => d.subarray(o + t + PHASE * i, o + t + PHASE * (i + 1)).equals(b))); },
  });
}

function applyTransfer({ savePath, backupDir, playerId, fromRef, toRef, news }) {
  let message = null;
  return writeInSave({
    savePath,
    backupDir,
    edit: (data) => { const r = transferInData(data, { playerId, fromRef, toRef, news }); message = r.message; return r; },
    check: (d) => {
      const a = teamOffset(d, fromRef), b = teamOffset(d, toRef);
      const ra = rosterAt(d, a), rb = rosterAt(d, b);
      const start = messagesAt(d);
      const told = message === null || (start >= 0 && Array.from({ length: MESSAGES }, (_, r) => start + r * MESSAGE)
        .some((o) => d.readUInt32LE(o) === message && d.readUInt32LE(o + 0x28) === playerId));
      return !ra.some((p) => p.id === playerId) && rb.at(-1)?.id === playerId && d[a + COUNT] === ra.length && d[b + COUNT] === rb.length && told;
    },
  });
}

module.exports = { formationInData, transferInData, applyFormation, applyTransfer, writeInSave, rosterAt, teamOffset, messagesAt, addMessage, ARRIVAL, DEPARTURE };
