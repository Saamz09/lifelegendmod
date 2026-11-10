'use strict';
// L'agent du joueur : estimations d'intérêt des clubs et de prolongation, calculées par l'app à partir
// de la sauvegarde (forme, contrat, niveau des clubs, période de mercato, attitude choisie).
// Ce sont des rumeurs privées : l'IA ne fait que les commenter, avec ces chiffres exacts.

const { leagueTable } = require('../save/blReader');
const { windowOpen } = require('./mercato');

// Niveau des championnats suivis (0 à 1) : Angleterre, Espagne, Italie, Allemagne, France, puis Portugal, Pays-Bas.
const LEAGUE_LEVEL = { 0x11: 0.62, 0x13: 0.58, 0x12: 0.56, 0x32: 0.56, 0x14: 0.5, 0x16: 0.4, 0x15: 0.38 };
const DEFAULT_LEVEL = 0.3;

const AGENTS = [
  ['Julien Moreau', 'Moreau Sports Management'], ['Karim Belkacem', 'KB Football Agency'], ['Sofia Lindqvist', 'Nordic Talent Group'],
  ['Marco Ferraris', 'Ferraris & Partners'], ['Nadia Haddad', 'Haddad Player Services'], ['Lucas Vermeulen', 'Orange Line Sports'],
];

