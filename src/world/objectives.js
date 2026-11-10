'use strict';
// Objectifs personnels fixés par l'entraîneur (sa demande du 2026-11-10) : en début de saison (ou pour la fin de la
// saison quand elle est déjà commencée) et à son retour de blessure. Réalistes : calculés par le code d'après ses stats
// (temps de jeu, buts, passes, notes), son poste et le calendrier qui reste ; suivis à chaque synchro dans la sauvegarde.
// Sans IA : les mails du coach sont écrits par le code dans sa langue. Le bilan arrive à la fin du championnat (ou après
// les matchs du retour). Des objectifs tenus apaisent la relation avec le club (un palier disciplinaire de moins).

const { postTexts } = require('./postTexts');

const ATTACK = ['AC', 'SA', 'AG', 'AD'];
const CREATIVE = ['MOC'];
const MIDFIELD = ['MC', 'MDC', 'MG', 'MD'];
const DEFENCE = ['DC', 'DG', 'DD', 'GB'];
const GOALS_PER_MATCH = { AC: 0.35, SA: 0.25, AG: 0.22, AD: 0.22, MOC: 0.18 };
const COMEBACK_MATCHES = 4;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const halfDown = (x) => Math.floor(x * 2) / 2;

const conceded = (f) => (f.score ? f.score[f.venue === 'domicile' ? 1 : 0] : null);
const playedIn = (f) => Boolean(f.me && f.me.minutes > 0);

// Ses chiffres sur une liste de matchs de son club.
function tally(matches) {
  const his = matches.filter(playedIn);
  const rated = his.filter((f) => Number.isFinite(f.me.rating));
  return {
    matches: matches.length,
    apps: his.length,
    goals: his.reduce((n, f) => n + (f.me.goals || 0), 0),
    ga: his.reduce((n, f) => n + (f.me.goals || 0) + (f.me.assists || 0), 0),
    clean: his.filter((f) => f.me.minutes >= 60 && conceded(f) === 0).length,
    rating: rated.length ? Math.round((rated.reduce((n, f) => n + f.me.rating, 0) / rated.length) * 100) / 100 : null,
    rated: rated.length,
  };
}

// Le genre d'objectif décisif selon son poste : buts (attaquants), buts et passes (milieux), matchs sans encaisser (défense).
const outputKind = (pos) => (ATTACK.includes(pos) ? 'goals' : CREATIVE.includes(pos) || MIDFIELD.includes(pos) ? 'ga' : DEFENCE.includes(pos) ? 'clean' : 'ga');

// Trois objectifs pour les `left` matchs de championnat qui restent, d'après ce qu'il a fait jusqu'ici (ou la saison
// d'avant, ou ce qu'on attend d'un joueur de son poste).
function seasonGoals(snapshot, { left, base }) {
  const pos = snapshot.player?.profile?.position || null;
  const kind = outputKind(pos);
  const share = base.matches >= 3 ? base.apps / base.matches : 0.6;
  const apps = Math.max(1, Math.round(left * clamp(share * 0.9, 0.35, 0.85)));
  const perApp = base.apps >= 3 ? base[kind] / base.apps : 0;
  const floor = kind === 'goals' ? GOALS_PER_MATCH[pos] || 0.2 : kind === 'ga' ? (CREATIVE.includes(pos) ? 0.3 : 0.15) : 0.2;
  const output = Math.max(1, Math.round(apps * Math.max(perApp * 1.1, floor)));
  const rating = clamp(halfDown((base.rating ?? 6) + 0.1), 5.5, 7);
  return [
    { kind: 'apps', target: apps, scope: 'league' },
    { kind, target: output, scope: 'league' },
    { kind: 'rating', target: rating, scope: 'league' },
  ];
}

