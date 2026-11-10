'use strict';
// Influence du joueur sur son entraîneur et son club. Une jauge (0 à 100) calculée sur la sauvegarde, des demandes
// (plan de jeu, mercato, son avenir) jugées par l'app d'après la jauge et la difficulté de la demande, et des décisions
// qui agissent vraiment sur le jeu quand LifeLegend les écrit dans la sauvegarde (save/influenceWrite.js) :
// la formation à tout moment, les transferts seulement pendant un mercato, comme dans le jeu.
// Les demandes et les réponses sont privées (Mails) ; seuls leurs effets se voient (le plan de jeu, un transfert).

const { formIndex, monthsBetween, hash } = require('./agent');
const { tr } = require('../i18n');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// Directeurs sportifs : personnages fictifs, un par club (le jeu ne connaît que les entraîneurs).
const DIRECTORS = ['Martin Keller', 'Thomas Verhoeven', 'Paolo Rinaldi', 'Ana Ribeiro', 'Jonas Berg', 'Luis Moreno', 'Hugo Lambert', 'Erik Sandvik', 'Daniel Novak', 'Sara Lindholm'];
const directorOf = (clubRef) => DIRECTORS[hash(`${clubRef}|directeur`) % DIRECTORS.length];

// Poids du rôle d'équipe du jeu (fiche du joueur) dans le vestiaire.
const ROLE_WEIGHT = { 'Jeune espoir': 0.15, 'Protégé': 0.2, 'Pur coéquipier': 0.4, 'Meneur': 0.8, 'Joueur star': 0.8, 'Leader': 1, 'Général': 1, 'Créateur': 0.6, 'Maestro': 0.7, 'Bourreau de travail': 0.5, 'Joueur malin': 0.5, 'Lutteur': 0.5, 'Joueur clé': 0.8, 'Superstar': 1, 'Héros': 1, 'Virtuose': 0.8, 'Chef d’orchestre': 0.8, 'Symbole': 1, 'Légende': 1, 'Étoile montante': 0.5, 'Mauvais garçon': 0.2, 'Casse-cou': 0.3 };

const MERCATO = ['signing', 'sale', 'undo'];
const ACTIVE = ['waiting', 'ready'];

function ensureInfluence(state) {
  state.influence ||= { requests: [], effects: [], keeps: [], track: 0, news: [] };
  for (const k of ['requests', 'effects', 'keeps', 'news']) state.influence[k] ||= [];
  return state.influence;
}

// Mercato en cours ou prochain (calendrier du jeu).
const currentWindow = (s) => (s.windows || []).find((w) => s.gameDate >= w.open && s.gameDate <= w.close) || null;
const nextWindow = (s) => (s.windows || []).find((w) => w.open > s.gameDate) || null;

// Matchs de son club depuis son arrivée (les plus récents en dernier).
function clubMatchesSinceArrival(s) {
  const joined = s.player.history?.joinedClub || '';
  return s.fixtures.filter((f) => f.played && f.date >= joined);
}

// Points par match du club sur ses n derniers matchs de championnat (avant une date, si donnée).
function pointsPerMatch(s, n = 5, before = null, after = null) {
  const ms = s.fixtures.filter((f) => f.played && f.competition === s.league.name && (!before || f.date < before) && (!after || f.date >= after));
  const last = after ? ms.slice(0, n) : ms.slice(-n);
  if (!last.length) return null;
  const pts = last.reduce((sum, f) => {
    const mine = f.venue === 'domicile' ? 0 : 1, [a, b] = [f.score[mine], f.score[1 - mine]];
    return sum + (a > b ? 3 : a === b ? 1 : 0);
  }, 0);
  return { ppm: pts / last.length, matches: last.length };
}

// Jauge d'influence : titularisations depuis son arrivée, forme, ancienneté au club, rôle d'équipe, bilan de ses demandes.
function influenceScore(state, s) {
  const inf = ensureInfluence(state);
  const recent = clubMatchesSinceArrival(s).slice(-10);
  const starts = recent.length ? recent.filter((f) => f.me?.starter).length / recent.length : 0;
  const form = formIndex(state, s);
  const months = Math.max(0, monthsBetween(s.player.history?.joinedClub || s.gameDate, s.gameDate) ?? 0);
  const seniority = clamp(months / 24, 0, 1);
  const role = s.player.profile?.teamRole || null;
  const roleW = ROLE_WEIGHT[role] ?? 0.4;
  const fans = state.fanMood?.level >= 3 && ['player', 'both'].includes(state.fanMood?.target) ? -8 : 0;
  const raw = 100 * (0.35 * starts + 0.3 * form + 0.15 * seniority + 0.2 * roleW) + inf.track + fans;
  return {
    score: clamp(Math.round(raw), 0, 100),
    parts: { starts: Math.round(starts * 100), matches: recent.length, form: Math.round(form * 100), months, role, track: inf.track, fans, points: { starts: Math.round(35 * starts), form: Math.round(30 * form), role: Math.round(20 * roleW), seniority: Math.round(15 * seniority) } },
  };
}

