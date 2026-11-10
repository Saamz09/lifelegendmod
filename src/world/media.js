'use strict';
// Ralentis sauvegardés dans le jeu et vidéos enregistrées par le joueur (Xbox Game Bar, Steam…) :
// rattachés aux matchs de la carrière et publiés sur Kop. Aucun appel à l'IA ici.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { listReplays } = require('../save/replays');
const { prettyName } = require('../save/blReader');
const { sameMatch } = require('./snapshot');
const { postTexts } = require('./postTexts');

const VIDEO_EXT = /\.(mp4|webm|m4v|mov)$/i;
const GAME_CLIP = /pes|efootball|football ?life|\bfl_?\d/i; // dans le dossier par défaut, seulement les captures du jeu
const CLIP_TO_REPLAY_WINDOW = 45 * 60 * 1000;   // une vidéo enregistrée à moins de 45 min d'un ralenti s'y rattache
const ORPHAN_CLIP_DELAY = 30 * 60 * 1000;       // sans ralenti, on attend 30 min avant de l'attribuer au dernier match
const HIGHLIGHTS = { handle: 'RalentisFoot', name: 'Ralentis Foot', type: 'highlights' };

const newId = () => crypto.randomBytes(6).toString('hex');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const defaultClipsDir = () => path.join(os.homedir(), 'Videos', 'Captures');

function findFixture(snapshot, home, away) {
  const h = norm(home), a = norm(away);
  return (snapshot?.fixtures || []).filter((f) => f.played && norm(f.home) === h && norm(f.away) === a).at(-1) || null;
}

const matchLabel = (f) => `${f.home} ${f.score[0]}-${f.score[1]} ${f.away}`;

function pick(list, key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function replayText(r, fixture, language) {
  const L = postTexts(language);
  const m = matchLabel(fixture);
  if (!r.scorer) return L.replayPlain(m);
  return pick(L.replay, r.key)(r.minute, r.scorer, m);
}

function clipText(fixture, replay, language) {
  const L = postTexts(language);
  return replay?.scorer ? L.clip(replay.scorer, replay.minute, matchLabel(fixture)) : L.clipPlain(matchLabel(fixture));
}

function highlightPost(state, text, fixture, extra) {
  const isMe = extra.replay && norm(extra.replay.scorer) === norm(state.snapshot.player.name);
  const reach = 300 + Math.random() * 900 + (isMe ? state.profile.followers * 0.04 : 0);
  const post = {
    id: newId(),
    author: HIGHLIGHTS,
    text,
    gameDate: fixture.date,
    createdAt: Date.now(),
    replies: [],
    likes: Math.round(reach),
    reposts: Math.round(reach * 0.15),
    ...extra,
  };
  state.feed.push(post);
  return post;
}

// Met l'état à jour avec les nouveaux ralentis et vidéos ; renvoie true si quelque chose a changé.
function processMedia(state, settings, now = Date.now()) {
  if (!state?.snapshot) return false;
  state.replays ||= [];
  state.clips ||= [];
  // À l'activation, seules les vidéos des 6 dernières heures sont reprises (pas tout l'historique du dossier).
  state.mediaSince ||= now - 6 * 3600 * 1000;
  let changed = false;

  if (settings.replays !== false && settings.savePath) {
    const known = new Set(state.replays.map((r) => r.key));
    for (const r of listReplays(path.dirname(settings.savePath))) {
      if (known.has(r.key)) continue;
      const fixture = findFixture(state.snapshot, r.home, r.away);
      if (!fixture) continue; // match pas encore synchronisé, ou ralenti d'un autre mode : on réessaiera
      const entry = {
        key: r.key, file: r.file, title: r.title, minute: r.minute,
        scorer: r.scorer ? prettyName(r.scorer) : null,
        matchId: fixture.id, match: matchLabel(fixture), gameDate: fixture.date, savedAt: r.savedAt, clips: [],
      };
      const post = highlightPost(state, replayText(entry, fixture, settings.language), fixture, {
        replay: { minute: entry.minute, scorer: entry.scorer, match: entry.match },
      });
      entry.postId = post.id;
      state.replays.push(entry);
      changed = true;
    }
  }

  const dir = settings.clipsDir || defaultClipsDir();
  let names = [];
  try { names = fs.readdirSync(dir); } catch { names = []; }
  const knownClips = new Set(state.clips.map((c) => c.path));
  for (const name of names) {
    if (!VIDEO_EXT.test(name) || (!settings.clipsDir && !GAME_CLIP.test(name))) continue;
    const full = path.join(dir, name);
    if (knownClips.has(full)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (now - stat.mtimeMs < 15000) continue; // encore en cours d'écriture
    const recordedAt = stat.birthtimeMs || stat.mtimeMs;
    if (recordedAt < state.mediaSince) {
      state.clips.push({ path: full, ignored: true });
      changed = true;
      continue;
    }
    // Rattachement : le ralenti sauvegardé le plus proche dans le temps, sinon le dernier match joué.
    const near = state.replays
      .filter((r) => Math.abs(r.savedAt - recordedAt) < CLIP_TO_REPLAY_WINDOW)
      .sort((a, b) => Math.abs(a.savedAt - recordedAt) - Math.abs(b.savedAt - recordedAt))[0];
    if (!near && now - recordedAt < ORPHAN_CLIP_DELAY) continue; // un ralenti va peut-être arriver
    const fixture = near ? state.snapshot.fixtures.find((f) => sameMatch(f.id, near.matchId)) : state.snapshot.last;
    if (!fixture) continue;
    const clip = { path: full, name, recordedAt, replayKey: near?.key || null, matchId: fixture.id };
    const replayPost = near && state.feed.find((p) => p.id === near.postId);
    if (replayPost && !replayPost.media) {
      replayPost.media = { kind: 'video', path: full };
      clip.postId = replayPost.id;
    } else {
      clip.postId = highlightPost(state, clipText(fixture, near, settings.language), fixture, {
        media: { kind: 'video', path: full },
        ...(near ? { replay: { minute: near.minute, scorer: near.scorer, match: near.match } } : {}),
      }).id;
    }
    if (near) near.clips.push(full);
    state.clips.push(clip);
    changed = true;
  }
  return changed;
}

// Pour les rédacteurs : les buts revus en ralenti, avec leur minute.
function savedReplaysFacts(state) {
  return (state.replays || []).filter((r) => r.scorer).slice(-8)
    .map((r) => ({ match: r.match, date: r.gameDate, minute: r.minute, scorer: r.scorer, video: r.clips.length > 0 }));
}

module.exports = { processMedia, savedReplaysFacts, defaultClipsDir };
