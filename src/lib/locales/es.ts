export const es = {
  liveMode: {
    title: "Modo en vivo",
    enabled: "Sincronizar automáticamente los entrenamientos nuevos",
    enabledHint: "Consultar el cuaderno en el intervalo elegido",
    interval: "Intervalo de consulta",
    intervalSec: "{n} s",
    intervalMin: "{n} min",
    lastPollLabel: "Última comprobación",
    nextPollLabel: "Próxima comprobación",
    polling: "Buscando entrenamientos nuevos…",
    sound: "Sonido de notificación",
    soundHint: "Reproducir un tono suave cuando aparezca un entrenamiento nuevo",
    newWorkout: "Entrenamiento nuevo — {distance} · {time} · {sport}",
    newWorkouts: "{count} entrenamientos nuevos sincronizados",
    view: "Ver",
    error: "Falló la sincronización en vivo",
    errorRetry: "Se reintentará automáticamente",
    rateLimit: "Límite de frecuencia alcanzado — reduciendo las consultas",
    reauth: "Sesión caducada — inicia sesión de nuevo",
    recovered: "Sincronización en vivo reanudada",
    warning: "La sincronización en vivo ha fallado {count} veces seguidas",
  },
  annotations: {
    title: "Notas del entrenador",
    addNote: "Añadir nota",
    editNote: "Editar nota",
    deleteNote: "Eliminar",
    saveNote: "Guardar",
    cancelNote: "Cancelar",
    addPlaceholder: "¿En qué debería centrarse el atleta en este momento?",
    noNotes:
      "Aún no hay notas del entrenador. Arrastra el control hasta un momento y añade una nota.",
    confirmDelete: "¿Eliminar esta nota?",
    seekTo: "Ir a {time}",
    timestampLabel: "en",
    pinnedTo: "Fijada en",
    saveError: "No se pudo guardar la nota. Inténtalo de nuevo.",
    deleteError: "No se pudo eliminar la nota. Inténtalo de nuevo.",
  },
  leaderboard: {
    title: "Clasificaciones",
    lead: "Compite contra los fantasmas de otros atletas de rowplay en la misma serie. Elige un deporte y una distancia estándar para ver la clasificación.",
    sport: "Deporte",
    distance: "Distancia",
    rank: "Puesto",
    athlete: "Atleta",
    time: "Tiempo",
    pace: "Ritmo",
    gap: "Diferencia",
    actions: "Acciones",
    you: "Tú",
    athletes: "{n} atletas",
    open: "Abrir",
    race: "Competir",
    raceHint: "«Competir» prepara a un rival como fantasma en tu propio replay de esta serie.",
    empty: "Aún no hay registros en esta tabla — sé el primero en publicar un resultado.",
    publish: "Publicar en la clasificación",
    publishing: "Publicando…",
    publishOk: "Publicado — eres el puesto {rank} en {sport} {distance}.",
    publishOffBoard:
      "Solo se pueden publicar series de distancia estándar (500 m, 1k, 2k, 5k, 6k, 10k, media).",
    publishFailed: "No se pudo publicar en la clasificación",
    publishNote:
      "Publicar hace público este resultado en la clasificación de rowplay. No cambia nada en tu diario de Concept2.",
    withdraw: "Quitar de la clasificación",
    withdrawing: "Quitando…",
    withdrawOk: "Quitado de la clasificación.",
    withdrawFailed: "No se pudo quitar de la clasificación",
    ghostFallbackToast:
      "No se pudieron cargar las paladas del rival — compitiendo con su ritmo promedio",
  },
  nav: {
    dashboard: "Panel",
    leaderboard: "Clasificaciones",
    docs: "Ayuda",
    settings: "Datos",
    menuOpen: "Abrir menú",
    menuClose: "Cerrar menú",
    skipToContent: "Saltar al contenido",
  },
  common: {
    demoMode: "modo demo",
    replay: "Replay",
    loading: "cargando…",
    tryAgain: "Inténtalo de nuevo.",
    dismiss: "Cerrar",
    notAffiliated: "no afiliado a Concept2",
    tagline: "rowplay · análisis de diario Concept2 y replay en tiempo real",
  },
  sync: {
    loading: "Sincronizando…",
    done: "{added} nuevos · {total} entrenamientos en caché",
    failed: "Error al sincronizar",
    incrementalDone: "Al día — {total} entrenamientos en caché",
    retry: "Reintentar sincronización",
    errorBadge: "Error en la última sincronización",
    errorHint: "{message}",
    demoUnavailable:
      "Sincronización no disponible en modo demo — conecta tu diario para sincronizar datos reales.",
    partialWarning:
      "El historial aún se está cargando — los totales y RPs pueden estar incompletos hasta que termine la sincronización.",
    inProgress: "Sincronización en curso…",
    historyWindow: "Mostrando los últimos {months} meses — cargando historial anterior…",
    historyBackfilling: "{total} entrenamientos · historial hasta {date}",
    historyComplete: "Historial completo sincronizado",
  },
  auth: {
    connect: "Conectar Concept2",
    useToken: "Usar un token",
    logout: "Cerrar sesión",
  },
  theme: { toLight: "Cambiar a modo claro", toDark: "Cambiar a modo oscuro" },
  lang: { switch: "Cambiar idioma" },
  pwa: {
    updateAvailable: "Hay una nueva versión de rowplay disponible.",
    reload: "Recargar",
  },
  landing: {
    tagline: "Concept2 · RowErg · SkiErg · BikeErg",
    title1: "Repite tus entrenamientos.",
    title2: "Entiende tus parciales.",
    lead: "rowplay se conecta a tu diario Concept2 y convierte cada resultado en análisis detallados — y un replay en tiempo real que puedes ver palada a palada, con recorrido en vivo y telemetría sincronizada de ritmo, cadencia, potencia y frecuencia cardíaca.",
    exploreDemo: "Explorar la demo →",
    openDashboard: "Abrir el panel →",
    connect: "Conectar tu diario Concept2 →",
    readGuide: "Leer la guía",
    demoNote:
      "Modo demo con datos de ejemplo. Añade un token personal para cargar tu propio diario.",
    feat1Title: "Replay en tiempo real",
    feat1Body:
      "Mira tu ritmo en la pista mientras los indicadores y gráficos se reproducen en sincronía.",
    feat2Title: "Análisis de parciales",
    feat2Body: "Ritmo, cadencia, potencia y HR a lo largo del tiempo — en las tres máquinas.",
    feat3Title: "Rápido en todas partes",
    feat3Body:
      "Servido globalmente desde la red edge de Cloudflare — replays instantáneos, sin esperas.",
    tourEyebrow: "Primer uso",
    tourTitle: "Cuatro cosas que probar",
    tourBody:
      "Empieza por el panel, abre un replay, compite contra un esfuerzo anterior y exporta los datos que quieras revisar fuera.",
    tourDashboard: "Panel: totales, tendencias y PBs",
    tourReplay: "Replay: recorrido e indicadores sincronizados",
    tourGhost: "Ghost racing: persigue un esfuerzo pasado o un ritmo objetivo",
    tourExport: "Exportar: CSV, JSON o TCX",
    tourDismiss: "Cerrar tour inicial",
  },
  docs: {
    title: "Guía de uso",
    description:
      "Cómo usar rowplay: primeros pasos, términos de remo, ritmo y vatios, gráficos, flujos de trabajo, FAQ y solución de problemas.",
    badge: "Docs desde el repositorio",
    openDashboard: "Abrir panel",
    openSource: "Abrir fuente",
    navLabel: "Secciones de la guía de uso",
    contextual: {
      gettingStarted: "¿Nuevo por aquí? Lee la guía de primeros pasos",
      metrics: "¿Qué significan el ritmo, los vatios y la cadencia?",
      charts: "Cómo leer este gráfico",
      troubleshooting: "¿Datos ausentes o confusos? Consulta la solución de problemas",
      workflows: "Descubre cómo funcionan las repeticiones, fantasmas y exportaciones",
    },
    sections: {
      overview: {
        navTitle: "Visión general",
        markdown: `# Guía de uso de rowplay

rowplay convierte tus entrenamientos de remo, esquí y bici indoor en algo que puedes explorar: un panel con totales y tendencias y una reproducción palada a palada.

Funciona con entrenamientos registrados en máquinas Concept2 — el RowErg (remoergómetro), el SkiErg y el BikeErg — y los lee del cuaderno en línea gratuito de Concept2. No necesitas conocer la jerga del remo para empezar: esta guía explica cada término que usa.

## Qué puedes hacer aquí

- **Panel** — totales, tendencias, marcas personales y carga de entrenamiento de un vistazo.
- **Reproducción** — mira cualquier entrenamiento palada a palada, con gráficos sincronizados de ritmo, cadencia, potencia y frecuencia cardiaca.

## Secciones de la guía

- [Primeros pasos](/docs/getting-started) — modo demo y conectar tu cuaderno.
- [Conceptos de remo](/docs/rowing-metrics) — paladas, parciales y los demás términos que encontrarás.
- [Ritmo, parciales y vatios](/docs/pace-splits-watts) — qué significan los números y cómo se relacionan.
- [Gráficos y progreso](/docs/charts-and-progress) — cómo leer los paneles del panel principal.
- [Flujos habituales](/docs/workflows) — reproducir, competir contra una sesión anterior y exportar.
- [FAQ](/docs/faq) — respuestas rápidas sobre cuentas, privacidad y datos.
- [Solución de problemas](/docs/troubleshooting) — datos ausentes, números raros, problemas de pantalla.

> Consejo: rowplay arranca en modo demo con entrenamientos de ejemplo, así que puedes probar todo lo de esta lista antes de conectar una cuenta de Concept2.`,
      },
      gettingStarted: {
        navTitle: "Primeros pasos",
        markdown: `# Primeros pasos

## Prueba primero la demo

rowplay arranca en modo demo: sin ninguna cuenta conectada, todas las páginas se llenan de entrenamientos de ejemplo realistas. Nada de lo que hagas en modo demo toca una cuenta real.

1. Abre el [panel](/dashboard).
2. Elige cualquier entrenamiento de la lista.
3. Pulsa **Reproducir** y prueba los controles de reproducción, pausa, desplazamiento y velocidad.
4. Usa los filtros del panel y abre otra reproducción.

## Conecta tus propios entrenamientos

Tus entrenamientos viven en el cuaderno de Concept2 — el diario en línea gratuito al que las máquinas Concept2 (y la app ErgData) suben los resultados. rowplay lee ese cuaderno mediante un token de acceso personal: un código largo que actúa como una llave de lectura de tus datos.

1. Inicia sesión en tu cuaderno en log.concept2.com.
2. Abre **Edit Profile → Applications** y copia tu token de API personal.
3. De vuelta en rowplay, abre [Usar un token](/auth/token).
4. Pega el token y envíalo.
5. Abre el panel. rowplay obtiene todo tu historial directamente de la API de Concept2.

El token se envía una sola vez por una conexión cifrada y se guarda solo en una cookie protegida del navegador. rowplay no guarda entrenamientos ni tokens en sus servidores.

## Desconectar

Usa el botón **Cerrar sesión** de la cabecera para desconectar. [Datos](/settings) conserva las opciones de exportación y zona horaria. Tu cuaderno de Concept2 nunca se modifica.`,
      },
      rowingMetrics: {
        navTitle: "Conceptos de remo",
        markdown: `# Conceptos de remo

¿Nuevo en el remo indoor — o solo en su vocabulario? Estos son los términos que usa rowplay.

## Las máquinas

- **RowErg** — el remoergómetro de Concept2 («erg» es la abreviatura de ergómetro, una máquina que mide el trabajo).
- **SkiErg** — una máquina de pie que imita el movimiento de bastones del esquí de fondo.
- **BikeErg** — la bicicleta estática de Concept2.

Las tres miden el esfuerzo de la misma manera, por lo que rowplay las muestra con los mismos tipos de números.

## La palada

Una **palada** es un ciclo completo del movimiento — en el RowErg: el empuje de piernas, el tirón y el deslizamiento de vuelta al inicio. Dos números describen tus paladas:

- **Cadencia (spm)** — paladas por minuto: la rapidez con que repites el movimiento. El remo constante suele estar entre 18 y 30 spm.
- **Distancia por palada (DPS)** — cuántos metros te da cada palada. Más alto suele significar una palada más potente y eficiente.

Una cadencia alta no significa automáticamente más velocidad: 20 paladas fuertes por minuto pueden moverte más rápido que 30 apresuradas.

## Distancia y tiempo

La máquina convierte tu esfuerzo en **metros**, como si movieras un bote (o esquís, o una bici) por un recorrido. Los entrenamientos son por distancia («rema 2000m») o por tiempo («rema 30 minutos»). Un **entrenamiento por intervalos** divide la pieza en repeticiones con descanso entre medias — por ejemplo, 4 × 500m.

## Ritmo y parciales

El **ritmo** es cuánto tardas en cubrir una distancia fija — 500 metros en el RowErg y el SkiErg, 1000 metros en el BikeErg. Un **parcial** (split) es tu ritmo en un segmento del entrenamiento. Estos dos son el corazón del entrenamiento en ergómetro, así que tienen [su propia página](/docs/pace-splits-watts).

## Frecuencia cardiaca

Si llevas una banda o un reloj de pulso conectados a la máquina o a la app ErgData, los latidos por minuto (**bpm**) aparecen junto a los demás números y tienen su propio gráfico en la reproducción.`,
      },
      paceSplitsWatts: {
        navTitle: "Ritmo, parciales y vatios",
        markdown: `# Ritmo, parciales y vatios

Estos son los números en torno a los que gira el entrenamiento en ergómetro. rowplay lo calcula todo por ti — pero saber qué significan hace que cada gráfico sea más fácil de leer.

## Ritmo: tiempo por 500m

El ritmo responde a la pregunta: «a esta velocidad, ¿cuánto tardaría en recorrer 500 metros?». Se escribe como una hora de reloj — **2:05** significa 2 minutos y 5 segundos por 500m.

- **Más bajo es más rápido.** 1:55 es un ritmo más rápido que 2:05.
- En los gráficos, mejorar el ritmo significa que la línea baja **hacia abajo**.
- **El ritmo del BikeErg es por 1000m**, no por 500m, porque las bicis son más rápidas. rowplay lo gestiona automáticamente — no te sorprendas de que los ritmos de bici se parezcan a los de remo.

## Parciales

Un parcial es tu ritmo medio en un tramo del entrenamiento — cada 500m de una pieza de 2000m, o cada intervalo de una sesión de intervalos. Comparar parciales muestra cómo repartiste el esfuerzo: parciales iguales, un bajón al final o un cierre rápido (un «parcial negativo» significa que cada parcial es más rápido que el anterior).

## Vatios

Los vatios miden tu potencia — la misma unidad que una bombilla. Donde el ritmo te dice el resultado, los vatios te dicen el trabajo. Son dos vistas del mismo esfuerzo: mantener unos 2:00/500m exige alrededor de 200 vatios, y las pequeñas mejoras de ritmo piden desproporcionadamente más potencia — pasar de 2:00 a 1:54 cuesta unos 30 vatios más.

El remo constante puede situarse entre 100 y 250 vatios según la forma física; los sprints pueden dispararse mucho más.

## La cadencia no es esfuerzo

La cadencia (spm) dice con qué frecuencia das paladas, no con qué fuerza. Dos remeros pueden mantener ambos un ritmo de 2:00 — uno a 22 paladas fuertes por minuto, otro a 28 más ligeras. Mirar el ritmo **y** la cadencia juntos (la reproducción muestra ambos) revela la técnica: el mismo ritmo con menos cadencia significa más distancia por palada.

## Dónde ver todo esto

- El **panel** muestra el ritmo medio, los totales y las marcas personales entre entrenamientos.
- La **reproducción** grafica ritmo, cadencia, vatios y frecuencia cardiaca durante todo el entrenamiento, sincronizados con la reproducción.
- La **comparación por repeticiones** de una reproducción divide los entrenamientos por intervalos en barras, parcial a parcial.`,
      },
      chartsAndProgress: {
        navTitle: "Gráficos y progreso",
        markdown: `# Gráficos y progreso

El panel convierte tu historial en un conjunto de paneles. Esta página explica cómo leerlos.

## Tendencia en el tiempo

El gráfico de tendencia sigue una métrica — ritmo, distancia, cadencia o distancia por palada — a lo largo de semanas de entrenamientos. Para ser justo, las tendencias de ritmo comparan **igual con igual**: un sprint y un remo largo y constante nunca se mezclan en una misma línea. Los entrenamientos se agrupan en bandas de distancia, y tú eliges la banda que inspeccionar.

- Para el **ritmo**, hacia abajo es mejor (menos tiempo por 500m).
- Una línea de veredicto sobre el gráfico resume la dirección: mejorando, estable o empeorando.
- Una banda necesita al menos dos sesiones antes de poder dibujar una tendencia.

## Marcas personales

El panel de marcas sigue tus mejores resultados en distancias estándar (500m, 1k, 2k, 5k, 6k, 10k y más). Asegúrate de que una sincronización completa ha terminado antes de fiarte de las mejores marcas históricas — ve a la [solución de problemas](/docs/troubleshooting).

## Calendario de entrenamiento e intensidad

El calendario sombrea cada día según cuánto entrenaste, de modo que las rachas y los huecos saltan a la vista. La vista de intensidad muestra cómo se reparte tu entrenamiento entre trabajo suave y duro.

## Forma física, fatiga y frescura

El panel de frescura estima tres curvas a partir de tu carga de entrenamiento: **forma física** (el trabajo acumulado a largo plazo), **fatiga** (el cansancio a corto plazo de las sesiones recientes) y **frescura** (forma menos fatiga — tu disposición de hoy). Entrenar duro sube la forma y la fatiga a la vez; descansar baja la fatiga más rápido que la forma, y por eso la frescura alcanza su pico tras un tramo suave.

## Potencia crítica

El panel de potencia crítica estima la mayor potencia que podrías sostener en un esfuerzo largo, calculada a partir de tus propios mejores resultados. Alimenta el predictor de ritmo — una estimación de lo que podrías mantener en una distancia que hace tiempo que no compites.

## Eficiencia de palada (DPS)

El gráfico de DPS sigue los metros ganados por palada. El conmutador normalizado por ritmo elimina el efecto de simplemente remar más fuerte, de modo que lo que queda se acerca a la técnica pura. Usa la media de 7 días para la forma reciente y la de 28 días para la visión de conjunto.`,
      },
      workflows: {
        navTitle: "Flujos habituales",
        markdown: `# Flujos habituales

## Reproducir un entrenamiento

Abre cualquier entrenamiento desde el panel y pulsa **Reproducir**.

- **Reproducir / pausar** controla la reproducción; la vista del recorrido y todos los indicadores se mantienen sincronizados.
- **Desplázate** por la línea de tiempo para saltar a cualquier momento.
- La **velocidad** ejecuta la reproducción de 0,5× a 8× el tiempo real.
- Cambia entre vistas del recorrido en **2D y 3D** (la 3D necesita un navegador razonablemente moderno).
- Define un **ritmo objetivo** para dibujar una línea de referencia en el gráfico de ritmo.

El atleta se anima a la cadencia real del entrenamiento — una palada (o impulso de bastones, o pedalada) por cada palada registrada, con salpicaduras en cada ataque — y se acelera junto con la velocidad de reproducción. En 3D, el atleta usa un cuerpo segmentado a escala humana con equipación específica del deporte, de modo que la postura se lee como la de un deportista en un ergómetro y no como un marcador de juguete. Las manos y los pies quedan apoyados en el equipo correcto: mangos y reposapiés de remo, empuñaduras y botas de SkiErg, o manillar y pedales de BikeErg. La superficie del recorrido también cambia por deporte: RowErg muestra calles de agua en capas, SkiErg muestra surcos de nieve pisada y BikeErg muestra una pista de asfalto/velódromo con bordillos, marcas de carril y barras de velocidad. La cámara de seguimiento se mantiene lo bastante cerca para que la posición del cuerpo importe y abre ligeramente el objetivo cuando el bote va más rápido.

En 3D, el selector de **Calidad** elige gráficos bajos, medios, altos o ultra. Ultra requiere WebGPU; en dispositivos solo con WebGL se queda en alto. Si el dispositivo no mantiene una tasa de cuadros fluida, el renderizador baja automáticamente primero la resolución y después los efectos. La animación del replay respeta el ajuste de movimiento reducido del sistema operativo.

Se usan datos por palada cuando Concept2 los proporciona. Los entrenamientos sin paladas vuelven a un replay basado en splits, así que el recorrido se sigue reproduciendo.

## Correr contra un fantasma

Un fantasma es un esfuerzo pasado que rema a tu lado en pantalla.

1. Abre uno de tus entrenamientos en Reproducción.
2. Elige una sesión anterior comparable en los controles de fantasma.
3. El esfuerzo anterior aparece como una segunda embarcación a perseguir.

También puedes competir contra tus propios resultados anteriores para ver exactamente dónde un intento de marca personal ganó o perdió tiempo.

## Exportar

[Datos](/settings) descarga tu cuaderno en directo como CSV o JSON, además de TCX por entrenamiento con datos de paladas.

## Mantener los datos al día

Los datos del panel y de reproducción se obtienen en directo de Concept2. **Modo en vivo** también puede consultar el cuaderno y avisar de un entrenamiento nuevo.`,
      },
      faq: {
        navTitle: "FAQ",
        markdown: `# FAQ

## ¿Necesito una cuenta de Concept2?

No para curiosear — el modo demo funciona sin ella. Para ver tus propios entrenamientos necesitas una cuenta gratuita del cuaderno de Concept2, que es donde la máquina (o la app ErgData) guarda tus resultados.

## ¿Está seguro mi token de acceso?

El token se transmite una sola vez por HTTPS y se sella en una cookie httpOnly protegida del navegador. Nunca se almacena en los servidores de rowplay. Desconectar lo borra.

## ¿Pueden otras personas ver mis entrenamientos?

No — tu panel y tus reproducciones son privados por defecto. Puedes publicar opcionalmente un resultado en una clasificación o compartir un enlace de replay, pero nada es público a menos que tú decidas hacerlo.

## ¿rowplay cambia mi cuaderno de Concept2?

Nunca. rowplay solo lee y no modifica la entrada original del cuaderno.

## ¿Qué máquinas están soportadas?

RowErg, SkiErg y BikeErg. El ritmo se muestra por 500m en remo y esquí y por 1000m en la bici.

## ¿Por qué algunos entrenamientos no tienen reproducción palada a palada?

No todas las entradas del cuaderno incluyen datos por palada — depende de cómo se registró el entrenamiento. Esos entrenamientos se reproducen igualmente usando sus parciales, solo que con menos puntos de datos.

## ¿Puedo usar rowplay en el móvil?

Sí — toda la app, incluidas las reproducciones, funciona en navegadores móviles, y puedes instalarla en tu pantalla de inicio como una app.

## ¿Qué idiomas hay disponibles?

English, Deutsch, Español, Français, 日本語 y 中文 — se cambian desde la cabecera (tras el botón de menú en el móvil).`,
      },
      troubleshooting: {
        navTitle: "Solución de problemas",
        markdown: `# Solución de problemas

## Mis totales o marcas personales parecen incorrectos

Recarga el panel para obtener el historial más reciente de Concept2 y confirma que el entrenamiento aparece en tu cuaderno de Concept2.

## Un ritmo parece muy desviado

- **Los ritmos del BikeErg son por 1000m**, no por 500m — un ritmo de 2:00 en bici no es la misma velocidad que un 2:00 remando.
- Los entrenamientos por intervalos informan del ritmo de los intervalos de trabajo; los descansos no cuentan.

## El gráfico de tendencia pide más sesiones

Las tendencias comparan distancias similares, así que necesitan al menos dos sesiones en la misma banda de distancia. Registra otro entrenamiento parecido y la tendencia aparecerá.

## Un entrenamiento no tiene gráficos de paladas

Esa entrada del cuaderno no tiene datos por palada — algo común en resultados antiguos y algunos métodos de registro. La reproducción recurre a los parciales. Los paneles que dependen de paladas (distancia por palada, comparación por palada) necesitan esos datos y lo indican cuando faltan.

## Falta la frecuencia cardiaca

El cuaderno solo tiene pulso cuando había una banda o un reloj conectados durante el entrenamiento. Confirma que el entrenamiento de origen lo incluye en Concept2.

## La sincronización falla o la sesión caduca

Los tokens personales pueden caducar o revocarse. Vuelve a conectarte en [Usar un token](/auth/token) con un token nuevo de tu perfil de Concept2. Si se hicieron muchas peticiones en poco tiempo, el cuaderno puede limitar el ritmo brevemente — espera un minuto y reintenta.

## Un entrenamiento nuevo no aparece

Confirma primero que el entrenamiento llegó a tu cuaderno de Concept2 (debe subirse desde la máquina o la app ErgData). Después recarga el panel o activa el modo en vivo para consultar automáticamente.

## Problemas de pantalla

- **La reproducción 3D no arranca** — el navegador necesita WebGPU o WebGL; la vista 2D funciona siempre.
- **Los gráficos se ven apretados en el móvil** — gira a horizontal para gráficos más anchos; los paneles se reorganizan en pantallas pequeñas.
- **Tema o idioma equivocados** — ambos conmutadores están en la cabecera (tras el botón de menú en el móvil) y se recuerdan por navegador.

¿Sigues atascado? La [FAQ](/docs/faq) cubre más casos, y todas las páginas de esta guía están accesibles desde **Ayuda** en la cabecera.`,
      },
    },
  },
  dashboard: {
    eyebrow: "Tu diario",
    title: "Resultados y replays",
    all: "Todos",
    sync: "Sincronizar",
    syncing: "Sincronizando…",
    syncedNote: "{total} entrenamientos · última sincronización {date}",
    recentNote:
      "Mostrando entrenamientos recientes — carga todo el historial para obtener PBs y tendencias precisos.",
    latest: "Más reciente",
    distance: "distancia",
    time: "tiempo",
    avgRate: "cad. media",
    distStroke: "dist/palada",
    avgBpm: "lpm media",
    vsAvg: "vs tu media en {sport}",
    sessions: "Sesiones",
    totalDistance: "Distancia total",
    totalTime: "Tiempo total",
    avgPace: "Ritmo medio",
    sectionCoreEyebrow: "Empieza aquí",
    sectionCore: "De un vistazo",
    sectionWorkoutsEyebrow: "Entrenamientos",
    sectionWorkouts: "Buscar un replay",
    sectionWorkoutsBody:
      "Filtra y abre entrenamientos sin pasar antes por los paneles de análisis profundo.",
    sectionRecordsEyebrow: "Objetivos",
    sectionRecords: "Objetivos, insignias y PBs",
    sectionRecordsBody:
      "Objetivos de temporada, hitos, mejores marcas estándar y predicciones quedan juntos.",
    sectionAdvancedEyebrow: "Análisis",
    sectionAdvanced: "Análisis avanzado",
    sectionAdvancedBody:
      "Modelo de potencia, carga de entrenamiento, eficiencia de palada y tendencias largas para revisar a fondo.",
    sectionPower: "CP/W′ y frescura",
    sectionPowerBody: "Potencia crítica, ritmo sostenible y balance de carga desde tu historial.",
    sectionTraining: "Forma del entrenamiento",
    sectionTrainingBody:
      "Calendario, intensidad y tendencias para ver cómo se distribuye el trabajo.",
    sectionStroke: "Eficiencia de palada y desglose por máquina",
    sectionStrokeBody: "Tendencia DPS y resúmenes por máquina para contexto técnico y de ritmo.",
    tour: {
      eyebrow: "Guía demo",
      title: "Prueba esto primero",
      body: "Estas pistas son opcionales y quedan cerradas en este navegador.",
      dismissHint: "Cerrar {title}",
      latestReplay: {
        title: "Reproducir el último entrenamiento",
        body: "Abre la pieza demo más reciente y pulsa play.",
        action: "Abrir replay",
      },
      criticalPower: {
        title: "Revisar CP/W′",
        body: "Mira el modelo de potencia sostenible y el predictor de ritmo.",
        action: "Ir al panel",
      },
      workoutFilters: {
        title: "Usar filtros",
        body: "Acota la lista por distancia, etiquetas, datos de palada o ritmo.",
        action: "Probar filtros",
      },
      leaderboardGhost: {
        title: "Competir contra un ghost",
        body: "Abre una tabla estándar y usa Race para preparar un rival.",
        action: "Abrir leaderboard",
      },
    },
    pbTitle: "Mejores marcas · distancias estándar",
    bySport: "Por deporte",
    thSport: "Deporte",
    thSessions: "Sesiones",
    thDistance: "Distancia",
    thTime: "Tiempo",
    thAvgPace: "Ritmo medio",
    thBestPace: "Mejor ritmo",
    trendTitle: "Tendencia en el tiempo",
    likeForLike: "{sport}, misma distancia",
    mPace: "Ritmo",
    mDistStroke: "Dist/palada",
    mDistance: "Distancia",
    mRate: "Cadencia",
    holdingSteady: "Estable — {metric} plano en {days} días",
    improving: "Mejorando — {change} en {days} días",
    slipping: "Bajando — {change} en {days} días",
    faster: "{delta} más rápido",
    slower: "{delta} más lento",
    emptyTrend: "Solo {n} sesión en este rango — registra otro {band} para ver la tendencia.",
    dpsTrend: {
      title: "Eficiencia de palada (DPS)",
      raw: "DPS bruto",
      normalised: "Normalizado por ritmo",
      ma7: "Media 7 días",
      ma28: "Media 28 días",
      yLabel: "m/palada",
      empty: "No hay datos de conteo de paladas",
      tooltipPace: "Ritmo medio",
      tooltipDps: "DPS",
    },
    calTitle: "Calendario de entrenamiento",
    calMetricDistance: "Metros",
    calMetricTime: "Tiempo",
    calActiveDays: "{n} días activos",
    calCurrentStreak: "Racha de {n} días",
    calLongestStreak: "Máxima: {n} días",
    calLess: "Menos",
    calMore: "Más",
    calTooltip: "{date} · {sessions} sesiones · {volume}",
    calEmpty: "{date} · sin entrenamiento",
    calAria: "Calendario de entrenamiento, {active} días activos, racha actual de {streak} días",
    calDowSun: "Dom",
    calDowMon: "Lun",
    calDowTue: "Mar",
    calDowWed: "Mié",
    calDowThu: "Jue",
    calDowFri: "Vie",
    calDowSat: "Sáb",
    tid: {
      title: "Intensidad de entrenamiento",
      time: "Tiempo",
      distance: "Distancia",
      period4w: "Últimas 4 semanas",
      period3m: "Últimos 3 meses",
      period12m: "Últimos 12 meses",
      empty: "Sin entrenamientos en este periodo",
      zone: {
        UT2: "UT2 — Recuperación",
        UT1: "UT1 — Aeróbico",
        AT: "AT — Umbral",
        TR: "TR — Ritmo de carrera",
        AN: "AN — Anaeróbico",
        Easy: "Fácil",
        Moderate: "Moderado",
        Hard: "Duro",
      },
    },
    formTitle: "Forma y frescura",
    formAdvanced: "Análisis avanzado",
    formSub: "Carga de entrenamiento en todas las máquinas, escalada a tu propia potencia umbral.",
    formFitness: "Forma",
    formFatigue: "Fatiga",
    formForm: "Estado",
    formFitnessHint: "Carga de 42 días (CTL)",
    formFatigueHint: "Carga de 7 días (ATL)",
    formFormHint: "forma − fatiga (TSB)",
    formFtp: "Potencia umbral",
    formCp: "Potencia crítica",
    formModelled: "modelada",
    formEstimated: "estimada",
    formRamp: "Subida de forma en 7 días",
    formChartFitness: "Forma",
    formChartFatigue: "Fatiga",
    formChartForm: "Estado",
    formEmpty:
      "Registra más sesiones durante un par de semanas para mostrar tu gráfico de forma y frescura.",
    bandTransition: "Desentrenamiento",
    descTransition: "Muy fresco, pero la forma baja. Hora de meter trabajo.",
    bandFresh: "Fresco",
    descFresh: "Descansado y listo para competir — buena ventana para probarse.",
    bandNeutral: "Neutro",
    descNeutral: "Equilibrado — ni afilado ni muy fatigado.",
    bandProductive: "Productivo",
    descProductive: "Ganando forma con una fatiga sana y manejable.",
    bandOverreaching: "Sobreentrenamiento",
    descOverreaching: "Fatiga elevada. Baja el ritmo y deja que la recuperación alcance.",
    goalsTitle: "Metas de temporada y retos",
    goalsYear: "Meta {year}",
    goalsKindMeters: "Metros",
    goalsKindHours: "Horas",
    goalsTargetMeters: "Objetivo (m)",
    goalsTargetHours: "Objetivo (horas)",
    goalsSave: "Guardar meta",
    goalsSaving: "Guardando…",
    goalsSaved: "Meta guardada",
    goalsSaveFailed: "No se pudo guardar la meta",
    goalsProgress: "{current} / {target}",
    goalsPct: "{pct}% completado",
    goalsOnPace: "En ritmo — proyectado {projected} a fin de año",
    goalsBehind: "Por debajo del ritmo — proyectado {projected} · faltan {needed}",
    goalsStreakCurrent: "Racha de {n} días",
    goalsStreakCurrent_one: "Racha de {n} día",
    goalsStreakLongest: "Máxima: {n} días",
    goalsStreakLongest_one: "Máxima: {n} día",
    goalsDaysSince: "{n} días desde la última sesión",
    goalsDaysSince_one: "{n} día desde la última sesión",
    goalsDaysSinceToday: "Entrenaste hoy",
    goalsWeekly: "{active} de {total} semanas activas",
    badgesTitle: "Insignias",
    badgeMeters100k: "Club 100k",
    badgeMeters500k: "Club 500k",
    badgeMeters1m: "Millón de metros",
    badgeMeters2m: "2 millones de metros",
    badgeMeters5m: "5 millones de metros",
    badgeClub500: "PB club 500 m",
    badgeClub1000: "PB club 1k",
    badgeClub2000: "PB club 2k",
    badgeClub5000: "PB club 5k",
    badgeClub10000: "PB club 10k",
    badgeEverySportWeek: "Semana en todos los deportes",
    pbTag: "PB",
    pbNew: "Nuevo PB",
    pbCelebrate: "¡Nuevo PB en {distance} — {time}!",
    pbCelebrateMore: "¡{count} nuevas mejores marcas!",
    predictor: {
      title: "Predictor de rendimiento",
      distance: "Distancia conocida",
      time: "Tiempo conocido",
      predict: "Predecir",
      colDistance: "Distancia",
      colPredicted: "Predicción",
      colBest: "Tu mejor",
      colStatus: "Estado",
      beaten: "Superado",
      behind: "Por detrás",
      untried: "Sin intentar",
      noTime: "—",
      inputError: "Introduce un tiempo válido (p. ej. 7:04)",
    },
    cpTitle: "Potencia crítica y predictor de ritmo",
    cpSub:
      "Un modelo de potencia de mejor esfuerzo a partir de tus resultados del logbook, con confianza y avisos de datos visibles.",
    cpLabel: "Potencia crítica (CP)",
    cpWPrime: "Capacidad anaeróbica (W′)",
    cpMethod: "Método de ajuste",
    cpExplainModel:
      "Modelo de {scope}: CP {cp} W y W′ {wPrime} kJ se ajustan a partir de tus mejores esfuerzos registrados. Trátalo como una estimación de entrenamiento, no como una medición de laboratorio.",
    cpExplainEstimate:
      "Estimación de {scope}: la CP se aproxima a {cp} W desde tu mejor esfuerzo largo. Registra más esfuerzos máximos de duración corta, media y larga para ajustar CP/W′.",
    cpScopeLabel: "Ámbito de potencia crítica",
    cpScopeAll: "Todo",
    cpEmptyScope:
      "Todavía no hay suficientes esfuerzos útiles de {scope}. Añade algunas piezas máximas de distintas duraciones antes de confiar en este modelo.",
    cpConfidenceLabel: "Confianza",
    cpConfidence: { high: "Alta", medium: "Media", low: "Baja", insufficient: "Insuficiente" },
    cpSample: "{n} esfuerzos útiles · {points} puntos de envolvente",
    cpFreshness: "Esfuerzo más reciente {date}",
    cpFit: "Ajuste R² {r2} · residual {residual}%",
    cpWarningsLabel: "Avisos del modelo",
    cpWarning: {
      "too-few-efforts": "Muy pocos esfuerzos máximos",
      "narrow-duration-range": "Rango de duración estrecho",
      "stale-efforts": "El esfuerzo más reciente está desactualizado",
      "mixed-sports": "Deportes mezclados",
      "outlier-sensitive": "Ajuste sensible a valores atípicos",
      "unrealistic-fit": "Ajuste irreal descartado",
      "estimate-only": "Solo estimación",
    },
    cpPredictTitle: "¿Qué puedo aguantar?",
    cpPredictSub:
      "Predicciones de ritmo y tiempo final para un solo deporte desde el modelo seleccionado. El ritmo está normalizado a /500m.",
    cpMixedPredictNote:
      "Selecciona un deporte para predicciones de ritmo; la vista de todos los deportes solo muestra potencia.",
    cpModeDuration: "Aguantar durante…",
    cpModeDistance: "Tiempo para…",
    cpHoldFor: "Aguantar durante",
    cpMinutes: "minutos",
    cpDistance: "Distancia",
    cpPaceHint: "Ritmo uniforme de {scope} durante unos {min} minutos",
    cpTimeHint: "Tiempo final previsto de {scope} para {dist}",
    cpPreset6: "6 min",
    cpPreset20: "20 min",
    cpPreset30: "30 min",
    cpPreset60: "60 min",
    cpDist500: "500 m",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "Potencia–duración: tú vs modelo",
    cpChartHint:
      "Los puntos son tus mejores por sesión; la línea es lo que predice CP/W′. Por encima de la línea = superas el modelo.",
    cpChartActual: "Tus mejores",
    cpChartModel: "Modelo CP",
  },
  milestone: {
    title: "Hitos",
    next: "Siguiente",
    lifetime_distance_rower_100k: "100k metros remados",
    "lifetime_distance_rower_100k.toast": "🎉 100k metros remados!",
    lifetime_distance_rower_250k: "250k metros remados",
    "lifetime_distance_rower_250k.toast": "🎉 250k metros remados!",
    lifetime_distance_rower_500k: "500k metros remados",
    "lifetime_distance_rower_500k.toast": "🎉 500k metros remados!",
    lifetime_distance_rower_1M: "1 million metros remados",
    "lifetime_distance_rower_1M.toast": "🎉 1 million metros remados!",
    lifetime_distance_rower_2M: "2 million metros remados",
    "lifetime_distance_rower_2M.toast": "🎉 2 million metros remados!",
    lifetime_distance_rower_5M: "5 million metros remados",
    "lifetime_distance_rower_5M.toast": "🎉 5 million metros remados!",
    lifetime_distance_rower_10M: "10 million metros remados",
    "lifetime_distance_rower_10M.toast": "🎉 10 million metros remados!",
    lifetime_distance_skierg_100k: "100k metros SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100k metros SkiErg!",
    lifetime_distance_skierg_250k: "250k metros SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250k metros SkiErg!",
    lifetime_distance_skierg_500k: "500k metros SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500k metros SkiErg!",
    lifetime_distance_skierg_1M: "1 million metros SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 1 million metros SkiErg!",
    lifetime_distance_skierg_2M: "2 million metros SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 2 million metros SkiErg!",
    lifetime_distance_skierg_5M: "5 million metros SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 5 million metros SkiErg!",
    lifetime_distance_skierg_10M: "10 million metros SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 10 million metros SkiErg!",
    lifetime_distance_bike_100k: "100k metros BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100k metros BikeErg!",
    lifetime_distance_bike_250k: "250k metros BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250k metros BikeErg!",
    lifetime_distance_bike_500k: "500k metros BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500k metros BikeErg!",
    lifetime_distance_bike_1M: "1 million metros BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 1 million metros BikeErg!",
    lifetime_distance_bike_2M: "2 million metros BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 2 million metros BikeErg!",
    lifetime_distance_bike_5M: "5 million metros BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 5 million metros BikeErg!",
    lifetime_distance_bike_10M: "10 million metros BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 10 million metros BikeErg!",
    lifetime_distance_combined_100k: "100k metros totales",
    "lifetime_distance_combined_100k.toast": "🎉 100k metros totales!",
    lifetime_distance_combined_250k: "250k metros totales",
    "lifetime_distance_combined_250k.toast": "🎉 250k metros totales!",
    lifetime_distance_combined_500k: "500k metros totales",
    "lifetime_distance_combined_500k.toast": "🎉 500k metros totales!",
    lifetime_distance_combined_1M: "1 million metros totales",
    "lifetime_distance_combined_1M.toast": "🎉 1 million metros totales!",
    lifetime_distance_combined_2M: "2 million metros totales",
    "lifetime_distance_combined_2M.toast": "🎉 2 million metros totales!",
    lifetime_distance_combined_5M: "5 million metros totales",
    "lifetime_distance_combined_5M.toast": "🎉 5 million metros totales!",
    lifetime_distance_combined_10M: "10 million metros totales",
    "lifetime_distance_combined_10M.toast": "🎉 10 million metros totales!",
    session_count_10: "10 entrenamientos",
    "session_count_10.toast": "🎉 10 entrenamientos!",
    session_count_25: "25 entrenamientos",
    "session_count_25.toast": "🎉 25 entrenamientos!",
    session_count_50: "50 entrenamientos",
    "session_count_50.toast": "🎉 50 entrenamientos!",
    session_count_100: "100 entrenamientos",
    "session_count_100.toast": "🎉 100 entrenamientos!",
    session_count_250: "250 entrenamientos",
    "session_count_250.toast": "🎉 250 entrenamientos!",
    session_count_500: "500 entrenamientos",
    "session_count_500.toast": "🎉 500 entrenamientos!",
    session_count_1000: "1000 entrenamientos",
    "session_count_1000.toast": "🎉 1000 entrenamientos!",
    session_count_2500: "2500 entrenamientos",
    "session_count_2500.toast": "🎉 2500 entrenamientos!",
    streak_7d: "Racha de 7 días",
    "streak_7d.toast": "🎉 Racha de 7 días!",
    streak_14d: "Racha de 14 días",
    "streak_14d.toast": "🎉 Racha de 14 días!",
    streak_30d: "Racha de 30 días",
    "streak_30d.toast": "🎉 Racha de 30 días!",
    streak_60d: "Racha de 60 días",
    "streak_60d.toast": "🎉 Racha de 60 días!",
    streak_100d: "Racha de 100 días",
    "streak_100d.toast": "🎉 Racha de 100 días!",
    pb_2k_sub8: "2k bajo 8:00",
    "pb_2k_sub8.toast": "🎉 2k bajo 8:00!",
    pb_2k_sub730: "2k bajo 7:30",
    "pb_2k_sub730.toast": "🎉 2k bajo 7:30!",
    pb_2k_sub7: "2k bajo 7:00",
    "pb_2k_sub7.toast": "🎉 2k bajo 7:00!",
    pb_2k_sub630: "2k bajo 6:30",
    "pb_2k_sub630.toast": "🎉 2k bajo 6:30!",
  },
  workout: {
    tag: {
      label: "Tipo",
      auto: "Detección automática",
      "steady-state": "Estado estable",
      interval: "Intervalos",
      "race-piece": "Pieza de carrera",
      "time-trial": "Contrarreloj",
      "warmup-cooldown": "Calentamiento / enfriamiento",
      unknown: "Otro",
      filter: { all: "Todos los tipos" },
      saveError: "No se pudo guardar la etiqueta — inténtalo de nuevo.",
    },
  },
  workoutList: {
    empty: "No hay entrenamientos con este filtro.",
    windowed: "{n} entrenamientos · más recientes primero",
    filtersTitle: "Buscar entrenamientos",
    matching: "{n} coincidencias",
    clearFilters: "Limpiar filtros",
    expand: "Más filtros",
    collapse: "Menos filtros",
    dateFrom: "Desde",
    dateTo: "Hasta",
    workoutType: "Tipo del logbook",
    anyType: "Cualquier tipo del logbook",
    strokeData: "Datos de palada",
    strokeAny: "Cualquiera",
    strokeYes: "Con datos de palada",
    strokeNo: "Sin datos de palada",
    searchComments: "Buscar en comentarios…",
    search: "Buscar",
    distanceChips: "Distancia",
    durationChips: "Duración",
    durationMin: "{n} min",
    chipMarathon: "Maratón",
    sortGroup: "Ordenar",
    sortDate: "Fecha",
    sortDistance: "Distancia",
    sortTime: "Tiempo",
    sortPace: "Ritmo",
    sortPower: "Potencia",
    pbsOnly: "Solo PBs",
    compare: "Comparar",
    comparePick: "Elige el primer entrenamiento a comparar",
    compareWith: "Comparar con este entrenamiento",
    compareCancel: "Cancelar",
    openReplay: "Abrir replay",
  },
  share: {
    shareReplay: "Compartir replay",
    downloadImage: "Descargar imagen",
    linkCopied: "Enlace de compartir copiado",
    linkReady: "Cualquiera con este enlace puede ver el replay",
    shareFailed: "No se pudo crear el enlace",
    privacyBlocked:
      "Este entrenamiento no es público en Concept2, así que no se puede compartir. Cambia su privacidad a «Everyone» en tu logbook primero.",
    imageSaved: "Tarjeta de carrera guardada",
    imageFailed: "No se pudo guardar la tarjeta de carrera",
    publicBanner: "Replay compartido — solo lectura",
    ctaBefore: "¿Quieres tus propios replays? ",
    ctaLink: "Prueba rowplay",
    ctaAfter: " — análisis del diario Concept2 y replay de entrenamientos.",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "Potencia media",
    raceCardAvgHr: "HR media",
  },
  replay: {
    hrImportTitle: "Importar frecuencia cardíaca",
    hrImportHint:
      "Este entrenamiento no tiene FC del cuaderno. Sube una exportación del reloj (CSV, TCX o FIT) para superponer la frecuencia cardíaca en el replay.",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "Desfase de inicio del reloj",
    hrImportOffsetHint: "Positivo si el reloj se inició antes de empezar a remar (segundos).",
    hrImportPreview: "{count} muestras · ~{avg} bpm de media",
    hrImportApply: "Aplicar frecuencia cardíaca",
    hrImportClear: "Quitar FC importada",
    hrImportApplied: "Frecuencia cardíaca importada",
    hrImportCleared: "Frecuencia cardíaca importada eliminada",
    hrImportTooFew: "Ese archivo tiene muy pocas muestras de frecuencia cardíaca.",
    hrImportSaveFailed: "No se pudo guardar la importación de frecuencia cardíaca",
    hrImportClearFailed: "No se pudo quitar la importación de frecuencia cardíaca",
    back: "Volver al panel",
    moments: {
      title: "Momentos del entrenamiento",
      subtitle: "Fragmentos que vale la pena revisar primero en esta repetición.",
      lowResolution: "basado en parciales",
      jump: "Ir al momento",
      bpm: "lpm",
      "best-sustained": "Mejor tramo sostenido",
      "slower-patch": "Tramo más lento",
      "efficient-rhythm": "Ritmo más eficiente",
      "finish-trend": "Tendencia final",
      "best-rep": "Mejor repetición",
      "slowest-rep": "Repetición más lenta",
      reasonBestSustained: "{delta}% más rápido que la referencia de hoy.",
      reasonSlowerPatch:
        "{delta}% por debajo de la referencia de hoy; revisa ritmo y recuperación.",
      reasonEfficientRhythm: "Buen ritmo sin necesidad de la cadencia máxima.",
      reasonFinishStronger: "El último tercio fue {delta}% más rápido que el primero.",
      reasonFinishFade: "El último tercio perdió {delta}% respecto al primero.",
      reasonFinishSteady: "El último tercio se mantuvo dentro de {delta}% del primero.",
      reasonBestRep: "La repetición {rep} fue {delta}s/500m más rápida que el promedio del set.",
      reasonSlowestRep: "La repetición {rep} fue {delta}s/500m más lenta que el promedio del set.",
    },
    lowRes: "replay en baja resolución",
    compareAgainst: "Comparar contra:",
    none: "Ninguno",
    pastSession: "Una sesión anterior",
    constantPace: "Un ritmo constante",
    uploadedFile: "Un archivo subido",
    moreOptions: "Más opciones",
    moreCompareOptions: "Más opciones de comparación",
    chooseSession: "Elige una sesión de {sport}…",
    setPace: "Fijar ritmo",
    targetPace: "Ritmo objetivo",
    targetPacePlaceholder: "M:SS",
    targetPaceSet: "Fijar ritmo objetivo",
    targetPaceClear: "Borrar",
    targetPaceBand: "Mostrar banda ±5 s",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ {m} m por delante",
    behind: "▼ {m} m por detrás",
    searchSessions: "Buscar sesiones…",
    suggestedRival: "Rival sugerido",
    raceVerdictWinSession:
      "Ganaste a tu {distance} del {date} por {seconds}s (quedaste {m} m por delante en la meta)",
    raceVerdictLoseSession:
      "Tu {distance} del {date} te ganó por {seconds}s (quedaste {m} m por detrás en la meta)",
    raceVerdictWinPace:
      "Ganaste al barco de ritmo {pace} por {seconds}s (quedaste {m} m por delante en la meta)",
    raceVerdictLosePace:
      "El barco de ritmo {pace} te ganó por {seconds}s (quedaste {m} m por detrás en la meta)",
    raceVerdictWinFile: "Ganaste a {name} por {seconds}s (quedaste {m} m por delante en la meta)",
    raceVerdictLoseFile: "{name} te ganó por {seconds}s (quedaste {m} m por detrás en la meta)",
    raceFinished: "Carrera terminada",
    play: "Reproducir",
    pause: "Pausa",
    viewToggle: "Vista del recorrido",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "La vista 3D requiere WebGPU o WebGL en este dispositivo",
    view3dLoading: "Cargando 3D…",
    view3dError: "No se pudo cargar la vista 3D",
    quality: "Calidad",
    qualityLow: "Baja",
    qualityMedium: "Media",
    qualityHigh: "Alta",
    qualityUltra: "Ultra",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "Ritmo",
    gRate: "Cadencia",
    gPower: "Potencia",
    gHeart: "Corazón",
    cPace: "Ritmo",
    cRate: "Cadencia de palada",
    cPower: "Potencia",
    cHeart: "Frecuencia cardíaca",
    strokeQuality: "Calidad de palada",
    avgDistStroke: "dist media / palada",
    avgRate: "cad. media",
    paceVariation: "variación de ritmo",
    paceVariationHint: "(menor = más uniforme)",
    fade: "decaimiento",
    negSplit: "split negativo",
    slowedDown: "se ralentizó",
    distPerStroke: "Distancia por palada",
    distPerStrokeHint: "— mayor = palada más potente",
    paceVsRate: "Ritmo vs cadencia",
    paceVsRateHint: "— encuentra tu cadencia más eficiente",
    powerCurve: "Curva de potencia (mejor media por duración)",
    hrZones: "Zonas de HR (tiempo en zona)",
    intervalBreakdown: "Desglose de intervalos",
    repComparison: "Comparación de repeticiones",
    repComparisonN: "Comparación de repeticiones ({n} reps)",
    repComparisonRep: "Rep {n}",
    repComparisonAvgPace: "med {pace}",
    repComparisonMetricPace: "Ritmo",
    repComparisonMetricRate: "Frecuencia de palada",
    repComparisonMetricPower: "Potencia",
    repComparisonMetricHr: "Frecuencia cardíaca",
    splitBreakdown: "Desglose de parciales",
    segReps: "reps",
    segSplits: "parciales",
    avgRepPace: "ritmo medio por rep",
    avgSplitPace: "ritmo medio por parcial",
    consistency: "regularidad",
    consistencyHint: "(menor = más uniforme)",
    setFade: "decaimiento del set",
    faded: "fundido",
    fastestSlowest: "más rápido → más lento",
    splitsTitle: "Parciales",
    thNum: "#",
    thDist: "Dist",
    thTime: "Tiempo",
    thPace: "Ritmo",
    thRate: "Cad.",
    thHr: "HR",
    workoutDetails: "Detalles del entrenamiento",
    mDate: "Fecha",
    mSport: "Deporte",
    mType: "Tipo",
    mDistance: "Distancia",
    mTime: "Tiempo",
    mAvgPace: "Ritmo medio",
    mAvgRate: "Cadencia media",
    mStrokeCount: "Número de paladas",
    mAvgPower: "Potencia media",
    mAvgHr: "HR media",
    mHrRange: "Rango de HR",
    mCalories: "Calorías",
    mDragFactor: "Factor de arrastre",
    mResolution: "Resolución",
    mSegments: "Segmentos",
    mWorkoutId: "ID del entrenamiento",
    mComments: "Comentarios",
    samples: "muestras",
    perStroke: "por palada",
    fromSplits: "desde parciales",
    intervalsWord: "intervalos",
    splitsWord: "parciales",
    racingSession: "Carrera contra tu sesión del {date}",
    racingFile: "Carrera contra {name}",
    ghostYour: "tu {date}",
    loadSessionFailed: "No se pudo cargar esa sesión",
    paceError: "Introduce un ritmo como 1:52",
    pacingAt: "Ritmo objetivo {pace}",
    noSamples:
      "No hay muestras de entrenamiento utilizables en ese archivo. Prueba con otro archivo o revisa el formato.",
    fileReadError: "No se pudo leer ese archivo. Comprueba que sea una exportación CSV, TCX o FIT.",
    importFailed: "No se pudo importar ese archivo. Asegúrate de que sea un CSV, TCX o FIT válido.",
    zone1: "Z1 Recuperación",
    zone2: "Z2 Resistencia",
    zone3: "Z3 Tempo",
    zone4: "Z4 Umbral",
    zone5: "Z5 Máximo",
    fullMetrics: "Métricas completas",
    mHrEnding: "FC al final",
    mHrRecovery: "Recuperación FC",
    mHrDrop: "Caída FC",
    mRestTime: "Tiempo de descanso",
    mRestDistance: "Distancia de descanso",
    mWeightClass: "Categoría de peso",
    mVerified: "Verificado",
    mTimezone: "Zona horaria",
    mPrivacy: "Privacidad",
    mWattMinutes: "Vatios-minuto",
    provenanceTitle: "Origen del registro",
    mPmVersion: "Versión PM",
    mFirmware: "Firmware",
    mSerial: "Número de serie",
    mDevice: "Dispositivo",
    mSource: "Registrado por",
    exrBadge: "Origen EXR",
    exrBadgeTitle:
      "El ritmo y la potencia fueron sintetizados por EXR, no leídos del PM5. Los números pueden no ser directamente comparables con entrenamientos registrados por PM.",
    mErgModel: "Modelo de erg",
    mHrSensor: "Sensor FC",
    targetsTitle: "Objetivos",
    mTargetPace: "Ritmo objetivo",
    mTargetWatts: "Potencia objetivo",
    mTargetRate: "Cadencia objetivo",
    mTargetHrZone: "Zona FC objetivo",
    mTargetCalories: "Calorías objetivo",
    targetVsActualTitle: "Objetivo vs real",
    targetHit: "En objetivo",
    targetMiss: "Fuera de objetivo",
    workRestTitle: "Trabajo : descanso",
    workRestRatio: "trabajo por segundo de descanso",
    thCalories: "Cal",
    thWattMin: "W·min",
    thIntervalType: "Tipo",
    thRest: "Descanso",
    thRestYes: "Descanso",
    verifiedYes: "Verificado",
    verifiedNo: "No verificado",
    weightHeavy: "Peso pesado",
    weightLight: "Peso ligero",
    intervalTypeTime: "Tiempo",
    intervalTypeDistance: "Distancia",
    intervalTypeCalorie: "Caloría",
    intervalTypeWattminute: "Vatio-minuto",
    removeGhost: "Eliminar fantasma",
    racingAgainst: "Compitiendo contra: {name}",
    compareAction: "Comparar",
    legendTitle: "Leyenda",
    legendGhost: "Fantasma",
    kbTitle: "Atajos de teclado",
    kbSpaceHint: "reproducir / pausar",
    kbArrowHint: "desplazar ±10 s",
    kbArrowShiftHint: "desplazar ±30 s",
    kbBracketHint: "cambiar velocidad",
    kbHomeHint: "volver al inicio",
  },
  inspector: {
    toggle: "Inspector de campos",
    toggleOn: "Ocultar inspector de campos",
    panelLabel: "Inspector de campos en bruto",
    sectionWorkout: "Entrenamiento",
    sectionProvenance: "Procedencia",
    sectionPerStroke: "Por palada",
    colField: "Campo",
    colAsLogged: "Como registrado",
    colNormalized: "Normalizado",
    derived: "derivado",
    noStrokeData: "No hay muestra por palada en este instante.",
    tableLabel: "Lectura de campos por palada",
    staticSport: "Deporte",
    staticDistance: "Distancia",
    staticTime: "Tiempo",
    staticDrag: "Factor de arrastre",
    staticType: "Tipo de entreno",
    staticResolution: "Resolución",
    fieldT: "Tiempo (décimas de s)",
    fieldD: "Distancia (decímetros)",
    fieldP: "Ritmo (décimas)",
    fieldSpm: "Frecuencia",
    fieldHr: "Frecuencia cardiaca",
    fieldWatts: "Potencia (derivada)",
    fieldProgress: "Progreso",
    fieldSplit: "Índice de parcial",
    fieldInterval: "Índice de intervalo",
    fieldDps: "Distancia por palada",
    metaPm: "Versión PM",
    metaFirmware: "Firmware",
    metaErg: "Modelo de erg",
    metaHrSensor: "Sensor FC",
    metaSource: "App de origen",
    metaSerial: "Número de serie",
    metaDevice: "Dispositivo",
  },
  drift: {
    toggle: "Mostrar deriva de eficiencia",
    toggleOn: "Ocultar deriva de eficiencia",
    baseline: "Línea base inicial",
    fade: "Pérdida de eficiencia",
    unit: " m/braz",
    summaryTitle: "Deriva de metros por brazada",
    summaryHint: "Cambio de DPS del segmento inicial al cierre",
    axisLabel: "DPS",
  },
  settings: {
    title: "Cuenta y datos",
    eyebrow: "Tus datos",
    dataTitle: "Cómo se manejan tus datos",
    dataNote:
      "rowplay lee tus entrenamientos de Concept2 en vivo desde la API cada vez que visitas. Tu token de acceso se guarda en una cookie segura del navegador — sin almacenamiento en ningún servidor. Cerrar sesión lo elimina.",
    factWorkouts: "{n} entrenamientos disponibles para exportar",
    factDemo: "Modo demo — solo datos de ejemplo, no se persiste nada.",
    factCache:
      "Los datos de entrenamiento se obtienen en vivo desde la API de Concept2 — sin caché en el servidor.",
    factSession:
      "Tu inicio de sesión se guarda en una cookie segura del navegador. Ningún dato vive en nuestros servidores.",
    exportTitle: "Exportar diario",
    exportNote:
      "Descarga todo tu historial en CSV o JSON. El TCX por entrenamiento (datos de palada) se abre en Garmin, Strava o TrainingPeaks.",
    exportCsv: "Descargar CSV",
    exportJson: "Descargar JSON",
    exportTcxNote: "Exportación TCX (por entrenamiento con datos de palada):",
    exportTcx: "Entrenamiento #{id} · TCX",
    syncTitle: "Volver a sincronizar el diario",
    syncNote:
      "La sincronización incremental obtiene entrenamientos desde tu última sync. La resincronización completa vuelve a descargar todo el historial (más lenta; úsala tras incidencias).",
    syncIncremental: "Sincronización incremental",
    syncFull: "Resincronización completa",
    loadFullHistory: "Cargar historial completo",
    syncDemo:
      "La sincronización no está disponible en modo demo — conecta tu diario para sincronizar datos reales.",
    lastSync: "{total} entrenamientos en caché · última sync {date}",
    neverSynced: "nunca",
    deleteTitle: "Borrar datos en caché",
    deleteNote:
      "Elimina tus entrenamientos en caché y el detalle de replay de rowplay y cierra tu sesión. Tu diario Concept2 no se modifica.",
    deleteAction: "Borrar mis datos en caché",
    deleteConfirm:
      "¿Borrar todos los entrenamientos en caché y datos de replay de rowplay y cerrar sesión? Tu diario Concept2 no cambiará.",
    deleteDemo: "Modo demo — no se guardó nada, no hay nada que borrar.",
    deleteDone: "Datos en caché borrados. Has cerrado sesión.",
    deleteFailed: "No se pudieron borrar los datos en caché",
    timezoneTitle: "Zona horaria principal",
    timezoneNote:
      "Elige tu zona horaria local para que los entrenamientos cerca de medianoche aparezcan en el día correcto del calendario.",
    timezoneLabel: "Zona horaria principal",
    timezoneSaved: "Zona horaria guardada",
    timezoneUtcDefault: "UTC (predeterminado)",
    timezoneGroupAmericas: "Américas",
    timezoneGroupEuropeAfrica: "Europa / África",
    timezoneGroupAsiaPacific: "Asia / Pacífico",
    lastSyncError: "{total} entrenamientos · último sync falló: {message}",
    partialCache: "{n} entrenamientos en caché · historial aún cargándose",
    exportPreviewCsv: "CSV: una fila por entrenamiento, orden de columnas estable (17 columnas)",
    exportPreviewJson: "JSON: array con metadatos de esquema (versión 1)",
    exportPreviewTcx: "TCX 2.0: trackpoints por palada, compatible con Garmin/Strava",
    noTcxAvailable: "No hay entrenamientos con datos de palada para exportar TCX.",
  },
  token: {
    title: "Usar tu token de Concept2",
    introBefore: "Pega tu token API personal del diario Concept2 (",
    introLink: "Editar perfil → Aplicaciones",
    introAfter:
      "). El token se envía por HTTPS, se valida y solo se guarda en una cookie segura del navegador — nunca en un servidor.",
    trustTitle: "Cómo gestiona rowplay el token",
    trustAccessTitle: "Acceso:",
    trustAccessBody:
      "un token personal de Concept2 te autentica; rowplay solo lo usa para leer perfil, entrenamientos y datos de palada.",
    trustStoredTitle: "Almacenamiento:",
    trustStoredBody:
      "el token validado se guarda en una cookie segura del navegador — no en localStorage ni en un servidor.",
    trustDisconnectTitle: "Desconectar:",
    trustDisconnectBody: "el botón Cerrar sesión de la cabecera limpia el token y la sesión.",
    trustCacheTitle: "Datos:",
    trustCacheBody:
      "Los datos de entrenamiento se obtienen en vivo desde la API de Concept2 en cada solicitud — nada se almacena en el servidor.",
    apiToken: "Token API",
    placeholder: "Pega tu token",
    connect: "Conectar con token",
    connecting: "Conectando…",
    rejected: "Concept2 rechazó ese token. Compruébalo e inténtalo de nuevo.",
    serverUnavailable:
      "No se pudo conectar con Concept2. Los servidores pueden no estar disponibles temporalmente. Inténtalo de nuevo más tarde.",
    serverMisconfigured:
      "Esta instalación no está configurada para iniciar sesión con token (falta SESSION_SECRET). Contacta con el propietario del sitio.",
    empty: "Pega tu token API de Concept2.",
    preferBefore: "¿Prefieres el flujo habitual? ",
    preferLink: "Conectar Concept2",
  },
  comparability: {
    blockedTitle: "Entrenamientos no comparables",
    guidance:
      "Elige dos entrenamientos en la misma máquina, del mismo tipo y en la misma banda de distancia o duración.",
    noComparableCandidates: "No hay sesiones comparables.",
    groupComparable: "Comparables",
    groupIncomparable: "Otros (no comparables)",
    reason: {
      crossSport: "Estos entrenamientos son en máquinas distintas.",
      crossAxis: "Uno es pieza a distancia fija; el otro a tiempo fijo.",
      crossBand: "Estos entrenamientos están en bandas de distancia o duración distintas.",
    },
  },
  compare: {
    title: "Comparar entrenamientos",
    lead: "Estadísticas lado a lado y gráficos superpuestos para dos sesiones cualesquiera.",
    back: "Volver al panel",
    workoutA: "Entrenamiento A",
    workoutB: "Entrenamiento B",
    choose: "Elegir…",
    run: "Comparar",
    swap: "Intercambiar",
    pickTwo: "Elige dos entrenamientos arriba para comparar.",
    deltaTable: "Estadísticas cara a cara",
    deltaHint: "Un delta positivo significa que el entrenamiento A es mayor.",
    alignedNote: "Alineado sobre {distance}",
    noStrokeData: "No hay datos de palada para gráficos superpuestos.",
    winnerA: "Gana el entrenamiento A",
    winnerB: "Gana el entrenamiento B",
    tie: "Empate",
    verdictTimeA: "El entrenamiento A fue {seconds}s más rápido",
    verdictTimeB: "El entrenamiento B fue {seconds}s más rápido",
    verdictPaceA: "El entrenamiento A fue {delta} más rápido",
    verdictPaceB: "El entrenamiento B fue {delta} más rápido",
    statTime: "Tiempo",
    statPace: "Ritmo",
    statAvgPower: "Potencia media",
    statBest5sPower: "Mejor potencia 5 s",
    statAvgHr: "HR media",
    statDps: "Dist/palada",
    statConsistency: "Regularidad",
    statMetric: "Métrica",
    statDelta: "Δ (A − B)",
    repTimeDelta: "Δ tiempo",
    vsDistance: "vs distancia",
    intervalTitle: "Comparación de intervalos",
    intervalHint: "Deltas de ritmo y tiempo por repetición.",
  },
} as const;
