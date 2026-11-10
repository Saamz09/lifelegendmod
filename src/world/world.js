'use strict';
// Orchestration : synchro de la sauvegarde, édition générée par l'IA, posts et mails.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readCareer, competitionMatches } = require('../save/blReader');
const { detectGameFolders, loadGameDb, matchRate } = require('../save/gameDb');
const { buildSnapshot, diffSnapshots, hasNews, sameMatch } = require('./snapshot');
const { complete, transcribe, parseJson } = require('../ai/providers');
const prompts = require('../ai/prompts');
const { factCheck } = require('../ai/factcheck');
const { buildScores } = require('./scores');
const { worldFootball, worldStories, worldDebate, worldBrief, potmSummary, worldTotw } = require('./worldFootball');
const { processMedia, savedReplaysFacts } = require('./media');
const { archiveSeason, careerFacts } = require('./seasons');
const { clubMap, detectTransfers, windowOpen } = require('./mercato');
const { bindPromise, resolvePromises, openPromises } = require('./promises');
const { mentionDirectory, findMentions, playerReaction, clubHandle, slugHandle } = require('./mentions');
const { ensureAgent, extensionByStance, computeMarket, applyStance, reportDue, agentFacts, clubPrestige } = require('./agent');
const { ensureInfluence, influenceScore, assess, decide, syncInfluence, influenceFacts, buildAux, requestFacts, fallbackReply, currentWindow, nextWindow, directorOf, playingTimeKnown } = require('./influence');
const { applyFormation, applyTransfer } = require('../save/influenceWrite');
const { applyUnavailable } = require('../save/conductWrite');
const { recordConduct, conductAtSync, conductFacts, sanctionActive, endedRecently } = require('./conduct');
const { objectivesAtSync, objectivesFacts } = require('./objectives');
const { describe: describeFormation, loadTemplates, formationOptions } = require('../save/formations');
const { clubFollowers } = require('./clubFollowers');
const { buildSeasonReview, noteSeasonStart } = require('./seasonReview');
const { pantheonEvents, addChapter, chapterTitles, setBio } = require('./pantheon');
const { awardsNews } = require('./awards');
const { recordNotoriety } = require('./notoriety');
const { pickRumor, rumorSlot, settleRumors, noteRumorPost, INSIDERS } = require('./rumors');
const { coachAdvice } = require('./coachAdvice');
const { sponsorTick, sponsorFacts } = require('./sponsors');
const boots = require('../save/boots');
const { dmThread, addDmMessage, dmInbound, dmContext } = require('./dms');
const { activeHuddle, nationalHuddle, syncHuddle, addMessage: addHuddleMessage, addGroupMessages, huddleContext, huddleToday, REPLY_MESSAGES, NATIONAL_MESSAGES } = require('./huddle');
const { prettyName } = require('../save/blReader');
const { ABILITIES, isGoalkeeper } = require('../save/playerProfile');
const { barLabel, skillForAi } = require('../save/training');
const { redirectOfferInSave } = require('../save/offerRedirect');
const { officialAuthor, clubAccountsRev, realClubHandle } = require('./clubAccounts');
const { ensureEmblems, ensureCompetitionLogos } = require('../save/emblems');
const { fanMood } = require('./fanMood');
const { toneContext } = require('./toneContext');
const { postLikes, repostsFor, replyLikes } = require('./engagement');
const { clubPosts } = require('./clubPosts');
const { tribunePlan, newVoices, renameInvented, playingTime, styleOf, isStyleText } = require('./tribunePlan');

// Ton du monde (pression médiatique, drame) : calculé sur la situation, transmis aux consignes de l'IA.
const toneOf = (state) => state.tone || (state.snapshot ? toneContext({ snapshot: state.snapshot, state }) : { market: 50, drama: 25, why: { market: [], drama: [] } });
const withTone = (settings, state) => ({ ...settings, tone: toneOf(state) });
const { postTexts } = require('./postTexts');
const { TOUR_KIND, competitionStories, tourAngle, longViewAngle, debateAngle, coverageOf, coverageProblems } = require('./competitionDesk');
const { tidyArticle, fixArticle, ruleFlags, flagsProblem, paperProblems } = require('./paperRules');
const { isNationalTeam, realTeam, matchesOf, compAccount, competitionPosts, previewPosts, competitionAccountsFacts, isCompetitionHandle, fakeLogos, competitionAccountsRev } = require('./competitions');

const newId = () => crypto.randomBytes(6).toString('hex');
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function careerIdOf(snapshot) {
  return `${snapshot.player.id}-${slug(snapshot.player.name) || 'joueur'}`;
}

function newCareerState(snapshot) {
  const base = slug(snapshot.player.name).slice(0, 12) || 'joueur';
  return {
    version: 1,
    careerId: careerIdOf(snapshot),
    profile: { handle: `${base}_off`, displayName: snapshot.player.name, followers: 4200 },
    writers: null,
    localPaper: null,
    myLife: [],
    snapshot: null,
    editions: [],
    feed: [],
    mail: [],
    storylines: [],
    accounts: {},
    onRecord: [],
  };
}

// Retire les champs techniques d'un match ; la note brute n'est jamais envoyée (seulement le mot).
const strip = ({ homeRef, awayRef, id, competitionId, ...rest }) => {
  if (rest.me) {
    const { ratingRaw, ...me } = rest.me;
    rest.me = me;
  }
  return rest;
};

// Faits envoyés à l'IA : compacts, issus de la sauvegarde (sauf le poste, déclaré par le joueur).
// Fiche du joueur lue dans la sauvegarde (notes du jeu sur 99). Le salaire n'y figure pas : il reste privé.
function profileFacts(p, suspended = false) {
  if (!p) return null;
  const outfield = !isGoalkeeper(p);
  const abilities = Object.fromEntries(ABILITIES.filter(([k]) => outfield !== k.startsWith('gk')).map(([k, label]) => [label, p.abilities[k]]));
  return {
    age: p.age,
    height_cm: p.height,
    weight_kg: p.weight,
    strong_foot: p.strongFoot,
    registered_position: p.position,
    playing_style: p.playingStyle,
    team_role: p.teamRole,
    form_arrow: p.formArrow,
    injured: p.unavailableDays > 0 && !suspended ? { unavailable_days: p.unavailableDays } : null,
    market_value_eur: p.marketValue,
    abilities,
  };
}

// Écran Entraînement du jeu : points par domaine (sur 6), geste et poste en cours d'apprentissage.
const UNKNOWN_SKILL = 'a new skill (its name is not known: do not name it)';
const UNKNOWN_POSITION = 'a new position (its name is not known: do not name it)';
function trainingFacts(t) {
  if (!t) return null;
  const focus = Object.fromEntries(Object.entries(t.focus).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => [barLabel(k), v]));
  return {
    focus_out_of_6: focus,
    learning_skill: t.skill && t.skill.points > 0 ? skillForAi(t.skill.code) || UNKNOWN_SKILL : null,
    learning_position: t.position && t.position.points > 0 ? t.position.name || UNKNOWN_POSITION : null,
  };
}

// Mercato d'après le calendrier du jeu : la période en cours (ou la prochaine), avec ses dates.
function windowFacts(s) {
  const wins = s.windows || [];
  const current = wins.find((w) => s.gameDate >= w.open && s.gameDate <= w.close);
  const next = wins.find((w) => w.open > s.gameDate);
  const label = (w) => w && { season: w.kind, opens: w.open, last_day: w.close };
  return { current: label(current) || null, next: label(next) || null };
}

// Sélection nationale (saison en cours seulement : le total de sélections de la carrière n'est pas dans la sauvegarde).
function nationalTeamFacts(n) {
  if (!n) return null;
  const lite = (f) => { const { clubLineup, ...rest } = strip(f); return rest; };
  return {
    team: n.name,
    account: `@${clubHandle({ ref: n.ref, name: n.name })}`, // compte officiel de la sélection (règle 25)
    coach: n.coach,
    in_current_squad: n.inSquad,
    squad_mates: n.squad.slice(0, 22),
    this_season: n.stats,
    last_match: n.last && strip(n.last),
    next_match: n.next && strip(n.next),
    recent_results: n.fixtures.filter((f) => f.played).slice(-4).map(lite),
  };
}

// La Transversale : les compétitions du club en détail, les autres grandes compétitions en bref (résultats des dix
// derniers jours, leaders, prochain tour). Son championnat est déjà dans league_table / league_last_round / league_next_round.
function competitionsFacts(s) {
  const line = (m) => (m.played ? `${m.home} ${m.score[0]}-${m.score[1]} ${m.away}` : `${m.home} – ${m.away}`);
  const since = new Date(`${s.gameDate}T12:00:00Z`); since.setUTCDate(since.getUTCDate() - 10);
  const recent = (m) => m.date > since.toISOString().slice(0, 10);
  // Seulement les compétitions du club : La Transversale ne couvre qu'elles (règle 6 des prompts).
  return s.competitions.filter((c) => c.mine).map((c) => {
    if (c.main) return { competition: c.name, his_club_plays_it: true, kind: 'his league', see: 'league_table, league_last_round, league_next_round' };
    const results = (c.mine ? c.results : c.results.filter(recent)).slice(0, c.mine ? 12 : 6);
    return {
      competition: c.name, his_club_plays_it: c.mine, kind: c.kind,
      last_results: results.length ? { stage: c.stage, date: results.at(-1).date, matches: results.map(line), more: Math.max(0, c.results.length - results.length) } : null,
      next: c.next.length ? { stage: c.nextStage, date: c.next[0].date, matches: c.next.slice(0, c.mine ? 10 : 4).map(line) } : null,
      leaders: c.table ? c.table.slice(0, 4).map((r) => `${r.pos}. ${r.team} ${r.pts} pts (${r.p} matchs)`) : null,
    };
  });
}

// Faits d'une réponse courte (messages privés, Vestiaire) : ni ce qui est privé (agent, influence), ni le détail des matchs
// des autres clubs et les comptes officiels, qui pèsent lourd pour un message de deux phrases. Le dernier et le prochain
// match de son club, le classement et l'effectif restent.
function chatFacts(state) {
  const { agent, influence, league_last_round, league_next_round, club_recent_results, club_accounts, competition_accounts, ...facts } = factsFor(state.snapshot, state.profile, state);
  return facts;
}

// Heure du coup d'envoi en clair (« aujourd'hui à 14h (l'après-midi) ») : l'IA écrivait « ce soir » pour un match à 14h.
const kickoffLabel = (m, today) => (Number.isInteger(m.hour) && m.hour >= 0 && m.hour <= 23 ? `${m.date === today ? 'aujourd’hui' : m.date} à ${m.hour}h (${m.hour < 12 ? 'le matin' : m.hour < 18 ? 'l’après-midi' : 'le soir'})` : undefined);
function factsFor(s, profile = {}, state = null) {
  return {
    game_date: s.gameDate,
    season: s.season,
    player: { name: s.player.name, ...(state?.playerKind === 'created' ? { created_player: true } : state?.playerKind === 'real' ? { real_player: true } : {}), national_team: s.player.nationality, position: profile.position || null, contract_until: s.player.contractUntil || null, game_profile: profileFacts(s.player.profile, Boolean(state) && sanctionActive(state, s.gameDate)), training: trainingFacts(s.player.training), playing_time: playingTime(s) },
    club: { name: s.club.name, short_name: s.club.short, stadium: s.club.stadium },
    league: s.league.name,
    coaches: s.coaches,
    season_stats: s.stats,
    scorer_race_in_league: s.scorerRace,
    saved_replays: state ? savedReplaysFacts(state) : [],
    career: state ? careerFacts(state) : null,
    biography: state?.bio?.text || undefined,
    mercato: state ? { transfer_window_open: windowOpen(s.gameDate), window: windowFacts(s), recent_transfers: (state.transfers || []).slice(-12) } : null,
    agent: state ? agentFacts(state.agent) : null,
    discipline: state ? conductFacts(state, s.gameDate) : undefined,
    objectives: state ? objectivesFacts(state, s) : undefined,
    equipment_deal: state ? sponsorFacts(state) : undefined,
    club_squad: (s.squad || []).filter((p) => p.name && !p.me).slice(0, 16).map(({ me, ...p }) => p),
    league_table: s.table.map((r) => ({ pos: r.pos, team: r.team, p: r.p, w: r.w, d: r.d, l: r.l, gd: r.gf - r.ga, pts: r.pts, form: r.form.join('') })),
    last_match: s.last && strip(s.last),
    next_match: s.next && { ...strip(s.next), kickoff: kickoffLabel(s.next, s.gameDate) },
    club_recent_results: s.fixtures.filter((f) => f.played).slice(-5).map((f) => { const { clubLineup, ...rest } = strip(f); return rest; }),
    league_last_round: s.roundResults.map(strip),
    league_next_round: s.nextRound.map(strip),
    other_leagues: s.competitions ? undefined : s.otherLeagues,
    competitions: s.competitions ? competitionsFacts(s) : undefined,
    national_team: nationalTeamFacts(s.nationalTeam),
    club_accounts: clubAccountsFacts(s),
    competition_accounts: state?.competitionAccounts || [],
    fan_mood: state?.fanMood || { level: 0, target: null, reasons: [] },
    football_elsewhere: state?.footballElsewhere || undefined,
  };
}

// Comptes officiels des clubs dont on parle : le sien, ceux du championnat, adversaires, clubs intéressés.
function clubAccountsFacts(s) {
  const seen = new Map();
  const add = (club) => { if (club?.name && !seen.has(club.name)) seen.set(club.name, { club: club.name, handle: `@${clubHandle(club)}` }); };
  add(s.club);
  for (const r of s.table || []) add({ ref: r.ref, name: r.team });
  for (const m of [s.next, s.last]) if (m) { add({ ref: m.homeRef, name: m.home }); add({ ref: m.awayRef, name: m.away }); }
  for (const o of [...(s.player.offers || []), ...(s.player.interests || [])]) add({ name: o.club });
  return [...seen.values()].slice(0, 40);
}

// Comptes de clubs : les posts déjà publiés sous un pseudo fabriqué passent au vrai compte du club.
function migrateClubAccounts(state) {
  if (!state || state.clubAccountsRev === clubAccountsRev) return false;
  const renamed = new Map();
  for (const p of state.feed) {
    for (const x of [p, ...(p.replies || [])]) {
      if (x.author.isMe) continue;
      const a = officialAuthor(x.author);
      if (a.handle !== x.author.handle) renamed.set(x.author.handle.toLowerCase(), a.handle);
      x.author = a;
    }
  }
  for (const p of state.feed) for (const r of p.replies || []) if (r.replyTo && renamed.has(r.replyTo.toLowerCase())) r.replyTo = renamed.get(r.replyTo.toLowerCase());
  for (const [old, handle] of renamed) {
    const k = Object.keys(state.accounts).find((h) => h.toLowerCase() === old);
    if (k) { state.accounts[handle] = { ...state.accounts[k], type: 'club' }; delete state.accounts[k]; }
  }
  state.clubAccountsRev = clubAccountsRev;
  return true;
}

// Comptes de compétitions : les posts déjà publiés sous un pseudo fabriqué (« A_officiel ») passent au vrai compte,
// retrouvé d'après le nom de la compétition qui signe le post.
function migrateCompetitionAccounts(state) {
  if (!state || state.competitionAccountsRev === competitionAccountsRev) return false;
  const renamed = new Map(); // ancien pseudo (minuscules) -> { handle, name }
  for (const p of state.feed) {
    for (const x of [p, ...(p.replies || [])]) {
      if (x.author.type !== 'competition') continue;
      const a = compAccount(null, x.author.name);
      if (!a?.real || a.handle === x.author.handle) continue;
      renamed.set(x.author.handle.toLowerCase(), { handle: a.handle, name: a.name });
      x.author = { ...x.author, handle: a.handle, name: a.name };
    }
  }
  if (renamed.size) {
    const mention = new RegExp(`@(${[...renamed.keys()].join('|')})\\b`, 'gi');
    for (const p of state.feed) {
      for (const x of [p, ...(p.replies || [])]) {
        if (typeof x.text === 'string') x.text = x.text.replace(mention, (m, h) => `@${renamed.get(h.toLowerCase()).handle}`);
        if (x.replyTo && renamed.has(x.replyTo.toLowerCase())) x.replyTo = renamed.get(x.replyTo.toLowerCase()).handle;
      }
    }
    for (const list of [state.accounts, state.follows]) {
      for (const k of Object.keys(list || {})) {
        const to = renamed.get(k.toLowerCase());
        if (!to) continue;
        if (!list[to.handle]) list[to.handle] = list === state.accounts ? { ...list[k], name: to.name } : list[k];
        delete list[k];
      }
    }
    // Fiches des comptes (refaites à la synchro) : la compétition change de pseudo, les clubs qui la suivent aussi.
    const pages = state.clubPages || {};
    for (const [k, page] of Object.entries(pages)) {
      const to = page.kind === 'competition' && renamed.get(k);
      if (to) { delete pages[k]; pages[to.handle.toLowerCase()] ||= { ...page, handle: to.handle, name: to.name }; }
      else if (Array.isArray(page.follows)) page.follows = [...new Set(page.follows.map((h) => renamed.get(h)?.handle.toLowerCase() || h))];
    }
  }
  state.competitionAccountsRev = competitionAccountsRev;
  return true;
}

// Comptes publiés sous plusieurs noms (« Loïc SRFC », « Thomas », « Lucas » pour @RoazhonBoy35) : chacun reprend son
// nom et son type les plus fréquents, partout dans le fil et dans les comptes connus.
// Les marques de ce monde (Scoreline, CoteFoot) passent d'abord sous leur compte unique.
const IDENTITY_REV = 5; // 3 : plus de nom de vraie marque (« OptaCalcio » → son pseudo) ; 4 : @StatFoot_FR → @Scoreline_FR ; 5 : bios = consigne de style effacées

// Pages renommées le 20/10/2026 (Tribune → Kop, BallonMail → MailBox, StatFoot → Scoreline), puis le 10/11/2026 (MailBox →
// Mails, Huddle → Vestiaire), dans ce qui est déjà écrit :
// posts, articles, mails, bios, fils de l'actualité et étiquettes de la vérification des faits. « Les tribunes » du stade
// (minuscule) ne bougent pas ; « Tribune » ne change que précédé de sur/de/dans/on, ou en tête d'une étiquette.
const PAGE_NAMES_REV = 2;
const renamePages = (t) => t.replace(/@StatFoot_FR\b/gi, '@Scoreline_FR').replace(/\bStatFoot\b/g, 'Scoreline').replace(/\b(BallonMail|MailBox)\b/g, 'Mails').replace(/@mailbox\.foot\b/gi, '@mails.foot')
  .replace(/\bdans Huddle\b/g, 'dans le Vestiaire').replace(/\bHuddle\b/g, 'Vestiaire')
  .replace(/\b(sur|de|dans|on) Tribune\b/g, '$1 Kop');
function migratePageNames(state) {
  if (!state || state.pageNamesRev === PAGE_NAMES_REV) return false;
  const walk = (o) => { for (const [k, v] of Object.entries(o || {})) { if (typeof v === 'string') o[k] = renamePages(v); else if (v && typeof v === 'object') walk(v); } };
  for (const p of state.feed || []) for (const x of [p, ...(p.replies || [])]) if (typeof x.text === 'string') x.text = renamePages(x.text);
  for (const e of state.editions || []) {
    walk(e.national); walk(e.local);
    for (const c of e.factcheck?.corrections || []) if (typeof c.where === 'string') c.where = renamePages(c.where.replace(/^Tribune\b/, 'Kop'));
  }
  walk(state.mail); walk(state.storylines);
  for (const a of Object.values(state.accounts || {})) if (typeof a.bio === 'string') a.bio = renamePages(a.bio);
  state.pageNamesRev = PAGE_NAMES_REV;
  return true;
}
function migrateAccountIdentities(state, backup = null) {
  if (!state || state.identityRev === IDENTITY_REV) return false;
  if (state.feed.length) backup?.(); // copie de state.json avant de toucher aux posts déjà publiés
  const brands = new Map(); // ancien pseudo de marque (minuscules) -> compte unique
  for (const p of state.feed) {
    for (const x of [p, ...(p.replies || [])]) {
      if (x.author.isMe) continue;
      const b = brandAuthor(x.author);
      if (b.handle !== x.author.handle) { brands.set(x.author.handle.toLowerCase(), b.handle); x.author = b; }
    }
  }
  for (const p of state.feed) for (const r of p.replies || []) if (r.replyTo && brands.has(r.replyTo.toLowerCase())) r.replyTo = brands.get(r.replyTo.toLowerCase());
  for (const [old, handle] of brands) {
    const k = Object.keys(state.accounts || {}).find((h) => h.toLowerCase() === old);
    if (k) { state.accounts[handle] ||= state.accounts[k]; delete state.accounts[k]; }
  }
  const seen = new Map(); // pseudo (minuscules) -> { names, types }
  const each = (fn) => { for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if (!x.author.isMe && !OFFICIAL_IDENTITY.has(x.author.type)) fn(x.author); };
  each((a) => {
    const k = a.handle.toLowerCase();
    if (!seen.has(k)) seen.set(k, { names: new Map(), types: new Map(), handles: new Set([a.handle]) });
    const s = seen.get(k);
    s.names.set(a.name, (s.names.get(a.name) || 0) + 1);
    s.types.set(a.type, (s.types.get(a.type) || 0) + 1);
  });
  const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0]; // à égalité : le premier apparu
  const canon = new Map([...seen].map(([k, s]) => [k, noBrand({ handle: [...s.handles][0], name: top(s.names), type: top(s.types) })]).map(([k, c]) => [k, { name: c.name, type: c.type }]));
  each((a) => Object.assign(a, canon.get(a.handle.toLowerCase())));
  for (const [h, acc] of Object.entries(state.accounts || {})) {
    const c = canon.get(h.toLowerCase());
    if (c && !OFFICIAL_IDENTITY.has(acc.type)) state.accounts[h] = { ...acc, ...c };
  }
  // Bios qui recopiaient la consigne de style du plan : effacées (le profil reprend la bio par défaut du type de compte).
  for (const acc of Object.values(state.accounts || {})) if (acc.bio && isStyleText(acc.bio)) delete acc.bio;
  state.identityRev = IDENTITY_REV;
  return true;
}

// Écussons et logos lus dans les fichiers du jeu : avatars et pages profil des comptes de clubs et de compétitions.
// state.clubPages : pseudo du compte (minuscules) -> club { handle, name, emblem, stadium, league }
// (+ follows : ses compétitions = ses abonnements) ou compétition { kind: 'competition', handle, name, emblem, teams,
// clubs (pseudos des clubs engagés = ses abonnements) }. Toutes les compétitions réelles et tous leurs clubs ont leur fiche.
function refreshEmblems({ state, career, settings, store }) {
  if (!settings.savePath || !state.snapshot) return;
  const gameDir = gameDirFor(career, settings);
  const outDir = path.join(store.dir, 'careers', state.careerId, 'emblems');

  // Compétitions : logo, équipes engagées (sans les enregistrements isolés que la sauvegarde rattache parfois à une compétition).
  const comps = new Map();
  for (const [id, name] of career.competitions) {
    const a = compAccount(id, name);
    if (!a) continue;
    const h = a.handle.toLowerCase();
    const c = comps.get(h) || { handle: a.handle, name: a.name, real: a.real, logo: null, teams: new Set(), league: false };
    if (c.logo == null) c.logo = career.competitionLogos?.get(id) ?? null;
    const ms = matchesOf(career.matches, id);
    const before = c.teams.size;
    for (const m of ms) c.teams.add(m.home.ref).add(m.away.ref);
    // Championnat : chaque équipe affronte toutes les autres (sert à classer les abonnements des clubs).
    const n = c.teams.size - before;
    if (n >= 8 && ms.length >= 0.9 * (n * (n - 1)) / 2) c.league = true;
    comps.set(h, c);
  }
  // Toutes les compétitions qui ont au moins une équipe réelle (les compétitions inventées par PES n'ont pas de fiche).
  const compList = [...comps].filter(([, c]) => [...c.teams].some((ref) => { const t = career.teams.get(ref); return t?.name && realTeam(t); }));

  // Clubs : ceux dont on parle, et tous les clubs engagés dans ces compétitions (elles les suivent).
  const byHandle = new Map();
  // Pseudo du club, et pseudo fabriqué d'après le seul nom (clubs cités par leur nom, sans sigle).
  for (const t of career.teams.values()) {
    if (!t.name) continue;
    for (const h of [clubHandle(t), clubHandle({ name: t.name })]) if (!byHandle.has(h.toLowerCase())) byHandle.set(h.toLowerCase(), t);
  }
  const wanted = new Set(clubAccountsFacts(state.snapshot).map((x) => x.handle.replace(/^@/, '').toLowerCase()));
  if (career.nationalTeam?.name) wanted.add(clubHandle(career.nationalTeam).toLowerCase());
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if (x.author.type === 'club') wanted.add(x.author.handle.toLowerCase());
  const compClubs = new Map();
  const clubComps = new Map(); // pseudo du club -> ses compétitions (championnats d'abord)
  for (const [h, c] of [...compList].sort(([, a], [, b]) => Number(b.league) - Number(a.league) || a.name.localeCompare(b.name, 'fr'))) {
    const list = [...c.teams].map((ref) => career.teams.get(ref)).filter((t) => t?.name).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    compClubs.set(h, list.map((t) => clubHandle(t).toLowerCase()));
    for (const t of list) {
      const ch = clubHandle(t).toLowerCase();
      wanted.add(ch);
      if (!clubComps.has(ch)) clubComps.set(ch, []);
      clubComps.get(ch).push(h);
    }
  }
  const teams = [...wanted].map((h) => [h, byHandle.get(h)]).filter(([, t]) => t);
  // Le faux écusson de PES n'est gardé que pour les clubs inventés par le jeu (sans vrai compte).
  const files = ensureEmblems({
    gameDir,
    savePath: settings.savePath,
    clubs: teams.map(([, t]) => ({ id: t.id, emblemSlot: t.emblemSlot, fakeOk: !realClubHandle(t) })),
    outDir,
  });
  const leagueOf = new Set((state.snapshot.table || []).map((r) => r.ref));
  state.clubPages = Object.fromEntries(teams.map(([h, t]) => [h, {
    ...(isNationalTeam(t) ? { kind: 'national' } : {}),
    handle: clubHandle(t), name: t.name, emblem: files[t.id] || null, stadium: t.stadium || null,
    league: leagueOf.has(t.ref) ? state.snapshot.league?.name || null : null,
    follows: clubComps.get(h) || [],
  }]));
  // Abonnés des comptes de clubs : calés sur ceux relevés dans PES (Rennes), estimés pour les autres.
  try {
    const counts = clubFollowers({ career, leagueId: state.snapshot.league?.id, clubs: teams.filter(([, t]) => !isNationalTeam(t)).map(([h, t]) => ({ handle: h, ref: t.ref, name: t.name, follows: clubComps.get(h) || [] })) });
    for (const [h, n] of counts) if (state.clubPages[h]) state.clubPages[h].followers = n;
  } catch { /* faute de calcul, Kop garde ses ordres de grandeur */ }
  delete state.emblems;

  // Comptes de compétitions : logo du jeu (un faux logo de PES seulement si la compétition n'a pas de vrai compte).
  const logoFiles = ensureCompetitionLogos({
    gameDir,
    logos: compList.map(([, c]) => ({ logo: c.logo, fakeOk: !c.real })),
    fakeLogos,
    outDir,
  });
  for (const [h, c] of compList) {
    state.clubPages[h] = { kind: 'competition', handle: c.handle, name: c.name, emblem: logoFiles[c.logo] || null, teams: c.teams.size, clubs: compClubs.get(h) || [] };
  }
}

