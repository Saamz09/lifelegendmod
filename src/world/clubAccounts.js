'use strict';
// Vrais comptes X/Twitter des clubs (données Wikidata, licence CC0) : un club présent dans la liste
// publie toujours sous son vrai pseudo. Les clubs absents (clubs inventés par PES, comptes inconnus)
// gardent un pseudo fabriqué « Nom_officiel ».

const DATA = require('../data/clubAccounts.json');

const TRANS = { ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ı: 'i', œ: 'oe' };
const STOP = new Set(['fc', 'cf', 'ac', 'sc', 'afc', 'cd', 'ud', 'sd', 'rc', 'club', 'de', 'calcio', 'futbol', 'football', 'futebol', 'clube']);
const nameKey = (s) => String(s || '').replace(/[øØæÆßłŁđĐıœ]/g, (c) => TRANS[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !STOP.has(w)).join(' ');

// Ancien pseudo fabriqué par la mod (« PFC_officiel ») : sert à renommer les posts déjà publiés.
const slugHandle = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
const madeUpHandle = (c) => `${slugHandle(c.short || c.name)}_officiel`.toLowerCase();

const byId = new Map(), byName = new Map(), byHandle = new Map(), byOld = new Map();
{
  // Les noms du jeu passent avant les autres noms connus (« Paris » = Paris FC, « PSG » = Paris Saint-Germain).
  const alt = new Map();
  for (const c of DATA.clubs) {
    byId.set(c.id, c);
    byHandle.set(c.handle.toLowerCase(), c);
    byName.set(nameKey(c.name), c);
    byOld.set(madeUpHandle(c), c);
  }
  for (const c of DATA.clubs) {
    for (const n of c.alt || []) {
      const k = nameKey(n);
      if (!k || byName.has(k)) continue;
      alt.set(k, alt.has(k) && alt.get(k) !== c ? null : c); // nom partagé par deux clubs : ignoré
    }
  }
  for (const [k, c] of alt) if (c) byName.set(k, c);
}

// Même club : le nom du jeu correspond au nom de la fiche ou à l'un de ses autres noms.
const sameClub = (c, key) => [c.name, ...(c.alt || [])].map(nameKey).some((n) => n && (n === key || n.includes(key) || key.includes(n)));

// Club du jeu (équipe de la sauvegarde, ou simple nom) -> son vrai compte, ou null. Le numéro du club ne suffit pas :
// un patch (Football Life) peut le donner à un autre club ; il faut que le nom concorde, sinon on cherche par le nom.
function realClub(club) {
  if (!club) return null;
  const id = club.id ?? (club.ref != null ? club.ref >>> 14 : null);
  const key = nameKey(club.name || club.team);
  const byNumber = id != null ? byId.get(id) : null;
  if (byNumber && (!key || sameClub(byNumber, key))) return byNumber;
  return byName.get(key) || null;
}

const realClubHandle = (club) => realClub(club)?.handle || null;

// Auteur écrit par l'IA : un compte de club connu prend son vrai pseudo, son nom et son badge.
function officialAuthor(author) {
  // Un compte de compétition reste le sien (son pseudo fabriqué peut ressembler à celui d'un club : « MAI_officiel »).
  if (author.type === 'competition') return author;
  const h = String(author.handle).toLowerCase();
  const known = byHandle.get(h) || byOld.get(h)
    || (author.type === 'club' ? byName.get(nameKey(author.name)) || byName.get(nameKey(String(author.handle).replace(/_?officiel$|_?official$|_?oficial$/i, ''))) : null);
  if (!known) return author;
  return { ...author, handle: known.handle, name: known.name, type: known.kind === 'national' ? 'national' : 'club', verified: true };
}

module.exports = { realClub, realClubHandle, officialAuthor, clubAccountsRev: DATA.rev };
