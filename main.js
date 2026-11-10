'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Notification, nativeImage, nativeTheme } = require('electron');
const { tr, trError } = require('./src/i18n');
const fs = require('fs');
const path = require('path');
const { Store } = require('./src/store');
const { peekSave } = require('./src/save/blReader');
const { setSaveKeys } = require('./src/save/pesCrypt');
const { answerAdvice } = require('./src/world/coachAdvice');
const { answerSponsor } = require('./src/world/sponsors');
const { dmContacts, findDm } = require('./src/world/dms');
const { setBio } = require('./src/world/pantheon');
const { PROVIDERS, isDailyQuota } = require('./src/ai/providers');
const { detectGameFolders, isGameDir } = require('./src/save/gameDb');
const { defaultClipsDir } = require('./src/world/media');
const world = require('./src/world/world');
const { buildReport } = require('./src/report');
const { playerFaces } = require('./src/world/playerFaces');
const { dominantColors } = require('./src/world/clubColors');

// La mod s'appelait LiveTweet : son dossier de données garde ce nom (carrières, réglages, clés, mémoire du
// navigateur), pour que le changement de nom ne perde rien.
app.setPath('userData', path.join(app.getPath('appData'), 'LiveTweet'));

// L'interface est LifeLegend (lifelegend/). L'ancienne, LegendLife, est archivée dans ../archives/legendlife-2026-10-21
// (avec le main.js qui savait ouvrir l'une ou l'autre).
const APP_NAME = 'LifeLegend';

let win;
let store;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 560,
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#dfdfdc',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'lifelegend', 'index.html'));
  // Les liens s'ouvrent dans le vrai navigateur, jamais dans l'appli.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
}

// Sauvegardes Become a Legend trouvées dans Documents\KONAMI (PES 2021, Football Life jusqu'à 2026) et
// Documents\SPGAME (Football Life 2027 : SPGAME\Football Life\2027\save).
const SAVE_ROOTS = [['KONAMI', /PES 2021|eFootball PES/i], ['SPGAME', /football ?life/i]];
function detectSaves() {
  const found = [];
  const gameDirs = [];
  for (const [name, game] of SAVE_ROOTS) {
    const root = path.join(app.getPath('documents'), name);
    try { gameDirs.push(...fs.readdirSync(root).filter((d) => game.test(d)).map((d) => path.join(root, d))); } catch { /* pas ce jeu ici */ }
  }
  for (const g of gameDirs) {
    let profiles = [];
    try { profiles = fs.readdirSync(g); } catch { continue; }
    for (const p of profiles) {
      // Une carrière par emplacement : BL00000000, BL00000001…
      let slots = [];
      try { slots = fs.readdirSync(path.join(g, p, 'save')).filter((f) => /^BL\d{8}$/.test(f)); } catch { continue; }
      for (const slot of slots) {
        const file = path.join(g, p, 'save', slot);
        try {
          found.push({ path: file, modified: fs.statSync(file).mtimeMs, ...peekSave(file) });
        } catch (err) {
          found.push({ path: file, error: err.message, locked: err.code === 'SAVE_KEY' });
        }
      }
    }
  }
  return found.sort((a, b) => (b.modified || 0) - (a.modified || 0));
}

// Clés de sauvegarde ajoutées par le joueur (Football Life 2027…) : des fichiers de 64 octets dans data/keys, jamais
// fournis par LifeLegend ni envoyés ailleurs. Chargées au démarrage et après chaque ajout.
const keysDir = () => path.join(store.dir, 'keys');
function loadSaveKeys() {
  let files = [];
  try { files = fs.readdirSync(keysDir()).filter((f) => f.toLowerCase().endsWith('.bin')); } catch { /* aucune clé */ }
  const keys = files.map((f) => { try { return fs.readFileSync(path.join(keysDir(), f)); } catch { return null; } }).filter((k) => k?.length === 64);
  setSaveKeys(keys);
  return keys.length;
}

// La dernière raison pour laquelle un journal n'a pas pu s'écrire (montrée dans le rapport « Signaler un problème »).
let logWriteError = null;
function logError(where, err) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'data', 'errors.log'), `${new Date().toISOString()} [${where}] ${err.stack || err}\n\n`);
  } catch (e) { logWriteError = `errors.log : ${e.code || ''} ${e.message}`; }
}

