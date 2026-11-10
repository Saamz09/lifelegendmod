'use strict';
// Conseils du coach à l'entraînement (src/world/coachAdvice.js) : le point faible vient de ses derniers matchs et de ses
// réglages, un conseil à la fois, et c'est la sauvegarde qui dit s'il a été suivi.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { adviceFor, coachAdvice, answerAdvice } = require(path.join(__dirname, '..', 'src/world/coachAdvice.js'));

const played = (me = {}, score = [1, 1]) => ({ played: true, venue: 'domicile', score, me: { minutes: 90, starter: true, goals: 0, assists: 1, ...me } });
const FOCUS = { shooting: 3, passing: 3, dribbling: 3, defending: 3, speed: 3, strength: 3, stamina: 3, goalkeeping: 0 };
const snap = (gameDate, { position = 'AC', focus = FOCUS, fixtures = [played(), played(), played()] } = {}) => ({
  gameDate, club: { name: 'AS Nancy Lorraine', coach: 'P. Hinschberger' }, fixtures, player: { profile: { position }, training: { focus } },
});
let n = 0;
const newId = () => `id${++n}`;

test('le point faible : finition, endurance, passes, défense ; rien s’il y met déjà assez de points ou s’il a peu joué', () => {
  assert.deepStrictEqual(adviceFor(snap('2026-10-24')), { area: 'shooting', reason: { goals: 0, matches: 3 } });
  assert.strictEqual(adviceFor(snap('2026-10-24', { focus: { ...FOCUS, shooting: 4, stamina: 4 } })), null, 'attaquant déjà à 4 sur 6 aux tirs');
  const tired = [played({ minutes: 60, goals: 1 }), played({ minutes: 62, goals: 1 }), played({ minutes: 65 })];
  assert.deepStrictEqual(adviceFor(snap('2026-10-24', { fixtures: tired })), { area: 'stamina', reason: { minutes: 62 } });
  assert.strictEqual(adviceFor(snap('2026-10-24', { position: 'MC', fixtures: [played({ assists: 0 }), played({ assists: 0 }), played({ assists: 0 })] })).area, 'passing');
  assert.strictEqual(adviceFor(snap('2026-10-24', { position: 'DC', fixtures: [played({}, [0, 3]), played({}, [1, 2]), played({}, [0, 2])] })).area, 'defending');
  assert.strictEqual(adviceFor(snap('2026-10-24', { fixtures: [played(), played()] })), null, 'moins de 3 matchs');
});

test('ses notes et sa forme : le domaine clé de son poste, l’endurance, et pas de reproche quand il vole', () => {
  const scored = (rating) => [played({ goals: 1, rating }), played({ goals: 1, rating }), played({ rating })];
  const withForm = (formArrowLevel, o = {}) => { const s = snap('2026-10-24', o); s.player.profile.formArrowLevel = formArrowLevel; return s; };
  assert.deepStrictEqual(adviceFor(snap('2026-10-24', { fixtures: scored(5) })), { area: 'dribbling', reason: { rating: 5, matches: 3 } });
  assert.strictEqual(adviceFor(snap('2026-10-24', { position: 'MC', fixtures: scored(5.5) })).area, 'passing', 'il a des passes décisives, mais de mauvaises notes');
  assert.strictEqual(adviceFor(snap('2026-10-24', { position: 'DC', fixtures: scored(5.5) })).area, 'defending');
  assert.deepStrictEqual(adviceFor(snap('2026-10-24', { position: 'GB', fixtures: scored(5.5) })), { area: 'goalkeeping', reason: { rating: 5.5, matches: 3 } });
  assert.strictEqual(adviceFor(snap('2026-10-24', { fixtures: scored(6) })), null, 'des notes correctes');
  assert.strictEqual(adviceFor(snap('2026-10-24', { fixtures: scored(5), focus: { ...FOCUS, dribbling: 4 } })), null, 'il y met déjà assez de points');
  assert.strictEqual(adviceFor(snap('2026-10-24', { fixtures: [played({ rating: 8 }), played({ rating: 7.5 }), played({ rating: 7.5 })] })), null, 'il vole : même sans but, pas de reproche');

  assert.deepStrictEqual(adviceFor(withForm(1, { fixtures: scored(6) })), { area: 'stamina', reason: { form: 1 } });
  assert.strictEqual(adviceFor(withForm(2, { fixtures: scored(6) })), null, 'forme normale');
  assert.strictEqual(adviceFor(withForm(0, { fixtures: scored(6), focus: { ...FOCUS, stamina: 4 } })), null, 'endurance déjà travaillée');

  const state = { mail: [] };
  const low = coachAdvice(state, snap('2026-10-24', { fixtures: scored(5.5) }), { newId });
  assert.strictEqual(low.mail.subject, 'Entraînement : le dribble');
  assert.match(low.mail.messages[0].body, /^5,5 de moyenne sur tes 3 derniers matchs/);
  const tired = coachAdvice({ mail: [] }, withForm(1, { fixtures: scored(6) }), { newId, language: 'en' });
  assert.match(tired.mail.messages[0].body, /^Your form is dipping/);
});

test('un conseil à la fois : le mail du coach, sa réponse, puis la sauvegarde dit s’il est suivi', () => {
  const state = { mail: [] };
  const first = coachAdvice(state, snap('2026-10-24'), { newId });
  assert.deepStrictEqual([first.mail.from, first.mail.role, first.mail.subject, first.mail.advice], ['P. Hinschberger', 'coach', 'Entraînement : la finition', state.coachAdvice.id]);
  assert.match(first.mail.messages[0].body, /0 but sur tes 3 derniers matchs/);
  state.mail.push(first.mail);
  assert.strictEqual(coachAdvice(state, snap('2026-10-31'), { newId }).mail, null, 'déjà un conseil en cours');

  answerAdvice(state, 'follow', { gameDate: '2026-10-25' });
  assert.deepStrictEqual(first.mail.messages.at(-1), { who: 'me', body: 'Bien reçu, coach. Je change mon programme dès cette semaine.', gameDate: '2026-10-25' });
  assert.throws(() => answerAdvice(state, 'ignore', { gameDate: '2026-10-25' }), /n’attend plus de réponse/);

  const done = coachAdvice(state, snap('2026-10-31', { focus: { ...FOCUS, shooting: 5 } }), { newId });
  assert.deepStrictEqual(done.outcome, { area: 'shooting', followed: true, his_answer: 'follow' });
  assert.strictEqual(state.coachAdvice.status, 'followed');
  assert.strictEqual(done.mail, null, 'pas de nouveau conseil avant 30 jours');
});

test('sans changement au bout de 3 semaines : pas suivi, même s’il avait dit oui ; nouveau conseil après 30 jours', () => {
  const state = { mail: [] };
  coachAdvice(state, snap('2026-10-01'), { newId });
  answerAdvice(state, 'follow', { gameDate: '2026-10-02' });
  assert.strictEqual(coachAdvice(state, snap('2026-10-10'), { newId }).outcome, null, 'encore le temps');
  const late = coachAdvice(state, snap('2026-10-22'), { newId });
  assert.deepStrictEqual(late.outcome, { area: 'shooting', followed: false, his_answer: 'follow' });
  assert.ok(coachAdvice(state, snap('2026-11-01'), { newId }).mail, 'nouveau conseil');
});
