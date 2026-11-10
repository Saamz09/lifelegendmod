'use strict';
// Comptes officiels des compétitions sur Kop. Ils publient eux-mêmes des posts factuels tirés de la
// sauvegarde (résultats, classement, buteurs), sans IA : rien n'est inventé, aucun joueur ne parle.
// Vrai compte X quand il est connu (Wikidata, licence CC0), sinon un pseudo fabriqué.

const DATA = require('../data/competitionAccounts.json');
const { competitionMatches, leagueTable } = require('../save/blReader');
const { realClubHandle } = require('./clubAccounts');
const { postTexts, deName } = require('./postTexts');
const { roundEleven, seasonAwards } = require('./awards');

const slugHandle = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);

// Nom d'une compétition : les phases d'une même compétition (groupes, tours, apertura/clausura) partagent un compte.
function compName(id, gameName) {
  return DATA.names[String(id)] || String(gameName || '').replace(/™/g, '').replace(/\s+(I|II|Playoffs?)$/i, '').replace(/\s+(I|II|Playoffs?)$/i, '').replace(/\s+(First|Second) Round$/i, '').replace(/\s+20\d\d$/, '').replace(/\s{2,}/g, ' ').trim();
}

// Championnat joué en deux moitiés (Football Life : « MLS First Round » puis « MLS Second Round », les mêmes clubs) :
// la seconde moitié continue les journées de la première (20e journée, pas 1re) et le classement les additionne.
const SECOND_HALF = /\s+Second Round$/i;
function firstHalfOf(matches, gameName) {
  if (!SECOND_HALF.test(gameName || '')) return null;
  const name = String(gameName).replace(SECOND_HALF, ' First Round');
  return matches.find((m) => m.competition === name)?.competitionId ?? null;
}
function roundOffset(matches, gameName) {
  const first = firstHalfOf(matches, gameName);
  const rounds = first == null ? [] : competitionMatches(matches, first).map((m) => m.round);
  return rounds.length ? Math.max(...rounds) + 1 : 0;
}
function seasonTable(matches, id, gameName) {
  const first = firstHalfOf(matches, gameName);
  return leagueTable(first == null ? matches : matches.map((m) => (m.competitionId === first ? { ...m, competitionId: id } : m)), id);
}

// Compte d'une compétition : { key, name, handle, real }.
function compAccount(id, gameName) {
  const name = compName(id, gameName);
  if (!name) return null;
  const known = DATA.accounts[name];
  return { key: name, name: known?.display || name, handle: known?.handle || `${madeUpHandle(name)}_officiel`, real: Boolean(known?.handle) };
}

// Pseudo fabriqué : le nom collé s'il est court, sinon son sigle (« Liga Profesional de Fútbol » -> LPF), sinon son dernier mot.
function madeUpHandle(name) {
  const slug = slugHandle(name);
  if (slug.length <= 16) return slug;
  const words = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const acr = words.filter((w) => w.length > 2).map((w) => w[0].toUpperCase()).join('');
  return acr.length >= 3 ? acr : slugHandle(words.at(-1)).slice(0, 16);
}

// Matchs d'une compétition. Le filtre des enregistrements isolés (équipes étrangères rattachées par erreur) vaut
// pour les championnats ; en coupe, la plupart des équipes ne jouent qu'un match : on garde alors tout.
// Une compétition d'un seul match (supercoupe) n'est gardée qu'entre deux équipes réelles (pas « World Selection »).
// Un match isolé (deux équipes qu'on ne revoit jamais, un jour sans autre match de la compétition) est écarté aussi.
function matchesOf(matches, id) {
  const raw = matches.filter((m) => m.competitionId === id);
  if (raw.length <= 1) return raw.filter((m) => realTeam(m.home) && realTeam(m.away));
  const clean = competitionMatches(matches, id);
  const base = clean.length >= raw.length * 0.8 ? clean : raw;
  const seen = new Map(), days = new Map();
  for (const m of base) {
    for (const t of [m.home.ref, m.away.ref]) seen.set(t, (seen.get(t) || 0) + 1);
    days.set(m.date, (days.get(m.date) || 0) + 1);
  }
  return base.filter((m) => !(seen.get(m.home.ref) === 1 && seen.get(m.away.ref) === 1 && days.get(m.date) === 1));
}

