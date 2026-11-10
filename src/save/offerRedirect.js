'use strict';
// Réorientation d'une vraie offre vers un autre club : c'est par là que « Ton attitude » agit sur le jeu.
// Vérifié en jeu le 16/10/2026 : l'offre de Guarchomato, réorientée vers le Paris FC (club changé dans l'offre, la
// négociation entre clubs, la fiche « club intéressé » et le message « Offre reçue ») puis acceptée le 31/01/2022,
// a mené au transfert le jour même, avec le contrat et le salaire de l'offre.
// Une offre créée de toutes pièces, elle, s'affiche mais n'aboutit jamais : il lui manque le dossier interne du jeu.
// Le jeu retrouve une offre par son club : le club d'arrivée ne doit avoir ni offre ni négociation pour le joueur,
// sinon l'acceptation part sur la mauvaise.
// Offsets : voir blReader.js et docs/vers-une-legende.md.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { splitSave, joinSave, decryptSave } = require('./pesCrypt');
const { readCareer } = require('./blReader');

const OFFER_MARKER = Buffer.concat([Buffer.from('74450700', 'hex'), Buffer.alloc(12)]);
const OFFER_SEARCH_FROM = 0x1000000;
const OFFER_SIZE = 0x30;          // 1er enregistrement à marqueur + 0x10 : u16 numéro, club +4, état +8, joueur +0x20
const OFFER_MAX = 40;
const NEGO_FROM = 0x14 + 0xD5B8;  // négociations : u16 numéro +4, acheteur +8, joueur +0x28
const NEGO_SIZE = 0x3C;
const NEGO_MAX = 64;
const INTEREST_FROM = 0x14 + 0x56294; // clubs intéressés : joueur +4, club +8
const INTEREST_SIZE = 0x2C;
const INTEREST_MAX = 32;
const DEADLINES = 0x57F70;        // blocs [00][N][ff ff] + 8 lignes [u16 numéro][type][x][date][date]
const DEADLINE_BLOCK = 100;
const DEADLINE_BLOCKS = 20;
const ACTIVE_LIST = 0xC01638;     // clubs ayant une offre en cours (le jeu la vide parfois : facultative)
const MESSAGE_LOG = 0xBE8BCC;
const MESSAGE_SIZE = 0x50;        // type +8, date +0xC, club +0x20
const MESSAGE_COUNT = 0xBEE284;   // nombre de messages + 1
const MESSAGE_OFFER = 0x47;

const FREE16 = 0xFFFF, FREE32 = 0xFFFFFFFF;

// Modifie une copie des données déchiffrées. Lève une erreur lisible si la réorientation n'est pas sûre.
function redirectInData(source, { playerId, clubRef, offerId, toRef }) {
  const d = Buffer.from(source);
  const m = d.indexOf(OFFER_MARKER, OFFER_SEARCH_FROM);
  if (m < 0) throw new Error('Table des offres introuvable dans la sauvegarde.');
  const offer = (k) => m + 0x10 + k * OFFER_SIZE;
  const nego = (k) => m + NEGO_FROM + k * NEGO_SIZE;
  const interest = (k) => m + INTEREST_FROM + k * INTEREST_SIZE;
  const mineOffer = (o) => d.readUInt16LE(o) !== FREE16 && d.readUInt32LE(o + 0x20) === playerId;
  const offers = Array.from({ length: OFFER_MAX }, (_, k) => offer(k)).filter(mineOffer);
  const negos = Array.from({ length: NEGO_MAX }, (_, k) => nego(k)).filter((o) => d.readUInt32LE(o + 8) !== FREE32 && d.readUInt32LE(o + 0x28) === playerId);

  const o = offers.find((x) => d.readUInt16LE(x) === offerId);
  if (!o) throw new Error('Cette offre n’est plus dans la sauvegarde.');
  if (d[o + 8] !== 1) throw new Error('Cette offre n’est plus en attente (acceptée ou expirée).');
  const fromRef = d.readUInt32LE(o + 4);
  if (fromRef === clubRef) throw new Error('C’est une prolongation de ton club : elle ne peut pas être réorientée.');
  if (toRef === clubRef || toRef === fromRef) throw new Error('Choisis un autre club que le tien ou celui de l’offre.');
  if (offers.some((x) => d.readUInt32LE(x + 4) === toRef)) throw new Error('Ce club a déjà une offre pour toi dans la sauvegarde : le jeu confondrait les deux. Choisis-en un autre.');
  if (negos.some((x) => d.readUInt32LE(x + 8) === toRef)) throw new Error('Ce club a déjà une négociation pour toi : choisis-en un autre.');
  const n = negos.find((x) => d.readUInt32LE(x + 8) === fromRef);
  if (!n) throw new Error('La négociation de cette offre est introuvable : elle a sans doute expiré.');

  // dossier interne : sans lui, le transfert n'aboutirait pas
  let received = null, dossier = false;
  for (let b = 0; b < DEADLINE_BLOCKS; b++) {
    const blk = m + DEADLINES + b * DEADLINE_BLOCK;
    if (d[blk] !== 0 || d[blk + 2] !== 0xFF) break;
    for (let k = 0; k < 8; k++) {
      const r = blk + 4 + k * 12;
      if (d.readUInt16LE(r) === offerId && d[r + 2] === 1) { received = d.subarray(r + 4, r + 8); dossier = d[blk + 1] !== 0xFF; }
    }
  }
  if (!dossier) throw new Error('Cette offre n’a pas de dossier dans le jeu (offre créée à la main) : réorientée, elle n’aboutirait pas.');

  const changes = [];
  d.writeUInt32LE(toRef, o + 4); changes.push('offre');
  d.writeUInt32LE(toRef, n + 8); changes.push('négociation');
  // fiche « club intéressé » : changée, ou échangée si le club d'arrivée suivait déjà le joueur
  const ints = Array.from({ length: INTEREST_MAX }, (_, k) => interest(k)).filter((x) => d.readUInt32LE(x + 4) === playerId);
  const iFrom = ints.find((x) => d.readUInt32LE(x + 8) === fromRef);
  const iTo = ints.find((x) => d.readUInt32LE(x + 8) === toRef);
  if (iFrom) {
    d.writeUInt32LE(toRef, iFrom + 8);
    if (iTo) d.writeUInt32LE(fromRef, iTo + 8);
    changes.push(iTo ? 'clubs intéressés (échangés)' : 'club intéressé');
  }
  // message « Offre reçue » : celui du jour de l'offre, sinon le plus récent de ce club
  const count = d.readUInt32LE(MESSAGE_COUNT);
  const msgs = [];
  for (let k = 0; k < count - 1 && k < 400; k++) {
    const x = MESSAGE_LOG + k * MESSAGE_SIZE;
    if (d.readUInt32LE(x + 8) === MESSAGE_OFFER && d.readUInt32LE(x + 0x20) === fromRef) msgs.push(x);
  }
  const msg = msgs.find((x) => received && d.subarray(x + 0xC, x + 0x10).equals(received)) || msgs.at(-1);
  if (msg) { d.writeUInt32LE(toRef, msg + 0x20); changes.push('message'); }
  for (let k = 0; k < 32; k++) {
    const x = ACTIVE_LIST + 4 * k, v = d.readUInt32LE(x);
    if (v === FREE32) break;
    if (v === fromRef) { d.writeUInt32LE(toRef, x); changes.push('liste des offres en cours'); break; }
  }
  return { data: d, fromRef, changes };
}

