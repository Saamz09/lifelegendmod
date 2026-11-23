'use strict';
// Pseudos fabriqués des compétitions : deux ligues dont le sigle serait le même (« BPL » : Bahraini, Bangladesh et
// Botswana Premier League, vu avec le GigaPack le 2026-11-23) ont chacune leur compte, au lieu d'un compte commun.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { compAccount, setCompetitionNames } = require(path.join(__dirname, '..', 'src/world/competitions.js'));

const handle = (name) => compAccount(null, name).handle;

test('sans liste de la carrière, le pseudo fabriqué reste le sigle', () => {
  setCompetitionNames([]);
  assert.strictEqual(handle('Bahraini Premier League'), 'BPL_officiel');
  assert.strictEqual(handle('Liga Profesional de Fútbol'), 'LPF_officiel');
});

test('deux ligues au même sigle : chacune son pseudo ; les autres ne changent pas', () => {
  setCompetitionNames([[1, 'Bahraini Premier League'], [2, 'Bangladesh Premier League'], [3, 'Botswana Premier League'],
    [4, 'Syrian Premier League'], [5, 'Singapore Premier League'], [6, 'Liga Profesional de Fútbol'], [7, 'Bahraini Premier League']]);
  assert.deepStrictEqual(['Bahraini Premier League', 'Bangladesh Premier League', 'Botswana Premier League', 'Syrian Premier League', 'Singapore Premier League'].map(handle),
    ['BahrainiPL_officiel', 'BangladeshPL_officiel', 'BotswanaPL_officiel', 'SyrianPL_officiel', 'SingaporePL_officiel']);
  assert.strictEqual(handle('Liga Profesional de Fútbol'), 'LPF_officiel', 'sans doublon, le sigle reste');
  assert.strictEqual(compAccount(1, 'Bahraini Premier League').name, 'Bahraini Premier League');
});

test('même premier mot et même sigle : le nom collé, puis un numéro ; jamais le pseudo d’un vrai compte', () => {
  setCompetitionNames([[1, 'Ruritanian Premier League'], [2, 'Ruritanian Pro League'], [3, 'Ruritanian Prime League']]);
  const hs = ['Ruritanian Premier League', 'Ruritanian Pro League', 'Ruritanian Prime League'].map(handle);
  assert.strictEqual(new Set(hs).size, 3, hs.join(', '));
  assert.ok(hs.every((h) => h.length <= 16 + '_officiel'.length), hs.join(', '));
  setCompetitionNames([[1, 'Serie A TIM'], [2, 'Bahraini Premier League']]);
  assert.strictEqual(handle('Serie A TIM'), 'SerieA', 'un vrai compte garde son pseudo');
  assert.strictEqual(handle('Bahraini Premier League'), 'BPL_officiel', 'seule ligue au sigle BPL : il reste');
  setCompetitionNames([]);
});
