'use strict';
// Conférence d'après-match : menée par les journalistes qui suivent la ligue, qui vouvoient le joueur ; le rédacteur du blog des
// supporters n'est là que de temps en temps, et lui seul peut le tutoyer. Le compte rendu paraît dans La Transversale.
// Réponses de l'IA simulées : aucune requête ne part.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const providers = require(path.join(__dirname, '..', 'src/ai/providers.js'));
const asked = [];
let reply = () => ({});
providers.complete = async (_settings, _key, req) => { asked.push(req); return JSON.stringify(reply(req, asked.length)); };
const world = require(path.join(__dirname, '..', 'src/world/world.js'));

// La copie de sa carrière (tests/fixtures, jamais publiée) : sans elle, ces tests sont mis de côté.
const FIXTURE = path.join(__dirname, 'fixtures/state.json');
const fixture = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : null;
const skip = fixture ? false : 'copie de carrière absente (tests/fixtures/state.json)';
const career = (id) => {
  const state = JSON.parse(fixture);
  state.press = { id, matchId: state.snapshot.last?.id, match: 'AS Nancy Lorraine 0-3 USL Dunkerque', gameDate: '2026-10-24', status: 'pending', questions: null, answers: null };
  return { state, store: { activeCareer: () => state, getKey: () => 'k', saveCareer() {} } };
};
const settings = { provider: 'google', model: 'gemini-3.6-flash', language: 'fr', factCheck: false };
const politely = () => ({ questions: [{ journalist: 'x', outlet: 'y', question: 'Comment avez-vous vécu ce match ?' }, { journalist: 'x', outlet: 'y', question: 'Que retenez-vous de cette défaite ?' }, { journalist: 'Paul Martin', outlet: 'Le Courrier du foot', question: 'Votre avenir est-il ici ?' }] });
// Un identifiant dont le blog obtient une question (multiple de 4), un autre non.
const WITH_BLOG = '000004abcdef', LEAGUE_ONLY = '000005abcdef';

test('les journalistes de la ligue posent les questions, le blog une conférence sur quatre', { skip }, () => {
  const { state } = career(LEAGUE_ONLY);
  const desk = world.transversaleDesk(state).map((w) => w.name);
  const panel = world.pressPanel(state, state.press);
  assert.strictEqual(panel.length, 3);
  assert.ok(panel.every((p) => p.address === 'formal'), 'tous vouvoient');
  assert.ok(panel.every((p) => p.name !== state.writers.local_beat_writer), 'pas le blog');
  assert.ok(desk.includes(panel[0].name) && desk.includes(panel[1].name) && panel[0].name !== panel[1].name, 'deux plumes différentes de La Transversale');
  assert.strictEqual(panel[2].name, null, 'et un confrère inventé');

  const blog = career(WITH_BLOG).state;
  const third = world.pressPanel(blog, blog.press)[2];
  assert.strictEqual(third.name, blog.writers.local_beat_writer);
  assert.strictEqual(third.outlet, blog.localPaper.name);
  assert.strictEqual(third.address, 'familiar', 'lui seul tutoie');

  const seats = [...Array(400).keys()].map((n) => n.toString(16).padStart(6, '0')).filter((id) => { const c = career(id).state; return world.pressPanel(c, c.press)[2].address === 'familiar'; });
  assert.strictEqual(seats.length, 100, 'une conférence sur quatre');
});

