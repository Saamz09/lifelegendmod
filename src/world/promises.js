'use strict';
// Promesses du joueur : repérées par l'IA dans ses posts (ou en conférence de presse), rattachées à un
// match ou à la saison, puis jugées par l'app à partir de la sauvegarde, sans IA.

const crypto = require('crypto');
const { sameMatch } = require('./snapshot');
const { postTexts } = require('./postTexts');

const MATCH_KINDS = ['goal', 'assist', 'goal_or_assist', 'win', 'unbeaten', 'clean_sheet'];
const SEASON_KINDS = ['season_goals', 'season_assists', 'title'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function label(p, opponent, league, language) {
  const f = postTexts(language).promise[p.kind];
  return f ? f(p.count, opponent, league) : '';
}

// Rattache une promesse brute (sortie de l'IA) à un match à venir ou à la saison en cours.
function bindPromise(raw, { snapshot, sourceText, source, postId, language = 'fr' }) {
  if (!raw || ![...MATCH_KINDS, ...SEASON_KINDS].includes(raw.kind)) return null;
  // Ses mots exacts : sinon, on garde tout le texte d'origine.
  const text = typeof raw.text === 'string' && raw.text.trim() && sourceText.includes(raw.text.trim()) ? raw.text.trim() : sourceText;
  const p = {
    id: crypto.randomBytes(6).toString('hex'),
    kind: raw.kind,
    count: Math.max(1, Math.min(60, Math.round(Number(raw.count) || 1))),
    text,
    source,
    postId: postId || null,
    clubRef: snapshot.club.ref,
    madeOn: snapshot.gameDate,
    status: 'open',
  };
  if (SEASON_KINDS.includes(p.kind)) {
    p.season = snapshot.season;
    p.label = label(p, null, snapshot.league.name, language);
    return p;
  }
  const opponentOf = (f) => (f.homeRef === snapshot.club.ref ? f.away : f.home);
  const upcoming = snapshot.fixtures.filter((f) => !f.played);
  let fixture = null;
  if (raw.opponent) {
    const o = norm(raw.opponent);
    fixture = upcoming.find((f) => { const n = norm(opponentOf(f)); return o && (n.includes(o) || o.includes(n)); }) || null;
  }
  fixture ||= snapshot.next;
  if (!fixture) return null;
  p.matchId = fixture.id;
  p.matchDate = fixture.date;
  p.opponent = opponentOf(fixture);
  p.label = label(p, p.opponent, null, language);
  return p;
}

function judgeMatch(p, f, J) {
  const side = f.homeRef === p.clubRef ? 0 : f.awayRef === p.clubRef ? 1 : -1;
  if (side < 0) return { status: 'void', detail: J.otherClub };
  const gf = f.score[side], ga = f.score[1 - side];
  const me = f.me;
  const individual = (value, what) => {
    if (!me) return { status: 'void', detail: J.didNotPlay };
    return { status: value >= p.count ? 'kept' : 'broken', detail: what(value) };
  };
  switch (p.kind) {
    case 'goal': return individual(me?.goals ?? 0, J.goals);
    case 'assist': return individual(me?.assists ?? 0, J.assists);
    case 'goal_or_assist': return individual((me?.goals ?? 0) + (me?.assists ?? 0), J.either);
    case 'win': return { status: gf > ga ? 'kept' : 'broken', detail: `${f.home} ${f.score[0]}-${f.score[1]} ${f.away}` };
    case 'unbeaten': return { status: gf >= ga ? 'kept' : 'broken', detail: `${f.home} ${f.score[0]}-${f.score[1]} ${f.away}` };
    case 'clean_sheet': return { status: ga === 0 ? 'kept' : 'broken', detail: `${f.home} ${f.score[0]}-${f.score[1]} ${f.away}` };
    default: return null;
  }
}

function judgeSeason(p, state, snapshot, J) {
  const entry = Object.values(state.seasons || {}).find((s) => s.season === p.season);
  if (!entry) return snapshot.season !== p.season ? { status: 'expired', detail: J.notTracked } : null;
  const value = p.kind === 'season_goals' ? entry.stats.goals : p.kind === 'season_assists' ? entry.stats.assists : null;
  if (value !== null && value >= p.count) return { status: 'kept', detail: J.season(value) };
  if (!entry.complete) return null; // la saison continue
  if (p.kind === 'title') {
    const won = entry.trophies.some((t) => t.kind === 'league');
    return { status: won ? 'kept' : 'broken', detail: won ? J.champion : J.finalPos(entry.position || '?') };
  }
  return { status: 'broken', detail: J.endOfSeason(value) };
}

// Juge les promesses ouvertes ; renvoie celles qui viennent d'être tranchées.
function resolvePromises(state, snapshot, language = 'fr') {
  const J = postTexts(language).judge;
  const resolved = [];
  for (const p of state.promises || []) {
    if (p.status !== 'open') continue;
    let verdict = null;
    if (p.matchId) {
      const f = snapshot.fixtures.find((x) => sameMatch(x.id, p.matchId));
      if (!f) verdict = snapshot.season && p.matchDate && p.matchDate < snapshot.gameDate ? { status: 'expired', detail: J.noMatch } : null;
      else if (f.played) verdict = judgeMatch(p, f, J);
    } else if (p.season) {
      verdict = judgeSeason(p, state, snapshot, J);
    }
    if (!verdict) continue;
    Object.assign(p, verdict, { resolvedOn: snapshot.gameDate });
    resolved.push(p);
  }
  return resolved;
}

const openPromises = (state) => (state.promises || []).filter((p) => p.status === 'open')
  .map((p) => ({ text: p.text, promise: p.label, made_on: p.madeOn, post_id: p.postId }));

module.exports = { bindPromise, resolvePromises, openPromises, MATCH_KINDS, SEASON_KINDS };
