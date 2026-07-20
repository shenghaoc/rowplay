export const de = {
  liveMode: {
    title: "Live-Modus",
    enabled: "Neue Workouts automatisch synchronisieren",
    enabledHint: "Das Logbuch im gewählten Intervall abfragen",
    interval: "Abfrageintervall",
    intervalSec: "{n} s",
    intervalMin: "{n} Min.",
    lastPollLabel: "Letzte Prüfung",
    nextPollLabel: "Nächste Prüfung",
    polling: "Suche nach neuen Workouts…",
    sound: "Benachrichtigungston",
    soundHint: "Einen dezenten Ton abspielen, wenn ein neues Workout erscheint",
    newWorkout: "Neues Workout — {distance} · {time} · {sport}",
    newWorkouts: "{count} neue Workouts synchronisiert",
    view: "Ansehen",
    error: "Live-Synchronisierung fehlgeschlagen",
    errorRetry: "Wird automatisch wiederholt",
    rateLimit: "Ratenlimit erreicht — Abfragen werden verlangsamt",
    reauth: "Sitzung abgelaufen — bitte erneut anmelden",
    recovered: "Live-Synchronisierung fortgesetzt",
    warning: "Live-Synchronisierung ist {count}-mal in Folge fehlgeschlagen",
  },
  annotations: {
    title: "Coaching-Notizen",
    addNote: "Notiz hinzufügen",
    editNote: "Notiz bearbeiten",
    deleteNote: "Löschen",
    saveNote: "Speichern",
    cancelNote: "Abbrechen",
    addPlaceholder: "Worauf sollte sich der Athlet in diesem Moment konzentrieren?",
    noNotes:
      "Noch keine Coaching-Notizen. Ziehe den Regler zu einem Moment und füge eine Notiz hinzu.",
    confirmDelete: "Diese Notiz löschen?",
    seekTo: "Zu {time} springen",
    timestampLabel: "bei",
    pinnedTo: "Angeheftet bei",
    saveError: "Notiz konnte nicht gespeichert werden. Bitte erneut versuchen.",
    deleteError: "Notiz konnte nicht gelöscht werden. Bitte erneut versuchen.",
  },
  leaderboard: {
    title: "Bestenlisten",
    lead: "Tritt gegen Ghosts anderer rowplay-Athleten auf demselben Stück an. Wähle Sportart und Standarddistanz, um die Rangliste zu sehen.",
    sport: "Sport",
    distance: "Distanz",
    rank: "Rang",
    athlete: "Athlet",
    time: "Zeit",
    pace: "Pace",
    gap: "Rückstand",
    actions: "Aktionen",
    you: "Du",
    athletes: "{n} Athleten",
    open: "Öffnen",
    race: "Rennen",
    raceHint:
      "Mit „Rennen“ wird ein Rivale als Ghost in deinem eigenen Replay dieses Stücks vorbereitet.",
    empty: "Noch keine Einträge auf dieser Liste — sei der Erste, der ein Ergebnis veröffentlicht.",
    publish: "In Bestenliste veröffentlichen",
    publishing: "Wird veröffentlicht…",
    publishOk: "Veröffentlicht — du bist Rang {rank} auf {sport} {distance}.",
    publishOffBoard:
      "Nur Standarddistanzen (500 m, 1k, 2k, 5k, 6k, 10k, Halbmarathon) können veröffentlicht werden.",
    publishFailed: "Konnte nicht in der Bestenliste veröffentlicht werden",
    publishNote:
      "Mit dem Veröffentlichen wird dieses Ergebnis auf der rowplay-Bestenliste öffentlich. An deinem Concept2-Logbuch ändert sich nichts.",
    withdraw: "Aus Bestenliste entfernen",
    withdrawing: "Wird entfernt…",
    withdrawOk: "Aus der Bestenliste entfernt.",
    withdrawFailed: "Konnte nicht aus der Bestenliste entfernt werden",
    ghostFallbackToast:
      "Konnten die Schläge des Rivalen nicht laden — Rennen mit deren Durchschnittstempo",
  },
  nav: {
    dashboard: "Dashboard",
    leaderboard: "Bestenlisten",
    docs: "Hilfe",
    settings: "Daten",
    menuOpen: "Menü öffnen",
    menuClose: "Menü schließen",
    skipToContent: "Zum Inhalt springen",
  },
  common: {
    demoMode: "Demo-Modus",
    replay: "Replay",
    loading: "lädt…",
    tryAgain: "Bitte versuche es erneut.",
    dismiss: "Ausblenden",
    notAffiliated: "nicht mit Concept2 verbunden",
    tagline: "rowplay · Concept2-Logbuch-Analyse & Echtzeit-Replay",
  },
  sync: {
    loading: "Synchronisiere…",
    done: "{added} neu · {total} Workouts gesamt gecacht",
    failed: "Synchronisation fehlgeschlagen",
    incrementalDone: "Auf dem neuesten Stand — {total} Workouts gecacht",
    retry: "Sync wiederholen",
    errorBadge: "Letzte Synchronisation fehlgeschlagen",
    errorHint: "{message}",
    demoUnavailable: "Sync im Demo-Modus nicht verfügbar — verbinde dein Logbuch für echte Daten.",
    partialWarning:
      "Verlauf wird noch geladen — Summen und PBs können unvollständig sein, bis der Sync abgeschlossen ist.",
    inProgress: "Sync läuft…",
    historyWindow: "Zeigt die letzten {months} Monate — ältere Historie wird geladen…",
    historyBackfilling: "{total} Workouts · Historie bis {date}",
    historyComplete: "Vollständige Historie synchronisiert",
  },
  auth: {
    connect: "Concept2 verbinden",
    useToken: "Token verwenden",
    logout: "Abmelden",
  },
  theme: { toLight: "Zum Hellmodus wechseln", toDark: "Zum Dunkelmodus wechseln" },
  lang: { switch: "Sprache wechseln" },
  pwa: {
    updateAvailable: "Eine neue Version von rowplay ist verfügbar.",
    reload: "Neu laden",
  },
  landing: {
    tagline: "Concept2 · RowErg · SkiErg · BikeErg",
    title1: "Spiele deine Workouts ab.",
    title2: "Verstehe deine Splits.",
    lead: "rowplay verbindet sich mit deinem Concept2-Logbuch und macht aus jedem Ergebnis umfangreiche Analysen — und ein Echtzeit-Replay, das du Schlag für Schlag verfolgen kannst, mit Live-Strecke und synchroner Pace-, Rate-, Power- und Herzfrequenz-Telemetrie.",
    exploreDemo: "Demo erkunden →",
    openDashboard: "Dashboard öffnen →",
    connect: "Concept2-Logbuch verbinden →",
    readGuide: "Guide lesen",
    demoNote:
      "Demo-Modus mit Beispieldaten. Füge ein persönliches Token hinzu, um dein eigenes Logbuch zu laden.",
    feat1Title: "Echtzeit-Replay",
    feat1Body:
      "Sieh zu, wie deine Pace die Strecke entlangfährt, während Anzeigen und Charts synchron ablaufen.",
    feat2Title: "Split-Analysen",
    feat2Body: "Pace, Schlagfrequenz, Power und HF über die Zeit — auf allen drei Geräten.",
    feat3Title: "Überall schnell",
    feat3Body:
      "Global über Cloudflare bereitgestellt, mit Live-Daten von Concept2 für Replays nach dem Training.",
    tourEyebrow: "Erster Start",
    tourTitle: "Vier Dinge zum Ausprobieren",
    tourBody:
      "Starte im Dashboard, öffne ein Replay, fahre gegen eine frühere eigene Leistung und exportiere dann die Daten, die du extern prüfen willst.",
    tourDashboard: "Dashboard: Summen, Trends und PBs",
    tourReplay: "Replay: synchrone Strecke und Anzeigen",
    tourGhost: "Ghost-Racing: jage eine frühere Leistung oder Zielpace",
    tourExport: "Export: CSV, JSON oder TCX",
    tourDismiss: "Erststart-Tour ausblenden",
  },
  docs: {
    title: "User Guide",
    description:
      "So nutzt du rowplay: erste Schritte, Ruderbegriffe, Pace und Watt, Diagramme, Abläufe, FAQ und Problemlösung.",
    badge: "Docs aus dem Repository",
    openDashboard: "Dashboard öffnen",
    openSource: "Quelle öffnen",
    navLabel: "Abschnitte des User Guide",
    contextual: {
      gettingStarted: "Neu hier? Lies die Erste-Schritte-Anleitung",
      metrics: "Was bedeuten Pace, Watt und Schlagzahl?",
      charts: "So liest du dieses Diagramm",
      troubleshooting: "Daten fehlen oder wirken seltsam? Siehe Problemlösung",
      workflows: "So funktionieren Replays, Geister und Exporte",
    },
    sections: {
      overview: {
        navTitle: "Überblick",
        markdown: `# rowplay User Guide

rowplay macht aus deinen Indoor-Ruder-, Ski- und Rad-Workouts etwas zum Erkunden: ein Dashboard mit Summen und Trends und ein Replay Schlag für Schlag.

Es funktioniert mit Workouts von Concept2-Geräten — dem RowErg (Rudergerät), SkiErg und BikeErg — und liest sie aus dem kostenlosen Concept2-Online-Logbuch. Du musst kein Ruder-Fachvokabular kennen: Dieser Guide erklärt jeden Begriff, den er verwendet.

## Was du hier tun kannst

- **Dashboard** — Summen, Trends, persönliche Bestzeiten und Trainingslast auf einen Blick.
- **Replay** — sieh jedem Workout Schlag für Schlag zu, mit synchronen Diagrammen für Pace, Schlagzahl, Leistung und Herzfrequenz.

## Abschnitte des Guide

- [Erste Schritte](/docs/getting-started) — Demo-Modus und Logbuch verbinden.
- [Rudern-Grundlagen](/docs/rowing-metrics) — Schläge, Splits und die anderen Begriffe, die dir begegnen.
- [Pace, Splits & Watt](/docs/pace-splits-watts) — was die Zahlen bedeuten und wie sie zusammenhängen.
- [Diagramme & Fortschritt](/docs/charts-and-progress) — so liest du die Dashboard-Panels.
- [Typische Abläufe](/docs/workflows) — Replay, frühere Einheiten als Geist und Exportieren.
- [FAQ](/docs/faq) — kurze Antworten zu Konten, Privatsphäre und Daten.
- [Problemlösung](/docs/troubleshooting) — fehlende Daten, seltsame Zahlen, Darstellungsprobleme.

> Tipp: rowplay startet im Demo-Modus mit Beispiel-Workouts — du kannst also alles auf dieser Liste ausprobieren, bevor du ein Concept2-Konto verbindest.`,
      },
      gettingStarted: {
        navTitle: "Erste Schritte",
        markdown: `# Erste Schritte

## Erst die Demo ausprobieren

rowplay startet im Demo-Modus: Ohne verbundenes Konto sind alle Seiten mit realistischen Beispiel-Workouts gefüllt. Nichts, was du im Demo-Modus tust, berührt ein echtes Konto.

1. Öffne das [Dashboard](/dashboard).
2. Wähle ein beliebiges Workout aus der Liste.
3. Drücke **Replay** und probiere Wiedergabe, Pause, Scrubben und die Geschwindigkeitsregler.
4. Nutze die Filter im Dashboard und öffne ein weiteres Replay.

## Eigene Workouts verbinden

Deine Workouts liegen im Concept2-Logbuch — dem kostenlosen Online-Tagebuch, in das Concept2-Geräte (und die ErgData-App) Ergebnisse hochladen. rowplay liest dieses Logbuch über einen persönlichen Zugriffstoken: einen langen Code, der wie ein Leseschlüssel für deine Daten wirkt.

1. Melde dich in deinem Logbuch auf log.concept2.com an.
2. Öffne **Edit Profile → Applications** und kopiere deinen persönlichen API-Token.
3. Zurück in rowplay öffnest du [Token verwenden](/auth/token).
4. Füge den Token ein und sende ihn ab.
5. Öffne das Dashboard. rowplay lädt deine vollständige Historie direkt über die Concept2-API.

Der Token wird einmal über eine verschlüsselte Verbindung gesendet und nur in einem geschützten Browser-Cookie gehalten. rowplay speichert weder Workouts noch Tokens auf seinen Servern.

## Trennen

Nutze zum Trennen den **Abmelden**-Knopf in der Kopfzeile. [Daten](/settings) enthält weiterhin Export und Heimat-Zeitzone. Dein Concept2-Logbuch wird nie verändert.`,
      },
      rowingMetrics: {
        navTitle: "Rudern-Grundlagen",
        markdown: `# Rudern-Grundlagen

Neu beim Indoor-Rudern — oder nur bei seinem Vokabular? Das sind die Begriffe, die rowplay verwendet.

Die Figur bewegt sich im echten Schlagrhythmus des Workouts — ein Zug (bzw. Stockeinsatz oder Kurbelumdrehung) pro aufgezeichnetem Schlag, mit Spritzern bei jedem Einsatz — und wird mit der Wiedergabegeschwindigkeit schneller. Die 3D-Verfolgerkamera öffnet den Bildwinkel leicht, wenn das Boot schneller läuft.

In 3D wählt der **Qualität**-Selektor zwischen niedriger, mittlerer und hoher Grafik. Hält das Gerät keine flüssige Bildrate, senkt der Renderer automatisch zuerst die Auflösung und dann die Effekte — hohe Qualität ist also auf jeder Hardware gefahrlos. Das Replay respektiert die Systemeinstellung für reduzierte Bewegung.

Schlagdaten werden verwendet, wenn Concept2 sie liefert. Workouts ohne Schlagdaten fallen auf Split-basiertes Replay zurück, sodass die Strecke weiter abspielt.

## Die Geräte

- **RowErg** — das Rudergerät von Concept2 („Erg" ist kurz für Ergometer, ein Gerät, das Arbeit misst).
- **SkiErg** — ein Standgerät, das die Stockbewegung beim Skilanglauf nachbildet.
- **BikeErg** — das Standrad von Concept2.

Alle drei messen die Anstrengung auf dieselbe Weise, daher zeigt rowplay sie mit denselben Arten von Zahlen.

## Der Schlag

Ein **Schlag** ist ein vollständiger Bewegungszyklus — am RowErg: der Beinstoß, der Zug und das Zurückrollen in die Ausgangsposition. Zwei Zahlen beschreiben deine Schläge:

- **Schlagzahl (spm)** — Schläge pro Minute: wie schnell du die Bewegung durchläufst. Ruhiges Rudern liegt typischerweise bei 18–30 spm.
- **Distanz pro Schlag (DPS)** — wie viele Meter dir jeder Schlag einbringt. Höher bedeutet meist einen kraftvolleren, effizienteren Schlag.

Eine hohe Schlagzahl bedeutet nicht automatisch mehr Tempo: 20 kräftige Schläge pro Minute können dich schneller bewegen als 30 gehetzte.

## Distanz und Zeit

Das Gerät rechnet deine Anstrengung in **Meter** um, als würdest du ein Boot (oder Ski oder ein Rad) über eine Strecke bewegen. Workouts sind entweder distanzbasiert („rudere 2000m") oder zeitbasiert („rudere 30 Minuten"). Ein **Intervall-Workout** zerlegt das Stück in Wiederholungen mit Pausen dazwischen — zum Beispiel 4 × 500m.

## Pace und Splits

**Pace** ist die Zeit, die du für eine feste Distanz brauchst — 500 Meter am RowErg und SkiErg, 1000 Meter am BikeErg. Ein **Split** ist deine Pace über einen Abschnitt des Workouts. Diese beiden sind das Herz des Erg-Trainings und haben [eine eigene Seite](/docs/pace-splits-watts).

## Herzfrequenz

Trägst du einen Brustgurt oder eine Uhr, die mit dem Gerät oder der ErgData-App verbunden ist, erscheinen Schläge pro Minute (**bpm**) neben den anderen Zahlen und bekommen im Replay ein eigenes Diagramm.`,
      },
      paceSplitsWatts: {
        navTitle: "Pace, Splits & Watt",
        markdown: `# Pace, Splits & Watt

Um diese Zahlen dreht sich das Erg-Training. rowplay berechnet alles für dich — aber zu wissen, was sie bedeuten, macht jedes Diagramm leichter lesbar.

## Pace: Zeit pro 500m

Pace beantwortet die Frage: „Wie lange würde ich bei diesem Tempo für 500 Meter brauchen?" Sie wird wie eine Uhrzeit geschrieben — **2:05** heißt 2 Minuten 5 Sekunden pro 500m.

- **Niedriger ist schneller.** 1:55 ist eine schnellere Pace als 2:05.
- In Diagrammen bedeutet bessere Pace eine Linie, die nach **unten** geht.
- **BikeErg-Pace gilt pro 1000m**, nicht pro 500m, weil Räder schneller sind. rowplay behandelt das automatisch — wundere dich also nicht, dass Rad-Paces ähnlich wie Ruder-Paces aussehen.

## Splits

Ein Split ist deine durchschnittliche Pace über einen Teil des Workouts — jede 500m eines 2000m-Stücks oder jedes Intervall einer Intervalleinheit. Splits zu vergleichen zeigt, wie du deine Kraft eingeteilt hast: gleichmäßige Splits, ein Einbruch am Ende oder ein schneller Schluss (ein „negativer Split" heißt: jeder Split schneller als der vorige).

## Watt

Watt messen deine Leistungsabgabe — dieselbe Einheit wie bei einer Glühbirne. Wo die Pace dir das Ergebnis nennt, nennen Watt dir die Arbeit. Beide sind zwei Sichten auf dieselbe Anstrengung: Rund 2:00/500m zu halten kostet etwa 200 Watt, und kleine Pace-Gewinne verlangen überproportional mehr Leistung — von 2:00 auf 1:54 kostet etwa 30 Watt extra.

Ruhiges Rudern liegt je nach Fitness zwischen 100 und 250 Watt; Sprints können weit darüber ausschlagen.

## Schlagzahl ist nicht Anstrengung

Die Schlagzahl (spm) sagt, wie oft du ziehst — nicht, wie hart. Zwei Ruderer können beide 2:00 Pace halten: einer mit 22 kräftigen Schlägen pro Minute, einer mit 28 leichteren. Pace **und** Schlagzahl zusammen zu beobachten (das Replay zeigt beide) verrät Technik: dieselbe Pace bei niedrigerer Schlagzahl heißt mehr Distanz pro Schlag.

## Wo du das alles siehst

- Das **Dashboard** zeigt Durchschnittspace, Summen und Bestzeiten über Workouts hinweg.
- Das **Replay** zeichnet Pace, Schlagzahl, Watt und Herzfrequenz über das ganze Workout, synchron zur Wiedergabe.
- Der **Intervall-Vergleich** im Replay zerlegt Intervall-Workouts in Balken, Split für Split.`,
      },
      chartsAndProgress: {
        navTitle: "Diagramme & Fortschritt",
        markdown: `# Diagramme & Fortschritt

Das Dashboard macht aus deiner Historie eine Reihe von Panels. Diese Seite erklärt, wie du sie liest.

## Trend über die Zeit

Das Trend-Diagramm verfolgt eine Metrik — Pace, Distanz, Schlagzahl oder Distanz pro Schlag — über Wochen von Workouts. Damit der Vergleich fair bleibt, vergleichen Pace-Trends **Gleiches mit Gleichem**: Ein Sprint und ein langes ruhiges Rudern landen nie in einer Linie. Workouts werden in Distanzbänder gruppiert, und du wählst das Band aus.

- Bei **Pace** ist unten besser (weniger Zeit pro 500m).
- Eine Bewertungszeile über dem Diagramm fasst die Richtung zusammen: verbessernd, stabil oder nachlassend.
- Ein Band braucht mindestens zwei Einheiten, bevor ein Trend gezeichnet werden kann.

## Persönliche Bestzeiten

Das PB-Panel verfolgt deine schnellsten Ergebnisse über Standarddistanzen (500m, 1k, 2k, 5k, 6k, 10k und länger) aus deiner live geladenen Concept2-Historie.

## Trainingskalender & Intensität

Der Kalender färbt jeden Tag danach, wie viel du trainiert hast — Serien und Lücken springen sofort ins Auge. Die Intensitätsansicht zeigt, wie sich dein Training auf leichte und harte Arbeit verteilt.

## Fitness, Ermüdung & Form

Das Frische-Panel schätzt drei Kurven aus deiner Trainingslast: **Fitness** (die langfristig angesparte Arbeit), **Ermüdung** (die kurzfristige Müdigkeit aus jüngsten Einheiten) und **Form** (Fitness minus Ermüdung — deine heutige Bereitschaft). Hartes Training hebt Fitness und Ermüdung gemeinsam; Erholung senkt die Ermüdung schneller als die Fitness — deshalb erreicht die Form nach einer lockeren Phase ihren Höhepunkt.

## Critical Power

Das Critical-Power-Panel schätzt die höchste Leistung, die du über eine lange Anstrengung halten könntest — berechnet aus deinen eigenen besten Ergebnissen. Es speist den Pace-Prädiktor: eine Schätzung, was du über eine Distanz halten könntest, die du länger nicht gefahren bist.

## Schlag-Effizienz (DPS)

Das DPS-Diagramm verfolgt die Meter pro Schlag. Der Pace-normalisierte Schalter entfernt den Effekt, einfach härter zu rudern — was bleibt, ist näher an reiner Technik. Nutze den 7-Tage-Schnitt für die aktuelle Form und den 28-Tage-Schnitt für das große Bild.`,
      },
      workflows: {
        navTitle: "Typische Abläufe",
        markdown: `# Typische Abläufe

## Ein Workout abspielen

Öffne ein beliebiges Workout im Dashboard und drücke **Replay**.

- **Wiedergabe / Pause** steuert die Wiedergabe; Streckenansicht und alle Anzeigen bleiben synchron.
- **Scrubbe** die Zeitleiste, um zu jedem Moment zu springen.
- **Geschwindigkeit** lässt das Replay mit 0,5× bis 8× Echtzeit laufen.
- Wechsle zwischen **2D- und 3D-Ansicht** der Strecke (3D braucht einen halbwegs modernen Browser).
- Setze eine **Ziel-Pace**, um eine Referenzlinie im Pace-Diagramm zu zeichnen.

Die Animation folgt den gültigen aufgezeichneten Zyklen des Workouts: Jede Schlagzeile bewegt genau einen gestalteten Ruderzug, Stockzyklus oder eine Pedalumdrehung weiter; Intervallanker ohne Zeit- oder Distanzfortschritt werden ignoriert. Die sichtbare Kinematik ist eine deterministische Illustration und keine gemessene Biomechanik — Concept2 liefert weder Kraftkurven noch Griffwege, Zuglänge, Gelenkpositionen oder Körperhaltung; Watt leitet rowplay aus der Pace ab. Beim RowErg arbeiten zuerst Beine, dann Rumpf und Arme, in der Erholung in umgekehrter Reihenfolge; SkiErg trennt Reichweite, Einsatz/Zug und Erholung; BikeErg trennt kadenzgetriebene Kurbeln vom distanzgetriebenen Radlauf. 2D und 3D zeigen sportartspezifische Wasser-, Schnee- und Bahnoberflächen. In 3D bleiben Hände und Füße an den Ausrüstungszielen, während eine nähere sportartspezifische Verfolgungskamera Position und Blickziel weich nachführt.

Die 2D-Ansicht zeichnet weiterhin eine leichtgewichtige prozedurale Athletenfigur. In 3D lädt rowplay einen kompakten, Repository-eigenen generischen Athleten als einzelnes Skinned Mesh. Für RowErg, SkiErg und BikeErg gibt es je einen gestalteten kanonischen Technik-Clip, der deterministisch aus Replay-Pose und -Zeit abgetastet wird; anschließend hält eine analytische Hand- und Fußkorrektur die maßgeblichen Ausrüstungskontakte ein. Kann V4 nicht geladen werden, bleiben die gestaltete V3-Geometrie und die prozedurale 3D-Darstellung verfügbar, Canvas 2D ist der stabile äußere Fallback. Figur und Clips sind allgemeine Präsentationsgrafik, keine athletenspezifische Biomechanik: Die Assets enthalten weder Scan noch Ausgabe eines Avatar-Generators, Nutzerbild, aufgezeichnete Bewegung oder Ähnlichkeit mit dem Athleten.

In 3D wählt der **Qualität**-Selektor niedrige, mittlere, hohe oder Ultra-Grafik. Ultra setzt WebGPU voraus; auf reinen WebGL-Geräten wird stattdessen Hoch verwendet. Wenn das Gerät keine flüssige Bildrate halten kann, senkt der Renderer automatisch zuerst die Auflösung und danach Effekte. Die Replay-Animation respektiert die Systemeinstellung für reduzierte Bewegung.

Per-Schlag-Daten werden verwendet, wenn Concept2 sie bereitstellt. Workouts ohne Schlagdaten fallen auf ein Split-basiertes Replay zurück, sodass die Strecke trotzdem abgespielt wird.

## Ein Geisterrennen fahren

Ein Geist ist eine frühere Leistung, die auf dem Bildschirm gegen dich antritt.

1. Öffne eines deiner Workouts im Replay.
2. Wähle in den Geist-Steuerelementen eine passende frühere Einheit.
3. Die frühere Leistung erscheint als zweites Boot zum Jagen.

Du kannst auch gegen deine eigenen früheren Ergebnisse antreten und genau sehen, wo ein Bestzeit-Versuch Zeit gewonnen oder verloren hat.

## Exportieren

[Daten](/settings) lädt dein Live-Logbuch als CSV oder JSON herunter, dazu TCX-Dateien pro Workout mit Schlagdaten.

## Daten frisch halten

Dashboard- und Replay-Daten werden live von Concept2 geladen. Der **Live-Modus** kann das Logbuch zusätzlich abfragen und neue Workouts melden.`,
      },
      faq: {
        navTitle: "FAQ",
        markdown: `# FAQ

## Brauche ich ein Concept2-Konto?

Nicht zum Umschauen — der Demo-Modus funktioniert ohne. Für deine eigenen Workouts brauchst du ein kostenloses Concept2-Logbuch-Konto; dort legt das Gerät (oder die ErgData-App) deine Ergebnisse ab.

## Ist mein Zugriffstoken sicher?

Der Token wird einmal über HTTPS übertragen und in einem geschützten, httpOnly-Browser-Cookie versiegelt. Auf rowplays Servern wird er nie gespeichert. Trennen löscht ihn.

## Können andere meine Workouts sehen?

Nein. Dein Dashboard und deine Replays sind privat; rowplay bietet keine öffentliche Freigabe und keine Bestenlisten.

## Verändert rowplay mein Concept2-Logbuch?

Nie. rowplay liest nur und verändert keinen Logbuch-Eintrag.

## Welche Geräte werden unterstützt?

RowErg, SkiErg und BikeErg. Die Pace wird beim Rudern und Skifahren pro 500m angezeigt, beim Rad pro 1000m.

## Warum haben manche Workouts kein Schlag-für-Schlag-Replay?

Nicht jeder Logbuch-Eintrag enthält Daten pro Schlag — das hängt von der Aufzeichnung ab. Diese Workouts werden trotzdem abgespielt, nur anhand ihrer Splits und mit weniger Datenpunkten.

## Kann ich rowplay auf dem Handy nutzen?

Ja — die ganze App inklusive Replays läuft im mobilen Browser, und du kannst sie wie eine App zum Startbildschirm hinzufügen.

## Welche Sprachen gibt es?

English, Deutsch, Español, Français, 日本語 und 中文 — umschaltbar in der Kopfzeile (auf dem Handy hinter dem Menü-Knopf).`,
      },
      troubleshooting: {
        navTitle: "Problemlösung",
        markdown: `# Problemlösung

## Meine Summen oder Bestzeiten wirken falsch

Lade das Dashboard neu, um die aktuelle Concept2-Historie abzurufen, und prüfe dann, ob das Workout im Concept2-Logbuch vorhanden ist.

## Eine Pace wirkt völlig daneben

- **BikeErg-Paces gelten pro 1000m**, nicht pro 500m — eine 2:00-Rad-Pace ist nicht dasselbe Tempo wie eine 2:00-Ruder-Pace.
- Intervall-Workouts melden die Pace der Arbeitsintervalle; Pausen zählen nicht mit.

## Das Trend-Diagramm verlangt mehr Einheiten

Trends vergleichen gleichartige Distanzen und brauchen daher mindestens zwei Einheiten im selben Distanzband. Logge ein weiteres ähnliches Workout, und der Trend erscheint.

## Ein Workout hat keine Schlag-Diagramme

Dieser Logbuch-Eintrag enthält keine Daten pro Schlag — häufig bei älteren Ergebnissen und manchen Aufzeichnungsarten. Das Replay greift auf Splits zurück. Schlagabhängige Panels (Distanz pro Schlag, Schlag-Vergleich) brauchen Schlagdaten und sagen es, wenn sie fehlen.

## Herzfrequenz fehlt

Das Logbuch hat nur dann Herzfrequenz, wenn während des Workouts ein Gurt oder eine Uhr verbunden war. Prüfe, ob das Quell-Workout sie in Concept2 enthält.

## Die Synchronisation schlägt fehl oder die Sitzung läuft ab

Persönliche Tokens können ablaufen oder widerrufen werden. Verbinde dich unter [Token verwenden](/auth/token) mit einem frischen Token aus deinem Concept2-Profil neu. Wurden in kurzer Zeit viele Anfragen gestellt, drosselt das Logbuch eventuell kurz — warte eine Minute und versuche es erneut.

## Ein neues Workout erscheint nicht

Prüfe zuerst, ob das Workout dein Concept2-Logbuch erreicht hat (es muss vom Gerät oder der ErgData-App hochgeladen werden). Lade dann das Dashboard neu oder aktiviere den Live-Modus für automatische Abfragen.

## Darstellungsprobleme

- **3D-Replay startet nicht** — der Browser braucht WebGPU oder WebGL; die 2D-Ansicht funktioniert immer.
- **Diagramme wirken auf dem Handy gequetscht** — drehe ins Querformat für breitere Diagramme; Panels ordnen sich auf kleinen Bildschirmen neu an.
- **Falsches Theme oder falsche Sprache** — beide Schalter sitzen in der Kopfzeile (auf dem Handy hinter dem Menü-Knopf) und werden pro Browser gemerkt.

Hängst du noch fest? Die [FAQ](/docs/faq) deckt mehr ab, und jede Seite dieses Guide ist über **Hilfe** in der Kopfzeile erreichbar.`,
      },
    },
  },
  dashboard: {
    eyebrow: "Dein Logbuch",
    title: "Ergebnisse & Replays",
    all: "Alle",
    sync: "Sync",
    syncing: "Synchronisiere…",
    syncedNote: "{total} Workouts · zuletzt synchronisiert {date}",
    recentNote:
      "Zeigt aktuelle Workouts — lade deinen vollständigen Verlauf für genaue PBs und Trends.",
    latest: "Neueste",
    distance: "Distanz",
    time: "Zeit",
    avgRate: "Ø Rate",
    distStroke: "Dist/Schlag",
    avgBpm: "Ø bpm",
    vsAvg: "vs dein {sport}-Ø",
    sessions: "Einheiten",
    totalDistance: "Gesamtdistanz",
    totalTime: "Gesamtzeit",
    avgPace: "Ø Pace",
    sectionCoreEyebrow: "Hier starten",
    sectionCore: "Auf einen Blick",
    sectionWorkoutsEyebrow: "Workouts",
    sectionWorkouts: "Replay finden",
    sectionWorkoutsBody:
      "Filtere und öffne Workouts, ohne zuerst durch tiefere Analysebereiche zu gehen.",
    sectionRecordsEyebrow: "Ziele",
    sectionRecords: "Ziele, Abzeichen & PBs",
    sectionRecordsBody:
      "Saisonziele, Meilensteine, Standarddistanz-Bestzeiten und Prognosen bleiben zusammen.",
    sectionAdvancedEyebrow: "Analyse",
    sectionAdvanced: "Erweiterte Analyse",
    sectionAdvancedBody:
      "Power-Modell, Trainingslast, Schlag-Effizienz und Langzeittrends für die tiefere Auswertung.",
    sectionPower: "CP/W′ & Frische",
    sectionPowerBody: "Critical Power, haltbare Pace und Lastbalance aus deiner eigenen Historie.",
    sectionTraining: "Trainingsstruktur",
    sectionTrainingBody: "Kalender, Intensität und Trends zeigen, wie die Arbeit verteilt ist.",
    sectionStroke: "Schlag-Effizienz & Sport-Splits",
    sectionStrokeBody: "DPS-Trend und Geräte-Zusammenfassungen für Technik- und Pace-Kontext.",
    tour: {
      eyebrow: "Demo-Leitfaden",
      title: "Das zuerst probieren",
      body: "Diese Hinweise sind optional und bleiben in diesem Browser ausgeblendet.",
      dismissHint: "{title} ausblenden",
      latestReplay: {
        title: "Neuestes Workout abspielen",
        body: "Öffne das neueste Demo-Stück und drücke Play.",
        action: "Replay öffnen",
      },
      criticalPower: {
        title: "CP/W′ prüfen",
        body: "Sieh dir das nachhaltige Power-Modell und den Pace-Prädiktor an.",
        action: "Zum Panel",
      },
      workoutFilters: {
        title: "Workout-Filter nutzen",
        body: "Grenze die Liste nach Distanz, Tags, Schlagdaten oder Pace ein.",
        action: "Filter testen",
      },
      leaderboardGhost: {
        title: "Leaderboard-Geist fahren",
        body: "Öffne ein Standard-Board und nutze Race, um einen Rivalen vorzubereiten.",
        action: "Leaderboard öffnen",
      },
    },
    pbTitle: "Persönliche Bestzeiten · Standarddistanzen",
    bySport: "Nach Sport",
    thSport: "Sport",
    thSessions: "Einheiten",
    thDistance: "Distanz",
    thTime: "Zeit",
    thAvgPace: "Ø Pace",
    thBestPace: "Beste Pace",
    trendTitle: "Trend über die Zeit",
    likeForLike: "{sport}, vergleichbare Distanz",
    mPace: "Pace",
    mDistStroke: "Dist/Schlag",
    mDistance: "Distanz",
    mRate: "Rate",
    holdingSteady: "Stabil — {metric} flach über {days} Tage",
    improving: "Verbesserung — {change} über {days} Tage",
    slipping: "Rückgang — {change} über {days} Tage",
    faster: "{delta} schneller",
    slower: "{delta} langsamer",
    emptyTrend:
      "Nur {n} Einheit in dieser Kategorie — logge noch eine {band}, um einen Trend zu sehen.",
    dpsTrend: {
      title: "Schlag-Effizienz (DPS)",
      raw: "Rohes DPS",
      normalised: "Pace-normalisiert",
      ma7: "7-Tage-Schnitt",
      ma28: "28-Tage-Schnitt",
      yLabel: "m/Schlag",
      empty: "Keine Schlagzahlen verfügbar",
      tooltipPace: "Ø Pace",
      tooltipDps: "DPS",
    },
    calTitle: "Trainingskalender",
    calMetricDistance: "Meter",
    calMetricTime: "Zeit",
    calActiveDays: "{n} aktive Tage",
    calCurrentStreak: "{n}-Tage-Serie",
    calLongestStreak: "Längste: {n} Tage",
    calLess: "Weniger",
    calMore: "Mehr",
    calTooltip: "{date} · {sessions} Einheiten · {volume}",
    calEmpty: "{date} · kein Training",
    calAria: "Trainingskalender, {active} aktive Tage, aktuelle Serie {streak} Tage",
    calDowSun: "So",
    calDowMon: "Mo",
    calDowTue: "Di",
    calDowWed: "Mi",
    calDowThu: "Do",
    calDowFri: "Fr",
    calDowSat: "Sa",
    tid: {
      title: "Trainingsintensität",
      time: "Zeit",
      distance: "Distanz",
      period4w: "Letzte 4 Wochen",
      period3m: "Letzte 3 Monate",
      period12m: "Letzte 12 Monate",
      empty: "Keine Trainings in diesem Zeitraum",
      zone: {
        UT2: "UT2 — Erholung",
        UT1: "UT1 — Aerob",
        AT: "AT — Schwelle",
        TR: "TR — Renntempo",
        AN: "AN — Anaerob",
        Easy: "Leicht",
        Moderate: "Mittel",
        Hard: "Hart",
      },
    },
    formTitle: "Fitness & Frische",
    formAdvanced: "Erweiterte Analyse",
    formSub: "Trainingsbelastung über alle Geräte, skaliert auf deine eigene Schwellenleistung.",
    formFitness: "Fitness",
    formFatigue: "Ermüdung",
    formForm: "Form",
    formFitnessHint: "42-Tage-Belastung (CTL)",
    formFatigueHint: "7-Tage-Belastung (ATL)",
    formFormHint: "Fitness − Ermüdung (TSB)",
    formFtp: "Schwellenleistung",
    formCp: "Critical Power",
    formModelled: "modelliert",
    formEstimated: "geschätzt",
    formRamp: "7-Tage-Fitness-Anstieg",
    formChartFitness: "Fitness",
    formChartFatigue: "Ermüdung",
    formChartForm: "Form",
    formEmpty:
      "Logge noch ein paar Einheiten über einige Wochen, damit dein Fitness-&-Frische-Diagramm angezeigt werden kann.",
    bandTransition: "Enttraining",
    descTransition: "Sehr frisch, aber die Fitness lässt nach. Zeit, wieder Gas zu geben.",
    bandFresh: "Frisch",
    descFresh: "Ausgeruht und wettkampfbereit — gutes Fenster, dich zu testen.",
    bandNeutral: "Neutral",
    descNeutral: "Ausgewogen — weder scharf noch tief ermüdet.",
    bandProductive: "Produktiv",
    descProductive: "Fitnessaufbau bei gesunder, beherrschbarer Ermüdung.",
    bandOverreaching: "Überreizung",
    descOverreaching: "Starke Ermüdung. Drossle und lass die Erholung aufholen.",
    goalsTitle: "Saisonziele & Challenges",
    goalsYear: "Ziel {year}",
    goalsKindMeters: "Meter",
    goalsKindHours: "Stunden",
    goalsTargetMeters: "Ziel (m)",
    goalsTargetHours: "Ziel (Stunden)",
    goalsSave: "Ziel speichern",
    goalsSaving: "Speichere…",
    goalsSaved: "Ziel gespeichert",
    goalsSaveFailed: "Ziel konnte nicht gespeichert werden",
    goalsProgress: "{current} / {target}",
    goalsPct: "{pct}% erreicht",
    goalsOnPace: "Im Plan — prognostiziert {projected} bis Jahresende",
    goalsBehind: "Hinter dem Plan — prognostiziert {projected} · noch {needed} nötig",
    goalsStreakCurrent: "{n}-Tage-Serie",
    goalsStreakCurrent_one: "{n}-Tag-Serie",
    goalsStreakLongest: "Längste: {n} Tage",
    goalsStreakLongest_one: "Längste: {n} Tag",
    goalsDaysSince: "{n} Tage seit letzter Einheit",
    goalsDaysSince_one: "{n} Tag seit letzter Einheit",
    goalsDaysSinceToday: "Heute trainiert",
    goalsWeekly: "{active} von {total} aktiven Wochen",
    badgesTitle: "Abzeichen",
    badgeMeters100k: "100k-Club",
    badgeMeters500k: "500k-Club",
    badgeMeters1m: "Million Meter",
    badgeMeters2m: "2 Millionen Meter",
    badgeMeters5m: "5 Millionen Meter",
    badgeClub500: "500m-Club PB",
    badgeClub1000: "1k-Club PB",
    badgeClub2000: "2k-Club PB",
    badgeClub5000: "5k-Club PB",
    badgeClub10000: "10k-Club PB",
    badgeEverySportWeek: "Jeder-Sport-Woche",
    pbTag: "PB",
    pbNew: "Neues PB",
    pbCelebrate: "Neues {distance}-PB — {time}!",
    pbCelebrateMore: "{count} neue persönliche Bestzeiten!",
    predictor: {
      title: "Leistungsprognose",
      distance: "Bekannte Distanz",
      time: "Bekannte Zeit",
      predict: "Prognostizieren",
      colDistance: "Distanz",
      colPredicted: "Prognose",
      colBest: "Dein Bestes",
      colStatus: "Status",
      beaten: "Geschlagen",
      behind: "Hinterher",
      untried: "Nicht versucht",
      noTime: "—",
      inputError: "Gültige Zeit eingeben (z. B. 7:04)",
    },
    cpTitle: "Critical Power & Pace-Prognose",
    cpSub:
      "Ein Best-Effort-Leistungsmodell aus deinen Logbook-Ergebnissen, mit klar sichtbarer Konfidenz und Datenwarnungen.",
    cpLabel: "Critical Power (CP)",
    cpWPrime: "Anaerobe Kapazität (W′)",
    cpMethod: "Fit-Methode",
    cpExplainModel:
      "{scope}-Modell: CP {cp} W und W′ {wPrime} kJ werden aus deinen besten geloggten Belastungen angepasst. Betrachte dies als Trainingsschätzung, nicht als Labormessung.",
    cpExplainEstimate:
      "{scope}-Schätzung: CP wird aus deiner besten längeren Belastung auf {cp} W geschätzt. Logge mehr maximale Belastungen über kurze, mittlere und lange Dauern, um CP/W′ anzupassen.",
    cpScopeLabel: "Critical-Power-Bereich",
    cpScopeAll: "Alle",
    cpEmptyScope:
      "Noch nicht genug nutzbare {scope}-Belastungen. Logge einige maximale Stücke über verschiedene Dauern, bevor du diesem Modell vertraust.",
    cpConfidenceLabel: "Konfidenz",
    cpConfidence: { high: "Hoch", medium: "Mittel", low: "Niedrig", insufficient: "Unzureichend" },
    cpSample: "{n} nutzbare Belastungen · {points} Hüllkurvenpunkte",
    cpFreshness: "Neueste Belastung {date}",
    cpFit: "Fit R² {r2} · Residuum {residual}%",
    cpWarningsLabel: "Modellwarnungen",
    cpWarning: {
      "too-few-efforts": "Zu wenige maximale Belastungen",
      "narrow-duration-range": "Schmaler Dauerbereich",
      "stale-efforts": "Neueste Belastung ist veraltet",
      "mixed-sports": "Gemischte Sportarten",
      "outlier-sensitive": "Ausreißerempfindlicher Fit",
      "unrealistic-fit": "Unrealistischer Fit verworfen",
      "estimate-only": "Nur Schätzung",
    },
    cpPredictTitle: "Was kann ich halten?",
    cpPredictSub:
      "Pace- und Zielzeitprognosen für eine einzelne Sportart aus dem gewählten Modell. Pace ist auf /500m normalisiert.",
    cpMixedPredictNote:
      "Wähle eine Sportart für Pace-Prognosen; die Ansicht für alle Sportarten zeigt nur Leistung.",
    cpModeDuration: "Halten für…",
    cpModeDistance: "Zeit für…",
    cpHoldFor: "Halten für",
    cpMinutes: "Minuten",
    cpDistance: "Distanz",
    cpPaceHint: "{scope}-Even-Split-Pace für etwa {min} Minuten",
    cpTimeHint: "{scope}-Zielzeitprognose für {dist}",
    cpPreset6: "6 Min",
    cpPreset20: "20 Min",
    cpPreset30: "30 Min",
    cpPreset60: "60 Min",
    cpDist500: "500 m",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "Power–Dauer: du vs. Modell",
    cpChartHint:
      "Punkte sind deine Session-Bests; die Linie ist die CP/W′-Prognose. Über der Linie = besser als das Modell.",
    cpChartActual: "Deine Bests",
    cpChartModel: "CP-Modell",
  },
  milestone: {
    title: "Meilensteine",
    next: "Als Nächstes",
    lifetime_distance_rower_100k: "100k Meter gerudert",
    "lifetime_distance_rower_100k.toast": "🎉 100k Meter gerudert!",
    lifetime_distance_rower_250k: "250k Meter gerudert",
    "lifetime_distance_rower_250k.toast": "🎉 250k Meter gerudert!",
    lifetime_distance_rower_500k: "500k Meter gerudert",
    "lifetime_distance_rower_500k.toast": "🎉 500k Meter gerudert!",
    lifetime_distance_rower_1M: "1 Million Meter gerudert",
    "lifetime_distance_rower_1M.toast": "🎉 1 Million Meter gerudert!",
    lifetime_distance_rower_2M: "2 Millionen Meter gerudert",
    "lifetime_distance_rower_2M.toast": "🎉 2 Millionen Meter gerudert!",
    lifetime_distance_rower_5M: "5 Millionen Meter gerudert",
    "lifetime_distance_rower_5M.toast": "🎉 5 Millionen Meter gerudert!",
    lifetime_distance_rower_10M: "10 Millionen Meter gerudert",
    "lifetime_distance_rower_10M.toast": "🎉 10 Millionen Meter gerudert!",
    lifetime_distance_skierg_100k: "100k Meter SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100k Meter SkiErg!",
    lifetime_distance_skierg_250k: "250k Meter SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250k Meter SkiErg!",
    lifetime_distance_skierg_500k: "500k Meter SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500k Meter SkiErg!",
    lifetime_distance_skierg_1M: "1 Million Meter SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 1 Million Meter SkiErg!",
    lifetime_distance_skierg_2M: "2 Millionen Meter SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 2 Millionen Meter SkiErg!",
    lifetime_distance_skierg_5M: "5 Millionen Meter SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 5 Millionen Meter SkiErg!",
    lifetime_distance_skierg_10M: "10 Millionen Meter SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 10 Millionen Meter SkiErg!",
    lifetime_distance_bike_100k: "100k Meter BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100k Meter BikeErg!",
    lifetime_distance_bike_250k: "250k Meter BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250k Meter BikeErg!",
    lifetime_distance_bike_500k: "500k Meter BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500k Meter BikeErg!",
    lifetime_distance_bike_1M: "1 Million Meter BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 1 Million Meter BikeErg!",
    lifetime_distance_bike_2M: "2 Millionen Meter BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 2 Millionen Meter BikeErg!",
    lifetime_distance_bike_5M: "5 Millionen Meter BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 5 Millionen Meter BikeErg!",
    lifetime_distance_bike_10M: "10 Millionen Meter BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 10 Millionen Meter BikeErg!",
    lifetime_distance_combined_100k: "100k Meter gesamt",
    "lifetime_distance_combined_100k.toast": "🎉 100k Meter gesamt!",
    lifetime_distance_combined_250k: "250k Meter gesamt",
    "lifetime_distance_combined_250k.toast": "🎉 250k Meter gesamt!",
    lifetime_distance_combined_500k: "500k Meter gesamt",
    "lifetime_distance_combined_500k.toast": "🎉 500k Meter gesamt!",
    lifetime_distance_combined_1M: "1 Million Meter gesamt",
    "lifetime_distance_combined_1M.toast": "🎉 1 Million Meter gesamt!",
    lifetime_distance_combined_2M: "2 Millionen Meter gesamt",
    "lifetime_distance_combined_2M.toast": "🎉 2 Millionen Meter gesamt!",
    lifetime_distance_combined_5M: "5 Millionen Meter gesamt",
    "lifetime_distance_combined_5M.toast": "🎉 5 Millionen Meter gesamt!",
    lifetime_distance_combined_10M: "10 Millionen Meter gesamt",
    "lifetime_distance_combined_10M.toast": "🎉 10 Millionen Meter gesamt!",
    session_count_10: "10 Workouts",
    "session_count_10.toast": "🎉 10 Workouts!",
    session_count_25: "25 Workouts",
    "session_count_25.toast": "🎉 25 Workouts!",
    session_count_50: "50 Workouts",
    "session_count_50.toast": "🎉 50 Workouts!",
    session_count_100: "100 Workouts",
    "session_count_100.toast": "🎉 100 Workouts!",
    session_count_250: "250 Workouts",
    "session_count_250.toast": "🎉 250 Workouts!",
    session_count_500: "500 Workouts",
    "session_count_500.toast": "🎉 500 Workouts!",
    session_count_1000: "1000 Workouts",
    "session_count_1000.toast": "🎉 1000 Workouts!",
    session_count_2500: "2500 Workouts",
    "session_count_2500.toast": "🎉 2500 Workouts!",
    streak_7d: "7-Tage-Serie",
    "streak_7d.toast": "🎉 7-Tage-Serie!",
    streak_14d: "14-Tage-Serie",
    "streak_14d.toast": "🎉 14-Tage-Serie!",
    streak_30d: "30-Tage-Serie",
    "streak_30d.toast": "🎉 30-Tage-Serie!",
    streak_60d: "60-Tage-Serie",
    "streak_60d.toast": "🎉 60-Tage-Serie!",
    streak_100d: "100-Tage-Serie",
    "streak_100d.toast": "🎉 100-Tage-Serie!",
    pb_2k_sub8: "2k unter 8:00",
    "pb_2k_sub8.toast": "🎉 2k unter 8:00!",
    pb_2k_sub730: "2k unter 7:30",
    "pb_2k_sub730.toast": "🎉 2k unter 7:30!",
    pb_2k_sub7: "2k unter 7:00",
    "pb_2k_sub7.toast": "🎉 2k unter 7:00!",
    pb_2k_sub630: "2k unter 6:30",
    "pb_2k_sub630.toast": "🎉 2k unter 6:30!",
  },
  workout: {
    tag: {
      label: "Typ",
      auto: "Automatisch",
      "steady-state": "Dauerleistung",
      interval: "Intervall",
      "race-piece": "Wettkampfstück",
      "time-trial": "Zeitfahren",
      "warmup-cooldown": "Aufwärmen / Abwärmen",
      unknown: "Sonstiges",
      filter: { all: "Alle Typen" },
      saveError: "Tag konnte nicht gespeichert werden — bitte erneut versuchen.",
    },
  },
  workoutList: {
    empty: "Keine Workouts für diesen Filter.",
    windowed: "{n} Workouts · für bessere Leistung virtualisiert",
    filtersTitle: "Workouts finden",
    matching: "{n} Treffer",
    clearFilters: "Filter zurücksetzen",
    expand: "Mehr Filter",
    collapse: "Weniger Filter",
    dateFrom: "Von",
    dateTo: "Bis",
    workoutType: "Logbook-Typ",
    anyType: "Beliebiger Logbook-Typ",
    strokeData: "Schlagdaten",
    strokeAny: "Beliebig",
    strokeYes: "Mit Schlagdaten",
    strokeNo: "Ohne Schlagdaten",
    searchComments: "Kommentare durchsuchen…",
    search: "Suchen",
    distanceChips: "Distanz",
    durationChips: "Dauer",
    durationMin: "{n} Min",
    chipMarathon: "Marathon",
    sortGroup: "Sortieren",
    sortDate: "Datum",
    sortDistance: "Distanz",
    sortTime: "Zeit",
    sortPace: "Pace",
    sortPower: "Power",
    pbsOnly: "Nur PBs",
    compare: "Vergleichen",
    comparePick: "Erstes Workout zum Vergleich wählen",
    compareWith: "Mit diesem Workout vergleichen",
    compareCancel: "Abbrechen",
    openReplay: "Replay öffnen",
  },
  share: {
    shareReplay: "Replay teilen",
    downloadImage: "Bild herunterladen",
    linkCopied: "Share-Link kopiert",
    linkReady: "Jeder mit diesem Link kann das Replay ansehen",
    shareFailed: "Share-Link konnte nicht erstellt werden",
    privacyBlocked:
      "Dieses Workout ist auf Concept2 nicht öffentlich und kann nicht geteilt werden. Setze seine Privatsphäre im Logbuch zuerst auf „Everyone“.",
    imageSaved: "Race Card gespeichert",
    imageFailed: "Race Card konnte nicht gespeichert werden",
    publicBanner: "Geteiltes Replay — Nur-Lese-Ansicht",
    ctaBefore: "Eigene Replays? ",
    ctaLink: "rowplay ausprobieren",
    ctaAfter: " — Concept2-Logbuch-Analysen und Workout-Replay.",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "Ø Power",
    raceCardAvgHr: "Ø HF",
  },
  replay: {
    hrImportTitle: "Herzfrequenz importieren",
    hrImportHint:
      "Dieses Workout hat keine HF aus dem Logbuch. Lade einen Uhren-Export (CSV, TCX oder FIT) hoch, um die Herzfrequenz im Replay einzublenden.",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "Startversatz der Uhr",
    hrImportOffsetHint: "Positiv, wenn die Uhr vor dem Rudern gestartet wurde (Sekunden).",
    hrImportPreview: "{count} Messpunkte · ~{avg} bpm Ø",
    hrImportApply: "Herzfrequenz anwenden",
    hrImportClear: "Importierte HF entfernen",
    hrImportApplied: "Herzfrequenz importiert",
    hrImportCleared: "Importierte Herzfrequenz entfernt",
    hrImportTooFew: "Diese Datei hat zu wenige Herzfrequenz-Messpunkte.",
    hrImportSaveFailed: "Herzfrequenz-Import konnte nicht gespeichert werden",
    hrImportClearFailed: "Herzfrequenz-Import konnte nicht entfernt werden",
    back: "Zurück zum Dashboard",
    moments: {
      title: "Training-Momente",
      subtitle: "Stellen, die sich im Replay zuerst ansehen lohnen.",
      lowResolution: "basiert auf Splits",
      jump: "Zu Moment springen",
      bpm: "bpm",
      "best-sustained": "Bester Dauer-Abschnitt",
      "slower-patch": "Langsamerer Abschnitt",
      "efficient-rhythm": "Effektivster Rhythmus",
      "finish-trend": "Ziel-Trend",
      "best-rep": "Beste Wiederholung",
      "slowest-rep": "Langsamste Wiederholung",
      reasonBestSustained: "{delta}% schneller als die heutige Basis.",
      reasonSlowerPatch: "{delta}% unter der heutigen Basis; Rhythmus und Erholung prüfen.",
      reasonEfficientRhythm: "Starkes Tempo ohne höchste Schlagzahl.",
      reasonFinishStronger: "Letztes Drittel {delta}% schneller als das erste.",
      reasonFinishFade: "Letztes Drittel {delta}% langsamer als das erste.",
      reasonFinishSteady: "Letztes Drittel innerhalb von {delta}% des ersten.",
      reasonBestRep: "Wiederholung {rep} war {delta}s/500m schneller als der Satzdurchschnitt.",
      reasonSlowestRep: "Wiederholung {rep} war {delta}s/500m langsamer als der Satzdurchschnitt.",
    },
    lowRes: "Replay in niedriger Auflösung",
    compareAgainst: "Vergleichen mit:",
    none: "Keine",
    pastSession: "Eine vergangene Einheit",
    constantPace: "Eine konstante Pace",
    uploadedFile: "Eine hochgeladene Datei",
    moreOptions: "Weitere Optionen",
    moreCompareOptions: "Weitere Vergleichsoptionen",
    chooseSession: "Wähle eine {sport}-Einheit…",
    setPace: "Pace setzen",
    targetPace: "Zielpace",
    targetPacePlaceholder: "M:SS",
    targetPaceSet: "Zielpace setzen",
    targetPaceClear: "Löschen",
    targetPaceBand: "±5-Sek.-Band anzeigen",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ {m} m voraus",
    behind: "▼ {m} m zurück",
    searchSessions: "Einheiten suchen…",
    suggestedRival: "Vorgeschlagener Rivale",
    raceVerdictWinSession:
      "Du hast deine {date} {distance} um {seconds}s geschlagen (du warst am Ziel {m} m voraus)",
    raceVerdictLoseSession:
      "Deine {date} {distance} hat dich um {seconds}s geschlagen (du warst am Ziel {m} m zurück)",
    raceVerdictWinPace:
      "Du hast das {pace}-Pace-Boot um {seconds}s geschlagen (du warst am Ziel {m} m voraus)",
    raceVerdictLosePace:
      "Das {pace}-Pace-Boot hat dich um {seconds}s geschlagen (du warst am Ziel {m} m zurück)",
    raceVerdictWinFile: "Du hast {name} um {seconds}s geschlagen (du warst am Ziel {m} m voraus)",
    raceVerdictLoseFile: "{name} hat dich um {seconds}s geschlagen (du warst am Ziel {m} m zurück)",
    raceFinished: "Rennen beendet",
    play: "Abspielen",
    pause: "Pause",
    viewToggle: "Kursansicht",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "3D-Ansicht benötigt WebGPU oder WebGL auf diesem Gerät",
    view3dLoading: "3D wird geladen…",
    view3dError: "3D-Ansicht konnte nicht geladen werden",
    quality: "Qualität",
    qualityLow: "Niedrig",
    qualityMedium: "Mittel",
    qualityHigh: "Hoch",
    qualityUltra: "Ultra",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "Pace",
    gRate: "Rate",
    gPower: "Power",
    gHeart: "Herz",
    cPace: "Pace",
    cRate: "Schlagfrequenz",
    cPower: "Power",
    cHeart: "Herzfrequenz",
    strokeQuality: "Schlagqualität",
    avgDistStroke: "Ø Dist / Schlag",
    avgRate: "Ø Rate",
    paceVariation: "Pace-Variation",
    paceVariationHint: "(niedriger = gleichmäßiger)",
    fade: "Nachlassen",
    negSplit: "Negative Split",
    slowedDown: "langsamer geworden",
    distPerStroke: "Distanz pro Schlag",
    distPerStrokeHint: "— höher = kraftvollerer Schlag",
    paceVsRate: "Pace vs. Rate",
    paceVsRateHint: "— finde deine effizienteste Frequenz",
    powerCurve: "Power-Kurve (bester Durchschnitt über Dauer)",
    hrZones: "Herzfrequenzzonen (Zeit in Zone)",
    intervalBreakdown: "Intervall-Aufschlüsselung",
    repComparison: "Wiederholungsvergleich",
    repComparisonN: "Wiederholungsvergleich ({n} Wdh.)",
    repComparisonRep: "Wdh. {n}",
    repComparisonAvgPace: "Ø {pace}",
    repComparisonMetricPace: "Tempo",
    repComparisonMetricRate: "Schlagfrequenz",
    repComparisonMetricPower: "Leistung",
    repComparisonMetricHr: "Herzfrequenz",
    splitBreakdown: "Split-Aufschlüsselung",
    segReps: "Wdh.",
    segSplits: "Splits",
    avgRepPace: "Ø Wdh.-Pace",
    avgSplitPace: "Ø Split-Pace",
    consistency: "Konstanz",
    consistencyHint: "(niedriger = gleichmäßiger)",
    setFade: "Set-Nachlassen",
    faded: "eingebrochen",
    fastestSlowest: "schnellste → langsamste",
    splitsTitle: "Splits",
    thNum: "#",
    thDist: "Dist",
    thTime: "Zeit",
    thPace: "Pace",
    thRate: "Rate",
    thHr: "HF",
    workoutDetails: "Workout-Details",
    mDate: "Datum",
    mSport: "Sport",
    mType: "Typ",
    mDistance: "Distanz",
    mTime: "Zeit",
    mAvgPace: "Ø Pace",
    mAvgRate: "Ø Rate",
    mStrokeCount: "Schlagzahl",
    mAvgPower: "Ø Power",
    mAvgHr: "Ø HF",
    mHrRange: "HF-Bereich",
    mCalories: "Kalorien",
    mDragFactor: "Drag-Faktor",
    mResolution: "Auflösung",
    mSegments: "Segmente",
    mWorkoutId: "Workout-ID",
    mComments: "Kommentare",
    samples: "Samples",
    perStroke: "pro Schlag",
    fromSplits: "aus Splits",
    intervalsWord: "Intervalle",
    splitsWord: "Splits",
    racingSession: "Rennen gegen deine Einheit vom {date}",
    racingFile: "Rennen gegen {name}",
    ghostYour: "deine {date}",
    loadSessionFailed: "Diese Einheit konnte nicht geladen werden",
    paceError: "Gib eine Pace wie 1:52 ein",
    pacingAt: "Pace bei {pace}",
    noSamples:
      "Keine verwertbaren Trainingsdaten in dieser Datei. Versuche eine andere Datei oder prüfe das Format.",
    fileReadError:
      "Diese Datei konnte nicht gelesen werden. Prüfe, ob es ein CSV-, TCX- oder FIT-Export ist.",
    importFailed:
      "Diese Datei konnte nicht importiert werden. Stelle sicher, dass es ein gültiger CSV-, TCX- oder FIT-Export ist.",
    zone1: "Z1 Erholung",
    zone2: "Z2 Ausdauer",
    zone3: "Z3 Tempo",
    zone4: "Z4 Schwelle",
    zone5: "Z5 Max",
    fullMetrics: "Alle Metriken",
    mHrEnding: "HF am Ende",
    mHrRecovery: "HF-Erholung",
    mHrDrop: "HF-Abfall",
    mRestTime: "Ruhezeit",
    mRestDistance: "Ruhedistanz",
    mWeightClass: "Gewichtsklasse",
    mVerified: "Verifiziert",
    mTimezone: "Zeitzone",
    mPrivacy: "Privatsphäre",
    mWattMinutes: "Watt-Minuten",
    provenanceTitle: "Aufzeichnungsherkunft",
    mPmVersion: "PM-Version",
    mFirmware: "Firmware",
    mSerial: "Seriennummer",
    mDevice: "Gerät",
    mSource: "Aufgezeichnet von",
    exrBadge: "EXR-Quelle",
    exrBadgeTitle:
      "Tempo und Leistung wurden von EXR synthetisiert, nicht vom PM5 gemessen. Die Werte sind möglicherweise nicht direkt mit PM-Aufzeichnungen vergleichbar.",
    mErgModel: "Erg-Modell",
    mHrSensor: "HF-Sensor",
    targetsTitle: "Ziele",
    mTargetPace: "Zielpace",
    mTargetWatts: "Zielleistung",
    mTargetRate: "Zielschlagzahl",
    mTargetHrZone: "Ziel-HF-Zone",
    mTargetCalories: "Zielkalorien",
    targetVsActualTitle: "Ziel vs. Ist",
    targetHit: "Im Ziel",
    targetMiss: "Daneben",
    workRestTitle: "Arbeit : Ruhe",
    workRestRatio: "Arbeit pro Ruhesekunde",
    thCalories: "kcal",
    thWattMin: "W·min",
    thIntervalType: "Typ",
    thRest: "Ruhe",
    thRestYes: "Ruhe",
    verifiedYes: "Verifiziert",
    verifiedNo: "Nicht verifiziert",
    weightHeavy: "Schwergewicht",
    weightLight: "Leichtgewicht",
    intervalTypeTime: "Zeit",
    intervalTypeDistance: "Distanz",
    intervalTypeCalorie: "Kalorien",
    intervalTypeWattminute: "Watt-Minute",
    removeGhost: "Gegner entfernen",
    racingAgainst: "Rennen gegen: {name}",
    compareAction: "Vergleichen",
    legendTitle: "Legende",
    legendGhost: "Geist",
    kbTitle: "Tastaturkürzel",
    kbSpaceHint: "abspielen / pausieren",
    kbArrowHint: "spulen ±10 s",
    kbArrowShiftHint: "spulen ±30 s",
    kbBracketHint: "Geschwindigkeit ändern",
    kbHomeHint: "zum Anfang zurücksetzen",
  },
  inspector: {
    toggle: "Feld-Inspektor",
    toggleOn: "Feld-Inspektor ausblenden",
    panelLabel: "Rohdaten-Feld-Inspektor",
    sectionWorkout: "Workout",
    sectionProvenance: "Herkunft",
    sectionPerStroke: "Pro Schlag",
    colField: "Feld",
    colAsLogged: "Wie geloggt",
    colNormalized: "Normalisiert",
    derived: "abgeleitet",
    noStrokeData: "Kein Schlag-Sample zu diesem Zeitpunkt.",
    tableLabel: "Schlagweise Feldanzeige",
    staticSport: "Sport",
    staticDistance: "Distanz",
    staticTime: "Zeit",
    staticDrag: "Luftwiderstand",
    staticType: "Workout-Typ",
    staticResolution: "Auflösung",
    fieldT: "Zeit (Zehntelsekunden)",
    fieldD: "Distanz (Dezimeter)",
    fieldP: "Pace (Zehntel)",
    fieldSpm: "Schlagfrequenz",
    fieldHr: "Herzfrequenz",
    fieldWatts: "Leistung (abgeleitet)",
    fieldProgress: "Fortschritt",
    fieldSplit: "Split-Index",
    fieldInterval: "Intervall-Index",
    fieldDps: "Distanz pro Schlag",
    metaPm: "PM-Version",
    metaFirmware: "Firmware",
    metaErg: "Erg-Modell",
    metaHrSensor: "HF-Sensor",
    metaSource: "Quell-App",
    metaSerial: "Seriennummer",
    metaDevice: "Gerät",
  },
  drift: {
    toggle: "Effizienzdrift anzeigen",
    toggleOn: "Effizienzdrift ausblenden",
    baseline: "Eröffnungs-Baseline",
    fade: "Effizienzverlust",
    unit: " m/Schlag",
    summaryTitle: "Schlaglängen-Drift",
    summaryHint: "DPS-Änderung vom Eröffnungssegment bis zum Schluss",
    axisLabel: "DPS",
  },
  settings: {
    title: "Konto & Daten",
    eyebrow: "Deine Daten",
    dataTitle: "So werden deine Daten behandelt",
    dataNote:
      "rowplay liest deine Concept2-Workouts bei jedem Besuch live von der Concept2-API. Dein Anmelde-Token wird in einem sicheren Browser-Cookie gespeichert — nicht auf einem Server. Abmelden löscht ihn.",
    factWorkouts: "{n} Workouts zum Export verfügbar",
    factDemo: "Demo-Modus — nur Beispieldaten, nichts wird persistiert.",
    factCache:
      "Workout-Daten werden live von der Concept2-API abgerufen — kein serverseitiger Cache.",
    factSession:
      "Dein Login bleibt in einem sicheren Browser-Cookie. Keine Daten leben auf unseren Servern.",
    exportTitle: "Logbuch exportieren",
    exportNote:
      "Lade deinen vollständigen Verlauf als CSV oder JSON herunter. TCX pro Workout (Schlagdaten) öffnet sich in Garmin, Strava oder TrainingPeaks.",
    exportCsv: "CSV herunterladen",
    exportJson: "JSON herunterladen",
    exportTcxNote: "TCX-Export (pro Workout mit Schlagdaten):",
    exportTcx: "Workout #{id} · TCX",
    syncTitle: "Logbuch erneut synchronisieren",
    syncNote:
      "Inkrementeller Sync holt Workouts seit deinem letzten Sync. Vollständiger Re-Sync lädt deinen gesamten Verlauf neu (langsamer, nach Problemen nutzen).",
    syncIncremental: "Inkrementeller Sync",
    syncFull: "Vollständiger Re-Sync",
    loadFullHistory: "Vollständige Historie laden",
    syncDemo:
      "Sync ist im Demo-Modus nicht verfügbar — verbinde dein Logbuch, um echte Daten zu synchronisieren.",
    lastSync: "{total} Workouts gecacht · letzter Sync {date}",
    neverSynced: "nie",
    deleteTitle: "Gecachte Daten löschen",
    deleteNote:
      "Entfernt deine gecachten Workouts und Replay-Details aus rowplay und meldet dich ab. Dein Concept2-Logbuch bleibt unberührt.",
    deleteAction: "Meine gecachten Daten löschen",
    deleteConfirm:
      "Alle gecachten Workouts und Replay-Daten aus rowplay löschen und abmelden? Dein Concept2-Logbuch wird nicht geändert.",
    deleteDemo: "Demo-Modus — nichts wurde gespeichert, es gibt nichts zu löschen.",
    deleteDone: "Gecachte Daten gelöscht. Du wurdest abgemeldet.",
    deleteFailed: "Gecachte Daten konnten nicht gelöscht werden",
    timezoneTitle: "Heimatzeitzone",
    timezoneNote:
      "Wähle deine lokale Zeitzone, damit Training nahe Mitternacht auf dem richtigen Kalendertag erscheint.",
    timezoneLabel: "Heimatzeitzone",
    timezoneSaved: "Zeitzone gespeichert",
    timezoneUtcDefault: "UTC (Standard)",
    timezoneGroupAmericas: "Amerika",
    timezoneGroupEuropeAfrica: "Europa / Afrika",
    timezoneGroupAsiaPacific: "Asien / Pazifik",
    lastSyncError: "{total} Workouts · letzter Sync fehlgeschlagen: {message}",
    partialCache: "{n} Workouts gecacht · Verlauf wird noch geladen",
    exportPreviewCsv: "CSV: eine Zeile pro Workout, stabile Spaltenreihenfolge (17 Spalten)",
    exportPreviewJson: "JSON: Array mit Schema-Metadaten (Version 1)",
    exportPreviewTcx: "TCX 2.0: Trackpoints pro Schlag, Garmin/Strava-kompatibel",
    noTcxAvailable: "Keine Workouts mit Schlagdaten für TCX-Export vorhanden.",
  },
  token: {
    title: "Dein Concept2-Token verwenden",
    introBefore: "Füge dein persönliches API-Token aus dem Concept2-Logbuch ein (",
    introLink: "Profil bearbeiten → Anwendungen",
    introAfter:
      "). Das Token wird über HTTPS gesendet, validiert und nur in einem sicheren Browser-Cookie gespeichert — nie auf einem Server.",
    trustTitle: "Wie rowplay das Token behandelt",
    trustAccessTitle: "Zugriff:",
    trustAccessBody:
      "ein persönliches Concept2-Token authentifiziert dich; rowplay nutzt es nur zum Lesen von Profil, Workouts und Schlagdaten.",
    trustStoredTitle: "Speicherung:",
    trustStoredBody:
      "das validierte Token wird in einem sicheren Browser-Cookie gespeichert — nicht in localStorage oder auf einem Server.",
    trustDisconnectTitle: "Trennen:",
    trustDisconnectBody: "Der Abmelden-Knopf in der Kopfzeile entfernt Token und Sitzung.",
    trustCacheTitle: "Daten:",
    trustCacheBody:
      "Workout-Daten werden bei jeder Anfrage live von der Concept2-API abgerufen — nichts wird serverseitig gespeichert.",
    apiToken: "API-Token",
    placeholder: "Token einfügen",
    connect: "Mit Token verbinden",
    connecting: "Verbinden…",
    rejected: "Concept2 hat dieses Token abgelehnt. Prüfe es und versuche es erneut.",
    serverUnavailable:
      "Concept2 ist nicht erreichbar. Die Server sind möglicherweise vorübergehend nicht verfügbar. Bitte versuche es später erneut.",
    serverMisconfigured:
      "Diese Installation ist nicht für die Token-Anmeldung eingerichtet (SESSION_SECRET fehlt). Wende dich an den Betreiber.",
    empty: "Füge dein Concept2-API-Token ein.",
    preferBefore: "Lieber der Standardweg? ",
    preferLink: "Concept2 verbinden",
  },
  comparability: {
    blockedTitle: "Nicht vergleichbare Workouts",
    guidance:
      "Wähle zwei Workouts auf demselben Gerät, mit demselben Stücktyp und in derselben Distanz- oder Dauerband.",
    noComparableCandidates: "Keine vergleichbaren Einheiten gefunden.",
    groupComparable: "Vergleichbar",
    groupIncomparable: "Sonstige (nicht vergleichbar)",
    reason: {
      crossSport: "Diese Workouts sind auf verschiedenen Geräten.",
      crossAxis: "Eines ist ein Distanzstück, das andere ein Zeitstück.",
      crossBand: "Diese Workouts liegen in verschiedenen Distanz- oder Dauerbändern.",
    },
  },
  compare: {
    title: "Workouts vergleichen",
    lead: "Statistiken nebeneinander und überlagerte Charts für beliebige zwei Einheiten.",
    back: "Zurück zum Dashboard",
    workoutA: "Workout A",
    workoutB: "Workout B",
    choose: "Wählen…",
    run: "Vergleichen",
    swap: "Tauschen",
    pickTwo: "Wähle oben zwei Workouts zum Vergleichen.",
    deltaTable: "Direktvergleich",
    deltaHint: "Positives Delta bedeutet, Workout A ist höher.",
    alignedNote: "Ausgerichtet über {distance}",
    noStrokeData: "Keine Schlagdaten für Overlay-Charts verfügbar.",
    winnerA: "Workout A gewinnt",
    winnerB: "Workout B gewinnt",
    tie: "Unentschieden",
    verdictTimeA: "Workout A war {seconds}s schneller",
    verdictTimeB: "Workout B war {seconds}s schneller",
    verdictPaceA: "Workout A war {delta} schneller",
    verdictPaceB: "Workout B war {delta} schneller",
    statTime: "Zeit",
    statPace: "Pace",
    statAvgPower: "Ø Power",
    statBest5sPower: "Beste 5s-Power",
    statAvgHr: "Ø HF",
    statDps: "Dist/Schlag",
    statConsistency: "Konstanz",
    statMetric: "Metrik",
    statDelta: "Δ (A − B)",
    repTimeDelta: "Zeit-Δ",
    vsDistance: "vs. Distanz",
    intervalTitle: "Intervallvergleich",
    intervalHint: "Pace- und Zeit-Deltas pro Wiederholung.",
  },
} as const;
