'use strict';
// Plan des posts Kop d'une édition, décidé par le code comme celui de La Transversale : qui écrit, sur quoi et dans
// quel style ; l'IA n'écrit que les textes. Les consignes seules ne suffisaient pas (synchro du 14/01/2021 : aucun post
// sur le joueur, aucun nouveau compte, presque tout le monde écrivait pareil). Le plan garantit des posts sur lui (avec
// son @), de nouvelles voix à côté des habitués qui tournent, et des façons d'écrire différentes.

// ---------- Façons d'écrire ----------
const FAN_STYLES = [
  'tout en minuscules, sans ponctuation, abréviations (mdr, jsp, frr, tkt)',
  'phrases courtes, beaucoup d’emojis',
  'MAJUSCULES quand il s’emballe, points d’exclamation',
  'ironique, pince-sans-rire, phrases bien tournées',
  'langage de tribune : « allez », chants, « on lâche rien »',
  'râleur et pessimiste, « comme d’hab »',
  'posé, argumente avec des chiffres simples',
  'questions rhétoriques, interpelle les autres',
];
const PRO_STYLES = {
  journalist: ['style dépêche, factuel', 'proche du club, chaleureux', 'analytique, nuancé'],
  pundit: ['tranché, punchlines', 'pédagogue, explique le jeu'],
  stats: ['le chiffre d’abord, emoji 📊'], betting: ['cotes et emojis 💰, toujours « jouez avec modération »'],
  meme: ['une phrase choc et un emoji, culture web', 'tout en minuscules, second degré'],
};
function hashOf(str) {
  let h = 2166136261;
  for (const c of String(str).toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
// Stable pour un compte (tirée de son pseudo).
function styleOf(handle, type) {
  const list = PRO_STYLES[type] || (type === 'fan' || type === 'rival' ? FAN_STYLES : null);
  return list ? list[hashOf(handle) % list.length] : undefined;
}

// ---------- Temps de jeu ----------
// Sa dernière apparition avec son club et le nombre de matchs du club joués depuis sans lui.
// Seulement depuis son arrivée au club : les matchs joués avant par son nouveau club ne sont pas « sans lui ».
function playingTime(s) {
  const since = s.player?.history?.joinedClub || null;
  const played = (s.fixtures || []).filter((f) => f.played && (!since || f.date >= since));
  const k = played.map((f) => Boolean(f.me?.minutes)).lastIndexOf(true);
  const last = k >= 0 ? played[k] : null;
  return {
    last_appearance: last ? { date: last.date, competition: last.competition, opponent: last.venue === 'domicile' ? last.away : last.home, minutes: last.me.minutes, started: Boolean(last.me.starter) } : null,
    club_matches_without_him_since: k >= 0 ? played.length - 1 - k : played.length,
    joined_club_on: since || undefined,
    last_5_club_matches: played.slice(-5).map((f) => (f.me?.minutes ? `${f.me.starter ? 'titulaire' : 'remplaçant entré'} (${f.me.minutes} min)` : 'pas joué')),
  };
}

// ---------- Nouveaux comptes ----------
// Prénoms des supporters, de toutes les origines qu'on entend en tribune (un testeur : « c'est toujours les mêmes noms
// qui reviennent » ; 32 prénoms en français, la moitié des messages signés des dix mêmes). Un nouveau compte prend un
// prénom pas encore vu sur Kop tant qu'il en reste.
const FIRST_NAMES = {
  fr: ['Maxime', 'Léa', 'Yanis', 'Inès', 'Hugo', 'Camille', 'Nathan', 'Manon', 'Rayan', 'Chloé', 'Enzo', 'Jade', 'Mehdi', 'Clara', 'Théo', 'Lina', 'Bilal', 'Sarah', 'Romain', 'Anaïs', 'Sofiane', 'Julie', 'Quentin', 'Moussa', 'Pauline', 'Adam', 'Océane', 'Malik', 'Margaux', 'Kevin', 'Yasmine', 'Antoine',
    'Thomas', 'Nicolas', 'Julien', 'Mathieu', 'Guillaume', 'Florian', 'Jérôme', 'Sébastien', 'Ludovic', 'Damien', 'Vincent', 'Benoît', 'Cédric', 'Grégory', 'Arnaud', 'Bastien', 'Loïc', 'Valentin', 'Dylan', 'Lucas', 'Louis', 'Gabriel', 'Raphaël', 'Arthur', 'Jules', 'Paul', 'Tom', 'Noah', 'Ethan', 'Mathis', 'Axel', 'Alexis', 'Corentin', 'Baptiste', 'Clément', 'Adrien', 'Pierre', 'Simon', 'Victor', 'Benjamin', 'Jordan', 'Anthony', 'Steven', 'Mickaël', 'Fabien', 'Olivier', 'Laurent', 'Stéphane', 'Christophe', 'Thierry', 'Philippe', 'Pascal', 'Gilles', 'Serge', 'Michel', 'Alain', 'Didier', 'Yannick', 'Gaëtan', 'Erwan', 'Yann', 'Ronan', 'Maël', 'Jean-Marc', 'Jean-Pierre',
    'Emma', 'Louise', 'Alice', 'Léna', 'Zoé', 'Juliette', 'Romane', 'Ambre', 'Mathilde', 'Marine', 'Laura', 'Émilie', 'Céline', 'Sandrine', 'Nathalie', 'Aurélie', 'Élodie', 'Justine', 'Charlotte', 'Margot', 'Agathe', 'Morgane', 'Audrey', 'Mélanie', 'Coralie', 'Noémie', 'Eva', 'Lisa', 'Maëlle', 'Sophie', 'Caroline', 'Valérie', 'Sabrina', 'Jessica', 'Amandine', 'Gwen',
    'Karim', 'Nabil', 'Samir', 'Rachid', 'Youssef', 'Hakim', 'Walid', 'Farid', 'Mounir', 'Nordine', 'Hamza', 'Ayoub', 'Anis', 'Amine', 'Idriss', 'Ismaël', 'Mamadou', 'Ibrahima', 'Ousmane', 'Abdoulaye', 'Seydou', 'Cheikh', 'Djibril', 'Kader', 'Aïcha', 'Fatou', 'Aminata', 'Nadia', 'Samia', 'Leïla', 'Myriam', 'Sonia', 'Rania', 'Kenza', 'Imane', 'Nour', 'Malika',
    'João', 'Diogo', 'Fabio', 'Mattéo', 'Lorenzo', 'Giovanni', 'Carla', 'Lucia', 'Teddy', 'Jessy', 'Wesley', 'Willy', 'Rudy', 'Johan', 'Cindy', 'Mélissa', 'Salomé'],
  it: ['Marco', 'Giulia', 'Luca', 'Francesca', 'Matteo', 'Chiara', 'Alessandro', 'Sara', 'Lorenzo', 'Martina', 'Davide', 'Elena', 'Simone', 'Federica', 'Andrea', 'Giorgia', 'Riccardo', 'Valentina', 'Tommaso', 'Alessia',
    'Gianluca', 'Stefano', 'Paolo', 'Fabrizio', 'Roberto', 'Massimo', 'Antonio', 'Salvatore', 'Giuseppe', 'Vincenzo', 'Gennaro', 'Ciro', 'Pietro', 'Emanuele', 'Mattia', 'Gabriele', 'Filippo', 'Edoardo', 'Nicolò', 'Daniele', 'Claudio', 'Fabio', 'Michele', 'Alberto', 'Enrico',
    'Silvia', 'Roberta', 'Anna', 'Ilaria', 'Beatrice', 'Aurora', 'Noemi', 'Camilla', 'Eleonora', 'Serena', 'Veronica', 'Laura', 'Elisa', 'Rebecca', 'Greta', 'Monica', 'Karim', 'Youssef', 'Amadou', 'Ibrahima'],
  es: ['Javi', 'Lucía', 'Sergio', 'Marta', 'Pablo', 'Carmen', 'Álvaro', 'Laura', 'Diego', 'Paula', 'Rubén', 'Iker', 'Nerea', 'Dani', 'Alba', 'Raúl',
    'Alejandro', 'Adrián', 'Carlos', 'David', 'Jorge', 'Miguel', 'Fernando', 'Manuel', 'Antonio', 'Francisco', 'Óscar', 'Víctor', 'Marcos', 'Hugo', 'Mario', 'Gonzalo', 'Íñigo', 'Unai', 'Aitor', 'Asier', 'Jon', 'Borja', 'Nacho', 'Quique', 'Pepe', 'Rafa',
    'María', 'Ana', 'Cristina', 'Elena', 'Sara', 'Irene', 'Andrea', 'Claudia', 'Sofía', 'Julia', 'Noelia', 'Rocío', 'Ainhoa', 'Leire', 'Maite', 'Pilar', 'Raquel', 'Mohamed', 'Yusuf', 'Wilson'],
  en: ['Jack', 'Emily', 'Harry', 'Sophie', 'Charlie', 'Olivia', 'George', 'Amelia', 'Callum', 'Jess', 'Liam', 'Chloe', 'Ryan', 'Megan', 'Dan', 'Ellie',
    'James', 'Tom', 'Josh', 'Sam', 'Ben', 'Luke', 'Matt', 'Adam', 'Jamie', 'Connor', 'Kieran', 'Lewis', 'Alfie', 'Archie', 'Reece', 'Jordan', 'Nathan', 'Rhys', 'Owen', 'Craig', 'Gary', 'Steve', 'Mark', 'Paul', 'Darren', 'Lee', 'Wayne', 'Kev',
    'Grace', 'Lucy', 'Hannah', 'Holly', 'Katie', 'Rachel', 'Laura', 'Becky', 'Zoe', 'Abbie', 'Niamh', 'Erin', 'Mohammed', 'Ibrahim', 'Aisha', 'Kwame', 'Tunde', 'Priya', 'Raj', 'Marcus', 'Tyrone', 'Andre'],
  de: ['Lukas', 'Lena', 'Jonas', 'Anna', 'Felix', 'Laura', 'Max', 'Lea', 'Tim', 'Sophie', 'Niklas', 'Mia', 'Jan', 'Hannah',
    'Leon', 'Paul', 'Finn', 'Luca', 'Ben', 'Elias', 'Moritz', 'Tobias', 'Florian', 'Sebastian', 'Stefan', 'Markus', 'Thomas', 'Andreas', 'Christian', 'Daniel', 'Patrick', 'Dennis', 'Kevin', 'Marcel', 'Sven', 'Jürgen', 'Uwe', 'Dirk',
    'Julia', 'Lisa', 'Sarah', 'Katharina', 'Marie', 'Emma', 'Johanna', 'Sandra', 'Nicole', 'Tanja', 'Jana', 'Mehmet', 'Emre', 'Can', 'Deniz', 'Ayşe', 'Elif', 'Kaan', 'Burak'],
  pt: ['João', 'Inês', 'Tiago', 'Beatriz', 'Rui', 'Mariana', 'Diogo', 'Catarina', 'Bruno', 'Ana', 'Pedro', 'Sofia',
    'Miguel', 'Gonçalo', 'Rodrigo', 'Francisco', 'André', 'Ricardo', 'Nuno', 'Hugo', 'Filipe', 'Luís', 'Paulo', 'Carlos', 'Vasco', 'Duarte', 'Martim', 'Afonso', 'Rafael', 'Hélder',
    'Rita', 'Joana', 'Marta', 'Carolina', 'Leonor', 'Matilde', 'Teresa', 'Daniela', 'Patrícia', 'Sara', 'Cátia', 'Vanessa', 'Wilson', 'Edson', 'Nelson', 'Djalma'],
  nl: ['Daan', 'Emma', 'Sem', 'Julia', 'Bram', 'Sanne', 'Thijs', 'Lotte', 'Jesse', 'Fleur',
    'Lars', 'Ruben', 'Stijn', 'Niels', 'Tim', 'Joost', 'Kees', 'Jeroen', 'Bas', 'Wouter', 'Sven', 'Luuk', 'Milan', 'Thomas', 'Jasper', 'Pieter', 'Mark', 'Dennis',
    'Anouk', 'Eva', 'Lisa', 'Sophie', 'Iris', 'Femke', 'Noor', 'Esmee', 'Lieke', 'Mohamed', 'Youssef', 'Mounir', 'Ryan', 'Quincy', 'Virgil'],
  tr: ['Emre', 'Burak', 'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Can', 'Cem', 'Kerem', 'Onur', 'Serkan', 'Hakan', 'Volkan', 'Arda', 'Barış', 'Oğuz', 'Umut', 'Yusuf', 'Murat', 'Tolga', 'Kaan', 'Furkan', 'Enes', 'Selin', 'Elif', 'Zeynep', 'Ayşe', 'Merve', 'Büşra', 'Esra', 'Derya', 'Ece', 'Gizem', 'Fatma', 'Deniz', 'İrem'],
  ru: ['Dmitri', 'Sergei', 'Alexei', 'Ivan', 'Nikita', 'Artyom', 'Pavel', 'Andrei', 'Maxim', 'Mikhail', 'Vladimir', 'Igor', 'Roman', 'Yuri', 'Oleg', 'Denis', 'Kirill', 'Egor', 'Anna', 'Olga', 'Natalia', 'Yekaterina', 'Daria', 'Svetlana', 'Irina', 'Polina', 'Ksenia', 'Elena', 'Alina', 'Vera'],
  el: ['Giorgos', 'Nikos', 'Kostas', 'Dimitris', 'Giannis', 'Vasilis', 'Christos', 'Panagiotis', 'Thanasis', 'Stelios', 'Manolis', 'Alexandros', 'Spyros', 'Lefteris', 'Makis', 'Maria', 'Eleni', 'Katerina', 'Sofia', 'Dimitra', 'Georgia', 'Christina', 'Ioanna', 'Vasiliki', 'Despina'],
  da: ['Mads', 'Rasmus', 'Frederik', 'Mikkel', 'Jonas', 'Kasper', 'Christian', 'Anders', 'Mathias', 'Emil', 'Oliver', 'Magnus', 'Søren', 'Lasse', 'Nikolaj', 'Troels', 'Anne', 'Mette', 'Camilla', 'Ida', 'Freja', 'Line', 'Sofie', 'Louise', 'Maja', 'Signe'],
};
FIRST_NAMES.be = [...FIRST_NAMES.nl, 'Wout', 'Jens', 'Pieter-Jan', 'Kobe', 'Arne', 'Lotte', 'Jolien', 'Elke', 'Nathalie', 'Cédric', 'Olivier', 'Benoît', 'Arnaud', 'Grégory', 'Céline', 'Aurélie', 'Mehdi', 'Karim', 'Youssef', 'Ilias'];
// Pseudos de supporters qui ne signent pas d'un prénom (environ un compte sur cinq), comme sur un vrai réseau.
const NICKNAMES = {
  fr: ['Le Sage du Virage', 'Tonton du Kop', 'Petit Pont', 'Tacle Glissé', 'Lucarne', 'Reprise de Volée', 'Grinta', 'Tribune Nord', 'Virage Sud', 'Abonné depuis 98', 'Coach de Canapé', 'Ballon Rond', 'Panenka', 'Râteau', 'Le Libéro', 'Numéro 10', 'Contre-Pied', 'Plat du Pied', 'Gaucher Contrarié', 'Mi-Temps', 'Hors-Jeu', 'Banc de Touche', 'Café des Sports', 'Tifo Maison', 'Corner Rentrant', 'Arrêt de Jeu', 'Remontada', 'Bonnet Écharpe', 'Pépé du Stade', 'Le Puriste', 'Le Tacticien', 'Football Total', 'Coup Franc', 'Lob Parfait'],
  it: ['Curva Nord', 'Tifoso Doc', 'Il Mister', 'Catenaccio', 'Rovesciata', 'Fuorigioco', 'Gol al 90', 'Mezzala', 'Trequartista', 'Abbonato', 'Bar Sport', 'Zona Cesarini'],
  es: ['Tiki Taka', 'Golazo', 'Grada Norte', 'Abonado', 'El Míster', 'Media Volea', 'Caño', 'Chilena', 'Pase Largo', 'Garra', 'Peña Futbolera', 'Tercer Tiempo'],
  en: ['Terrace Talk', 'Back Of The Net', 'Top Bins', 'Nutmeg', 'Route One', 'Sunday League', 'Half Time Pie', 'Park The Bus', 'Box To Box', 'Season Ticket', 'False Nine', 'Away Day'],
  de: ['Südkurve', 'Fußballgott', 'Kurvenkind', 'Doppelpass', 'Abseitsfalle', 'Stehplatz', 'Dauerkarte', 'Flutlicht', 'Steilpass', 'Zehner'],
  pt: ['Bancada Norte', 'Golaço', 'Chapéu', 'Bicicleta', 'O Mister', 'Cabeçada', 'Sócio', 'Claque'],
  nl: ['Totaal Voetbal', 'Vak F', 'Panna', 'Seizoenkaart', 'Buitenspel', 'Kopbal', 'Tribune Noord'],
  tr: ['Kale Arkası', 'Tribün Sesi', 'Deplasman', 'Rövaşata', 'Ofsayt', 'Gol Kralı', 'Kombine'],
  ru: ['Tribuna', 'Futbolny Fan', 'Bolelshchik', 'Stadion', 'Pyatyorka'],
  el: ['Kerkida', 'Gipedo', 'Thyra Gate', 'Dekaria'],
  da: ['Langbold', 'Tilskuer', 'Fodboldnørd', 'Hjemmebane', 'Sæsonkort'],
  be: ['Tribune Noord', 'Kop de Ville', 'Panna', 'Seizoenkaart', 'Abonné', 'Buitenspel'],
};
// Noms de famille des consultants et des journalistes inventés, par pays (jamais celui d'un consultant ou d'un
// journaliste connu).
const LAST_NAMES = {
  fr: ['Lefebvre', 'Moreau', 'Garnier', 'Chevalier', 'Rousseau', 'Fontaine', 'Perrin', 'Lemaire', 'Barbier', 'Guérin', 'Collet', 'Faure', 'Roussel', 'Marchand', 'Leclerc', 'Benali', 'Haddad', 'Diallo'],
  it: ['Rinaldi', 'Ferraro', 'Marchetti', 'Galli', 'Fontana', 'Barbieri', 'Santoro', 'Caruso', 'Bellini', 'Testa', 'Grasso', 'Moretti', 'Vitale', 'Longo', 'Sartori', 'Cattaneo'],
  es: ['Navarro', 'Ortega', 'Delgado', 'Castro', 'Rubio', 'Molina', 'Serrano', 'Iglesias', 'Cortés', 'Garrido', 'Lozano', 'Prieto', 'Cano', 'Méndez', 'Calvo', 'Pastor'],
  en: ['Whitfield', 'Harding', 'Doyle', 'Barker', 'Marsh', 'Pritchard', 'Langley', 'Bennett', 'Crawford', 'Ashworth', 'Thornton', 'Mercer', 'Hollis', 'Sheridan', 'Kendall', 'Ellison'],
  de: ['Hoffmann', 'Schäfer', 'Wagner', 'Becker', 'Krause', 'Vogel', 'Kaiser', 'Hartmann', 'Lange', 'Fuchs', 'Busch', 'Engel', 'Seidel', 'Winkler', 'Albrecht', 'Ziegler'],
  pt: ['Ferreira', 'Carvalho', 'Moreira', 'Teixeira', 'Correia', 'Pinto', 'Lopes', 'Cardoso', 'Azevedo', 'Ribeiro', 'Monteiro', 'Barros', 'Antunes', 'Matos', 'Sequeira'],
  nl: ['de Vries', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'Bos', 'Vos', 'Dekker', 'Brouwer', 'Kramer', 'Hendriks', 'Prins', 'Huisman', 'Schouten'],
  tr: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt'],
  ru: ['Smirnov', 'Ivanov', 'Kuznetsov', 'Popov', 'Sokolov', 'Lebedev', 'Kozlov', 'Novikov', 'Morozov', 'Volkov', 'Solovyov', 'Vasiliev', 'Zaitsev', 'Pavlov', 'Golubev'],
  el: ['Papadopoulos', 'Pappas', 'Oikonomou', 'Georgiou', 'Nikolaidis', 'Vlachos', 'Antoniou', 'Makris', 'Dimitriou', 'Karalis', 'Konstantinou', 'Alexiou', 'Mavros'],
  da: ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen'],
  be: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Dupont', 'Simon', 'Laurent'],
};
// Comptes de mèmes inventés, par pays (les autres pays : ceux en anglais).
const MEME_ACCOUNTS = {
  fr: [['HerosDuGazon', 'Héros du Gazon'], ['LucarneMdr', 'Lucarne Mdr'], ['CornerDuRire', 'Corner du Rire']],
  en: [['TopBinsBanter', 'Top Bins Banter'], ['OffsideGiggles', 'Offside Giggles'], ['HalfTimeMemes', 'Half Time Memes']],
  es: [['CanoDeRisa', 'Caño de Risa'], ['FueraDeJuegoXD', 'Fuera de Juego XD'], ['GradaMemes', 'Grada Memes']],
  it: [['CucchiaioMeme', 'Cucchiaio Meme'], ['FuorigiocoLol', 'Fuorigioco LOL'], ['PanchinaRide', 'La Panchina Ride']],
  de: [['AbseitsMemes', 'Abseits Memes'], ['FlutlichtLol', 'Flutlicht LOL'], ['SteilpassSpass', 'Steilpass Spaß']],
  pt: [['ChapeuMemes', 'Chapéu Memes'], ['GolacoRisos', 'Golaço Risos'], ['BancadaLol', 'Bancada LOL']],
};
// Les marques de ce monde (src/ai/prompts.js, BRANDS) : un compte unique chacune.
const BRAND_ACCOUNTS = { stats: { handle: 'Scoreline_FR', name: 'Scoreline' }, betting: { handle: 'CoteFoot', name: 'CoteFoot' } };
// Combien de voix différentes de chaque métier Kop finit par avoir.
const CAST = { journalist: 2, pundit: 2, meme: 1 };

// Le prénom (ou le pseudo) qu'affiche un compte : avant « | » et l'initiale (« Karim B. » → Karim).
const firstOf = (name) => String(name || '').split(' | ')[0].replace(/\s+[A-Z]\.$/, '').trim();
// Prénoms et pseudos déjà vus sur Kop : un nouveau compte en prend un autre tant qu'il en reste.
function usedFirsts(state) {
  const out = new Set();
  for (const a of Object.values(state.accounts || {})) out.add(firstOf(a.name));
  for (const p of state.feed || []) for (const x of [p, ...(p.replies || [])]) if (x.author && !x.author.isMe) out.add(firstOf(x.author.name));
  out.delete('');
  return out;
}
// Pays du championnat d'après son nom (prénoms des supporters) ; français par défaut.
// Un compte prend les prénoms du pays de SON club (clubLeague : club → son championnat, lu dans les scores du monde) ;
// un supporter neutre, ceux du championnat du joueur.
function langOf(league) {
  const n = String(league || '');
  // Les noms précis d'abord : « Bundesliga », « Superliga » et « Premier Liga » contiennent « liga » (pas l'Espagne).
  if (/S[üu]per Lig|Turkish|TFF/i.test(n)) return 'tr';
  if (/Russian|Premier Liga/i.test(n)) return 'ru';
  if (/^Super League$|Elladas|Greek/i.test(n)) return 'el';
  if (/^Superliga$|Danish/i.test(n)) return 'da';
  if (/Jupiler|Pro League|Belgian|Croky/i.test(n)) return 'be';
  if (/Bundesliga|DFB/i.test(n)) return 'de';
  if (/Liga Portugal|Liga NOS|Taça|Brasileir/i.test(n)) return 'pt';
  if (/Eredivisie|KNVB/i.test(n)) return 'nl';
  if (/Serie|Coppa|Calcio/i.test(n)) return 'it';
  if (/Premier League|EFL|Championship|FA Cup|Scottish|MLS|Major League Soccer/i.test(n)) return 'en';
  if (/LaLiga|\bLiga\b|Copa del Rey|Segunda/i.test(n)) return 'es';
  return 'fr';
}
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
const CLUB_WORDS = new Set(['fc', 'ac', 'as', 'sc', 'cf', 'afc', 'rc', 'ss', 'us', 'olympique', 'stade', 'club', 'sporting', 'real', 'athletic', 'calcio', 'football', 'futbol', 'de', 'la', 'le', 'du']);
// Mot qui désigne un club dans un pseudo : le plus long hors mots génériques (« Olympique Lyonnais » → Lyonnais).
function clubTag(name) {
  // Trois mots ou plus : le sigle, comme les supporters (« Paris Saint-Germain » → PSG).
  const all = String(name || '').split(/[\s-]+/).filter((w) => w && !['de', 'la', 'le', 'du'].includes(w.toLowerCase()) && !/^\d+$/.test(w));
  if (all.length >= 3) return all.map((w) => plain(w)[0] || '').join('').toUpperCase();
  const words = String(name || '').split(/[\s-]+/).filter((w) => w && !CLUB_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));
  return plain(words.sort((a, b) => b.length - a.length)[0] || name).slice(0, 13);
}
// Tirage reproductible (même synchro, même plan).
function rng(seed) {
  let a = hashOf(seed);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Un compte qui n'a jamais posté : pseudo et nom crédibles, jamais celui d'un compte connu. firsts : prénoms et pseudos
// déjà pris (sur Kop et dans ce plan) ; un prénom libre d'abord. Le nom affiché varie comme sur un vrai réseau : le
// prénom, « prénom | club », « prénom + initiale » ou un pseudo de supporter.
function newPersona({ rand, lang, club, type, taken, firsts = new Set() }) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const names = FIRST_NAMES[lang] || FIRST_NAMES.fr, nicks = NICKNAMES[lang] || NICKNAMES.fr;
  const tag = club ? clubTag(club) : null;
  for (let i = 0; i < 20; i++) {
    const nick = rand() < 0.2;
    const pool = (nick ? nicks : names).filter((n) => !firsts.has(n));
    const first = pick(pool.length ? pool : nick ? nicks : names);
    const F = plain(first), f = F.toLowerCase();
    const nn = String(85 + Math.floor(rand() * 22)).slice(-2), n = 1 + Math.floor(rand() * 9);
    const handles = nick ? [F, `${F}${nn}`, `${F}_${n}`, ...(tag ? [`${F}${tag}`] : [])]
      : tag ? [`${F}_${tag}`, `${f}${tag.toLowerCase()}${nn}`, `${tag}${F}${n}`, `${F}${tag}${nn}`] : [`${F}Foot${nn}`, `foot${f}${n}`, `${f}_ballon`, `${F}LeFoot${n}`];
    // X limite les pseudos à 15 caractères : un format qui tient, plutôt qu'un nom coupé (« AntoineMontpell »).
    const fits = handles.filter((h) => h.length <= 15 && h.length >= 4);
    const handle = fits.length ? pick(fits) : `${(tag || F).slice(0, 13)}${nn}`.slice(0, 15);
    if (taken.has(handle.toLowerCase())) continue;
    taken.add(handle.toLowerCase());
    firsts.add(first);
    const r = rand();
    const name = nick ? first : tag && r < 0.35 ? `${first} | ${club}` : r < 0.6 ? `${first} ${'ABCDEFGHJKLMNPRSTV'[Math.floor(rand() * 18)]}.` : first;
    return { handle, name, type, new: true, style: pick(FAN_STYLES) };
  }
  return null;
}

// ---------- Plan ----------
const OFFICIAL = new Set(['player', 'coach', 'competition', 'club', 'national']);
// Habitués d'un type : ceux qui ont le moins posté dernièrement passent d'abord (les têtes tournent), puis les plus actifs.
// Supporters et rivaux : seulement ceux qui ont parlé depuis son arrivée au club (since), pas ceux de l'ancien club.
function regulars(state, type, used, since = null, fits = () => true) {
  const recent = new Map(), total = new Map();
  const feed = state.feed.filter((p) => !p.official && !p.author.isMe && (!since || p.gameDate > since) && fits(p.author));
  feed.forEach((p, i) => {
    const h = p.author.handle;
    if (p.author.type !== type || OFFICIAL.has(p.author.type)) return;
    total.set(h, (total.get(h) || 0) + 1);
    if (i >= feed.length - 25) recent.set(h, (recent.get(h) || 0) + 1);
  });
  return [...total.keys()].filter((h) => !used.has(h.toLowerCase()))
    .sort((a, b) => (recent.get(a) || 0) - (recent.get(b) || 0) || total.get(b) - total.get(a))
    .map((h) => { const a = Object.entries(state.accounts || {}).find(([k]) => k.toLowerCase() === h.toLowerCase())?.[1]; return { handle: h, name: a?.name || h, type }; });
}
const dayPart = (h) => (!Number.isInteger(h) ? '' : h < 12 ? `${h}h, « ce matin »` : h < 18 ? `${h}h, « cet après-midi »` : `${h}h, « ce soir »`);

// Rend [{ handle, name, type, new?, style, angle, tag?, supports? }] : une douzaine de posts.
// world : le football mondial depuis la dernière édition ({ stories: [{ competition, teams, story }], take }), ou null.
function tribunePlan({ state, snapshot: s, changes, handle: me, world = null, clubLeague = null }) {
  const rand = rng(`${state.careerId}|${s.gameDate}|${state.editions?.length || 0}`);
  const lang = langOf(s.league?.name);
  const langFor = (club) => (club && clubLeague?.get(club) ? langOf(clubLeague.get(club)) : lang);
  const taken = new Set([...Object.keys(state.accounts || {}), ...state.feed.flatMap((p) => [p, ...(p.replies || [])]).map((x) => x.author.handle)].map((h) => h.toLowerCase()));
  const used = new Set();
  const slots = [];
  const add = (who, angle, extra = {}) => {
    if (!who) return;
    used.add(who.handle.toLowerCase());
    slots.push({ handle: who.handle, name: who.name, type: who.type, ...(who.new ? { new: true } : {}), style: who.style || styleOf(who.handle, who.type), angle, ...extra });
  };
  const since = s.player?.history?.joinedClub || null;
  // Un supporter ou un rival marqué d'un autre club (@RennesMehdi2, @adamlyonnais95 après le départ de Rennes) : écarté.
  const tagOf = new Map(Object.values(state.clubPages || {}).filter((p) => !p.kind && p.name).map((p) => [clubTag(p.name).toLowerCase(), p.name]).filter(([k]) => k.length >= 4));
  const league = new Set((s.table || []).map((r) => r.team));
  const clubsIn = (a) => { const txt = `${a.handle} ${a.name}`.toLowerCase(); return [...tagOf].filter(([k]) => txt.includes(k)).map(([, n]) => n); };
  // Et apparu pour la première fois après son arrivée : les supporters de l'ancien club (« Loïc SRFC ») restent libres de
  // réagir d'eux-mêmes, mais le plan ne les choisit plus.
  const firstSeen = new Map();
  for (const p of state.feed) for (const x of [p, ...(p.replies || [])]) { const h = x.author.handle.toLowerCase(), d = x.gameDate || p.gameDate; if (!firstSeen.has(h) || d < firstSeen.get(h)) firstSeen.set(h, d); }
  const fresh0 = (a) => !since || (firstSeen.get(a.handle.toLowerCase()) || '') > since;
  const accountOf = (h) => { const k = Object.keys(state.accounts || {}).find((x) => x.toLowerCase() === h.toLowerCase()); return k ? state.accounts[k] : null; };
  const supports = (a) => accountOf(a.handle)?.supports || null;
  const fitsFan = (a) => fresh0(a) && clubsIn(a).every((n) => n === s.club.name) && (!supports(a) || supports(a) === s.club.name);
  const fitsRival = (a) => fresh0(a) && clubsIn(a).every((n) => league.has(n) && n !== s.club.name);
  const regular = (type) => regulars(state, type, used, type === 'fan' || type === 'rival' ? since : null, type === 'fan' ? fitsFan : type === 'rival' ? fitsRival : undefined)[0] || null;
  const firsts = usedFirsts(state);
  const fresh = (type, club) => newPersona({ rand, lang: langFor(club), club, type, taken, firsts });
  const leagueRival = () => { const others = (s.table || []).filter((r) => !r.mine).map((r) => r.team); return others.length ? others[Math.floor(rand() * others.length)] : null; };
  // Consultants, journalistes, mèmes : un habitué ; un nouveau quand il en manque (CAST) et que l'habitué a déjà parlé
  // à la dernière édition, ou quand il n'y en a aucun de libre (avant : la place sautait, aucun compte de ce type).
  const lastDate = state.editions?.at(-1)?.gameDate || null;
  const spokeLast = (h) => Boolean(lastDate) && state.feed.some((p) => !p.official && p.gameDate === lastDate && p.author.handle.toLowerCase() === h.toLowerCase());
  const castOf = (type) => Object.values(state.accounts || {}).filter((a) => a.type === type).length;
  const pro = (type) => {
    const r = regular(type);
    if (r && !(castOf(type) < (CAST[type] || 1) && spokeLast(r.handle))) return r;
    return newPro({ rand, lang, type, taken }) || r;
  };
  // Les marques de ce monde (Scoreline, CoteFoot) : leur compte unique, même avant leur premier post.
  const brand = (type) => regular(type) || (BRAND_ACCOUNTS[type] && !used.has(BRAND_ACCOUNTS[type].handle.toLowerCase()) ? { ...BRAND_ACCOUNTS[type], type } : null);

  const club = s.club.name;
  const res = (changes.newResults || []).at(-1) || null;
  const next = s.next && s.next.date >= s.gameDate ? s.next : null;
  const opp = (m) => (m ? (m.venue === 'domicile' ? m.away : m.home) : null);
  const matchLabel = (m) => `${m.home} – ${m.away}${m.competition ? ` (${m.competition})` : ''}`;
  const today = next && next.date === s.gameDate;
  const when = next ? (today ? `today at ${dayPart(next.hour) || 'a time FACTS gives'}` : `on ${next.date}${Number.isInteger(next.hour) ? ` at ${next.hour}h` : ''}`) : '';
  const result = res ? `${res.home} ${res.score[0]}-${res.score[1]} ${res.away}` : null;
  const pt = playingTime(s);
  const pos = (s.table || []).find((r) => r.mine)?.pos;

  // 1-2. Lui : un supporter (nouveau compte) qui le tague, puis un journaliste ou consultant sur sa place.
  let about;
  if (res?.me?.goals) about = `celebrate his ${res.me.goals > 1 ? `${res.me.goals} goals` : 'goal'} in ${result} (exact numbers from FACTS)`;
  else if (res?.me) about = `his match in ${result}: ${res.me.minutes} minutes${res.me.rating ? `, rated ${res.me.rating}` : ''}; an honest fan opinion`;
  else if (pt.club_matches_without_him_since >= 2) about = `he has not played for ${pt.club_matches_without_him_since} club matches (last appearance ${pt.last_appearance ? `${pt.last_appearance.date} against ${pt.last_appearance.opponent}` : 'none this season'}): a fan who wants to see him play again and asks why`;
  else about = next ? `what the fans expect from him in ${matchLabel(next)}` : 'what the fans expect from him';
  add(fresh('fan', club), `${about}. Tag him (@${me}) in the text.`, { tag: me });
  add(pro('journalist'), `his place in the squad and his future: playing time (FACTS.player.playing_time), contract until ${s.player.contractUntil || 'the date in FACTS'}${changes.window || /^(01|07|08)/.test(String(s.gameDate).slice(5)) ? ', the transfer window' : ''}; nothing that FACTS does not show.`);

  // 3-5. Le match (avant, après, ou rien) : un habitué, un nouveau du coin, un supporter adverse.
  if (res) {
    add(regular('fan') || fresh('fan', club), `reaction to ${result}`);
    add(fresh('fan', club), `the best and the worst of his club in ${result}`);
    add(fresh('rival', opp(res)) || regular('rival'), `banter from a fan of ${opp(res)} after ${result}`);
    if (!next) add(fresh('fan', club), `a fan back from the stands after ${result}: the atmosphere, a chant, the way home; nothing about the match that FACTS does not give`);
  } else if (next) {
    add(regular('fan') || fresh('fan', club), `build-up to ${matchLabel(next)} ${when}: a prediction or the line-up he wants`);
    add(fresh('fan', club), `the mood before ${matchLabel(next)} ${when}`);
    add(fresh('rival', opp(next)) || regular('rival'), `provocation from a fan of ${opp(next)} before ${matchLabel(next)} ${when}`);
  } else {
    add(regular('fan') || fresh('fan', club), `his club's form and the table (${pos ? `${pos}e` : 'FACTS'})`);
    add(fresh('fan', club), 'life around the club this week');
    add(regular('rival') || fresh('rival', leagueRival()), "a league rival mocking his club's form");
  }
  // 6-9. Un rival habitué, le mème, les chiffres, un supporter neutre (nouveau) sur le championnat.
  add(regular('rival') || fresh('rival', leagueRival()), "banter with his club's fans about the table or the last results");
  // La vie de supporter avant son prochain match : le déplacement chez l'adversaire, ou le stade et ses rituels à domicile.
  if (next) {
    const away = next.venue === 'extérieur' || (next.venue !== 'domicile' && next.away === club);
    add(fresh('fan', club), away
      ? `a fan travelling to ${opp(next)}'s ground for ${matchLabel(next)} ${when}: the trip, the away end, the chants; no prediction of the score`
      : `a fan's matchday ritual before ${matchLabel(next)} ${when}${next.stadium ? ` at ${next.stadium}` : ''}: the stadium, the chants, the people he goes with; no prediction of the score`);
  }
  add(pro('meme'), 'a joke about the moment (the match, the table, his playing time)');
  add(brand('stats'), 'one number from FACTS that matters right now (table, form, scorers, his season)');
  add(fresh('fan', null), `${s.league?.name || 'the league'}: the title race, the relegation fight or another result of the round (FACTS.league_last_round, league_table)`);
  // 9 bis. Le football mondial (demande d'un testeur : « Mbappé plante un doublé en LdC ») : un supporter du club de la
  // plus grosse histoire, un autre sur la deuxième, une voix neutre sur la course au titre ou le joueur du mois. Le même
  // supporter revient quand son club refait l'actualité ; il ne devient jamais un supporter de son club.
  if (world?.stories?.length || world?.take) {
    const worldFan = (team) => regulars(state, 'fan', used, null, (a) => supports(a) === team)[0] || fresh('fan', team);
    const [a, b] = world.stories || [];
    if (a) add(worldFan(a.teams[0]), `football elsewhere, ${a.competition}: a fan of ${a.teams[0]} reacts to ${a.story}; only FACTS.football_elsewhere (exact scores and scorers), no goal order or minute`, { supports: a.teams[0] });
    if (b) add(worldFan(b.teams[1]), `football elsewhere, ${b.competition}: a fan of ${b.teams[1]} reacts to ${b.story}; only FACTS.football_elsewhere (exact scores and scorers), no goal order or minute`, { supports: b.teams[1] });
    add(pro('pundit'), `football elsewhere: ${world.take || 'one result of the big leagues that says something'}; only FACTS.football_elsewhere`);
  }
  // 10. Un consultant ou journaliste sur le coach.
  const coach = s.club.coach || 'the coach';
  add(pro('pundit'), res ? `${coach}'s choices in ${result}` : next ? `what ${coach} must do in ${matchLabel(next)}` : `${coach}'s situation`);
  // 11. Les cotes avant son match (une seule fois, chiffres de FACTS).
  if (next && !res && s.next?.odds) add(brand('betting'), `the odds of ${matchLabel(next)} from FACTS.next_match.odds only; play responsibly`);
  // 12. Libre : le mercato pendant le mercato, sinon au choix (un vrai joueur ou coach peut parler, règle 29).
  add(fresh('fan', club), changes.window || /^(01|07|08)/.test(String(s.gameDate).slice(5)) ? "the transfer window for his club: only the moves in FACTS.mercato, no invented rumour" : 'free: any topic of the moment');
  return slots;
}

// Comptes qui n'ont jamais posté, proposés aux discussions sous les posts.
// Un consultant ou un journaliste : prénom et nom du pays ; un compte de mèmes : un des noms prévus. Jamais un compte connu.
function newPro({ rand, lang, type, taken }) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  if (type === 'meme') {
    const free = (MEME_ACCOUNTS[lang] || MEME_ACCOUNTS.en).filter(([h]) => !taken.has(h.toLowerCase()));
    if (!free.length) return null;
    const [handle, name] = free[0];
    taken.add(handle.toLowerCase());
    return { handle, name, type, new: true, style: styleOf(handle, type) };
  }
  const firsts = FIRST_NAMES[lang] || FIRST_NAMES.fr, lasts = LAST_NAMES[lang] || LAST_NAMES.fr;
  for (let i = 0; i < 20; i++) {
    const first = pick(firsts), last = pick(lasts);
    const F = plain(first), L = plain(last);
    const handles = [`${F}${L}`, `${F[0]}${L}`, `${F}_${L}`, `${F}${L}_`].filter((h) => h.length <= 15 && h.length >= 4);
    const handle = handles.find((h) => !taken.has(h.toLowerCase()));
    if (!handle) continue;
    taken.add(handle.toLowerCase());
    return { handle, name: `${first} ${last}`, type, new: true, style: styleOf(handle, type) };
  }
  return null;
}