// Les matchs que suit un objectif : ceux de son club depuis sa date (le championnat, ou les N prochains matchs).
function matchesFor(set, snapshot, league) {
  const all = (snapshot.fixtures || []).filter((f) => f.played && f.date >= set.from).sort((a, b) => a.date.localeCompare(b.date));
  const scoped = set.window ? all.slice(0, set.window) : all.filter((f) => f.competition === league);
  return scoped;
}

// Où en est chaque objectif : valeur, atteint ou pas.
function progressOf(set, snapshot) {
  const t = tally(matchesFor(set, snapshot, set.league));
  return set.items.map((it) => {
    const value = it.kind === 'rating' ? t.rating : t[it.kind];
    const met = it.kind === 'rating' ? value !== null && t.rated >= Math.min(3, set.window || 3) && value >= it.target : value >= it.target;
    return { ...it, value, met };
  });
}

const leagueLeft = (snapshot, league) => (snapshot.fixtures || []).filter((f) => !f.played && f.competition === league).length;

function ensureObjectives(state) {
  return (state.objectives ||= { season: null, comeback: null, history: [] });
}

// À chaque synchro : suit les objectifs en cours, fait le bilan quand leur moment est venu, en fixe de nouveaux.
// Rend { mails, news } : les mails du coach (fixés, bilan) et ce que l'édition peut en savoir (privé : coach et vestiaire).
function objectivesAtSync(state, snapshot, changes, { language = 'fr', newId, returning = false }) {
  const out = { mails: [], news: null };
  if (!snapshot.club?.name || !snapshot.league?.name || changes.firstSync) return out;
  const o = ensureObjectives(state);
  const L = postTexts(language).objectives;
  const coach = snapshot.club.coach || snapshot.coaches?.mine || null;
  const date = snapshot.gameDate;
  const league = snapshot.league.name;
  const news = { reached: [], set: [], review: [] };
  const mail = (subject, body) => out.mails.push({ id: newId(), from: coach, role: 'coach', club: snapshot.club.name, subject, unread: true, closed: false, objectives: true, messages: [{ who: 'them', body, gameDate: date }] });

  for (const slot of ['season', 'comeback']) {
    const set = o[slot];
    if (!set) continue;
    // Un autre club ou une autre saison : ces objectifs ne comptent plus.
    if (set.clubRef !== snapshot.club.ref || (slot === 'season' && set.season !== snapshot.season)) {
      o.history = [...o.history, { ...set, status: 'void', closed: date }].slice(-12);
      o[slot] = null;
      continue;
    }
    const items = progressOf(set, snapshot);
    for (const it of items) if (it.met && !set.reached.includes(it.kind)) { set.reached.push(it.kind); news.reached.push({ objective: L.item(it, set), value: it.value }); }
    set.last = items.map(({ kind, value, met }) => ({ kind, value, met }));
    const done = slot === 'season' ? Boolean(snapshot.leagueComplete || changes.seasonComplete)
      : matchesFor(set, snapshot, league).length >= set.window;
    if (!done) continue;
    const met = items.filter((x) => x.met).length;
    const verdict = met === items.length ? 'all' : met * 2 >= items.length ? 'most' : met ? 'some' : 'none';
    if (coach) mail(L.reviewSubject(set.kind), L.review({ lines: items.map((it) => ({ text: L.item(it, set), met: it.met, value: L.value(it) })), verdict, kind: set.kind }));
    news.review.push({ kind: set.kind, verdict, met, of: items.length });
    o.history = [...o.history, { ...set, status: 'reviewed', verdict, closed: date, last: set.last }].slice(-12);
    o[slot] = null;
    // Des objectifs tenus apaisent la relation avec le club.
    if ((verdict === 'all' || verdict === 'most') && state.conduct?.stage > 0) state.conduct.stage -= 1;
  }

  const ownMatches = (snapshot.fixtures || []).filter((f) => f.played && f.competition === league);
  // Saison : à la première synchro de la saison (ou de ce suivi, en cours de saison), s'il reste assez de matchs.
  const left = leagueLeft(snapshot, league);
  const already = o.history.some((h) => h.slot === 'season' && h.season === snapshot.season && h.clubRef === snapshot.club.ref);
  if (!o.season && !already && coach && left >= 6) {
    const kind = ownMatches.length >= 4 ? 'second_half' : 'season';
    const prev = Object.values(state.seasons || {}).filter((x) => x.season !== snapshot.season && x.stats?.apps).sort((a, b) => String(b.season).localeCompare(String(a.season)))[0];
    const base = ownMatches.length >= 4 ? tally(ownMatches)
      : prev ? { matches: Math.max(prev.stats.apps, 20), apps: prev.stats.apps, goals: prev.stats.goals || 0, ga: (prev.stats.goals || 0) + (prev.stats.assists || 0), clean: 0, rating: prev.stats.avgRating ?? null, rated: prev.stats.apps }
        : { matches: 0, apps: 0, goals: 0, ga: 0, clean: 0, rating: null, rated: 0 };
    const set = { id: newId(), slot: 'season', kind, season: snapshot.season, clubRef: snapshot.club.ref, club: snapshot.club.name, league, from: date, set: date, items: seasonGoals(snapshot, { left, base }), reached: [] };
    set.items = set.items.map((it) => ({ ...it, label: L.item(it, set) }));
    set.last = progressOf(set, snapshot).map(({ kind, value, met }) => ({ kind, value, met }));
    o.season = set;
    mail(L.setSubject(kind), L.setBody({ kind, lines: set.items.map((it) => L.item(it, set)) }));
    news.set.push({ kind, objectives: set.items.map((it) => L.item(it, set)) });
  }
  // Retour de blessure : ses prochains matchs avec son club.
  if (returning && !o.comeback && coach) {
    const season = tally(ownMatches);
    const share = season.matches >= 3 ? season.apps / season.matches : 0.6;
    const set = { id: newId(), slot: 'comeback', kind: 'comeback', season: snapshot.season, clubRef: snapshot.club.ref, club: snapshot.club.name, league, from: date, set: date, window: COMEBACK_MATCHES,
      items: [{ kind: 'apps', target: share >= 0.6 ? 3 : 2, scope: 'club' }, { kind: 'rating', target: clamp(halfDown((season.rating ?? 6) - 0.4), 5.5, 6.5), scope: 'club' }], reached: [] };
    set.items = set.items.map((it) => ({ ...it, label: L.item(it, set) }));
    set.last = progressOf(set, snapshot).map(({ kind, value, met }) => ({ kind, value, met }));
    o.comeback = set;
    mail(L.setSubject('comeback'), L.setBody({ kind: 'comeback', lines: set.items.map((it) => L.item(it, set)) }));
    news.set.push({ kind: 'comeback', objectives: set.items.map((it) => L.item(it, set)) });
  }
  if (news.reached.length || news.set.length || news.review.length) out.news = news;
  return out;
}

// Pour l'édition et les réponses de Vestiaire : les objectifs du moment et où il en est (privé : coach et vestiaire).
function objectivesFacts(state, snapshot) {
  const o = state.objectives;
  if (!o || (!o.season && !o.comeback) || !snapshot) return undefined;
  const WHAT = { apps: 'appearances', goals: 'goals', ga: 'goals + assists', clean: 'clean sheets when he plays', rating: 'average match rating' };
  return [o.season, o.comeback].filter(Boolean).map((set) => ({
    kind: set.kind === 'comeback' ? `comeback (his next ${set.window} club matches)` : set.kind === 'second_half' ? 'rest of the league season' : 'league season',
    objectives: progressOf(set, snapshot).map((it) => ({ what: WHAT[it.kind], target: it.target, now: it.value, reached: it.met })),
  }));
}

module.exports = { objectivesAtSync, objectivesFacts, progressOf, seasonGoals, tally, ensureObjectives, COMEBACK_MATCHES };