// Chance qu'une demande passe, d'après la jauge et la difficulté (0 à 100).
const chanceOf = (score, difficulty) => clamp(Math.round(100 / (1 + Math.exp(-(score - difficulty) / 12))), 3, 95);

const importance = (share) => (share >= 0.6 ? 'key_player' : share >= 0.3 ? 'regular' : 'fringe');
// Début de saison : tant que son club a joué moins de 3 matchs, le temps de jeu d'un joueur ne dit encore rien
// (Bozok, 21/08/2020 : 4 293 joueurs des championnats suivis sur 4 646 à 0 %). Données d'avant ce champ : connu.
const SEASON_START_GAMES = 3;
const playingTimeKnown = (aux, ref) => (aux?.clubs?.[ref]?.games ?? SEASON_START_GAMES) >= SEASON_START_GAMES;

// Évalue une demande avant de l'envoyer : { chance, reasons, blocked, ... } (blocked = raison qui l'empêche).
// Index des joueurs par id, attaché à la liste elle-même (une recherche évalue des centaines de joueurs).
const byIdCache = new WeakMap();
function playerById(aux, id) {
  const list = aux?.players || [];
  if (!byIdCache.has(list)) byIdCache.set(list, new Map(list.map((x) => [x[0], x])));
  return byIdCache.get(list).get(id);
}

