export const fr = {
  liveMode: {
    title: "Mode direct",
    enabled: "Synchroniser automatiquement les nouvelles séances",
    enabledHint: "Interroger le carnet à l’intervalle choisi",
    interval: "Intervalle d’interrogation",
    intervalSec: "{n} s",
    intervalMin: "{n} min",
    lastPollLabel: "Dernière vérification",
    nextPollLabel: "Prochaine vérification",
    polling: "Recherche de nouvelles séances…",
    sound: "Son de notification",
    soundHint: "Jouer un léger carillon lorsqu’une nouvelle séance apparaît",
    newWorkout: "Nouvelle séance — {distance} · {time} · {sport}",
    newWorkouts: "{count} nouvelles séances synchronisées",
    view: "Voir",
    error: "Échec de la synchronisation en direct",
    errorRetry: "Nouvel essai automatique",
    rateLimit: "Limite de débit atteinte — ralentissement des interrogations",
    reauth: "Session expirée — veuillez vous reconnecter",
    recovered: "Synchronisation en direct reprise",
    warning: "La synchronisation en direct a échoué {count} fois de suite",
  },
  annotations: {
    title: "Notes du coach",
    addNote: "Ajouter une note",
    editNote: "Modifier la note",
    deleteNote: "Supprimer",
    saveNote: "Enregistrer",
    cancelNote: "Annuler",
    addPlaceholder: "Sur quoi l’athlète doit-il se concentrer à ce moment ?",
    noNotes:
      "Aucune note du coach pour l’instant. Faites glisser le curseur jusqu’à un moment et ajoutez une note.",
    confirmDelete: "Supprimer cette note ?",
    seekTo: "Aller à {time}",
    timestampLabel: "à",
    pinnedTo: "Épinglée à",
    saveError: "Échec de l’enregistrement de la note. Veuillez réessayer.",
    deleteError: "Échec de la suppression de la note. Veuillez réessayer.",
  },
  leaderboard: {
    title: "Classements",
    lead: "Affrontez les ghosts d’autres athlètes rowplay sur la même série. Choisissez un sport et une distance standard pour voir le classement.",
    sport: "Sport",
    distance: "Distance",
    rank: "Rang",
    athlete: "Athlète",
    time: "Temps",
    pace: "Allure",
    gap: "Écart",
    actions: "Actions",
    you: "Vous",
    athletes: "{n} athlètes",
    open: "Ouvrir",
    race: "Course",
    raceHint: "« Course » prépare un rival comme ghost dans votre propre replay de cette série.",
    empty: "Aucune entrée sur ce tableau pour l’instant — soyez le premier à publier un résultat.",
    publish: "Publier au classement",
    publishing: "Publication…",
    publishOk: "Publié — vous êtes au rang {rank} sur {sport} {distance}.",
    publishOffBoard:
      "Seules les séries de distance standard (500 m, 1k, 2k, 5k, 6k, 10k, semi) peuvent être publiées.",
    publishFailed: "Impossible de publier au classement",
    publishNote:
      "Publier rend ce résultat public sur le classement rowplay. Cela ne modifie rien dans votre carnet Concept2.",
    withdraw: "Retirer du classement",
    withdrawing: "Retrait…",
    withdrawOk: "Retiré du classement.",
    withdrawFailed: "Impossible de retirer du classement",
    ghostFallbackToast:
      "Impossible de charger les coups du rival — course avec leur allure moyenne",
  },
  nav: {
    dashboard: "Tableau de bord",
    leaderboard: "Classements",
    docs: "Aide",
    settings: "Données",
    menuOpen: "Ouvrir le menu",
    menuClose: "Fermer le menu",
    skipToContent: "Aller au contenu",
  },
  common: {
    demoMode: "mode démo",
    replay: "Replay",
    loading: "chargement…",
    tryAgain: "Veuillez réessayer.",
    dismiss: "Fermer",
    notAffiliated: "non affilié à Concept2",
    tagline: "rowplay · analyse de logbook Concept2 & replay en temps réel",
  },
  sync: {
    loading: "Synchronisation…",
    done: "{added} nouveau(x) · {total} séances en cache",
    failed: "Échec de la synchronisation",
    incrementalDone: "À jour — {total} séances en cache",
    retry: "Réessayer la synchronisation",
    errorBadge: "Échec de la dernière synchronisation",
    errorHint: "{message}",
    demoUnavailable:
      "Sync indisponible en mode démo — connectez votre logbook pour synchroniser de vraies données.",
    partialWarning:
      "L’historique est encore en cours de chargement — les totaux et RP peuvent être incomplets jusqu’à la fin de la synchronisation.",
    inProgress: "Sync en cours…",
    historyWindow: "Affichage des {months} derniers mois — chargement de l’historique plus ancien…",
    historyBackfilling: "{total} séances · historique jusqu’au {date}",
    historyComplete: "Historique complet synchronisé",
  },
  auth: {
    connect: "Connecter Concept2",
    useToken: "Utiliser un jeton",
    logout: "Se déconnecter",
  },
  theme: { toLight: "Passer en mode clair", toDark: "Passer en mode sombre" },
  lang: { switch: "Changer de langue" },
  pwa: {
    updateAvailable: "Une nouvelle version de rowplay est prête.",
    reload: "Recharger",
  },
  landing: {
    tagline: "Concept2 · RowErg · SkiErg · BikeErg",
    title1: "Rejouez vos séances.",
    title2: "Comprenez vos fractions.",
    lead: "rowplay se connecte à votre logbook Concept2 et transforme chaque résultat en analyses détaillées — et un replay en temps réel que vous pouvez suivre coup par coup, avec un parcours animé et une télémétrie synchronisée d’allure, cadence, puissance et fréquence cardiaque.",
    exploreDemo: "Explorer la démo →",
    openDashboard: "Ouvrir le tableau de bord →",
    connect: "Connecter votre logbook Concept2 →",
    readGuide: "Lire le guide",
    demoNote:
      "Mode démo avec des données d’exemple. Ajoutez un jeton personnel pour charger votre propre logbook.",
    feat1Title: "Replay en temps réel",
    feat1Body:
      "Regardez votre allure sur le parcours pendant que les jauges et graphiques défilent en synchronisation.",
    feat2Title: "Analyses par fraction",
    feat2Body: "Allure, cadence, puissance et HR dans le temps — sur les trois machines.",
    feat3Title: "En périphérie",
    feat3Body:
      "Servi depuis Cloudflare avec des données de coups en cache pour des replays instantanés.",
    tourEyebrow: "Première visite",
    tourTitle: "Quatre choses à essayer",
    tourBody:
      "Commencez par le tableau de bord, ouvrez un replay, affrontez un ghost du leaderboard, puis exportez les données à inspecter ailleurs.",
    tourDashboard: "Tableau de bord : totaux, tendances et PB",
    tourReplay: "Replay : parcours et jauges synchronisés",
    tourGhost: "Ghost racing : chassez un effort passé ou rival",
    tourExport: "Export : CSV, JSON ou fichiers replay",
    tourDismiss: "Fermer la visite initiale",
  },
  docs: {
    title: "Guide utilisateur",
    description:
      "Comment utiliser rowplay : premiers pas, vocabulaire de l'aviron, allure et watts, graphiques, usages courants, FAQ et dépannage.",
    badge: "Docs depuis le dépôt",
    openDashboard: "Ouvrir le tableau",
    openSource: "Ouvrir la source",
    navLabel: "Sections du guide utilisateur",
    contextual: {
      gettingStarted: "Nouveau ici ? Lisez le guide de premiers pas",
      metrics: "Que signifient l'allure, les watts et la cadence ?",
      charts: "Comment lire ce graphique",
      troubleshooting: "Données manquantes ou étranges ? Consultez le dépannage",
      workflows: "Découvrez les classements et les courses fantômes",
    },
    sections: {
      overview: {
        navTitle: "Vue d'ensemble",
        markdown: `# Guide utilisateur rowplay

rowplay transforme vos séances d'aviron, de ski et de vélo indoor en quelque chose à explorer : un tableau de bord avec totaux et tendances, une relecture coup par coup, des comparaisons côte à côte et des classements amicaux.

Il fonctionne avec les séances enregistrées sur les machines Concept2 — le RowErg (rameur), le SkiErg et le BikeErg — et les lit depuis le logbook en ligne gratuit de Concept2. Inutile de connaître le jargon de l'aviron pour commencer : ce guide explique chaque terme qu'il emploie.

## Ce que vous pouvez faire ici

- **Tableau de bord** — totaux, tendances, records personnels et charge d'entraînement en un coup d'œil.
- **Relecture** — regardez n'importe quelle séance se rejouer coup par coup, avec des graphiques synchronisés d'allure, de cadence, de puissance et de fréquence cardiaque.
- **Comparer** — placez deux séances côte à côte, split par split.
- **Classements** — publiez un résultat et affrontez d'autres athlètes sous forme de « fantômes » à l'écran.

## Sections du guide

- [Premiers pas](/docs/getting-started) — mode démo, connexion du logbook, première synchronisation.
- [Bases de l'aviron](/docs/rowing-metrics) — coups, splits et les autres termes que vous croiserez.
- [Allure, splits & watts](/docs/pace-splits-watts) — ce que signifient les chiffres et comment ils se relient.
- [Graphiques & progression](/docs/charts-and-progress) — comment lire les panneaux du tableau de bord.
- [Usages courants](/docs/workflows) — relecture, courses fantômes, comparaison, partage, export.
- [FAQ](/docs/faq) — réponses rapides sur les comptes, la confidentialité et les données.
- [Dépannage](/docs/troubleshooting) — données manquantes, chiffres bizarres, soucis d'affichage.

> Astuce : rowplay démarre en mode démo avec des séances d'exemple — vous pouvez donc tout essayer sur cette liste avant de connecter un compte Concept2.`,
      },
      gettingStarted: {
        navTitle: "Premiers pas",
        markdown: `# Premiers pas

## Essayez d'abord la démo

rowplay démarre en mode démo : sans compte connecté, chaque page se remplit de séances d'exemple réalistes. Rien de ce que vous faites en mode démo ne touche un vrai compte.

1. Ouvrez le [tableau de bord](/dashboard).
2. Choisissez n'importe quelle séance dans la liste.
3. Appuyez sur **Relecture** et essayez la lecture, la pause, le défilement et les vitesses.
4. Ouvrez les [classements](/leaderboard) et tentez une course fantôme.

## Connecter vos propres séances

Vos séances vivent dans le logbook Concept2 — le journal en ligne gratuit vers lequel les machines Concept2 (et l'app ErgData) téléversent les résultats. rowplay lit ce logbook grâce à un jeton d'accès personnel : un long code qui agit comme une clé de lecture de vos données.

1. Connectez-vous à votre logbook sur log.concept2.com.
2. Ouvrez **Edit Profile → Applications** et copiez votre jeton d'API personnel.
3. De retour dans rowplay, ouvrez [Utiliser un jeton](/auth/token).
4. Collez le jeton et validez.
5. Sur le tableau de bord, appuyez sur **Synchroniser** pour charger votre historique.

Le jeton est envoyé une seule fois via une connexion chiffrée et conservé uniquement dans un cookie protégé du navigateur. Les serveurs de rowplay mettent en cache les données de séances pour des pages rapides, mais ne stockent jamais le jeton lui-même.

## Votre première synchronisation

La première synchronisation charge immédiatement les séances récentes et complète l'historique plus ancien en arrière-plan. Tant qu'elle n'est pas terminée, les totaux de long terme et les records personnels peuvent sembler incomplets — c'est normal. Si quelque chose cloche encore ensuite, voyez le [dépannage](/docs/troubleshooting).

## Se déconnecter

Ouvrez [Données](/settings) à tout moment pour vous déconnecter. Cela efface votre session et supprime vos données de séances mises en cache de rowplay. Votre logbook Concept2 n'est jamais modifié.`,
      },
      rowingMetrics: {
        navTitle: "Bases de l'aviron",
        markdown: `# Bases de l'aviron

Nouveau dans l'aviron indoor — ou seulement dans son vocabulaire ? Voici les termes que rowplay emploie.

## Les machines

- **RowErg** — le rameur de Concept2 (« erg » est l'abréviation d'ergomètre, une machine qui mesure le travail).
- **SkiErg** — une machine debout qui imite le mouvement de bâtons du ski de fond.
- **BikeErg** — le vélo stationnaire de Concept2.

Toutes trois mesurent l'effort de la même façon, donc rowplay les affiche avec les mêmes types de chiffres.

## Le coup d'aviron

Un **coup** est un cycle complet du mouvement — sur le RowErg : la poussée des jambes, le tirage et le retour glissé à la position de départ. Deux chiffres décrivent vos coups :

- **Cadence (spm)** — coups par minute : la vitesse à laquelle vous enchaînez le mouvement. L'aviron régulier se situe typiquement entre 18 et 30 spm.
- **Distance par coup (DPS)** — combien de mètres chaque coup vous rapporte. Plus haut signifie en général un coup plus puissant et plus efficace.

Une cadence élevée ne veut pas automatiquement dire plus de vitesse : 20 coups solides par minute peuvent vous faire avancer plus vite que 30 coups précipités.

## Distance et temps

La machine convertit votre effort en **mètres**, comme si vous déplaciez un bateau (ou des skis, ou un vélo) sur un parcours. Les séances sont soit en distance (« ramez 2000m »), soit en temps (« ramez 30 minutes »). Une **séance par intervalles** découpe l'effort en répétitions entrecoupées de repos — par exemple 4 × 500m.

## Allure et splits

L'**allure** est le temps qu'il vous faut pour couvrir une distance fixe — 500 mètres sur RowErg et SkiErg, 1000 mètres sur BikeErg. Un **split** est votre allure sur un segment de la séance. Ces deux notions sont le cœur de l'entraînement sur ergomètre : elles ont [leur propre page](/docs/pace-splits-watts).

## Fréquence cardiaque

Si vous portez une ceinture ou une montre cardio connectée à la machine ou à l'app ErgData, les battements par minute (**bpm**) apparaissent à côté des autres chiffres et ont leur propre graphique dans la relecture.`,
      },
      paceSplitsWatts: {
        navTitle: "Allure, splits & watts",
        markdown: `# Allure, splits & watts

Ce sont les chiffres autour desquels tourne l'entraînement sur ergomètre. rowplay calcule tout pour vous — mais savoir ce qu'ils signifient rend chaque graphique plus facile à lire.

## L'allure : un temps par 500m

L'allure répond à la question : « à cette vitesse, combien de temps me faudrait-il pour 500 mètres ? ». Elle s'écrit comme une heure — **2:05** signifie 2 minutes 5 secondes par 500m.

- **Plus bas, c'est plus rapide.** 1:55 est une allure plus rapide que 2:05.
- Sur les graphiques, une allure qui s'améliore est une courbe qui descend **vers le bas**.
- **L'allure du BikeErg est par 1000m**, pas 500m, car le vélo va plus vite. rowplay gère cela automatiquement — ne soyez donc pas surpris que les allures vélo ressemblent aux allures aviron.

## Les splits

Un split est votre allure moyenne sur une portion de séance — chaque 500m d'un 2000m, ou chaque intervalle d'une séance fractionnée. Comparer les splits montre comment vous avez dépensé votre effort : splits réguliers, baisse de régime à la fin, ou final rapide (un « negative split » signifie que chaque split est plus rapide que le précédent).

## Les watts

Les watts mesurent votre puissance — la même unité qu'une ampoule. Là où l'allure donne le résultat, les watts donnent le travail. Ce sont deux vues du même effort : tenir environ 2:00/500m demande à peu près 200 watts, et les petits gains d'allure exigent une puissance disproportionnée — passer de 2:00 à 1:54 coûte environ 30 watts de plus.

L'aviron régulier se situe entre 100 et 250 watts selon la condition physique ; les sprints peuvent grimper bien au-delà.

## La cadence n'est pas l'effort

La cadence (spm) indique la fréquence de vos coups, pas leur intensité. Deux rameurs peuvent tenir tous deux une allure de 2:00 — l'un à 22 coups solides par minute, l'autre à 28 coups plus légers. Observer l'allure **et** la cadence ensemble (la relecture trace les deux) révèle la technique : la même allure à cadence plus basse signifie plus de distance par coup.

## Où voir tout cela

- Le **tableau de bord** montre l'allure moyenne, les totaux et les records sur l'ensemble des séances.
- La **relecture** trace l'allure, la cadence, les watts et la fréquence cardiaque sur toute la séance, synchronisés avec la lecture.
- La **comparaison par répétition** d'une relecture découpe les séances fractionnées en barres, split par split.`,
      },
      chartsAndProgress: {
        navTitle: "Graphiques & progression",
        markdown: `# Graphiques & progression

Le tableau de bord transforme votre historique en une série de panneaux. Cette page explique comment les lire.

## Tendance dans le temps

Le graphique de tendance suit une métrique — allure, distance, cadence ou distance par coup — sur des semaines de séances. Pour rester équitable, les tendances d'allure comparent **ce qui est comparable** : un sprint et une longue sortie régulière ne sont jamais mélangés dans une même courbe. Les séances sont regroupées en bandes de distance, et vous choisissez la bande à inspecter.

- Pour l'**allure**, vers le bas, c'est mieux (moins de temps par 500m).
- Une ligne de verdict au-dessus du graphique résume la direction : en progrès, stable ou en recul.
- Une bande a besoin d'au moins deux séances avant qu'une tendance puisse être tracée.

## Records personnels

Le panneau des records suit vos meilleurs résultats sur les distances standard (500m, 1k, 2k, 5k, 6k, 10k et plus). Assurez-vous qu'une synchronisation complète est terminée avant de vous fier aux records absolus — voir le [dépannage](/docs/troubleshooting).

## Calendrier d'entraînement & intensité

Le calendrier teinte chaque jour selon votre volume d'entraînement, de sorte que les séries et les trous sautent aux yeux. La vue d'intensité montre comment votre entraînement se répartit entre travail facile et difficile.

## Forme, fatigue & fraîcheur

Le panneau de fraîcheur estime trois courbes à partir de votre charge d'entraînement : la **forme** (le travail accumulé sur le long terme), la **fatigue** (la lassitude à court terme des séances récentes) et la **fraîcheur** (forme moins fatigue — votre disponibilité du jour). S'entraîner dur fait monter forme et fatigue ensemble ; se reposer fait baisser la fatigue plus vite que la forme — c'est pourquoi la fraîcheur culmine après une période plus calme.

## Puissance critique

Le panneau de puissance critique estime la puissance la plus élevée que vous pourriez soutenir sur un effort long, calculée à partir de vos propres meilleurs résultats. Il alimente le prédicteur d'allure — une estimation de ce que vous pourriez tenir sur une distance que vous n'avez pas courue récemment.

## Efficacité de coup (DPS)

Le graphique DPS suit les mètres gagnés par coup. L'interrupteur normalisé par l'allure retire l'effet de simplement ramer plus fort : ce qui reste se rapproche de la technique pure. Utilisez la moyenne sur 7 jours pour la forme récente et celle sur 28 jours pour la vue d'ensemble.`,
      },
      workflows: {
        navTitle: "Usages courants",
        markdown: `# Usages courants

## Rejouer une séance

Ouvrez n'importe quelle séance depuis le tableau de bord et appuyez sur **Relecture**.

- **Lecture / pause** contrôle la lecture ; la vue du parcours et toutes les jauges restent synchronisées.
- **Faites défiler** la frise chronologique pour sauter à n'importe quel instant.
- La **vitesse** fait tourner la relecture de 0,5× à 8× le temps réel.
- Basculez entre les vues du parcours en **2D et 3D** (la 3D demande un navigateur raisonnablement récent).
- Définissez une **allure cible** pour tracer une ligne de référence sur le graphique d'allure.

L'athlète s'anime à la cadence réelle de la séance — un coup d'aviron (ou une poussée de bâtons, ou un tour de pédale) par coup enregistré, avec des éclaboussures à chaque attaque — et accélère avec la vitesse de lecture. En 3D, l'athlète utilise un corps segmenté à l'échelle humaine avec une tenue propre au sport, afin que la posture ressemble à celle d'un athlète sur ergomètre plutôt qu'à un marqueur jouet. La surface du parcours devient elle aussi propre au sport : RowErg affiche des couloirs d'eau superposés, SkiErg des rainures de neige damée, et BikeErg une piste asphaltée/de vélodrome avec bordures, marques de voie et barres de vitesse. La caméra de poursuite reste assez proche pour rendre la posture lisible et élargit légèrement son objectif quand le bateau va plus vite.

En 3D, le sélecteur **Qualité** propose des graphismes bas, moyens, élevés ou ultra. Les appareils compatibles WebGPU tentent d'abord le rendu Ultra plus riche ; WebGL reste le repli. Si l'appareil ne tient pas une cadence d'images fluide, le rendu réduit automatiquement d'abord la résolution puis les effets. L'animation du replay respecte le réglage système de réduction des animations.

Les données coup par coup sont utilisées quand Concept2 les fournit. Les séances sans données de coups basculent vers un replay basé sur les splits, donc le parcours reste lisible.

## Ajouter des notes de coach

En pause à un instant de la relecture, ajoutez une note (« coulisse précipitée ici »). Les notes s'épinglent à la frise, si bien que vous — ou la personne à qui vous partagez la relecture — pouvez y sauter directement.

## Courir contre un fantôme

Un fantôme est un effort passé qui rame à vos côtés à l'écran.

1. Ouvrez les [classements](/leaderboard) et choisissez un sport et une distance.
2. Appuyez sur **Course** à côté d'une entrée.
3. Votre propre relecture de cette épreuve montre désormais le rival comme un second bateau à chasser.

Vous pouvez aussi affronter vos propres résultats passés pour voir exactement où une tentative de record a gagné ou perdu du temps.

## Comparer deux séances

Dans la liste des séances du tableau de bord, utilisez le bouton de comparaison sur une séance, puis choisissez-en une seconde. La vue de comparaison aligne les deux efforts split par split.

## Publier sur un classement

Les résultats sur distances standard (500m, 1k, 2k, 5k, 6k, 10k, semi-marathon) peuvent être publiés sur le classement rowplay depuis la page de relecture. La publication est volontaire, réversible, et ne change jamais rien dans votre logbook Concept2.

## Partager et exporter

- **Partager** sur une relecture crée un lien public en lecture seule — pratique pour les entraîneurs.
- **Exporter** sur la page [Données](/settings) télécharge votre logbook en CSV ou JSON, plus des fichiers TCX par séance pour celles qui ont des données de coups.

## Garder les données à jour

**Synchroniser** sur le tableau de bord récupère les nouveaux résultats à la demande. Le **mode direct** (aussi sur le tableau de bord) interroge le logbook à intervalle régulier et vous prévient quand une nouvelle séance arrive — pratique juste après l'entraînement.

## Importer la fréquence cardiaque

Si une séance n'a pas de données cardio mais que votre montre les a enregistrées, ouvrez la relecture et utilisez **Importer la fréquence cardiaque** pour fusionner un export CSV, TCX ou FIT de la montre avec la séance.`,
      },
      faq: {
        navTitle: "FAQ",
        markdown: `# FAQ

## Ai-je besoin d'un compte Concept2 ?

Pas pour explorer — le mode démo fonctionne sans. Pour voir vos propres séances, il vous faut un compte gratuit du logbook Concept2 : c'est là que la machine (ou l'app ErgData) range vos résultats.

## Mon jeton d'accès est-il en sécurité ?

Le jeton est transmis une seule fois en HTTPS et scellé dans un cookie httpOnly protégé du navigateur. Il n'est jamais stocké sur les serveurs de rowplay. Se déconnecter l'efface.

## D'autres personnes peuvent-elles voir mes séances ?

Non — votre tableau de bord et vos relectures sont privés par défaut. Les autres ne voient une séance que si vous la publiez sur un classement ou partagez son lien public, et les deux sont réversibles.

## rowplay modifie-t-il mon logbook Concept2 ?

Jamais. rowplay ne fait que lire. Publier sur un classement rowplay ou supprimer des données en cache ici ne modifie pas l'entrée d'origine du logbook.

## Quelles machines sont prises en charge ?

RowErg, SkiErg et BikeErg. L'allure est affichée par 500m pour l'aviron et le ski, et par 1000m pour le vélo.

## Pourquoi certaines séances n'ont-elles pas de relecture coup par coup ?

Toutes les entrées du logbook n'incluent pas de données par coup — cela dépend de la façon dont la séance a été enregistrée. Ces séances se rejouent quand même à partir de leurs splits, juste avec moins de points de données.

## Puis-je utiliser rowplay sur mon téléphone ?

Oui — toute l'app, relectures comprises, fonctionne dans les navigateurs mobiles, et vous pouvez l'installer sur votre écran d'accueil comme une app.

## Quelles langues sont disponibles ?

English, Deutsch, Español, Français, 日本語 et 中文 — à changer depuis l'en-tête (derrière le bouton de menu sur mobile).`,
      },
      troubleshooting: {
        navTitle: "Dépannage",
        markdown: `# Dépannage

## Mes totaux ou records semblent faux

Le plus souvent, l'historique complet n'a pas fini de se synchroniser. La première synchronisation complète les anciennes séances en arrière-plan ; tant qu'elle n'est pas terminée, tout ce qui est calculé « sur l'ensemble du temps » peut être incomplet. Vérifiez l'état de synchronisation dans [Données](/settings) et lancez une synchronisation complète si nécessaire.

## Une allure semble complètement fausse

- **Les allures BikeErg sont par 1000m**, pas par 500m — une allure vélo de 2:00 n'est pas la même vitesse qu'une allure aviron de 2:00.
- Les séances fractionnées rapportent l'allure des intervalles de travail ; les repos ne comptent pas.

## Le graphique de tendance réclame plus de séances

Les tendances comparent des distances similaires : elles exigent au moins deux séances dans la même bande de distance. Enregistrez une autre séance comparable et la tendance apparaîtra.

## Une séance n'a pas de graphiques de coups

Cette entrée du logbook n'a pas de données par coup — courant pour les anciens résultats et certaines méthodes d'enregistrement. La relecture se rabat sur les splits. Les panneaux dépendants des coups (distance par coup, comparaison par coup) ont besoin de ces données et le signalent quand elles manquent.

## La fréquence cardiaque manque

Le logbook n'a la fréquence cardiaque que si une ceinture ou une montre était connectée pendant la séance. Si une montre l'a enregistrée à part, utilisez **Importer la fréquence cardiaque** sur la page de relecture pour fusionner un export CSV, TCX ou FIT avec la séance.

## La synchronisation échoue ou la session expire

Les jetons personnels peuvent expirer ou être révoqués. Reconnectez-vous via [Utiliser un jeton](/auth/token) avec un jeton frais de votre profil Concept2. Si beaucoup de requêtes ont été faites en peu de temps, le logbook peut limiter brièvement le débit — attendez une minute et réessayez.

## Une nouvelle séance n'apparaît pas

Vérifiez d'abord que la séance a bien atteint votre logbook Concept2 (elle doit être téléversée depuis la machine ou l'app ErgData). Appuyez ensuite sur **Synchroniser** dans le tableau de bord, ou activez le mode direct pour interroger automatiquement.

## Problèmes d'affichage

- **La relecture 3D ne démarre pas** — le navigateur a besoin de WebGPU ou WebGL ; la vue 2D fonctionne toujours.
- **Les graphiques sont à l'étroit sur téléphone** — passez en paysage pour des graphiques plus larges ; les panneaux se réorganisent sur petits écrans.
- **Mauvais thème ou mauvaise langue** — les deux interrupteurs sont dans l'en-tête (derrière le bouton de menu sur mobile) et sont mémorisés par navigateur.

Toujours bloqué ? La [FAQ](/docs/faq) couvre d'autres cas, et chaque page de ce guide est accessible via **Aide** dans l'en-tête.`,
      },
    },
  },
  dashboard: {
    eyebrow: "Votre logbook",
    title: "Résultats et replays",
    all: "Tout",
    sync: "Sync",
    syncing: "Synchronisation…",
    syncedNote: "{total} séances · dernière sync {date}",
    recentNote:
      "Séances récentes affichées — lancez Sync pour charger tout l’historique et des PB et tendances fiables.",
    latest: "Dernière",
    distance: "distance",
    time: "temps",
    avgRate: "cadence moy.",
    distStroke: "dist/coup",
    avgBpm: "bpm moy.",
    vsAvg: "vs votre moy. {sport}",
    sessions: "Séances",
    totalDistance: "Distance totale",
    totalTime: "Temps total",
    avgPace: "Allure moy.",
    sectionCoreEyebrow: "Commencer ici",
    sectionCore: "Lecture du jour",
    sectionWorkoutsEyebrow: "Séances",
    sectionWorkouts: "Trouver un replay",
    sectionWorkoutsBody:
      "Filtrez, taguez, comparez et ouvrez les séances sans passer d’abord par les panneaux d’analyse avancée.",
    sectionRecordsEyebrow: "Objectifs",
    sectionRecords: "Objectifs, badges et PB",
    sectionRecordsBody:
      "Objectifs de saison, jalons, records standard et outils de prédiction restent ensemble.",
    sectionAdvancedEyebrow: "Analyse",
    sectionAdvanced: "Analyse avancée",
    sectionAdvancedBody:
      "Modèle de puissance, charge d’entraînement, efficacité de coups et tendances longues pour l’analyse détaillée.",
    sectionPower: "CP/W′ et fraîcheur",
    sectionPowerBody:
      "Critical power, allure soutenable et équilibre de charge depuis votre historique.",
    sectionTraining: "Structure d’entraînement",
    sectionTrainingBody: "Calendrier, intensité et tendances montrent la répartition du travail.",
    sectionStroke: "Efficacité de coups et sports",
    sectionStrokeBody:
      "Tendance DPS et synthèses par machine pour le contexte technique et d’allure.",
    tour: {
      eyebrow: "Guide démo",
      title: "Essayez ceci d’abord",
      body: "Ces conseils sont optionnels et restent fermés dans ce navigateur.",
      dismissHint: "Fermer {title}",
      latestReplay: {
        title: "Rejouer la dernière séance",
        body: "Ouvrez la dernière pièce démo et appuyez sur lecture.",
        action: "Ouvrir le replay",
      },
      criticalPower: {
        title: "Consulter CP/W′",
        body: "Voir le modèle de puissance soutenable et le prédicteur d’allure.",
        action: "Aller au panneau",
      },
      workoutFilters: {
        title: "Utiliser les filtres",
        body: "Réduisez la liste par distance, tags, coups ou allure.",
        action: "Tester les filtres",
      },
      leaderboardGhost: {
        title: "Affronter un ghost",
        body: "Ouvrez un tableau standard et utilisez Race pour préarmer un rival.",
        action: "Ouvrir le leaderboard",
      },
    },
    pbTitle: "Records personnels · distances standard",
    bySport: "Par sport",
    thSport: "Sport",
    thSessions: "Séances",
    thDistance: "Distance",
    thTime: "Temps",
    thAvgPace: "Allure moy.",
    thBestPace: "Meilleure allure",
    trendTitle: "Tendance dans le temps",
    likeForLike: "{sport}, distance comparable",
    mPace: "Allure",
    mDistStroke: "Dist/coup",
    mDistance: "Distance",
    mRate: "Cadence",
    holdingSteady: "Stable — {metric} plat sur {days} jours",
    improving: "En progrès — {change} sur {days} jours",
    slipping: "En baisse — {change} sur {days} jours",
    faster: "{delta} plus rapide",
    slower: "{delta} plus lent",
    emptyTrend:
      "Une seule séance dans cette tranche — enregistrez un autre {band} pour voir une tendance.",
    dpsTrend: {
      title: "Efficacité de coups (DPS)",
      raw: "DPS brut",
      normalised: "Normalisé par allure",
      ma7: "Moy. 7 jours",
      ma28: "Moy. 28 jours",
      yLabel: "m/coup",
      empty: "Aucune donnée de nombre de coups",
      tooltipPace: "Allure moy.",
      tooltipDps: "DPS",
    },
    calTitle: "Calendrier d’entraînement",
    calMetricDistance: "Mètres",
    calMetricTime: "Temps",
    calActiveDays: "{n} jours actifs",
    calCurrentStreak: "série de {n} jours",
    calLongestStreak: "Record : {n} jours",
    calLess: "Moins",
    calMore: "Plus",
    calTooltip: "{date} · {sessions} séances · {volume}",
    calEmpty: "{date} · pas d’entraînement",
    calAria: "Calendrier d’entraînement, {active} jours actifs, série actuelle de {streak} jours",
    calDowSun: "dim.",
    calDowMon: "lun.",
    calDowTue: "mar.",
    calDowWed: "mer.",
    calDowThu: "jeu.",
    calDowFri: "ven.",
    calDowSat: "sam.",
    tid: {
      title: "Intensité d'entraînement",
      time: "Temps",
      distance: "Distance",
      period4w: "4 dernières semaines",
      period3m: "3 derniers mois",
      period12m: "12 derniers mois",
      empty: "Aucun entraînement sur cette période",
      zone: {
        UT2: "UT2 — Récupération",
        UT1: "UT1 — Aérobie",
        AT: "AT — Seuil",
        TR: "TR — Allure course",
        AN: "AN — Anaérobie",
        Easy: "Facile",
        Moderate: "Modéré",
        Hard: "Dur",
      },
    },
    formTitle: "Forme et fraîcheur",
    formAdvanced: "Analyse avancée",
    formSub:
      "Charge d’entraînement sur toutes les machines, calée sur votre propre puissance seuil.",
    formFitness: "Forme",
    formFatigue: "Fatigue",
    formForm: "État de forme",
    formFitnessHint: "charge sur 42 jours (CTL)",
    formFatigueHint: "charge sur 7 jours (ATL)",
    formFormHint: "forme − fatigue (TSB)",
    formFtp: "Puissance seuil",
    formCp: "Critical power",
    formModelled: "modélisée",
    formEstimated: "estimée",
    formRamp: "progression forme sur 7 jours",
    formChartFitness: "Forme",
    formChartFatigue: "Fatigue",
    formChartForm: "État de forme",
    formEmpty:
      "Enregistrez quelques séances de plus sur quelques semaines pour afficher votre graphique forme et fraîcheur.",
    bandTransition: "Désentraînement",
    descTransition: "Très frais, mais la forme baisse. Il est temps de reprendre le travail.",
    bandFresh: "Frais",
    descFresh: "Reposé et prêt à performer — bon moment pour vous tester.",
    bandNeutral: "Neutre",
    descNeutral: "Équilibré — ni affûté ni profondément fatigué.",
    bandProductive: "Productif",
    descProductive: "Construction de la forme avec une fatigue saine et maîtrisable.",
    bandOverreaching: "Surmenage",
    descOverreaching: "Fatigue importante. Calmez le rythme et laissez la récupération rattraper.",
    goalsTitle: "Objectifs de saison et défis",
    goalsYear: "objectif {year}",
    goalsKindMeters: "Mètres",
    goalsKindHours: "Heures",
    goalsTargetMeters: "Cible (m)",
    goalsTargetHours: "Cible (heures)",
    goalsSave: "Enregistrer l’objectif",
    goalsSaving: "Enregistrement…",
    goalsSaved: "Objectif enregistré",
    goalsSaveFailed: "Impossible d’enregistrer l’objectif",
    goalsProgress: "{current} / {target}",
    goalsPct: "{pct} % complété",
    goalsOnPace: "Dans les temps — projection {projected} fin d’année",
    goalsBehind: "En retard — projection {projected} · il manque {needed}",
    goalsStreakCurrent: "série de {n} jours",
    goalsStreakCurrent_one: "série de {n} jour",
    goalsStreakLongest: "Record : {n} jours",
    goalsStreakLongest_one: "Record : {n} jour",
    goalsDaysSince: "{n} jours depuis la dernière séance",
    goalsDaysSince_one: "{n} jour depuis la dernière séance",
    goalsDaysSinceToday: "Entraîné aujourd’hui",
    goalsWeekly: "{active} semaines actives sur {total}",
    badgesTitle: "Badges",
    badgeMeters100k: "club 100k",
    badgeMeters500k: "club 500k",
    badgeMeters1m: "Million de mètres",
    badgeMeters2m: "2 millions de mètres",
    badgeMeters5m: "5 millions de mètres",
    badgeClub500: "PB club 500 m",
    badgeClub1000: "PB club 1k",
    badgeClub2000: "PB club 2k",
    badgeClub5000: "PB club 5k",
    badgeClub10000: "PB club 10k",
    badgeEverySportWeek: "Semaine tous sports",
    pbTag: "PB",
    pbNew: "Nouveau PB",
    pbCelebrate: "Nouveau PB {distance} — {time} !",
    pbCelebrateMore: "{count} nouveaux records personnels !",
    predictor: {
      title: "Prédicteur de performance",
      distance: "Distance connue",
      time: "Temps connu",
      predict: "Prédire",
      colDistance: "Distance",
      colPredicted: "Prédit",
      colBest: "Votre meilleur",
      colStatus: "Statut",
      beaten: "Battu",
      behind: "En retard",
      untried: "Non tenté",
      noTime: "—",
      inputError: "Saisissez un temps valide (ex. 7:04)",
    },
    cpTitle: "Critical power et prédicteur d’allure",
    cpSub:
      "Un modèle de puissance de meilleurs efforts issu de vos résultats du logbook, avec confiance et alertes de données affichées clairement.",
    cpLabel: "Critical power (CP)",
    cpWPrime: "Capacité anaérobie (W′)",
    cpMethod: "Méthode de fit",
    cpExplainModel:
      "Modèle {scope} : CP {cp} W et W′ {wPrime} kJ sont ajustés à partir de vos meilleurs efforts enregistrés. Considérez cela comme une estimation d’entraînement, pas comme une mesure de laboratoire.",
    cpExplainEstimate:
      "Estimation {scope} : la CP est approximée à {cp} W à partir de votre meilleur effort long. Enregistrez davantage d’efforts maximaux courts, moyens et longs pour ajuster CP/W′.",
    cpScopeLabel: "Périmètre de critical power",
    cpScopeAll: "Tout",
    cpEmptyScope:
      "Pas encore assez d’efforts {scope} exploitables. Ajoutez quelques pièces maximales sur différentes durées avant de faire confiance à ce modèle.",
    cpConfidenceLabel: "Confiance",
    cpConfidence: {
      high: "Élevée",
      medium: "Moyenne",
      low: "Faible",
      insufficient: "Insuffisante",
    },
    cpSample: "{n} efforts exploitables · {points} points d’enveloppe",
    cpFreshness: "Effort le plus récent {date}",
    cpFit: "Fit R² {r2} · résidu {residual}%",
    cpWarningsLabel: "Alertes du modèle",
    cpWarning: {
      "too-few-efforts": "Trop peu d’efforts maximaux",
      "narrow-duration-range": "Plage de durées étroite",
      "stale-efforts": "L’effort le plus récent est ancien",
      "mixed-sports": "Sports mélangés",
      "outlier-sensitive": "Fit sensible aux valeurs atypiques",
      "unrealistic-fit": "Fit irréaliste rejeté",
      "estimate-only": "Estimation seulement",
    },
    cpPredictTitle: "Que puis-je tenir ?",
    cpPredictSub:
      "Prédictions d’allure et de temps final pour un seul sport à partir du modèle sélectionné. L’allure est normalisée en /500m.",
    cpMixedPredictNote:
      "Sélectionnez un sport pour les prédictions d’allure ; la vue tous sports affiche seulement la puissance.",
    cpModeDuration: "Tenir pendant…",
    cpModeDistance: "Temps pour…",
    cpHoldFor: "Tenir pendant",
    cpMinutes: "minutes",
    cpDistance: "Distance",
    cpPaceHint: "Allure régulière {scope} pendant environ {min} minutes",
    cpTimeHint: "Temps final prédit {scope} pour {dist}",
    cpPreset6: "6 min",
    cpPreset20: "20 min",
    cpPreset30: "30 min",
    cpPreset60: "60 min",
    cpDist500: "500 m",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "Puissance–durée : vous vs modèle",
    cpChartHint:
      "Les points sont vos meilleures séances ; la courbe est la prédiction CP/W′. Au-dessus de la courbe = au-delà du modèle.",
    cpChartActual: "Vos records",
    cpChartModel: "Modèle CP",
  },
  milestone: {
    title: "Jalons",
    next: "Prochain",
    lifetime_distance_rower_100k: "100k m ramés",
    "lifetime_distance_rower_100k.toast": "🎉 100k m ramés!",
    lifetime_distance_rower_250k: "250k m ramés",
    "lifetime_distance_rower_250k.toast": "🎉 250k m ramés!",
    lifetime_distance_rower_500k: "500k m ramés",
    "lifetime_distance_rower_500k.toast": "🎉 500k m ramés!",
    lifetime_distance_rower_1M: "1 million m ramés",
    "lifetime_distance_rower_1M.toast": "🎉 1 million m ramés!",
    lifetime_distance_rower_2M: "2 millions m ramés",
    "lifetime_distance_rower_2M.toast": "🎉 2 millions m ramés!",
    lifetime_distance_rower_5M: "5 millions m ramés",
    "lifetime_distance_rower_5M.toast": "🎉 5 millions m ramés!",
    lifetime_distance_rower_10M: "10 millions m ramés",
    "lifetime_distance_rower_10M.toast": "🎉 10 millions m ramés!",
    lifetime_distance_skierg_100k: "100k m SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100k m SkiErg!",
    lifetime_distance_skierg_250k: "250k m SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250k m SkiErg!",
    lifetime_distance_skierg_500k: "500k m SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500k m SkiErg!",
    lifetime_distance_skierg_1M: "1 million m SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 1 million m SkiErg!",
    lifetime_distance_skierg_2M: "2 millions m SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 2 millions m SkiErg!",
    lifetime_distance_skierg_5M: "5 millions m SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 5 millions m SkiErg!",
    lifetime_distance_skierg_10M: "10 millions m SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 10 millions m SkiErg!",
    lifetime_distance_bike_100k: "100k m BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100k m BikeErg!",
    lifetime_distance_bike_250k: "250k m BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250k m BikeErg!",
    lifetime_distance_bike_500k: "500k m BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500k m BikeErg!",
    lifetime_distance_bike_1M: "1 million m BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 1 million m BikeErg!",
    lifetime_distance_bike_2M: "2 millions m BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 2 millions m BikeErg!",
    lifetime_distance_bike_5M: "5 millions m BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 5 millions m BikeErg!",
    lifetime_distance_bike_10M: "10 millions m BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 10 millions m BikeErg!",
    lifetime_distance_combined_100k: "100k m au total",
    "lifetime_distance_combined_100k.toast": "🎉 100k m au total!",
    lifetime_distance_combined_250k: "250k m au total",
    "lifetime_distance_combined_250k.toast": "🎉 250k m au total!",
    lifetime_distance_combined_500k: "500k m au total",
    "lifetime_distance_combined_500k.toast": "🎉 500k m au total!",
    lifetime_distance_combined_1M: "1 million m au total",
    "lifetime_distance_combined_1M.toast": "🎉 1 million m au total!",
    lifetime_distance_combined_2M: "2 millions m au total",
    "lifetime_distance_combined_2M.toast": "🎉 2 millions m au total!",
    lifetime_distance_combined_5M: "5 millions m au total",
    "lifetime_distance_combined_5M.toast": "🎉 5 millions m au total!",
    lifetime_distance_combined_10M: "10 millions m au total",
    "lifetime_distance_combined_10M.toast": "🎉 10 millions m au total!",
    session_count_10: "10 séances",
    "session_count_10.toast": "🎉 10 séances!",
    session_count_25: "25 séances",
    "session_count_25.toast": "🎉 25 séances!",
    session_count_50: "50 séances",
    "session_count_50.toast": "🎉 50 séances!",
    session_count_100: "100 séances",
    "session_count_100.toast": "🎉 100 séances!",
    session_count_250: "250 séances",
    "session_count_250.toast": "🎉 250 séances!",
    session_count_500: "500 séances",
    "session_count_500.toast": "🎉 500 séances!",
    session_count_1000: "1000 séances",
    "session_count_1000.toast": "🎉 1000 séances!",
    session_count_2500: "2500 séances",
    "session_count_2500.toast": "🎉 2500 séances!",
    streak_7d: "Série de 7 jours",
    "streak_7d.toast": "🎉 Série de 7 jours!",
    streak_14d: "Série de 14 jours",
    "streak_14d.toast": "🎉 Série de 14 jours!",
    streak_30d: "Série de 30 jours",
    "streak_30d.toast": "🎉 Série de 30 jours!",
    streak_60d: "Série de 60 jours",
    "streak_60d.toast": "🎉 Série de 60 jours!",
    streak_100d: "Série de 100 jours",
    "streak_100d.toast": "🎉 Série de 100 jours!",
    pb_2k_sub8: "2k sous 8:00",
    "pb_2k_sub8.toast": "🎉 2k sous 8:00!",
    pb_2k_sub730: "2k sous 7:30",
    "pb_2k_sub730.toast": "🎉 2k sous 7:30!",
    pb_2k_sub7: "2k sous 7:00",
    "pb_2k_sub7.toast": "🎉 2k sous 7:00!",
    pb_2k_sub630: "2k sous 6:30",
    "pb_2k_sub630.toast": "🎉 2k sous 6:30!",
  },
  workout: {
    tag: {
      label: "Type",
      auto: "Détection auto",
      "steady-state": "Endurance",
      interval: "Intervalles",
      "race-piece": "Pièce course",
      "time-trial": "Contre-la-montre",
      "warmup-cooldown": "Échauffement / retour au calme",
      unknown: "Autre",
      filter: { all: "Tous les types" },
      saveError: "Impossible d'enregistrer le tag — réessayez.",
    },
  },
  workoutList: {
    empty: "Aucune séance pour ce filtre.",
    windowed: "{n} séances · fenêtre limitée pour les performances",
    filtersTitle: "Trouver des séances",
    matching: "{n} correspondance(s)",
    clearFilters: "Effacer les filtres",
    expand: "Plus de filtres",
    collapse: "Moins de filtres",
    dateFrom: "Du",
    dateTo: "Au",
    workoutType: "Type du logbook",
    anyType: "Tout type du logbook",
    strokeData: "Données de coups",
    strokeAny: "Toutes",
    strokeYes: "Avec données de coups",
    strokeNo: "Sans données de coups",
    searchComments: "Rechercher dans les commentaires…",
    search: "Rechercher",
    distanceChips: "Distance",
    durationChips: "Durée",
    durationMin: "{n} min",
    chipMarathon: "Marathon",
    sortGroup: "Tri",
    sortDate: "Date",
    sortDistance: "Distance",
    sortTime: "Temps",
    sortPace: "Allure",
    sortPower: "Puissance",
    pbsOnly: "PB uniquement",
    compare: "Comparer",
    comparePick: "Choisir la première séance à comparer",
    compareWith: "Comparer avec cette séance",
    compareCancel: "Annuler",
  },
  share: {
    shareReplay: "Partager le replay",
    downloadImage: "Télécharger l’image",
    linkCopied: "Lien de partage copié",
    linkReady: "Toute personne avec ce lien peut regarder le replay",
    shareFailed: "Impossible de créer le lien de partage",
    privacyBlocked:
      "Cet entraînement n’est pas public sur Concept2 et ne peut donc pas être partagé. Réglez d’abord sa confidentialité sur « Everyone » dans votre logbook.",
    imageSaved: "Carte de course enregistrée",
    imageFailed: "Impossible d’enregistrer la carte de course",
    publicBanner: "Replay partagé — lecture seule",
    ctaBefore: "Vos propres replays ? ",
    ctaLink: "Essayer rowplay",
    ctaAfter: " — analyses logbook Concept2 et replay de séances.",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "Puiss. moy.",
    raceCardAvgHr: "HR moy.",
  },
  replay: {
    hrImportTitle: "Importer la fréquence cardiaque",
    hrImportHint:
      "Cette séance n’a pas de FC dans le carnet. Importez un export de montre (CSV, TCX ou FIT) pour superposer la fréquence cardiaque sur le replay.",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "Décalage de départ de la montre",
    hrImportOffsetHint: "Positif si la montre a démarré avant le début du rameur (secondes).",
    hrImportPreview: "{count} échantillons · ~{avg} bpm moy.",
    hrImportApply: "Appliquer la fréquence cardiaque",
    hrImportClear: "Retirer la FC importée",
    hrImportApplied: "Fréquence cardiaque importée",
    hrImportCleared: "Fréquence cardiaque importée retirée",
    hrImportTooFew: "Ce fichier contient trop peu d’échantillons de fréquence cardiaque.",
    hrImportSaveFailed: "Impossible d’enregistrer l’import de fréquence cardiaque",
    hrImportClearFailed: "Impossible de retirer l’import de fréquence cardiaque",
    back: "Retour au tableau de bord",
    lowRes: "replay basse résolution",
    compareAgainst: "Comparer à :",
    none: "Aucun",
    pastSession: "Une séance passée",
    constantPace: "Une allure constante",
    uploadedFile: "Un fichier importé",
    chooseSession: "Choisir une séance {sport}…",
    setPace: "Définir l’allure",
    targetPace: "Allure cible",
    targetPacePlaceholder: "M:SS",
    targetPaceSet: "Définir l’allure cible",
    targetPaceClear: "Effacer",
    targetPaceBand: "Afficher la bande ±5 s",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ {m} m d’avance",
    behind: "▼ {m} m de retard",
    searchSessions: "Rechercher des séances…",
    suggestedRival: "Adversaire suggéré",
    raceVerdictWinSession:
      "Vous avez battu votre {distance} du {date} de {seconds}s (vous aviez {m} m d’avance à l’arrivée)",
    raceVerdictLoseSession:
      "Votre {distance} du {date} vous a battu de {seconds}s (vous aviez {m} m de retard à l’arrivée)",
    raceVerdictWinPace:
      "Vous avez battu le bateau à {pace} de {seconds}s (vous aviez {m} m d’avance à l’arrivée)",
    raceVerdictLosePace:
      "Le bateau à {pace} vous a battu de {seconds}s (vous aviez {m} m de retard à l’arrivée)",
    raceVerdictWinFile:
      "Vous avez battu {name} de {seconds}s (vous aviez {m} m d’avance à l’arrivée)",
    raceVerdictLoseFile:
      "{name} vous a battu de {seconds}s (vous aviez {m} m de retard à l’arrivée)",
    raceFinished: "Course terminée",
    play: "Lecture",
    pause: "Pause",
    viewToggle: "Vue du parcours",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "La vue 3D nécessite WebGPU ou WebGL sur cet appareil",
    view3dLoading: "Chargement 3D…",
    view3dError: "Impossible de charger la vue 3D",
    quality: "Qualité",
    qualityLow: "Basse",
    qualityMedium: "Moyenne",
    qualityHigh: "Haute",
    qualityUltra: "Ultra",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "Allure",
    gRate: "Cadence",
    gPower: "Puiss.",
    gHeart: "Cœur",
    cPace: "Allure",
    cRate: "Cadence",
    cPower: "Puissance",
    cHeart: "Fréquence cardiaque",
    strokeQuality: "Qualité de coup",
    avgDistStroke: "dist moy. / coup",
    avgRate: "cadence moy.",
    paceVariation: "variation d’allure",
    paceVariationHint: "(plus bas = plus régulier)",
    fade: "décrochage",
    negSplit: "fraction négative",
    slowedDown: "ralenti",
    distPerStroke: "Distance par coup",
    distPerStrokeHint: "— plus haut = coup plus puissant",
    paceVsRate: "Allure vs cadence",
    paceVsRateHint: "— trouvez votre cadence la plus efficace",
    powerCurve: "Courbe de puissance (meilleure moyenne sur la durée)",
    hrZones: "Zones HR (temps par zone)",
    intervalBreakdown: "Détail des intervalles",
    repComparison: "Comparaison des répétitions",
    repComparisonN: "Comparaison des répétitions ({n} rép.)",
    repComparisonRep: "Rép. {n}",
    repComparisonAvgPace: "moy {pace}",
    repComparisonMetricPace: "Allure",
    repComparisonMetricRate: "Cadence",
    repComparisonMetricPower: "Puissance",
    repComparisonMetricHr: "Fréquence cardiaque",
    splitBreakdown: "Détail des fractions",
    segReps: "rép.",
    segSplits: "fractions",
    avgRepPace: "allure moy. rép.",
    avgSplitPace: "allure moy. fraction",
    consistency: "régularité",
    consistencyHint: "(plus bas = plus régulier)",
    setFade: "décrochage de série",
    faded: "décroché",
    fastestSlowest: "plus rapide → plus lent",
    splitsTitle: "Fractions",
    thNum: "#",
    thDist: "Dist",
    thTime: "Temps",
    thPace: "Allure",
    thRate: "Cad.",
    thHr: "HR",
    workoutDetails: "Détails de la séance",
    mDate: "Date",
    mSport: "Sport",
    mType: "Type",
    mDistance: "Distance",
    mTime: "Temps",
    mAvgPace: "Allure moy.",
    mAvgRate: "Cadence moy.",
    mStrokeCount: "Nombre de coups",
    mAvgPower: "Puiss. moy.",
    mAvgHr: "HR moy.",
    mHrRange: "Plage HR",
    mCalories: "Calories",
    mDragFactor: "Facteur de frein",
    mResolution: "Résolution",
    mSegments: "Segments",
    mWorkoutId: "ID séance",
    mComments: "Commentaires",
    samples: "échantillons",
    perStroke: "par coup",
    fromSplits: "depuis les fractions",
    intervalsWord: "intervalles",
    splitsWord: "fractions",
    racingSession: "Course contre votre séance du {date}",
    racingFile: "Course contre {name}",
    ghostYour: "votre {date}",
    loadSessionFailed: "Impossible de charger cette séance",
    paceError: "Saisissez une allure du type 1:52",
    pacingAt: "Allure cible {pace}",
    noSamples: "Aucun échantillon exploitable dans ce fichier.",
    fileReadError: "Impossible de lire ce fichier.",
    importFailed: "Impossible d’importer ce fichier",
    zone1: "Z1 Récupération",
    zone2: "Z2 Endurance",
    zone3: "Z3 Tempo",
    zone4: "Z4 Seuil",
    zone5: "Z5 Max",
    fullMetrics: "Métriques complètes",
    mHrEnding: "FC en fin",
    mHrRecovery: "Récupération FC",
    mHrDrop: "Baisse FC",
    mRestTime: "Temps de repos",
    mRestDistance: "Distance de repos",
    mWeightClass: "Catégorie de poids",
    mVerified: "Vérifié",
    mTimezone: "Fuseau horaire",
    mPrivacy: "Confidentialité",
    mWattMinutes: "Watt-minutes",
    provenanceTitle: "Provenance de l'enregistrement",
    mPmVersion: "Version PM",
    mFirmware: "Firmware",
    mSerial: "Numéro de série",
    mDevice: "Appareil",
    mSource: "Enregistré par",
    exrBadge: "Source EXR",
    exrBadgeTitle:
      "Le rythme et la puissance ont été synthétisés par EXR, pas lus sur le PM5. Les chiffres peuvent ne pas être directement comparables aux séances enregistrées par PM.",
    mErgModel: "Modèle d'erg",
    mHrSensor: "Capteur FC",
    targetsTitle: "Objectifs",
    mTargetPace: "Allure cible",
    mTargetWatts: "Puissance cible",
    mTargetRate: "Cadence cible",
    mTargetHrZone: "Zone FC cible",
    mTargetCalories: "Calories cibles",
    targetVsActualTitle: "Objectif vs réel",
    targetHit: "Dans l'objectif",
    targetMiss: "Hors objectif",
    workRestTitle: "Travail : repos",
    workRestRatio: "travail par seconde de repos",
    thCalories: "Cal",
    thWattMin: "W·min",
    thIntervalType: "Type",
    thRest: "Repos",
    thRestYes: "Repos",
    verifiedYes: "Vérifié",
    verifiedNo: "Non vérifié",
    weightHeavy: "Poids lourd",
    weightLight: "Poids léger",
    intervalTypeTime: "Temps",
    intervalTypeDistance: "Distance",
    intervalTypeCalorie: "Calorie",
    intervalTypeWattminute: "Watt-minute",
    removeGhost: "Supprimer le fantôme",
    racingAgainst: "Course contre : {name}",
    compareAction: "Comparer",
    legendTitle: "Légende",
    legendGhost: "Fantôme",
    kbTitle: "Raccourcis clavier",
    kbSpaceHint: "lecture / pause",
    kbArrowHint: "avancer/reculer ±10 s",
    kbArrowShiftHint: "avancer/reculer ±30 s",
    kbBracketHint: "changer la vitesse",
    kbHomeHint: "revenir au début",
  },
  inspector: {
    toggle: "Inspecteur de champs",
    toggleOn: "Masquer l'inspecteur de champs",
    panelLabel: "Inspecteur de champs bruts",
    sectionWorkout: "Séance",
    sectionProvenance: "Provenance",
    sectionPerStroke: "Par coup",
    colField: "Champ",
    colAsLogged: "Tel qu'enregistré",
    colNormalized: "Normalisé",
    derived: "dérivé",
    noStrokeData: "Aucun échantillon par coup à cet instant.",
    tableLabel: "Lecture des champs par coup",
    staticSport: "Sport",
    staticDistance: "Distance",
    staticTime: "Temps",
    staticDrag: "Facteur de traînée",
    staticType: "Type de séance",
    staticResolution: "Résolution",
    fieldT: "Temps (dixièmes de s)",
    fieldD: "Distance (décimètres)",
    fieldP: "Allure (dixièmes)",
    fieldSpm: "Cadence",
    fieldHr: "Fréquence cardiaque",
    fieldWatts: "Puissance (dérivée)",
    fieldProgress: "Progression",
    fieldSplit: "Index de split",
    fieldInterval: "Index d'intervalle",
    fieldDps: "Distance par coup",
    metaPm: "Version PM",
    metaFirmware: "Firmware",
    metaErg: "Modèle d'erg",
    metaHrSensor: "Capteur FC",
    metaSource: "App source",
    metaSerial: "Numéro de série",
    metaDevice: "Appareil",
  },
  drift: {
    toggle: "Afficher la dérive d’efficacité",
    toggleOn: "Masquer la dérive d’efficacité",
    baseline: "Référence d’ouverture",
    fade: "Perte d’efficacité",
    unit: " m/coup",
    summaryTitle: "Dérive de distance par coup",
    summaryHint: "Évolution du DPS du segment d’ouverture à la fin",
    axisLabel: "DPS",
  },
  settings: {
    title: "Compte et données",
    eyebrow: "Confidentialité et contrôle",
    dataTitle: "Ce que nous stockons",
    dataNote:
      "rowplay lit vos séances Concept2 à la demande et les met en cache sur Cloudflare pour des replays instantanés. Votre jeton API est scellé dans le cookie httpOnly rp_tok avec SESSION_SECRET. KV ne stocke que l’identité/l’état de session ; D1 met en cache les séances et replays, jamais le jeton. La déconnexion ou la suppression des données efface les données utilisateur en cache et l’état de session.",
    factWorkouts: "{n} séances disponibles à l’export",
    factDemo: "Mode démo — données d’exemple uniquement, rien n’est persisté.",
    factCache: "D1 stocke les données séance/replay en cache — jamais le jeton.",
    factSession:
      "KV stocke l’identité/l’état de session ; le jeton est scellé dans httpOnly rp_tok.",
    exportTitle: "Exporter le logbook",
    exportNote:
      "Téléchargez tout votre historique en CSV ou JSON. L’export TCX par séance (données de coups) s’ouvre dans Garmin, Strava ou TrainingPeaks.",
    exportCsv: "Télécharger CSV",
    exportJson: "Télécharger JSON",
    exportTcxNote: "Export TCX (par séance avec données de coups) :",
    exportTcx: "Séance #{id} · TCX",
    syncTitle: "Resynchroniser le logbook",
    syncNote:
      "La sync incrémentale récupère les séances depuis votre dernière sync. La resync complète retélécharge tout l’historique (plus lent, en cas de problème).",
    syncIncremental: "Sync incrémentale",
    syncFull: "Resync complète",
    loadFullHistory: "Charger tout l’historique",
    syncDemo:
      "Sync indisponible en mode démo — connectez votre logbook pour synchroniser de vraies données.",
    lastSync: "{total} séances en cache · dernière sync {date}",
    neverSynced: "jamais",
    deleteTitle: "Effacer les données en cache",
    deleteNote:
      "Supprime vos séances en cache et le détail replay de rowplay et vous déconnecte. Votre logbook Concept2 n’est pas modifié.",
    deleteAction: "Supprimer mes données en cache",
    deleteConfirm:
      "Supprimer toutes les séances en cache et les données replay de rowplay et se déconnecter ? Votre logbook Concept2 ne sera pas modifié.",
    deleteDemo: "Mode démo — rien n’a été stocké, rien à supprimer.",
    deleteDone: "Données en cache effacées. Vous êtes déconnecté.",
    deleteFailed: "Impossible d’effacer les données en cache",
    timezoneTitle: "Fuseau horaire principal",
    timezoneNote:
      "Choisissez votre fuseau local pour que les séances près de minuit apparaissent sur le bon jour du calendrier.",
    timezoneLabel: "Fuseau horaire principal",
    timezoneSaved: "Fuseau horaire enregistré",
    timezoneUtcDefault: "UTC (par défaut)",
    timezoneGroupAmericas: "Amériques",
    timezoneGroupEuropeAfrica: "Europe / Afrique",
    timezoneGroupAsiaPacific: "Asie / Pacifique",
    lastSyncError: "{total} séances · dernière sync échouée : {message}",
    partialCache: "{n} séances en cache · historique encore en chargement",
    exportPreviewCsv: "CSV : une ligne par séance, ordre des colonnes stable (17 colonnes)",
    exportPreviewJson: "JSON : tableau avec métadonnées de schéma (version 1)",
    exportPreviewTcx: "TCX 2.0 : trackpoints par coup, compatible Garmin/Strava",
    noTcxAvailable: "Aucune séance avec données de coups pour l’export TCX.",
  },
  token: {
    title: "Utiliser votre jeton Concept2",
    introBefore: "Collez un jeton API personnel depuis votre logbook Concept2 (",
    introLink: "Modifier le profil → Applications",
    introAfter:
      "). Collez-le ici une fois — rowplay l’envoie au Worker en HTTPS, le valide, le scelle dans le cookie httpOnly rp_tok et l’utilise uniquement pour les lectures côté serveur. Le jeton n’est jamais stocké dans KV ni D1.",
    trustTitle: "Comment rowplay gère le jeton",
    trustAccessTitle: "Accès :",
    trustAccessBody:
      "un jeton Concept2 personnel vous authentifie ; rowplay l’utilise uniquement côté serveur pour lire profil, séances et données de coups.",
    trustStoredTitle: "Stockage :",
    trustStoredBody:
      "le jeton validé est scellé dans le cookie httpOnly rp_tok, pas dans localStorage, KV ni D1.",
    trustDisconnectTitle: "Déconnexion :",
    trustDisconnectBody:
      "se déconnecter ou supprimer les données du compte depuis Données efface le cookie de jeton, la session et le cache privé.",
    trustCacheTitle: "Cache :",
    trustCacheBody:
      "D1 cache les résumés de séances et détails de replay pendant la connexion ; les partages publics ou entrées leaderboard ne sont créés que si vous publiez.",
    apiToken: "Jeton API",
    placeholder: "Collez votre jeton",
    connect: "Connecter avec le jeton",
    connecting: "Connexion…",
    rejected: "Concept2 a refusé ce jeton. Vérifiez-le et réessayez.",
    serverMisconfigured:
      "Ce déploiement n’est pas configuré pour la connexion par jeton (SESSION_SECRET manquant). Contactez le propriétaire du site.",
    empty: "Collez votre jeton API Concept2.",
    preferBefore: "Vous préférez le flux standard ? ",
    preferLink: "Connecter Concept2",
  },
  comparability: {
    blockedTitle: "Séances non comparables",
    guidance:
      "Choisissez deux séances sur la même machine, du même type et dans la même bande de distance ou de durée.",
    noComparableCandidates: "Aucune séance comparable trouvée.",
    groupComparable: "Comparables",
    groupIncomparable: "Autres (non comparables)",
    reason: {
      crossSport: "Ces séances sont sur des machines différentes.",
      crossAxis: "L'une est une pièce à distance fixe, l'autre à temps fixe.",
      crossBand: "Ces séances sont dans des bandes de distance ou de durée différentes.",
    },
  },
  compare: {
    title: "Comparer des séances",
    lead: "Statistiques côte à côte et graphiques superposés pour deux séances au choix.",
    back: "Retour au tableau de bord",
    workoutA: "Séance A",
    workoutB: "Séance B",
    choose: "Choisir…",
    run: "Comparer",
    swap: "Inverser",
    pickTwo: "Choisissez deux séances ci-dessus pour comparer.",
    deltaTable: "Statistiques face à face",
    deltaHint: "Un delta positif signifie que la séance A est plus élevée.",
    alignedNote: "Aligné sur {distance}",
    noStrokeData: "Pas de données de coups pour les graphiques superposés.",
    winnerA: "Séance A gagne",
    winnerB: "Séance B gagne",
    tie: "Égalité",
    verdictTimeA: "La séance A était {seconds}s plus rapide",
    verdictTimeB: "La séance B était {seconds}s plus rapide",
    verdictPaceA: "La séance A était {delta} plus rapide",
    verdictPaceB: "La séance B était {delta} plus rapide",
    statTime: "Temps",
    statPace: "Allure",
    statAvgPower: "Puiss. moy.",
    statBest5sPower: "Meilleure puiss. 5 s",
    statAvgHr: "HR moy.",
    statDps: "Dist/coup",
    statConsistency: "Régularité",
    statMetric: "Métrique",
    statDelta: "Δ (A − B)",
    repTimeDelta: "Δ temps",
    vsDistance: "vs distance",
    intervalTitle: "Comparaison d’intervalles",
    intervalHint: "Deltas d’allure et de temps par répétition.",
  },
} as const;