// Journal de la synchro automatique (diagnostic) : gardé court, les lignes les plus récentes à la fin.
function logActivity(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'data', 'activity.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 200000) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(-100000));
    fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) { logWriteError = `activity.log : ${e.code || ''} ${e.message}`; }
}

// Progression des appels à l'IA, affichée dans le HUD de l'interface.
const progress = (event) => win?.webContents.send('ai:progress', event);

// Le journal de la dernière synchro, gardé en mémoire pour « Signaler un problème » (rien n'est écrit sur le disque).
let syncLog = [];
const syncLine = (msg) => { syncLog.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); if (syncLog.length > 400) syncLog = syncLog.slice(-400); win?.webContents.send('sync:log', msg); };

// Une seule synchro à la fois : un clic pendant une synchro automatique attend la même.
let syncing = null;
function runSync() {
  if (!syncing) {
    logActivity('synchro : début');
    syncLog = [];
    syncing = world.sync({ store, settings: store.getSettings(), log: syncLine, progress })
      .then((state) => { logActivity(`synchro : terminée (${state.lastSync?.published ? 'édition publiée' : state.lastSync?.agentMail ? 'mail de l’agent' : 'rien de nouveau'}, ${state.lastSync?.gameDate})${state.lastSync?.durations ? ` · ${state.lastSync.durations}` : ''}`); return state; },
        (err) => { logActivity(`synchro : erreur (${err.message})`); throw err; })
      .finally(() => { syncing = null; });
  }
  return syncing;
}

// Synchro automatique : on surveille la sauvegarde et on synchronise quand le jeu l'a réécrite
// (sauvegarde manuelle ou sauvegarde automatique du jeu).
let watched = null;
let pending = null;
function setupAutoSync() {
  const s = store.getSettings();
  if (watched && (watched !== s.savePath || !s.autoSync)) {
    fs.unwatchFile(watched);
    watched = null;
  }
  if (!s.autoSync || !s.savePath || watched) return;
  watched = s.savePath;
  logActivity(`surveillance de ${watched}`);
  fs.watchFile(watched, { interval: 4000 }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs || cur.size === 0) return;
    logActivity(`sauvegarde modifiée (${cur.size} octets, ${new Date(cur.mtimeMs).toISOString()})`);
    clearTimeout(pending);
    pending = setTimeout(() => autoSync(0), 8000); // le jeu écrit en plusieurs fois : on attend qu'il ait fini
  });
}

// Après un échec passager de l'IA (réseau, serveur surchargé), on retente plus tard, 3 fois au plus.
let aiRetries = 0;

async function autoSync(attempt) {
  if (!win || !watched) return;
  try {
    peekSave(watched); // fichier complet et lisible ?
  } catch (err) {
    logActivity(`sauvegarde pas encore lisible (essai ${attempt + 1}) : ${err.message}`);
    if (attempt < 3) pending = setTimeout(() => autoSync(attempt + 1), 10000);
    return;
  }
  const s = store.getSettings();
  const fresh = s.pendingBio?.savePath === watched ? null : world.newCareerInfo({ store, settings: s });
  if (fresh) { win.webContents.send('sync:auto', { phase: 'new-career', info: fresh }); return; }
  win.webContents.send('sync:auto', { phase: 'start' });
  logActivity(syncing ? 'synchro auto : une synchro est déjà en cours, on attend la même' : 'synchro auto : début');
  try {
    const state = await runSync();
    aiRetries = 0;
    win.webContents.send('sync:auto', { phase: 'done', state });
    const lang = lang0();
    if (state.lastSync?.published && !win.isFocused() && Notification.isSupported()) {
      const head = state.editions.at(-1)?.local?.[0]?.headline || tr(lang, 'Nouvelle édition publiée');
      new Notification({ title: `${APP_NAME} · ${tr(lang, 'nouvelle édition')}`, body: head }).show();
    } else if (state.lastSync?.agentMail && !win.isFocused() && Notification.isSupported()) {
      new Notification({ title: `${APP_NAME} · Mails`, body: tr(lang, 'Offre de contrat reçue : ton agent t’a écrit.') }).show();
    }
  } catch (err) {
    logError('auto-sync', err);
    let error = withHint(err, trError(lang0(), err.message || String(err)));
    // Quota du jour épuisé : rien ne sert de réessayer dans 3 minutes.
    if (err.retryable && syncHint(err) !== 'quota' && aiRetries < 3) {
      aiRetries++;
      error += ` ${tr(lang0(), 'Nouvel essai automatique dans 3 minutes ({n}/3).', { n: aiRetries })}`;
      clearTimeout(pending);
      pending = setTimeout(() => autoSync(0), 3 * 60 * 1000);
    } else {
      aiRetries = 0;
    }
    win.webContents.send('sync:auto', { phase: 'error', error });
  }
}