function assess(kind, params, { state, s, aux }) {
  const inf = ensureInfluence(state);
  const { score } = inf.scoreInfo || influenceScore(state, s);
  const reasons = [];
  let difficulty = 40, blocked = null;
  const last = (k) => inf.requests.filter((r) => r.kind === k).at(-1);
  const since = (r) => (r ? daysBetween(r.on, s.gameDate) : Infinity);
  const pending = (k) => inf.effects.some((e) => e.kind === k && ACTIVE.includes(e.status));
  const mine = aux?.clubs?.[s.club.ref]?.prestige ?? 0.5;
  const squadSize = aux?.squadSize ?? 0;
  const out = { kind };

  if (kind === 'formation') {
    const opt = (aux?.formations || []).find((f) => f.key === params.key);
    if (!opt) return { ...out, blocked: 'unknown', chance: 0, reasons };
    Object.assign(out, { name: opt.name, gameName: opt.gameName });
    if (inf.formation && opt.gameName === inf.formation.gameName) blocked = 'same';
    if (since(last('formation')) < 28) blocked ||= 'cooldown';
    difficulty = 40;
    const form = pointsPerMatch(s, 5);
    if (form?.ppm >= 2) { difficulty += 15; reasons.push('winning'); } else if (form && form.ppm <= 0.8) { difficulty -= 15; reasons.push('struggling'); }
    if (inf.effects.some((e) => e.kind === 'formation' && ['applied', 'confirmed'].includes(e.status) && daysBetween(e.appliedOn || e.on, s.gameDate) < 45)) { difficulty += 20; reasons.push('recent_change'); }
  } else if (kind === 'signing') {
    const p = playerById(aux, params.playerId);
    if (!p) return { ...out, blocked: 'unknown', chance: 0, reasons };
    const [id, name, fromRef, share, role] = p;
    const club = aux.clubs?.[fromRef];
    const pos = Number.isInteger(params.pos) ? params.pos : role;
    Object.assign(out, { playerId: id, name, fromRef, from: club?.name || aux.clubNames?.[fromRef] || null, share, role: role ?? null, pos: pos ?? null });
    if (id === s.player.id) blocked = 'is_me';
    else if (fromRef === s.club.ref) blocked = 'already_here';
    difficulty = 35;
    if (club) {
      const gap = club.prestige - mine;
      if (gap > 0.18) blocked ||= 'out_of_reach';
      else if (gap > 0.06) { difficulty += Math.round(gap * 120); reasons.push('bigger_club'); } else if (gap < -0.06) { difficulty -= 8; reasons.push('smaller_club'); }
    } else reasons.push('abroad');
    if (playingTimeKnown(aux, fromRef)) {
      const imp = importance(share / 100);
      reasons.push(imp);
      difficulty += imp === 'key_player' ? 25 : imp === 'regular' ? 10 : -5;
    }
    // Le poste à renforcer : un poste où le club a peu de monde se recrute plus facilement.
    const depth = Number.isInteger(pos) && aux.depth ? aux.depth[pos] ?? 0 : null; // données d'avant les postes : rien
    if (depth !== null && depth <= 1) { difficulty -= 10; reasons.push('thin_position'); } else if (depth !== null && depth >= 4) { difficulty += 10; reasons.push('deep_position'); }
    if (squadSize >= 40) blocked ||= 'squad_full';
    else if (squadSize >= 33) { difficulty += 10; reasons.push('squad_big'); }
    if (pending('signing')) blocked ||= 'pending';
    const refused = inf.requests.filter((r) => r.kind === 'signing' && r.params.playerId === id && !r.accepted).at(-1);
    if (since(refused) < 60) blocked ||= 'cooldown';
  } else if (kind === 'sale') {
    const p = (aux?.squad || []).find((x) => x.id === params.playerId);
    const dest = (aux?.saleTargets || []).find((c) => c.ref === params.toRef);
    if (!p || !dest) return { ...out, blocked: 'unknown', chance: 0, reasons };
    Object.assign(out, { playerId: p.id, name: p.name, toRef: dest.ref, to: dest.name, share: p.share });
    difficulty = 30;
    if (playingTimeKnown(aux, s.club.ref)) {
      const imp = importance(p.share / 100);
      reasons.push(imp);
      difficulty += imp === 'key_player' ? 35 : imp === 'regular' ? 15 : -10;
    }
    if (dest.full) blocked = 'dest_full';
    if (pending('sale')) blocked ||= 'pending';
    const refused = inf.requests.filter((r) => r.kind === 'sale' && r.params.playerId === p.id && !r.accepted).at(-1);
    if (since(refused) < 60) blocked ||= 'cooldown';
  } else if (kind === 'keep') {
    const p = (aux?.squad || []).find((x) => x.id === params.playerId);
    if (!p) return { ...out, blocked: 'unknown', chance: 0, reasons };
    Object.assign(out, { playerId: p.id, name: p.name, share: p.share });
    difficulty = 25;
    if (playingTimeKnown(aux, s.club.ref)) {
      const imp = importance(p.share / 100);
      reasons.push(imp);
      difficulty += imp === 'key_player' ? -10 : imp === 'regular' ? 0 : 15;
    }
    if (inf.keeps.some((k) => k.playerId === p.id)) blocked = 'already_kept';
    else if (inf.keeps.length >= 3) blocked = 'too_many_keeps';
  } else if (kind === 'future') {
    if (!['extend', 'leave'].includes(params.wish)) return { ...out, blocked: 'unknown', chance: 0, reasons };
    out.wish = params.wish;
    if (since(last('future')) < 45) blocked = 'cooldown';
    const left = monthsBetween(s.gameDate, s.player.contractUntil);
    const form = formIndex(state, s);
    if (params.wish === 'extend') {
      difficulty = 50 - Math.round((form - 0.5) * 40);
      reasons.push(form >= 0.55 ? 'in_form' : form <= 0.4 ? 'out_of_form' : 'average_form');
      if (left !== null && left > 36) { difficulty += 25; reasons.push('long_contract'); } else if (left !== null && left <= 12) { difficulty -= 10; reasons.push('contract_ending'); }
    } else {
      const recent = clubMatchesSinceArrival(s).slice(-10);
      const starts = recent.length ? recent.filter((f) => f.me?.starter).length / recent.length : 0;
      difficulty = 35 + Math.round(starts * 35);
      reasons.push(starts >= 0.6 ? 'key_player' : starts >= 0.3 ? 'regular' : 'fringe');
    }
  } else {
    return { ...out, blocked: 'unknown', chance: 0, reasons };
  }
  const chance = blocked ? 0 : chanceOf(score, difficulty);
  if (!blocked && score < difficulty - 15) reasons.push('low_influence');
  return { ...out, chance, difficulty, reasons, blocked };
}

