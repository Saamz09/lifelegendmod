'use strict';
// Huddle : le groupe privé de son club. Membres, staff inventé, arrivées et départs, annonce du prochain match, messages
// écrits par l'IA (seulement des membres, jamais lui), changement de club.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { staffFor, rosterOf, activeHuddle, nationalHuddle, syncHuddle, memberOf, addMessage, addGroupMessages, huddleContext } = require(path.join(ROOT, 'src/world/huddle.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));
const { draftItems } = require(path.join(ROOT, 'src/ai/factcheck.js'));

let ids = 0;
const newId = () => `id${++ids}`;
const snap = (extra = {}) => ({
  gameDate: '2026-10-20',
  club: { name: 'AS Nancy Lorraine', ref: 8 },
  player: { name: 'Ilan Morel' },
  coaches: { mine: 'Oswald Tanchot' },
  rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Thierno Baldé'] },
  next: { id: 'm1', date: '2026-10-31', hour: 19, home: 'AS Nancy Lorraine', away: 'FC Metz', homeRef: 8, awayRef: 9, stadium: 'Stade Marcel-Picot' },
  ...extra,
});
const start = (s = snap()) => { const state = { snapshot: s }; return { state, group: syncHuddle(state, s, { newId }) }; };
const events = (g) => g.messages.filter((m) => m.who === 'system').map((m) => [m.event, m.name].filter(Boolean).join(' '));

test('membres : ses coéquipiers sans lui, l’entraîneur et un staff inventé qui ne change pas', () => {
  const { group } = start();
  assert.deepStrictEqual(group.players, ['Enzo Basilio', 'Thierno Baldé']);
  assert.strictEqual(group.coach, 'Oswald Tanchot');
  assert.deepStrictEqual(group.staff.map((p) => p.role), ['assistant', 'fitness', 'physio', 'manager']);
  assert.strictEqual(new Set(group.staff.map((p) => p.name)).size, 4, 'quatre personnes');
  assert.deepStrictEqual(staffFor(8), staffFor(8), 'toujours les mêmes pour ce club');
  assert.notDeepStrictEqual(staffFor(8), staffFor(9), 'un autre club a son staff');
  assert.deepStrictEqual(events(group), ['created']);
  // Sans liste d'effectif : les noms connus du classement des joueurs ; il n'en fait jamais partie.
  assert.deepStrictEqual(rosterOf(snap({ rosters: {}, squad: [{ name: 'Ilan Morel', me: true }, { name: 'Enzo Basilio' }, { name: null }] })), ['Enzo Basilio']);
  assert.deepStrictEqual(rosterOf(snap({ rosters: {}, squad: [] })), []);
});