// État de la carrière pour l'interface, mis à jour au besoin.
// Le journal national s'appelle désormais « La Transversale » (ex « Le Coup Franc ») : textes déjà publiés, compte Kop
// du journal, objets des emails… Seul « Coup Franc » avec majuscules est le journal ; « un coup franc » reste le geste.
const PAPER_NAME = 'La Transversale';
const renamePaper = (t) => t
  .replace(/@?(?:Le)?CoupFranc(?:Off|_?officiel|FR)?/g, (m) => `${m.startsWith('@') ? '@' : ''}LaTransversale`)
  .replace(/\bdu Coup Franc\b/g, 'de La Transversale')
  .replace(/\bau Coup Franc\b/g, 'à La Transversale')
  .replace(/\b[Ll]e Coup Franc\b/g, PAPER_NAME)
  .replace(/\bCoup Franc\b/g, PAPER_NAME);
function migratePaperName(state, backup) {
  if (!state || state.paperName === PAPER_NAME) return false;
  if (!JSON.stringify(state).includes('CoupFranc') && !/Coup Franc/.test(JSON.stringify(state))) { state.paperName = PAPER_NAME; return true; }
  backup?.();
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') o[i] = renamePaper(v); else walk(v); }); return; }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (k === 'snapshot' || k === 'clubPages' || k === 'competitionAccounts') continue;
      const v = o[k];
      // Clés = pseudos (comptes, abonnements), parfois en minuscules.
      const nk = k.replace(/(?:le)?coupfranc(?:off|_?officiel|fr)?/i, k === k.toLowerCase() ? 'latransversale' : 'LaTransversale');
      if (nk !== k) { delete o[k]; o[nk] = v; }
      if (typeof v === 'string') o[nk] = renamePaper(v); else walk(v);
    }
  };
  walk(state);
  state.paperName = PAPER_NAME;
  return true;
}

// Journal local = journal des supporters du club, nommé d'après le surnom du club ou de ses supporters (sinon le nom du club).
// Les journaux nommés avant cette règle (ex « Le Courrier de Leipzig ») sont rebaptisés par l'IA à la prochaine édition.
const LOCAL_PAPER_RULE = 'supporters-1';
function flagLocalPaperRename(state) {
  if (!state || state.localPaperRule === LOCAL_PAPER_RULE) return false;
  if (state.localPaper) state.localPaper.renameDue = true;
  state.localPaperRule = LOCAL_PAPER_RULE;
  return true;
}

// Formes d'un titre de journal dans une phrase : « Le Cri des Canaris », « du Cri des Canaris », « au Cri… », « le Cri… ».
function paperForms(name) {
  const m = /^(Les|Le|La|L['’])\s*(.*)$/.exec(name);
  if (!m) return { bare: name, de: `de ${name}`, a: `à ${name}`, low: name };
  const [, art, rest] = m;
  if (art === 'Le') return { bare: name, de: `du ${rest}`, a: `au ${rest}`, low: `le ${rest}` };
  if (art === 'Les') return { bare: name, de: `des ${rest}`, a: `aux ${rest}`, low: `les ${rest}` };
  return { bare: name, de: `de ${name}`, a: `à ${name}`, low: name };
}

// Pseudo Kop d'un journal : mots importants collés (sans accents), 15 caractères au plus.
const paperHandle = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/)
  .filter((w) => w && !/^(le|la|les|l|de|des|du|d|et|a|au|aux)$/i.test(w)).map((w) => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 15) || 'JournalLocal';

// Rebaptise le journal des supporters partout : éditions (et leur journal), articles, posts, emails, compte Kop.
function renameLocalPaper(state, name) {
  const old = state.localPaper.name;
  delete state.localPaper.renameDue;
  if (!name || name === old) return;
  const from = paperForms(old), to = paperForms(name);
  const oldHandles = Object.entries(state.accounts || {}).filter(([, a]) => a.name === old).map(([h]) => h);
  const handle = paperHandle(name);
  const swap = (t) => {
    let s = t.split(from.de).join(to.de).split(from.a).join(to.a).split(from.bare).join(to.bare);
    if (from.low !== from.bare) s = s.split(from.low).join(to.low);
    for (const h of oldHandles) s = s.replace(new RegExp(`@${h}\\b`, 'g'), `@${handle}`);
    return s;
  };
  const isOld = (h) => oldHandles.some((x) => x.toLowerCase() === String(h).toLowerCase());
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') o[i] = swap(v); else walk(v); }); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.handle === 'string' && isOld(o.handle)) o.handle = handle;
    if (typeof o.replyTo === 'string' && isOld(o.replyTo)) o.replyTo = handle;
    for (const k of Object.keys(o)) {
      if (k === 'snapshot' || k === 'clubPages' || k === 'competitionAccounts' || k === 'pastPapers') continue;
      const v = o[k];
      const nk = isOld(k) ? (k === k.toLowerCase() ? handle.toLowerCase() : handle) : k;
      if (nk !== k) { delete o[k]; o[nk] = v; }
      if (typeof v === 'string') o[nk] = swap(v); else walk(v);
    }
  };
  walk(state);
  state.localPaper.name = name;
}

function loadState(store) {
  const state = store.activeCareer();
  const backup = () => { try { fs.copyFileSync(store.careerFile(state.careerId), store.careerFile(state.careerId).replace(/state\.json$/, 'state.avant-transversale.json')); } catch { /* pas encore de fichier */ } };
  const backupIds = () => { try { fs.copyFileSync(store.careerFile(state.careerId), store.careerFile(state.careerId).replace(/state\.json$/, `state.avant-identites-v${IDENTITY_REV}.json`)); } catch { /* pas encore de fichier */ } };
  const a = migrateClubAccounts(state), b = migratePaperName(state, backup), c = flagLocalPaperRename(state), d = migrateCompetitionAccounts(state), e = migrateAccountIdentities(state, backupIds), g = migratePageNames(state);
  if (a || b || c || d || e || g) store.saveCareer(state);
  // Carrière pas encore resynchronisée : la vue de l'agent n'a pas encore les chiffres par attitude.
  if (state?.agent?.view && state.agent.market && !state.agent.view.extensionByStance) state.agent.view.extensionByStance = extensionByStance(state.agent.market);
  return state;
}

function memoryFor(state) {
  const quoting = (p) => { const q = quotedIn(state, p); return q ? { handle: q.target.author.handle, text: String(q.target.text || '').slice(0, 200) } : undefined; };
  const thread = (p) => ((p.replies || []).length ? (p.replies || []).slice(-2).map((r) => ({ handle: r.author.handle, text: String(r.text || '').slice(0, 140) })) : undefined);
  const posts = state.feed.filter((p) => p.author.isMe).slice(-12).map((p) => ({ id: p.id, date: p.gameDate, text: p.text, quoting: quoting(p), last_replies: thread(p), ...(p.poll ? { poll_result: p.poll.options.map((o, k) => `${o}: ${p.poll.percents[k]}%`).join(', ') } : {}) }));
  // Les derniers posts des autres comptes : on peut les citer ou relancer la discussion dessous (règle 30).
  const recent = state.feed.filter((p) => !p.author.isMe).slice(-14).map((p) => ({
    id: p.id, date: p.gameDate, handle: p.author.handle, name: p.author.name, type: p.author.type, text: String(p.text || '').slice(0, 220),
    quoting: quoting(p), replies: (p.replies || []).length || undefined, last_replies: thread(p),
  }));
  const accounts = Object.entries(state.accounts).slice(-24).map(([handle, a]) => ({ handle, name: a.name, type: a.type, bio: a.bio || undefined, style: styleOf(handle, a.type) }));
  return {
    handle: state.profile.handle,
    followers: state.profile.followers,
    // Ce qu'il a écrit lui-même sur sa page Kop (bio, ville) : les comptes peuvent le voir.
    my_profile: { display_name: state.profile.displayName, bio: state.profile.bio || null, location: state.profile.location || null },
    writers: state.writers,
    // rename : le journal doit être rebaptisé selon la règle du journal des supporters.
    local_paper: state.localPaper ? { name: state.localPaper.name, city: state.localPaper.city, ...(state.localPaper.renameDue ? { rename: true } : {}) } : null,
    my_life: state.myLife,
    storylines: state.storylines,
    previous_headlines: state.editions.slice(-2).flatMap((e) => [...e.national, ...e.local].map((a) => a.headline)),
    // Objets des derniers mails reçus : les nouveaux ne les reprennent pas (Mails ne doit pas radoter).
    recent_mail_subjects: (state.mail || []).filter((m) => m.role !== 'newsletter').slice(-15).map((m) => m.subject),
    user_posts: posts,
    recent_posts: recent,
    user_on_record: state.onRecord,
    open_promises: openPromises(state),
    accounts,
    // Comptes qu'il suit sur Kop.
    my_follows: Object.keys(state.follows || {}).slice(-30).map((h) => `@${h}`),
    // Ce qu'il a aimé, reposté ou à quoi il a répondu sur Kop depuis la dernière édition.
    my_recent_interactions: (state.interactions || []).map((x) => ({ kind: x.kind, account: `@${x.handle}`, account_name: x.name, account_type: x.type, their_post: x.text, his_reply: x.reply || undefined, on: x.on })),
  };
}

function editionKind(changes, mercato = false, biography = false) {
  if (changes.firstSync) return `FIRST EDITION: introduce this world from the current state of the career (season so far, club, table, next match).${biography ? ' FACTS.biography is how the press and the fans discover who he is: tell his story from it.' : ''}`;
  if (changes.transfer) return `TRANSFER: the player has moved from ${changes.transfer.from} to ${changes.transfer.to}. Everyone knows he arrived from ${changes.transfer.from}.`;
  if (changes.newSeason) return 'NEW SEASON: season preview edition, with a short look back at the season just finished (FACTS.career.seasons: his last archived season, exact numbers).';
  if (changes.seasonComplete) return `SEASON REVIEW: the league season is over (CHANGES.season_review). The national paper reviews the league (champion, relegated clubs, top scorers, surprises); the local paper reviews the club's season and grades the player (use season_review.player.grade and his exact numbers), presents the Trophées de La Transversale of the club (season_review.awards, exact winners) and looks ahead (contract, clubs following him, the summer window).${changes.newResults.length ? ' Also cover the last results in CHANGES.newResults.' : ''}`;
  if (changes.plannedMove) return `AGREED TRANSFER: the player has accepted an offer from ${changes.plannedMove.club}; the move is agreed and ${changes.plannedMove.immediate ? 'goes through now, during the transfer window' : `will take effect when the next transfer window opens${changes.plannedMove.effective ? ` (${changes.plannedMove.effective})` : ''}`} (CHANGES.plannedMove). Lead with it: the agreement, what it means for him, the reactions at his current club and at ${changes.plannedMove.club}.${changes.newResults.length ? ' Also cover the new results in CHANGES.newResults.' : ''}`;
  if (changes.ntResults.length && !changes.newResults.length) return 'INTERNATIONAL: cover his national team match(es) in CHANGES.ntResults (his minutes, rating, goals exactly), then the club news.';
  if (changes.callUp && !changes.newResults.length) return `CALL-UP: he has been called up by ${changes.callUp.team}${changes.callUp.first ? ' for the first time in his career' : ''} (CHANGES.callUp; the full squad in CHANGES.ntList). Lead with it.`;
  if (changes.ntMatchday && !changes.newResults.length) return 'INTERNATIONAL MATCH DAY PREVIEW: today his national team plays FACTS.national_team.next_match; build-up, expectations, his place in the side.';
  if (changes.injury && !changes.newResults.length) return `INJURY: the player is now unavailable for about ${changes.injury.days} days (CHANGES.injury). Lead with it.`;
  if (changes.newTeamRole && !changes.newResults.length && !changes.matchday) return `TEAM ROLE: the player has a new role in the squad: ${changes.newTeamRole} (CHANGES.newTeamRole).`;
  if (changes.skillLearned && !changes.newResults.length && !changes.matchday) return `NEW SKILL: in training, the player has just learned ${skillForAi(changes.skillLearned.code) ? `the skill « ${skillForAi(changes.skillLearned.code)} »` : 'a new skill (its name is not known: do not name it)'} (CHANGES.skillLearned).`;
  if (changes.contractSigned && !changes.newResults.length) return `CONTRACT EXTENSION: ${changes.contractSigned.club} has announced that the player extended his contract until ${changes.contractSigned.until} (it ran until ${changes.contractSigned.previousUntil}). Lead with it.`;
  if (changes.newResults.length) return `POST-MATCH: cover the new results in CHANGES.newResults.${changes.contractSigned ? ' Also big news: his contract extension (CHANGES.contract_signed), announced by the club.' : ''}${changes.window?.event === 'close' ? ' The transfer window has also just closed: recap the moves involving his club (CHANGES.window_transfers).' : ''}`;
  if (changes.window?.event === 'close') return `MERCATO CLOSED: the ${changes.window.kind === 'été' ? 'summer' : 'winter'} transfer window closed on ${changes.window.close}. Recap it: the moves involving his club in CHANGES.window_transfers (arrivals, departures, what they change for him), the notable other moves, and where he stands now (club, contract, interest he drew).${changes.newResults.length ? ' Also cover the new results in CHANGES.newResults.' : ''}`;
  if (mercato && !changes.matchday) return 'MERCATO: transfer news. Lead with the moves involving his club in CHANGES.new_transfers (arrivals and departures, what they change for him), then other notable moves.';
  return 'MATCH DAY PREVIEW: today is the day of next_match; build-up to it, team news, expectations, life around the club.';
}