// Équipes réelles : un vrai compte de club, ou une sélection nationale (numéros d'équipe réservés du jeu).
const isNationalTeam = (t) => t.id < 100 || (t.id >= 1000 && t.id < 1195);
const realTeam = (t) => isNationalTeam(t) || Boolean(realClubHandle(t));

// Vrais comptes de compétitions : seule l'app publie en leur nom (l'IA peut les citer, jamais écrire à leur place).
const realHandles = new Set(Object.values(DATA.accounts).filter((a) => a.handle).map((a) => a.handle.toLowerCase()));
const isCompetitionHandle = (handle) => realHandles.has(String(handle || '').replace(/^@/, '').toLowerCase());

// Importance d'une compétition pour le joueur : son championnat, ses autres compétitions, les grandes, le reste.
const BIG = new Set(DATA.big);
function importance(acc, ctx) {
  if (acc.key === ctx.leagueKey) return 100;
  if (ctx.myComps.has(acc.key)) return 90;
  if (BIG.has(acc.key)) return 60;
  return acc.real ? 35 : 20;
}

const fmtScore = (m) => `${m.home.name} ${m.score[0]}-${m.score[1]} ${m.away.name}`;

// Buteurs d'un match, d'après les compositions (noms du jeu quand ils sont connus).
function scorersLine(m, nameOf) {
  const side = (lineup) => lineup.filter((e) => e.goals).map((e) => { const n = nameOf(e.playerId); return n ? `${n}${e.goals > 1 ? ` (x${e.goals})` : ''}` : null; }).filter(Boolean);
  const all = [...side(m.homeLineup || []), ...side(m.awayLineup || [])];
  return all.length ? `⚽ ${all.join(', ')}` : '';
}