const STANCES = { stay: 'je veux prolonger', open: 'ouvert à tout', leave: 'je veux partir' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function ensureAgent(state) {
  if (!state.agent) {
    const [name, agency] = AGENTS[hash(state.careerId) % AGENTS.length];
    state.agent = { name, agency, stance: 'open', lastReportOn: null, reported: null, market: null };
  }
  return state.agent;
}

// Mercato auquel appartient une date (calendrier du jeu : 1/7 → 31/8 et 1/1 → 31/1), ou null.
function windowKey(date) {
  if (!date) return null;
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return m === 7 || m === 8 ? `${y}-ete` : m === 1 ? `${y}-hiver` : null;
}

function monthsBetween(a, b) {
  if (!a || !b) return null;
  const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// Forme de 0 à 1 : note moyenne et décisivité, amortie s'il a peu joué (la saison passée prend le relais).
function formIndex(state, snapshot) {
  const cur = snapshot.stats.total;
  const archived = Object.values(state.seasons || {}).filter((s) => s.season !== snapshot.season && s.stats.apps >= 5).at(-1);
  const score = (st) => {
    if (!st || !st.apps) return null;
    const rating = clamp(((st.avgRating ?? 6) - 5.8) / 1.7, 0, 1);
    const decisive = clamp((st.goals + st.assists) / st.apps / 0.8, 0, 1);
    return rating * 0.6 + decisive * 0.4;
  };
  const now = score(cur), before = score(archived?.stats);
  // La flèche de forme du jeu (de « très mauvaise » à « excellente ») nuance un peu l'ensemble.
  const arrow = snapshot.player.profile ? (snapshot.player.profile.formArrowLevel - 2) * 0.04 : 0;
  if (now === null) return clamp((before ?? 0.4) + arrow, 0, 1);
  const w = clamp(cur.apps / 6, 0, 1);
  return clamp(now * w + (before ?? 0.4) * (1 - w) + arrow, 0, 1);
}

// Prestige de chaque club des championnats suivis : niveau du championnat + place au classement.
function clubPrestige(career, extraLeagueId) {
  const out = new Map();
  const ids = new Set([...Object.keys(LEAGUE_LEVEL).map(Number), extraLeagueId].filter((x) => x !== undefined));
  for (const id of ids) {
    const table = leagueTable(career.matches, id);
    if (table.length < 8) continue;
    const league = career.competitions.get(id) || '';
    // Dans PES 2021 vanilla, la compétition 0x32 est le « Championnat PEU » (clubs européens divers), pas la Bundesliga.
    const level = id === 0x32 && !/bundesliga/i.test(league) ? 0.36 : LEAGUE_LEVEL[id] ?? DEFAULT_LEVEL;
    // En début de saison, le classement dit peu de choses : il ne compte pleinement qu'après une douzaine de matchs.
    const played = Math.max(0, ...table.map((r) => r.p));
    const w = clamp(played / 12, 0, 1);
    table.forEach((r, i) => {
      const position = 1 - i / (table.length - 1);
      out.set(r.ref, { team: r.team, league, prestige: level + 0.38 * (position * w + 0.5 * (1 - w)), level });
    });
  }
  return out;
}

// Championnat d'un club hors des grands championnats : la compétition où il joue le plus de matchs.
function leagueFromMatches(career, ref) {
  const counts = new Map();
  for (const m of career.matches) if (m.home.ref === ref || m.away.ref === ref) counts.set(m.competitionId, (counts.get(m.competitionId) || 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? career.competitions.get(best[0]) || null : null;
}

// Estimations brutes (sans l'attitude du joueur), recalculées à chaque synchro.
function computeMarket(career, snapshot, state) {
  const prestige = clubPrestige(career, snapshot.league.id);
  const mine = prestige.get(snapshot.club.ref) || { prestige: 0.45 };
  const form = formIndex(state, snapshot);
  const monthsLeft = monthsBetween(snapshot.gameDate, snapshot.player.contractUntil);
  const open = windowOpen(snapshot.gameDate);
  // Constaté en jeu : pas d'offre pendant le premier mercato d'une carrière, ni après une signature
  // (prolongation comprise) : la Liste d'offres reste vide jusqu'au mercato suivant.
  const signedOn = state.agent?.signed?.on, movedOn = state.agent?.movedOn;
  const now = windowKey(snapshot.gameDate);
  const lockReason = !open ? null
    : snapshot.player.careerStart && windowKey(snapshot.player.careerStart) === now ? 'debut'
      : movedOn && windowKey(movedOn) === now ? 'moved'
        : signedOn && windowKey(signedOn) === now ? 'signed' : null;
  const lockedUntilNextWindow = Boolean(lockReason);
  const contractBoost = monthsLeft === null ? 1 : monthsLeft <= 6 ? 1.5 : monthsLeft <= 12 ? 1.25 : 1;
  const target = mine.prestige + (form - 0.5) * 0.6;
  const date = snapshot.gameDate || '';
  const fortnight = date.slice(0, 7) + (Number(date.slice(8, 10)) > 15 ? 'b' : 'a');
  const halfSeason = `${snapshot.season}|${Number(date.slice(5, 7)) >= 7 ? 1 : 2}`;
  // Chaleur du marché : la probabilité du club le plus intéressé.
  // Un joueur blessé pour longtemps attire moins (sauvegarde : jours d'indisponibilité).
  const injuredDays = snapshot.player.profile?.unavailableDays || 0;
  const injury = injuredDays > 30 ? 0.6 : injuredDays > 10 ? 0.85 : 1;
  const heat = clamp((0.12 + 0.7 * form) * (open ? 1 : 0.6) * contractBoost * injury, 0.05, 0.9);

  const scored = [];
  for (const [ref, c] of prestige) {
    if (ref === snapshot.club.ref) continue;
    const fit = Math.exp(-((c.prestige - target) ** 2) / (2 * 0.1 ** 2));
    const need = 0.2 + (hash(`${ref}|need|${halfSeason}`) % 1100) / 1000;    // besoin du club à ce poste, stable sur la demi-saison
    const noise = 0.92 + (hash(`${ref}|${fortnight}`) % 160) / 1000;          // petites variations d'une quinzaine à l'autre
    scored.push({ ref, team: c.team, league: c.league, prestige: c.prestige, score: fit * need * noise });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score || 1;
  const clubs = scored.slice(0, 8).map((c) => ({ ref: c.ref, team: c.team, league: c.league, base: heat * (c.score / top) ** 3 }));

  // Demande de transfert (« Négociations → Demande de transfert » dans le jeu) : d'après l'aide du jeu, le club
  // accepte si le poste colle à sa tactique et si le joueur vaut au moins un remplaçant chez lui. On ne connaît
  // pas l'effectif des autres clubs : on compare le niveau du club (championnat, classement) à celui du joueur.
  const BUCKETS = [['ambitieux', 0.04, 0.13], ['au moins remplaçant', -0.03, 0.04], ['titulaire probable', -0.11, -0.03]];
  const pool = [...prestige.entries()]
    .filter(([ref]) => ref !== snapshot.club.ref)
    .map(([ref, c]) => ({ ref, team: c.team, league: c.league, prestige: c.prestige, gap: c.prestige - target,
      need: 0.75 + (hash(`${ref}|need|${halfSeason}`) % 400) / 1000 }));   // besoin du club à ce poste (0,75 à 1,15)
  const targets = [];
  for (const [role, lo, hi] of BUCKETS) {
    const pick = pool.filter((c) => c.gap > lo && c.gap <= hi && c.need >= 0.9).sort((a, b) => b.prestige - a.prestige)[0];
    if (!pick) continue;
    targets.push({
      ref: pick.ref,
      team: pick.team,
      league: pick.league,
      role,
      chance: Math.round(clamp((0.62 - 3.2 * pick.gap + 0.3 * (form - 0.5)) * pick.need, 0.05, 0.9) * 100),
    });
  }

  // Réorientation d'une vraie offre (attitude « je veux partir ») : mêmes niveaux que la demande de transfert,
  // deux clubs par niveau, jamais un club qui a déjà une offre pour lui dans la sauvegarde (le jeu les confondrait).
  const offerClubs = new Set((snapshot.player.offers || []).map((o) => o.clubRef));
  const redirectTargets = [];
  for (const [role, lo, hi] of BUCKETS) {
    pool.filter((c) => c.gap > lo && c.gap <= hi && c.need >= 0.9 && !offerClubs.has(c.ref))
      .sort((a, b) => b.prestige - a.prestige).slice(0, 2)
      .forEach((c) => redirectTargets.push({ ref: c.ref, team: c.team, league: c.league, role }));
  }

  // Prolongation : le club veut garder un joueur en forme, surtout si le contrat approche de sa fin.
  const urgency = monthsLeft === null ? 0.7 : monthsLeft <= 12 ? 1.2 : monthsLeft <= 24 ? 0.9 : 0.45;
  // Avec plus de trois ans de contrat, une prolongation n'est pas à l'ordre du jour.
  const extensionBase = monthsLeft !== null && monthsLeft > 36 ? null : clamp((0.15 + 0.6 * form) * urgency, 0.03, 0.95);

  // Offres réellement reçues dans le jeu, en attente de réponse : elles priment sur les estimations.
  // (Le jeu ne les affiche plus quand le joueur vient de signer pendant ce mercato.)
  const offers = lockedUntilNextWindow ? [] : (snapshot.player.offers || []).filter((o) => o.status === 'pending').map((o) => ({
    id: o.id,
    club: o.club,
    kind: o.clubRef === snapshot.club.ref ? 'extension' : 'transfer',
    redirectable: o.clubRef !== snapshot.club.ref && Boolean(o.hasDossier),
    salary: o.salary,
    contractUntil: o.contractUntil,
    receivedOn: o.receivedOn || null,
    deadline: o.deadline || null,
  }));

  // Clubs qui suivent vraiment le joueur (liste cachée du jeu), avec leur championnat.
  const leagueOf = (ref) => prestige.get(ref)?.league || leagueFromMatches(career, ref);
  const following = (snapshot.player.interests || [])
    .filter((i) => i.clubRef !== snapshot.club.ref)
    .map((i) => ({ ref: i.clubRef, team: i.club, league: leagueOf(i.clubRef), since: i.since, valuation: i.valuation, offerMade: i.offerMade }))
    .sort((a, b) => String(a.since).localeCompare(String(b.since)));

  return {
    computedOn: snapshot.gameDate,
    club: snapshot.club.name,
    offers,
    following,
    contractUntil: snapshot.player.contractUntil || null,
    salary: snapshot.player.salary || null,
    marketValue: snapshot.player.profile?.marketValue || null,
    injuredDays,
    monthsLeft,
    windowOpen: open,
    lockedUntilNextWindow,
    lockReason,
    targets,
    redirectTargets,
    form: Math.round(form * 100),
    extensionBase,
    clubs: clubs.slice(0, 6),
  };
}

// Chance d'une proposition de prolongation selon l'attitude.
const STANCE_GAIN = { stay: 1.25, open: 1, leave: 0.55 };
const extensionWith = (market, stance) => (market.extensionBase === null ? null : Math.round(clamp(market.extensionBase * (STANCE_GAIN[stance] ?? 1), 0.02, 0.97) * 100));
const extensionByStance = (market) => Object.fromEntries(Object.keys(STANCES).map((k) => [k, extensionWith(market, k)]));

// Applique l'attitude du joueur et calcule les pourcentages affichés (avec la tendance).
function applyStance(market, stance, previous) {
  if (!market) return null;
  const known = new Set((previous?.clubs || []).map((c) => c.team));
  const clubs = (market.following || []).map((c) => ({ ...c, trend: known.has(c.team) ? 'flat' : 'new' }));
  const extension = extensionWith(market, stance);
  const oldExt = previous?.extension ?? undefined;
  return {
    ...market,
    stance,
    clubs,
    extension,
    extensionByStance: extensionByStance(market),
    extensionTrend: extension === null ? null : oldExt === undefined ? 'new' : extension > oldExt + 2 ? 'up' : extension < oldExt - 2 ? 'down' : 'flat',
  };
}

// Le mail « point mercato » part au premier rapport, à l'ouverture d'un mercato, à une nouvelle offre, à un nouveau
// club intéressé, sur un vrai changement de l'estimation de prolongation (20 points), et sinon toutes les six semaines
// de jeu : un agent n'écrit pas pour ne rien dire.
function reportDue(agent, view) {
  if (!view) return false;
  const last = agent.reported;
  if (!last || !agent.lastReportOn) return true;
  if (view.windowOpen && !last.windowOpen) return true;
  const days = (Date.parse(view.computedOn) - Date.parse(agent.lastReportOn)) / 86400000;
  if (days >= 42) return true;
  const offerKey = (o) => `${o.club}|${o.salary}|${o.contractUntil}`;
  const reportedOffers = new Set((last.offers || []).map(offerKey));
  if ((view.offers || []).some((o) => !reportedOffers.has(offerKey(o)))) return true;
  return view.clubs.some((c) => c.trend === 'new') || Math.abs((view.extension ?? 0) - (last.extension ?? 0)) >= 20;
}

// Ce que les rédacteurs reçoivent (pour le mail de l'agent seulement).
function agentFacts(agent) {
  const v = agent?.view;
  if (!v) return null;
  const extensionOffer = (v.offers || []).some((o) => o.kind === 'extension');
  return {
    agent: `${agent.name} (${agent.agency})`,
    player_stance: STANCES[agent.stance] || STANCES.open,
    contract_until: v.contractUntil,
    current_salary_eur: v.salary ?? undefined,
    market_value_eur: v.marketValue ?? undefined,
    // Offre réorientée à sa demande (attitude « je veux partir ») : l'agente a fait jouer ses contacts.
    steered_offer: (() => {
      const r = agent.redirects?.at(-1);
      const offer = r && (v.offers || []).find((o) => o.id === r.offerId);
      return offer ? { from_club: r.from, now_from: offer.club, on: r.on } : undefined;
    })(),
    contract_extension_just_signed: agent.signed && agent.signed.on === v.computedOn
      ? { club: agent.signed.club, new_contract_until: agent.signed.until, previous_contract_until: agent.signed.previousUntil, salary_eur: agent.signed.salary ?? undefined, previous_salary_eur: agent.signed.previousSalary ?? undefined }
      : undefined,
    months_left: v.monthsLeft,
    transfer_window_open: v.windowOpen,
    agreed_move: agent.plannedMove ? { club: agent.plannedMove.club, new_contract_until: agent.plannedMove.contractUntil, salary_eur: agent.plannedMove.salary, effective_from: agent.plannedMove.effective } : undefined,
    transfer_request: agent.request ? { club: agent.request.club, since: agent.request.on, status: 'sent in the game, waiting for the club' } : undefined,
    last_transfer_request: agent.lastRequest ? { club: agent.lastRequest.club, outcome: agent.lastRequest.outcome } : undefined,
    transfer_request_targets: (v.targets || []).map((c) => ({ club: c.team, league: c.league, likely_role: c.role, acceptance_chance_pct: c.chance })),
    offers_closed_until_next_window: v.lockedUntilNextWindow ? { debut: 'first transfer window of his career', moved: 'he has just joined his new club', signed: 'he has just signed' }[v.lockReason] : undefined,
    offers_received: (v.offers || []).map((o) => ({
      club: o.club,
      type: o.kind === 'extension' ? 'contract extension from his current club' : 'transfer offer',
      salary_eur: o.salary,
      new_contract_until: o.contractUntil,
      received_on: o.receivedOn || undefined,
      answer_by: o.deadline || undefined,
      status: 'received; he can accept it in the game (offers cannot be refused, an offer he does not accept does not go through)',
    })),
    extension_offer_chance_pct: extensionOffer || v.extension === null ? undefined : v.extension,
    clubs_following_you: v.clubs.map((c) => ({ club: c.team, league: c.league, following_since: c.since, values_you_at_eur: c.valuation, has_made_an_offer: c.offerMade, new_since_last_report: c.trend === 'new' })),
  };
}

module.exports = { ensureAgent, computeMarket, applyStance, extensionByStance, reportDue, agentFacts, STANCES, clubPrestige, formIndex, monthsBetween, hash };
