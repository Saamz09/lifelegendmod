'use strict';
// La langue des textes de l'IA (2026-11-14, joueurs réglés en anglais qui recevaient du français) : la consigne ajoutée
// à chaque requête hors français, et le repérage d'une réponse revenue en français (redemandée une fois).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const prompts = require(path.join(__dirname, '..', 'src/ai/prompts.js'));

test('consigne de langue : en fin de requête hors français, rien en français', () => {
  const en = prompts.withLanguage({ language: 'en' }, { system: 'SYS', user: 'USER {"style":"posé, argumente avec des chiffres simples","likely_role":"au moins remplaçant"}' });
  assert.match(en.system, /^SYS\n\nLANGUAGE — ENGLISH ONLY/);
  assert.match(en.user, /\(Reminder: write everything in English\.\)$/);
  assert.match(en.user, /"style":"calm, argues with simple numbers"/, 'les façons d’écrire du code passent en anglais');
  assert.match(en.user, /"likely_role":"at least a substitute"/);
  const fr = { system: 'SYS', user: 'USER' };
  assert.strictEqual(prompts.withLanguage({ language: 'fr' }, fr), fr, 'en français, la requête ne change pas');
  assert.match(prompts.languageRetry({ language: 'de' }), /entirely in German/);
});

test('réponse revenue en français : repérée, sans confondre les autres langues', () => {
  const one = (t) => JSON.stringify({ messages: [{ from: 'A', text: t }] });
  assert.ok(prompts.wrongLanguage(one('compte sur moi pour le gros son ce soir, on va arriver chauds à picot'), 'en'), 'le message du Vestiaire du 2026-11-14');
  assert.ok(prompts.wrongLanguage(one('Je suis très content pour les supporters, nous avons fait un grand match avec le groupe'), 'es'));
  // L'écrit des supporters, court et abrégé (essai réel du 2026-11-14).
  for (const t of ['c clair 5 c payé mais basilio ns a sauvés', 'vs a pris le point c le principal tkt', 'exactement, espérons qu’il plante ce soir à Picot', 'même chanson qu’à chaque déplacement, on tremble pendant 90 minutes']) assert.ok(prompts.wrongLanguage(one(t), 'en'), t);
  assert.ok(!prompts.wrongLanguage(one('Great win lads, who is up for a game tonight? Count me in'), 'en'));
  assert.ok(!prompts.wrongLanguage(one('C’mon lads, Nancy vs Grenoble tonight, we go all in at Picot'), 'en'), 'c’mon et vs restent de l’anglais');
  assert.ok(!prompts.wrongLanguage(one('Vamos à luta, o estádio vai estar cheio e a equipa está pronta'), 'pt'), 'le « à » portugais');
  assert.ok(!prompts.wrongLanguage(one('Le Débrief: the TV debate after the 0-0 at Stade de Reims, with the host and two pundits'), 'en'), 'des noms français dans un texte anglais');
  assert.ok(!prompts.wrongLanguage(one('La verdad es que el equipo jugó muy bien y los aficionados son lo mejor que hay'), 'es'));
  assert.ok(!prompts.wrongLanguage(one('Le ragazze e i ragazzi della curva sono stati fantastici oggi, che partita per tutti'), 'it'));
  assert.ok(!prompts.wrongLanguage(one('Mais uma vitória para a equipa, os adeptos estão de parabéns e o mister também'), 'pt'));
  assert.ok(!prompts.wrongLanguage(one('Wir sind stolz auf die Mannschaft und die Fans waren heute wieder unglaublich laut'), 'de'));
  assert.ok(!prompts.wrongLanguage(one('compte sur moi pour le gros son ce soir, on va arriver chauds à picot'), 'fr'), 'en français, jamais');
  // Une longue réponse (une édition) : un seul texte en français ne suffit pas, deux oui.
  const posts = (frCount) => JSON.stringify({ posts: [...Array(8)].map((_, i) => ({ text: i < frCount ? 'Quelle soirée pour les supporters, on est très fiers de ce groupe avec le coach' : 'What a night for the fans, we are so proud of this group and the coach' })) });
  assert.ok(!prompts.wrongLanguage(posts(1), 'en'));
  assert.ok(prompts.wrongLanguage(posts(2), 'en'));
});
