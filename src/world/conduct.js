'use strict';
// Relation avec son club : ce qu'il dit de son coach, de ses coéquipiers et de son club en conférence de presse, sur
// Kop et dans Vestiaire. L'IA juge chacun de ses messages dans la requête qui part déjà quand il écrit (champ « conduct »
// de la réponse) : aucune requête en plus. Le code tient les comptes et décide à la synchro suivante, par paliers (son
// choix du 2026-11-10, « progressive ») : un rappel à l'ordre du coach, puis une mise à l'écart d'un match, puis de deux,
// quels que soient son influence ou l'enjeu des matchs. La mise à l'écart s'écrit dans le jeu (ses jours
// d'indisponibilité, src/save/conductWrite.js), jeu fermé, sur un bouton de Mails.
// Le temps apaise : sans nouvel écart, les points s'effacent au bout de deux semaines de jeu et chaque mois enlève un palier.

const { postTexts } = require('./postTexts');

const TARGETS = ['coach', 'teammates', 'club'];
const SOURCES = ['press', 'kop', 'huddle'];
const WEIGHT = [0, 1, 3, 5];                  // un écart de niveau 1, 2 ou 3 → des points
const TRIGGER = 3;                            // points qui déclenchent le palier suivant
const POINTS_DAYS = 14, CALM_DAYS = 30, KEEP = 40;
// La mise à l'écart dans le jeu attend de savoir où le jeu garde les vraies indisponibilités : l'octet +328 de la fiche
// ne suffit pas (essai en jeu du 2026-11-10 : titulaire le 14 et le 21/01, compteur remis à 0 par le jeu). En attendant,
// après le rappel à l'ordre, un nouvel écart rend seulement l'ambiance tendue (kind « tension »).
const SANCTIONS_IN_GAME = false;

const noon = (iso) => Date.parse(`${iso}T12:00:00Z`);
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 864e5);
const addDays = (iso, n) => new Date(noon(iso) + n * 864e5).toISOString().slice(0, 10);

function ensureConduct(state) {
  return (state.conduct ||= { points: 0, stage: 0, lastIncident: null, calmFrom: null, incidents: [], pending: null, history: [] });
}

// Le temps apaise, à partir du dernier écart : les points s'effacent après deux semaines, un palier de moins par mois.
function settle(c, date) {
  if (!c.lastIncident || !date) return;
  if (daysBetween(c.lastIncident, date) >= POINTS_DAYS) c.points = 0;
  const from = c.calmFrom || c.lastIncident;
  const months = Math.floor(daysBetween(from, date) / CALM_DAYS);
  if (months > 0 && c.stage > 0) {
    c.stage = Math.max(0, c.stage - months);
    c.calmFrom = addDays(from, months * CALM_DAYS);
  }
}

// Un de ses messages jugé par l'IA ({ level 0-3, target, quote }). Rend l'écart retenu, ou null.
// La citation doit être tirée de ses mots ; sinon on garde le début de son message.
function recordConduct(state, raw, { source, text, gameDate }) {
  const level = Math.max(0, Math.min(3, Math.round(Number(raw?.level) || 0)));
  if (!level || !gameDate || !SOURCES.includes(source)) return null;
  const c = ensureConduct(state);
  settle(c, gameDate);
  const said = String(text || '').replace(/\s+/g, ' ').trim();
  const q = String(raw?.quote || '').replace(/\s+/g, ' ').trim();
  const quote = (q && said.includes(q) ? q : said).slice(0, 200);
  const incident = { date: gameDate, source, level, target: TARGETS.includes(raw?.target) ? raw.target : 'club', quote, counted: false };
  c.incidents = [...c.incidents, incident].slice(-KEEP);
  c.points += WEIGHT[level];
  c.lastIncident = gameDate;
  c.calmFrom = gameDate;
  return incident;
}

// La relation du moment avec chacun (coach, coéquipiers, club), d'après les écarts des deux derniers mois et le palier.
function relationOf(state, date) {
  const c = state.conduct;
  const out = { coach: 'good', teammates: 'good', club: 'good', stage: c?.stage || 0 };
  if (!c) return out;
  for (const t of TARGETS) {
    const weight = c.incidents.filter((x) => x.target === t && (!date || daysBetween(x.date, date) <= 60)).reduce((n, x) => n + WEIGHT[x.level], 0);
    out[t] = weight >= 5 ? 'broken' : weight >= 1 ? 'tense' : 'good';
  }
  if (c.stage >= 2 && out.club === 'good') out.club = 'tense';
  return out;
}

// La personne visée le plus souvent dans ces écarts.
function mainTarget(incidents) {
  const w = new Map();
  for (const x of incidents) w.set(x.target, (w.get(x.target) || 0) + WEIGHT[x.level]);
  return [...w].sort((a, b) => b[1] - a[1])[0]?.[0] || 'club';
}