// Qui répond : l'entraîneur pour le plan de jeu, le directeur sportif pour le reste.
const responder = (kind, s) => (kind === 'formation' ? { from: s.club.coach || 'Coach', role: 'coach' } : { from: directorOf(s.club.ref), role: 'club' });

// Enregistre une demande et sa décision ; renvoie { request, effect } (effect = ce qu'il faudra écrire dans le jeu).
function decide(state, s, kind, params, a, aux) {
  const inf = ensureInfluence(state);
  if (a.blocked) throw new Error('Cette demande n’est pas possible pour l’instant.');
  const id = newId();
  const accepted = (hash(`${id}|${state.careerId}`) % 100) < a.chance;
  const who = responder(kind, s);
  const win = currentWindow(s), next = nextWindow(s);
  const request = { id, kind, on: s.gameDate, params, chance: a.chance, accepted, reasons: a.reasons, from: who.from, role: who.role, summary: { name: a.name, gameName: a.gameName, from: a.from, to: a.to, wish: a.wish, ...(kind === 'signing' ? { position: a.role, wanted: a.pos } : {}) } };
  let effect = null;
  if (accepted && kind === 'formation') {
    const opt = aux.formations.find((f) => f.key === params.key);
    effect = { kind, clubRef: s.club.ref, name: opt.name, gameName: opt.gameName, roles: opt.roles, phases: opt.phases, template: opt.template, previous: inf.formation || null, status: 'ready' };
  } else if (accepted && (kind === 'signing' || kind === 'sale')) {
    effect = kind === 'signing'
      ? { kind, playerId: a.playerId, name: a.name, fromRef: a.fromRef, from: a.from, toRef: s.club.ref, to: s.club.name }
      : { kind, playerId: a.playerId, name: a.name, fromRef: s.club.ref, from: s.club.name, toRef: a.toRef, to: a.to };
    Object.assign(effect, win ? { status: 'ready', windowClose: win.close } : { status: 'waiting', opens: next?.open || null, windowClose: next?.close || null });
  } else if (accepted && kind === 'keep') {
    const until = (win || next)?.close || addDays(s.gameDate, 180);
    inf.keeps.push({ playerId: a.playerId, name: a.name, until, since: s.gameDate });
  }
  if (effect) {
    effect.id = newId();
    effect.on = s.gameDate;
    effect.requestId = id;
    inf.effects.push(effect);
    request.effectId = effect.id;
  }
  // Une demande refusée use un peu le crédit du joueur ; la suite (résultats, recrue qui joue) le refait.
  if (!accepted) inf.track = clamp(inf.track - 2, -20, 20);
  inf.requests.push(request);
  inf.requests = inf.requests.slice(-60);
  inf.effects = inf.effects.slice(-40);
  return { request, effect, timing: effect ? (effect.status === 'waiting' ? { when: 'window', opens: effect.opens } : { when: 'now' }) : null };
}

