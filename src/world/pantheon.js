'use strict';
// Panthéon, l'encyclopédie de ce monde : la page du joueur. Le code tient l'infobox, le parcours, les statistiques et
// le palmarès à partir de la sauvegarde et des saisons archivées ; la biographie avance par chapitres, que l'édition
// écrit seulement quand la carrière connaît un vrai événement (aucune requête de plus à l'IA).

const MAX_CHAPTERS = 80;
const BIO_MAX = 3000;

// Matchs et buts par club, toutes saisons archivées confondues.
function clubTotals(seasons) {
  const out = {};
  for (const s of seasons || []) {
    const t = (out[s.club] ||= { apps: 0, goals: 0 });
    t.apps += s.stats?.apps || 0;
    t.goals += s.stats?.goals || 0;
  }
  return out;
}

// Biographie écrite par le joueur (fenêtre de configuration ou réglages), et s'il incarne un joueur créé ou réel : un
// joueur réel n'a pas de biographie. Un texte changé refait son chapitre à la prochaine édition ; un texte vide la retire
// de la page.
function setBio(state, text, kind = null) {
  if (kind === 'created' || kind === 'real') state.playerKind = kind;
  const clean = state.playerKind === 'real' ? '' : String(text || '').trim().slice(0, BIO_MAX);
  // Sans case cochée, écrire une biographie veut dire que le joueur est créé.
  if (clean && !state.playerKind) state.playerKind = 'created';
  if (clean === (state.bio?.text || '')) return state;
  state.bio = clean ? { text: clean, chapter: false } : null;
  if (!clean && state.pantheon?.chapters) state.pantheon.chapters = state.pantheon.chapters.filter((c) => !c.bio);
  return state;
}

// Événements de cette synchro qui méritent un chapitre. before : les saisons archivées avant cette synchro.
// Liste vide : l'édition n'écrit pas de chapitre.
function pantheonEvents({ state, before, snapshot, changes, seasonNews = {}, seasonReview = null }) {
  const events = [];
  const club = snapshot.club.name;
  const was = clubTotals(before)[club] || { apps: 0, goals: 0 };
  const now = clubTotals(Object.values(state.seasons || {}))[club] || { apps: 0, goals: 0 };
  if (!was.apps && now.apps) events.push({ kind: 'first_match', club });
  if (!was.goals && now.goals) events.push({ kind: 'first_goal', club });
  if (changes.transfer) events.push({ kind: 'transfer', from: changes.transfer.from, to: changes.transfer.to });
  if (changes.contractSigned) events.push({ kind: 'contract_extension', club: changes.contractSigned.club, until: changes.contractSigned.until });
  if (changes.callUp?.first) events.push({ kind: 'first_call_up', team: changes.callUp.team });
  for (const t of seasonNews.trophies || []) events.push({ kind: 'trophy', competition: t.competition });
  for (const m of seasonNews.milestones || []) events.push({ kind: 'milestone', milestone: m });
  if (seasonReview) events.push({ kind: 'season_end', season: snapshot.season, club });
  // Ses origines ouvrent la page. Sur une page déjà commencée, la biographie attend une édition sans autre événement,
  // pour avoir son propre chapitre.
  const bioDue = Boolean(state.bio?.text && !state.bio.chapter);
  if (!state.pantheon?.chapters?.length) events.unshift({ kind: 'origins', ...(bioDue ? { biography: true } : {}) });
  else if (bioDue && !events.length) events.push({ kind: 'origins', biography: true });
  return events;
}

// Ajoute le chapitre écrit par l'édition (titre et texte non vides), daté du jour de jeu.
function addChapter(state, chapter, { gameDate, events, id }) {
  const title = String(chapter?.title || '').trim(), text = String(chapter?.text || '').trim();
  if (!title || !text) return null;
  state.pantheon ||= { chapters: [] };
  const fromBio = events.some((e) => e.biography);
  const entry = { id, gameDate, title: title.slice(0, 120), text: text.slice(0, 1500), events: events.map((e) => e.kind), ...(fromBio ? { bio: true } : {}) };
  // Le chapitre de la biographie va en tête de la page et remplace le précédent.
  if (fromBio) {
    state.pantheon.chapters = [entry, ...state.pantheon.chapters.filter((c) => !c.bio)].slice(0, MAX_CHAPTERS);
    if (state.bio) state.bio.chapter = true;
  } else state.pantheon.chapters = [...state.pantheon.chapters, entry].slice(-MAX_CHAPTERS);
  return entry;
}

// Titres des chapitres déjà écrits, pour que l'édition continue l'histoire sans se répéter.
const chapterTitles = (state) => (state.pantheon?.chapters || []).slice(-10).map((c) => ({ date: c.gameDate, title: c.title }));

module.exports = { setBio, pantheonEvents, addChapter, chapterTitles, clubTotals };
