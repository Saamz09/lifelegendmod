'use strict';
// Les mails des contrats d'équipementier (src/world/sponsors.js), écrits sans IA, dans les six langues du jeu.
// o : { first, club, brand, person, agent, fee, bonus, until, deadline } ; les montants et les dates sont déjà mis en forme.

const T = {
  fr: {
    subject: (o) => `${o.brand} : proposition de contrat d’équipementier`,
    direct: (o) => `Bonjour ${o.first},\n\nJe m’occupe des joueurs chez ${o.brand}. Vos matchs avec ${o.club} ne sont pas passés inaperçus, et nous aimerions vous équiper.\n\nNotre proposition : ${o.fee} par saison et ${o.bonus} par but ou passe décisive, jusqu’au ${o.until}. Elle reste valable jusqu’au ${o.deadline}.\n\nVous pouvez nous répondre directement, ou laisser ${o.agent} discuter des conditions.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first},\n\n${o.brand} m’a contacté : ils veulent t’équiper. C’est ${o.person} qui suit le dossier chez eux.\n\nLeur proposition : ${o.fee} par saison et ${o.bonus} par but ou passe décisive, jusqu’au ${o.until}. Ils attendent une réponse avant le ${o.deadline}.\n\nDis-moi si on accepte, si je négocie ou si on passe.\n\n${o.agent}`,
    accepted: { direct: (o) => `Merci ${o.first}, c’est signé. Bienvenue chez ${o.brand} ! Le contrat court jusqu’au ${o.until}.\n\n${o.person}`, agent: (o) => `C’est signé avec ${o.brand}, jusqu’au ${o.until}. Je m’occupe des papiers.\n\n${o.agent}` },
    declined: { direct: (o) => `C’est noté, merci d’avoir pris le temps de répondre. Bonne suite de saison.\n\n${o.person}`, agent: (o) => `Compris, je préviens ${o.brand} que c’est non.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} nous a contactés. Nous pouvons aller jusqu’à ${o.fee} par saison et ${o.bonus} par but ou passe décisive. C’est notre dernier mot.\n\n${o.person}`, agent: (o) => `J’ai parlé à ${o.person} : ils montent à ${o.fee} par saison et ${o.bonus} par but ou passe décisive. Je ne pense pas qu’on aura mieux.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} nous a contactés, mais nous ne pouvons pas aller plus loin. Notre proposition reste valable jusqu’au ${o.deadline}.\n\n${o.person}`, agent: (o) => `J’ai essayé, mais ${o.brand} ne bouge pas. Leur proposition reste valable jusqu’au ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Sans réponse de votre part, nous retirons notre proposition. La porte reste ouverte pour plus tard.\n\n${o.person}`, agent: (o) => `${o.brand} a retiré sa proposition, faute de réponse. Ça reviendra si tu continues comme ça.\n\n${o.agent}` },
    ended: { direct: (o) => `Notre contrat arrive à son terme. Merci pour ces saisons, ${o.first}.\n\n${o.person}`, agent: (o) => `Ton contrat avec ${o.brand} est arrivé à son terme. Je garde un œil sur les prochaines marques.\n\n${o.agent}` },
  },
  en: {
    subject: (o) => `${o.brand}: boot deal proposal`,
    direct: (o) => `Hello ${o.first},\n\nI look after players at ${o.brand}. Your games for ${o.club} have not gone unnoticed, and we would like to kit you out.\n\nOur offer: ${o.fee} per season and ${o.bonus} per goal or assist, until ${o.until}. It stands until ${o.deadline}.\n\nYou can answer us directly, or let ${o.agent} discuss the terms.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first},\n\n${o.brand} got in touch: they want to kit you out. ${o.person} is handling it on their side.\n\nThe offer: ${o.fee} per season and ${o.bonus} per goal or assist, until ${o.until}. They want an answer by ${o.deadline}.\n\nTell me if we accept, if I negotiate or if we pass.\n\n${o.agent}`,
    accepted: { direct: (o) => `Thank you ${o.first}, it’s signed. Welcome to ${o.brand}! The deal runs until ${o.until}.\n\n${o.person}`, agent: (o) => `It’s signed with ${o.brand}, until ${o.until}. I’ll handle the paperwork.\n\n${o.agent}` },
    declined: { direct: (o) => `Understood, thank you for taking the time to answer. Good luck for the rest of the season.\n\n${o.person}`, agent: (o) => `Understood, I’ll tell ${o.brand} it’s a no.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} got in touch. We can go up to ${o.fee} per season and ${o.bonus} per goal or assist. That is our final word.\n\n${o.person}`, agent: (o) => `I spoke to ${o.person}: they are going up to ${o.fee} per season and ${o.bonus} per goal or assist. I don’t think we’ll get better.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} got in touch, but we cannot go any further. Our offer stands until ${o.deadline}.\n\n${o.person}`, agent: (o) => `I tried, but ${o.brand} won’t move. The offer stands until ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Having heard nothing from you, we are withdrawing our offer. The door stays open for later.\n\n${o.person}`, agent: (o) => `${o.brand} withdrew its offer, as there was no answer. It will come back if you keep this up.\n\n${o.agent}` },
    ended: { direct: (o) => `Our deal has come to an end. Thank you for these seasons, ${o.first}.\n\n${o.person}`, agent: (o) => `Your deal with ${o.brand} has come to an end. I’m keeping an eye on the next brands.\n\n${o.agent}` },
  },
  es: {
    subject: (o) => `${o.brand}: propuesta de contrato de botas`,
    direct: (o) => `Hola ${o.first}:\n\nMe ocupo de los jugadores en ${o.brand}. Tus partidos con el ${o.club} no han pasado desapercibidos y nos gustaría equiparte.\n\nNuestra propuesta: ${o.fee} por temporada y ${o.bonus} por gol o asistencia, hasta el ${o.until}. Sigue en pie hasta el ${o.deadline}.\n\nPuedes respondernos directamente o dejar que ${o.agent} hable de las condiciones.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first}:\n\n${o.brand} me ha contactado: quieren equiparte. ${o.person} lleva el tema con ellos.\n\nSu propuesta: ${o.fee} por temporada y ${o.bonus} por gol o asistencia, hasta el ${o.until}. Esperan respuesta antes del ${o.deadline}.\n\nDime si aceptamos, si negocio o si lo dejamos.\n\n${o.agent}`,
    accepted: { direct: (o) => `Gracias, ${o.first}, ya está firmado. ¡Bienvenido a ${o.brand}! El contrato dura hasta el ${o.until}.\n\n${o.person}`, agent: (o) => `Firmado con ${o.brand}, hasta el ${o.until}. Yo me encargo de los papeles.\n\n${o.agent}` },
    declined: { direct: (o) => `Entendido, gracias por tomarte el tiempo de responder. Mucha suerte en lo que queda de temporada.\n\n${o.person}`, agent: (o) => `Entendido, le digo a ${o.brand} que es un no.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} nos ha contactado. Podemos llegar a ${o.fee} por temporada y ${o.bonus} por gol o asistencia. Es nuestra última palabra.\n\n${o.person}`, agent: (o) => `He hablado con ${o.person}: suben a ${o.fee} por temporada y ${o.bonus} por gol o asistencia. No creo que consigamos más.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} nos ha contactado, pero no podemos ir más lejos. Nuestra propuesta sigue en pie hasta el ${o.deadline}.\n\n${o.person}`, agent: (o) => `Lo he intentado, pero ${o.brand} no se mueve. Su propuesta sigue en pie hasta el ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Al no tener respuesta, retiramos nuestra propuesta. La puerta sigue abierta para más adelante.\n\n${o.person}`, agent: (o) => `${o.brand} ha retirado su propuesta por falta de respuesta. Volverá si sigues así.\n\n${o.agent}` },
    ended: { direct: (o) => `Nuestro contrato llega a su fin. Gracias por estas temporadas, ${o.first}.\n\n${o.person}`, agent: (o) => `Tu contrato con ${o.brand} ha llegado a su fin. Sigo atento a otras marcas.\n\n${o.agent}` },
  },
  it: {
    subject: (o) => `${o.brand}: proposta di contratto per le scarpe`,
    direct: (o) => `Ciao ${o.first},\n\nmi occupo dei giocatori per ${o.brand}. Le tue partite con ${o.club} non sono passate inosservate e vorremmo equipaggiarti.\n\nLa nostra proposta: ${o.fee} a stagione e ${o.bonus} per gol o assist, fino al ${o.until}. Resta valida fino al ${o.deadline}.\n\nPuoi risponderci direttamente o lasciare che ${o.agent} discuta le condizioni.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first},\n\n${o.brand} mi ha contattato: vogliono equipaggiarti. Da loro segue la cosa ${o.person}.\n\nLa proposta: ${o.fee} a stagione e ${o.bonus} per gol o assist, fino al ${o.until}. Aspettano una risposta entro il ${o.deadline}.\n\nDimmi se accettiamo, se tratto o se lasciamo stare.\n\n${o.agent}`,
    accepted: { direct: (o) => `Grazie ${o.first}, è firmato. Benvenuto in ${o.brand}! Il contratto dura fino al ${o.until}.\n\n${o.person}`, agent: (o) => `Firmato con ${o.brand}, fino al ${o.until}. Penso io alle carte.\n\n${o.agent}` },
    declined: { direct: (o) => `Ricevuto, grazie per aver risposto. Buon proseguimento di stagione.\n\n${o.person}`, agent: (o) => `Ricevuto, dico a ${o.brand} che è un no.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} ci ha contattati. Possiamo arrivare a ${o.fee} a stagione e ${o.bonus} per gol o assist. È la nostra ultima parola.\n\n${o.person}`, agent: (o) => `Ho parlato con ${o.person}: salgono a ${o.fee} a stagione e ${o.bonus} per gol o assist. Non credo otterremo di più.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} ci ha contattati, ma non possiamo andare oltre. La nostra proposta resta valida fino al ${o.deadline}.\n\n${o.person}`, agent: (o) => `Ci ho provato, ma ${o.brand} non si muove. La proposta resta valida fino al ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Non avendo ricevuto risposta, ritiriamo la nostra proposta. La porta resta aperta per il futuro.\n\n${o.person}`, agent: (o) => `${o.brand} ha ritirato la proposta per mancanza di risposta. Tornerà se continui così.\n\n${o.agent}` },
    ended: { direct: (o) => `Il nostro contratto è giunto al termine. Grazie per queste stagioni, ${o.first}.\n\n${o.person}`, agent: (o) => `Il tuo contratto con ${o.brand} è giunto al termine. Tengo d’occhio le prossime marche.\n\n${o.agent}` },
  },
  pt: {
    subject: (o) => `${o.brand}: proposta de contrato de chuteiras`,
    direct: (o) => `Olá ${o.first},\n\ncuido dos jogadores na ${o.brand}. Seus jogos pelo ${o.club} não passaram despercebidos, e gostaríamos de equipar você.\n\nNossa proposta: ${o.fee} por temporada e ${o.bonus} por gol ou assistência, até ${o.until}. Ela vale até ${o.deadline}.\n\nVocê pode nos responder diretamente ou deixar ${o.agent} discutir as condições.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first},\n\na ${o.brand} entrou em contato: querem equipar você. ${o.person} cuida do assunto com eles.\n\nA proposta: ${o.fee} por temporada e ${o.bonus} por gol ou assistência, até ${o.until}. Esperam uma resposta até ${o.deadline}.\n\nMe diga se aceitamos, se negocio ou se deixamos passar.\n\n${o.agent}`,
    accepted: { direct: (o) => `Obrigado, ${o.first}, está assinado. Bem-vindo à ${o.brand}! O contrato vai até ${o.until}.\n\n${o.person}`, agent: (o) => `Assinado com a ${o.brand}, até ${o.until}. Eu cuido da papelada.\n\n${o.agent}` },
    declined: { direct: (o) => `Entendido, obrigado por responder. Boa sorte no resto da temporada.\n\n${o.person}`, agent: (o) => `Entendido, aviso a ${o.brand} que é um não.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} entrou em contato. Podemos chegar a ${o.fee} por temporada e ${o.bonus} por gol ou assistência. É a nossa última palavra.\n\n${o.person}`, agent: (o) => `Falei com ${o.person}: sobem para ${o.fee} por temporada e ${o.bonus} por gol ou assistência. Não acho que teremos melhor.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} entrou em contato, mas não podemos ir além. Nossa proposta vale até ${o.deadline}.\n\n${o.person}`, agent: (o) => `Tentei, mas a ${o.brand} não se mexe. A proposta vale até ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Sem resposta sua, retiramos nossa proposta. A porta continua aberta para mais tarde.\n\n${o.person}`, agent: (o) => `A ${o.brand} retirou a proposta por falta de resposta. Ela volta se você continuar assim.\n\n${o.agent}` },
    ended: { direct: (o) => `Nosso contrato chegou ao fim. Obrigado por estas temporadas, ${o.first}.\n\n${o.person}`, agent: (o) => `Seu contrato com a ${o.brand} chegou ao fim. Fico de olho nas próximas marcas.\n\n${o.agent}` },
  },
  de: {
    subject: (o) => `${o.brand}: Angebot für einen Schuhvertrag`,
    direct: (o) => `Hallo ${o.first},\n\nich betreue die Spieler bei ${o.brand}. Deine Spiele für ${o.club} sind uns aufgefallen, und wir würden dich gerne ausrüsten.\n\nUnser Angebot: ${o.fee} pro Saison und ${o.bonus} pro Tor oder Vorlage, bis zum ${o.until}. Es gilt bis zum ${o.deadline}.\n\nDu kannst uns direkt antworten oder ${o.agent} über die Bedingungen sprechen lassen.\n\n${o.person}\n${o.brand}`,
    agent: (o) => `${o.first},\n\n${o.brand} hat sich bei mir gemeldet: Sie wollen dich ausrüsten. ${o.person} kümmert sich dort darum.\n\nDas Angebot: ${o.fee} pro Saison und ${o.bonus} pro Tor oder Vorlage, bis zum ${o.until}. Sie erwarten eine Antwort bis zum ${o.deadline}.\n\nSag mir, ob wir annehmen, ob ich verhandle oder ob wir verzichten.\n\n${o.agent}`,
    accepted: { direct: (o) => `Danke ${o.first}, es ist unterschrieben. Willkommen bei ${o.brand}! Der Vertrag läuft bis zum ${o.until}.\n\n${o.person}`, agent: (o) => `Mit ${o.brand} ist unterschrieben, bis zum ${o.until}. Um den Papierkram kümmere ich mich.\n\n${o.agent}` },
    declined: { direct: (o) => `Verstanden, danke für deine Antwort. Alles Gute für den Rest der Saison.\n\n${o.person}`, agent: (o) => `Verstanden, ich sage ${o.brand} ab.\n\n${o.agent}` },
    up: { direct: (o) => `${o.agent} hat sich gemeldet. Wir können bis ${o.fee} pro Saison und ${o.bonus} pro Tor oder Vorlage gehen. Das ist unser letztes Wort.\n\n${o.person}`, agent: (o) => `Ich habe mit ${o.person} gesprochen: Sie gehen auf ${o.fee} pro Saison und ${o.bonus} pro Tor oder Vorlage. Mehr wird es wohl nicht.\n\n${o.agent}` },
    no: { direct: (o) => `${o.agent} hat sich gemeldet, aber weiter können wir nicht gehen. Unser Angebot gilt bis zum ${o.deadline}.\n\n${o.person}`, agent: (o) => `Ich habe es versucht, aber ${o.brand} bewegt sich nicht. Das Angebot gilt bis zum ${o.deadline}.\n\n${o.agent}` },
    lapsed: { direct: (o) => `Da wir nichts von dir gehört haben, ziehen wir unser Angebot zurück. Die Tür bleibt für später offen.\n\n${o.person}`, agent: (o) => `${o.brand} hat das Angebot mangels Antwort zurückgezogen. Es kommt wieder, wenn du so weitermachst.\n\n${o.agent}` },
    ended: { direct: (o) => `Unser Vertrag ist ausgelaufen. Danke für diese Saisons, ${o.first}.\n\n${o.person}`, agent: (o) => `Dein Vertrag mit ${o.brand} ist ausgelaufen. Ich behalte die nächsten Marken im Auge.\n\n${o.agent}` },
  },
};

const sponsorTexts = (language) => T[language] || T.fr;

module.exports = { sponsorTexts, SPONSOR_LANGUAGES: Object.keys(T) };
