'use strict';
// Les nouveautés montrées une fois après une mise à jour (src/news.js) : quand la fenêtre s'ouvre, ce qu'elle montre,
// et chaque point traduit dans les cinq dictionnaires, avec une icône qui existe.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const { NEWS, whatsNew } = require(path.join(ROOT, 'src/news.js'));
const { compareVersions } = require(path.join(ROOT, 'src/update.js'));

const NEWS_TEST = [
  { version: '1.3.0', items: [{ icon: 'bell', title: 'c', text: 'c' }] },
  { version: '1.2.0', items: [{ icon: 'bell', title: 'b', text: 'b' }] },
  { version: '1.1.0', items: [{ icon: 'bell', title: 'a', text: 'a' }] },
];
const versions = (r) => r.show.map((n) => n.version);

test('nouvelle installation : rien à montrer ; joueur venu d’une version d’avant cet écran : la version installée', () => {
  assert.deepStrictEqual(versions(whatsNew({ current: '1.2.0', news: NEWS_TEST })), []);
  assert.deepStrictEqual(versions(whatsNew({ current: '1.2.0', returning: true, news: NEWS_TEST })), ['1.2.0']);
  // Une version sans nouveautés écrites (un correctif) : rien, et rien d'une version à venir.
  assert.deepStrictEqual(versions(whatsNew({ current: '1.2.1', returning: true, news: NEWS_TEST })), []);
});

test('mise à jour : les versions pas encore vues, la plus récente d’abord, une seule fois', () => {
  assert.deepStrictEqual(versions(whatsNew({ seen: '1.1.1', current: '1.2.0', news: NEWS_TEST })), ['1.2.0']);
  assert.deepStrictEqual(versions(whatsNew({ seen: '1.1.0', current: '1.3.0', news: NEWS_TEST })), ['1.3.0', '1.2.0'], 'une version sautée');
  assert.deepStrictEqual(versions(whatsNew({ seen: '1.2.0', current: '1.2.0', news: NEWS_TEST })), [], 'déjà vue');
  assert.deepStrictEqual(versions(whatsNew({ seen: '1.1.0', current: '1.2.0-beta', news: NEWS_TEST })), [], 'la bêta passe avant sa version');
});

test('à revoir dans les réglages : la version installée, ou la dernière avant elle', () => {
  assert.strictEqual(whatsNew({ seen: '1.2.0', current: '1.2.0', news: NEWS_TEST }).last.version, '1.2.0');
  assert.strictEqual(whatsNew({ seen: '1.2.0', current: '1.2.3', news: NEWS_TEST }).last.version, '1.2.0');
  assert.strictEqual(whatsNew({ current: '1.0.0', news: NEWS_TEST }).last, null);
});

test('les nouveautés écrites : versions rangées, points traduits, icônes qui existent', () => {
  for (let i = 1; i < NEWS.length; i++) assert.ok(compareVersions(NEWS[i - 1].version, NEWS[i].version) > 0, 'la plus récente en premier');
  const app = fs.readFileSync(path.join(ROOT, 'lifelegend/app.js'), 'utf8');
  const hi = app.slice(app.indexOf('const HI = {'), app.indexOf('\n};', app.indexOf('const HI = {')));
  for (const lang of ['en', 'es', 'it', 'pt', 'de', 'ru', 'vi']) {
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(ROOT, `lifelegend/i18n/${lang}.js`), 'utf8'), ctx);
    const dict = ctx.window.LL_I18N[lang];
    for (const n of NEWS) {
      assert.ok(n.items.length > 0 && n.items.length <= 8, `${n.version} : entre 1 et 8 points (la liste défile au-delà de la hauteur de la fenêtre)`);
      for (const it of n.items) {
        assert.ok(dict[it.title] && dict[it.text], `${lang} : « ${it.title} » traduit`);
        assert.ok(new RegExp(`^\\s{2}'?${it.icon}'?:`, 'm').test(hi), `icône ${it.icon}`);
      }
    }
  }
});