// À chaque synchro : la jauge, la formation du club, et le sort des décisions (mercato ouvert, écrites, gardées par le
// jeu, payantes ou non). Renvoie les nouvelles publiques pour l'édition (CHANGES.influence_news).
function syncInfluence(state, s, { formation, clubs, previousClubs }) {
  const inf = ensureInfluence(state);
  const news = [];
  // Il a changé de club : les décisions de l'ancien club tombent.
  if (inf.clubRef !== undefined && inf.clubRef !== s.club.ref) {
    for (const e of inf.effects) if (ACTIVE.includes(e.status)) e.status = 'cancelled';
    inf.keeps = [];
  }
  inf.clubRef = s.club.ref;
  inf.formation = formation || null;
  inf.scoreInfo = influenceScore(state, s);
  inf.computedOn = s.gameDate;
  const win = currentWindow(s);

  for (const e of inf.effects) {
    if (MERCATO.includes(e.kind)) {
      // Le joueur a changé de club entre-temps (vendu ailleurs, parti) : la décision tombe.
      if (ACTIVE.includes(e.status) && e.kind !== 'undo' && clubs && clubs[e.playerId] !== e.fromRef) e.status = 'cancelled';
      if (e.status === 'waiting' && win) { e.status = 'ready'; e.windowClose = win.close; }
      if (e.status === 'ready' && !win && e.windowClose && s.gameDate > e.windowClose) e.status = 'expired';
    }
    // Écrite par LifeLegend : le jeu l'a-t-il gardée à sa sauvegarde suivante ?
    if (e.status === 'applied' && s.gameDate > e.appliedOn) {
      const kept = e.kind === 'formation'
        ? Boolean(formation) && formation.gameName === e.gameName
        : clubs?.[e.playerId] === e.toRef;
      e.status = kept ? 'confirmed' : 'reverted';
      e.checkedOn = s.gameDate;
      if (kept && e.kind === 'formation') {
        e.baseline = pointsPerMatch(s, 5, e.appliedOn)?.ppm ?? null;
        news.push({ kind: 'formation', formation: e.name, game_name: e.gameName, previous: e.previous?.name || null, coach: s.club.coach });
      } else if (kept) {
        news.push({ kind: e.kind === 'undo' ? 'kept_teammate' : e.kind, player: e.name, from: e.from, to: e.to });
      }
    }
    // Plan de jeu changé à sa demande : au bout de 4 matchs de championnat, a-t-il eu raison ?
    if (e.kind === 'formation' && e.status === 'confirmed' && !e.judged && e.baseline !== null && e.baseline !== undefined) {
      const after = pointsPerMatch(s, 4, null, e.appliedOn);
      if (after && after.matches >= 4) {
        e.judged = after.ppm - e.baseline >= 0.3 ? 'paid_off' : after.ppm - e.baseline <= -0.3 ? 'backfired' : 'neutral';
        if (e.judged !== 'neutral') {
          inf.track = clamp(inf.track + (e.judged === 'paid_off' ? 6 : -6), -20, 20);
          news.push({ kind: `formation_${e.judged}`, formation: e.name, points_per_match_before: Math.round(e.baseline * 100) / 100, points_per_match_after: Math.round(after.ppm * 100) / 100 });
        }
      }
    }
  }
  // Coéquipier qu'il a demandé de retenir, vendu par le jeu pendant ce mercato : le club refuse la vente (à écrire).
  for (const k of inf.keeps) {
    const nowAt = clubs?.[k.playerId];
    if (previousClubs?.[k.playerId] === s.club.ref && nowAt !== undefined && nowAt !== s.club.ref && !inf.effects.some((e) => e.kind === 'undo' && e.playerId === k.playerId && e.on === s.gameDate)) {
      inf.effects.push({ id: newId(), kind: 'undo', on: s.gameDate, status: 'ready', playerId: k.playerId, name: k.name, fromRef: nowAt, toRef: s.club.ref, to: s.club.name, windowClose: win?.close || s.gameDate });
    }
  }
  inf.keeps = inf.keeps.filter((k) => k.until >= s.gameDate);
  inf.scoreInfo = influenceScore(state, s); // le bilan a pu bouger
  inf.news = [...inf.news, ...news].slice(-10);
  return news;
}

