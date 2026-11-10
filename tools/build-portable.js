'use strict';
// Dossier portable de LifeLegend pour Windows : Electron (déjà installé dans node_modules) + l'app dans resources\app,
// sans installation ni téléchargement. LifeLegend.exe se lance depuis n'importe quel dossier.
//   npm run dist             -> dist\LifeLegend-<version>-win-x64\
//   npm run dist -- --zip    -> et dist\LifeLegend-<version>-win-x64.zip (Compress-Archive de Windows)

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { setExeIcon } = require('./exe-icon');
const { readIco } = require('./make-icons');

const ROOT = path.join(__dirname, '..');
// LL_DIST_FROM : prendre l'app (code, notices, version) dans un autre dossier, l'export public par exemple ; Electron
// et les dépendances viennent toujours d'ici.
const SRC = process.env.LL_DIST_FROM ? path.resolve(process.env.LL_DIST_FROM) : ROOT;
const pkg = require(path.join(SRC, 'package.json'));
// LL_DIST_NAME : un autre nom de dossier (essai dans le Bac à sable…), pour ne pas écraser la version des testeurs.
const NAME = process.env.LL_DIST_NAME || `LifeLegend-${pkg.version}-win-x64`;
if (!/^[A-Za-z0-9._-]+$/.test(NAME)) throw new Error(`nom de dossier inattendu : ${NAME}`);
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, NAME);
const APP = path.join(OUT, 'resources', 'app');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist');

if (!fs.existsSync(path.join(ELECTRON, 'electron.exe'))) throw new Error('Electron absent de node_modules : lance d’abord « npm install ».');

// Repart d'un dossier vide (le dossier de sortie est toujours sous dist\, jamais ailleurs).
if (!OUT.startsWith(DIST + path.sep)) throw new Error(`dossier de sortie inattendu : ${OUT}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. Electron, renommé : LifeLegend.exe ; sa licence et celles de Chromium restent à côté.
fs.cpSync(ELECTRON, OUT, { recursive: true });
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, 'LifeLegend.exe'));
fs.renameSync(path.join(OUT, 'LICENSE'), path.join(OUT, 'LICENSE.electron.txt'));
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });
// Icône de LifeLegend dans le .exe (assets/icon.ico, voir tools/make-icons.js) : images remplacées sur place.
const exeIcons = readIco(path.join(ROOT, 'assets', 'icon.ico')).filter((i) => [16, 32, 48, 256].includes(i.size));
setExeIcon(path.join(OUT, 'LifeLegend.exe'), exeIcons);

// 2. L'app : seulement ce qui sert à l'exécution (pas les tests ni les outils).
for (const item of ['main.js', 'preload.js', 'lifelegend', 'src', 'assets', 'LICENSE', 'THIRD-PARTY-NOTICES.txt']) {
  fs.cpSync(path.join(SRC, item), path.join(APP, item), { recursive: true });
}
const runtimePkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main, license: pkg.license, dependencies: pkg.dependencies };
fs.writeFileSync(path.join(APP, 'package.json'), `${JSON.stringify(runtimePkg, null, 2)}\n`);

// 3. Dépendances de production (sans Electron), avec leurs fichiers de licence : la liste vient de npm, hors ligne.
const listing = execSync('npm ls --omit=dev --all --parseable', { cwd: ROOT, encoding: 'utf8' });
const modules = listing.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && path.resolve(l) !== path.resolve(ROOT));
for (const dir of modules) {
  const rel = path.relative(ROOT, dir);
  if (!rel.startsWith('node_modules')) continue;
  fs.cpSync(dir, path.join(APP, rel), { recursive: true });
}

// 4. Notices à la racine du dossier portable.
for (const [from, to] of [['docs/LISEZMOI.txt', 'LISEZMOI.txt'], ['docs/README.txt', 'README.txt'], ...(pkg.version.includes('-') ? [['docs/BETA.txt', 'BETA.txt']] : []), ['LICENSE', 'LICENSE.txt'], ['THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.txt'], ['CHANGELOG.md', 'CHANGELOG.md']]) {
  fs.copyFileSync(path.join(SRC, from), path.join(OUT, to));
}

const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`${OUT}\n${modules.length} modules de production, ${(size(OUT) / 1048576).toFixed(0)} Mo`);

// 5. Archive .zip, si demandée.
if (process.argv.includes('--zip')) {
  const zip = path.join(DIST, `${NAME}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
  console.log(`${zip} (${(fs.statSync(zip).size / 1048576).toFixed(0)} Mo)`);
}