function newVoices({ state, snapshot: s, count = 6, clubLeague = null }) {
  const rand = rng(`${state.careerId}|${s.gameDate}|voix|${state.feed.length}`);
  const taken = new Set([...Object.keys(state.accounts || {}), ...state.feed.flatMap((p) => [p, ...(p.replies || [])]).map((x) => x.author.handle)].map((h) => h.toLowerCase()));
  const lang = langOf(s.league?.name);
  const langFor = (club) => (club && clubLeague?.get(club) ? langOf(clubLeague.get(club)) : lang);
  const next = s.next || s.last;
  const other = next ? (next.venue === 'domicile' ? next.away : next.home) : null;
  const firsts = usedFirsts(state);
  // Deux supporters de son club, deux de l'adversaire, deux neutres.
  const rivals = (s.table || []).filter((r) => !r.mine).map((r) => r.team);
  const rival = rivals.length ? rivals[Math.floor(rand() * rivals.length)] : other;
  return [
    newPersona({ rand, lang: langFor(s.club.name), club: s.club.name, type: 'fan', taken, firsts }),
    newPersona({ rand, lang: langFor(other), club: other, type: 'rival', taken, firsts }),
    newPersona({ rand, lang: langFor(null), club: null, type: 'fan', taken, firsts }),
    newPersona({ rand, lang: langFor(s.club.name), club: s.club.name, type: 'fan', taken, firsts }),
    newPersona({ rand, lang: langFor(rival), club: rival, type: 'rival', taken, firsts }),
    newPersona({ rand, lang: langFor(null), club: null, type: 'fan', taken, firsts }),
  ].filter(Boolean).slice(0, count);
}

