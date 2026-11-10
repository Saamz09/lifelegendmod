'use strict';
// La charte graphique : une feuille de style n'écrit que les valeurs de ses échelles (voir l'en-tête de lifelegend/style.css).
// Ce qui suit son image et non le texte (initiales dans un disque, icônes, vignettes, le cadre) porte la mention « hors échelle ».
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'lifelegend', 'style.css'), 'utf8');
const MARK = /\/\*\s*hors échelle\s*\*\//;
// On garde la mention, on retire les autres commentaires, et les @font-face qui déclarent des plages de graisses.
const css = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => (MARK.test(m) ? m : ' '))
  .replace(/@font-face\s*\{[^}]*\}/g, ' ');

const values = (re) => [...css.matchAll(re)].map((m) => m[1].trim()).filter((v) => !MARK.test(v));
const clean = (v) => v.replace(/\s*!important$/, '').trim();
const offenders = (list, ok) => [...new Set(list.map(clean).filter((v) => !ok(v)))];

test('les tailles de texte suivent l\'échelle', () => {
  const size = /^(10|11|12|13|14|15|16|18|20)px$|^var\(--fs-(h4|h3|h2|h1|hero)\)$|^inherit$/;
  const declared = values(/(?:^|[;{\s])font-size:\s*([^;}]+)/g);
  const shorthand = [...css.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => v !== 'inherit' && !MARK.test(v))
    .map((v) => v.replace(/^italic\s+/, '').replace(/^\d{3}\s+/, '').split(/[\s/]/)[0]);
  assert.deepStrictEqual(offenders([...declared, ...shorthand], (v) => size.test(v)), []);
});

test('les graisses sont 400, 500, 600 ou 700', () => {
  const declared = values(/(?:^|[;{\s])font-weight:\s*([^;}]+)/g);
  const shorthand = [...css.matchAll(/(?:^|[;{\s])font:\s*(?:italic\s+)?(\d{3})\s/g)].map((m) => m[1]);
  assert.deepStrictEqual(offenders([...declared, ...shorthand], (v) => /^(400|500|600|700|inherit)$/.test(v)), []);
});

test('les rayons viennent des jetons', () => {
  const part = /^(0|50%|inherit|var\(--(r-(xs|s|m|l|xl|pill)|gz-r|btn-r)\))$/;
  const list = values(/(?:^|[;{\s])border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;}]+)/g);
  assert.deepStrictEqual(offenders(list, (v) => v.split(/\s+/).every((p) => part.test(p))), []);
});

test('les interlettrages suivent l\'échelle', () => {
  const list = values(/(?:^|[;{\s])letter-spacing:\s*([^;}]+)/g);
  assert.deepStrictEqual(offenders(list, (v) => /^(-\.02em|-\.01em|0|\.06em|normal|inherit)$/.test(v)), []);
});

test('les boutons gardent les hauteurs de la charte', () => {
  assert.match(raw, /--btn-s:\s*32px;\s*--btn-m:\s*38px;\s*--btn-l:\s*44px;\s*--chip:\s*28px;/);
  for (const sel of ['.btn', '.btn.big', '.gz .gz-sc-btn', '.gz .gz-pill', '.fb .fb-act', '.tw-btn', '.sm-btn', '.sc-more', '.dc-btn', '.dc-back', '.sm-select', '.pt-select', '.gz-seg button', '.fb .fb-seg button', '.ib-lines-f button']) {
    const line = raw.split('\n').find((l) => l.trimStart().startsWith(`${sel} {`));
    assert.ok(line, `règle absente : ${sel}`);
    assert.match(line, /var\(--(btn-[sml]|chip)\)/, sel);
  }
});

test('Manrope est la seule police du texte', () => {
  assert.match(raw, /--f-sans:\s*"Manrope"/);
  assert.match(raw, /font-family: "Manrope"; font-style: normal; font-weight: 400 700;/);
  assert.doesNotMatch(raw, /Newsreader|Barlow|Mona Sans|--f-serif|monospace/);
  const families = new Set([...raw.matchAll(/@font-face\s*\{\s*font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...families].sort(), ['Manrope', 'Twemoji Country Flags']);
});

test('chaque police déclarée existe dans le dossier', () => {
  const dir = path.join(__dirname, '..', 'lifelegend');
  for (const m of raw.matchAll(/url\("(fonts\/[^"]+)"\)/g)) assert.ok(fs.existsSync(path.join(dir, m[1])), m[1]);
});

test('le blanc reste adouci sur les surfaces claires', () => {
  assert.doesNotMatch(raw, /--l-0:\s*#fff/i);
  for (const sel of ['.tw-panel', '.sm-light .sm-content', '.dc-field', '.dc-chart-box']) {
    const line = raw.split('\n').find((l) => l.trimStart().startsWith(`${sel} {`) && /background/.test(l));
    assert.ok(line, `règle absente : ${sel}`);
    assert.doesNotMatch(line, /background(-color)?:\s*(#fff|#ffffff|white)\b/, sel);
  }
});