// Le jeu est ouvert ? PES 2021 ou Football Life (FL_2027.exe…), lu dans la liste des processus de Windows.
const GAME_EXE = /^"?(PES2021|FL_?\d+)\.exe\b/im;
const gameInTaskList = (out) => GAME_EXE.test(String(out || ''));
// Sans la liste des programmes (tasklist en échec), on ne peut pas savoir : rien n'est écrit (avant, on écrivait).
function gameRunning() {
  let out;
  try {
    out = execFileSync('tasklist', ['/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error('LifeLegend n’arrive pas à vérifier que le jeu est fermé : rien n’a été modifié. Réessaie dans un instant.');
  }
  return gameInTaskList(out);
}

// Réoriente l'offre dans le fichier de sauvegarde : jeu fermé, copie de sécurité, écriture puis relecture.
function redirectOfferInSave({ savePath, backupDir, playerId, offerId, toRef }) {
  if (gameRunning()) throw new Error('Le jeu est ouvert : sauvegarde ta partie, quitte-le, puis recommence.');
  const before = fs.statSync(savePath);
  const original = fs.readFileSync(savePath);
  const career = readCareer(savePath);
  if (career.player.id !== playerId) throw new Error('La sauvegarde suivie n’est plus celle de ce joueur : synchronise d’abord.');
  const team = career.teams.get(toRef);
  if (!team) throw new Error('Club introuvable dans ta sauvegarde.');
  const parts = splitSave(original);
  const { data, fromRef, changes } = redirectInData(parts.data, { playerId, clubRef: career.club.ref, offerId, toRef });
  parts.data = data;
  const out = joinSave(parts);
  // relecture : le fichier réécrit se déchiffre et porte la nouvelle offre
  if (!decryptSave(out).data.equals(data)) throw new Error('Vérification de l’écriture échouée : rien n’a été modifié.');

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `${path.basename(savePath)}-${stamp}-avant-reorientation`);
  fs.writeFileSync(backup, original);
  for (const f of fs.readdirSync(backupDir).filter((x) => x.includes('-avant-reorientation')).sort().slice(0, -10)) fs.rmSync(path.join(backupDir, f));

  const now = fs.statSync(savePath);
  if (now.mtimeMs !== before.mtimeMs || now.size !== before.size || gameRunning()) throw new Error('La sauvegarde a changé entre-temps (jeu relancé ?) : rien n’a été modifié.');
  const tmp = `${savePath}.legendlife-tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, savePath);
  const check = readCareer(savePath).player.offers.find((x) => x.id === offerId);
  if (!check || check.clubRef !== toRef) throw new Error(`Relecture inattendue après écriture. Ta sauvegarde d’origine est ici : ${backup}`);
  return { from: career.teams.get(fromRef)?.name || null, to: team.name, changes, backup, offer: check };
}

module.exports = { redirectOfferInSave, redirectInData, gameRunning, gameInTaskList };