// Posts des comptes de compétitions pour les matchs joués entre deux synchros.
// Rend [{ author, text, importance }], au plus `max`, les plus importants d'abord.
function competitionPosts({ career, snapshot, from, nameOf, max = 8, language = 'fr' }) {
  const L = postTexts(language);
  const to = snapshot.gameDate;
  const clubRef = snapshot.club.ref;
  const leagueKey = snapshot.league?.id != null ? compName(snapshot.league.id, snapshot.league.name) : null;
  const myComps = new Set(career.matches.filter((m) => m.home.ref === clubRef || m.away.ref === clubRef).map((m) => compName(m.competitionId, m.competition)));
  const ctx = { leagueKey, myComps };
  const played = career.matches.filter((m) => m.played && m.date > from && m.date <= to && m.competition && m.home.name && m.away.name);
  // Par compte, puis par tour (même compétition, même journée) ; les enregistrements isolés sont écartés.
  // Championnat : un groupe par journée. Coupes et compétitions à groupes : un groupe par jour de match.
  const groups = new Map();
  const cleanIds = new Map(), tables = new Map();
  const tableOf = (id) => { if (!tables.has(id)) tables.set(id, leagueTable(career.matches, id)); return tables.get(id); };
  // Championnat : au moins 8 équipes et un calendrier où chacune affronte toutes les autres (pas une phase de groupes).
  const isLeague = (id) => {
    const t = tableOf(id);
    const n = t.length;
    return n >= 8 && competitionMatches(career.matches, id).length >= 0.9 * (n * (n - 1)) / 2;
  };
  const offsets = new Map();
  for (const m of played) {
    if (!cleanIds.has(m.competitionId)) cleanIds.set(m.competitionId, new Set(matchesOf(career.matches, m.competitionId).map((x) => x.key)));
    if (!cleanIds.get(m.competitionId).has(m.key)) continue;
    const acc = compAccount(m.competitionId, m.competition);
    if (!acc) continue;
    const league = isLeague(m.competitionId);
    if (!offsets.has(m.competitionId)) offsets.set(m.competitionId, roundOffset(career.matches, m.competition));
    const g = league ? `${acc.key}|${m.competitionId}|${m.round}` : `${acc.key}|${m.date}`;
    if (!groups.has(g)) groups.set(g, { acc, competitionId: m.competitionId, gameName: m.competition, round: m.round + offsets.get(m.competitionId), league, matches: [] });
    groups.get(g).matches.push(m);
  }
  const posts = [];
  const author = (acc) => ({ handle: acc.handle, name: acc.name, type: 'competition', verified: true });
  for (const g of groups.values()) {
    // Compétition inventée par PES (aucune équipe réelle) : pas de compte.
    if (!g.acc.real && !g.matches.some((m) => realTeam(m.home) || realTeam(m.away))) continue;
    const imp = importance(g.acc, ctx);
    const isLeague = g.league;
    const mine = g.matches.find((m) => m.home.ref === clubRef || m.away.ref === clubRef);
    // Le match du joueur : un post à part, avec les buteurs.
    if (mine) {
      const sc = scorersLine(mine, nameOf);
      posts.push({ author: author(g.acc), importance: imp + 5, text: `⏱️ ${L.ended} | ${fmtScore(mine)}${sc ? `\n\n${sc}` : ''}${isLeague ? `\n\n#${slugHandle(g.acc.name)} · ${L.round(g.round + 1)}` : ''}` });
    }
    const lines = g.matches.filter((m) => m !== mine).map(fmtScore);
    if (lines.length) {
      const head = isLeague ? `📋 ${L.resultsRound(L.round(g.round + 1))}` : `📋 ${L.resultsDay(g.acc.name, L.date(g.matches[0].date, { day: 'numeric', month: 'long' }))}`;
      const shown = lines.slice(0, 10);
      posts.push({ author: author(g.acc), importance: imp, text: `${head}\n\n${shown.join('\n')}${lines.length > shown.length ? `\n${L.more(lines.length - shown.length)}` : ''}` });
    }
    // Son championnat : le classement après la journée, et les buteurs toutes les 3 journées.
    if (g.acc.key === leagueKey && isLeague) {
      const table = seasonTable(career.matches, g.competitionId, g.gameName);
      const top = table.slice(0, 5).map((r, i) => `${i + 1}. ${r.team} · ${L.pts(r.pts)}`);
      const myRow = table.findIndex((r) => r.ref === clubRef);
      const extra = myRow >= 5 ? `\n…\n${myRow + 1}. ${table[myRow].team} · ${L.pts(table[myRow].pts)}` : '';
      posts.push({ author: author(g.acc), importance: imp - 1, text: `📊 ${L.tableAfter(L.round(g.round + 1))}\n\n${top.join('\n')}${extra}` });
      const race = (snapshot.scorerRace?.top || []).filter((r) => r.name).slice(0, 5);
      if ((g.round + 1) % 3 === 0 && race.length) {
        posts.push({ author: author(g.acc), importance: imp - 2, text: `👟 ${L.scorers(g.acc.name)}\n\n${race.map((r, i) => `${i + 1}. ${r.name}${r.team ? ` (${r.team})` : ''} · ${r.goals}`).join('\n')}` });
      }
      // La journée finie : son équipe type et son meilleur joueur, sur les notes du jeu (src/world/awards.js) ;
      // la saison finie, ses trophées.
      const league = competitionMatches(career.matches, g.competitionId);
      const roundMs = league.filter((m) => m.round === g.matches[0].round);
      if (roundMs.every((m) => m.played)) {
        const colon = L.lang === 'fr' ? ' :' : ':';
        const named = (p) => nameOf(p.id);
        const { xi, best } = roundEleven(roundMs);
        const lines = ['gk', 'def', 'mid', 'att'].map((k) => `${L.lines[k]}${colon} ${xi.filter((p) => p.line === k && named(p)).map(named).join(', ')}`);
        if (xi.some(named)) posts.push({ author: author(g.acc), importance: imp - 1, text: `⭐ ${L.teamOfRound(L.round(g.round + 1))}\n\n${lines.join('\n')}${best && named(best) ? `\n\n${L.playerOfRound(named(best), best.club, L.rating(best.rating))}` : ''}` });
        const aw = seasonAwards(league);
        if (aw) {
          const who = (a, value) => (a && named(a) ? `${named(a)} (${a.club}) · ${value}` : null);
          const rows = [['bestPlayer', who(aw.bestPlayer, aw.bestPlayer && L.rating(aw.bestPlayer.avg))], ['topScorer', who(aw.topScorer, aw.topScorer?.goals)],
            ['topAssists', who(aw.topAssists, aw.topAssists?.assists)], ['bestKeeper', who(aw.bestKeeper, aw.bestKeeper && L.rating(aw.bestKeeper.avg))]].filter(([, v]) => v);
          const team = aw.xi.filter(named).map(named).join(', ');
          posts.push({ author: author(g.acc), importance: imp + 3, text: `🏆 ${L.awards(g.acc.name, snapshot.season)}\n\n${rows.map(([k, v]) => `${L.awardNames[k]}${colon} ${v}`).join('\n')}${team ? `\n\n${L.awardNames.xi}${colon} ${team}` : ''}` });
        }
      }
    }
  }
  // Les plus importants d'abord ; 5 posts au plus pour son championnat (résultats, classement, buteurs, équipe type,
  // trophées), 3 pour les autres : plusieurs compétitions ont la parole.
  const perAccount = new Map();
  return posts.sort((a, b) => b.importance - a.importance).filter((p) => {
    const n = perAccount.get(p.author.handle) || 0;
    perAccount.set(p.author.handle, n + 1);
    return n < (p.importance >= 98 ? 5 : 3);
  }).slice(0, max);
}

// ---------- Avant-match : « 🔜 La 24e journée », la veille (ou le jour même) ----------

const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hourOf = (m, L) => (Number.isInteger(m.hour) && m.hour >= 0 && m.hour <= 23 ? L.hour(m.hour) : null);
const dayLabel = (iso, today, L) => L.dayLabel(iso, today, addDays(today, 1));
const fixtureLine = (m, L) => `${m.home.name} – ${m.away.name}${hourOf(m, L) ? ` · ${hourOf(m, L)}` : ''}`;

// Posts d'avant-match pour les matchs des 3 prochains jours (journée de championnat repérée par sa date médiane,
// coupes par jour de match), et un post « jour de match » pour le sien. `done` : avant-matchs déjà publiés.
// Rend [{ author, text, importance, key }], au plus `max`.
function previewPosts({ career, snapshot, done = new Set(), max = 4, language = 'fr' }) {
  const L = postTexts(language);
  const today = snapshot.gameDate, until = addDays(today, 3);
  const clubRef = snapshot.club.ref;
  const leagueKey = snapshot.league?.id != null ? compName(snapshot.league.id, snapshot.league.name) : null;
  const myComps = new Set(career.matches.filter((m) => m.home.ref === clubRef || m.away.ref === clubRef).map((m) => compName(m.competitionId, m.competition)));
  const ctx = { leagueKey, myComps };
  const author = (acc) => ({ handle: acc.handle, name: acc.name, type: 'competition', verified: true });
  const posts = [];
  const tables = new Map();
  const isLeague = (id) => {
    if (!tables.has(id)) {
      const t = leagueTable(career.matches, id);
      tables.set(id, t.length >= 8 && competitionMatches(career.matches, id).length >= 0.9 * (t.length * (t.length - 1)) / 2);
    }
    return tables.get(id);
  };
  // Tours à venir, par compte : journée entière (championnat) ou jour de match (coupes).
  const groups = new Map();
  const clean = new Map(), offsets = new Map();
  for (const m of career.matches) {
    if (m.played || !m.competition || !m.home.name || !m.away.name || m.date < today) continue;
    if (!clean.has(m.competitionId)) clean.set(m.competitionId, new Set(matchesOf(career.matches, m.competitionId).map((x) => x.key)));
    if (!clean.get(m.competitionId).has(m.key)) continue;
    const acc = compAccount(m.competitionId, m.competition);
    if (!acc) continue;
    const league = isLeague(m.competitionId);
    if (!league && m.date > until) continue;
    const key = league ? `${acc.key}|${m.competitionId}|r${m.round}` : `${acc.key}|${m.date}`;
    if (!offsets.has(m.competitionId)) offsets.set(m.competitionId, roundOffset(career.matches, m.competition));
    if (!groups.has(key)) groups.set(key, { key, acc, league, round: m.round + offsets.get(m.competitionId), matches: [] });
    groups.get(key).matches.push(m);
  }
  // Un seul programme par championnat à la fois : la prochaine journée (la suivante attend la synchro d'après).
  const medianOf = (g) => { const dates = g.matches.map((m) => m.date).sort(); return dates[Math.floor(dates.length / 2)]; };
  const programmed = new Set();
  for (const g of [...groups.values()].sort((a, b) => (medianOf(a) < medianOf(b) ? -1 : medianOf(a) > medianOf(b) ? 1 : 0))) {
    if (!g.acc.real && !g.matches.some((m) => realTeam(m.home) || realTeam(m.away))) continue;
    const median = medianOf(g);
    if (median < today || median > until) continue;
    const imp = importance(g.acc, ctx) - 3;
    // Son match : « jour de match » le jour même, « demain » la veille.
    const mine = g.matches.find((m) => (m.home.ref === clubRef || m.away.ref === clubRef) && (m.date === today || m.date === addDays(today, 1)));
    const mineKey = mine && `${mine.date === today ? 'jour' : 'veille'}|${mine.date}|${mine.home.ref}|${mine.away.ref}`; // la veille, puis le jour même
    if (mine && !done.has(mineKey)) {
      const where = [hourOf(mine, L) && `⏰ ${hourOf(mine, L)}`, mine.home.stadium && `📍 ${mine.home.stadium}`].filter(Boolean).join(' · ');
      posts.push({ key: mineKey, author: author(g.acc), importance: imp + 10, text: `${mine.date === today ? `🏟️ ${L.matchday}` : `🔜 ${L.tomorrowCaps}`}\n\n${mine.home.name} – ${mine.away.name}${where ? `\n${where}` : ''}${g.league ? `\n\n#${slugHandle(g.acc.name)} · ${L.round(g.round + 1)}` : ''}` });
    }
    if (g.league) { if (programmed.has(g.acc.key)) continue; programmed.add(g.acc.key); }
    if (done.has(g.key)) continue;
    // Programme : par jour, dans l'ordre des horaires, son match marqué ⭐, 10 affiches au plus.
    const ordered = [...g.matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.hour || 0) - (b.hour || 0)));
    const shown = ordered.slice(0, 10);
    const lines = [];
    let day = null;
    for (const m of shown) {
      if (g.league && m.date !== day) { day = m.date; lines.push(`${lines.length ? '\n' : ''}${dayLabel(m.date, today, L)}`); }
      lines.push(`${m.home.ref === clubRef || m.away.ref === clubRef ? '⭐ ' : ''}${fixtureLine(m, L)}`);
    }
    const more = ordered.length - shown.length;
    const day1 = dayLabel(g.matches[0].date, today, L);
    const head = g.league ? `🔜 ${L.preview(L.round(g.round + 1), g.acc.name)}` : `🔜 ${g.acc.name} · ${['de', 'en'].includes(L.lang) ? day1 : day1.toLowerCase()}`;
    posts.push({ key: g.key, author: author(g.acc), importance: imp, text: `${head}\n\n${lines.join('\n')}${more > 0 ? `\n${L.more(more)}` : ''}` });
  }
  return posts.sort((a, b) => b.importance - a.importance).slice(0, max);
}

// Comptes de compétitions dont on parle : son championnat, ses autres compétitions, les grandes compétitions.
function competitionAccountsFacts(career, snapshot) {
  const clubRef = snapshot.club.ref;
  const seen = new Map();
  const add = (id, name) => { const a = compAccount(id, name); if (a && !seen.has(a.key)) seen.set(a.key, { competition: a.name, handle: `@${a.handle}` }); };
  if (snapshot.league?.id != null) add(snapshot.league.id, snapshot.league.name);
  for (const m of career.matches) if (m.home.ref === clubRef || m.away.ref === clubRef) add(m.competitionId, m.competition);
  for (const key of DATA.big) { const a = DATA.accounts[key]; if (a?.handle && !seen.has(key)) seen.set(key, { competition: a.display || key, handle: `@${a.handle}` }); }
  return [...seen.values()].slice(0, 16);
}

module.exports = { deName, isNationalTeam, realTeam, matchesOf, compAccount, compName, competitionPosts, previewPosts, competitionAccountsFacts, isCompetitionHandle, fakeLogos: new Set(DATA.fakeLogos), competitionAccountsRev: DATA.rev };
