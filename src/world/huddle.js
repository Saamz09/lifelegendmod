'use strict';
// Vestiaire : le groupe de discussion privé du club, avec les joueurs de l'effectif, l'entraîneur et le staff, et celui de
// la sélection quand il est convoqué.
// Le staff est inventé et reste le même pour un club donné. Les arrivées, les départs et l'annonce du prochain match
// viennent de la sauvegarde, sans IA ; l'édition y ajoute quelques messages dans sa requête habituelle ; une requête à
// part ne part que lorsqu'il écrit. Ce qui se dit ici reste privé : rien n'en part vers la presse ni vers Kop.

const { postTexts } = require('./postTexts');

const STAFF_ROLES = ['assistant', 'fitness', 'physio', 'manager'];
const ROLE_FOR_AI = { coach: 'head coach', assistant: 'assistant coach', fitness: 'fitness coach', physio: 'physio', manager: 'team manager (schedules, travel, kit)' };
const FIRST_NAMES = ['Marc', 'Julien', 'Karim', 'Luca', 'Pierre', 'Samir', 'Stefan', 'Antoine', 'Hugo', 'Nicolas', 'Yann', 'Olivier', 'Rémi', 'Sébastien', 'Mehdi', 'Bastien'];
const LAST_NAMES = ['Delmotte', 'Ferrandi', 'Morvan', 'Benhamou', 'Rossetti', 'Kellner', 'Lamberti', 'Vidalie', 'Costanzo', 'Renardy', 'Hamonet', 'Perrault', 'Sauvaget', 'Marchal', 'Tessier', 'Guillou'];
const MAX_MESSAGES = 300, CONTEXT = 12, EDITION_MESSAGES = 7, NATIONAL_MESSAGES = 4, REPLY_MESSAGES = 3, TEXT_MAX = 500, MOVES_SHOWN = 8, ANNOUNCE_DAYS = 3;