// Ralentis et vidéos : vérifiés toutes les 10 s quand l'app est ouverte (jamais pendant une synchro).
function startMediaWatch() {
  setInterval(() => {
    if (syncing || !win) return;
    try {
      const state = world.refreshMedia({ store, settings: store.getSettings() });
      if (state) win.webContents.send('media:update', state);
    } catch (err) {
      logError('media', err);
    }
  }, 10000);
}

// Langue choisie dans les réglages (interface et contenus).
const lang0 = () => { try { return store?.getSettings().language || 'fr'; } catch { return 'fr'; } };

// Toutes les erreurs remontent à l'interface sous forme de message lisible, dans la langue choisie,
// et sont gardées dans errors.log (en français) pour le diagnostic.
function handle(channel, fn, { hint = false } = {}) {
  ipcMain.handle(channel, async (_e, arg) => {
    try {
      return { ok: true, value: await fn(arg) };
    } catch (err) {
      logError(channel, err);
      return { ok: false, error: withHint(hint && err, trError(lang0(), err.message || String(err))) };
    }
  });
}

// Genre d'une erreur de synchro, pour que l'interface dise quoi faire et propose le bon bouton : réglages de la
// sauvegarde ou de l'IA, quota du jour épuisé, sauvegarde en cours d'écriture par le jeu, ou erreur passagère.
function syncHint(err) {
  const msg = String(err?.message || '');
  if (['EBUSY', 'EPERM', 'EACCES'].includes(err?.code)) return 'busy';
  if (err?.code === 'SAVE_KEY') return 'key';
  if (/^Choisis ta sauvegarde/.test(msg)) return 'pick';
  if (err?.code === 'ENOENT' || /^(Sauvegarde illisible|Fichier trop petit|Ce fichier est une sauvegarde)/.test(msg)) return 'save';
  if (isDailyQuota(err)) return 'quota';
  if (/^(Aucune clé d'IA|Clé .+ refusée|Modèle introuvable|Aucun modèle choisi|Le modèle « .+ » est introuvable|Renseigne l'adresse|Fournisseur inconnu)/.test(msg)) return 'ai';
  return err?.retryable ? 'retry' : null;
}
// Le genre passe devant le message (« ⟦quota⟧ … ») : entre le processus principal et la page, une erreur ne garde
// que son message.
const withHint = (err, message) => { const h = err && syncHint(err); return h ? `⟦${h}⟧ ${message}` : message; };