const matchOf = (f) => ({ id: f.id, date: f.date, hour: Number.isInteger(f.hour) ? f.hour : null, home: f.home, away: f.away, competition: f.competition || null });

// À chaque synchro : la mise à l'écart en cours se termine quand ses matchs sont joués, puis les écarts accumulés
// déclenchent le palier suivant. Rend { change, mail } : ce que l'édition raconte (CHANGES.conduct) et le mail du coach
// (rappel à l'ordre) ou du club (mise à l'écart), écrits par le code dans sa langue.
function conductAtSync(state, snapshot, { language = 'fr', newId, director = null, sanctions = SANCTIONS_IN_GAME }) {
  const out = { change: null, mail: null };
  const c = state.conduct;
  if (!c) return out;
  const date = snapshot.gameDate;
  const played = new Set((snapshot.fixtures || []).filter((f) => f.played).map((f) => f.id));
  if (c.pending && c.pending.matches.every((m) => played.has(m.id) || m.date < date)) {
    out.ended = { ...c.pending, ended: date };
    c.history = [...c.history, out.ended].slice(-10);
    c.pending = null;
  }
  settle(c, date);
  if (c.points < TRIGGER || c.pending) return out;

  const incidents = c.incidents.filter((x) => !x.counted);
  if (!incidents.length) { c.points = 0; return out; }
  const target = mainTarget(incidents);
  const quotes = incidents.slice(-3).map(({ source, quote, date: d }) => ({ source, quote, date: d }));
  const isPublic = incidents.some((x) => x.source !== 'huddle');
  const P = postTexts(language), L = P.conduct;
  const club = snapshot.club?.name || '';
  const stage = c.stage + 1;

  if (stage > 1 && !sanctions) {
    // Sanction en pause : l'ambiance se tend (le coach plus froid, la presse en parle si c'était public), sans mail.
    out.change = { kind: 'tension', target, quotes, public: isPublic };
    incidents.forEach((x) => { x.counted = true; });
    c.points = 0;
    c.calmFrom = date;
    return out;
  }
  if (stage === 1) {
    const coach = snapshot.club?.coach || snapshot.coaches?.mine || null;
    if (!coach) return out;
    out.change = { kind: 'warning', target, quotes, public: isPublic, next: 'left out of the squad for one match' };
    out.mail = { id: newId(), from: coach, role: 'coach', club, subject: L.warningSubject(), unread: true, closed: false, conduct: 'warning',
      messages: [{ who: 'them', body: L.warning({ quote: quotes.at(-1), target }), gameDate: date }] };
  } else {
    const count = stage === 2 ? 1 : 2;
    const upcoming = (snapshot.fixtures || []).filter((f) => !f.played && f.date >= date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, count);
    if (upcoming.length < count) return out; // le calendrier ne montre pas encore ces matchs : la décision attend
    const matches = upcoming.map(matchOf);
    c.pending = { id: newId(), decided: date, count, matches, days: daysBetween(date, matches.at(-1).date) + 1, applied: null, target, quotes, public: isPublic };
    out.change = { kind: 'left_out', matches: matches.map(({ id, ...m }) => m), target, quotes, public: isPublic };
    out.mail = { id: newId(), from: director || club, role: 'club', club, subject: L.leftOutSubject(count), unread: true, closed: false, conduct: c.pending.id,
      messages: [{ who: 'them', body: L.leftOut({ quote: quotes.at(-1), labels: matches.map((m) => `${m.home} – ${m.away}, ${P.date(m.date, { weekday: 'long', day: 'numeric', month: 'long' })}`) }), gameDate: date }] };
  }
  incidents.forEach((x) => { x.counted = true; });
  c.points = 0;
  c.stage = stage;
  c.calmFrom = date;
  return out;
}

// La mise à l'écart couvre-t-elle cette date ? (ses jours d'indisponibilité sont alors une sanction, pas une blessure)
const sanctionActive = (state, date) => {
  const p = state.conduct?.pending;
  return Boolean(p?.applied && date >= p.applied.on && date <= addDays(p.applied.on, p.applied.days));
};
const endedRecently = (state, date) => {
  const h = state.conduct?.history?.at(-1);
  return Boolean(h?.applied && date <= addDays(h.applied.on, h.applied.days + 3));
};

// Ce que l'édition en sait : la relation du moment (sans les citations de Vestiaire, qui restent privées).
function conductFacts(state, date) {
  const c = state.conduct;
  if (!c || (!c.stage && !c.incidents.length)) return undefined;
  const rel = relationOf(state, date);
  return {
    relation_with: { coach: rel.coach, teammates: rel.teammates, club: rel.club },
    disciplinary_stage: c.stage,
    left_out: c.pending ? { matches: c.pending.matches.map(({ id, ...m }) => m) } : null,
  };
}

module.exports = { SANCTIONS_IN_GAME, ensureConduct, recordConduct, relationOf, conductAtSync, conductFacts, sanctionActive, endedRecently, settle, TRIGGER, WEIGHT };