// Façons d'écrire des coéquipiers (consigne pour l'IA, en anglais) : chacun la sienne, toujours la même, tirée de son nom.
const TEXTING = [
  'the joker of the squad: teases everyone, lots of 😂',
  'few words, often just one or two emojis',
  'the big brother: calm, encouraging, clean sentences',
  'gets hyped: CAPITALS and !!!',
  'dry humour, short one-liners',
  'the music guy: the playlist in the bus and in the dressing room',
  'the gamer: challenges teammates to video-game matches (the football game on the console, by its name)',
  'always hungry: the canteen, the team meal, the restaurant after the match',
  'lots of slang and nicknames for his teammates',
  'long messages with no punctuation, like a voice note typed out',
  'the squad photographer: the photos and videos of the team',
  'old school: proper sentences, sometimes a proverb',
];
// La vie de vestiaire, un sujet par édition à côté du foot (rien qui change les faits, rien qui sort du groupe).
const SIDE_TOPICS = [
  'the music in the bus or in the dressing room (who chooses it, the song everyone hates)',
  'a video-game tournament between teammates (the football game on the console)',
  'the food at the training centre or a team meal',
  'who arrived last at training (friendly teasing, no sanction)',
  "the recovery session: ice bath, stretching, the physio's table",
  'the photos or the video of the squad posted by the club',
  'the weather at training',
  'the outfits and the bags for the trip',
  "a teammate's new haircut or new boots",
];
const ELSEWHERE_TOPIC = 'a big match of football elsewhere that they watched (FACTS.football_elsewhere only: exact scores and scorers)';

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const daysTo = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
const hash = (v) => [...String(v)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Hasard reproductible (le même message a toujours les mêmes réactions et la même heure).
function seeded(seed) {
  let a = hash(seed);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Sa façon d'écrire, gardée dans le groupe (group.texting) : un nouveau venu prend la moins portée du vestiaire, pour
// que les styles soient répartis ; ensuite elle ne change plus.
function textingOf(group, name) {
  const map = (group.texting = group.texting || {});
  if (!Number.isInteger(map[name])) {
    const uses = TEXTING.map(() => 0);
    for (const [n, k] of Object.entries(map)) if (group.players.includes(n) && uses[k] !== undefined) uses[k]++;
    const start = hash(String(name).toLowerCase()) % TEXTING.length;
    const order = TEXTING.map((_, k) => (start + k) % TEXTING.length);
    map[name] = order.reduce((best, k) => (uses[k] < uses[best] ? k : best), order[0]);
  }
  return TEXTING[map[name]] || TEXTING[0];
}

// Le staff d'un club : des noms inventés, toujours les mêmes pour ce club.
function staffFor(clubRef) {
  const h = hash(clubRef);
  return STAFF_ROLES.map((role, i) => ({ name: `${FIRST_NAMES[(h + i * 5) % FIRST_NAMES.length]} ${LAST_NAMES[(h + i * 7) % LAST_NAMES.length]}`, role }));
}

// Ses coéquipiers du moment, sans lui ; vide si la base de noms du jeu n'est pas disponible.
function rosterOf(s) {
  const names = s.rosters?.mine?.length ? s.rosters.mine : (s.squad || []).map((p) => (p.me ? null : p.name));
  return [...new Set(names.filter((n) => n && n !== s.player?.name))];
}

// L'heure d'un message dans la journée du jeu (minutes depuis minuit) : le premier du jour dans la matinée, les suivants
// quelques minutes après le précédent.
function clockFor(group, message) {
  if (Number.isInteger(message.clock)) return message.clock;
  const prev = [...group.messages].reverse().find((m) => m.gameDate === message.gameDate && Number.isInteger(m.clock));
  const rand = seeded(`${message.text || ''}|${message.gameDate}|${group.messages.length}`);
  const t = prev ? prev.clock + 2 + Math.floor(rand() * (message.who === 'me' ? 14 : 36)) : 8 * 60 + 20 + Math.floor(rand() * 110);
  return Math.min(t, 23 * 60 + 58);
}

// Réactions emoji sous un message (sans IA) : d'après ce qu'il dit, un peu plus d'une fois sur deux ; toujours sous les
// siens quand le groupe lui répond. [[emoji, nombre], …]
function reactionsFor(group, m, { mine = false } = {}) {
  const rand = seeded(`${m.text}|${m.gameDate}|${m.from || 'me'}|réactions`);
  if (!mine && rand() > 0.55) return null;
  const t = String(m.text || '').toLowerCase();
  const kinds = [];
  if (/😂|🤣|😅|mdr|ptdr|haha|hahah|lol|xd|jaja|kkk|ahah/.test(t)) kinds.push('😂');
  if (/🔥|bravo|propre|incroyable|golazo|énorme|monstre|what a|unreal|crack|fenomen|top/.test(t)) kinds.push('🔥');
  if (m.role === 'coach' || /💪|allez|focus|lâche rien|come on|let'?s go|vamos|forza|los geht|bora/.test(t)) kinds.push('💪');
  if (/merci|thanks|thank you|grazie|gracias|obrigad|danke|❤️/.test(t)) kinds.push('❤️');
  if (!kinds.length) kinds.push(rand() < 0.6 ? '👍' : '💪');
  const crowd = Math.max(1, Math.min(8, group.players.length));
  return kinds.slice(0, 2).map((e, k) => [e, 1 + Math.floor(rand() * (k ? 3 : crowd))]);
}

function addMessage(group, message) {
  const at = Date.now();
  group.messages.push(message.who === 'system' ? { ...message, at } : { ...message, clock: clockFor(group, message), at });
  group.messages = group.messages.slice(-MAX_MESSAGES);
  if (message.who === 'them') group.unread = (group.unread || 0) + 1;
}
const addEvent = (group, event, gameDate, name) => addMessage(group, { who: 'system', event, gameDate, ...(name ? { name } : {}) });

const isNational = (g) => g.scope === 'national';
const activeHuddle = (state) => (state.huddles || []).find((g) => !isNational(g) && !g.left && g.clubRef === state.snapshot?.club?.ref) || null;
// Le groupe de sa sélection, s'il est dans la liste du moment.
const nationalHuddle = (state, snapshot) => (state.huddles || []).find((g) => isNational(g) && !g.left && g.clubRef === snapshot.nationalTeam?.ref) || null;

// L'effectif et l'entraîneur du moment : qui arrive, qui part. Sans noms à cette synchro, on ne fait partir personne.
function updateMembers(group, players, coach, date) {
  if (players.length) {
    const joined = players.filter((n) => !group.players.includes(n));
    const gone = group.players.filter((n) => !players.includes(n));
    for (const name of gone.slice(0, MOVES_SHOWN)) addEvent(group, 'left', date, name);
    for (const name of joined.slice(0, MOVES_SHOWN)) addEvent(group, 'joined', date, name);
    group.players = players;
  }
  if (coach && !same(coach, group.coach)) {
    if (group.coach) addEvent(group, 'left', date, group.coach);
    addEvent(group, 'joined', date, coach);
    group.coach = coach;
  }
}

// Le prochain match, annoncé une fois par l'intendant dans les jours qui le précèdent.
function announceNext(group, next, ownRef, date, language) {
  if (!next?.id || next.id === group.announced || daysTo(date, next.date) > ANNOUNCE_DAYS) return;
  const L = postTexts(language);
  const manager = group.staff.find((p) => p.role === 'manager');
  group.announced = next.id;
  const opponent = next.homeRef === ownRef ? next.away : next.home;
  addMessage(group, { who: 'them', from: manager.name, role: 'manager', gameDate: date, reactions: [['👍', 3 + (hash(next.id) % 9)]], text: L.huddle.nextMatch(opponent, L.date(next.date, { weekday: 'long', day: 'numeric', month: 'long' }), Number.isInteger(next.hour) ? next.hour : null, next.stadium || null) });
}

// La sélection : il entre dans le groupe quand il est dans la liste, il en sort quand il n'y est plus.
function syncNational(state, snapshot, { language, newId }) {
  const nt = snapshot.nationalTeam;
  const date = snapshot.gameDate;
  for (const g of state.huddles) {
    if (isNational(g) && !g.left && !(nt?.inSquad && g.clubRef === nt.ref)) { g.left = date; addEvent(g, 'you_left', date); }
  }
  if (!nt?.inSquad) return;
  const players = (nt.squad || []).filter((n) => n && n !== snapshot.player?.name);
  let group = state.huddles.find((g) => isNational(g) && g.clubRef === nt.ref);
  if (!group) {
    group = { id: newId(), scope: 'national', clubRef: nt.ref, club: nt.name, coach: nt.coach || null, staff: staffFor(nt.ref), players, messages: [], unread: 0, left: null, announced: null };
    state.huddles.push(group);
    addEvent(group, 'created', date);
  } else {
    if (group.left) { group.left = null; addEvent(group, 'you_back', date); }
    updateMembers(group, players, nt.coach || null, date);
  }
  announceNext(group, nt.next, nt.ref, date, language);
}

// À chaque synchro : le groupe de son club (il quitte celui de son ancien club), l'effectif du moment, le prochain match.
function syncHuddle(state, snapshot, { language = 'fr', newId }) {
  const club = snapshot.club;
  if (!club?.name) return null;
  const date = snapshot.gameDate;
  const groups = (state.huddles = state.huddles || []);
  for (const g of groups) {
    if (!isNational(g) && !g.left && g.clubRef !== club.ref) { g.left = date; addEvent(g, 'you_left', date); }
  }
  const players = rosterOf(snapshot);
  const coach = snapshot.coaches?.mine || null;
  let group = groups.find((g) => !isNational(g) && g.clubRef === club.ref);
  if (!group) {
    group = { id: newId(), clubRef: club.ref, club: club.name, coach, staff: staffFor(club.ref), players, messages: [], unread: 0, left: null, announced: null };
    groups.push(group);
    addEvent(group, 'created', date);
  } else {
    if (group.left) { group.left = null; addEvent(group, 'you_back', date); }
    updateMembers(group, players, coach, date);
  }
  announceNext(group, snapshot.next, club.ref, date, language);
  syncNational(state, snapshot, { language, newId });
  return group;
}

// Le membre qui porte ce nom, avec son rôle (aucun pour un joueur) ; le joueur lui-même n'en fait pas partie.
function memberOf(group, name) {
  if (same(name, group.coach)) return { name: group.coach, role: 'coach' };
  const staff = group.staff.find((p) => same(p.name, name));
  if (staff) return staff;
  const player = group.players.find((n) => same(n, name));
  return player ? { name: player, role: null } : null;
}

// Messages écrits par l'IA : seulement des membres du groupe, jamais lui, pas plus de deux par personne.
function addGroupMessages(group, list, gameDate, max = EDITION_MESSAGES) {
  const count = new Map();
  let added = 0;
  const waiting = group.messages.filter((m) => m.who !== 'system').at(-1);
  for (const m of Array.isArray(list) ? list : []) {
    if (added >= max) break;
    const who = memberOf(group, m?.from);
    const text = String(m?.text || '').trim().slice(0, TEXT_MAX);
    if (!who || !text || (count.get(who.name) || 0) >= 2) continue;
    count.set(who.name, (count.get(who.name) || 0) + 1);
    const msg = { who: 'them', from: who.name, ...(who.role ? { role: who.role } : {}), gameDate, text };
    const reactions = reactionsFor(group, msg);
    addMessage(group, reactions ? { ...msg, reactions } : msg);
    added++;
  }
  if (added && waiting?.who === 'me' && !waiting.reactions) waiting.reactions = reactionsFor(group, waiting, { mine: true });
  return added;
}

// Le groupe ce jour-là, décidé par le code (l'IA n'écrit que les textes ; avant, elle faisait parler toujours les mêmes
// et redisait « focus ce soir ») : qui parle (ceux qui ont marqué, fait la passe ou brillé au dernier match, un entré
// en jeu, puis ceux qui n'ont rien dit depuis longtemps), chacun dans son style ; un sujet de vie de vestiaire qui
// tourne ; le coach seulement après une défaite ou s'il n'a pas écrit la fois d'avant.
// last : le dernier match s'il vient d'être joué ; elsewhere : le football mondial est dans les faits de l'édition.
function huddleToday(group, { last = null, elsewhere = false, edition = 0, date = '' } = {}) {
  const rand = seeded(`${group.clubRef}|${date}|${edition}`);
  const said = new Map();
  group.messages.forEach((m, i) => { if (m.who === 'them' && m.from) said.set(m.from, i); });
  const voices = [];
  const add = (name, why) => {
    const n = group.players.find((p) => same(p, name));
    if (n && voices.length < 4 && !voices.some((v) => v.name === n)) voices.push({ name: n, style: textingOf(group, n), why });
  };
  const lineup = last?.clubLineup || [];
  for (const p of lineup) if (p.goals) add(p.name, p.goals > 1 ? `scored ${p.goals} goals in the last match` : 'scored in the last match');
  for (const p of lineup) if (p.assists) add(p.name, 'gave an assist in the last match');
  if (voices.length < 2) {
    const best = lineup.filter((p) => p.rating && !voices.some((v) => same(v.name, p.name))).sort((a, b) => b.rating - a.rating)[0];
    if (best) add(best.name, 'one of the best rated players of the last match');
  }
  const sub = lineup.find((p) => p.starter === false && p.minutes);
  if (sub && voices.length < 3) add(sub.name, 'came on in the last match');
  // Ceux qui n'ont pas parlé dans les derniers messages d'abord (tirés parmi les huit plus silencieux), les autres ensuite.
  const talked = new Set(group.messages.slice(-CONTEXT).filter((m) => m.who === 'them').map((m) => m.from));
  const others = group.players.filter((n) => !voices.some((v) => v.name === n)).sort((a, b) => (said.get(a) ?? -1) - (said.get(b) ?? -1));
  const quiet = others.filter((n) => !talked.has(n)).slice(0, 8);
  while (voices.length < 4 && quiet.length) add(quiet.splice(Math.floor(rand() * quiet.length), 1)[0], 'has not written in the group for a while');
  for (const n of others) if (voices.length < 4 && talked.has(n)) add(n, 'is often in the chat');
  // La dernière fois que le groupe a parlé (hors annonce de l'intendant) : le coach y était-il ?
  const before = group.messages.filter((m) => m.who === 'them' && m.role !== 'manager' && m.gameDate < date);
  const prevDay = before.at(-1)?.gameDate;
  const coachSpoke = Boolean(prevDay) && before.some((m) => m.gameDate === prevDay && m.role === 'coach');
  const [h, a] = last?.score || [];
  const lost = Boolean(last?.played) && (last.venue === 'domicile' ? h < a : h > a);
  const topics = elsewhere ? [...SIDE_TOPICS, ELSEWHERE_TOPIC] : SIDE_TOPICS;
  return {
    voices_today: voices,
    side_topic: topics[(hash(date) + edition) % topics.length],
    coach_speaks: Boolean(group.coach) && (lost || !coachSpoke),
  };
}

// Ce que l'IA sait du groupe : ses membres et les derniers messages.
function huddleContext(group) {
  return {
    group: group.club,
    kind: isNational(group) ? 'national team' : 'club',
    coach: group.coach || null,
    staff: group.staff.map((p) => ({ name: p.name, job: ROLE_FOR_AI[p.role] })),
    players: group.players,
    recent: group.messages.filter((m) => m.who !== 'system').slice(-CONTEXT).map((m) => ({ from: m.who === 'me' ? 'THE PLAYER' : m.from, date: m.gameDate, text: m.text })),
    // Comment écrivent les joueurs qui parlent en ce moment : chacun garde sa façon d'écrire.
    styles: Object.fromEntries([...new Set(group.messages.slice(-CONTEXT).filter((m) => m.who === 'them' && !m.role).map((m) => m.from))]
      .filter((n) => group.players.includes(n)).map((n) => [n, textingOf(group, n)])),
  };
}

module.exports = { staffFor, rosterOf, activeHuddle, nationalHuddle, syncHuddle, memberOf, addMessage, addGroupMessages, huddleContext, huddleToday, reactionsFor, textingOf, TEXTING, SIDE_TOPICS, REPLY_MESSAGES, NATIONAL_MESSAGES };
