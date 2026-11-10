'use strict';
// Posts des comptes officiels des clubs, faits par l'app à partir de la sauvegarde, sans IA (comme ceux des
// compétitions) : le score final des matchs de son club, ses buts et passes décisives, l'homme du match, les recrues
// et les départs, sa prolongation. Les clubs de son championnat (pas les autres) annoncent aussi leurs recrues.
// Textes dans la langue choisie (voir postTexts.js).

const { officialAuthor, realClubHandle } = require('./clubAccounts');
const { clubHandle } = require('./mentions');
const { postTexts } = require('./postTexts');

const clubAuthor = (club) => ({ ...officialAuthor({ handle: clubHandle(club), name: club.name, type: 'club' }), type: 'club', verified: true });
const nationalAuthor = (name) => ({ ...officialAuthor({ handle: clubHandle({ name }), name, type: 'national' }), type: 'national', verified: true });

// Rend [{ key, author, text, weight, importance }] : weight pour les likes, importance pour les réactions des supporters.
function clubPosts({ snapshot: s, changes, transfers = [], handle, max = 6, language = 'fr' }) {
  const L = postTexts(language);
  const mine = clubAuthor(s.club);
  const me = handle ? `@${handle}` : s.player.name;
  const who = `${s.player.name} (${me})`;
  const posts = [];
  const results = changes.newResults || [];
  results.forEach((r, i) => {
    const home = r.venue === 'domicile';
    const [gf, ga] = home ? r.score : [r.score[1], r.score[0]];
    const opp = home ? r.away : r.home;
    const head = gf > ga ? L.win : gf === ga ? L.draw : L.loss;
    const scorers = (home ? r.events?.home : r.events?.away)?.scorers || [];
    const line = scorers.length ? `\n\n⚽ ${scorers.map((x) => `${x.name}${x.goals > 1 ? ` (x${x.goals})` : ''}`).join(', ')}` : '';
    posts.push({ key: `ft|${r.id}`, author: mine, weight: 1.5, importance: 97, text: `⏱️ ${L.fullTime} | ${head}\n\n${r.home} ${r.score[0]}-${r.score[1]} ${r.away}${line}${r.competition ? `\n\n🏆 ${r.competition}` : ''}` });
    // Ses buts et passes décisives (le total de la saison seulement pour le dernier match de la synchro : il est à jour).
    const g = r.me?.goals || 0, a = r.me?.assists || 0;
    if (g || a) {
      const what = g >= 3 ? L.feat.hat : g === 2 ? L.feat.brace : g ? L.feat.goal : L.feat.assist;
      const both = g && a ? L.alsoAssists(a) : '';
      const total = i === results.length - 1 && g && s.stats?.total?.goals ? `\n\n${L.seasonGoal(s.stats.total.goals)}` : '';
      posts.push({ key: `me|${r.id}`, author: mine, weight: 2, importance: 98, text: `${g ? '⚽' : '🅰️'} ${L.featLine(what, who, both, opp)}${total}` });
    }
    if (r.me && r.motm && r.motm.team === s.club.name && r.motm.name === s.player.name) {
      posts.push({ key: `motm|${r.id}`, author: mine, weight: 1.8, importance: 96, text: L.motm(who, r.me.rating ? L.rating(r.me.rating) : null) });
    }
  });
  // Mercato : son club annonce ses recrues et ses départs ; les autres clubs (vrais comptes seulement), leurs recrues.
  let others = 0;
  for (const t of transfers) {
    const him = String(t.player).toLowerCase() === String(s.player.name).toLowerCase();
    const name = him ? who : t.player;
    if (t.direction === 'arrivée') {
      posts.push({ key: `in|${t.player}|${t.gameDate}`, author: mine, weight: him ? 3 : 2, importance: him ? 99 : 95, text: L.joins(name, s.club.name, t.from) });
      if (him && t.from && realClubHandle({ name: t.from })) posts.push({ key: `out|${t.player}|${t.gameDate}`, author: clubAuthor({ name: t.from }), weight: 1.5, importance: 90, text: L.leavesFor(name, t.from, s.club.name) });
    } else if (t.direction === 'départ') {
      posts.push({ key: `out|${t.player}|${t.gameDate}`, author: mine, weight: 1.2, importance: 92, text: L.leaves(t.player, s.club.name, t.to) });
    } else if (t.to && others < 3 && realClubHandle({ name: t.to }) && (s.table || []).some((r) => r.team === t.to)) { // clubs de son championnat seulement
      others++;
      posts.push({ key: `in|${t.player}|${t.gameDate}`, author: clubAuthor({ name: t.to }), weight: 1.5, importance: 60, text: L.joins(t.player, t.to, t.from) });
    }
  }
  if (changes.contractSigned) {
    posts.push({ key: `contrat|${changes.contractSigned.until}`, author: mine, weight: 2.5, importance: 99, text: L.extends(who, s.club.name, L.date(changes.contractSigned.until)) });
  }
  // Liste de sa sélection (nouvelle convocation) : annoncée par le compte de la sélection, lui en tête s'il y est.
  if (changes.ntList) {
    const l = changes.ntList;
    const names = [...(l.me ? [who] : []), ...l.players];
    posts.push({ key: `nt|${l.team}|${l.match || s.gameDate}`, author: nationalAuthor(l.team), weight: l.me ? 2.5 : 1.2, importance: l.me ? 99 : 80, text: `📋 ${L.ntList(l.team, l.match)}\n\n${names.join(', ')}` });
  }
  return posts.sort((x, y) => y.importance - x.importance).slice(0, max);
}

module.exports = { clubPosts };