test('les noms de la tribune sont imposés, et le fauteuil libre ne va jamais au blog', { skip }, async () => {
  asked.length = 0;
  const { state, store } = career(LEAGUE_ONLY);
  const panel = world.pressPanel(state, state.press);
  reply = () => ({ questions: [{ journalist: 'Inconnu', outlet: 'Autre', question: 'Comment avez-vous vécu ce match ?' }, { journalist: 'Inconnu', outlet: 'Autre', question: 'Que retenez-vous de cette défaite ?' }, { journalist: state.writers.local_beat_writer, outlet: state.localPaper.name, question: 'Votre avenir est-il ici ?' }] });
  await world.openPress({ store, settings, progress: () => {} });
  assert.strictEqual(asked.length, 1);
  assert.deepStrictEqual(state.press.questions.slice(0, 2).map((q) => [q.journalist, q.outlet]), [[panel[0].name, 'La Transversale'], [panel[1].name, 'La Transversale']]);
  assert.notStrictEqual(state.press.questions[2].journalist, state.writers.local_beat_writer);
  assert.notStrictEqual(state.press.questions[2].outlet, state.localPaper.name);
  assert.match(asked[0].system, /address "formal"/);
  assert.match(asked[0].user, /"panel":\[/);
  assert.strictEqual(state.press.status, 'open');
});

test('un journaliste de la ligue qui tutoie : les questions sont redemandées une fois', { skip }, async () => {
  asked.length = 0;
  const { store, state } = career(LEAGUE_ONLY);
  reply = (_req, n) => (n === 1 ? { questions: [{ question: 'Comment as-tu vécu ce match ?' }, { question: 'Que retiens-tu de ta défaite ?' }, { question: 'Ton avenir est-il ici ?' }] } : politely());
  await world.openPress({ store, settings, progress: () => {} });
  assert.strictEqual(asked.length, 2);
  assert.match(asked[1].user, /REMINDER/);
  assert.match(state.press.questions[0].question, /avez-vous/);
});

test('le rédacteur du blog peut tutoyer : rien à redemander', { skip }, async () => {
  asked.length = 0;
  const { store, state } = career(WITH_BLOG);
  reply = () => { const q = politely(); q.questions[2].question = 'Tu t’attendais à ça, franchement ?'; return q; };
  await world.openPress({ store, settings, progress: () => {} });
  assert.strictEqual(asked.length, 1);
  assert.strictEqual(state.press.questions[2].journalist, state.writers.local_beat_writer);
  assert.match(state.press.questions[2].question, /Tu t’attendais/);
});

test('des questions vouvoyées ne sont pas prises pour un tutoiement', { skip }, async () => {
  asked.length = 0;
  const { store } = career(LEAGUE_ONLY);
  reply = () => ({ questions: [{ question: 'Est-ce la fin d’une bonne série pour vous, tactiquement ?' }, { question: 'Comment expliquez-vous cette entame ?' }, { question: 'Tenez-vous à répondre aux tribunes ?' }] });
  await world.openPress({ store, settings, progress: () => {} });
  assert.strictEqual(asked.length, 1);
});

test('le compte rendu paraît dans La Transversale, signé par sa rédaction', { skip }, async () => {
  const { store, state } = career(LEAGUE_ONLY);
  reply = politely;
  await world.openPress({ store, settings, progress: () => {} });
  const edition = state.editions.at(-1);
  const [nationalBefore, localBefore] = [edition.national.length, edition.local.length];
  asked.length = 0;
  reply = () => ({ article: { headline: 'Le titre', dek: 'Le chapeau', author: state.writers.local_beat_writer, body: 'Il a parlé. « Nous reviendrons plus forts », a-t-il lâché.' }, posts: [], promises: [] });
  await world.submitPress({ store, settings, answers: ['Nous reviendrons plus forts', '', ''], progress: () => {} });
  assert.strictEqual(edition.local.length, localBefore, 'rien sur le blog');
  assert.strictEqual(edition.national.length, nationalBefore + 1);
  const article = edition.national.at(-1);
  assert.strictEqual(article.kind, 'conférence de presse');
  const desk = state.writers.national_desk.map((w) => w.name);
  assert.ok(desk.includes(article.author), 'signé par la rédaction de La Transversale, pas par le blog');
  assert.match(article.body, /Nous reviendrons plus forts/, 'ses mots restent cités');
  assert.match(asked[0].system, /La Transversale article/);
  assert.match(asked[0].user, /"writer":/);
  assert.strictEqual(state.press.status, 'done');
});