test('arrivées et départs : d’après la sauvegarde, jamais parce que les noms manquent', () => {
  const { state, group } = start();
  syncHuddle(state, snap({ rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Hugo Barbier'] } }), { newId });
  assert.deepStrictEqual(events(group).slice(1), ['left Thierno Baldé', 'joined Hugo Barbier']);
  assert.deepStrictEqual(group.players, ['Enzo Basilio', 'Hugo Barbier']);
  const count = group.messages.length;
  syncHuddle(state, snap({ rosters: { mine: [] }, squad: [] }), { newId });
  assert.strictEqual(group.messages.length, count, 'base de noms absente : personne ne part');
  assert.deepStrictEqual(group.players, ['Enzo Basilio', 'Hugo Barbier']);
  syncHuddle(state, snap({ rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Hugo Barbier'] }, coaches: { mine: 'Nouveau Coach' } }), { newId });
  assert.deepStrictEqual(events(group).slice(-2), ['left Oswald Tanchot', 'joined Nouveau Coach']);
  assert.strictEqual(group.coach, 'Nouveau Coach');
});

test('prochain match : annoncé une fois par l’intendant, dans les 3 jours qui le précèdent, dans sa langue', () => {
  const { state, group } = start();
  assert.strictEqual(group.messages.filter((m) => m.who === 'them').length, 0, 'trop tôt');
  assert.strictEqual(group.unread, 0);
  const near = snap({ gameDate: '2026-10-29' });
  state.snapshot = near;
  syncHuddle(state, near, { language: 'fr', newId });
  const said = group.messages.filter((m) => m.who === 'them');
  assert.strictEqual(said.length, 1);
  assert.strictEqual(said[0].from, group.staff.find((p) => p.role === 'manager').name);
  assert.strictEqual(said[0].role, 'manager');
  assert.strictEqual(said[0].text, 'Prochain match : FC Metz, samedi 31 octobre à 19h, Stade Marcel-Picot. Merci d’être à l’heure.');
  assert.strictEqual(group.unread, 1);
  syncHuddle(state, near, { language: 'fr', newId });
  assert.strictEqual(group.messages.filter((m) => m.who === 'them').length, 1, 'une seule fois par match');

  const away = snap({ gameDate: '2026-10-29', next: { id: 'm2', date: '2026-10-31', hour: null, home: 'FC Metz', away: 'AS Nancy Lorraine', homeRef: 9, awayRef: 8, stadium: null } });
  const english = syncHuddle({ snapshot: away }, away, { language: 'en', newId });
  assert.strictEqual(english.messages.at(-1).text, 'Next match: FC Metz, Saturday 31 October. Please be on time.', 'à l’extérieur, sans heure ni stade connus');
});

test('messages de l’IA : seulement des membres, jamais lui, deux par personne au plus', () => {
  const { group } = start();
  const staff = group.staff[1];
  const n = addGroupMessages(group, [
    { from: 'enzo basilio', text: '  bien joué  ' },
    { from: 'Ilan Morel', text: 'je parle à sa place' },
    { from: 'Quelqu’un d’autre', text: 'inconnu' },
    { from: 'Oswald Tanchot', text: 'Repos demain.' },
    { from: staff.name, text: 'Récup à 10h.' },
    { from: 'Enzo Basilio', text: 'deuxième' },
    { from: 'Enzo Basilio', text: 'troisième : de trop' },
    { from: 'Thierno Baldé', text: '' },
    null,
  ], '2026-10-20');
  assert.strictEqual(n, 4);
  const said = group.messages.filter((m) => m.who === 'them').map((m) => [m.from, m.role || null, m.text]);
  assert.deepStrictEqual(said, [['Enzo Basilio', null, 'bien joué'], ['Oswald Tanchot', 'coach', 'Repos demain.'], [staff.name, staff.role, 'Récup à 10h.'], ['Enzo Basilio', null, 'deuxième']]);
  assert.strictEqual(group.unread, 4);
  assert.strictEqual(addGroupMessages(group, 'pas une liste', '2026-10-20'), 0);
  assert.strictEqual(memberOf(group, 'Ilan Morel'), null);

  const big = start().group;
  assert.strictEqual(addGroupMessages(big, ['a', 'b', 'c', 'd'].flatMap((x) => [{ from: 'Enzo Basilio', text: x }, { from: 'Thierno Baldé', text: x }, { from: 'Oswald Tanchot', text: x }, ...big.staff.map((p) => ({ from: p.name, text: x }))]), '2026-10-20', 3), 3, 'le plafond demandé');

  // Ce que l'IA reçoit : ses mots marqués comme les siens, sans les lignes du système.
  addMessage(group, { who: 'me', text: 'merci', gameDate: '2026-10-20' });
  const ctx = huddleContext(group);
  assert.deepStrictEqual(ctx.players, ['Enzo Basilio', 'Thierno Baldé']);
  assert.strictEqual(ctx.recent.at(-1).from, 'THE PLAYER');
  assert.ok(ctx.recent.every((m) => m.text));
  assert.ok(ctx.staff.every((p) => p.name && p.job));
});

test('changement de club : il quitte le groupe, rejoint le nouveau, l’ancien reste à relire', () => {
  const { state, group } = start();
  const reims = snap({ club: { name: 'Stade de Reims', ref: 3 }, coaches: { mine: 'Autre Coach' }, rosters: { mine: ['Ilan Morel', 'Mohamed Daramy'] }, next: null });
  state.snapshot = reims;
  const other = syncHuddle(state, reims, { newId });
  assert.strictEqual(group.left, reims.gameDate);
  assert.strictEqual(events(group).at(-1), 'you_left');
  assert.notStrictEqual(other, group);
  assert.strictEqual(activeHuddle(state), other);
  assert.deepStrictEqual(other.players, ['Mohamed Daramy']);
  assert.notDeepStrictEqual(other.staff, group.staff);
  // Il revient : le même groupe, ses messages avec lui.
  const back = snap({ gameDate: '2027-07-01', rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Thierno Baldé'] } });
  state.snapshot = back;
  assert.strictEqual(syncHuddle(state, back, { newId }), group);
  assert.strictEqual(group.left, null);
  assert.strictEqual(events(group).at(-1), 'you_back');
  assert.strictEqual(other.left, back.gameDate);
});

test('sélection : un groupe à la convocation, qu’il quitte quand il n’est plus dans la liste', () => {
  const nt = (extra = {}) => ({ ref: 77, name: 'Maroc', coach: 'Sélectionneur Essai', inSquad: true, squad: ['Joueur Un', 'Joueur Deux'], next: null, ...extra });
  const { state, group: club } = start();
  assert.strictEqual(state.huddles.length, 1, 'pas de sélection : pas de groupe');
  const notCalled = snap({ nationalTeam: nt({ inSquad: false }) });
  syncHuddle(state, notCalled, { newId });
  assert.strictEqual(state.huddles.length, 1, 'une sélection sans lui : pas de groupe');

  const called = snap({ gameDate: '2026-11-08', nationalTeam: nt({ next: { id: 'n1', date: '2026-11-10', hour: 20, home: 'Maroc', away: 'Égypte', homeRef: 77, awayRef: 5, stadium: null } }), next: null });
  state.snapshot = called;
  syncHuddle(state, called, { language: 'fr', newId });
  const group = nationalHuddle(state, called);
  assert.strictEqual(group.scope, 'national');
  assert.deepStrictEqual([group.club, group.coach, group.players], ['Maroc', 'Sélectionneur Essai', ['Joueur Un', 'Joueur Deux']]);
  assert.notDeepStrictEqual(group.staff, club.staff, 'son propre staff');
  assert.deepStrictEqual(events(group), ['created']);
  assert.strictEqual(group.messages.at(-1).text, 'Prochain match : Égypte, mardi 10 novembre à 20h. Merci d’être à l’heure.');
  assert.strictEqual(activeHuddle(state), club, 'le groupe du club ne bouge pas');
  assert.strictEqual(club.left, null);
  assert.strictEqual(huddleContext(group).kind, 'national team');
  assert.strictEqual(huddleContext(club).kind, 'club');

  // Nouvelle liste : qui arrive, qui part.
  const list = snap({ gameDate: '2026-11-09', nationalTeam: nt({ squad: ['Joueur Un', 'Joueur Trois'] }), next: null });
  syncHuddle(state, list, { newId });
  assert.deepStrictEqual(events(group).slice(1), ['left Joueur Deux', 'joined Joueur Trois']);

  // Il change de club : la sélection reste.
  const moved = snap({ gameDate: '2026-11-20', club: { name: 'Stade de Reims', ref: 3 }, nationalTeam: nt({ squad: ['Joueur Un', 'Joueur Trois'] }), next: null });
  state.snapshot = moved;
  syncHuddle(state, moved, { newId });
  assert.strictEqual(club.left, moved.gameDate);
  assert.strictEqual(group.left, null);

  // Hors de la liste : il sort du groupe, sans le perdre ; rappelé : il y revient.
  const dropped = snap({ gameDate: '2027-03-01', club: { name: 'Stade de Reims', ref: 3 }, nationalTeam: nt({ inSquad: false, squad: ['Joueur Un'] }), next: null });
  syncHuddle(state, dropped, { newId });
  assert.strictEqual(group.left, dropped.gameDate);
  assert.strictEqual(events(group).at(-1), 'you_left');
  assert.strictEqual(nationalHuddle(state, dropped), null);
  const back = snap({ gameDate: '2027-06-01', club: { name: 'Stade de Reims', ref: 3 }, nationalTeam: nt({ squad: ['Joueur Un'] }), next: null });
  syncHuddle(state, back, { newId });
  assert.strictEqual(nationalHuddle(state, back), group);
  assert.strictEqual(state.huddles.filter((g) => g.scope === 'national').length, 1);
  assert.ok(events(group).includes('you_back'));
});

test('consignes : Huddle est privé, demandé seulement si le groupe existe, et passe à la vérification des faits', () => {
  const on = prompts.editionSystem({ language: 'fr' }, { transversale: true, huddle: true });
  const off = prompts.editionSystem({ language: 'fr' }, { transversale: true });
  assert.match(on, /"huddle": \[ \{"from": string, "text": string\} \]/);
  assert.match(on, /HUDDLE: here GROUP is MEMORY\.huddle/);
  assert.match(on, /nothing from MEMORY\.huddle appears in articles, Kop posts or emails/);
  assert.ok(!/huddle/i.test(off.replace(/MEMORY\.huddle/g, '')) && !off.includes('HUDDLE:'), 'sans groupe : rien de demandé');
  const reply = prompts.huddleSystem({ language: 'fr' });
  assert.match(reply, /never as the player/);
  assert.match(reply, /Offers, rumours, the agent and his private requests/);
  assert.match(prompts.huddleUser({ facts: {}, memory: {}, group: { group: 'x' } }), /^GROUP: \{"group":"x"\}$/m);
  assert.deepStrictEqual(draftItems({ huddle: [{ from: 'Enzo Basilio', text: 'on a gagné 3-0' }] }), [{ item: 'huddle.0', author: 'Enzo Basilio', text: 'on a gagné 3-0' }]);
  const national = prompts.editionSystem({ language: 'fr' }, { transversale: true, huddle: true, huddleNational: true });
  assert.match(national, /"huddle_national": \[/);
  assert.match(national, /HUDDLE OF THE NATIONAL TEAM/);
  assert.ok(!on.includes('huddle_national'), 'demandé seulement quand sa sélection fait l’actualité');
  assert.deepStrictEqual(draftItems({ huddle_national: [{ from: 'Joueur Un', text: 'bienvenue' }] }), [{ item: 'huddle_national.0', author: 'Joueur Un', text: 'bienvenue' }]);
});

test('clavier d’emoji : les huit catégories, sans doublon ni couleur de peau, avec les séquences et les drapeaux', () => {
  const box = { window: {} };
  require('vm').runInNewContext(require('fs').readFileSync(require('path').join(__dirname, '../lifelegend/emoji.js'), 'utf8'), box);
  const cats = box.window.LL_EMOJI;
  assert.deepStrictEqual(Object.keys(cats), ['smileys', 'animals', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags']);
  const all = Object.values(cats).flatMap((s) => s.split(' '));
  assert.ok(all.length >= 1900, `${all.length} emoji`);
  assert.strictEqual(new Set(all).size, all.length);
  assert.ok(!all.some((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e)));
  for (const e of ['⚽', '🧑\u200D🤝\u200D🧑', '👩\u200D💻', '🇫🇷', '🇲🇦', '❤\uFE0F']) assert.ok(all.includes(e), e);
  assert.ok(cats.activity.startsWith('⚽'));
});

// ---------- Plus de vie (2026-11-10) : le code choisit qui parle, le sujet de vestiaire, le coach ; heure et réactions ----------
const { huddleToday, reactionsFor, TEXTING, SIDE_TOPICS } = require(path.join(ROOT, 'src/world/huddle.js'));

test('groupe du jour : le buteur et le passeur du dernier match parlent, puis ceux qui se taisent ; chacun garde son style', () => {
  const { group } = start(snap({ rosters: { mine: ['Ilan Morel', 'Enzo Basilio', 'Thierno Baldé', 'Logan Ndenbe', 'Issam Bouaoune', 'Yanis Delaveau'] } }));
  addGroupMessages(group, [{ from: 'Logan Ndenbe', text: 'on lâche rien' }, { from: 'Enzo Basilio', text: 'focus ce soir' }], '2026-10-20');
  const last = { played: true, venue: 'domicile', score: [2, 1], clubLineup: [
    { name: 'Issam Bouaoune', starter: true, minutes: 90, rating: 7, goals: 2, assists: 0 },
    { name: 'Yanis Delaveau', starter: true, minutes: 90, rating: 6.5, goals: 0, assists: 1 },
    { name: 'Ilan Morel', starter: true, minutes: 90, rating: 6, goals: 0, assists: 0 },
  ] };
  const t = huddleToday(group, { last, edition: 3, date: '2026-10-24' });
  assert.deepStrictEqual(t.voices_today.slice(0, 2).map((v) => v.name), ['Issam Bouaoune', 'Yanis Delaveau']);
  assert.match(t.voices_today[0].why, /scored 2 goals/);
  assert.ok(!t.voices_today.some((v) => v.name === 'Ilan Morel'), 'jamais lui');
  // Ceux qui viennent de parler passent après ceux qui se taisent.
  assert.strictEqual(t.voices_today[2].name, 'Thierno Baldé');
  assert.ok(t.voices_today.every((v) => TEXTING.includes(v.style)));
  const again = huddleToday(group, { last, edition: 4, date: '2026-10-25' });
  assert.strictEqual(again.voices_today[0].style, t.voices_today[0].style, 'le même style à chaque fois');
  assert.ok(SIDE_TOPICS.includes(t.side_topic) && t.side_topic !== again.side_topic, 'le sujet de vestiaire tourne');
});

test('groupe du jour : le coach écrit une fois sur deux, et toujours après une défaite', () => {
  const { group } = start();
  addGroupMessages(group, [{ from: 'Oswald Tanchot', text: 'Rigueur ce soir.' }], '2026-10-20');
  const win = { played: true, venue: 'domicile', score: [2, 0], clubLineup: [] };
  const loss = { played: true, venue: 'extérieur', score: [3, 1], clubLineup: [] };
  assert.strictEqual(huddleToday(group, { last: win, date: '2026-10-24' }).coach_speaks, false, 'il a parlé la dernière fois');
  assert.strictEqual(huddleToday(group, { last: loss, date: '2026-10-24' }).coach_speaks, true, 'après une défaite');
  addGroupMessages(group, [{ from: 'Enzo Basilio', text: 'grosse séance aujourd’hui' }], '2026-10-24');
  assert.strictEqual(huddleToday(group, { last: win, date: '2026-10-28' }).coach_speaks, true, 'il n’a pas parlé la fois d’avant');
});

test('heure et réactions : les messages du jour se suivent dans la journée ; son message reçoit des réactions quand on lui répond', () => {
  const { group } = start();
  addMessage(group, { who: 'me', text: 'les gars on joue vers l’avant svp', gameDate: '2026-10-20' });
  addGroupMessages(group, [{ from: 'Enzo Basilio', text: 'grave t’as raison 🔥' }, { from: 'Thierno Baldé', text: 'mdr il a pris le brassard lui 😂' }], '2026-10-20');
  const said = group.messages.filter((m) => m.who !== 'system');
  const clocks = said.map((m) => m.clock);
  assert.ok(clocks.every(Number.isInteger) && clocks.every((c, i) => !i || c > clocks[i - 1]), `heures croissantes : ${clocks}`);
  assert.ok(clocks.at(-1) <= 23 * 60 + 58);
  assert.ok(Array.isArray(said[0].reactions) && said[0].reactions.length, 'son message a des réactions');
  const fun = reactionsFor(group, { text: 'mdr il a pris le brassard lui 😂', gameDate: '2026-10-20', from: 'X' }, { mine: true });
  assert.strictEqual(fun[0][0], '😂');
  // L'annonce de l'intendant a ses 👍.
  const announce = group.messages.find((m) => m.role === 'manager');
  if (announce) assert.strictEqual(announce.reactions[0][0], '👍');
});

test('consigne de l’édition : le groupe du jour (voix, sujet, coach) et la vie de vestiaire', () => {
  const sys = prompts.editionSystem({ language: 'fr' }, { huddle: true });
  for (const k of ['GROUP.voices_today', 'GROUP.side_topic', 'GROUP.coach_speaks', 'GROUP.styles', '4 to 7 messages']) assert.ok(sys.includes(k), k);
});

test('vestiaire : les coéquipiers peuvent nommer leur vrai jeu vidéo (sa demande du 2026-11-10, plus réaliste)', () => {
  const { group } = start();
  addGroupMessages(group, [{ from: 'Enzo Basilio', text: 'tournoi FIFA au club house ce soir' }], '2026-10-20');
  assert.strictEqual(group.messages.at(-1).text, 'tournoi FIFA au club house ce soir');
  assert.doesNotMatch(prompts.editionSystem({ language: 'fr' }, { huddle: true }), /Never name a real video game/);
});
