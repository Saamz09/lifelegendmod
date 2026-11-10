'use strict';
// Stockage local : réglages (clés chiffrées par Windows) et un dossier par carrière.

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  savePath: '',
  gameDir: '',       // dossier du jeu (vide = détection automatique)
  autoSync: false,   // synchroniser dès que le jeu réécrit la sauvegarde
  factCheck: true,   // relire chaque édition face aux faits avant publication (2e requête)
  tribuneThreads: true, // faire discuter les internautes sous les posts après chaque édition (requête de plus)
  transversaleBrief: false, // « Le brief du matin » de La Transversale dans Mails à chaque édition (abonnement sur le site, sans IA)
  replays: true,     // publier les ralentis sauvegardés dans le jeu
  offerRedirect: false, // réorienter une vraie offre vers un autre club en modifiant la sauvegarde (expérimental)
  influenceWrites: false, // écrire dans la sauvegarde les décisions obtenues par l'influence : formation, transferts (expérimental)
  clipsDir: '',      // dossier des vidéos enregistrées (vide = Vidéos\Captures, captures du jeu seulement)
  provider: 'google',
  model: 'gemini-3.6-flash',
  baseUrl: '',
  language: 'fr',
  fanVulgarity: true, // supporters vulgaires possibles après de très mauvais résultats (décochable)
  theme: 'auto',
  keys: {},          // fournisseur -> clé chiffrée (base64)
};

class Store {
  constructor(dir, safeStorage) {
    this.dir = dir;
    this.safeStorage = safeStorage;
    fs.mkdirSync(path.join(dir, 'careers'), { recursive: true });
  }

  readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
  }

  writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file);
  }

  getSettings() {
    const s = this.readJson(path.join(this.dir, 'settings.json'), {});
    return { ...DEFAULT_SETTINGS, ...s, keys: s.keys || {} };
  }

  // Version envoyée à l'interface : jamais les clés, seulement lesquelles existent.
  publicSettings() {
    const { keys, ...rest } = this.getSettings();
    return { ...rest, savedKeys: Object.keys(keys) };
  }

  saveSettings(update) {
    const cur = this.getSettings();
    const next = { ...cur, ...update, keys: { ...cur.keys } };
    delete next.apiKey;
    delete next.savedKeys;
    if (update.apiKey) {
      next.keys[next.provider] = this.safeStorage.isEncryptionAvailable()
        ? this.safeStorage.encryptString(update.apiKey).toString('base64')
        : `plain:${update.apiKey}`;
    }
    this.writeJson(path.join(this.dir, 'settings.json'), next);
    return this.publicSettings();
  }

  getKey(provider) {
    const enc = this.getSettings().keys[provider];
    if (!enc) return '';
    if (enc.startsWith('plain:')) return enc.slice(6);
    return this.safeStorage.decryptString(Buffer.from(enc, 'base64'));
  }

  careerFile(careerId) {
    return path.join(this.dir, 'careers', careerId, 'state.json');
  }

  loadCareer(careerId) {
    return this.readJson(this.careerFile(careerId), null);
  }

  saveCareer(state) {
    this.writeJson(this.careerFile(state.careerId), state);
  }

  loadAux(careerId, name) {
    return this.readJson(path.join(this.dir, 'careers', careerId, `${name}.json`), null);
  }

  saveAux(careerId, name, value) {
    this.writeJson(path.join(this.dir, 'careers', careerId, `${name}.json`), value);
  }

  setActiveCareer(careerId) {
    this.writeJson(path.join(this.dir, 'active.json'), { careerId });
  }

  activeCareer() {
    const a = this.readJson(path.join(this.dir, 'active.json'), null);
    return a ? this.loadCareer(a.careerId) : null;
  }
}

module.exports = { Store };