// Une seule fenêtre à la fois : un second lancement ramène la première au premier plan.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  if (!gotLock) return;
  store = new Store(path.join(app.getPath('userData'), 'data'), safeStorage);

  handle('settings:get', () => ({ settings: store.publicSettings(), providers: PROVIDERS, version: app.getVersion() }));
  handle('settings:save', (update) => {
    const saved = store.saveSettings(update);
    setupAutoSync();
    return saved;
  });
  loadSaveKeys();
  handle('saves:detect', () => detectSaves());
  handle('keys:count', () => loadSaveKeys());
  handle('keys:add', async () => {
    const r = await dialog.showOpenDialog(win, { title: tr(lang0(), 'Choisir la clé de sauvegarde (fichier de 64 octets)'), properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const key = fs.readFileSync(r.filePaths[0]);
    if (key.length !== 64) throw new Error('Ce fichier n’est pas une clé de sauvegarde : une clé fait 64 octets.');
    const name = `cle-${require('crypto').createHash('sha256').update(key).digest('hex').slice(0, 12)}.bin`;
    const added = !fs.existsSync(path.join(keysDir(), name));
    fs.mkdirSync(keysDir(), { recursive: true });
    fs.writeFileSync(path.join(keysDir(), name), key);
    return { added, count: loadSaveKeys() };
  });
  handle('saves:browse', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: tr(lang0(), 'Choisir la sauvegarde Become a Legend (BL00000000, BL00000001…)'),
      defaultPath: path.join(app.getPath('documents'), fs.existsSync(path.join(app.getPath('documents'), 'SPGAME')) ? 'SPGAME' : 'KONAMI'),
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const info = peekSave(r.filePaths[0]);
    if (info.fileType !== 'BL') throw new Error(`Ce fichier est une sauvegarde « ${info.fileType} ». Choisis un fichier BL0000000x, jeu fermé.`);
    return { path: r.filePaths[0], ...info };
  });
  handle('game:detect', () => detectGameFolders());
  handle('game:browse', async () => {
    const r = await dialog.showOpenDialog(win, { title: tr(lang0(), 'Choisir le dossier du jeu (Football Life ou PES 2021)'), properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (!isGameDir(r.filePaths[0])) throw new Error('Ce dossier n’est pas celui du jeu (Football Life ou PES 2021). Choisis son dossier d’installation.');
    return r.filePaths[0];
  });
  handle('clips:default', () => defaultClipsDir());
  handle('clips:browse', async () => {
    const r = await dialog.showOpenDialog(win, { title: tr(lang0(), 'Choisir le dossier de tes vidéos (captures)'), defaultPath: defaultClipsDir(), properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  handle('state:get', () => world.loadState(store));
  handle('scores:get', () => world.loadScores({ store }));
  handle('mentions:list', () => world.mentionDirectory(store.activeCareer()));
  handle('sync', () => runSync(), { hint: true });
  handle('feed:post', (arg) => { const { text, quote, poll } = typeof arg === 'string' ? { text: arg } : arg || {}; return world.post({ store, settings: store.getSettings(), text, quote, poll, progress }); });
  handle('feed:like', ({ postId, replyId }) => world.likePost({ store, postId, replyId }));
  handle('feed:repost', ({ postId, replyId }) => world.repostPost({ store, postId, replyId }));
  handle('feed:follow', (handle) => world.followAccount({ store, handle }));
  handle('feed:reply', ({ postId, replyId, text }) => world.replyToPost({ store, settings: store.getSettings(), postId, replyId, text, progress }));
  handle('press:open', () => world.openPress({ store, settings: store.getSettings(), progress }));
  handle('press:submit', (answers) => world.submitPress({ store, settings: store.getSettings(), answers, progress }));
  handle('press:skip', () => world.skipPress({ store }));
  handle('dictation:transcribe', (audio) => world.transcribeDictation({ store, settings: store.getSettings(), audio }));
  handle('agent:stance', (stance) => world.setAgentStance({ store, stance }));
  handle('agent:request', (club) => world.setTransferRequest({ store, club }));
  // Écrit dans la sauvegarde (jeu fermé, copie gardée) : la surveillance relance ensuite une synchro.
  handle('offer:redirect', ({ offerId, toRef }) => {
    const r = world.redirectOffer({ store, settings: store.getSettings(), offerId, toRef });
    logActivity(`offre réorientée : ${r.result.from} -> ${r.result.to} (${r.result.changes.join(', ')})`);
    return r;
  });
  // Influence : demandes à l'entraîneur et au club, et décisions écrites dans la sauvegarde (jeu fermé, copie gardée).
  handle('influence:get', () => world.influenceView({ store, settings: store.getSettings() }));
  handle('influence:search', ({ query, pos }) => world.influenceSearch({ store, query, pos }));
  handle('influence:request', ({ kind, params, message }) => world.influenceRequest({ store, settings: store.getSettings(), kind, params, message, progress }));
  handle('influence:apply', (effectId) => {
    const r = world.influenceApply({ store, settings: store.getSettings(), effectId });
    logActivity(`influence écrite dans la sauvegarde : ${r.result.kind} ${r.result.name || ''} (${r.result.changes.join(', ')})`);
    return r;
  });
  // Mise à l'écart décidée par le club : ses jours d'indisponibilité écrits dans la sauvegarde (jeu fermé, copie gardée).
  handle('conduct:apply', () => {
    const r = world.conductApply({ store, settings: store.getSettings() });
    logActivity(`mise à l'écart écrite dans la sauvegarde : ${r.result.changes.join(', ')}`);
    return r;
  });
  handle('mail:reply', ({ threadId, text }) => world.replyMail({ store, settings: store.getSettings(), threadId, text, progress }));
  handle('mail:read', (threadId) => {
    const state = store.activeCareer();
    const t = state?.mail.find((m) => m.id === threadId);
    if (t) { t.unread = false; store.saveCareer(state); }
    return state;
  });
  handle('dm:send', ({ handle: to, text }) => world.sendDm({ store, settings: store.getSettings(), handle: to, text, progress }));
  handle('dm:contacts', () => { const state = store.activeCareer(); return state ? dmContacts(state) : []; });
  handle('huddle:send', ({ text, groupId }) => world.sendHuddle({ store, settings: store.getSettings(), text, groupId, progress }));
  handle('huddle:read', (groupId) => world.readHuddle({ store, settings: store.getSettings(), groupId }));
  handle('dm:read', (to) => {
    const state = store.activeCareer();
    const t = state && findDm(state, to);
    if (t?.unread) { t.unread = false; store.saveCareer(state); }
    return state;
  });
  handle('coach:advice', (choice) => {
    const state = store.activeCareer();
    if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
    answerAdvice(state, choice, { language: lang0(), gameDate: state.snapshot?.gameDate });
    store.saveCareer(state);
    return state;
  });
  handle('sponsor:answer', (choice) => {
    const state = store.activeCareer();
    if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
    answerSponsor(state, choice, { language: lang0(), gameDate: state.snapshot?.gameDate });
    store.saveCareer(state);
    return state;
  });
  handle('career:new', () => world.newCareerInfo({ store, settings: store.getSettings() }));
  handle('bio:save', ({ text, kind }) => {
    const state = store.activeCareer();
    if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
    setBio(state, text, kind);
    store.saveCareer(state);
    return state;
  });
  handle('life:save', (facts) => {
    const state = store.activeCareer();
    if (!state) throw new Error('Synchronise ta sauvegarde une première fois.');
    state.myLife = facts.map((f) => String(f).trim()).filter(Boolean).slice(0, 30);
    store.saveCareer(state);
    return state;
  });
  handle('profile:save', (update) => world.updateProfile({ store, update }));
  // Dossier des carrières : l'interface y lit la photo et la bannière du profil.
  handle('app:paths', () => ({ careersDir: path.join(store.dir, 'careers') }));
  // « Signaler un problème » : le rapport (sans clé, e-mail ni textes personnels), enregistré là où il le choisit, puis
  // montré dans l'Explorateur. Rien n'est envoyé.
  handle('report:make', async ({ title } = {}) => {
    const read = (name) => { try { return fs.readFileSync(path.join(app.getPath('userData'), 'data', name), 'utf8'); } catch { return ''; } };
    const text = buildReport({ version: app.getVersion(), settings: store.publicSettings(), state: store.activeCareer(), logs: { errors: read('errors.log'), activity: read('activity.log'), sync: syncLog.join('\n'), writeError: logWriteError, folder: path.join(app.getPath('userData'), 'data') } });
    const r = await dialog.showSaveDialog(win, { title: title || 'LifeLegend', defaultPath: path.join(app.getPath('desktop'), `LifeLegend-rapport-${new Date().toISOString().slice(0, 10)}.txt`), filters: [{ name: 'Texte', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, text, 'utf8');
    shell.showItemInFolder(r.filePath);
    return { path: r.filePath };
  });
  // Visages des joueurs qu'une page affiche, lus dans le jeu : { nom : fichier du dossier faces de la carrière }.
  handle('faces:get', (names) => playerFaces({ store, settings: store.getSettings(), names }));
  // Couleurs d'un écusson (le blog des supporters prend les couleurs du club) : fichier du dossier emblems de la carrière.
  handle('emblem:colors', (file) => {
    const state = store.activeCareer();
    if (!state || typeof file !== 'string' || path.basename(file) !== file) return null;
    const img = nativeImage.createFromPath(path.join(store.dir, 'careers', state.careerId, 'emblems', file));
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    return dominantColors(img.toBitmap(), width, height, 'bgra');
  });

  createWindow();
  setupAutoSync();
  startMediaWatch();
});

app.on('window-all-closed', () => app.quit());
