LifeLegend 1.0.0 — how to use
====================================

LifeLegend reads your SP Football Life 2027 Become a Legend save and builds a world that reacts to every match: a national
daily (La Transversale), your club's fan blog, a social network (Kop), a mailbox (Mails: your agent, coach, press,
family), your club's private group (Vestiaire), a stats site (Scoreline) and your encyclopedia page (Panthéon).

LIFELEGEND IS FICTION. Real players, coaches and clubs come from your game, but everything they are made to say or do
(quotes, posts, reactions, emails) is written by AI: these are not their words. Never present these texts as real or
attribute them to the people concerned outside LifeLegend. Unofficial fan mod, not affiliated with Konami, Football
Life, any club, competition or player.



NEW IN THIS VERSION
-------------------
- A completely rebuilt interface: every site in one frame, with the menu on the left.
- Mails: the Career file (contract, market, career path) and Influence (your requests to your coach and club).
- Player and coach faces, read from your game.
- Boot deals: the game's brands offer you a contract in Mails. It is fiction, the game knows nothing about it.


WHAT YOU NEED
-------------
- Windows 10 or 11, 64-bit.
- SP Football Life 2027 with a Become a Legend career.
  eFootball PES 2021 SEASON UPDATE is still supported, but Football Life 2027 is the version LifeLegend follows.
- The Football Life 2027 save key: a 64-byte file that LifeLegend does not provide. Download it from the PES Smoke Patch
  website, section "Edit File Encryption", link "Download FL27 Encryption Key":
  https://www.pessmokepatch.com/p/customizations-and-mods.html
  Without it your save stays locked. PES 2021 does not need one.
- An AI key. Free: Google AI Studio (https://aistudio.google.com) or Groq (https://console.groq.com).
  Paid: Anthropic (Claude), OpenAI, OpenRouter, or any OpenAI-compatible service.
- An Internet connection while syncing.


INSTALL
-------
1. Unzip the LifeLegend-1.0.0-win-x64 folder anywhere (Documents, Desktop, a USB stick…), but not in "Program Files".
   Nothing is installed in Windows.
2. Run LifeLegend.exe.
3. Windows may show "Windows protected your PC": LifeLegend is not digitally signed. Click "More info", then
   "Run anyway".
4. Optional shortcut: right-click LifeLegend.exe › "Show more options" › "Create shortcut".


FIRST RUN
---------
A setup window guides you:
1. Your save: in the game, start Become a Legend, create your player and save your career. LifeLegend looks for your
   careers in Documents\SPGAME\Football Life\2027\save. Pick yours (BL00000000 for "Become a Legend 01", BL00000001
   for 02…). If it is locked, add the save key with the button that appears.
2. The AI that writes your world: choose the provider, paste your key.
3. Your player: if you like, say whether he is created or real, and write your created player's biography.
4. Click the button that publishes the first edition. The first sync takes a few minutes: the AI writes the whole
   first edition.
You can change the language in Settings (the gear icon, top right). It applies to the interface and to everything the
AI writes.


AFTER THAT
----------
- After each match: save in the game, then sync with the gold button at the bottom left. With nothing new, no request is sent to the AI.
- Automatic sync (Settings › Your save): LifeLegend syncs as soon as the game saves. Turn on the game's autosave too.
- On Kop you can post whenever you like: replies arrive straight away.
- After some matches, the journalists wait for you at a press conference: a window opens on La Transversale.


YOUR SAVE AND YOUR DATA
-----------------------
- LifeLegend READS your save; it does not change it. Two exceptions, off by default: "Offer redirection"
  (experimental) and "Influence: real effects in the game" (formation verified in Football Life 2027, transfer
  experimental) in Settings › Your save. If you turn them on, LifeLegend may
  write to your save (only with the game closed) and keeps a copy. Leave them off if you don't want to take any risk.
- Your settings and careers are in %APPDATA%\LiveTweet\data (paste this path into File Explorer).
- Your AI key is encrypted with your Windows account and only sent to the chosen provider. Your save key stays on this
  PC and is never sent anywhere.
- At each sync, LifeLegend sends that provider the facts of your career (matches, stats, player and club names) and
  your posts, so it can write. What you write on Kop, in Mails and in Vestiaire is sent too, so that people can answer.
  If you dictate an answer at a press conference, your voice goes to Google (Gemini) to be transcribed, only when you
  use the microphone. Nothing else leaves your computer.
- LifeLegend contains no game file: names, crests, faces and boots are read from your game and stay on your computer.


UNINSTALL
---------
Delete the LifeLegend-1.0.0-win-x64 folder and, to erase your careers, the %APPDATA%\LiveTweet folder.


IF SOMETHING GOES WRONG
-----------------------
- "Key rejected": check your AI key in Settings.
- Overloaded models: this is temporary, try again in a few minutes. LifeLegend already switches models by itself.
- Daily quota used up: a free Google key has a daily request limit, renewed at midnight Pacific time. Until then, you
  can use a Groq key, which is free too.
- No save found: Settings › Your save › "Choose another file…".
- "Locked save": the Football Life 2027 save key is missing (see WHAT YOU NEED).
- Player names missing: Settings › Player names › "Choose the game folder…" (Football Life's, or PES 2021's).
- A problem: Settings › About › "Prepare the report". LifeLegend saves a text file (version, useful settings,
  latest error messages), without your AI key, your email address or your texts. Read it, then send it with your
  game version and what you were doing. Nothing is sent automatically.


LICENCE
-------
LifeLegend is released under the MIT licence (LICENSE.txt). Fonts, icons, reused layouts and bundled software have
their own licences: THIRD-PARTY-NOTICES.txt, LICENSE.electron.txt and LICENSES.chromium.html.
