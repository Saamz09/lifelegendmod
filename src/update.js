'use strict';
// Mises à jour : la version installée face à la dernière publiée sur la page GitHub de LifeLegend.

const RELEASES = 'https://github.com/Saamz09/lifelegendmod/releases/latest';
const RELEASES_API = 'https://api.github.com/repos/Saamz09/lifelegendmod/releases/latest';

// > 0 si a est plus récente que b (« 1.2.0 » face à « 1.1.9 »). Une bêta passe avant sa version : « 1.1.1-beta » < « 1.1.1 ».
function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre] = String(v || '').trim().replace(/^v/i, '').split('-');
    return { n: main.split('.').map((x) => parseInt(x, 10) || 0), beta: pre != null };
  };
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x.n[i] || 0) - (y.n[i] || 0);
    if (d) return d;
  }
  return Number(y.beta) - Number(x.beta);
}

// La réponse de GitHub (dernière release) → ce que l'interface affiche. Un numéro illisible ne propose rien ; le lien
// n'est gardé que s'il mène à la page de LifeLegend.
function releaseInfo(release, current) {
  const tag = String(release?.tag_name || '').trim().replace(/^v/i, '');
  const latest = /^\d+(\.\d+){0,2}(-[\w.]+)?$/.test(tag) ? tag : '';
  const url = /^https:\/\/github\.com\/Saamz09\/lifelegendmod\//.test(release?.html_url || '') ? release.html_url : RELEASES;
  return { current, latest, newer: Boolean(latest) && compareVersions(latest, current) > 0, url };
}

module.exports = { RELEASES, RELEASES_API, compareVersions, releaseInfo };
