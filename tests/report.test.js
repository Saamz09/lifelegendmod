'use strict';
// « Signaler un problème » : le rapport ne contient jamais de clé d'IA, d'adresse e-mail, de nom d'utilisateur Windows,
// de nom de joueur ni de texte personnel ; rien n'est envoyé (le fichier est seulement enregistré).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { buildReport, scrub } = require(path.join(__dirname, '..', 'src/report.js'));

test('rapport : clés, e-mails, dossier et nom d’utilisateur masqués', () => {
  const t = scrub('C:\\Users\\jdupont\\Documents\\save · AIzaSyA1234567890abcdefghijklmnop · sk-ant-api03-abcdefghijklmnopqrstuv · moi@exemple.fr · jdupont', { home: 'C:\\Users\\jdupont', user: 'jdupont' });
  assert.ok(!/jdupont|AIza|sk-ant|exemple\.fr/.test(t), t);
  assert.match(t, /%USERPROFILE%\\Documents\\save/);
  // Un autre dossier d'utilisateur (copié d'un autre PC) aussi.
  assert.ok(!scrub('D:/x C:\\Users\\autre\\AppData\\y', { home: 'C:\\Users\\moi', user: 'moi' }).includes('autre'));
});

test('rapport : réglages en liste fermée, pas de nom de joueur ni de textes', () => {
  const state = { careerId: '159475-ilanmorel', profile: { displayName: 'Ilan Morel', handle: 'ilan_off' }, bio: { text: 'Né à Nancy, il adore son chien Rex.' },
    snapshot: { gameDate: '2027-01-14', season: '2026-2027', player: { name: 'Ilan Morel' }, club: { name: 'AS Nancy Lorraine' }, league: { name: 'Ligue 2 BKT' } },
    feed: [{ text: 'mon post secret' }], mail: [], huddles: [], editions: [] };
  const settings = { provider: 'google', model: 'gemini', language: 'fr', pendingBio: 'ma bio', savedKeys: ['google'], savePath: 'C:\\Users\\jdupont\\save\\BL00000000' };
  const t = buildReport({ version: '1.0.0', settings, state, logs: { errors: 'Error at C:\\Users\\jdupont\\app\\x.js · Ilan Morel', activity: 'synchro : début', sync: 'Kop : 3 messages' } });
  for (const bad of ['Ilan', 'Morel', 'ilan_off', 'chien Rex', 'mon post secret', 'ma bio', 'jdupont']) assert.ok(!t.includes(bad), bad);
  assert.match(t, /provider : "google"/);
  assert.match(t, /Clés d’IA enregistrées pour : google/);
  assert.match(t, /AS Nancy Lorraine · Ligue 2 BKT/);
  assert.match(t, /Kop : 3 messages/);
});
