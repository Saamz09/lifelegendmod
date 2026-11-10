'use strict';
// Mentions @ sur Kop : annuaire des comptes mentionnables et réactions des vrais joueurs.
// Les vrais footballeurs et coachs peuvent répondre eux-mêmes (règle 29 des prompts) ; sinon : like, réponse courte ou silence.

const crypto = require('crypto');
const { realClubHandle } = require('./clubAccounts');
const { postTexts } = require('./postTexts');

const slugHandle = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
// Vrai compte du club quand il est connu, sinon un pseudo fabriqué.
const clubHandle = (club) => realClubHandle(club) || `${slugHandle(club.short || club.name)}_officiel`;

// Comptes mentionnables : coéquipiers, adversaire du prochain match, coachs, clubs officiels, comptes connus.
function mentionDirectory(state) {
  const s = state?.snapshot;
  if (!s) return [];
  const out = new Map();
  const add = (e) => { if (e.handle && !out.has(e.handle.toLowerCase())) out.set(e.handle.toLowerCase(), e); };
  const opponent = s.rosters?.opponent || null;
  for (const name of s.rosters?.mine || []) {
    if (name !== s.player.name) add({ handle: slugHandle(name), name, kind: 'player', side: 'teammate', team: s.club.name, verified: true });
  }
  for (const name of opponent?.players || []) add({ handle: slugHandle(name), name, kind: 'player', side: 'opponent', team: opponent.team, verified: true });
  if (s.club.coach) add({ handle: slugHandle(s.club.coach), name: s.club.coach, kind: 'coach', side: 'teammate', team: s.club.name, verified: true });
  if (opponent?.coach) add({ handle: slugHandle(opponent.coach), name: opponent.coach, kind: 'coach', side: 'opponent', team: opponent.team, verified: true });
  add({ handle: clubHandle(s.club), name: s.club.name, kind: 'club', side: 'teammate', team: s.club.name, verified: true });
  if (opponent) add({ handle: clubHandle({ short: opponent.short, name: opponent.team }), name: opponent.team, kind: 'club', side: 'opponent', team: opponent.team, verified: true });
  // Les autres clubs du championnat : leurs comptes officiels sont mentionnables aussi.
  for (const r of s.table || []) if (!r.mine && r.team) add({ handle: clubHandle({ ref: r.ref, name: r.team }), name: r.team, kind: 'club', side: null, team: r.team, verified: true });
  // Sa sélection nationale.
  if (s.nationalTeam?.name) add({ handle: clubHandle({ ref: s.nationalTeam.ref, name: s.nationalTeam.name }), name: s.nationalTeam.name, kind: 'national', side: null, team: s.nationalTeam.name, verified: true });
  // Comptes officiels des compétitions (son championnat, ses coupes, les grandes compétitions).
  for (const c of state.competitionAccounts || []) add({ handle: c.handle.replace(/^@/, ''), name: c.competition, kind: 'competition', side: null, team: null, verified: true });
  // Tous les comptes officiels qui ont une fiche (clubs, compétitions, sélections) : mentionnables aussi.
  for (const pg of Object.values(state.clubPages || {})) if (pg.handle) add({ handle: pg.handle, name: pg.name, kind: pg.kind || 'club', side: null, team: pg.kind ? null : pg.name, verified: true });
  for (const [handle, a] of Object.entries(state.accounts || {})) {
    // Les vraies personnes viennent des effectifs ci-dessus ; un compte noté « joueur » par l'IA n'en fait pas une.
    if (a.type === 'player' || a.type === 'coach') continue;
    add({ handle, name: a.name, kind: a.type || 'fan', side: null, team: null, verified: ['journalist', 'club', 'stats'].includes(a.type) });
  }
  return [...out.values()];
}

function findMentions(text, directory) {
  const byHandle = new Map(directory.map((e) => [e.handle.toLowerCase(), e]));
  const found = [], unknown = [];
  for (const m of String(text).matchAll(/@(\w{2,30})/g)) {
    const e = byHandle.get(m[1].toLowerCase());
    if (e) { if (!found.includes(e)) found.push(e); } else if (!unknown.includes(m[1])) unknown.push(m[1]);
  }
  return { found, unknown };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Réaction d'un vrai joueur mentionné : réponse type, like seul ou silence (selon le ton du post).
function playerReaction(entry, tone, language) {
  const bank = postTexts(language).canned[entry.side === 'opponent' ? 'opponent' : 'teammate'];
  const lines = bank[tone] || bank.neutral;
  const r = Math.random();
  // Les joueurs répondent rarement aux provocations d'un coéquipier, et pas toujours au reste.
  if (!lines.length || r < 0.25) return { kind: 'silence' };
  if (r < 0.5) return { kind: 'like' };
  return {
    kind: 'reply',
    reply: {
      id: crypto.randomBytes(6).toString('hex'),
      author: { handle: entry.handle, name: entry.name, type: 'player', verified: true },
      text: pick(lines),
      likes: Math.round(100 + Math.random() * 2500),
    },
  };
}

module.exports = { mentionDirectory, findMentions, playerReaction, slugHandle, clubHandle };
