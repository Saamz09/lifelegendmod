'use strict';
// Notoriété du joueur au fil des synchros : abonnés Kop, valeur marchande (lue dans la sauvegarde quand le jeu la
// donne) et image dans la presse sur 100, calculée sans IA : la place que les journaux lui donnent, la forme (notes de
// ses 5 derniers matchs), ses buts et passes, ses titularisations, et l'humeur des supporters quand elle le vise.
// La place se mesure, pas le ton des articles : il faudrait l'IA pour le lire.

const MAX_POINTS = 400;
const LAST = 5;
const EDITIONS = 3;

// Part des articles de ses dernières éditions qui parlent de lui, entre 0 et 1 (titre ou chapeau : compte double), ou null sans article.
function pressShare(snapshot, editions) {
  const surname = String(snapshot.player?.name || '').trim().split(/\s+/).at(-1);
  const articles = (editions || []).slice(-EDITIONS).flatMap((e) => [...(e.national || []), ...(e.local || [])]);
  if (!surname || !articles.length) return null;
  const named = new RegExp(`(?<!\\p{L})${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu');
  const weight = (a) => (named.test(`${a.headline || ''} ${a.dek || ''}`) ? 2 : named.test(a.body || '') ? 1 : 0);
  return articles.reduce((n, a) => n + weight(a), 0) / (2 * articles.length);
}

function mediaScore(snapshot, fanMood = null, editions = null) {
  const recent = (snapshot.fixtures || []).filter((f) => f.played && f.me).slice(-LAST);
  let score = 50;
  const rated = recent.filter((f) => f.me.minutes >= 30 && Number.isFinite(f.me.rating));
  if (rated.length) score += (rated.reduce((n, f) => n + f.me.rating, 0) / rated.length - 6) * 15;
  score += Math.min(20, 4 * recent.reduce((n, f) => n + (f.me.goals || 0) + (f.me.assists || 0), 0));
  score += 2 * recent.filter((f) => f.me.starter).length;
  if (fanMood && (fanMood.target === 'player' || fanMood.target === 'both')) score -= 8 * (fanMood.level || 0);
  const share = pressShare(snapshot, editions);
  if (share !== null) score += (share - 0.25) * 24;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Point du jour de jeu (remplacé si on resynchronise le même jour).
function recordNotoriety(state, snapshot) {
  const point = { date: snapshot.gameDate, followers: state.profile?.followers ?? null, value: snapshot.player?.profile?.marketValue || null, score: mediaScore(snapshot, state.fanMood, state.editions) };
  const list = (state.notoriety || []).filter((p) => p.date !== point.date);
  state.notoriety = [...list, point].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-MAX_POINTS);
  return point;
}

module.exports = { pressShare, mediaScore, recordNotoriety };