// Comptes inventés par l'IA dans les discussions, malgré la consigne (vu le 2027-01-01 : « Anaïs | Aston Villa FC »,
// « Pauline | Real Sociedad ») : renommés par le code avec un prénom libre du pays de leur club (lu après « | » dans le
// nom ; sans club, celui du championnat du joueur). keep : les pseudos légitimes (comptes connus, nouvelles voix, vrais
// joueurs et clubs). Rend pseudo inventé (minuscules) → { handle, name }.
function renameInvented({ state, snapshot: s, clubLeague = null, authors, keep }) {
  const rand = rng(`${state.careerId}|${s.gameDate}|inventés|${state.feed.length}`);
  const lang = langOf(s.league?.name);
  const langFor = (club) => (club && clubLeague?.get(club) ? langOf(clubLeague.get(club)) : lang);
  const taken = new Set([...keep, ...Object.keys(state.accounts || {}).map((h) => h.toLowerCase())]);
  const firsts = usedFirsts(state);
  const out = new Map();
  for (const a of authors) {
    const h = String(a?.handle || '').toLowerCase();
    if (!h || out.has(h) || keep.has(h) || (a.type !== 'fan' && a.type !== 'rival')) continue;
    const club = String(a.name || '').includes(' | ') ? String(a.name).split(' | ').slice(1).join(' | ').trim() : null;
    const p = newPersona({ rand, lang: langFor(club), club, type: a.type, taken, firsts });
    if (!p) continue;
    // Le club reste dans le nom : c'est lui qui dit qui il soutient.
    out.set(h, { handle: p.handle, name: club && !p.name.includes(' | ') ? `${firstOf(p.name)} | ${club}` : p.name });
  }
  return out;
}

// Une bio qui recopie une consigne de style (« tout en minuscules, sans ponctuation… ») n'en est pas une.
const normStyle = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/s+/g, ' ').trim();
const STYLE_TEXTS = [...FAN_STYLES, ...Object.values(PRO_STYLES).flat()].map(normStyle);
const isStyleText = (bio) => { const b = normStyle(bio); return Boolean(b) && STYLE_TEXTS.some((st) => b.includes(st.slice(0, 24)) || st.includes(b)); };

module.exports = { tribunePlan, newVoices, newPro, renameInvented, playingTime, styleOf, isStyleText, FAN_STYLES, langOf, FIRST_NAMES, NICKNAMES, LAST_NAMES, MEME_ACCOUNTS };