// Données de la page Influence, refaites à chaque synchro (influence.json de la carrière) : formations proposées,
// effectif du club avec le temps de jeu de chacun, standing des clubs, clubs où vendre, joueurs des clubs (recrues).
function buildAux(career, s, { nameOf, clubs, prestige, formations, positions }) {
  // Temps de jeu cette saison : part des minutes possibles de son club (matchs joués × 90), titularisations, poste.
  const games = new Map(), minutes = new Map(), starts = new Map(), posts = new Map();
  for (const m of career.matches) {
    if (!m.played) continue;
    for (const [team, lineup] of [[m.home, m.homeLineup], [m.away, m.awayLineup]]) {
      games.set(team.ref, (games.get(team.ref) || 0) + 1);
      for (const e of lineup) {
        const k = `${team.ref}|${e.playerId}`;
        minutes.set(k, (minutes.get(k) || 0) + e.minutes);
        if (!e.starter) continue;
        starts.set(k, (starts.get(k) || 0) + 1);
        const p = posts.get(k) || {};
        p[e.pos] = (p[e.pos] || 0) + 1;
        posts.set(k, p);
      }
    }
  }
  const share = (ref, id) => Math.round(100 * clamp((minutes.get(`${ref}|${id}`) || 0) / Math.max(1, (games.get(ref) || 0) * 90), 0, 1));
  const post = (ref, id) => { const p = posts.get(`${ref}|${id}`); return p ? Number(Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]) : null; };
  const mine = career.teams.get(s.club.ref);
  const roleOf = (id) => positions?.get(id) ?? null;
  const squad = (mine?.roster || []).filter((id) => id !== career.player.id).map((id) => ({ id, name: nameOf(id), share: share(s.club.ref, id), starts: starts.get(`${s.club.ref}|${id}`) || 0, pos: post(s.club.ref, id), role: roleOf(id) }))
    .filter((p) => p.name).sort((a, b) => b.share - a.share);
  const clubsOut = {};
  for (const [ref, c] of prestige) clubsOut[ref] = { name: c.team, league: c.league, prestige: Math.round(c.prestige * 1000) / 1000, games: games.get(ref) || 0 };
  const myPrestige = prestige.get(s.club.ref)?.prestige ?? 0.5;
  // Clubs où vendre un coéquipier : de standing proche du sien, avec une place dans l'effectif.
  const saleTargets = [...prestige.entries()].filter(([ref]) => ref !== s.club.ref)
    .map(([ref, c]) => ({ ref, name: c.team, league: c.league, gap: c.prestige - myPrestige, full: (career.teams.get(ref)?.roster.length || 0) >= 40 }))
    .filter((c) => Math.abs(c.gap) <= 0.1 && !c.full).sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap)).slice(0, 6)
    .map(({ gap, ...c }) => c);
  const players = [], clubNames = {};
  for (const [id, ref] of Object.entries(clubs)) {
    const name = nameOf(Number(id));
    if (!name || ref === s.club.ref) continue;
    players.push([Number(id), name, ref, share(ref, Number(id)), roleOf(Number(id))]);
    clubNames[ref] ||= career.teams.get(ref)?.name || null;
  }
  // Joueurs de son effectif par poste officiel (lui compris : il occupe aussi un poste).
  const depth = {};
  for (const id of mine?.roster || []) { const r = roleOf(id); if (r !== null) depth[r] = (depth[r] || 0) + 1; }
  return { computedOn: s.gameDate, clubRef: s.club.ref, squadSize: mine?.roster.length || 0, depth, formations: formations || [], squad, clubs: clubsOut, saleTargets, players, clubNames };
}

// Ce que savent l'entraîneur, le club et l'agent (mails privés seulement).
function influenceFacts(state) {
  const inf = state?.influence;
  if (!inf?.scoreInfo) return undefined;
  return {
    standing_in_dressing_room: inf.scoreInfo.score >= 70 ? 'strong' : inf.scoreInfo.score >= 45 ? 'growing' : 'limited',
    recent_requests: inf.requests.slice(-4).map((r) => ({ on: r.on, kind: r.kind, about: r.summary, accepted: r.accepted, to: r.from })),
  };
}

// La demande telle que l'IA la reçoit pour écrire la réponse (raisons en clair, jamais de chiffres d'influence).
const REASONS_EN = {
  winning: 'the team is winning with the current system', struggling: 'results have been poor lately', recent_change: 'he changed the system very recently',
  bigger_club: 'the player\'s club is bigger than ours', smaller_club: 'the player\'s club is smaller than ours', abroad: 'a club we know less well',
  key_player: 'a key player for his club', regular: 'a regular for his club', fringe: 'rarely plays for his club', squad_big: 'our squad is already large',
  in_form: 'the player is in good form', out_of_form: 'the player is out of form', average_form: 'the player\'s form is average',
  thin_position: 'we are short of players in that position', deep_position: 'we already have plenty of players in that position',
  long_contract: 'his contract still runs for more than three years', contract_ending: 'his contract ends soon', low_influence: 'the player does not carry enough weight in the club yet',
};
const ROLE_EN = ['goalkeeper', 'centre-back', 'left-back', 'right-back', 'defensive midfielder', 'central midfielder', 'left midfielder', 'right midfielder', 'attacking midfielder', 'left winger', 'right winger', 'second striker', 'centre-forward'];
function requestFacts(state, s, request, effect, message) {
  const inf = ensureInfluence(state), sm = request.summary;
  const type = { formation: 'change of formation', signing: 'recommends a signing', sale: 'asks the club to sell a teammate', keep: 'asks the club to keep a teammate (turn down offers for him)', future: 'his own future at the club' }[request.kind];
  const details = request.kind === 'formation' ? { new_formation: sm.name, shown_in_game_as: sm.gameName, current_formation: inf.formation?.name || null }
    : request.kind === 'signing' ? { player: sm.name || null, his_club: sm.from || null, his_position: ROLE_EN[sm.position] || null, position_he_wants_strengthened: ROLE_EN[sm.wanted] || null }
      : request.kind === 'sale' ? { teammate: sm.name || null, interested_club: sm.to || null }
        : request.kind === 'keep' ? { teammate: sm.name || null }
          : { wish: sm.wish === 'extend' ? 'a contract extension' : 'permission to leave' };
  const keep = inf.keeps.find((k) => k.playerId === request.params.playerId);
  const timing = !request.accepted ? null
    : request.kind === 'formation' ? 'from the next match'
      : effect?.status === 'waiting' ? `the transfer window is closed: it will be done when it opens on ${effect.opens}`
        : effect ? 'now, during the transfer window'
          : request.kind === 'keep' && keep ? `the club will turn down offers for him until ${keep.until}` : null;
  return { sender: { name: request.from, role: request.role === 'coach' ? 'head coach' : 'sporting director (fictional)' }, type, details, accepted: request.accepted, reasons: request.reasons.map((r) => REASONS_EN[r]).filter(Boolean), timing, player_message: message || null };
}