// Comptes connus : nom, type et bio (écrite par l'IA la première fois que le compte apparaît, puis gardée).
// Un compte de supporter, journaliste, etc. garde aussi le nom et le type de sa première apparition, même si l'IA
// les réécrit (@RoazhonBoy35 était tour à tour « Loïc SRFC », « Thomas » et « Lucas »). Les clubs, compétitions et
// vraies personnes ont déjà leur identité officielle.
const OFFICIAL_IDENTITY = new Set(['player', 'coach', 'competition', 'club', 'national']);
// Un compte inventé ne porte pas le nom d'une vraie marque ou d'un vrai média (« OptaCalcio ») : il prend son pseudo.
const REAL_BRAND = /\bopta|l['’]\s?[ée]quipe\b|\brmc\b|\bbein\b|canal\s?\+|\bdazn\b|\bsky\s?sport|\bespn\b|\bmarca\b|transfermarkt|gazzetta|\bsofascore|whoscored|onefootball|\bgoal\.com/i;
const noBrand = (a) => (!OFFICIAL_IDENTITY.has(a.type) && REAL_BRAND.test(a.name || '') ? { ...a, name: a.handle } : a);
function rememberAccount(state, author, bio = null) {
  if (!author.handle || author.isMe) return;
  const key = Object.keys(state.accounts).find((h) => h.toLowerCase() === author.handle.toLowerCase());
  const prev = key ? state.accounts[key] : null;
  if (prev && !OFFICIAL_IDENTITY.has(author.type) && !OFFICIAL_IDENTITY.has(prev.type)) Object.assign(author, { handle: key, name: prev.name || author.name, type: prev.type || author.type });
  Object.assign(author, noBrand(author));
  // Une bio qui recopie la consigne de style du plan (« tout en minuscules… ») est écartée.
  const text = isStyleText(bio) ? '' : String(bio || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  state.accounts[author.handle] = { name: author.name, type: author.type, ...(prev?.bio || text ? { bio: prev?.bio || text } : {}), ...(prev?.supports ? { supports: prev.supports } : {}) };
}

// Abonnés : grandissent avec les matchs joués et les buts, selon la taille du marché.
function growFollowers(state, changes) {
  let gain = 0;
  for (const r of changes.newResults) {
    if (!r.me) continue;
    gain += 120 + r.me.goals * 900 + r.me.assists * 400 + (r.me.starter ? 150 : 0);
  }
  const market = 0.6 + toneOf(state).market / 100; // plus il y a de monde qui regarde, plus ça suit
  const before = state.profile.followers;
  state.profile.followers = Math.round(state.profile.followers + gain * market * (0.9 + Math.random() * 0.2));
  noteFollowers(state, before, 'match');
}

// Abonnés gagnés : gardés pour les notifications « … se sont abonnés à toi » de Kop
// (feedLen place la notification après les posts de la même édition).
function noteFollowers(state, before, reason) {
  const gain = Math.round(state.profile.followers - before);
  if (gain <= 0) return;
  state.followerLog = [...(state.followerLog || []), { id: newId(), gameDate: state.snapshot?.gameDate || null, gain, reason, feedLen: state.feed.length }].slice(-60);
}

// Suivi d'une tâche pour le HUD de l'interface : étapes [libellé, taille de réponse attendue].
function tracker(progress, task, steps) {
  const startedAt = Date.now();
  let cur = { index: 0, expect: 0 };
  const send = (extra) => {
    try { progress?.({ task, steps: steps.map((x) => x[0]), startedAt, index: cur.index, label: cur.label || steps[cur.index]?.[0], expect: cur.expect, ...extra }); } catch { /* HUD facultatif */ }
  };
  return {
    step(i, label = null) { cur = { index: i, expect: steps[i]?.[1] || 0, label }; send({ phase: 'start', chars: 0 }); },
    ai: (p) => send(p),
    done(ok = true) { try { progress?.({ task, done: true, ok }); } catch { /* HUD facultatif */ } },
  };
}

// Durée de chaque étape d'une synchro (journal de la synchro et activity.log), pour voir ce qui prend du temps, avec le
// modèle qui a répondu (le dernier annoncé par la progression de l'IA : celui de secours quand le premier est saturé).
const fmtDuration = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')} s` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
function stopwatch() {
  const started = Date.now();
  let last = started, model = null;
  const laps = [];
  const fmt = (label, ms, m) => `${label} ${fmtDuration(ms)}${m ? ` (${m})` : ''}`;
  return {
    seen(m) { model = m; },
    lap(label) { const now = Date.now(); laps.push(fmt(label, now - last, model)); last = now; model = null; },
    // Étapes menées en même temps : chacune a son propre chronomètre (track), puis together() les note ensemble,
    // séparées par « ∥ », avec la durée du bloc.
    track() {
      let from = Date.now(), m = null;
      const own = [];
      return { own, seen(x) { m = x; }, lap(label) { const now = Date.now(); own.push(fmt(label, now - from, m)); from = now; m = null; } };
    },
    together(tracks) {
      const now = Date.now();
      laps.push(`${tracks.map((x) => x.own.join(' · ')).filter(Boolean).join(' ∥ ')} (en parallèle : ${fmtDuration(now - last)})`);
      last = now; model = null;
    },
    summary: () => `${laps.join(' · ')} · total ${fmtDuration(Date.now() - started)}`,
  };
}

// Les comptes de compétitions ne publient que des posts factuels faits par l'app, jamais un texte de l'IA.
const isCompetitionAuthor = (state, author) => isCompetitionHandle(author.handle)
  || (state.competitionAccounts || []).some((c) => c.handle.slice(1).toLowerCase() === String(author.handle).toLowerCase());
const daysBefore = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

// Ses anciens pseudos restent à lui : personne d'autre ne peut poster sous l'un d'eux.
const isUser = (state, author) => [state.profile.handle, ...(state.profile.formerHandles || [])].some((h) => String(h).toLowerCase() === author.handle.toLowerCase());
// Marques de ce monde : un seul compte chacune, quel que soit le pseudo écrit par l'IA (@StatFoot et @StatFoot_FR
// s'appelaient tous deux « StatFoot », site renommé Scoreline : tout passe sous @Scoreline_FR).
const BRAND_ACCOUNTS = [
  [/^(?:statfoot|scoreline)(_?(fr|off|officiel|official))?$/i, { handle: 'Scoreline_FR', name: 'Scoreline', type: 'stats' }],
  [/^cotefoot(_?(fr|off|officiel|official))?$/i, { handle: 'CoteFoot', name: 'CoteFoot', type: 'betting' }],
];
const brandAuthor = (a) => { const hit = BRAND_ACCOUNTS.find(([re]) => re.test(String(a.handle || ''))); return hit ? { ...a, ...hit[1] } : a; };
// Un club connu publie sous son vrai compte, quel que soit le pseudo écrit par l'IA.
const toAuthor = (p) => brandAuthor(officialAuthor({ handle: String(p.handle || '').replace(/^@/, ''), name: p.name || p.handle, type: p.type || 'fan' }));


// Message cité par un post : un post du fil ou l'une de ses réponses.
function quotedIn(state, p) {
  const root = p.aboutPost && state.feed.find((x) => x.id === p.aboutPost);
  if (!root) return null;
  const target = p.aboutReply ? (root.replies || []).find((r) => r.id === p.aboutReply) : root;
  return target ? { root, target } : null;
}

// Personne n'écrit à la place du joueur : ni sous l'un de ses pseudos, ni sous son nom.
const speaksAsUser = (state, author) => isUser(state, author)
  || [state.profile.displayName, state.snapshot?.player?.name].filter(Boolean).some((n) => n.toLowerCase() === String(author.name || '').toLowerCase());

// À qui répond un message : un compte déjà présent dans la discussion (le joueur compris), sinon defaultTo
// (rien = l'auteur du post). Le pseudo est repris tel qu'il est écrit dans le fil.
function replyTarget(root, added, to, author, defaultTo) {
  const h = String(to || '').replace(/^@/, '').trim().toLowerCase();
  const hit = h && h !== author.handle.toLowerCase() ? [root, ...(root.replies || []), ...added].map((x) => x.author.handle).find((x) => x.toLowerCase() === h) : null;
  const replyTo = hit || defaultTo;
  return replyTo ? { replyTo } : {};
}

// Message avec un mot d'un autre alphabet (raté de l'IA : « les cươngs néerlandais ») : vietnamien, grec, cyrillique,
// hébreu, arabe, thaï, chinois, japonais, coréen. Les lettres accentuées des noms européens (ş, ć, ø, ğ…) passent.
const ODD_SCRIPT = /[ƠơƯưẠ-ỹͰ-ϿЀ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/;
const oddScript = (t) => ODD_SCRIPT.test(String(t || ''));
// Pseudo qui ressemble à un identifiant interne (12 caractères hexadécimaux, comme ceux des posts).
const idLikeHandle = (h) => /^[0-9a-f]{8,}$/i.test(String(h || '').trim().replace(/^@/, ''));
// Texte déjà présent dans le fil : mêmes mots à 80 % au moins (accents et ponctuation ignorés).
const sayWords = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
function nearDuplicate(text, others) {
  const a = new Set(sayWords(text));
  if (!a.size) return false;
  return others.some((o) => {
    const b = new Set(sayWords(o));
    if (!b.size) return false;
    let common = 0;
    for (const w of a) if (b.has(w)) common++;
    return common / Math.max(a.size, b.size) >= 0.8;
  });
}

// Réponses d'une discussion (règle 30 des prompts) : chacune répond au post ou à un autre message du fil (reply_to).
// Les comptes déjà présents (et ceux de known) gardent leur identité ; personne ne parle à la place du joueur ni
// d'une compétition ; les vrais joueurs et coachs peuvent répondre (règle 29).
function threadReplies(state, root, list, { people, gameDate, defaultTo = null, known = [] }) {
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object' || !String(r.text || '').trim()) continue;
    // Un identifiant de post pris pour un pseudo, ou un message déjà dit dans le fil (le post recopié, une réponse en
    // double, même à un mot près) : écartés.
    if (idLikeHandle(r.handle) || oddScript(r.text)) continue;
    if (nearDuplicate(r.text, [root.text, ...(root.replies || []).map((x) => x.text), ...out.map((x) => x.text)])) continue;
    const author = realPersonAuthor(toAuthor(r), people);
    if (speaksAsUser(state, author) || isCompetitionAuthor(state, author)) continue;
    const same = (a) => a && !a.isMe && a.handle.toLowerCase() === author.handle.toLowerCase();
    const k = [root.author, ...(root.replies || []).map((x) => x.author), ...known, ...out.map((x) => x.author)].find(same);
    if (k) Object.assign(author, { handle: k.handle, name: k.name, type: k.type, ...(k.verified ? { verified: true } : {}) });
    // Un compte déjà connu de Kop garde son nom et son type, même si l'IA les écrit autrement.
    const known1 = !k && Object.keys(state.accounts || {}).find((h) => h.toLowerCase() === author.handle.toLowerCase());
    if (known1 && author.type !== 'player' && author.type !== 'coach') Object.assign(author, { handle: known1, name: state.accounts[known1].name || author.name, type: state.accounts[known1].type || author.type });
    if (people.some((e) => e.kind === 'club' && same({ handle: e.handle }))) Object.assign(author, { type: 'club', verified: true });
    // L'auteur du post ne se répond pas à lui-même pour redire son post : il ne revient que pour répondre à quelqu'un.
    const target = replyTarget(root, out, r.reply_to, author, defaultTo);
    if (!root.author.isMe && same(root.author) && (!target.replyTo || target.replyTo.toLowerCase() === author.handle.toLowerCase())) continue;
    if ([...(root.replies || []), ...out].filter((x) => same(x.author)).length >= 3) continue; // trois messages au plus par compte dans un fil
    // Pas deux messages d'affilée du même compte, sauf pour répondre à quelqu'un d'autre.
    const prevMsg = [...(root.replies || []), ...out].at(-1);
    if (prevMsg && same(prevMsg.author) && (!target.replyTo || target.replyTo.toLowerCase() === (prevMsg.replyTo || '').toLowerCase())) continue;
    rememberAccount(state, author, r.bio);
    out.push({ id: newId(), author, text: String(r.text).trim().slice(0, 400), likes: replyLikes(author, root.likes, state), gameDate, ...target });
  }
  return out;
}

// Post cité par un post de l'édition : about_post (un post ou une réponse déjà publiés) ou quote_index (un post
// plus haut dans la même édition).
function editionQuote(state, p, added) {
  const qi = p.quote_index == null || p.quote_index === '' ? NaN : Number(p.quote_index);
  if (Number.isInteger(qi) && qi >= 0 && qi < added.length && added[qi]) return { root: added[qi], target: added[qi] };
  const id = typeof p.about_post === 'string' ? p.about_post.trim() : '';
  if (!id) return null;
  for (const root of state.feed) {
    if (root.id === id) return { root, target: root };
    const r = (root.replies || []).find((x) => x.id === id);
    if (r) return { root, target: r };
  }
  return null;
}

// Posts d'une édition : citations et petites discussions entre comptes sous les posts (règle 30), puis les
// réponses qui relancent des discussions récentes (thread_replies).
function addEditionPosts(state, out, { people, gameDate, now, plan = [] }) {
  const added = []; // index dans out.posts → post publié (null s'il est écarté)
  const roast = 1 + (state.fanMood?.level ?? 1) / 2; // plus les supporters sont remontés, plus les moqueries tournent
  const perAccount = new Map(); // deux posts au plus par compte et par édition : le fil ne tourne pas autour des mêmes têtes
  for (const raw of Array.isArray(out.posts) ? out.posts : []) {
    // Post du plan (retrouvé par son pseudo) : le compte prévu, avec son nom et son type ; son @ quand le plan le demande.
    const slot = raw && plan.find((x) => x.handle.toLowerCase() === String(raw.handle || '').replace(/^@/, '').toLowerCase());
    const p = slot ? { ...raw, handle: slot.handle, name: slot.name, type: slot.type } : raw;
    if (slot?.tag && p.text && !String(p.text).toLowerCase().includes(`@${slot.tag.toLowerCase()}`)) p.text = `${String(p.text).trim()} @${slot.tag}`;
    const author = p && typeof p === 'object' && String(p.text || '').trim() && !oddScript(p.text) ? realPersonAuthor(toAuthor(p), people) : null;
    if (!author || speaksAsUser(state, author) || isCompetitionAuthor(state, author)) { added.push(null); continue; } // personne n'écrit à la place du joueur ni d'une compétition
    rememberAccount(state, author, p.bio);
    if (slot?.supports && state.accounts[author.handle]) state.accounts[author.handle].supports = slot.supports;
    const n = (perAccount.get(author.handle.toLowerCase()) || 0) + 1;
    perAccount.set(author.handle.toLowerCase(), n);
    if (n > 2) { added.push(null); continue; }
    const q = editionQuote(state, p, added);
    const ratio = q && q.target === q.root && q.root.ratio;
    const likes = ratio ? Math.round(((q.root.likes || 0) + 300) * roast * (1 + Math.random() * 2)) : postLikes(author, state);
    const item = { id: newId(), author, text: String(p.text).trim(), gameDate, createdAt: now, aboutPost: q ? q.root.id : null, ...(q && q.target !== q.root ? { aboutReply: q.target.id } : {}), replies: [], likes, reposts: Math.round(likes * (0.05 + Math.random() * 0.15)) };
    item.replies = threadReplies(state, item, Array.isArray(p.replies) ? p.replies.slice(0, 5) : [], { people, gameDate });
    if (q) q.target.reposts = (q.target.reposts || 0) + 1; // une citation est aussi un partage
    state.feed.push(item);
    added.push(item);
  }
  // La discussion continue sous des posts récents ; jamais plus de 14 réponses sous un post.
  for (const r of Array.isArray(out.thread_replies) ? out.thread_replies.slice(0, 8) : []) {
    const target = r && state.feed.find((p) => p.id === r.post_id);
    if (!target || (target.replies || []).length >= 14) continue;
    target.replies = [...(target.replies || []), ...threadReplies(state, target, [r], { people, gameDate })];
  }
  return added.filter(Boolean);
}

// Club → son championnat, d'après les classements des scores du monde ({ comps, teams } de buildScores).
function clubLeagues(d) {
  const out = new Map();
  for (const c of d?.comps || []) if (c.kind === 'league') for (const row of c.table || []) { const name = d.teams?.[row[0]]?.[0]; if (name && !out.has(name)) out.set(name, c.name); }
  return out;
}

// Les comptes que l'IA invente dans les discussions (ni connus de Kop, ni NEW_VOICES, ni vrais joueurs ou clubs) :
// renommés par le code (renameInvented), dans les messages, les citations et les « reply_to » qui les visent.
function renameInventedAccounts(state, out, { voices = [], people = [], clubLeague = null }) {
  const msgs = [];
  for (const th of Array.isArray(out?.threads) ? out.threads : []) for (const m of Array.isArray(th?.messages) ? th.messages : []) msgs.push(m);
  for (const q of Array.isArray(out?.quotes) ? out.quotes : []) { msgs.push(q); for (const r of Array.isArray(q?.replies) ? q.replies : []) msgs.push(r); }
  const items = msgs.filter((m) => m && typeof m === 'object');
  const keep = new Set([...Object.keys(state.accounts || {}), ...state.feed.flatMap((p) => [p, ...(p.replies || [])]).map((x) => x.author?.handle), ...voices.map((v) => v.handle), ...people.map((e) => e.handle), state.profile?.handle]
    .filter(Boolean).map((h) => String(h).replace(/^@/, '').toLowerCase()));
  const map = renameInvented({ state, snapshot: state.snapshot, clubLeague, keep, authors: items.map((m) => ({ handle: String(m.handle || '').replace(/^@/, ''), name: m.name, type: m.type })) });
  if (!map.size) return 0;
  const fix = (h) => map.get(String(h || '').replace(/^@/, '').toLowerCase());
  for (const m of items) {
    const p = fix(m.handle);
    if (p) { m.handle = p.handle; m.name = p.name; }
    for (const k of ['reply_to', 'reply_handle']) { const r = fix(m[k]); if (r) m[k] = r.handle; }
  }
  return map.size;
}

// Discussions sous les posts (règle 30) : une requête à part après l'édition, pour de vrais échanges entre comptes
// (réponses à d'autres réponses, désaccords, l'auteur qui réplique), sous les posts de l'édition et quelques posts
// récents. Les faits envoyés sont réduits à ce qui sert à discuter (pas les autres compétitions, le mercato, l'agent).
const DISCUSSION_FACTS = ['game_date', 'season', 'player', 'club', 'league', 'league_table', 'last_match', 'next_match', 'club_recent_results', 'league_last_round', 'league_next_round', 'scorer_race_in_league', 'season_stats', 'club_squad', 'coaches', 'fan_mood', 'club_accounts', 'competition_accounts', 'national_team', 'football_elsewhere'];
async function writeDiscussions({ state, settings, apiKey, facts, fresh, people, gameDate, onProgress, clubLeague = null }) {
  const brief = (p, isNew) => {
    const q = quotedIn(state, p);
    return {
      post_id: p.id, new: isNew || undefined, handle: p.author.handle, name: p.author.name, type: p.author.type, text: String(p.text || '').slice(0, 280),
      quoting: q ? { handle: q.target.author.handle, text: String(q.target.text || '').slice(0, 160) } : undefined,
      replies: (p.replies || []).slice(-6).map((r) => ({ handle: r.author.handle, text: String(r.text || '').slice(0, 160), reply_to: r.replyTo || undefined })),
    };
  };
  const freshIds = new Set(fresh.map((p) => p.id));
  const older = state.feed.filter((p) => !freshIds.has(p.id) && !p.official);
  const posts = [...fresh.map((p) => brief(p, true)), ...[...older.filter((p) => p.author.isMe).slice(-3), ...older.filter((p) => !p.author.isMe).slice(-6)].map((p) => brief(p, false))];
  if (!posts.length) return { threads: 0, messages: 0 };
  const memory = memoryFor(state);
  const voices = state.snapshot ? newVoices({ state, snapshot: state.snapshot, clubLeague }) : [];
  // De courts échanges entre comptes : le modèle léger suffit et ménage le quota du modèle choisi.
  const out = parseJson(await complete(settings, apiKey, {
    light: true,
    system: prompts.discussionsSystem(settings),
    user: prompts.discussionsUser({
      facts: Object.fromEntries(DISCUSSION_FACTS.filter((k) => facts[k] !== undefined).map((k) => [k, facts[k]])),
      memory: { handle: memory.handle, my_profile: memory.my_profile, accounts: memory.accounts, storylines: memory.storylines },
      posts,
      newVoices: voices,
      settings: withTone(settings, state),
    }),
    maxTokens: 12000,
    onProgress,
  }));
  // Comptes inventés par l'IA malgré la consigne : renommés avant d'entrer dans Kop (les réponses qui les visent suivent).
  const renamed = state.snapshot ? renameInventedAccounts(state, out, { voices, people, clubLeague }) : 0;
  // Un fil par post (chaque nouveau post a ses réponses, comme sur X) : jusqu'à 8 messages, 14 au plus sous un post.
  const listed = new Set(posts.map((p) => p.post_id));
  let threads = 0, messages = 0, quotes = 0;
  for (const th of Array.isArray(out.threads) ? out.threads.slice(0, 24) : []) {
    const target = th && listed.has(th.post_id) && state.feed.find((p) => p.id === th.post_id);
    const room = target ? 14 - (target.replies || []).length : 0;
    if (room <= 0 || !Array.isArray(th.messages)) continue;
    // Messages écartés (doublons, faux pseudos) d'abord, plafond ensuite : ils ne prennent pas la place des vrais.
    const added = threadReplies(state, target, th.messages.slice(0, 14), { people, gameDate }).slice(0, Math.min(8, room));
    if (!added.length) continue;
    target.replies = [...(target.replies || []), ...added];
    threads++;
    messages += added.length;
  }
  // Citations : de nouveaux posts qui citent un post (ou une de ses réponses) et le commentent.
  for (const q of Array.isArray(out.quotes) ? out.quotes.slice(0, 4) : []) {
    const root = q && listed.has(q.post_id) && state.feed.find((p) => p.id === q.post_id);
    if (!root || !String(q.text || '').trim() || idLikeHandle(q.handle)) continue;
    const handle = String(q.reply_handle || '').replace(/^@/, '').toLowerCase();
    const target = (handle && [...(root.replies || [])].reverse().find((r) => r.author.handle.toLowerCase() === handle)) || root;
    if (nearDuplicate(q.text, [root.text, target.text]) || oddScript(q.text)) continue;
    const author = realPersonAuthor(toAuthor(q), people);
    if (speaksAsUser(state, author) || isCompetitionAuthor(state, author)) continue;
    rememberAccount(state, author, q.bio);
    const likes = postLikes(author, state);
    const item = { id: newId(), author, text: String(q.text).trim().slice(0, 400), gameDate, createdAt: Date.now(), aboutPost: root.id, ...(target !== root ? { aboutReply: target.id } : {}), replies: [], likes, reposts: Math.round(likes * (0.05 + Math.random() * 0.15)) };
    item.replies = threadReplies(state, item, Array.isArray(q.replies) ? q.replies.slice(0, 5) : [], { people, gameDate }).slice(0, 3);
    target.reposts = (target.reposts || 0) + 1; // une citation est aussi un partage
    state.feed.push(item);
    quotes++;
  }
  return { threads, messages, quotes, renamed };
}

// La rédaction de La Transversale : le chroniqueur national (le nom déjà connu de la carrière, sinon celui-ci), cinq
// plumes et, depuis que le journal couvre le football mondial (2026-11-09), quatre correspondants. Personnes fictives ;
// la rédaction est fixée une fois pour toutes dans state.writers (une plume arrivée plus tard la rejoint). Une ligne de
// caractère chacune : le caractère se voit dans ce que la plume regarde et juge, le style reste celui d'un quotidien factuel.
const TRANSVERSALE_DESK = [
  { name: 'Marc Lhermitte', role: 'Chroniqueur national',
    voice: 'Senior writer: the big stories and the European nights. Sees what decided a match and what it means for the season; sober and exact, a dry wit now and then.' },
  { name: 'Sofiane Kerbrat', role: 'Analyste tactique',
    voice: 'Tactics analyst: how and why a team played the way it did, always from a position or a number in FACTS; clear, a little dry.' },
  { name: 'Hélène Marchetti', role: 'Éditorialiste',
    voice: 'Editorialist: takes a clear side on a decision or an idea and defends it with facts; sharp, never personal.' },
  { name: 'Bruno Vidaillac', role: 'Consultant, ancien milieu de terrain',
    voice: 'Former professional midfielder turned consultant (fictional): the dressing-room view, frank and concrete, professional.' },
  { name: 'Laura Ménard', role: 'Reporter',
    voice: "Reporter on his league and his club: his club's matches and the press conferences; lets the coaches and players speak, quotes first, little commentary." },
  { name: 'Nadia Castelli', role: 'Rubrique compétitions',
    voice: 'Competitions editor: French football, the Europa League and the competitions nobody else covers; every club, its results, scorers and place in the table; she likes the club nobody talks about. Neutral: no club is hers.' },
  { name: 'Owen Hartley', role: 'Correspondant en Angleterre',
    voice: 'England correspondent: the Premier League and English football, the race at the top and the clubs in trouble; brisk and precise.' },
  { name: 'Diego Arrabal', role: 'Correspondant en Espagne',
    voice: 'Spain correspondent: LaLiga and Spanish football; watches the big clubs and the surprises alike.' },
  { name: 'Chiara Venturelli', role: 'Correspondante en Italie',
    voice: 'Italy correspondent: Serie A and Italian football; reads every result through the table.' },
  { name: 'Jonas Kessling', role: 'Correspondant en Allemagne',
    voice: 'Germany correspondent: the Bundesliga and German football; numbers first, dry.' },
];
// Le correspondant de chaque grande compétition (place dans la rédaction) ; les autres vont à la rubrique compétitions.
const BEATS = [[/champions league|world cup|coupe du monde|\beuro\b/i, 0], [/premier league|fa cup|championship/i, 6], [/laliga|copa del rey/i, 7], [/serie a\b|coppa italia/i, 8], [/bundesliga|dfb/i, 9]];
const beatOf = (competition) => (BEATS.find(([re]) => re.test(String(competition || ''))) || [null, 5])[1];
// La rédaction de la carrière (noms fixés une fois pour toutes) ; rôles et voix viennent toujours d'ici.
function transversaleDesk(state) {
  state.writers = state.writers || {};
  if (!Array.isArray(state.writers.national_desk) || !state.writers.national_desk.length) {
    const lead = state.writers.national_columnist || TRANSVERSALE_DESK[0].name;
    state.writers.national_columnist = lead;
    state.writers.national_desk = TRANSVERSALE_DESK.map((w, i) => ({ name: i === 0 ? lead : w.name, role: w.role }));
  }
  // Une plume arrivée après le début de la carrière rejoint la rédaction déjà fixée.
  state.writers.national_desk = [...state.writers.national_desk, ...TRANSVERSALE_DESK.slice(state.writers.national_desk.length).map(({ name, role }) => ({ name, role }))];
  state.writers.national_desk = state.writers.national_desk.map((w, i) => ({ name: w.name, role: TRANSVERSALE_DESK[i]?.role || w.role }));
  return state.writers.national_desk.map((w, i) => ({ ...w, voice: TRANSVERSALE_DESK[i]?.voice || '' }));
}
const wordCount = (text) => String(text || '').split(/\s+/).filter(Boolean).length;
const firstSentence = (text) => (String(text || '').trim().match(/^.{20,240}?[.!?»](?=\s|$)/s) || [String(text || '').slice(0, 160)])[0];

// Conférences de presse : le dernier match du club s'il vient d'être joué, le prochain s'il a lieu dans les 3 jours.
function pressMoments(snapshot, changes) {
  const ref = snapshot.club.ref;
  const after = (changes.newResults || []).filter((m) => m.homeRef === ref || m.awayRef === ref).slice(-1)[0];
  const next = snapshot.next;
  const days = next ? Math.round((Date.parse(`${next.date}T12:00:00Z`) - Date.parse(`${snapshot.gameDate}T12:00:00Z`)) / 864e5) : null;
  return {
    after: after ? { match: `${after.home} ${after.score?.[0]}-${after.score?.[1]} ${after.away}`, competition: after.competition, date: after.date } : null,
    before: next && days != null && days <= 3 ? { match: `${next.home} - ${next.away}`, competition: next.competition, date: next.date, hour: next.hour ?? null, in_days: days } : null,
  };
}

// Plan de l'édition, fixé ici plutôt que laissé à l'IA : une plume, un genre, un sujet, une attaque (« lead ») et une
// longueur par article, selon l'actualité (2026-11-09). Après un match : le récit, la conférence de presse et le tour
// des terrains, plus un quatrième article quand l'édition compte (son but, sa passe ou sa grande note, un écart de trois
// buts, un match de coupe, une grande nouvelle). Avant un match : la conférence, un édito ou le regard du consultant,
// et le tour quand une journée s'annonce. L'attaque change d'une édition à l'autre : c'est elle qui évite les débuts
// tous pareils. Chaque article a son « focus » : « club » suit son club et le joueur, « competition » raconte la
// compétition tout entière (src/world/competitionDesk.js), « lead » porte la grande nouvelle.
const LONG_KINDS = ['récit du match', 'chronique']; // la longue lecture d'abord à eux, quand l'édition en a une
const SPECIAL_EDITION = /^(FIRST EDITION|TRANSFER|NEW SEASON|SEASON REVIEW|AGREED TRANSFER|CALL-UP|CONTRACT EXTENSION|INJURY|TEAM ROLE|MERCATO)/;
const WORLD_KIND = 'le foot ailleurs';
const AWARDS_KIND = 'les récompenses';
const PAPER_MIN = 5, PAPER_MAX = 7; // le journal mondial : 5 à 7 articles par édition, dans une seule requête
const TOURS_MAX = 2; // « tour des terrains » par édition, au plus (sa demande du 2026-11-10 : moins de scores)
const LEADS = {
  [WORLD_KIND]: ['the performance or the result the subject names first'],
  [AWARDS_KIND]: ['the overall player of the month and his exact numbers'],
  'récit du match': ['the decisive action of the match: who, what, and the minute when goalTimeline gives it', 'the final score and what it changes in the table', 'the player who weighed most on the match, with his numbers', 'the turning point of the match'],
  'conférence de presse': ["a quote from his club's coach", 'a quote from the other camp', 'a quote from a player'],
  'analyse tactique': ['the shape his club started with, counted from the positions', 'the change (a substitution or a new shape) that weighed most', 'the zone of the pitch where the match was decided'],
  [TOUR_KIND]: ['the biggest result of the round', 'the leader and its lead', 'the surprise of the round', 'the bottom of the table'],
  'édito': ['her opinion, in one sentence'],
  'regard de consultant': ['a concrete situation of the week, seen from the dressing room'],
  'débat télévisé': ['the host introducing the guest of the day'],
  chronique: ['the fact that best shows the story'],
  'les chiffres': ['the most telling number'],
  portrait: ['a fact of his career from FACTS'],
};
const leadOf = (kind, n) => { const list = LEADS[kind] || ['the main fact of the article']; return list[n % list.length]; };
const ROOM_AFTER = (m) => [`what the coach must tell his players after ${m}`, `the player of his club who must be protected or pushed after ${m}`, `how a dressing room lives a result like ${m}`, `fatigue, rotation and the days after ${m}`];
const ROOM_BEFORE = (m) => [`how a dressing room prepares ${m}`, `who must carry the pressure before ${m}`, `what the players must do in the first twenty minutes of ${m}`];
// Le journal du football mondial (2026-11-09, à la demande du joueur : « comme As, Marca, la Gazzetta, Bild, L'Équipe,
// France Football, The Athletic, The Sun ou Sky Sports ») : 5 à 7 articles. Une compétition par article, la plus
// lourde d'abord, chacune par son correspondant ; sa carrière dans la rubrique de son championnat (le récit de son match,
// la conférence de presse quand l'édition compte), à la une seulement quand il fait l'actualité ; le joueur du mois en
// début de mois ; un édito ou les chiffres pour finir. Les compétitions qui n'ont pas la place se partagent un dernier
// article, « le foot ailleurs ».
function worldPaperPlan(desk, press, kind, n, angles) {
  const w = (i) => desk[i]?.name || desk[0].name;
  const { after, before } = press;
  const special = SPECIAL_EDITION.test(kind);
  const big = Boolean(angles.big) || special;
  const club = [];
  if (special) club.push({ author: w(0), kind: 'chronique', focus: 'lead', subject: 'the lead story of this edition (EDITION TYPE)' });
  if (after) {
    const m = after.match;
    club.push({ author: big && !special ? w(0) : w(4), kind: 'récit du match', focus: 'club', competition: after.competition, subject: `the story of ${m} (${after.competition}, ${after.date}): what decided it and what it changes, not a list of every player` });
    // La conférence de presse à chaque match de son club (avant : seulement les grosses éditions).
    club.push({ author: w(4), kind: 'conférence de presse', focus: 'club', competition: after.competition, subject: before ? `the press conferences: what both camps said after ${m}, and before ${before.match}` : `the press conference after ${m}: what both camps said` });
    // L'après-match tourne : l'analyse tactique, « Le Débrief » (le débat télévisé), le regard du consultant sur le vestiaire.
    club.push([
      { author: angles.world.awards?.player_of_the_year || angles.world.awards?.player_of_the_month ? w(3) : w(1), kind: 'analyse tactique', focus: 'club', competition: after.competition, subject: `how his club played in ${m}: the shape from last_match.clubLineup positions, the substitutions, the key battles` },
      { author: w(3), kind: 'débat télévisé', focus: 'club', competition: after.competition, subject: `« Le Débrief », the post-match TV debate after ${m}: the host, two or three invented pundits and an invented guest argue about the match, his club and his own performance, then about the next match` },
      { author: w(3), kind: 'regard de consultant', focus: 'club', competition: after.competition, subject: ROOM_AFTER(m)[n % ROOM_AFTER(m).length] },
    ][n % 3]);
  } else if (before) {
    club.push({ author: w(4), kind: 'conférence de presse', focus: 'club', competition: before.competition, subject: `the press conferences before ${before.match} (${before.competition}): what both camps said` });
    club.push({ author: w(3), kind: 'regard de consultant', focus: 'club', competition: before.competition, subject: ROOM_BEFORE(before.match)[n % ROOM_BEFORE(before.match).length] });
  }
  if (/^FIRST EDITION.*FACTS\.biography/.test(kind)) club.push({ author: w(3), kind: 'portrait', focus: 'club', subject: 'portrait of the player: who he is, from FACTS.biography (where he comes from, his youth, his path to this club), and where he stands now, only from FACTS' });
  const potm = angles.world.awards?.player_of_the_month;
  // Le footballeur de l'année, la récompense du jeu (lue dans la sauvegarde) : l'article des récompenses commence par lui
  // et l'édition fait sa une avec, sauf quand son joueur fait l'actualité.
  const poty = angles.world.awards?.player_of_the_year;
  const monthPart = potm ? `the players of the month of ${potm.month} (FACTS.world_football.awards.player_of_the_month): the overall winner first, then the winner of each league, each with his club, matches, goals, assists and average rating` : '';
  const awards = poty || potm ? [{ author: w(1), kind: AWARDS_KIND, focus: 'awards', ...(poty ? { lead: 'the player of the year, his club and his points' } : {}),
    subject: poty ? `the game's player of the year ${poty.year} (« footballeur de l'année », FACTS.world_football.awards.player_of_the_year): the winner, his club and his points, then the rest of the podium with their points${poty.previous ? `, and the previous winner (${poty.previous.year})` : ''}${potm ? `; then ${monthPart}` : ''}` : monthPart }] : [];
  // L'actualité d'abord, mais l'édito sur la vie d'un championnat a toujours sa place (son choix, 2027-01-01 : « ce type
  // d'article qui raconte la vie des championnats, un peu plus souvent ») ; les chiffres ou le consultant prennent ce qui reste.
  // Le football mondial : deux « tour des terrains » au plus (avant : jusqu'à cinq, des scores partout), les autres
  // compétitions dans un article commun quand il reste une place.
  const room = Math.max(1, PAPER_MAX - club.length - awards.length - (angles.world.debate ? 1 : 0));
  const stories = angles.world.stories;
  const own = stories.slice(0, Math.min(TOURS_MAX, room >= 3 ? 2 : 1));
  const rest = room > own.length ? stories.slice(own.length) : [];
  const used = new Set(club.map((p) => p.author));
  const pick = (i) => { const name = [w(i), w(5), w(1), w(3), w(2)].find((x) => !used.has(x) || x === w(5)); used.add(name); return name; };
  const world = own.map((s) => ({
    author: pick(beatOf(s.competition)), kind: TOUR_KIND, focus: 'world', competition: s.competition, teams: s.teams, lead: 'the performance or the result the subject names first',
    subject: `${s.competition} since the last edition, only from its entry in FACTS.world_football.competitions: first ${s.story}, then the other results with their scorers and what they change at the top and the bottom of the table${s.totw ? '; end with its player_of_the_round and two or three players of its team_of_the_round, never the full eleven' : ''}`,
  }));
  if (rest.length) {
    world.push({ author: pick(5), kind: WORLD_KIND, focus: 'world', competition: rest[0].competition, teams: rest[0].teams, subject: `the other big competitions since the last edition (${rest.map((s) => s.competition).join(', ')}), only from FACTS.world_football: for each one, first its biggest result or performance (${rest.map((s) => s.story).join('; ')}), then what it changes at the top` });
  }
  const debate = angles.world.debate ? { author: w(2), kind: 'édito', focus: 'world', subject: `${angles.world.debate}. An opinion piece, NOT a match report` } : null;
  const numbers = { author: w(1), kind: 'les chiffres', focus: 'world', subject: 'the numbers of the moment in the big competitions, only from FACTS.world_football: the scorer races, the gaps at the top and at the bottom, the standout performances' };
  const opinion = [];
  const room2 = { author: w(3), kind: 'regard de consultant', focus: 'world', subject: 'the dressing-room view of the biggest result of the week in FACTS.world_football: what the players of both clubs live after it' };
  const filler = [debate, ...(awards.length || !(n % 2) ? [room2, numbers] : [numbers, room2])].filter(Boolean); // l'édito d'abord ; les récompenses et les chiffres ont la même plume
  const count = () => club.length + world.length + awards.length + opinion.length;
  for (const f of filler) { if (count() >= PAPER_MAX || (opinion.length && count() >= PAPER_MIN)) break; if (!opinion.some((o) => o.kind === f.kind)) opinion.push(f); }
  // La une : son article quand il fait l'actualité, sinon la plus grosse compétition.
  const plan = big ? [...club, ...world, ...awards, ...opinion] : poty ? [...awards, ...club, ...world, ...opinion] : !world.length ? [...club, ...world, ...awards, ...opinion] : [world[0], ...club, ...world.slice(1), ...awards, ...opinion];
  const sizes = plan.map((p, i) => {
    if (i === 0) return 'long';
    if (['conférence de presse', 'portrait', AWARDS_KIND, 'récit du match'].includes(p.kind)) return 'medium';
    if (p.kind === TOUR_KIND) return world.indexOf(p) <= 2 ? 'medium' : 'short';
    return n % 2 ? 'medium' : 'short';
  });
  return plan.slice(0, PAPER_MAX).map((p, i) => ({ ...p, lead: p.lead || leadOf(p.kind, n), size: sizes[i] }));
}

function transversalePlan(desk, press, kind, editions = 0, angles = {}) {
  const w = (i) => desk[i]?.name || desk[0].name;
  const n = editions;
  const { after, before } = press;
  if ((angles.world?.stories?.length || angles.world?.awards?.player_of_the_year) && !/^SEASON REVIEW/.test(kind)) return worldPaperPlan(desk, press, kind, n, angles);
  const big = Boolean(angles.big) || SPECIAL_EDITION.test(kind);
  const debate = { author: w(2), kind: 'édito', focus: 'competition', subject: angles.debate || "ONE debate of the moment in his competitions, about other clubs or the competition as a whole (the title race, the relegation fight, a club on a run, a coach's choice elsewhere): take a side. An opinion piece, NOT a match report and NOT a preview" };
  const room = (m, topics) => { const list = m ? topics(m) : null; return { author: w(3), kind: 'regard de consultant', focus: 'club', subject: list ? `the dressing-room view: ${list[n % list.length]}` : "the mood of his club's dressing room right now, from what FACTS shows (results, form, playing time)" }; };
  const tour = { author: w(5), kind: TOUR_KIND, focus: 'competition', ...(angles.tour?.competition ? { competition: angles.tour.competition } : {}), subject: angles.tour?.subject || 'around the grounds of his competitions: the other clubs, their results and what they change in the table (league_last_round, league_next_round, league_table, competitions)' };
  const lead = { author: w(0), kind: 'chronique', focus: 'lead', subject: 'the lead story of this edition (EDITION TYPE)' };
  const numbers = { author: w(1), kind: 'les chiffres', focus: 'competition', subject: "the numbers of his competitions right now, only from FACTS: the table, the scorer race, the form of the clubs, his club's place among them" };
  let plan;
  if (/^SEASON REVIEW/.test(kind)) {
    // Numéro spécial de fin de saison : la saison de son championnat, ses chiffres, les trophées, la saison de son club
    // et la sienne (CHANGES.season_review et CHANGES.season_awards, chiffres exacts).
    plan = [
      { author: w(0), kind: 'chronique', focus: 'lead', subject: 'the lead story of this edition, a special issue: the season of his league in review (the champion, the relegated clubs, the turning points; CHANGES.season_review.final_table)' },
      { author: w(1), kind: 'les chiffres', focus: 'competition', subject: 'the season in numbers: the final table, the top scorers, the best players by average rating and the trophies of the league (CHANGES.season_awards, exact winners and figures)' },
      { author: w(2), kind: 'édito', focus: 'competition', subject: 'her own awards of the season: she reacts to the team of the season and the player of the season of CHANGES.season_awards, who deserved it, who was forgotten' },
      { author: w(3), kind: 'regard de consultant', focus: 'club', subject: 'the season of his club and of the player: his grade (CHANGES.season_review.player.grade), his exact numbers, his best match, what must change next season' },
    ];
  } else if (after) {
    const m = after.match;
    plan = [
      { author: w(0), kind: 'récit du match', focus: 'club', subject: `the story of ${m} (${after.competition}, ${after.date}): what decided it and what it changes, not a list of every player` },
      { author: w(4), kind: 'conférence de presse', focus: 'club', subject: before ? `the press conferences: what both camps said after ${m}, and before ${before.match}` : `the press conference after ${m}: what both camps said` },
      tour,
    ];
    // Le quatrième article, quand l'édition compte, tourne : l'analyse tactique, l'édito, le regard du consultant,
    // puis « Le Débrief », le débat télévisé.
    if (big) {
      plan.push([
        { author: w(1), kind: 'analyse tactique', focus: 'club', subject: `how his club played in ${m}: the shape from last_match.clubLineup positions, the substitutions, the key battles${n % 8 === 4 ? ', in three short numbered parts' : ''}` },
        debate,
        room(m, ROOM_AFTER),
        { author: w(3), kind: 'débat télévisé', focus: 'club', subject: `« Le Débrief », the post-match TV debate after ${m}: the host, two or three invented pundits and an invented guest argue about the match, his club and his own performance, then about the other results of the competition` },
      ][n % 4]);
    }
  } else if (before) {
    plan = [
      { author: w(4), kind: 'conférence de presse', focus: 'club', subject: `the press conferences before ${before.match} (${before.competition}): what both camps said` },
      n % 2 ? debate : room(before.match, ROOM_BEFORE),
    ];
    if (angles.tour || big) plan.push(tour);
    if (!plan.some((p) => p.focus === 'competition')) plan.push(angles.story ? { author: w(0), kind: 'chronique', focus: 'competition', subject: angles.story } : numbers);
  } else {
    plan = [lead, n % 2 ? debate : numbers];
    if (big) plan.push(room(null));
  }
  // Grande nouvelle (transfert, prolongation, bilan de saison…) : le chroniqueur l'ouvre, à la place de son article habituel.
  if (SPECIAL_EDITION.test(kind) && !plan.some((p) => p.author === w(0) && p.kind === 'chronique' && p.focus === 'lead')) {
    plan = [lead, ...plan.filter((p) => p.author !== w(0))].slice(0, 4);
  }
  // Première édition avec une biographie : un article laisse la place à son portrait, en partant de la fin, sauf
  // l'ouverture, la conférence de presse et le seul article sur les compétitions ; s'il n'y en a pas, il s'ajoute.
  if (/^FIRST EDITION.*FACTS\.biography/.test(kind)) {
    const portrait = { author: w(3), kind: 'portrait', focus: 'club', subject: 'portrait of the player: who he is, from FACTS.biography (where he comes from, his youth, his path to this club), and where he stands now, only from FACTS' };
    const wide = plan.filter((p) => p.focus === 'competition').length;
    let at = plan.length - 1;
    while (at > 0 && (plan[at].focus === 'lead' || plan[at].kind === 'conférence de presse' || (plan[at].focus === 'competition' && wide === 1))) at--;
    if (at > 0 && plan.length >= 4) plan[at] = portrait; else plan.push(portrait);
  }
  // Longueurs : récit long seulement quand l'édition compte, chronique d'ouverture longue ; conférence, analyse, portrait
  // et débat en format moyen ; le reste alterne brève et moyen d'une édition à l'autre. Une seule longue lecture.
  const sizes = plan.map((p) => {
    if (p.kind === 'récit du match') return big ? 'long' : 'medium';
    if (p.kind === 'chronique') return p.focus === 'lead' ? 'long' : 'medium';
    if (['conférence de presse', 'analyse tactique', 'portrait', 'débat télévisé'].includes(p.kind)) return 'medium';
    return n % 2 ? 'medium' : 'short';
  });
  const longs = sizes.map((s, i) => (s === 'long' ? i : -1)).filter((i) => i >= 0).sort((a, b) => {
    const r = (p) => { const k = LONG_KINDS.indexOf(p.kind); return k < 0 ? LONG_KINDS.length : k; };
    return r(plan[a]) - r(plan[b]) || a - b;
  });
  for (const i of longs.slice(1)) sizes[i] = 'medium';
  return plan.map((p, i) => ({ ...p, lead: leadOf(p.kind, n), size: sizes[i] }));
}

// Faits de La Transversale : ceux de l'édition, sans ce qui est privé (agent), sans les comptes Kop ni les cotes,
// avec l'effectif du prochain adversaire pour les conférences de presse et ce que racontent ses compétitions.
function transversaleFacts(facts, snapshot) {
  const { agent, club_accounts, competition_accounts, football_elsewhere, ...rest } = facts;
  if (rest.next_match) { const { odds, ...m } = rest.next_match; rest.next_match = m; }
  const opp = snapshot.rosters?.opponent;
  return { ...rest, competition_stories: competitionStories(snapshot), next_opponent_squad: opp ? { team: opp.team, coach: opp.coach || null, players: (opp.players || []).filter(Boolean).slice(0, 25) } : null };
}

// Relecture de chaque article par le code : longueur (selon son format ; un article à 60 % au moins du bas de la
// fourchette passe, une reprise pour quelques mots coûtait une requête sans enrichir le texte), clichés (titre, chapeau
// et texte, avec leurs variantes), débuts interdits, fin qui dérive vers le prochain match, passages répétés, copie
// d'un autre article, caractères d'une autre écriture. Les articles fautifs sont renvoyés ensemble, chacun avec la
// liste précise de ses défauts.
const minWords = (size) => Math.round((prompts.ARTICLE_SIZES[size] || prompts.ARTICLE_SIZES.long).words[0] * 0.6);
const BANNED = [
  ['partition', /\bpartitions?\b/], ['chef d\'orchestre', /chefs? d'orchestre/], ['juge de paix', /juges? de paix/],
  ['pendules à l\'heure', /pendules à l'heure/], ['sans fausse note', /sans fausse note/], ['de haute volée', /de haute volée/],
  ['le navire', /\ble navire\b/], ['redresser la barre', /redress\w* la barre/], ['avec autorité', /avec (une )?autorité/],
  ['avec panache', /avec panache/], ['calendrier exigeant', /calendrier (très )?exigeant/], ['la saison est encore longue', /saison est encore (longue|jeune)/],
  ['la route est encore longue', /route est encore longue/], ['le haut niveau se nourrit', /haut niveau se nourrit/], ['ne laisse aucune place', /ne laiss\w* aucune place/],
  ['au-delà des chiffres', /au-delà des chiffres/], ['à point nommé', /à point nommé/], ['faire parler la poudre', /parler la poudre/],
  ['impérativement', /impérativement/], ['la suite de la saison', /la suite de la saison/], ['croiser le fer', /crois\w* le fer/],
  ['viatique', /viatique/], ['disons-le franchement', /disons-le franchement/],
  ['c\'est précisément', /c'est précisément/], ['le technicien', /\ble technicien\b/], ['géométrie', /géométrie/], ['académique', /académique/], ['silence lourd', /silence lourd/], ['atmosphère particulière', /atmosphère particulière/],
];
const OPENING_BANNED = /^(il (est|y a|existe) des|il est de ces|il r[éèe]gn)/;
const RATING_MENTION = /\(\d{1,2}(?:[.,]5)?\)|\bnot(?:é|ée|e)s? (?:de )?\d{1,2}(?:[.,]5)?\b|\bla note de \d{1,2}(?:[.,]5)?\b/gi;
const ENDING_KINDS = new Set(['récit du match', 'analyse tactique', 'édito', 'chronique', 'les chiffres']);
const ENDING_FIXTURE = /(prochain|à venir|ce week-end|ce (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|réception d|déplacement (à|de|en|chez)|coup d'envoi|replonger)/;
const lowText = (t) => String(t || '').toLowerCase().replace(/[’]/g, '\'');
const plainWords = (text) => lowText(text).replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);
const grams = (words, n) => { const out = []; for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' ')); return out; };
function articleProblems(article, earlier = [], { nextOpponent = null, coverage = null } = {}) {
  const problems = [];
  let score = 0;
  const offTopic = coverageProblems(article, coverage);
  if (offTopic.length) { problems.push(...offTopic); score += 2 * offTopic.length; }
  // Trop de notes ou toute l'équipe type dans un article du monde, toute la composition dans le récit de son match.
  const crowded = paperProblems(article, coverage || {});
  if (crowded.length) { problems.push(...crowded); score += 2 * crowded.length; }
  const words = wordCount(article.body), size = prompts.ARTICLE_SIZES[article.size] || prompts.ARTICLE_SIZES.long, min = minWords(article.size);
  if (words < min) { problems.push(`too short: ${words} words; write ${size.words[0]} to ${size.words[1]} words (${size.paragraphs})`); score += Math.ceil((min - words) / 100); }
  const banned = BANNED.filter(([, re]) => re.test(lowText(`${article.headline}\n${article.dek}\n${article.body}`))).map(([label]) => label);
  if (banned.length) { problems.push(`banned clichés to remove from the headline, the dek and the body: ${banned.map((p) => `« ${p} »`).join(', ')}`); score += banned.length; }
  // Une liste de notes (« Mendy (5) et Saint-Ruf (5) », « noté 6 ») : le récit doit raconter, pas recopier la feuille de match.
  const ratings = (String(article.body || '').match(RATING_MENTION) || []).length;
  if (article.kind !== 'les chiffres' && ratings > 4) { problems.push(`lists ${ratings} ratings: keep three at most, for the players who decided the match, and tell what they did instead`); score += 2; }
  if (OPENING_BANNED.test(lowText(article.body).trim())) { problems.push('banned opening (« Il y a des… », « Il existe des… », « Il régnait… »): the first sentence gives the fact of LEAD'); score += 1; }
  const last = lowText(String(article.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).at(-1));
  if (ENDING_KINDS.has(article.kind) && last && (ENDING_FIXTURE.test(last) || (nextOpponent && last.includes(lowText(nextOpponent))))) {
    problems.push('the last paragraph drifts to the coming fixtures: end on the subject of the article itself (a verdict, an image, a quote), not on the next match');
    score += 1;
  }
  const seen = new Map(), repeated = new Set();
  grams(plainWords(article.body), 7).forEach((g, i) => { if (!seen.has(g)) seen.set(g, i); else if (i - seen.get(g) >= 7) repeated.add(g); });
  if (repeated.size) { problems.push(`passages repeated in the article (say each thing once): ${[...repeated].slice(0, 3).map((g) => `« ${g}… »`).join(', ')}`); score += 2 * Math.min(3, repeated.size); }
  const others = new Set(earlier.flatMap((o) => grams(plainWords(o.body), 10)));
  if (grams(plainWords(article.body), 10).filter((g) => others.has(g)).length > 3) { problems.push('copies passages of another article of this edition: write your own text, on your own subject'); score += 6; }
  if (/[぀-ヿ㐀-鿿가-힯Ѐ-ӿ]/.test(`${article.headline}${article.dek}${article.body}`)) { problems.push('contains words in another alphabet: write everything in French'); score += 3; }
  return { problems, score };
}

// La Transversale, écrite à part avant l'édition : 3 ou 4 articles selon le plan (une longue lecture, des formats moyens
// et des brèves), chacun dans la voix de sa plume.
// Les articles de l'édition de La Transversale, décidés par le code avant toute requête (auteur, genre, sujet,
// format) : l'édition (blog, Kop, mails) les connaît ainsi pendant qu'ils s'écrivent.
function transversaleOutline({ state, snapshot, rawChanges, kind, world = null }) {
  const desk = transversaleDesk(state);
  const press = pressMoments(snapshot, rawChanges);
  const stories = competitionStories(snapshot);
  const n = state.editions.length;
  const stories2 = worldStories(world);
  const angles = { tour: tourAngle(snapshot, press, stories), story: longViewAngle(stories, n), debate: debateAngle(stories, n, snapshot.club?.name), big: bigEdition(snapshot, rawChanges, press), world: stories2.length || world?.awards?.player_of_the_year ? { stories: stories2, debate: worldDebate(world, n), awards: world.awards || null } : null };
  return { desk, press, plan: transversalePlan(desk, press, kind, n, angles) };
}

// Une édition qui compte (un quatrième article) : son but ou sa passe, une note de 7,5 ou plus, homme du match, trois buts
// d'écart, un match de coupe ; avant un match, un match de coupe.
function bigEdition(snapshot, rawChanges, press) {
  const ref = snapshot.club?.ref;
  const f = (rawChanges?.newResults || []).filter((m) => m.homeRef === ref || m.awayRef === ref).slice(-1)[0];
  const league = snapshot.league?.name;
  if (!f) return Boolean(press?.before && league && press.before.competition !== league);
  const me = f.me || {};
  const margin = Math.abs((f.score?.[0] ?? 0) - (f.score?.[1] ?? 0));
  return (me.goals || 0) + (me.assists || 0) > 0 || (me.rating || 0) >= 7.5 || (Boolean(f.motm?.name) && f.motm.name === snapshot.player?.name) || margin >= 3 || Boolean(league && f.competition && f.competition !== league);
}

// Les clubs de chaque grande compétition du résumé mondial, pour la relecture des articles du monde.
function worldTeams(w) {
  const out = {};
  for (const c of w?.competitions || []) out[c.competition] = [...new Set([...(c.results || []).flatMap((r) => [r.home, r.away]), ...(c.table_top || []).map((r) => r.team)])];
  return out;
}

async function writeTransversale({ state, settings, apiKey, facts, changes, rawChanges, snapshot, kind, outline = transversaleOutline({ state, snapshot, rawChanges, kind }), onProgress, log = () => {}, clock = null }) {
  const { desk, press, plan } = outline;
  const m = memoryFor(state);
  const memory = {
    writers: { national_columnist: state.writers.national_columnist, local_beat_writer: state.writers.local_beat_writer || null },
    storylines: m.storylines,
    recent_headlines: state.editions.slice(-3).flatMap((e) => e.national.map((a) => ({ date: e.gameDate, author: a.author, kind: a.kind || null, headline: a.headline }))),
    user_posts: m.user_posts,
    user_on_record: m.user_on_record,
    open_promises: m.open_promises,
    my_life: m.my_life,
  };
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.transversaleSystem(settings),
    user: prompts.transversaleUser({ facts, changes, memory, desk: desk.filter((w) => plan.some((p) => p.author === w.name)), plan, press, settings: withTone(settings, state), kind }),
    maxTokens: 24000,
    onProgress,
  }));
  clock?.lap('La Transversale : rédaction');
  // Le plan fait foi pour l'auteur et le genre, dans l'ordre ; un article de trop ou vide est écarté.
  const list = (Array.isArray(out.national) ? out.national : []).filter((a) => a && a.headline && a.body).slice(0, plan.length).map((a, i) => ({
    headline: String(a.headline), dek: String(a.dek || ''), author: plan[i].author, kind: plan[i].kind, size: plan[i].size, focus: plan[i].focus, ...(plan[i].competition ? { competition: plan[i].competition } : {}), ...(plan[i].teams ? { teams: plan[i].teams } : {}), body: String(a.body),
  }));
  if (!list.length) throw new Error('aucun article');
  list.forEach(tidyArticle);
  list.forEach((a) => fixArticle(a, settings.language)); // « buveurs », « premier équipe », « 6.5 »

  // Relecture : les articles fautifs sont retravaillés ensemble, en une seule requête (il y en avait une par article :
  // jusqu'à 3 requêtes de moins par synchro pour le quota gratuit) ; chaque nouvelle version n'est gardée que si elle a
  // moins de défauts et n'est pas plus courte. Les passages qui enfreignent les règles du journal (src/world/paperRules.js)
  // sont corrigés par la vérification des faits, qui tourne de toute façon : ils ne déclenchent la reprise que si elle
  // est coupée ; un article qui part déjà en reprise les emporte avec lui.
  const next = snapshot.next;
  const opts = { nextOpponent: next ? (next.homeRef === snapshot.club.ref ? next.away : next.home) : null, coverage: { ...coverageOf(snapshot), world: worldTeams(facts.world_football), worldTotw: worldTotw(facts.world_football), lineup: (facts.last_match?.clubLineup || []).map((l) => l.name).filter(Boolean) } };
  const factChecked = settings.factCheck !== false;
  const judge = (a, i) => { const base = articleProblems(a, list.slice(0, i), opts); const flags = ruleFlags(a); return { base, flags, score: base.score + flags.length }; };
  const checks = list.map((a, i) => ({ i, ...judge(a, i) })).filter((c) => c.base.problems.length || (!factChecked && c.flags.length))
    .map((c) => ({ ...c, problems: [...c.base.problems, ...(c.flags.length ? [flagsProblem(c.flags)] : [])] }));
  if (!checks.length) return list;
  log(`La Transversale : ${checks.length} article${checks.length > 1 ? 's' : ''} à retravailler (${checks.map((c) => list[c.i].author.split(' ')[0]).join(', ')})…`);
  try {
    const r = parseJson(await complete(settings, apiKey, {
      system: prompts.transversaleRepairSystem(settings),
      user: prompts.transversaleRepairUser({ facts, items: checks.map((c) => ({ id: c.i, writer: desk.find((w) => w.name === list[c.i].author), subject: plan[c.i].subject, size: plan[c.i].size, lead: plan[c.i].lead, article: list[c.i], problems: c.problems })) }),
      maxTokens: 14000,
      onProgress,
    }));
    for (const c of checks) {
      const a = list[c.i];
      const v = (Array.isArray(r.articles) ? r.articles : []).find((x) => x && Number(x.id) === c.i);
      if (typeof v?.body !== 'string') continue;
      const fixed = { ...a, headline: typeof v.headline === 'string' && v.headline.trim() ? v.headline : a.headline, dek: typeof v.dek === 'string' ? v.dek : a.dek, body: v.body };
      tidyArticle(fixed);
      fixArticle(fixed, settings.language);
      const after = judge(fixed, c.i);
      if (after.score < c.score && wordCount(fixed.body) >= wordCount(a.body) * 0.9) Object.assign(a, { headline: fixed.headline, dek: fixed.dek, body: fixed.body });
    }
  } catch (err) {
    log(`La Transversale : articles gardés tels quels (${err.message}).`);
  }
  clock?.lap(`La Transversale : reprise de ${checks.length} article${checks.length > 1 ? 's' : ''}`);
  return list;
}

// Vrais footballeurs et coachs (règle 29 des prompts) : ils parlent, sous leur nom collé en pseudo, certifiés ;
// l'annuaire des mentions fait foi quand il les connaît (coéquipiers, adversaire du prochain match, coachs).
function realPersonAuthor(author, directory) {
  const entry = directory.find((e) => (e.kind === 'player' || e.kind === 'coach') && (e.handle.toLowerCase() === author.handle.toLowerCase() || e.name === author.name));
  if (entry) return Object.assign(author, { handle: entry.handle, name: entry.name, type: entry.kind, verified: true });
  // Un « joueur » ou « coach » absent des effectifs connus n'est pas une vraie personne qu'on peut certifier
  // (@Lotte, supportrice inventée, publiée en joueuse certifiée) : c'est un supporter comme les autres.
  if (author.type === 'player' || author.type === 'coach') { delete author.verified; return Object.assign(author, { type: 'fan' }); }
  return author;
}

// Noms des autres joueurs : base du jeu, utilisée seulement si elle correspond à la sauvegarde.
const MIN_MATCH_RATE = 0.3;
// Dossier du jeu de cette carrière : celui des réglages, sinon, parmi les installations trouvées (PES 2021,
// Football Life…), celle dont la base de joueurs correspond le mieux à la sauvegarde (calculé une fois par sauvegarde).
const gameDirCache = new Map();
function gameDirFor(career, settings) {
  if (settings.gameDir) return settings.gameDir;
  const dirs = detectGameFolders();
  if (dirs.length <= 1) return dirs[0] || null;
  const key = `${settings.savePath}|${dirs.join('|')}`;
  if (!gameDirCache.has(key)) {
    let best = dirs[0], bestRate = -1;
    for (const d of dirs) {
      let rate = 0;
      try { const db = loadGameDb(d); rate = db ? matchRate(career, db) : 0; } catch { rate = 0; }
      if (rate > bestRate) { best = d; bestRate = rate; }
    }
    gameDirCache.set(key, best);
  }
  return gameDirCache.get(key);
}

function playerNames(career, settings, log) {
  const gameDir = gameDirFor(career, settings);
  if (!gameDir) {
    log('Noms des joueurs : dossier du jeu introuvable (à indiquer dans les réglages). Les autres joueurs restent anonymes.');
    return null;
  }
  let db = null;
  try { db = loadGameDb(gameDir); } catch (err) { log(`Noms des joueurs : base du jeu illisible (${err.message}).`); return null; }
  if (!db) {
    log('Noms des joueurs : aucune base de joueurs trouvée dans le dossier du jeu.');
    return null;
  }
  const rate = matchRate(career, db);
  if (rate < MIN_MATCH_RATE) {
    log(`Noms des joueurs : la base du jeu (${db.source}) ne correspond pas à cette sauvegarde (${Math.round(rate * 100)} % des joueurs reconnus). Installe le patch de cette carrière (ex. Football Life) pour avoir les noms ; en attendant, les autres joueurs restent anonymes.`);
    return null;
  }
  log(`Noms des joueurs : ${db.names.size.toLocaleString('fr-FR')} joueurs (${path.basename(gameDir)} · ${db.source}), ${Math.round(rate * 100)} % des joueurs de la sauvegarde reconnus.`);
  return db.names;
}

async function sync({ store, settings, log, progress }) {
  const steps = [['Lecture de la sauvegarde', 0], ['Rédaction de l’édition', 16000]];
  if (settings.factCheck !== false) steps.push(['Vérification des faits', 1200]);
  if (settings.tribuneThreads !== false) steps.push(['Discussions sur Kop', 2500]);
  const t = tracker(progress, 'Synchronisation', steps);
  let ok = false;
  try {
    const state = await syncInner({ store, settings, log, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

// La sauvegarde suivie, avec un message clair quand le fichier n'est plus là ou que le jeu est en train de l'écrire
// (au lieu de « ENOENT » ou « EBUSY » de Windows).
function readSave(savePath) {
  if (!fs.existsSync(savePath)) throw Object.assign(new Error(`Sauvegarde introuvable : ${savePath}`), { code: 'ENOENT' });
  try {
    return readCareer(savePath);
  } catch (err) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw Object.assign(new Error('La sauvegarde est occupée : le jeu est en train de l’écrire.'), { code: err.code });
    throw err;
  }
}

// La sauvegarde choisie est-elle une carrière encore jamais synchronisée ? Rend qui elle est, sinon null (sauvegarde
// illisible : la synchro le dira avec son message).
function newCareerInfo({ store, settings }) {
  if (!settings.savePath) return null;
  let career;
  try { career = readSave(settings.savePath); } catch { return null; }
  if (store.loadCareer(careerIdOf(career))) return null;
  return { player: career.player.name, club: career.club?.name || null };
}

async function syncInner({ store, settings, log, t }) {
  t.step(0);
  const clock = stopwatch();
  const hud = t.ai;
  t.ai = (p) => { if (p?.model) clock.seen(p.model); hud(p); };
  if (!settings.savePath) throw new Error('Choisis ta sauvegarde BL00000000 dans les réglages.');
  log('Lecture et déchiffrement de la sauvegarde…');
  const career = readSave(settings.savePath);
  const names = playerNames(career, settings, log);
  const snapshot = buildSnapshot(career, names);
  const nameOf = (id) => (id === career.player.id ? career.player.name : (names?.has(id) ? prettyName(names.get(id)) : null));
  log(`${snapshot.player.name} · ${snapshot.club.name} · ${snapshot.league.name || '?'} · ${snapshot.gameDate}`);

  const careerId = careerIdOf(snapshot);
  const state = store.loadCareer(careerId) || newCareerState(snapshot);
  store.setActiveCareer(careerId);
  // Biographie écrite dans la fenêtre de configuration, avant que la carrière existe : elle nourrit sa première édition.
  if (!state.snapshot && settings.pendingBio?.savePath === settings.savePath) setBio(state, settings.pendingBio.text, settings.pendingBio.kind);
  migrateClubAccounts(state);
  migrateCompetitionAccounts(state);
  migratePageNames(state);
  migrateAccountIdentities(state, () => { try { fs.copyFileSync(store.careerFile(careerId), store.careerFile(careerId).replace(/state\.json$/, `state.avant-identites-v${IDENTITY_REV}.json`)); } catch { /* nouvelle carrière */ } });
  migratePaperName(state, () => { try { fs.copyFileSync(store.careerFile(careerId), store.careerFile(careerId).replace(/state\.json$/, 'state.avant-transversale.json')); } catch { /* nouvelle carrière */ } });
  flagLocalPaperRename(state);
  // Nom affiché resté identique au nom du jeu (ex. ancien « M. DEPAY ») : on suit la nouvelle mise en forme.
  if (state.profile.displayName.toUpperCase() === snapshot.player.name.toUpperCase()) state.profile.displayName = snapshot.player.name;

  const changes = diffSnapshots(state.snapshot, snapshot);
  // Mise à l'écart écrite par LifeLegend (src/world/conduct.js) : ces jours d'indisponibilité ne sont pas une blessure.
  if (sanctionActive(state, snapshot.gameDate) || endedRecently(state, snapshot.gameDate)) { changes.injury = null; changes.recovered = false; }
  // Le jeu n'efface pas tout de suite le journal du match précédent : on archive chaque chronologie.
  state.timelines ||= {};
  if (snapshot.lastTimeline) state.timelines[snapshot.lastTimeline.matchId] = snapshot.lastTimeline.goals;
  // Chronologie archivée du match (même date et mêmes équipes : l'ancien identifiant reste valable).
  const timelineOf = (id) => state.timelines[id] || Object.entries(state.timelines).find(([k]) => sameMatch(k, id))?.[1];
  for (const f of snapshot.fixtures) if (!f.goalTimeline && timelineOf(f.id)) f.goalTimeline = timelineOf(f.id);
  for (const r of changes.newResults) if (!r.goalTimeline && timelineOf(r.id)) r.goalTimeline = timelineOf(r.id);
  // Moment où Kop apprend le résultat de son match du jour : les posts d'avant sont datés avant le coup d'envoi,
  // ceux d'après, après le coup de sifflet final (horloge des posts de l'interface).
  const today = changes.newResults.filter((r) => r.date === snapshot.gameDate);
  if (today.length) state.resultSeen = Object.fromEntries(Object.entries({ ...state.resultSeen, [snapshot.gameDate]: Date.now() }).slice(-40));
  state.snapshot = snapshot;
  const seasonsBefore = Object.values(state.seasons || {}).map((s) => ({ club: s.club, stats: { ...s.stats } }));
  const seasonNews = archiveSeason(state, snapshot);
  noteSeasonStart(state, snapshot);
  // Bilan de saison : le championnat vient de se terminer.
  let seasonReview = null;
  if (changes.seasonComplete) {
    seasonReview = buildSeasonReview(state, snapshot);
    state.seasonReviews = { ...(state.seasonReviews || {}), [snapshot.season]: { ...seasonReview, publishedOn: snapshot.gameDate } };
    log(`Fin de saison : ${snapshot.club.name} termine ${seasonReview.final_table.position}e. Rédaction du bilan…`);
  }
  // Panthéon : un chapitre de sa biographie seulement si la carrière a un événement (premier match ou premier but au
  // club, transfert, prolongation, trophée, palier, fin de saison ; ses débuts pour la toute première page).
  const chapterEvents = pantheonEvents({ state, before: seasonsBefore, snapshot, changes, seasonNews, seasonReview });
  // Récompenses de son championnat sur les notes du jeu : l'équipe type de la journée (s'il y est), les trophées de la
  // saison finie ; les comptes officiels les publient, l'édition et le Panthéon les racontent.
  const awards = snapshot.league?.id != null
    ? awardsNews(state, { matches: competitionMatches(career.matches, snapshot.league.id), season: snapshot.season, competition: snapshot.league.name, playerId: career.player.id, nameOf })
    : { round: null, season: null };
  if (awards.round) log(`Récompenses : ${awards.round.player_of_the_round ? 'joueur' : 'dans l’équipe type'} de la ${awards.round.round}e journée.`);
  if (awards.season?.won.length) {
    log(`Récompenses de la saison : ${awards.season.won.join(', ')}.`);
    chapterEvents.push({ kind: 'season_awards', competition: awards.season.competition, awards: awards.season.won });
  }
  // Nouveau club, nouveau journal local (et son journaliste) ; le chroniqueur national reste.
  // Les anciens journaux n'ont pas de club noté : celui du premier club suivi par LifeLegend.
  if (state.localPaper) {
    const firstClub = Object.values(state.seasons || {}).sort((a, b) => String(a.season).localeCompare(String(b.season)))[0]?.club;
    const paperClub = state.localPaper.clubRef ?? (firstClub && firstClub !== snapshot.club.name ? -1 : snapshot.club.ref);
    if (paperClub !== snapshot.club.ref) {
      state.pastPapers = [...(state.pastPapers || []), { ...state.localPaper, beatWriter: state.writers?.local_beat_writer || null, until: snapshot.gameDate }];
      state.localPaper = null;
      if (state.writers) delete state.writers.local_beat_writer;
      log(`Nouveau club : ${snapshot.club.name} aura son propre journal local.`);
    } else {
      state.localPaper.clubRef = snapshot.club.ref;
    }
  }
  // L'agent : estimations d'intérêt des clubs et de prolongation, recalculées à chaque synchro.
  const agent = ensureAgent(state);
  if (changes.contractSigned) agent.signed = { ...changes.contractSigned, on: snapshot.gameDate };
  if (changes.transfer) agent.movedOn = snapshot.gameDate; // arrivée dans un nouveau club : pas d'offre jusqu'au mercato suivant
  agent.market = computeMarket(career, snapshot, state);
  agent.view = applyStance(agent.market, agent.stance, agent.reported);
  // Pas de courrier à la toute première édition : le premier rapport de l'agent attend la suivante.
  // Demande de transfert faite dans le jeu (déclarée dans LifeLegend) : réussie, échouée à la fermeture du mercato, ou dépassée.
  if (agent.request && !changes.firstSync) {
    const req = agent.request;
    const outcome = snapshot.club.ref === req.ref ? 'success'
      : changes.transfer ? 'elsewhere'
        : changes.window?.event === 'close' && req.on <= changes.window.close ? 'failed' : null;
    if (outcome) {
      changes.transferRequest = { club: req.club, since: req.on, outcome };
      agent.lastRequest = { club: req.club, outcome, on: snapshot.gameDate };
      agent.request = null;
      log(`Demande de transfert à ${req.club} : ${{ success: 'acceptée, transfert réalisé', elsewhere: 'dépassée, tu as signé ailleurs', failed: 'sans suite, le mercato est fermé' }[outcome]}.`);
    }
  }
  const windowMoment = changes.window && changes.window.event !== 'close' ? changes.window.event : null;
  if (changes.plannedMove) agent.plannedMove = { ...changes.plannedMove, on: snapshot.gameDate };
  if (agent.plannedMove && changes.transfer) agent.plannedMove = null; // le transfert a eu lieu
  const agentDue = !changes.firstSync && (Boolean(changes.contractSigned) || Boolean(windowMoment) || Boolean(changes.transferRequest) || Boolean(changes.plannedMove) || Boolean(changes.seasonComplete) || reportDue(agent, agent.view));
  // Promesses jugées sur la sauvegarde : tenues, non tenues, annulées (il n'a pas joué) ou expirées.
  const settled = resolvePromises(state, snapshot, settings.language);
  // Humeur des supporters : recalculée quand il y a de nouveaux matchs ou une promesse jugée, sinon gardée.
  if (changes.newResults.length || settled.some((p) => p.status === 'broken')) state.fanMood = fanMood({ changes, snapshot, settled, previous: state.fanMood });
  // Pression médiatique et enjeu du moment (taille du club, Europe, course au titre, maintien, coupe, mercato, crise).
  state.tone = toneContext({ snapshot, state });
  for (const p of settled) {
    log(`Promesse « ${p.label} » : ${{ kept: 'tenue ✅', broken: 'non tenue ❌', void: 'annulée (il n’a pas joué)', expired: 'expirée' }[p.status]}.`);
    const post = p.postId && state.feed.find((x) => x.id === p.postId);
    const market = 0.6 + toneOf(state).market / 100;
    if (p.status === 'kept') {
      const before = state.profile.followers;
      state.profile.followers = Math.round(state.profile.followers * (1 + 0.03 * market));
      noteFollowers(state, before, 'promise');
      if (post) post.likes = Math.round(post.likes * 1.6 + 200);
    } else if (p.status === 'broken') {
      // Le ratio : le post s'effondre pendant que les moqueries qui le citent cartonnent.
      state.profile.followers = Math.round(state.profile.followers * (1 - 0.01 * market));
      if (post) post.ratio = true;
    }
  }
  // Mercato : effectifs de tous les clubs comparés à ceux de la synchro précédente.
  const clubs = clubMap(career);
  const previousClubs = store.loadAux(careerId, 'clubs');
  const transfers = detectTransfers(previousClubs, clubs, career, { clubRef: snapshot.club.ref, leagueId: snapshot.league.id, nameOf, gameDate: snapshot.gameDate });
  state.transfers = [...(state.transfers || []), ...transfers].slice(-300);
  // Influence : jauge, formation du club, et sort des décisions (mercato ouvert, écrites, gardées par le jeu ou non).
  const myFormation = career.teams.get(snapshot.club.ref)?.formation;
  const influenceNews = syncInfluence(state, snapshot, { formation: myFormation ? describeFormation(myFormation) : null, clubs, previousClubs });
  if (influenceNews.length) log(`Influence : ${influenceNews.map((n) => n.kind).join(', ')}.`);
  // Progression des capacités du joueur, gardée pour Scoreline.
  if (changes.progress.length) {
    state.progressLog = [...(state.progressLog || []), ...changes.progress.map((p) => ({ ...p, gameDate: snapshot.gameDate }))].slice(-200);
    log(`Progression : ${changes.progress.map((p) => `${p.ability} ${p.from} → ${p.to}`).join(', ')}.`);
  }
  // Gestes appris à l'entraînement, gardés pour la fiche (le jeu ne dit pas quand ils l'ont été).
  if (changes.skillLearned) {
    state.skillsLearned = [...(state.skillsLearned || []), { ...changes.skillLearned, gameDate: snapshot.gameDate }].slice(-50);
    log(`Entraînement : geste appris (${changes.skillLearned.name || `code ${changes.skillLearned.code}`}).`);
  }
  if (changes.injury) log(`Blessure : indisponible environ ${changes.injury.days} jours.`);
  if (changes.callUp) log(`Sélection : convoqué avec ${changes.callUp.team} !`);
  if (changes.droppedFromSquad) log(`Sélection : pas retenu cette fois avec ${changes.droppedFromSquad.team}.`);
  if (changes.ntResults.length) log(`Sélection : ${changes.ntResults.length} nouveau(x) match(s) international(aux).`);
  const mercatoNews = transfers.some((x) => x.involvesMyClub);
  if (transfers.length) log(`Mercato : ${transfers.length} transfert(s) repéré(s)${mercatoNews ? ', dont ton club' : ''}.`);
  // Comptes officiels des compétitions : résultats, classement et buteurs des matchs joués depuis la dernière synchro
  // (la première fois, la dernière semaine seulement). Posts faits par l'app, sans IA.
  state.competitionAccounts = competitionAccountsFacts(career, snapshot);
  const officialNow = []; // posts officiels de cette synchro : les supporters y réagiront dans l'édition
  // Les supporters ne réagissent qu'aux posts officiels qu'il voit dans « Pour toi » : ceux de son club, de ses
  // compétitions (importance 85 et plus) et des comptes qu'il suit, pas aux programmes des championnats étrangers.
  const follows = new Set(Object.keys(state.follows || {}).map((h) => h.toLowerCase()));
  const seenByHim = (p) => p.importance >= 85 || follows.has(String(p.author.handle).toLowerCase());
  // Compte officiel de son club (score final, ses buts, recrues, prolongation) et clubs qui recrutent : faits par l'app.
  const fromClubs = clubPosts({ snapshot, changes, transfers, handle: state.profile.handle, language: settings.language });
  fromClubs.reverse().forEach((p, i) => {
    const likes = postLikes(p.author, state, p.weight);
    const item = { id: newId(), author: p.author, text: p.text, gameDate: snapshot.gameDate, createdAt: Date.now() - 50 + i, replies: [], likes, reposts: repostsFor(likes), official: true };
    state.feed.push(item);
    officialNow.push({ item, importance: p.importance });
  });
  if (fromClubs.length) log(`Kop : ${fromClubs.length} post(s) des comptes officiels des clubs.`);
  const compFrom = state.compPostsUpTo || daysBefore(snapshot.gameDate, 7);
  if (snapshot.gameDate > compFrom) {
    // Publiés du moins important au plus important : le plus important finit en haut du fil.
    const official = competitionPosts({ career, snapshot, from: compFrom, nameOf, language: settings.language }).reverse();
    const t0 = Date.now();
    official.forEach((p, i) => {
      const likes = postLikes(p.author, state, p.importance >= 90 ? 1.2 : p.importance >= 60 ? 0.8 : 0.5);
      const item = { id: newId(), author: p.author, text: p.text, gameDate: snapshot.gameDate, createdAt: t0 + i, replies: [], likes, reposts: repostsFor(likes), official: true };
      state.feed.push(item);
      if (seenByHim(p)) officialNow.push({ item, importance: p.importance });
    });
    if (official.length) log(`Kop : ${official.length} post(s) des comptes officiels des compétitions.`);
  }
  state.compPostsUpTo = snapshot.gameDate;
  // Avant-match des 3 prochains jours (journées, affiches, son « jour de match »), une seule fois chacun.
  const previews = previewPosts({ career, snapshot, done: new Set(state.compPreviewed || []), language: settings.language }).reverse();
  const t1 = Date.now() + 100;
  previews.forEach((p, i) => {
    const likes = postLikes(p.author, state, p.importance >= 90 ? 0.8 : 0.4);
    const item = { id: newId(), author: p.author, text: p.text, gameDate: snapshot.gameDate, createdAt: t1 + i, replies: [], likes, reposts: repostsFor(likes), official: true };
    state.feed.push(item);
    if (seenByHim(p)) officialNow.push({ item, importance: p.importance + 1 }); // les avant-matchs d'abord : on y fait ses pronostics
  });
  if (previews.length) {
    state.compPreviewed = [...(state.compPreviewed || []), ...previews.map((p) => p.key)].slice(-300);
    log(`Kop : ${previews.length} avant-match(s) des compétitions.`);
  }
  // Scores de tout le monde du jeu, calculés une seule fois : pour Scoreline (écrits avec le reste) et pour « le foot
  // ailleurs » de La Transversale.
  let scoresData;
  const scoresNow = () => { if (scoresData === undefined) scoresData = buildScores(career, { nameOf, clubRef: snapshot.club.ref, leagueId: snapshot.league.id, playerId: career.player.id, today: snapshot.gameDate }); return scoresData; };
  const saveAll = () => {
    try { refreshEmblems({ state, career, settings, store }); } catch (err) { log(`Écussons : lecture impossible (${err.message}).`); }
    recordNotoriety(state, snapshot); // abonnés, valeur, image dans la presse du jour (courbes de Scoreline)
    store.saveCareer(state);
    if (settings.pendingBio) store.saveSettings({ pendingBio: null });
    store.saveAux(careerId, 'clubs', clubs);
    // Page Influence : formations de la base du jeu, effectif et temps de jeu, standing des clubs, joueurs des clubs.
    try {
      const gameDir = gameDirFor(career, settings);
      const formations = gameDir ? formationOptions(loadTemplates(gameDir)) : [];
      const positions = names && gameDir ? loadGameDb(gameDir)?.positions || null : null;
      store.saveAux(careerId, 'influence', buildAux(career, snapshot, { nameOf, clubs, prestige: clubPrestige(career, snapshot.league.id), formations, positions }));
    } catch (err) { log(`Influence : données de la page impossibles à préparer (${err.message}).`); }
    // Scores de tout le monde du jeu pour Scoreline : fichier à part, refait à chaque synchro.
    try { store.saveAux(careerId, 'scores', scoresNow()); } catch (err) { log(`Scoreline : scores du monde du jeu impossibles à préparer (${err.message}).`); }
  };
  // Ralentis et vidéos du joueur, rattachés aux matchs avant que les rédacteurs s'y mettent.
  if (processMedia(state, settings)) log('Ralentis et vidéos : nouveautés publiées sur Kop.');
  // Conseil du coach à l'entraînement (src/world/coachAdvice.js) : tranché et donné sans IA, à chaque synchro.
  const advice = changes.firstSync ? { mail: null, outcome: null } : coachAdvice(state, snapshot, { language: settings.language, newId });
  // Messages privés de Kop (src/world/dms.js) : après un match, un coéquipier ou un supporter écrit, sans IA.
  const inboundDm = dmInbound(state, snapshot, changes, { language: settings.language, newId });
  if (inboundDm) log(`Kop : ${inboundDm.name} t’a envoyé un message privé.`);
  // Vestiaire (src/world/huddle.js) : le groupe de son club, tenu à jour à chaque synchro, sans IA.
  const huddle = syncHuddle(state, snapshot, { language: settings.language, newId });
  // Relation avec le club (src/world/conduct.js) : ses écarts accumulés déclenchent le palier suivant, sans IA.
  const conductNews = changes.firstSync ? { change: null, mail: null } : conductAtSync(state, snapshot, { language: settings.language, newId, director: directorOf(snapshot.club.ref) });
  if (conductNews.mail) {
    state.mail.push(conductNews.mail);
    log(conductNews.change.kind === 'warning' ? `Mails : ${conductNews.mail.from} te rappelle à l’ordre.` : 'Mails : le club t’écarte du groupe (décision disciplinaire).');
  }
  // Objectifs personnels (src/world/objectives.js) : fixés par le coach, suivis, bilan ; sans IA.
  const goals = objectivesAtSync(state, snapshot, changes, { language: settings.language, newId, returning: Boolean(changes.recovered) });
  for (const m of goals.mails) { state.mail.push(m); log(`Mails : ${m.from} — ${m.subject}.`); }
  if (advice.mail) {
    state.mail.push(advice.mail);
    log(`Mails : ${advice.mail.from} te donne un conseil d’entraînement.`);
  }
  // Contrat d'équipementier (src/world/sponsors.js) : les marques écrivent sans IA, une offre à la fois. Rien de tout ça ne doit gêner la synchro.
  try {
    const bootDir = gameDirFor(career, settings);
    const sponsor = changes.firstSync ? { mail: null, offer: null } : sponsorTick(state, snapshot, { language: settings.language, newId, catalog: boots.bootCatalog(bootDir) });
    if (sponsor.mail) {
      Object.assign(sponsor.offer, boots.ensureBootImages({ gameDir: bootDir, id: sponsor.offer.bootId, outDir: path.join(store.dir, 'careers', state.careerId, 'boots') }));
      state.mail.push(sponsor.mail);
      log(`Mails : ${sponsor.offer.brand} te propose un contrat d’équipementier.`);
    }
  } catch (err) { log(`Équipementier : ${err.message}`); }
  if (!hasNews(changes) && !mercatoNews) {
    state.lastSync = { published: false, gameDate: snapshot.gameDate };
    if (agentDue && (changes.newOffers.length || windowMoment)) {
      clock.lap('lecture de la sauvegarde');
      await writeAgentMail({ store, state, snapshot, settings, log, t, occasion: changes.newOffers.length ? 'offer' : windowMoment });
      clock.lap('mail de l’agent');
      state.lastSync.agentMail = true;
      saveAll();
      clock.lap('enregistrement');
      state.lastSync.durations = clock.summary();
      log(`Durées : ${state.lastSync.durations}.`);
      log('Pas de match depuis la dernière synchro : pas de nouvelle édition, seul ton agent t’a écrit.');
      return state;
    }
    saveAll();
    if (changes.dateAdvanced) {
      log(`La date a avancé (${snapshot.gameDate}) sans nouveau match : Scoreline est à jour, pas de nouvelle édition (aucune requête envoyée à l’IA).`);
      log('La prochaine édition sortira le jour du prochain match, puis après le match.');
    } else {
      log('Ta sauvegarde n’a pas changé depuis la dernière synchro : pas de nouvelle édition (et aucune requête envoyée à l’IA).');
      log('Joue ou simule un match, sauvegarde dans le jeu, puis resynchronise.');
    }
    return state;
  }
  log(changes.newResults.length ? `${changes.newResults.length} nouveau(x) résultat(s). Rédaction de l’édition…`
    : changes.matchday ? 'Jour de match. Rédaction de l’édition d’avant-match…'
      : mercatoNews ? 'Mercato. Rédaction de l’édition spéciale transferts…'
        : 'Rédaction de l’édition…');
  clock.lap('lecture de la sauvegarde');

  const apiKey = store.getKey(settings.provider);
  const facts = factsFor(snapshot, state.profile, state);
  // Les offres reçues restent privées : seul l'agent les connaît (FACTS.agent.offers_received).
  // La prolongation est publique (annonce du club), son salaire ne l'est pas.
  const signed = changes.contractSigned && { club: changes.contractSigned.club, until: changes.contractSigned.until, previous_until: changes.contractSigned.previousUntil };
  // Rumeurs mercato tranchées par cette synchro (il a signé dans le club, ou le mercato a fermé sans ce transfert).
  const rumorOutcomes = settleRumors(state, { changes, gameDate: snapshot.gameDate });
  // Rumeur de sélection : racontée une seule fois par match de sa sélection (les synchros suivantes ne la redisent pas).
  let ntRumor = null;
  if (changes.ntRumor && !(state.ntRumors || []).includes(changes.ntRumor.fixture)) {
    ntRumor = changes.ntRumor;
    state.ntRumors = [...(state.ntRumors || []), ntRumor.fixture].slice(-40);
  }
  const aiChanges = { ...changes, newOffers: undefined, contractSigned: undefined, contract_signed: signed || undefined,
    season_review: seasonReview || undefined,
    skillLearned: changes.skillLearned ? { skill: skillForAi(changes.skillLearned.code) || UNKNOWN_SKILL } : undefined,
    plannedMove: changes.plannedMove ? { club: changes.plannedMove.club, contract_until: changes.plannedMove.contractUntil, effective_from: changes.plannedMove.effective, during_window: changes.plannedMove.immediate || undefined } : undefined, newResults: changes.newResults.map(strip), ntResults: changes.ntResults.map(strip), milestones: seasonNews.milestones, new_trophies: seasonNews.trophies, new_transfers: transfers.slice(0, 15),
    window_transfers: changes.window?.event === 'close'
      ? (state.transfers || []).filter((x) => x.gameDate >= changes.window.open && x.gameDate <= snapshot.gameDate).slice(-30)
      : undefined,
    agent_report_due: agentDue,
    conduct: conductNews.change || undefined,
    objectives: goals.news ? { ...goals.news, note: 'private between the player and his coach' } : undefined,
    rumor_outcomes: rumorOutcomes.length ? rumorOutcomes : undefined,
    sponsor_news: state.sponsor?.news ? { ...state.sponsor.news, note: 'an equipment (boots) deal of the player: mention it only if it fits, without inventing figures' } : undefined,
    coach_advice: advice.outcome ? { ...advice.outcome, note: 'the coach privately asked him to work on this part of his game; followed says whether his training plan really changed in the save. The coach and teammates may refer to it; the press only hints at it' } : undefined,
    // Sélection : la liste annoncée (avec ou sans lui) et la rumeur avant une liste où il n'est pas encore.
    ntList: changes.ntList ? { ...changes.ntList, players: changes.ntList.players.slice(0, 30), note: changes.ntList.me ? 'he is in this squad' : 'he is not in this squad: the press and Kop react to the choice of the coach' } : undefined,
    ntRumor: ntRumor ? { team: ntRumor.team, next: ntRumor.next, note: 'his national team plays soon and he is not in the current squad: the press and Kop insiders wonder whether he will be called up; nothing is confirmed' } : undefined,
    pantheon_events: chapterEvents.length ? chapterEvents : undefined,
    team_of_the_round: awards.round || undefined,
    season_awards: awards.season || undefined,
    influence_news: state.influence?.news?.length ? state.influence.news : undefined,
    resolved_promises: settled.map((p) => ({ post_id: p.postId, text: p.text, promise: p.label, outcome: p.status, detail: p.detail, source: p.source })),
    // Posts des comptes officiels des compétitions publiés à l'instant (les plus importants) : les supporters y répondent.
    official_posts: officialNow.filter((o) => o.importance >= 55).sort((a, b) => b.importance - a.importance).slice(0, 4)
      .map(({ item }) => ({ post_id: item.id, account: `@${item.author.handle}`, competition: item.author.name, text: item.text })) };
  if (seasonNews.trophies.length) log(`Trophée : ${seasonNews.trophies.map((t) => t.competition).join(', ')} !`);
  if (seasonNews.milestones.length) log(`Palier : ${seasonNews.milestones.join(', ')}.`);
  // La Transversale (rédaction, longueurs variées, conférences de presse) et l'édition (blog, Kop, mails) s'écrivent en
  // même temps, chacune dans sa requête : l'édition connaît les articles du jour par leur plan (auteur, genre, sujet),
  // décidé par le code. Si La Transversale échoue, elle est retentée une fois ; à défaut, l'édition paraît sans elle.
  const kind = editionKind(changes, mercatoNews, Boolean(state.bio?.text));
  let world = null;
  try { world = worldFootball(scoresNow(), { since: state.editions.at(-1)?.gameDate || null, today: snapshot.gameDate, seen: state.paperAwards || {}, league: snapshot.league?.name || null }); } catch (err) { log(`Le football mondial : scores illisibles (${err.message}).`); }
  const worldMarks = world?.marks;
  if (world) delete world.marks;
  const nationalFacts = { ...transversaleFacts(facts, snapshot), ...(world ? { world_football: world } : {}) };
  const outline = transversaleOutline({ state, snapshot, rawChanges: changes, kind, world });
  // Kop parle aussi du football mondial (demande d'un testeur) : un résumé court, dans la requête de l'édition, et trois
  // places dans le plan des posts. Gardé jusqu'à la synchro suivante pour les réponses à ses posts.
  const elsewhere = worldBrief(world);
  if (elsewhere) { facts.football_elsewhere = elsewhere; state.footballElsewhere = elsewhere; }
  const potmTake = world?.awards?.player_of_the_year ? "the game's player of the year (FACTS.football_elsewhere.player_of_the_year): deserved or not, who should have won? Take a side"
    : world?.awards?.player_of_the_month?.overall ? 'the player of the month (FACTS.football_elsewhere.player_of_the_month): deserved or not? Take a side' : null;
  const kopWorld = world && (worldStories(world).length || potmTake) ? { stories: worldStories(world), take: potmTake || worldDebate(world, state.editions.length)?.replace(/FACTS\.world_football/g, 'FACTS.football_elsewhere') || null } : null;
  const memory = memoryFor(state);
  memory.transversale_today = outline.plan.map(({ author, kind: genre, subject }) => ({ author, kind: genre, subject }));
  if (chapterEvents.length) memory.pantheon = chapterTitles(state);
  // Le groupe du jour (qui parle, le sujet de vestiaire, le coach) : décidé par le code, dans la même requête.
  if (huddle) memory.huddle = { ...huddleContext(huddle), ...huddleToday(huddle, { last: changes.newResults.at(-1) || null, elsewhere: Boolean(facts.football_elsewhere), edition: state.editions.length, date: snapshot.gameDate }) };
  // Le groupe de la sélection ne parle que quand sa sélection fait l'actualité.
  const ntHuddle = changes.callUp || changes.ntResults.length || changes.ntMatchday ? nationalHuddle(state, snapshot) : null;
  if (ntHuddle) memory.huddle_national = huddleContext(ntHuddle);
  // Plan des posts Kop décidé par le code : qui écrit, sur quoi, dans quel style (lui, nouvelles voix, habitués).
  // Le championnat de chaque club du monde (scores du jeu) : les nouveaux comptes prennent les prénoms de son pays.
  let clubLeague = null;
  try { clubLeague = clubLeagues(scoresNow()); } catch { /* sans scores : les prénoms du championnat du joueur */ }
  const plan = tribunePlan({ state, snapshot, changes, handle: state.profile.handle, world: kopWorld, clubLeague });
  // Rumeur mercato (src/world/rumors.js) : un créneau de plus, tenu par l'insider de son niveau de fiabilité.
  const rumor = pickRumor({ state, snapshot });
  const rumorHandle = rumor && INSIDERS[rumor.tier].handle.toLowerCase();
  if (rumor) plan.push(rumorSlot(rumor, { known: Object.keys(state.accounts || {}).some((h) => h.toLowerCase() === rumorHandle) }));
  t.step(1);
  // Une seule barre de progression pour les deux requêtes : les caractères reçus s'additionnent.
  const chars = { national: 0, edition: 0 };
  const progressOf = (track, key) => (p) => {
    if (p?.model) track.seen(p.model);
    if (p?.phase === 'writing') chars[key] = p.chars || 0;
    t.ai(p?.phase === 'writing' ? { ...p, chars: chars.national + chars.edition } : p);
  };
  const nationalTrack = clock.track(), editionTrack = clock.track();
  const writeNational = () => writeTransversale({ state, settings, apiKey, facts: nationalFacts, changes: aiChanges, rawChanges: changes, snapshot, kind, outline, onProgress: progressOf(nationalTrack, 'national'), log, clock: nationalTrack });
  const [nationalDone, editionDone] = await Promise.allSettled([
    writeNational().catch((err) => {
      nationalTrack.lap('La Transversale (échec)');
      log(`La Transversale : nouvel essai (${err.message})…`);
      return writeNational();
    }),
    complete(settings, apiKey, {
      system: prompts.editionSystem(settings, { transversale: true, pantheon: chapterEvents.length > 0, huddle: Boolean(huddle), huddleNational: Boolean(ntHuddle) }),
      user: prompts.editionUser({ facts, changes: aiChanges, memory, settings: withTone(settings, state), kind, plan }),
      maxTokens: 16000,
      log,
      onProgress: progressOf(editionTrack, 'edition'),
    }).finally(() => editionTrack.lap('édition (journal local, Kop, mails)')),
  ]);
  if (nationalDone.status === 'rejected') nationalTrack.lap('La Transversale (échec)');
  clock.together([nationalTrack, editionTrack]);
  if (editionDone.status === 'rejected') throw editionDone.reason;
  const national = nationalDone.status === 'fulfilled' ? nationalDone.value : null;
  if (national) {
    const words = national.reduce((n, a) => n + wordCount(a.body), 0);
    log(`La Transversale : ${national.length} article${national.length > 1 ? 's' : ''}, ${words} mots (${national.map((a) => `${a.author}, ${Math.max(1, Math.round(wordCount(a.body) / 220))} min`).join(' ; ')}).`);
  } else {
    log(`La Transversale n’a pas pu être écrite (${nationalDone.reason?.message}) : l’édition paraît sans elle.`);
  }
  const out = parseJson(editionDone.value);
  if (national) out.national = national;
  // Ce que le journal a annoncé (joueur du mois, équipes types) n'est plus annoncé ; les joueurs du mois restent pour sa page Récompenses.
  if (national && worldMarks) state.paperAwards = { ...worldMarks, potm: [...(state.paperAwards?.potm || []), ...(world?.awards?.player_of_the_month ? [potmSummary(world.awards.player_of_the_month)] : [])].slice(-24) };
  // Le chapitre du Panthéon passe aussi par la vérification des faits (une section comme les autres).
  out.pantheon = chapterEvents.length && out.pantheon ? [out.pantheon].flat().slice(0, 1) : undefined;
  // Les messages du groupe passent aussi par la vérification des faits.
  out.huddle = Array.isArray(out.huddle) ? out.huddle.filter((m) => m && !oddScript(m.text)) : [];
  out.huddle_national = Array.isArray(out.huddle_national) ? out.huddle_national.filter((m) => m && !oddScript(m.text)) : [];

  // Relecture par le secrétariat de rédaction avant publication.
  let factcheck = null;
  if (settings.factCheck !== false) {
    log('Vérification des faits…');
    try {
      t.step(2);
      factcheck = await factCheck(out, { settings, apiKey, facts: { ...facts, next_opponent_squad: nationalFacts.next_opponent_squad, competition_stories: nationalFacts.competition_stories, world_football: nationalFacts.world_football || null, user_on_record: state.onRecord }, changes: aiChanges, flags: (out.national || []).flatMap((a, i) => ruleFlags(a).map((f) => ({ item: `national.${i}`, ...f }))), log, onProgress: t.ai });
      const n = factcheck.corrections.length;
      log(n ? `Vérification des faits : ${n} correction${n > 1 ? 's' : ''} appliquée${n > 1 ? 's' : ''}.` : 'Vérification des faits : rien à corriger.');
    } catch (err) {
      factcheck = { checked: false, error: err.message, corrections: [] };
      log(`Vérification des faits impossible (${err.message}) : édition publiée sans relecture.`);
    }
    clock.lap('vérification des faits');
  }

  for (const a of out.national || []) fixArticle(a, settings.language);
  if (out.writers) state.writers = { ...out.writers, ...(state.writers || {}) }; // les noms déjà connus ne changent pas
  const chapter = out.pantheon && addChapter(state, out.pantheon[0], { gameDate: snapshot.gameDate, events: chapterEvents, id: newId() });
  if (chapter) log(`Panthéon : nouveau chapitre « ${chapter.title} ».`);
  if (!state.localPaper && out.local_paper) state.localPaper = { ...out.local_paper, clubRef: snapshot.club.ref };
  const now = Date.now();
  const article = (a) => ({ headline: a.headline || '', dek: a.dek || '', author: a.author || '', body: a.body || '' });
  const hasBody = (a) => String(a.body).trim().split(/\s+/).length >= 30;
  state.editions.push({
    id: newId(),
    createdAt: now,
    gameDate: snapshot.gameDate,
    round: snapshot.last?.round || null,
    // Un article sans texte (l'IA a parfois rendu « body » vide : billets du 03/11 et du 14/01) n'est pas publié.
    national: (out.national || []).map((a) => ({ ...article(a), ...(a.kind ? { kind: a.kind } : {}), ...(a.focus ? { focus: a.focus } : {}), ...(a.competition ? { competition: a.competition } : {}), ...(Array.isArray(a.teams) ? { teams: a.teams } : {}) })).filter(hasBody),
    local: (out.local || []).map(article).filter(hasBody),
    paper: state.localPaper ? { name: state.localPaper.name, city: state.localPaper.city } : null, // le journal change avec le club
    factcheck,
    // Numéro spécial de fin de saison (bandeau sur la une de La Transversale).
    ...(/^SEASON REVIEW/.test(kind) ? { special: 'season_review', season: snapshot.season } : {}),
  });
  const huddleNews = huddle ? addGroupMessages(huddle, out.huddle, snapshot.gameDate) : 0;
  if (huddleNews) log(`Vestiaire : ${huddleNews} message${huddleNews > 1 ? 's' : ''} dans le groupe.`);
  if (ntHuddle) addGroupMessages(ntHuddle, out.huddle_national, snapshot.gameDate, NATIONAL_MESSAGES);
  const people = mentionDirectory(state);
  const published = addEditionPosts(state, out, { people, gameDate: snapshot.gameDate, now, plan });
  if (rumor) noteRumorPost(state, rumor, published.find((p) => p.author.handle.toLowerCase() === rumorHandle), snapshot.gameDate);
  const followed = plan.filter((x) => published.some((p) => p.author.handle.toLowerCase() === x.handle.toLowerCase())).length;
  log(`Kop : plan suivi pour ${followed} post(s) sur ${plan.length} (${plan.filter((x) => x.new).length} nouveaux comptes prévus).`);
  // Réactions sous les posts officiels des compétitions (pronostics, chambrage, espoirs), jamais à la place
  // du joueur ni d'une compétition.
  const officialIds = new Set((aiChanges.official_posts || []).map((x) => x.post_id));
  for (const r of Array.isArray(out.official_replies) ? out.official_replies : []) {
    if (!officialIds.has(r.post_id) || !r.text) continue;
    const target = state.feed.find((p) => p.id === r.post_id);
    const author = realPersonAuthor(toAuthor(r), people);
    if (!target || target.replies.length >= 4 || isUser(state, author) || isCompetitionAuthor(state, author) || oddScript(r.text)) continue;
    if (!target.author.isMe && target.author.handle.toLowerCase() === author.handle.toLowerCase()) continue; // l'auteur ne se répond pas à lui-même
    rememberAccount(state, author, r.bio);
    target.replies.push({ id: newId(), author, text: String(r.text).slice(0, 400), likes: replyLikes(author, target.likes, state), gameDate: snapshot.gameDate });
  }
  // Discussions sous les posts (règle 30) : une requête à part, pour de vrais échanges entre comptes.
  if (settings.tribuneThreads !== false) {
    log('Discussions sur Kop…');
    try {
      t.step(settings.factCheck !== false ? 3 : 2);
      // Les posts officiels les plus suivis (résultats, programme, classement) ont aussi leurs réactions, comme sur X.
      const top = officialNow.filter((o) => o.importance >= 30).sort((a, b) => b.importance - a.importance).slice(0, 6).map((o) => o.item);
      const r = await writeDiscussions({ state, settings, apiKey, facts, fresh: [...published, ...top], people, gameDate: snapshot.gameDate, onProgress: t.ai, clubLeague });
      log(r.messages || r.quotes ? `Kop : ${r.messages} messages sous ${r.threads} posts${r.quotes ? `, ${r.quotes} citation${r.quotes > 1 ? 's' : ''}` : ''}.` : 'Kop : pas de nouvelle discussion.');
      if (r.renamed) log(`Kop : ${r.renamed} compte(s) inventé(s) par l'IA renommé(s).`);
    } catch (err) {
      log(`Discussions sur Kop impossibles (${err.message}) : l’édition est publiée sans.`);
    }
    clock.lap('discussions sur Kop');
  }
  // Pas de courrier à la toute première édition : le joueur a le temps de remplir « Ma vie ».
  if (!changes.firstSync) {
    // L'agent n'écrit que quand son point est dû, et une fois par jour de jeu (deux synchros le même jour, ou deux
    // mails de l'agent dans la même réponse de l'IA : on garde le premier).
    let agentWrote = state.mail.some((m) => m.role === 'agent' && m.messages?.[0]?.gameDate === snapshot.gameDate);
    for (const e of out.emails || []) {
      if (e.role === 'agent') {
        if (!agentDue || agentWrote) continue;
        agentWrote = true;
      }
      state.mail.push({ id: newId(), from: e.role === 'agent' ? agent.name : e.from, role: e.role, club: snapshot.club.name, subject: e.subject, unread: true, closed: false, messages: [{ who: 'them', body: e.body, gameDate: snapshot.gameDate }] });
    }
  }
  // « Le brief du matin » de La Transversale, si le joueur s'y est abonné sur le site du journal (composé sans IA).
  if (settings.transversaleBrief) state.mail.push(transversaleBrief(snapshot, state.editions.at(-1), settings.language));
  if (state.sponsor) state.sponsor.news = null;
  if (Array.isArray(out.storylines)) state.storylines = out.storylines.slice(0, 6);
  // Rapport de l'agent envoyé : il servira de référence pour les tendances suivantes.
  if (agentDue && (out.emails || []).some((e) => e.role === 'agent')) {
    agent.lastReportOn = snapshot.gameDate;
    agent.reported = { clubs: agent.view.clubs, extension: agent.view.extension, windowOpen: agent.view.windowOpen, offers: agent.view.offers || [] };
  }
  state.onRecord = [];
  if (state.influence) state.influence.news = []; // racontées dans cette édition
  growFollowers(state, changes);
  schedulePress(state, changes);
  state.snapshot = snapshot;
  state.lastSync = { published: true, gameDate: snapshot.gameDate };
  // On garde l'historique raisonnable.
  state.feed = state.feed.slice(-400);
  state.interactions = []; // les comptes ont pu y réagir dans cette édition
  // Journal rebaptisé (règle du journal des supporters) : partout, cette édition comprise.
  if (state.localPaper?.renameDue && out.local_paper?.name) {
    const old = state.localPaper.name;
    renameLocalPaper(state, String(out.local_paper.name).trim());
    if (state.localPaper.name !== old) log(`Le journal des supporters s’appelle désormais « ${state.localPaper.name} ».`);
  }
  saveAll();
  clock.lap('publication et enregistrement');
  state.lastSync.durations = clock.summary();
  log('Édition publiée.');
  log(`Durées : ${state.lastSync.durations}.`);
  return state;
}

async function post({ store, settings, text, quote, poll = null, progress }) {
  const t = tracker(progress, 'Kop', [['Réponses à ton post', 1500]]);
  let ok = false;
  try {
    t.step(0);
    const state = await postInner({ store, settings, text, quote, poll, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

// Sondage d'un post : 2 à 4 choix différents, 40 caractères au plus ; null sinon.
function pollOptions(poll) {
  const seen = new Set();
  const options = (Array.isArray(poll?.options) ? poll.options : []).map((o) => String(o || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase())).slice(0, 4);
  return options.length >= 2 ? options : null;
}
// Répartition des votes en pourcentages entiers qui font 100 (plus fort reste) ; null si elle est inutilisable.
function pollPercents(raw, n) {
  const v = Array.isArray(raw) && raw.length === n ? raw.map(Number) : null;
  if (!v || v.some((x) => !Number.isFinite(x) || x < 0)) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const exact = v.map((x) => (x / sum) * 100), out = exact.map(Math.floor);
  [...exact.keys()].sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a])).slice(0, 100 - out.reduce((a, b) => a + b, 0)).forEach((k) => { out[k]++; });
  return out;
}
// Sans réponse utilisable de l'IA : une répartition tirée du post lui-même (toujours la même pour un même sondage).
function pollFallback(id, n) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return pollPercents(Array.from({ length: n }, (_, k) => 15 + ((h >>> (k * 7)) % 70)), n);
}

async function postInner({ store, settings, text, quote, poll = null, t }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde avant de poster.');
  text = String(text || '').trim().slice(0, 280);
  if (!text) throw new Error('Ton post est vide.');
  // Citation : un post du fil ou l'une de ses réponses ; elle compte comme un partage pour son auteur.
  const q = quote?.postId ? findInFeed(state, quote.postId, quote.replyId || null) : null;
  const mine = { id: newId(), author: { handle: state.profile.handle, name: state.profile.displayName, type: 'me', isMe: true }, text, gameDate: state.snapshot.gameDate, createdAt: Date.now(),
    ...(q ? { aboutPost: q.post.id, ...(q.target !== q.post ? { aboutReply: q.target.id } : {}) } : {}), replies: [], likes: 0, reposts: 0 };
  // Sondage : ses abonnés votent. Le résultat est décidé dans la requête des réponses (pas une de plus) ; d'ici là, et
  // si l'IA ne répond pas, une répartition tirée du post. Entre 3 et 8 % de ses abonnés votent.
  const options = pollOptions(poll);
  if (options) mine.poll = { options, percents: pollFallback(mine.id, options.length), votes: Math.max(40, Math.round((state.profile.followers || 0) * (0.03 + (mine.createdAt % 50) / 1000))) };
  if (q) {
    q.target.reposts = (q.target.reposts || 0) + 1;
    noteInteraction(state, 'quote', q.post, q.target, text);
  }
  state.feed.push(mine);
  store.saveCareer(state);

  const apiKey = store.getKey(settings.provider);
  const directory = mentionDirectory(state);
  const { found } = findMentions(text, directory);
  const mentioned = found.map((e) => ({
    handle: e.handle, name: e.name, kind: e.kind, side: e.side, team: e.team,
    ...(e.kind === 'coach' ? { club_account: e.side === 'opponent' ? clubHandle({ short: state.snapshot.rosters?.opponent?.short, name: e.team }) : clubHandle(state.snapshot.club) } : {}),
  }));
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.repliesSystem(settings),
    user: prompts.repliesUser({
      facts: factsFor(state.snapshot, state.profile, state), memory: memoryFor(state), post: text, settings: withTone(settings, state), mentioned, poll: options,
      quoted: q ? { handle: q.target.author.handle, name: q.target.author.name, type: q.target.author.type, text: q.target.text, can_reply: !q.target.author.isMe && !isCompetitionAuthor(state, q.target.author) } : null,
    }),
    maxTokens: 4000,
    onProgress: t.ai,
  }));
  if (mine.poll) mine.poll.percents = pollPercents(out.poll_percents, mine.poll.options.length) || mine.poll.percents;
  // Personne ne parle à la place du joueur ni d'une compétition ; les vrais joueurs et coachs peuvent répondre (règle 29).
  mine.replies = threadReplies(state, mine, Array.isArray(out.replies) ? out.replies : [], { people: directory, gameDate: state.snapshot.gameDate, known: q ? [q.target.author] : [] });
  // Les vrais joueurs mentionnés qui n'ont pas répondu eux-mêmes : like, réponse courte ou silence, selon ton ton.
  mine.likedBy = [];
  const spoke = new Set(mine.replies.map((r) => r.author.handle.toLowerCase()));
  for (const e of found.filter((x) => x.kind === 'player' && !spoke.has(x.handle.toLowerCase()))) {
    const tone = (out.mentions || []).find((m) => String(m.handle).replace(/^@/, '').toLowerCase() === e.handle.toLowerCase())?.tone || 'neutral';
    const reaction = playerReaction(e, tone, settings.language);
    if (reaction.kind === 'reply') mine.replies.unshift(reaction.reply);
    if (reaction.kind === 'like') mine.likedBy.push(e.name);
  }
  const promise = bindPromise(out.promise, { snapshot: state.snapshot, sourceText: text, source: 'tribune', postId: mine.id, language: settings.language });
  if (promise) {
    state.promises = [...(state.promises || []), promise];
    mine.promiseId = promise.id;
  }
  recordConduct(state, out.conduct, { source: 'kop', text, gameDate: state.snapshot.gameDate });
  // Ses posts : une bonne part de ses abonnés, davantage juste après un match où il a marqué ou fait une passe décisive.
  const last = state.snapshot.last;
  const hot = last?.me && (last.me.goals || last.me.assists) && last.date >= daysBefore(state.snapshot.gameDate, 2);
  mine.likes = postLikes(mine.author, state, (hot ? 2.5 : 1) * (promise ? 1.5 : 1));
  mine.reposts = repostsFor(mine.likes);
  store.saveCareer(state);
  return state;
}

// ---------- Interactions sur Kop : j'aime, repost, réponse ----------

// Un post du fil, et éventuellement l'une de ses réponses (la cible de l'interaction).
function findInFeed(state, postId, replyId) {
  const post = state.feed.find((p) => p.id === postId);
  if (!post) throw new Error('Ce post n’existe plus.');
  const reply = replyId ? (post.replies || []).find((r) => r.id === replyId) : null;
  if (replyId && !reply) throw new Error('Cette réponse n’existe plus.');
  return { post, target: reply || post };
}

// J'aime et reposts : notés pour que les comptes concernés y réagissent à la prochaine édition
// (aucun appel à l'IA sur le moment). Les réponses, elles, font réagir la discussion tout de suite.
function noteInteraction(state, kind, post, target, reply) {
  if (target.author.isMe) return;
  state.interactions = [...(state.interactions || []).filter((x) => !(x.kind === kind && x.id === target.id)),
    { kind, id: target.id, postId: post.id, handle: target.author.handle, name: target.author.name, type: target.author.type, text: String(target.text || '').slice(0, 220), reply, on: state.snapshot.gameDate }].slice(-30);
}
const forgetInteraction = (state, kind, target) => { state.interactions = (state.interactions || []).filter((x) => !(x.kind === kind && x.id === target.id)); };

// Suivre un compte (ou ne plus le suivre) : pas d'IA tout de suite, le compte peut le remarquer à la prochaine édition.
function followAccount({ store, handle }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  const h = String(handle || '').replace(/^@/, '');
  if (!h || isUser(state, { handle: h })) throw new Error('Compte inconnu.');
  const author = findAccount(state, h);
  if (!author) throw new Error('Compte inconnu.');
  state.follows ||= {};
  const key = Object.keys(state.follows).find((k) => k.toLowerCase() === h.toLowerCase());
  const id = `follow:${author.handle.toLowerCase()}`;
  if (key) {
    delete state.follows[key];
    state.interactions = (state.interactions || []).filter((x) => x.id !== id);
  } else {
    state.follows[author.handle] = { on: state.snapshot.gameDate };
    state.interactions = [...(state.interactions || []).filter((x) => x.id !== id),
      { kind: 'follow', id, handle: author.handle, name: author.name, type: author.type, text: '', on: state.snapshot.gameDate }].slice(-30);
  }
  store.saveCareer(state);
  return state;
}

// Un compte du fil (auteur d'un post ou d'une réponse), ou connu de l'annuaire.
function findAccount(state, handle) {
  const h = handle.toLowerCase();
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if (!x.author.isMe && x.author.handle.toLowerCase() === h) return x.author;
  const k = Object.keys(state.accounts || {}).find((x) => x.toLowerCase() === h);
  if (k) return { handle: k, name: state.accounts[k].name, type: state.accounts[k].type };
  const e = mentionDirectory(state).find((x) => x.handle.toLowerCase() === h && x.kind !== 'player' && x.kind !== 'coach');
  return e ? { handle: e.handle, name: e.name, type: e.kind } : null;
}

function likePost({ store, postId, replyId }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  const { post, target } = findInFeed(state, postId, replyId);
  target.likedByMe = !target.likedByMe;
  target.likes = Math.max(0, (target.likes || 0) + (target.likedByMe ? 1 : -1));
  if (target.likedByMe) noteInteraction(state, 'like', post, target); else forgetInteraction(state, 'like', target);
  store.saveCareer(state);
  return state;
}

// Repost d'un post ou d'une réponse (replyId).
function repostPost({ store, postId, replyId }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  const { post, target } = findInFeed(state, postId, replyId);
  target.repostedByMe = !target.repostedByMe;
  target.repostedOn = target.repostedByMe ? state.snapshot.gameDate : null;
  target.reposts = Math.max(0, (target.reposts || 0) + (target.repostedByMe ? 1 : -1));
  if (target.repostedByMe) noteInteraction(state, 'repost', post, target); else forgetInteraction(state, 'repost', target);
  store.saveCareer(state);
  return state;
}

async function replyToPost({ store, settings, postId, replyId, text, progress }) {
  const t = tracker(progress, 'Kop', [['Réponses dans la discussion', 900]]);
  let ok = false;
  try {
    t.step(0);
    const state = await replyToPostInner({ store, settings, postId, replyId, text, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

async function replyToPostInner({ store, settings, postId, replyId, text, t }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde avant de répondre.');
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) throw new Error('Ta réponse est vide.');
  const { post, target } = findInFeed(state, postId, replyId);
  const me = { handle: state.profile.handle, name: state.profile.displayName, type: 'me', isMe: true };
  const mine = { id: newId(), author: me, text: clean, likes: 0, replyTo: target.author.handle, gameDate: state.snapshot.gameDate };
  post.replies = [...(post.replies || []), mine];
  noteInteraction(state, 'reply', post, target, clean);
  store.saveCareer(state);

  const apiKey = store.getKey(settings.provider);
  const directory = mentionDirectory(state);
  const brief = (x) => ({ handle: x.author.handle, name: x.author.name, type: x.author.type, text: x.text });
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.threadSystem(settings),
    user: prompts.threadUser({
      facts: factsFor(state.snapshot, state.profile, state),
      memory: memoryFor(state),
      post: brief(post),
      thread: post.replies.filter((r) => r !== mine).slice(-12).map(brief),
      target: { ...brief(target), can_reply: !target.author.isMe && !isCompetitionAuthor(state, target.author) },
      reply: clean,
      settings: withTone(settings, state),
    }),
    maxTokens: 1800,
    onProgress: t.ai,
  }));
  // Personne ne parle à la place du joueur ni d'une compétition ; les vrais joueurs et coachs peuvent répondre (règle 29).
  const answers = threadReplies(state, post, (Array.isArray(out.replies) ? out.replies : []).slice(0, 5), { people: directory, gameDate: state.snapshot.gameDate, defaultTo: me.handle, known: [target.author] });
  post.replies.push(...answers);
  const promise = bindPromise(out.promise, { snapshot: state.snapshot, sourceText: clean, source: 'tribune', postId: post.id, language: settings.language });
  if (promise) {
    state.promises = [...(state.promises || []), promise];
    mine.promiseId = promise.id;
  }
  recordConduct(state, out.conduct, { source: 'kop', text: clean, gameDate: state.snapshot.gameDate });
  mine.likes = replyLikes(me, target.likes, state);
  store.saveCareer(state);
  return state;
}

async function replyMail({ store, settings, threadId, text, progress }) {
  const t = tracker(progress, 'Mails', [['Réponse à ton mail', 800]]);
  let ok = false;
  try {
    t.step(0);
    const state = await replyMailInner({ store, settings, threadId, text, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

// Club et journal local d'un fil de Mails à la date de son premier message : le club est noté sur les fils récents,
// sinon le journal de l'édition du jour donne le club suivi. Après un transfert, le staff et la presse locale de
// l'ancien club restent ceux de l'ancien club.
function threadEra(state, thread) {
  const day = thread.messages?.[0]?.gameDate || '';
  const eds = state.editions || [];
  let ei = -1;
  eds.forEach((e, i) => { if (e.gameDate <= day) ei = i; });
  const paper = (ei >= 0 && (eds[ei].paper || (state.pastPapers?.length && ei < eds.length - 1 ? state.pastPapers[0] : null))) || state.localPaper || null;
  const ref = [state.localPaper, ...(state.pastPapers || [])].find((p) => p?.name === paper?.name)?.clubRef;
  const season = ref && Object.entries(state.seasons || {}).find(([k]) => k.endsWith(`|${ref}`));
  return { club: thread.club || season?.[1]?.club || state.snapshot?.club?.name || null, paper: paper?.name || null };
}

// Fil avec quelqu'un de l'ancien club (entraîneur, club, journaliste du journal local d'alors) : l'IA répond en
// ancien, pas comme s'il l'entraînait ou le suivait encore au quotidien.
function formerClubOf(state, thread) {
  const now = state.snapshot?.club?.name;
  const w = state.writers || {};
  const national = thread.from === w.national_columnist || (w.national_desk || []).some((x) => x.name === thread.from);
  if (!['coach', 'club', 'journalist'].includes(thread.role) || (thread.role === 'journalist' && national)) return undefined;
  const era = threadEra(state, thread);
  return era.club && now && era.club !== now ? { club: era.club, local_paper: thread.role === 'journalist' ? era.paper || undefined : undefined, player_now_at: now } : undefined;
}

async function replyMailInner({ store, settings, threadId, text, t }) {
  const state = store.activeCareer();
  const thread = state?.mail.find((t) => t.id === threadId);
  if (!thread) throw new Error('Conversation introuvable.');
  if (thread.closed) throw new Error(`${thread.from} ne répond plus à tes messages.`);
  thread.messages.push({ who: 'me', body: text, gameDate: state.snapshot.gameDate });
  if (thread.role === 'journalist') state.onRecord.push({ to: thread.from, text, gameDate: state.snapshot.gameDate });
  store.saveCareer(state);

  const apiKey = store.getKey(settings.provider);
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.mailSystem(settings),
    user: prompts.mailUser({ facts: { ...factsFor(state.snapshot, state.profile, state), influence: ['coach', 'club', 'agent'].includes(thread.role) ? influenceFacts(state) : undefined }, memory: memoryFor(state), thread: { from: thread.from, role: thread.role, subject: thread.subject, messages: thread.messages, former_club: formerClubOf(state, thread), request: thread.request ? { kind: thread.request.kind, about: thread.request.summary, accepted: thread.request.accepted } : undefined }, text }),
    maxTokens: 3000,
    onProgress: t.ai,
  }));
  thread.messages.push({ who: 'them', body: out.body || '', gameDate: state.snapshot.gameDate });
  if (out.final && thread.role !== 'family') thread.closed = true;
  store.saveCareer(state);
  return state;
}

// Message privé sur Kop : il écrit, l'autre répond (modèle léger, comme les discussions). Sans texte, relance la
// réponse qui a échoué. Le dossier de l'agent reste hors de portée de ceux qui lui répondent.
async function sendDm({ store, settings, handle, text, progress }) {
  const t = tracker(progress, 'Kop', [['Réponse à ton message', 500]]);
  let ok = false;
  try {
    t.step(0);
    const state = await sendDmInner({ store, settings, handle, text, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

async function sendDmInner({ store, settings, handle, text, t }) {
  const state = store.activeCareer();
  if (!state?.snapshot) throw new Error('Synchronise ta sauvegarde avant de répondre.');
  const thread = dmThread(state, handle, newId);
  if (thread.closed) throw new Error(`${thread.name} ne répond plus à tes messages.`);
  const clean = String(text || '').trim().slice(0, 1000);
  const gameDate = state.snapshot.gameDate;
  if (clean) addDmMessage(thread, 'me', clean, gameDate);
  else if (thread.messages.at(-1)?.who !== 'me') throw new Error('Ton message est vide.');
  store.saveCareer(state);

  const facts = chatFacts(state);
  const m = memoryFor(state);
  const out = parseJson(await complete(settings, store.getKey(settings.provider), {
    system: prompts.dmSystem(settings),
    user: prompts.dmUser({ facts, memory: { handle: m.handle, followers: m.followers, my_profile: m.my_profile, my_life: m.my_life, storylines: m.storylines, user_posts: m.user_posts, user_on_record: m.user_on_record }, thread: dmContext(state, thread) }),
    maxTokens: 1500,
    light: true,
    onProgress: t.ai,
  }));
  const lines = (Array.isArray(out.messages) ? out.messages : [out.body]).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) throw new Error('Pas de réponse pour l’instant. Réessaie.');
  for (const line of lines) addDmMessage(thread, 'them', line, gameDate);
  if (out.final) thread.closed = true;
  store.saveCareer(state);
  return state;
}

// Vestiaire : il écrit dans un de ses groupes (celui de son club par défaut), un à trois membres répondent (une requête, au modèle léger). Son message
// reste s'ils ne répondent pas : un envoi sans texte redemande leur réponse.
async function sendHuddle({ store, settings, text, groupId = null, progress }) {
  const t = tracker(progress, 'Vestiaire', [['Réponse du groupe', 500]]);
  let ok = false;
  try {
    t.step(0);
    const state = store.activeCareer();
    if (!state?.snapshot) throw new Error('Synchronise ta sauvegarde avant de répondre.');
    const group = (state.huddles || []).find((g) => g.id === groupId) || activeHuddle(state) || syncHuddle(state, state.snapshot, { language: settings.language, newId });
    if (group.left) throw new Error('Tu as quitté ce groupe.');
    const clean = String(text || '').trim().slice(0, 1000);
    const gameDate = state.snapshot.gameDate;
    if (clean) addHuddleMessage(group, { who: 'me', text: clean, gameDate });
    else if (group.messages.filter((m) => m.who !== 'system').at(-1)?.who !== 'me') throw new Error('Ton message est vide.');
    store.saveCareer(state);

    const facts = chatFacts(state);
    const m = memoryFor(state);
    const out = parseJson(await complete(settings, store.getKey(settings.provider), {
      system: prompts.huddleSystem(settings),
      user: prompts.huddleUser({ facts, memory: { my_life: m.my_life, storylines: m.storylines, user_on_record: m.user_on_record }, group: huddleContext(group) }),
      maxTokens: 1500,
      light: true,
      onProgress: t.ai,
    }));
    if (!addGroupMessages(group, out.messages, gameDate, REPLY_MESSAGES)) throw new Error('Pas de réponse pour l’instant. Réessaie.');
    const said = clean || [...group.messages].reverse().find((x) => x.who === 'me')?.text || '';
    if (!group.scope) recordConduct(state, out.conduct, { source: 'huddle', text: said, gameDate });
    group.unread = 0;
    store.saveCareer(state);
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

// Il ouvre Vestiaire : ses messages sont lus ; une carrière commencée avant Vestiaire a son groupe sans attendre la synchro.
function readHuddle({ store, settings, groupId = null }) {
  const state = store.activeCareer();
  if (!state?.snapshot) return state;
  const group = (state.huddles || []).find((g) => g.id === groupId) || activeHuddle(state) || syncHuddle(state, state.snapshot, { language: settings.language, newId });
  if (group) group.unread = 0;
  store.saveCareer(state);
  return state;
}

// Passage régulier (app ouverte) : nouveaux ralentis ou vidéos depuis la dernière synchro.
function refreshMedia({ store, settings }) {
  const state = store.activeCareer();
  if (!state?.snapshot || !processMedia(state, settings)) return null;
  store.saveCareer(state);
  return state;
}

// ---------- Conférence de presse d'après-match ----------

const PRESS_ACTIVE = ['pending', 'open'];

// À chaque édition publiée : l'ancienne conférence non tenue expire, une nouvelle s'ouvre
// pour le dernier match où le joueur a joué.
function schedulePress(state, changes) {
  // Une conférence en attente n'expire qu'au match suivant (une édition sans nouveau résultat la laisse ouverte).
  if (!changes.newResults.length) return;
  if (state.press && PRESS_ACTIVE.includes(state.press.status)) state.press.status = 'expired';
  const m = changes.newResults.filter((r) => r.me && r.me.minutes > 0).at(-1);
  if (!m) return;
  state.press = {
    id: newId(),
    matchId: m.id,
    match: `${m.home} ${m.score[0]}-${m.score[1]} ${m.away}`,
    gameDate: m.date,
    status: 'pending',
    questions: null,
    answers: null,
  };
}

function activePress(state) {
  if (!state?.press || !PRESS_ACTIVE.includes(state.press.status)) throw new Error('Pas de conférence de presse en cours.');
  return state.press;
}

const pressMatch = (state, press) => {
  const f = state.snapshot.fixtures.find((x) => sameMatch(x.id, press.matchId));
  return f ? strip(f) : press.match;
};

// Les questions ne sont générées que si le joueur se présente à la conférence.
// Dictée d'une réponse aux journalistes : l'audio (WAV) est transcrit à la demande, le joueur relit avant d'envoyer.
const DICTATION_MAX_BYTES = 8 * 1024 * 1024;
async function transcribeDictation({ store, settings, audio }) {
  if (!audio?.length || audio.length > DICTATION_MAX_BYTES) throw new Error('Enregistrement vide ou trop long.');
  const state = store.activeCareer();
  const s = state?.snapshot;
  const press = state?.press;
  const names = [...new Set([s?.player?.name, s?.club?.name, s?.coaches?.mine, s?.next?.home, s?.next?.away, s?.last?.home, s?.last?.away, ...(s?.squad || []).map((p) => p.name), ...(press?.questions || []).map((q) => q.journalist)].filter(Boolean))].slice(0, 50);
  return transcribe(settings, store.getKey(settings.provider), { audio: Buffer.from(audio).toString('base64'), prompt: prompts.dictationPrompt(names) });
}

async function openPress({ store, settings, progress }) {
  const state = store.activeCareer();
  const press = activePress(state);
  if (press.questions) return state;
  const t = tracker(progress, 'Conférence de presse', [['Questions des journalistes', 700]]);
  t.step(0);
  let ok = false;
  try {
    await askQuestions({ store, settings, state, press, t });
    ok = true;
  } finally {
    t.done(ok);
  }
  return state;
}

// Qui pose les questions : ceux qui suivent la ligue, deux plumes de La Transversale et un confrère d'un autre média inventé
// par l'IA. Une conférence sur quatre, le rédacteur du blog des supporters obtient la troisième question : lui seul tutoie.
function pressPanel(state, press) {
  const desk = transversaleDesk(state).slice(0, 6);
  const seed = parseInt(String(press.id).slice(0, 6), 16) || 0;
  const league = (w) => ({ name: w.name, outlet: 'La Transversale', role: w.role, address: 'formal' });
  const blogger = state.writers?.local_beat_writer, blog = state.localPaper?.name;
  const third = blogger && blog && seed % 4 === 0 ? { name: blogger, outlet: blog, role: "supporters' blog writer", address: 'familiar' } : { name: null, outlet: null, address: 'formal' };
  return [league(desk[seed % desk.length]), league(desk[(seed + 1) % desk.length]), third];
}
// Un « tu » en français, pour rattraper une question de journaliste de la ligue qui tutoierait le joueur.
const TUTOIE = /(^|[^\p{L}])((tu|te|toi|ton|ta|tes)($|[^\p{L}])|t['’]\p{L})/iu;

async function askQuestions({ store, settings, state, press, t }) {
  const panel = pressPanel(state, press);
  const blogger = state.writers?.local_beat_writer, blog = state.localPaper?.name;
  const user = prompts.pressQuestionsUser({ facts: factsFor(state.snapshot, state.profile, state), memory: memoryFor(state), conference: { match: pressMatch(state, press), panel } });
  const ask = async (extra = '') => parseJson(await complete(settings, store.getKey(settings.provider), {
    system: prompts.pressQuestionsSystem(settings),
    user: `${user}${extra}`,
    maxTokens: 3000,
    onProgress: t.ai,
  }));
  let out = await ask();
  const tutoie = (o) => (o.questions || []).some((q, i) => panel[i]?.address === 'formal' && TUTOIE.test(q?.question || ''));
  if ((settings.language || 'fr') === 'fr' && tutoie(out)) out = await ask('\nREMINDER: your previous questions said "tu" to him. Every journalist with address "formal" must say "vous".');
  press.questions = (out.questions || []).slice(0, 3).map((q, i) => {
    const seat = panel[i] || {};
    // Le fauteuil libre va à un confrère : jamais au blog des supporters, sauf quand c'est son tour.
    const other = q?.journalist && q.journalist !== blogger ? q.journalist : 'Journaliste';
    return { journalist: seat.name || other, outlet: seat.outlet || (q?.outlet && q.outlet !== blog ? q.outlet : ''), question: q?.question || '' };
  }).filter((q) => q.question);
  if (!press.questions.length) throw new Error('Les journalistes n’ont posé aucune question. Réessaie.');
  press.status = 'open';
  store.saveCareer(state);
}

function skipPress({ store }) {
  const state = store.activeCareer();
  activePress(state).status = 'skipped';
  store.saveCareer(state);
  return state;
}

// Citations du joueur dans l'article : chacune doit se retrouver mot pour mot dans une réponse.
const normQuote = (t) => String(t).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/^[\s.,;:!?…]+|[\s.,;:!?…]+$/g, '').toLowerCase();
function alteredQuotes(text, answers) {
  const pool = answers.filter(Boolean).map(normQuote);
  const quotes = [...String(text).matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)"/g)].map((m) => m[1] || m[2] || m[3]);
  return quotes.filter((q) => normQuote(q).split(' ').length >= 3 && !pool.some((a) => a.includes(normQuote(q))));
}

async function submitPress({ store, settings, answers, log = () => {}, progress }) {
  const steps = [['Rédaction de l’article', 2500]];
  if (settings.factCheck !== false) steps.push(['Vérification des faits', 1000]);
  const t = tracker(progress, 'Conférence de presse', steps);
  let ok = false;
  try {
    t.step(0);
    const state = await submitPressInner({ store, settings, answers, log, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

async function submitPressInner({ store, settings, answers, log, t }) {
  const state = store.activeCareer();
  const press = activePress(state);
  if (!press.questions) throw new Error('La conférence n’a pas encore commencé.');
  const exchanges = press.questions.map((q, i) => ({ ...q, answer: String(answers?.[i] || '').trim() || null }));
  const apiKey = store.getKey(settings.provider);
  const facts = { ...factsFor(state.snapshot, state.profile, state), press_conference: exchanges };
  const desk = transversaleDesk(state);
  const reporter = desk.find((w) => w.role === 'Reporter') || desk[0];
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.pressWriteupSystem(settings),
    user: prompts.pressWriteupUser({ facts, memory: memoryFor(state), conference: { match: pressMatch(state, press), exchanges, writer: reporter.name } }),
    maxTokens: 6000,
    log,
    onProgress: t.ai,
  }));
  const article = { headline: out.article?.headline || 'Conférence de presse', dek: out.article?.dek || '', author: desk.some((w) => w.name === out.article?.author) ? out.article.author : reporter.name, body: out.article?.body || '', kind: 'conférence de presse', focus: 'club' };
  const draft = { national: [article], local: [], posts: (out.posts || []).filter((p) => !isUser(state, toAuthor(p)) && !isCompetitionAuthor(state, toAuthor(p))), emails: [] };
  if (settings.factCheck !== false) {
    try {
      t.step(1);
      press.factcheck = await factCheck(draft, { settings, apiKey, facts, changes: {}, log, onProgress: t.ai });
    } catch (err) {
      press.factcheck = { checked: false, error: err.message, corrections: [] };
    }
  }
  // Filet de sécurité : une citation qui n'est pas mot pour mot lui ferait dire ce qu'il n'a pas dit.
  // Dans le texte, la phrase entière est retirée ; dans le titre et le chapô, les guillemets sautent.
  const said = exchanges.map((x) => x.answer);
  press.alteredQuotes = [...alteredQuotes(article.body, said), ...alteredQuotes(`${article.headline} ${article.dek}`, said)];
  for (const q of press.alteredQuotes) {
    article.body = article.body.split(/\n{2,}/)
      .map((para) => (para.match(/[^.!?…]+(?:[.!?…]+[»”"]?|$)\s*/g) || [para]).filter((sentence) => !sentence.includes(q)).join('').trim())
      .filter(Boolean).join('\n\n');
    for (const f of ['headline', 'dek']) article[f] = article[f].replace(`« ${q} »`, q).replace(`«${q}»`, q).replace(`“${q}”`, q).replace(`"${q}"`, q);
  }
  if (press.alteredQuotes.length) log(`Conférence : ${press.alteredQuotes.length} citation(s) qui n’étaient pas tes mots retirée(s).`);

  const now = Date.now();
  const edition = state.editions.at(-1);
  if (edition) edition.national.push(article);
  const people = mentionDirectory(state);
  for (const p of draft.posts) {
    if (oddScript(p.text)) continue;
    const author = realPersonAuthor(toAuthor(p), people);
    rememberAccount(state, author);
    state.feed.push({ id: newId(), author, text: p.text || '', gameDate: press.gameDate, createdAt: now, replies: [], ...(() => { const likes = postLikes(author, state, 1.2); return { likes, reposts: repostsFor(likes) }; })() });
  }
  // Ses mots sont « on the record » pour la prochaine édition.
  for (const x of exchanges) {
    if (x.answer) state.onRecord.push({ to: `${x.journalist} (conférence de presse)`, question: x.question, text: x.answer, gameDate: press.gameDate });
  }
  const allAnswers = exchanges.map((x) => x.answer).filter(Boolean).join(' / ');
  for (const raw of Array.isArray(out.promises) ? out.promises : []) {
    if (!raw?.text || !allAnswers.includes(raw.text.trim())) continue; // seulement ses mots exacts
    const promise = bindPromise(raw, { snapshot: state.snapshot, sourceText: allAnswers, source: 'conférence de presse', language: settings.language });
    if (promise) state.promises = [...(state.promises || []), promise];
  }
  recordConduct(state, out.conduct, { source: 'press', text: allAnswers, gameDate: press.gameDate || state.snapshot.gameDate });
  press.answers = exchanges.map((x) => x.answer);
  press.status = 'done';
  press.article = article.headline;
  store.saveCareer(state);
  return state;
}

// Une offre de contrat arrive un jour sans match : pas d'édition, seulement le mail de l'agent (relu lui aussi).
const AGENT_OCCASION_LOG = {
  offer: (o) => `Offre de contrat reçue (${o.map((x) => x.club).join(', ')})`,
  open: () => 'Ouverture du mercato',
  eve: () => 'Dernier jour du mercato demain',
};

// « Le brief du matin » (newsletter de La Transversale, réglage transversaleBrief) : dernier match du club, classement,
// prochain match et titres de l'édition, tirés de la sauvegarde et de l'édition publiée. Pas de requête à l'IA.
function transversaleBrief(snapshot, edition, language = 'fr') {
  const L = postTexts(language), B = L.brief;
  const club = snapshot.club?.name || B.yourClub;
  const last = snapshot.last?.played && snapshot.last.score ? snapshot.last : null;
  const next = snapshot.next;
  const row = (snapshot.table || []).find((r) => r.mine);
  const facts = [
    last && B.last(`${last.home} ${last.score[0]}-${last.score[1]} ${last.away}`, last.competition),
    row && B.table(club, row.pos, snapshot.league?.name, row.pts),
    next && B.next(`${next.home} - ${next.away}`, L.date(next.date, { weekday: 'long', day: 'numeric', month: 'long' }), next.hour),
  ].filter(Boolean);
  const heads = (edition?.national || []).map((a) => `• ${a.headline}${a.dek ? `\n  ${a.dek}` : ''}`);
  const body = [
    B.hello,
    B.intro(L.date(snapshot.gameDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
    facts.join('\n'),
    heads.length ? B.heads(heads.join('\n')) : '',
    B.signoff,
    B.footer,
  ].filter(Boolean).join('\n\n');
  return { id: newId(), from: 'La Transversale', role: 'newsletter', subject: B.subject(L.date(snapshot.gameDate, { day: 'numeric', month: 'long' })), unread: true, closed: true, messages: [{ who: 'them', body, gameDate: snapshot.gameDate }] };
}

async function writeAgentMail({ store, state, snapshot, settings, log, t, occasion = 'offer' }) {
  const agent = state.agent;
  const facts = factsFor(snapshot, state.profile, state);
  const offers = facts.agent?.offers_received || [];
  log(`${AGENT_OCCASION_LOG[occasion](offers)} : ${agent.name}, ton agent, t’écrit…`);
  const apiKey = store.getKey(settings.provider);
  t.step(1, 'Mail de ton agent');
  const out = parseJson(await complete(settings, apiKey, {
    system: prompts.agentMailSystem(settings, occasion),
    user: prompts.agentMailUser({ facts, memory: memoryFor(state), offers }),
    maxTokens: 3000,
    log,
    onProgress: t.ai,
  }));
  const draft = { emails: [{ from: agent.name, role: 'agent', subject: out.subject || postTexts(settings.language).agentSubject[occasion], body: out.body || '' }] };
  if (settings.factCheck !== false) {
    try {
      t.step(2);
      const fc = await factCheck(draft, { settings, apiKey, facts, changes: { new_offers: offers }, log, onProgress: t.ai });
      if (fc.corrections.length) log(`Vérification des faits : ${fc.corrections.length} correction(s) dans le mail de l’agent.`);
    } catch (err) {
      log(`Vérification des faits impossible (${err.message}) : mail envoyé sans relecture.`);
    }
  }
  const e = draft.emails[0];
  state.mail.push({ id: newId(), from: e.from, role: 'agent', subject: e.subject, unread: true, closed: false, messages: [{ who: 'them', body: e.body, gameDate: snapshot.gameDate }] });
  agent.lastReportOn = snapshot.gameDate;
  agent.reported = { clubs: agent.view.clubs, extension: agent.view.extension, windowOpen: agent.view.windowOpen, offers: agent.view.offers || [] };
  log('Mails : nouveau mail de ton agent.');
}

// Demande de transfert que le joueur vient de faire dans le jeu (un seul club à la fois), ou annulation (club = null).
function setTransferRequest({ store, club }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  const agent = ensureAgent(state);
  if (!club) {
    agent.request = null;
  } else {
    const t = [...(agent.view?.targets || []), ...(agent.view?.clubs || [])].find((c) => c.team === club);
    if (!t || !t.ref) throw new Error(`Club inconnu de ton agent : ${club}.`);
    agent.request = { club: t.team, ref: t.ref, league: t.league, on: state.snapshot.gameDate };
  }
  store.saveCareer(state);
  return state;
}

// Attitude du joueur face au mercato : appliquée tout de suite aux estimations de l'agent.
function setAgentStance({ store, stance }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  if (!['stay', 'open', 'leave'].includes(stance)) throw new Error('Attitude inconnue.');
  const agent = ensureAgent(state);
  agent.stance = stance;
  agent.view = applyStance(agent.market, stance, agent.reported);
  store.saveCareer(state);
  return state;
}

// « Ton attitude » agit sur le jeu : avec « je veux partir », une vraie offre peut être réorientée vers un club
// proposé par l'agente. Jeu fermé, copie de sécurité gardée ; la synchro qui suit lit la nouvelle offre.
function redirectOffer({ store, settings, offerId, toRef }) {
  // Expérimental : modifie la sauvegarde du jeu, seulement si le joueur l'a activé dans les réglages.
  if (!settings.offerRedirect) throw new Error('La réorientation d’offres est désactivée : active-la dans les réglages (expérimental).');
  const state = store.activeCareer();
  if (!state?.snapshot) throw new Error('Synchronise ta sauvegarde une première fois.');
  const agent = ensureAgent(state);
  if (agent.stance !== 'leave') throw new Error('Choisis d’abord l’attitude « Je veux partir ».');
  const offer = (agent.view?.offers || []).find((o) => o.id === offerId);
  if (!offer?.redirectable) throw new Error('Cette offre ne peut pas être réorientée.');
  const target = (agent.view?.redirectTargets || []).find((c) => c.ref === toRef);
  if (!target) throw new Error('Club inconnu de ton agente.');
  if (!settings.savePath) throw new Error('Aucune sauvegarde choisie.');
  const r = redirectOfferInSave({
    savePath: settings.savePath,
    backupDir: path.join(store.dir, 'careers', state.careerId, 'backups'),
    playerId: state.snapshot.player.id,
    offerId,
    toRef,
  });
  agent.redirects = [...(agent.redirects || []), { on: state.snapshot.gameDate, offerId, from: r.from, to: r.to, role: target.role, backup: r.backup }].slice(-10);
  store.saveCareer(state);
  return { state, result: { from: r.from, to: r.to, changes: r.changes } };
}

// ---------- Influence (Mails → Influence) ----------
// Le joueur demande un changement de plan de jeu à son entraîneur, un mouvement au mercato ou parle de son avenir au
// directeur sportif. L'app décide (jauge et difficulté), l'IA écrit la réponse, et une décision acceptée peut être
// écrite dans la sauvegarde (expérimental, jeu fermé) : la formation tout de suite, les transferts pendant un mercato.

// Ce que la page affiche : jauge, formation, options avec leurs chances, effectif, décisions en cours.
function influenceView({ store, settings }) {
  const state = store.activeCareer();
  if (!state?.snapshot) return null;
  const aux = store.loadAux(state.careerId, 'influence');
  const inf = ensureInfluence(state);
  if (!aux || !inf.scoreInfo || aux.clubRef !== state.snapshot.club.ref) return { ready: false };
  const s = state.snapshot, ctx = { state, s, aux };
  const firstTarget = aux.saleTargets[0]?.ref;
  return {
    ready: true,
    writes: Boolean(settings.influenceWrites),
    score: inf.scoreInfo.parts?.points ? inf.scoreInfo : influenceScore(state, s), // carrière pas encore resynchronisée
    formation: inf.formation,
    coach: s.club.coach,
    director: directorOf(s.club.ref),
    window: currentWindow(s),
    next: nextWindow(s),
    formations: aux.formations.map(({ phases, ...f }) => ({ ...f, assess: assess('formation', { key: f.key }, ctx) })),
    squad: aux.squad.map((p) => ({ ...p, sale: firstTarget === undefined ? null : assess('sale', { playerId: p.id, toRef: firstTarget }, ctx), keep: assess('keep', { playerId: p.id }, ctx) })),
    saleTargets: aux.saleTargets,
    depth: aux.depth || {},
    future: { extend: assess('future', { wish: 'extend' }, ctx), leave: assess('future', { wish: 'leave' }, ctx) },
    effects: inf.effects.slice(-12).reverse().map(({ phases, ...e }) => e),
    keeps: inf.keeps,
    requests: inf.requests.slice(-8).reverse().map(({ id, kind, on, accepted, chance, summary, threadId, from }) => ({ id, kind, on, accepted, chance, summary, threadId, from })),
  };
}

// Recrue à recommander, parmi les joueurs des clubs (base du jeu), avec les chances : par nom, et/ou par poste à
// renforcer (poste officiel du jeu). Un poste sans nom propose les joueurs de ce poste des championnats suivis qui
// jouent le plus, à sa portée.
const plainName = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function influenceSearch({ store, query, pos }) {
  const state = store.activeCareer();
  const aux = state?.snapshot && store.loadAux(state.careerId, 'influence');
  const q = plainName(query).trim();
  const role = Number.isInteger(pos) && pos >= 0 && pos <= 12 ? pos : null;
  if (!aux || (q.length < 2 && role === null)) return [];
  const ctx = { state, s: state.snapshot, aux };
  const row = ([id, name, ref, share, r]) => ({ id, name, role: r ?? null, club: aux.clubs[ref]?.name || aux.clubNames[ref] || null, league: aux.clubs[ref]?.league || null, share: playingTimeKnown(aux, ref) ? share : null, assess: assess('signing', { playerId: id, pos: role ?? undefined }, ctx) });
  const samePos = (p) => role === null || p[4] === role;
  if (q.length >= 2) return aux.players.filter((p) => samePos(p) && plainName(p[1]).includes(q)).sort((a, b) => b[3] - a[3]).slice(0, 12).map(row);
  // Début de saison : temps de jeu inconnu (null), le joueur reste proposé. Si aucun n'a au moins 15 % de chances,
  // les meilleures chances quand même, plutôt qu'une liste vide.
  const pool = aux.players.filter((p) => samePos(p) && aux.clubs[p[2]] && (p[3] >= 20 || !playingTimeKnown(aux, p[2]))).map(row)
    .filter((h) => !h.assess.blocked);
  const reachable = pool.filter((h) => h.assess.chance >= 15);
  const byShare = (a, b) => (b.share ?? -1) - (a.share ?? -1), byChance = (a, b) => b.assess.chance - a.assess.chance;
  return (reachable.length ? reachable.sort((a, b) => byShare(a, b) || byChance(a, b)) : pool.sort((a, b) => byChance(a, b) || byShare(a, b))).slice(0, 12);
}

async function influenceRequest({ store, settings, kind, params, message, progress }) {
  const t = tracker(progress, 'Mails', [['Réponse à ta demande', 800]]);
  let ok = false;
  try {
    t.step(0);
    const state = await influenceRequestInner({ store, settings, kind, params: params || {}, message, t });
    ok = true;
    return state;
  } finally {
    t.done(ok);
  }
}

async function influenceRequestInner({ store, settings, kind, params, message, t }) {
  const state = store.activeCareer();
  if (!state?.snapshot) throw new Error('Synchronise ta sauvegarde une première fois.');
  const aux = store.loadAux(state.careerId, 'influence');
  if (!aux || aux.clubRef !== state.snapshot.club.ref) throw new Error('Synchronise ta sauvegarde une première fois.');
  const s = state.snapshot;
  const a = assess(kind, params, { state, s, aux });
  const { request, effect } = decide(state, s, kind, params, a, aux);
  const text = String(message || '').trim().slice(0, 1200);
  const sm = request.summary;
  const thread = {
    id: newId(), from: request.from, role: request.role, club: s.club.name, subject: '', unread: false, closed: false,
    request: { id: request.id, kind, summary: sm, accepted: request.accepted, chance: request.chance },
    messages: text ? [{ who: 'me', body: text, gameDate: s.gameDate }] : [],
  };
  request.threadId = thread.id;
  state.mail.push(thread);
  store.saveCareer(state); // la décision est prise avant l'appel à l'IA : la relancer ne change rien
  let reply = null;
  try {
    const apiKey = store.getKey(settings.provider);
    const out = parseJson(await complete(settings, apiKey, {
      system: prompts.influenceMailSystem(settings),
      user: prompts.influenceMailUser({ facts: { ...factsFor(s, state.profile, state), influence: influenceFacts(state) }, memory: memoryFor(state), request: requestFacts(state, s, request, effect, text) }),
      maxTokens: 3000,
      onProgress: t.ai,
    }));
    if (out.body) reply = { subject: out.subject, body: out.body };
  } catch { /* réponse toute prête ci-dessous */ }
  if (!reply) reply = fallbackReply(settings.language, state, s, request, effect);
  thread.subject = oneLine(reply.subject, 80) || fallbackReply(settings.language, state, s, request, effect).subject;
  thread.messages.push({ who: 'them', body: reply.body, gameDate: s.gameDate });
  thread.unread = true;
  store.saveCareer(state);
  return state;
}

// Écrit une décision acceptée dans la sauvegarde (expérimental, réglage à activer, jeu fermé, copie gardée).
function influenceApply({ store, settings, effectId }) {
  if (!settings.influenceWrites) throw new Error('Les effets réels de l’influence sont désactivés : active-les dans les réglages.');
  const state = store.activeCareer();
  if (!state?.snapshot) throw new Error('Synchronise ta sauvegarde une première fois.');
  const e = ensureInfluence(state).effects.find((x) => x.id === effectId);
  if (!e || e.status !== 'ready') throw new Error('Cette décision n’est pas prête à être appliquée.');
  if (!settings.savePath) throw new Error('Aucune sauvegarde choisie.');
  const career = readSave(settings.savePath);
  if (career.player.id !== state.snapshot.player.id) throw new Error('La sauvegarde suivie n’est plus celle de ce joueur : synchronise d’abord.');
  if (career.save.date && career.save.date !== state.snapshot.gameDate) throw new Error('Ta sauvegarde a avancé depuis la dernière synchro : synchronise d’abord.');
  if (e.kind !== 'formation' && !currentWindow(state.snapshot)) throw new Error('Le mercato est fermé : la décision attend son ouverture.');
  const backupDir = path.join(store.dir, 'careers', state.careerId, 'backups');
  const r = e.kind === 'formation'
    ? applyFormation({ savePath: settings.savePath, backupDir, clubRef: e.clubRef, phases: e.phases })
    : applyTransfer({ savePath: settings.savePath, backupDir, playerId: e.playerId, fromRef: e.fromRef, toRef: e.toRef, news: { clubRef: state.snapshot.club.ref, date: state.snapshot.gameDate } });
  Object.assign(e, { status: 'applied', appliedOn: state.snapshot.gameDate, backup: r.backup, changes: r.changes, ...(r.shirt ? { shirt: r.shirt } : {}) });
  store.saveCareer(state);
  return { state, result: { kind: e.kind, name: e.name, changes: r.changes, shirt: r.shirt || null } };
}

// Mise à l'écart décidée par le club : écrite dans la sauvegarde (ses jours d'indisponibilité jusqu'au lendemain du
// dernier match de la sanction), jeu fermé, copie gardée. Seulement depuis la sauvegarde de la dernière synchro.
function conductApply({ store, settings }) {
  const state = store.activeCareer();
  const p = state?.conduct?.pending;
  if (!p) throw new Error('Aucune mise à l’écart en attente.');
  if (p.applied) throw new Error('La mise à l’écart est déjà écrite dans ta sauvegarde.');
  if (!settings.savePath) throw new Error('Aucune sauvegarde choisie.');
  const career = readSave(settings.savePath);
  if (career.player.id !== state.snapshot.player.id) throw new Error('La sauvegarde suivie n’est plus celle de ce joueur : synchronise d’abord.');
  if (career.save.date && career.save.date !== state.snapshot.gameDate) throw new Error('Ta sauvegarde a avancé depuis la dernière synchro : synchronise d’abord.');
  const today = state.snapshot.gameDate;
  const last = p.matches.at(-1);
  if (last.date < today) throw new Error('Les matchs de la sanction sont déjà passés.');
  const days = Math.round((Date.parse(`${last.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5) + 1;
  const r = applyUnavailable({ savePath: settings.savePath, backupDir: path.join(store.dir, 'careers', state.careerId, 'backups'), playerId: state.snapshot.player.id, days });
  p.applied = { on: today, days: r.after, backup: r.backup };
  store.saveCareer(state);
  return { state, result: { days: r.after, changes: r.changes } };
}

// Page profil de Kop, modifiable : textes, couleur de bannière, badge, photo et bannière.
// Les images arrivent recadrées en JPEG et sont rangées dans le dossier de la carrière (profile/).
const PROFILE_COLORS = ['#c8102e', '#15181e', '#0b1d4a', '#13286b', '#1b7a4b', '#a50d26', '#9a6b00', '#4a515c']; // palette de La Transversale (anciennes couleurs gardées si déjà choisies)
const oneLine = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function profileImageFile(dir, kind, dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  const buf = m && Buffer.from(m[1], 'base64');
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Image illisible.');
  if (buf.length > 4 * 1024 * 1024) throw new Error('Image trop lourde (4 Mo au plus après recadrage).');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${kind}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

function updateProfile({ store, update }) {
  const state = store.activeCareer();
  if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
  const prof = state.profile;
  const old = { handle: prof.handle, name: prof.displayName };
  if (update.handle !== undefined) {
    const h = String(update.handle).replace(/^@/, '').replace(/[^\w]/g, '').slice(0, 20);
    if (h && h.length < 3) throw new Error('Le pseudo doit faire au moins 3 caractères (lettres, chiffres ou _).');
    if (h && h.toLowerCase() !== prof.handle.toLowerCase()) {
      // Pas le pseudo d'un autre compte : il ne peut pas se faire passer pour lui.
      const taken = new Set(mentionDirectory(state).map((e) => e.handle.toLowerCase()));
      for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) if (!x.author.isMe) taken.add(x.author.handle.toLowerCase());
      if (taken.has(h.toLowerCase())) throw new Error(`@${h} est déjà le pseudo d’un autre compte de Kop.`);
    }
    if (h) prof.handle = h;
  }
  if (update.displayName !== undefined && oneLine(update.displayName, 50)) prof.displayName = oneLine(update.displayName, 50);
  if (update.position !== undefined) prof.position = oneLine(update.position, 40);
  if (update.bio !== undefined) prof.bio = String(update.bio).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 160);
  if (update.location !== undefined) prof.location = oneLine(update.location, 30);
  if (update.website !== undefined) prof.website = oneLine(update.website, 100).replace(/\s/g, '');
  if (update.verified !== undefined) prof.verified = Boolean(update.verified);
  if (update.bannerColor !== undefined && PROFILE_COLORS.includes(update.bannerColor)) prof.bannerColor = update.bannerColor;

  const dir = path.join(store.dir, 'careers', state.careerId, 'profile');
  const replaced = [];
  for (const kind of ['avatar', 'banner']) {
    if (update[kind] === undefined) continue;
    if (prof[kind]) replaced.push(prof[kind]);
    prof[kind] = profileImageFile(dir, kind, update[kind]);
  }

  // Nouveau nom ou pseudo : ses posts et réponses passés suivent, comme sur un vrai réseau.
  if (prof.handle !== old.handle) prof.formerHandles = [...new Set([...(prof.formerHandles || []), old.handle])].filter((h) => h.toLowerCase() !== prof.handle.toLowerCase()).slice(-5);
  if (prof.handle !== old.handle || prof.displayName !== old.name) {
    for (const p of state.feed) {
      for (const x of [p, ...(p.replies || [])]) {
        if (x.author.isMe) { x.author.handle = prof.handle; x.author.name = prof.displayName; }
        if (x.replyTo && x.replyTo.toLowerCase() === old.handle.toLowerCase()) x.replyTo = prof.handle;
      }
    }
  }
  store.saveCareer(state);
  for (const f of replaced) { try { fs.rmSync(path.join(dir, path.basename(f))); } catch { /* déjà absente */ } }
  return state;
}

// Scores du monde du jeu (Scoreline), écrits à la dernière synchro de la carrière active.
function loadScores({ store }) {
  const state = store.activeCareer();
  return state ? store.loadAux(state.careerId, 'scores') : null;
}

module.exports = { conductApply, pollOptions, pollPercents, bigEdition, pressPanel, transcribeDictation, chatFacts, gameDirFor, loadScores, addEditionPosts, writeDiscussions, writeTransversale, transversaleDesk, transversaleFacts, pressMoments, transversalePlan, articleProblems, loadState, refreshEmblems, followAccount, updateProfile, PROFILE_COLORS, sync, post, likePost, repostPost, replyToPost, replyMail, sendDm, sendHuddle, readHuddle, newCareerInfo, factsFor, refreshMedia, openPress, submitPress, skipPress, alteredQuotes, mentionDirectory, setAgentStance, setTransferRequest, redirectOffer, transversaleBrief, influenceView, influenceSearch, influenceRequest, influenceApply };