// Réponse toute prête, quand l'IA n'est pas disponible (pas de clé, quota, réseau).
function fallbackReply(lang, state, s, request, effect) {
  const sm = request.summary, ok = request.accepted;
  const p = { me: state.profile?.displayName || s.player.name, from: request.from, name: sm.name || '', current: state.influence?.formation?.name || '', player: sm.name || '', club: sm.from || sm.to || '', date: effect?.opens ? new Date(`${effect.opens}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '' };
  const waiting = effect?.status === 'waiting';
  const [subject, body] = {
    formation: ok ? ['Plan de jeu : on passe au {name}', '{me},\n\nJ’ai réfléchi à ce que tu m’as dit. On passe au {name} dès le prochain match. À toi de montrer que tu avais raison.\n\n{from}']
      : ['Plan de jeu', '{me},\n\nMerci pour ton avis, mais je garde notre {current} pour l’instant. Les choix tactiques me reviennent. Continue de travailler, on en reparlera.\n\n{from}'],
    signing: ok ? ['Mercato : {player}', waiting ? '{me},\n\nBonne piste. Le mercato est fermé : on reviendra à la charge pour {player} ({club}) dès son ouverture, le {date}.\n\n{from}' : '{me},\n\nBonne piste. On lance les démarches pour {player} ({club}).\n\n{from}']
      : ['Mercato : {player}', '{me},\n\nJ’ai étudié la piste {player}, mais ce n’est pas possible pour nous en ce moment. Merci d’avoir pensé au club.\n\n{from}'],
    sale: ok ? ['Effectif : {player}', waiting ? '{me},\n\nJ’entends ce que tu dis sur {player}. On en reparle à l’ouverture du mercato, le {date} : {club} est intéressé.\n\n{from}' : '{me},\n\nJ’entends ce que tu dis sur {player}. On va lui trouver une porte de sortie : {club} est intéressé.\n\n{from}']
      : ['Effectif : {player}', '{me},\n\n{player} reste chez nous : le coach compte sur lui et on ne vend pas sur un coup de tête.\n\n{from}'],
    keep: ok ? ['Effectif : {player}', '{me},\n\nMessage reçu : {player} n’est pas à vendre. Si une offre arrive, on la refusera.\n\n{from}']
      : ['Effectif : {player}', '{me},\n\nJe ne peux rien te promettre pour {player} : si une belle offre arrive, on l’étudiera.\n\n{from}'],
    future: sm.wish === 'extend'
      ? (ok ? ['Ton avenir au club', '{me},\n\nLe club compte sur toi. On en parlera avec ton agent au bon moment.\n\n{from}'] : ['Ton avenir au club', '{me},\n\nPour l’instant, on ne parle pas de prolongation. Continue sur ta lancée et on fera le point plus tard.\n\n{from}'])
      : (ok ? ['Ton avenir au club', '{me},\n\nSi un club fait une offre qui te convient, on ne te retiendra pas. Vois ça avec ton agent.\n\n{from}'] : ['Ton avenir au club', '{me},\n\nTu es important pour nous : on ne veut pas te laisser partir maintenant.\n\n{from}']),
  }[request.kind];
  return { subject: tr(lang, subject, p), body: tr(lang, body, p) };
}

module.exports = { ensureInfluence, influenceScore, assess, decide, syncInfluence, influenceFacts, buildAux, requestFacts, fallbackReply, responder, directorOf, currentWindow, nextWindow, chanceOf, pointsPerMatch, playingTimeKnown };
