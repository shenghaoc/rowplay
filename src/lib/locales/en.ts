export const en = {
  liveMode: {
    title: "Live mode",
    enabled: "Auto-sync new workouts",
    enabledHint: "Poll the logbook at the chosen interval",
    interval: "Poll interval",
    intervalSec: "{n}s",
    intervalMin: "{n} min",
    lastPollLabel: "Last check",
    nextPollLabel: "Next check",
    polling: "Checking for new workouts…",
    sound: "Notification sound",
    soundHint: "Play a subtle chime when a new workout appears",
    newWorkout: "New workout — {distance} · {time} · {sport}",
    newWorkouts: "{count} new workouts synced",
    view: "View",
    error: "Live sync failed",
    errorRetry: "Will retry automatically",
    rateLimit: "Rate limit reached — slowing down polls",
    reauth: "Session expired — please sign in again",
    recovered: "Live sync resumed",
    warning: "Live sync has failed {count} times in a row",
  },
  annotations: {
    title: "Coaching notes",
    addNote: "Add note",
    editNote: "Edit note",
    deleteNote: "Delete",
    saveNote: "Save",
    cancelNote: "Cancel",
    addPlaceholder: "What should the athlete focus on at this moment?",
    noNotes: "No coaching notes yet. Drag the scrubber to a moment and add a note.",
    confirmDelete: "Delete this note?",
    seekTo: "Seek to {time}",
    timestampLabel: "at",
    pinnedTo: "Pinned to timeline marker",
    saveError: "Failed to save note. Please try again.",
    deleteError: "Failed to delete note. Please try again.",
  },
  leaderboard: {
    title: "Leaderboards",
    lead: "Race ghosts of other rowplay athletes on the same piece. Pick a sport and standard distance to see the standings.",
    sport: "Sport",
    distance: "Distance",
    rank: "Rank",
    athlete: "Athlete",
    time: "Time",
    pace: "Pace",
    gap: "Gap",
    actions: "Actions",
    you: "You",
    athletes: "{n} athletes",
    open: "Open",
    race: "Race",
    raceHint: "Race pre-arms a rival as a ghost on your own replay of this piece.",
    empty: "No entries on this board yet — be the first to publish a result.",
    publish: "Publish to leaderboard",
    publishing: "Publishing…",
    publishOk: "Published — you are rank {rank} on {sport} {distance}.",
    publishOffBoard:
      "Only standard-distance pieces (500m, 1k, 2k, 5k, 6k, 10k, half) can be published.",
    publishFailed: "Could not publish to leaderboard",
    publishNote:
      "Publishing makes this result public on the rowplay leaderboard. It does not change anything in your Concept2 logbook.",
    withdraw: "Remove from leaderboard",
    withdrawing: "Removing…",
    withdrawOk: "Removed from the leaderboard.",
    withdrawFailed: "Could not remove from leaderboard",
    ghostFallbackToast: "Could not load rival's strokes — racing their average pace instead",
  },
  nav: {
    dashboard: "Dashboard",
    leaderboard: "Leaderboards",
    docs: "Help",
    settings: "Data",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    skipToContent: "Skip to content",
  },
  common: {
    demoMode: "demo mode",
    replay: "Replay",
    loading: "loading…",
    tryAgain: "Please try again.",
    dismiss: "Dismiss",
    notAffiliated: "not affiliated with Concept2",
    tagline: "rowplay · Concept2 logbook analytics & real-time replay",
  },
  sync: {
    loading: "Syncing…",
    done: "{added} new · {total} total workouts cached",
    failed: "Sync failed",
    incrementalDone: "Caught up — {total} workouts cached",
    retry: "Retry sync",
    errorBadge: "Last sync failed",
    errorHint: "{message}",
    demoUnavailable: "Sync is unavailable in demo mode — connect your logbook to sync real data.",
    partialWarning:
      "History is still loading — totals and PBs may be incomplete until the sync finishes.",
    inProgress: "Sync in progress…",
    historyWindow: "Showing the last {months} months — loading older history…",
    historyBackfilling: "{total} workouts · history back to {date}",
    historyComplete: "Full history synced",
  },
  auth: {
    connect: "Connect Concept2",
    useToken: "Use a token",
    logout: "Log out",
  },
  theme: { toLight: "Switch to light mode", toDark: "Switch to dark mode" },
  lang: { switch: "Switch language" },
  pwa: {
    updateAvailable: "A new version of rowplay is ready.",
    reload: "Reload",
  },
  landing: {
    tagline: "Concept2 · RowErg · SkiErg · BikeErg",
    title1: "Replay your workouts.",
    title2: "Understand your splits.",
    lead: "rowplay connects to your Concept2 logbook and turns every result into rich analytics — and a real-time replay you can watch stroke by stroke, with a live course and synchronized pace, rate, power and heart-rate telemetry.",
    exploreDemo: "Explore the demo →",
    openDashboard: "Open dashboard →",
    connect: "Connect your Concept2 logbook →",
    readGuide: "Read the guide",
    demoNote:
      "Running in demo mode with sample data. Add a personal token to load your own logbook.",
    feat1Title: "Real-time replay",
    feat1Body: "Watch your pace race the course while gauges and charts play back in sync.",
    feat2Title: "Split analytics",
    feat2Body: "Pace, stroke rate, power and HR over time — across all three machines.",
    feat3Title: "On the edge",
    feat3Body: "Served from Cloudflare with cached stroke data for instant replays.",
    tourEyebrow: "First run",
    tourTitle: "Four things to try",
    tourBody:
      "Start with the dashboard, open a replay, race a ghost from the leaderboard, then export the data you want to inspect elsewhere.",
    tourDashboard: "Dashboard: totals, trends and PBs",
    tourReplay: "Replay: synchronized course and gauges",
    tourGhost: "Ghost racing: chase a past or rival effort",
    tourExport: "Export: CSV, JSON or replay files",
    tourDismiss: "Dismiss first-run tour",
  },
  docs: {
    title: "User guide",
    description:
      "How to use rowplay: getting started, rowing terms, pace and watts, charts, workflows, FAQ, and troubleshooting.",
    badge: "Repository-backed docs",
    openDashboard: "Open dashboard",
    openSource: "View source",
    navLabel: "User guide sections",
    contextual: {
      gettingStarted: "New here? Read the getting-started guide",
      metrics: "What do pace, watts, and stroke rate mean?",
      charts: "How to read this chart",
      troubleshooting: "Missing or confusing data? See troubleshooting",
      workflows: "Learn how leaderboards and ghost racing work",
    },
    sections: {
      overview: {
        navTitle: "Overview",
        markdown: `# rowplay user guide

rowplay turns your indoor rowing, skiing, and riding workouts into something you can explore: a dashboard of totals and trends, a stroke-by-stroke replay, side-by-side comparisons, and friendly leaderboards.

It works with workouts recorded on Concept2 machines — the RowErg (rowing machine), SkiErg, and BikeErg — and reads them from the free Concept2 online logbook. You do not need to know any rowing jargon to start: this guide explains every term it uses.

## What you can do here

- **Dashboard** — totals, trends, personal bests, and training load at a glance.
- **Replay** — watch any workout play back stroke by stroke, with pace, stroke rate, power, and heart-rate charts in sync.
- **Compare** — put two workouts side by side, split by split.
- **Leaderboards** — publish a result and race other athletes as on-screen "ghosts".

## Guide sections

- [Getting started](/docs/getting-started) — demo mode, connecting your logbook, your first sync.
- [Rowing basics](/docs/rowing-metrics) — strokes, splits, and the other terms you will meet.
- [Pace, splits & watts](/docs/pace-splits-watts) — what the numbers mean and how they relate.
- [Charts & progress](/docs/charts-and-progress) — how to read the dashboard panels.
- [Common workflows](/docs/workflows) — replaying, ghost racing, comparing, sharing, exporting.
- [FAQ](/docs/faq) — quick answers about accounts, privacy, and data.
- [Troubleshooting](/docs/troubleshooting) — missing data, odd numbers, display issues.

> Tip: rowplay starts in demo mode with sample workouts, so you can try everything on this list before connecting a Concept2 account.`,
      },
      gettingStarted: {
        navTitle: "Getting started",
        markdown: `# Getting started

## Try the demo first

rowplay starts in demo mode: with no account connected, every page is filled with realistic sample workouts. Nothing you do in demo mode touches a real account.

1. Open the [dashboard](/dashboard).
2. Pick any workout from the list.
3. Press **Replay** and try the play, pause, scrub, and speed controls.
4. Open the [leaderboards](/leaderboard) and try racing a ghost.

## Connect your own workouts

Your workouts live in the Concept2 logbook — the free online diary that Concept2 machines (and the ErgData phone app) upload results to. rowplay reads from that logbook using a personal access token: a long code that acts as a read key for your data.

1. Sign in to your logbook at log.concept2.com.
2. Open **Edit Profile → Applications** and copy your personal API token.
3. Back in rowplay, open [Use a token](/auth/token).
4. Paste the token and submit.
5. On the dashboard, press **Sync** to load your workout history.

The token is sent once over an encrypted connection and kept only in a protected browser cookie. rowplay's servers cache workout data so pages load fast, but never store the token itself.

## Your first sync

The first sync loads recent workouts right away and keeps filling in older history in the background. Until it finishes, long-term totals and personal bests may look incomplete — that is normal. If something still looks off later, see [Troubleshooting](/docs/troubleshooting).

## Disconnecting

Open [Data](/settings) at any time to disconnect. This clears your session and removes your cached workout data from rowplay. Your Concept2 logbook is never modified.`,
      },
      rowingMetrics: {
        navTitle: "Rowing basics",
        markdown: `# Rowing basics

New to indoor rowing — or just to its vocabulary? These are the terms rowplay uses.

## The machines

- **RowErg** — Concept2's rowing machine ("erg" is short for ergometer, a machine that measures work).
- **SkiErg** — a standing machine that mimics the poling motion of cross-country skiing.
- **BikeErg** — Concept2's stationary bike.

All three measure effort the same way, so rowplay shows them with the same kinds of numbers.

## The stroke

One **stroke** is one complete cycle of the movement — on the RowErg: the leg drive, the pull, and the slide back to the start. Two numbers describe your strokes:

- **Stroke rate (spm)** — strokes per minute: how fast you cycle the movement. Steady rowing is typically 18–30 spm.
- **Distance per stroke (DPS)** — how many meters each stroke earns you. Higher usually means a more powerful, more efficient stroke.

A high stroke rate does not automatically mean more speed: 20 strong strokes per minute can move you faster than 30 rushed ones.

## Distance and time

The machine converts your effort into **meters**, as if you were moving a boat (or skis, or a bike) over a course. Workouts are either distance-based ("row 2000m") or time-based ("row for 30 minutes"). An **interval workout** breaks the piece into repeats with rest in between — for example 4 × 500m.

## Pace and splits

**Pace** is how long you take to cover a fixed distance — 500 meters on the RowErg and SkiErg, 1000 meters on the BikeErg. A **split** is your pace over one segment of a workout. These two are the heart of erg training, so they have [their own page](/docs/pace-splits-watts).

## Heart rate

If you wear a heart-rate belt or watch connected to the machine or the ErgData app, beats per minute (**bpm**) appear alongside the other numbers and get their own chart in the replay.`,
      },
      paceSplitsWatts: {
        navTitle: "Pace, splits & watts",
        markdown: `# Pace, splits & watts

These are the numbers erg training centers on. rowplay computes everything for you — but knowing what they mean makes every chart easier to read.

## Pace: time per 500m

Pace answers: "at this speed, how long would 500 meters take me?" It is written like a clock time — **2:05** means 2 minutes 5 seconds per 500m.

- **Lower is faster.** 1:55 is a faster pace than 2:05.
- On charts, improving pace means the line going **down**.
- **BikeErg pace is per 1000m**, not 500m, because bikes are faster. rowplay handles this automatically — so don't be surprised that bike paces look similar to rowing paces.

## Splits

A split is your average pace over one chunk of a workout — each 500m of a 2000m piece, or each interval of an interval session. Comparing splits shows how you spent your effort: even splits, a fade at the end, or a fast finish (a "negative split" means each split is faster than the last).

## Watts

Watts measure your power output — the same unit as a light bulb. Where pace tells you the result, watts tell you the work. They are two views of the same effort: holding roughly 2:00/500m takes about 200 watts, and small pace gains demand disproportionately more power — going from 2:00 to 1:54 costs around 30 extra watts.

Steady rowing might sit between 100 and 250 watts depending on fitness; sprints can spike far higher.

## Stroke rate is not effort

Stroke rate (spm) tells you how often you stroke, not how hard. Two rowers can both hold 2:00 pace — one at 22 strong strokes per minute, one at 28 lighter ones. Watching pace **and** rate together (the replay charts both) reveals technique: the same pace at a lower rate means more distance per stroke.

## Where to see these

- The **dashboard** shows average pace, totals, and personal bests across workouts.
- The **replay** charts pace, stroke rate, watts, and heart rate over the whole workout, synchronized with playback.
- The **per-rep comparison** in a replay breaks interval workouts into split-by-split bars.`,
      },
      chartsAndProgress: {
        navTitle: "Charts & progress",
        markdown: `# Charts & progress

The dashboard turns your history into a set of panels. This page explains how to read them.

## Trend over time

The trend chart follows one metric — pace, distance, stroke rate, or distance per stroke — across weeks of workouts. To stay fair, pace trends compare **like for like**: a sprint and a long steady row are never mixed into one line. Workouts are grouped into distance bands, and you pick the band to inspect.

- For **pace**, down is better (less time per 500m).
- A verdict line above the chart summarizes the direction: improving, holding steady, or slipping.
- A band needs at least two sessions before a trend can be drawn.

## Personal bests

The PB panel tracks your fastest results at standard distances (500m, 1k, 2k, 5k, 6k, 10k, and longer). Make sure a full sync has finished before trusting all-time bests — see [Troubleshooting](/docs/troubleshooting).

## Training calendar & intensity

The calendar shades each day by how much you trained, so streaks and gaps stand out at a glance. The intensity view shows how your training is distributed between easy and hard work.

## Fitness, fatigue & form

The freshness panel estimates three curves from your training load: **fitness** (the long-term work you have banked), **fatigue** (the short-term tiredness from recent sessions), and **form** (fitness minus fatigue — your readiness today). Training hard raises fitness and fatigue together; resting drops fatigue faster than fitness, which is why form peaks after an easier stretch.

## Critical power

The critical-power panel estimates the highest output you could sustain over a long effort, computed from your own best results. It feeds the pace predictor — an estimate of what you could hold over a distance you have not raced recently.

## Stroke efficiency (DPS)

The DPS chart tracks meters gained per stroke. The pace-normalised toggle removes the effect of simply rowing harder, so what remains is closer to pure technique. Use the 7-day average for recent shape and the 28-day average for the bigger picture.`,
      },
      workflows: {
        navTitle: "Common workflows",
        markdown: `# Common workflows

## Replay a workout

Open any workout from the dashboard and press **Replay**.

- **Play / pause** controls playback; the course view and all gauges stay in sync.
- **Scrub** the timeline to jump to any moment.
- **Speed** runs the replay from 0.5× to 8× real time.
- Switch between **2D and 3D** course views (3D needs a reasonably modern browser).
- Set a **target pace** to draw a reference line on the pace chart.

The athlete animates at the workout's real cadence — one stroke (or pole plant, or pedal turn) per recorded stroke, with splash and spray at each catch — and speeds up in step with the playback rate. In 3D, the athlete uses a segmented human-scale body with sport-specific kit, so posture reads like an erg athlete rather than a toy marker. Hands and feet stay posed against the relevant equipment: oar handles and foot plates, SkiErg pole grips and boots, or BikeErg bars and pedals. The course surface is sport-specific too: RowErg gets layered water lanes, SkiErg gets groomed snow grooves, and BikeErg gets an asphalt/velodrome track with curbs, lane marks, and speed bars. The chase camera stays close enough for body position to matter and widens its lens slightly as the boat runs faster.

In 3D, the **Quality** selector picks low, medium, high, or ultra graphics. WebGPU-capable devices try the richer Ultra path first; WebGL remains the fallback. If the device can't hold a smooth frame rate, the renderer automatically lowers resolution first and effects second. Replay animation honours the operating system's reduced-motion setting.

Per-stroke data is used when Concept2 provides it. Workouts without stroke data fall back to split-based replay, so the course still plays back.

## Add coaching notes

While paused at a moment in a replay, add a note ("rushing the slide here"). Notes pin to the timeline, so you — or anyone you share the replay with — can jump straight to them.

## Race a ghost

A ghost is a past effort that races alongside you on screen.

1. Open the [leaderboards](/leaderboard) and pick a sport and distance.
2. Press **Race** next to an entry.
3. Your own replay of that piece now shows the rival as a second boat to chase.

You can also race your own earlier results to see exactly where a personal-best attempt won or lost time.

## Compare two workouts

In the dashboard workout list, use the compare button on one workout, then pick a second. The compare view lines both efforts up split by split.

## Publish to a leaderboard

Standard-distance results (500m, 1k, 2k, 5k, 6k, 10k, half marathon) can be published to the rowplay leaderboard from the replay page. Publishing is opt-in, reversible, and never changes anything in your Concept2 logbook.

## Share and export

- **Share** on a replay creates a public, read-only link — handy for coaches.
- **Export** on the [Data](/settings) page downloads your logbook as CSV or JSON, plus per-workout TCX files for workouts with stroke data.

## Keep data fresh

**Sync** on the dashboard pulls new results on demand. **Live mode** (also on the dashboard) polls the logbook on a schedule and notifies you when a new workout lands — handy right after a session.

## Import heart rate

If a workout has no heart-rate data but your watch recorded it, open the replay and use **Import heart rate** to merge a CSV, TCX, or FIT export from the watch into the workout.`,
      },
      faq: {
        navTitle: "FAQ",
        markdown: `# FAQ

## Do I need a Concept2 account?

Not to look around — demo mode works without one. To see your own workouts you need a free Concept2 logbook account, which is where the machine (or the ErgData app) stores your results.

## Is my access token safe?

The token is transmitted once over HTTPS and sealed into a protected, httpOnly browser cookie. It is never stored on rowplay's servers. Disconnecting clears it.

## Can other people see my workouts?

No — your dashboard and replays are private by default. Others can only see a workout if you publish it to a leaderboard or share its public link, and both are reversible.

## Does rowplay change my Concept2 logbook?

Never. rowplay only reads. Publishing to a rowplay leaderboard or deleting cached data here does not modify the source logbook entry.

## Which machines are supported?

RowErg, SkiErg, and BikeErg. Pace is shown per 500m for rowing and skiing and per 1000m for the bike.

## Why don't some workouts have a stroke-by-stroke replay?

Not every logbook entry includes per-stroke data — it depends on how the workout was recorded. Those workouts still replay using their splits, just with fewer data points.

## Can I use rowplay on my phone?

Yes — the whole app, including replays, works in mobile browsers, and you can install it to your home screen like an app.

## Which languages are available?

English, Deutsch, Español, Français, 日本語, and 中文 — switch from the header (behind the menu button on mobile).`,
      },
      troubleshooting: {
        navTitle: "Troubleshooting",
        markdown: `# Troubleshooting

## My totals or personal bests look wrong

Most often the full history has not finished syncing. The first sync backfills older workouts in the background; until it completes, anything computed "across all time" can be incomplete. Check [Data](/settings) for sync status and run a full sync if needed.

## A pace looks way off

- **BikeErg paces are per 1000m**, not per 500m — a 2:00 bike pace is not the same speed as a 2:00 rowing pace.
- Interval workouts report pace for the work intervals; rest periods do not count.

## The trend chart says it needs more sessions

Trends compare like-for-like distances, so they need at least two sessions in the same distance band. Log another similar workout and the trend appears.

## A workout has no stroke charts

That logbook entry has no per-stroke data — common for older results and some recording methods. The replay falls back to splits. Stroke-dependent panels (distance per stroke, per-stroke comparison) need stroke data and will say so when it is missing.

## Heart rate is missing

The logbook only has heart rate when a belt or watch was connected during the workout. If a watch recorded it separately, use **Import heart rate** on the replay page to merge a CSV, TCX, or FIT export into the workout.

## Sync fails or the session expires

Personal tokens can expire or be revoked. Reconnect at [Use a token](/auth/token) with a fresh token from your Concept2 profile. If many requests were made in a short time, the logbook may rate-limit briefly — wait a minute and retry.

## A new workout does not appear

First confirm the workout reached your Concept2 logbook (it must upload from the machine or the ErgData app). Then press **Sync** on the dashboard, or enable live mode to poll automatically.

## Display issues

- **3D replay will not start** — the browser needs WebGPU or WebGL; the 2D view always works.
- **Charts look cramped on a phone** — rotate to landscape for wider charts; panels reflow on small screens.
- **Wrong theme or language** — both switches live in the header (behind the menu button on mobile) and are remembered per browser.

Still stuck? The [FAQ](/docs/faq) covers more, and every page of this guide is reachable from **Help** in the header.`,
      },
    },
  },
  dashboard: {
    eyebrow: "Your logbook",
    title: "Results & replays",
    all: "All",
    sync: "Sync",
    syncing: "Syncing…",
    syncedNote: "{total} workouts · last synced {date}",
    recentNote:
      "Showing recent workouts — hit Sync to load your full history for accurate PBs and trends.",
    latest: "Latest",
    distance: "distance",
    time: "time",
    avgRate: "avg rate",
    distStroke: "dist/stroke",
    avgBpm: "avg bpm",
    vsAvg: "vs your {sport} avg",
    sessions: "Sessions",
    totalDistance: "Total distance",
    totalTime: "Total time",
    avgPace: "Avg pace",
    sectionCoreEyebrow: "Start here",
    sectionCore: "Today’s readout",
    sectionWorkoutsEyebrow: "Workouts",
    sectionWorkouts: "Find a replay",
    sectionWorkoutsBody:
      "Filter, tag, compare and open workouts without digging through the deeper analysis panels.",
    sectionRecordsEyebrow: "Goals",
    sectionRecords: "Goals, badges & PBs",
    sectionRecordsBody:
      "Season targets, milestones, standard-distance bests and predictor tools stay together.",
    sectionAdvancedEyebrow: "Analysis",
    sectionAdvanced: "Advanced analysis",
    sectionAdvancedBody:
      "Power model, training load, stroke efficiency and long-range trends for deeper review.",
    sectionPower: "CP/W′ & freshness",
    sectionPowerBody: "Critical power, sustainable pace and load balance from your own history.",
    sectionTraining: "Training shape",
    sectionTrainingBody: "Calendar, intensity and trend views for how the work is distributed.",
    sectionStroke: "Stroke efficiency & sport splits",
    sectionStrokeBody: "DPS trend and per-machine summaries for technique and pacing context.",
    tour: {
      eyebrow: "Demo guide",
      title: "Try this first",
      body: "These hints are optional and stay dismissed on this browser.",
      dismissHint: "Dismiss {title}",
      latestReplay: {
        title: "Replay the latest workout",
        body: "Open the newest demo piece and press play.",
        action: "Open replay",
      },
      criticalPower: {
        title: "Check CP/W′",
        body: "See the sustainable-power model and pace predictor.",
        action: "Jump to panel",
      },
      workoutFilters: {
        title: "Use workout filters",
        body: "Narrow the list by distance, tags, stroke data or pace.",
        action: "Try filters",
      },
      leaderboardGhost: {
        title: "Race a leaderboard ghost",
        body: "Open a standard board and use Race to pre-arm a rival.",
        action: "Open leaderboard",
      },
    },
    pbTitle: "Personal bests · standard distances",
    bySport: "By sport",
    thSport: "Sport",
    thSessions: "Sessions",
    thDistance: "Distance",
    thTime: "Time",
    thAvgPace: "Avg pace",
    thBestPace: "Best pace",
    trendTitle: "Trend over time",
    likeForLike: "{sport}, like-for-like distance",
    mPace: "Pace",
    mDistStroke: "Dist/stroke",
    mDistance: "Distance",
    mRate: "Rate",
    holdingSteady: "Holding steady — {metric} flat over {days} days",
    improving: "Improving — {change} over {days} days",
    slipping: "Slipping — {change} over {days} days",
    faster: "{delta} faster",
    slower: "{delta} slower",
    emptyTrend: "Only {n} session in this band — log another {band} to see a trend.",
    dpsTrend: {
      title: "Stroke efficiency (DPS)",
      raw: "Raw DPS",
      normalised: "Pace-normalised",
      ma7: "7-day avg",
      ma28: "28-day avg",
      yLabel: "m/stroke",
      empty: "No stroke-count data available",
      tooltipPace: "Avg pace",
      tooltipDps: "DPS",
    },
    calTitle: "Training calendar",
    calMetricDistance: "Meters",
    calMetricTime: "Time",
    calActiveDays: "{n} active days",
    calCurrentStreak: "{n}-day streak",
    calLongestStreak: "Longest: {n} days",
    calLess: "Less",
    calMore: "More",
    calTooltip: "{date} · {sessions} sessions · {volume}",
    calEmpty: "{date} · no training",
    calAria: "Training calendar, {active} active days, {streak}-day current streak",
    calDowSun: "Sun",
    calDowMon: "Mon",
    calDowTue: "Tue",
    calDowWed: "Wed",
    calDowThu: "Thu",
    calDowFri: "Fri",
    calDowSat: "Sat",
    tid: {
      title: "Training intensity",
      time: "Time",
      distance: "Distance",
      period4w: "Last 4 weeks",
      period3m: "Last 3 months",
      period12m: "Last 12 months",
      empty: "No workouts in this period",
      zone: {
        UT2: "UT2 — Recovery",
        UT1: "UT1 — Aerobic",
        AT: "AT — Threshold",
        TR: "TR — Race pace",
        AN: "AN — Anaerobic",
        Easy: "Easy",
        Moderate: "Moderate",
        Hard: "Hard",
      },
    },
    formTitle: "Fitness & Freshness",
    formAdvanced: "Advanced analysis",
    formSub: "Training load across all machines, scaled to your own threshold power.",
    formFitness: "Fitness",
    formFatigue: "Fatigue",
    formForm: "Form",
    formFitnessHint: "42-day load (CTL)",
    formFatigueHint: "7-day load (ATL)",
    formFormHint: "fitness − fatigue (TSB)",
    formFtp: "Threshold power",
    formCp: "Critical power",
    formModelled: "modelled",
    formEstimated: "estimated",
    formRamp: "7-day fitness ramp",
    formChartFitness: "Fitness",
    formChartFatigue: "Fatigue",
    formChartForm: "Form",
    formEmpty:
      "Log a few more sessions over a couple of weeks to show your fitness & freshness chart.",
    bandTransition: "Detraining",
    descTransition: "Very fresh, but fitness is slipping. Time to put work in.",
    bandFresh: "Fresh",
    descFresh: "Rested and race-ready — a good window to test yourself.",
    bandNeutral: "Neutral",
    descNeutral: "Balanced — neither sharp nor deeply fatigued.",
    bandProductive: "Productive",
    descProductive: "Building fitness under healthy, manageable fatigue.",
    bandOverreaching: "Overreaching",
    descOverreaching: "Heavy fatigue. Hold back and let recovery catch up.",
    goalsTitle: "Season goals & challenges",
    goalsYear: "{year} goal",
    goalsKindMeters: "Meters",
    goalsKindHours: "Hours",
    goalsTargetMeters: "Target (m)",
    goalsTargetHours: "Target (hours)",
    goalsSave: "Save goal",
    goalsSaving: "Saving…",
    goalsSaved: "Goal saved",
    goalsSaveFailed: "Could not save goal",
    goalsProgress: "{current} / {target}",
    goalsPct: "{pct}% complete",
    goalsOnPace: "On pace — projected {projected} by year end",
    goalsBehind: "Behind pace — projected {projected} · need {needed} more",
    goalsStreakCurrent: "{n}-day streak",
    goalsStreakCurrent_one: "{n}-day streak",
    goalsStreakLongest: "Longest: {n} days",
    goalsStreakLongest_one: "Longest: {n} day",
    goalsDaysSince: "{n} days since last session",
    goalsDaysSince_one: "{n} day since last session",
    goalsDaysSinceToday: "Trained today",
    goalsWeekly: "{active} of {total} active weeks",
    badgesTitle: "Badges",
    badgeMeters100k: "100k club",
    badgeMeters500k: "500k club",
    badgeMeters1m: "Million Meter",
    badgeMeters2m: "2 million meters",
    badgeMeters5m: "5 million meters",
    badgeClub500: "500m club PB",
    badgeClub1000: "1k club PB",
    badgeClub2000: "2k club PB",
    badgeClub5000: "5k club PB",
    badgeClub10000: "10k club PB",
    badgeEverySportWeek: "Every-sport week",
    pbTag: "PB",
    pbNew: "New PB",
    pbCelebrate: "New {distance} PB — {time}!",
    pbCelebrateMore: "{count} new personal bests!",
    predictor: {
      title: "Performance predictor",
      distance: "Known distance",
      time: "Known time",
      predict: "Predict",
      colDistance: "Distance",
      colPredicted: "Predicted",
      colBest: "Your best",
      colStatus: "Status",
      beaten: "Beaten",
      behind: "Behind",
      untried: "Untried",
      noTime: "—",
      inputError: "Enter a valid time (e.g. 7:04)",
    },
    cpTitle: "Critical power & pace predictor",
    cpSub:
      "A best-effort power model from your logbook results, with confidence and data warnings shown explicitly.",
    cpLabel: "Critical power (CP)",
    cpWPrime: "Anaerobic capacity (W′)",
    cpMethod: "Fit method",
    cpExplainModel:
      "{scope} model: CP {cp} W and W′ {wPrime} kJ are fitted from your best logged efforts. Treat this as a training estimate, not a lab measurement.",
    cpExplainEstimate:
      "{scope} estimate: CP is approximated at {cp} W from your best longer effort. Log more maximal efforts across short, medium and long durations to fit CP/W′.",
    cpScopeLabel: "Critical power scope",
    cpScopeAll: "All",
    cpEmptyScope:
      "Not enough usable {scope} efforts yet. Add a few maximal pieces across different durations before trusting this model.",
    cpConfidenceLabel: "Confidence",
    cpConfidence: {
      high: "High",
      medium: "Medium",
      low: "Low",
      insufficient: "Insufficient",
    },
    cpSample: "{n} usable efforts · {points} envelope points",
    cpFreshness: "Newest effort {date}",
    cpFit: "Fit R² {r2} · residual {residual}%",
    cpWarningsLabel: "Model warnings",
    cpWarning: {
      "too-few-efforts": "Too few maximal efforts",
      "narrow-duration-range": "Narrow duration range",
      "stale-efforts": "Newest effort is stale",
      "mixed-sports": "Mixed sports",
      "outlier-sensitive": "Outlier-sensitive fit",
      "unrealistic-fit": "Unrealistic fit rejected",
      "estimate-only": "Estimate only",
    },
    cpPredictTitle: "What can I hold?",
    cpPredictSub:
      "Single-sport pace and finish-time predictions from the selected model. Pace is normalized to /500m.",
    cpMixedPredictNote: "Select one sport for pace predictions; the all-sport view is power-only.",
    cpModeDuration: "Hold for…",
    cpModeDistance: "Time for…",
    cpHoldFor: "Hold for",
    cpMinutes: "minutes",
    cpDistance: "Distance",
    cpPaceHint: "{scope} even-split pace for about {min} minutes",
    cpTimeHint: "{scope} predicted finish for {dist}",
    cpPreset6: "6 min",
    cpPreset20: "20 min",
    cpPreset30: "30 min",
    cpPreset60: "60 min",
    cpDist500: "500 m",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "Power–duration: you vs model",
    cpChartHint:
      "Dots are your session bests; the line is what CP/W′ predicts. Above the line = outperforming the model.",
    cpChartActual: "Your bests",
    cpChartModel: "CP model",
  },
  milestone: {
    title: "Milestones",
    next: "Up next",
    lifetime_distance_rower_100k: "100k metres rowed",
    "lifetime_distance_rower_100k.toast": "🎉 100k metres rowed!",
    lifetime_distance_rower_250k: "250k metres rowed",
    "lifetime_distance_rower_250k.toast": "🎉 250k metres rowed!",
    lifetime_distance_rower_500k: "500k metres rowed",
    "lifetime_distance_rower_500k.toast": "🎉 500k metres rowed!",
    lifetime_distance_rower_1M: "1 million metres rowed",
    "lifetime_distance_rower_1M.toast": "🎉 1 million metres rowed!",
    lifetime_distance_rower_2M: "2 million metres rowed",
    "lifetime_distance_rower_2M.toast": "🎉 2 million metres rowed!",
    lifetime_distance_rower_5M: "5 million metres rowed",
    "lifetime_distance_rower_5M.toast": "🎉 5 million metres rowed!",
    lifetime_distance_rower_10M: "10 million metres rowed",
    "lifetime_distance_rower_10M.toast": "🎉 10 million metres rowed!",
    lifetime_distance_skierg_100k: "100k metres on SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100k metres on SkiErg!",
    lifetime_distance_skierg_250k: "250k metres on SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250k metres on SkiErg!",
    lifetime_distance_skierg_500k: "500k metres on SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500k metres on SkiErg!",
    lifetime_distance_skierg_1M: "1 million metres on SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 1 million metres on SkiErg!",
    lifetime_distance_skierg_2M: "2 million metres on SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 2 million metres on SkiErg!",
    lifetime_distance_skierg_5M: "5 million metres on SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 5 million metres on SkiErg!",
    lifetime_distance_skierg_10M: "10 million metres on SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 10 million metres on SkiErg!",
    lifetime_distance_bike_100k: "100k metres on BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100k metres on BikeErg!",
    lifetime_distance_bike_250k: "250k metres on BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250k metres on BikeErg!",
    lifetime_distance_bike_500k: "500k metres on BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500k metres on BikeErg!",
    lifetime_distance_bike_1M: "1 million metres on BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 1 million metres on BikeErg!",
    lifetime_distance_bike_2M: "2 million metres on BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 2 million metres on BikeErg!",
    lifetime_distance_bike_5M: "5 million metres on BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 5 million metres on BikeErg!",
    lifetime_distance_bike_10M: "10 million metres on BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 10 million metres on BikeErg!",
    lifetime_distance_combined_100k: "100k metres total",
    "lifetime_distance_combined_100k.toast": "🎉 100k metres total!",
    lifetime_distance_combined_250k: "250k metres total",
    "lifetime_distance_combined_250k.toast": "🎉 250k metres total!",
    lifetime_distance_combined_500k: "500k metres total",
    "lifetime_distance_combined_500k.toast": "🎉 500k metres total!",
    lifetime_distance_combined_1M: "1 million metres total",
    "lifetime_distance_combined_1M.toast": "🎉 1 million metres total!",
    lifetime_distance_combined_2M: "2 million metres total",
    "lifetime_distance_combined_2M.toast": "🎉 2 million metres total!",
    lifetime_distance_combined_5M: "5 million metres total",
    "lifetime_distance_combined_5M.toast": "🎉 5 million metres total!",
    lifetime_distance_combined_10M: "10 million metres total",
    "lifetime_distance_combined_10M.toast": "🎉 10 million metres total!",
    session_count_10: "10 workouts",
    "session_count_10.toast": "🎉 10 workouts!",
    session_count_25: "25 workouts",
    "session_count_25.toast": "🎉 25 workouts!",
    session_count_50: "50 workouts",
    "session_count_50.toast": "🎉 50 workouts!",
    session_count_100: "100 workouts",
    "session_count_100.toast": "🎉 100 workouts!",
    session_count_250: "250 workouts",
    "session_count_250.toast": "🎉 250 workouts!",
    session_count_500: "500 workouts",
    "session_count_500.toast": "🎉 500 workouts!",
    session_count_1000: "1000 workouts",
    "session_count_1000.toast": "🎉 1000 workouts!",
    session_count_2500: "2500 workouts",
    "session_count_2500.toast": "🎉 2500 workouts!",
    streak_7d: "7-day streak",
    "streak_7d.toast": "🎉 7-day streak!",
    streak_14d: "14-day streak",
    "streak_14d.toast": "🎉 14-day streak!",
    streak_30d: "30-day streak",
    "streak_30d.toast": "🎉 30-day streak!",
    streak_60d: "60-day streak",
    "streak_60d.toast": "🎉 60-day streak!",
    streak_100d: "100-day streak",
    "streak_100d.toast": "🎉 100-day streak!",
    pb_2k_sub8: "Sub-8 minute 2k",
    "pb_2k_sub8.toast": "🎉 Sub-8 minute 2k!",
    pb_2k_sub730: "Sub-7:30 2k",
    "pb_2k_sub730.toast": "🎉 Sub-7:30 2k!",
    pb_2k_sub7: "Sub-7 minute 2k",
    "pb_2k_sub7.toast": "🎉 Sub-7 minute 2k!",
    pb_2k_sub630: "Sub-6:30 2k",
    "pb_2k_sub630.toast": "🎉 Sub-6:30 2k!",
  },
  workout: {
    tag: {
      label: "Type",
      auto: "Auto-detect",
      "steady-state": "Steady state",
      interval: "Interval",
      "race-piece": "Race piece",
      "time-trial": "Time trial",
      "warmup-cooldown": "Warm-up / cool-down",
      unknown: "Other",
      filter: {
        all: "All types",
      },
      saveError: "Couldn't save tag — please try again.",
    },
  },
  workoutList: {
    empty: "No workouts for this filter.",
    windowed: "{n} workouts · windowed for performance",
    filtersTitle: "Find workouts",
    matching: "{n} matching",
    clearFilters: "Clear filters",
    expand: "More filters",
    collapse: "Fewer filters",
    dateFrom: "From",
    dateTo: "To",
    workoutType: "Logbook type",
    anyType: "Any logbook type",
    strokeData: "Stroke data",
    strokeAny: "Any",
    strokeYes: "Has stroke data",
    strokeNo: "No stroke data",
    searchComments: "Search comments…",
    search: "Search",
    distanceChips: "Distance",
    durationChips: "Duration",
    durationMin: "{n} min",
    chipMarathon: "Marathon",
    sortGroup: "Sort",
    sortDate: "Date",
    sortDistance: "Distance",
    sortTime: "Time",
    sortPace: "Pace",
    sortPower: "Power",
    pbsOnly: "PBs only",
    compare: "Compare",
    comparePick: "Pick first workout to compare",
    compareWith: "Compare with this workout",
    compareCancel: "Cancel",
  },
  share: {
    shareReplay: "Share replay",
    downloadImage: "Download image",
    linkCopied: "Share link copied",
    linkReady: "Anyone with this link can watch the replay",
    shareFailed: "Could not create share link",
    privacyBlocked:
      "This workout isn’t public on Concept2, so it can’t be shared. Set its privacy to “Everyone” in your logbook first.",
    imageSaved: "Race card saved",
    imageFailed: "Could not save race card",
    publicBanner: "Shared replay — read-only view",
    ctaBefore: "Want your own replays? ",
    ctaLink: "Try rowplay",
    ctaAfter: " — Concept2 logbook analytics and workout replay.",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "Avg power",
    raceCardAvgHr: "Avg HR",
  },
  replay: {
    hrImportTitle: "Import heart rate",
    hrImportHint:
      "This workout has no HR from the logbook. Upload a watch export (CSV, TCX, or FIT) to overlay heart rate on the replay.",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "Watch start offset",
    hrImportOffsetHint: "Positive if the watch started before you began rowing (seconds).",
    hrImportPreview: "{count} samples · ~{avg} bpm avg",
    hrImportApply: "Apply heart rate",
    hrImportClear: "Remove imported HR",
    hrImportApplied: "Heart rate imported",
    hrImportCleared: "Imported heart rate removed",
    hrImportTooFew: "That file has too few heart-rate samples.",
    hrImportSaveFailed: "Could not save heart-rate import",
    hrImportClearFailed: "Could not remove heart-rate import",
    back: "Back to dashboard",
    lowRes: "low-res replay",
    compareAgainst: "Compare against:",
    none: "None",
    pastSession: "A past session",
    constantPace: "A constant pace",
    uploadedFile: "An uploaded file",
    chooseSession: "Choose a {sport} session…",
    setPace: "Set pace",
    targetPace: "Target pace",
    targetPacePlaceholder: "M:SS",
    targetPaceSet: "Set target pace",
    targetPaceClear: "Clear",
    targetPaceBand: "Show ±5 s band",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ ahead by {m}m",
    behind: "▼ behind by {m}m",
    searchSessions: "Search sessions…",
    suggestedRival: "Suggested rival",
    raceVerdictWinSession:
      "You beat your {date} {distance} by {seconds}s (you finished {m} m ahead)",
    raceVerdictLoseSession:
      "Your {date} {distance} beat you by {seconds}s (you finished {m} m behind)",
    raceVerdictWinPace: "You beat the {pace} pace boat by {seconds}s (you finished {m} m ahead)",
    raceVerdictLosePace: "The {pace} pace boat beat you by {seconds}s (you finished {m} m behind)",
    raceVerdictWinFile: "You beat {name} by {seconds}s (you finished {m} m ahead)",
    raceVerdictLoseFile: "{name} beat you by {seconds}s (you finished {m} m behind)",
    raceFinished: "Race finished",
    play: "Play",
    pause: "Pause",
    viewToggle: "Course view",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "3D view requires WebGPU or WebGL on this device",
    view3dLoading: "Loading 3D…",
    view3dError: "Could not load 3D view",
    quality: "Quality",
    qualityLow: "Low",
    qualityMedium: "Medium",
    qualityHigh: "High",
    qualityUltra: "Ultra",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "Pace",
    gRate: "Rate",
    gPower: "Power",
    gHeart: "Heart",
    cPace: "Pace",
    cRate: "Stroke rate",
    cPower: "Power",
    cHeart: "Heart rate",
    strokeQuality: "Stroke quality",
    avgDistStroke: "avg dist / stroke",
    avgRate: "avg rate",
    paceVariation: "pace variation",
    paceVariationHint: "(lower = smoother)",
    fade: "fade",
    negSplit: "negative split",
    slowedDown: "slowed down",
    distPerStroke: "Distance per stroke",
    distPerStrokeHint: "— higher = more powerful stroke",
    paceVsRate: "Pace vs rate",
    paceVsRateHint: "— find your most efficient rating",
    powerCurve: "Power curve (best average over duration)",
    hrZones: "Heart-rate zones (time in zone)",
    intervalBreakdown: "Interval breakdown",
    repComparison: "Rep comparison",
    repComparisonN: "Rep comparison ({n} reps)",
    repComparisonRep: "Rep {n}",
    repComparisonAvgPace: "avg {pace}",
    repComparisonMetricPace: "Pace",
    repComparisonMetricRate: "Stroke rate",
    repComparisonMetricPower: "Power",
    repComparisonMetricHr: "Heart rate",
    splitBreakdown: "Split breakdown",
    segReps: "reps",
    segSplits: "splits",
    avgRepPace: "avg rep pace",
    avgSplitPace: "avg split pace",
    consistency: "consistency",
    consistencyHint: "(lower = evener)",
    setFade: "set fade",
    faded: "faded",
    fastestSlowest: "fastest → slowest",
    splitsTitle: "Splits",
    thNum: "#",
    thDist: "Dist",
    thTime: "Time",
    thPace: "Pace",
    thRate: "Rate",
    thHr: "HR",
    workoutDetails: "Workout details",
    mDate: "Date",
    mSport: "Sport",
    mType: "Type",
    mDistance: "Distance",
    mTime: "Time",
    mAvgPace: "Avg pace",
    mAvgRate: "Avg rate",
    mStrokeCount: "Stroke count",
    mAvgPower: "Avg power",
    mAvgHr: "Avg HR",
    mHrRange: "HR range",
    mCalories: "Calories",
    mDragFactor: "Drag factor",
    mResolution: "Resolution",
    mSegments: "Segments",
    mWorkoutId: "Workout id",
    mComments: "Comments",
    samples: "samples",
    perStroke: "per-stroke",
    fromSplits: "from splits",
    intervalsWord: "intervals",
    splitsWord: "splits",
    racingSession: "Racing your {date} session",
    racingFile: "Racing {name}",
    ghostYour: "your {date}",
    loadSessionFailed: "Could not load that session",
    paceError: "Enter a pace like 1:52",
    pacingAt: "Pacing at {pace}",
    noSamples: "No usable samples in that file.",
    fileReadError: "Could not read that file.",
    importFailed: "Could not import that file",
    zone1: "Z1 Recovery",
    zone2: "Z2 Endurance",
    zone3: "Z3 Tempo",
    zone4: "Z4 Threshold",
    zone5: "Z5 Max",
    fullMetrics: "Full metrics",
    mHrEnding: "HR at finish",
    mHrRecovery: "HR recovery",
    mHrDrop: "HR drop",
    mRestTime: "Rest time",
    mRestDistance: "Rest distance",
    mWeightClass: "Weight class",
    mVerified: "Verified",
    mTimezone: "Timezone",
    mPrivacy: "Privacy",
    mWattMinutes: "Watt-minutes",
    provenanceTitle: "Logging provenance",
    mPmVersion: "PM version",
    mFirmware: "Firmware",
    mSerial: "Serial number",
    mDevice: "Device",
    mSource: "Logged by",
    exrBadge: "EXR source",
    exrBadgeTitle:
      "Pace and power were synthesised by EXR, not read from the PM5. Numbers may not be directly comparable to PM-logged workouts.",
    mErgModel: "Erg model",
    mHrSensor: "HR sensor",
    targetsTitle: "Targets",
    mTargetPace: "Target pace",
    mTargetWatts: "Target watts",
    mTargetRate: "Target rate",
    mTargetHrZone: "Target HR zone",
    mTargetCalories: "Target calories",
    targetVsActualTitle: "Target vs actual",
    targetHit: "On target",
    targetMiss: "Off target",
    workRestTitle: "Work : rest",
    workRestRatio: "work per rest second",
    thCalories: "Cal",
    thWattMin: "W·min",
    thIntervalType: "Type",
    thRest: "Rest",
    thRestYes: "Rest",
    verifiedYes: "Verified",
    verifiedNo: "Unverified",
    weightHeavy: "Heavyweight",
    weightLight: "Lightweight",
    intervalTypeTime: "Time",
    intervalTypeDistance: "Distance",
    intervalTypeCalorie: "Calorie",
    intervalTypeWattminute: "Watt-minute",
    removeGhost: "Remove ghost",
    racingAgainst: "Racing: {name}",
    compareAction: "Compare",
    legendTitle: "Legend",
    legendGhost: "Ghost",
    kbTitle: "Keyboard shortcuts",
    kbSpaceHint: "play / pause",
    kbArrowHint: "scrub ±10 s",
    kbArrowShiftHint: "scrub ±30 s",
    kbBracketHint: "change speed",
    kbHomeHint: "reset to start",
  },
  inspector: {
    toggle: "Field inspector",
    toggleOn: "Hide field inspector",
    panelLabel: "Raw field inspector",
    sectionWorkout: "Workout",
    sectionProvenance: "Provenance",
    sectionPerStroke: "Per-stroke",
    colField: "Field",
    colAsLogged: "As-logged",
    colNormalized: "Normalized",
    derived: "derived",
    noStrokeData: "No per-stroke sample at this time.",
    tableLabel: "Per-stroke field readout",
    staticSport: "Sport",
    staticDistance: "Distance",
    staticTime: "Time",
    staticDrag: "Drag factor",
    staticType: "Workout type",
    staticResolution: "Resolution",
    fieldT: "Elapsed time (tenths)",
    fieldD: "Distance (decimetres)",
    fieldP: "Pace (tenths)",
    fieldSpm: "Stroke rate",
    fieldHr: "Heart rate",
    fieldWatts: "Power (derived)",
    fieldProgress: "Progress",
    fieldSplit: "Split index",
    fieldInterval: "Interval index",
    fieldDps: "Distance per stroke",
    metaPm: "PM version",
    metaFirmware: "Firmware",
    metaErg: "Erg model",
    metaHrSensor: "HR sensor",
    metaSource: "Source app",
    metaSerial: "Serial number",
    metaDevice: "Device",
  },
  drift: {
    toggle: "Show efficiency drift",
    toggleOn: "Hide efficiency drift",
    baseline: "Opening baseline",
    fade: "Efficiency fade",
    unit: " m/st",
    summaryTitle: "Distance-per-stroke drift",
    summaryHint: "DPS change from opening segment to close",
    axisLabel: "DPS",
  },
  settings: {
    title: "Account & data",
    eyebrow: "Privacy & control",
    dataTitle: "What we store",
    dataNote:
      "rowplay reads your Concept2 workouts on demand and caches them on Cloudflare so replays load instantly. Your API token is sealed into the httpOnly rp_tok cookie with SESSION_SECRET. KV stores session identity/state only; D1 caches workout and replay data, never the token. Disconnecting or deleting data clears cached user data and session state.",
    factWorkouts: "{n} workouts available to export",
    factDemo: "Demo mode — sample data only, nothing is persisted.",
    factCache: "D1 stores cached workout/replay data — never the token.",
    factSession: "KV stores session identity/state; the token is sealed in httpOnly rp_tok.",
    exportTitle: "Export logbook",
    exportNote:
      "Download your full history as CSV or JSON. Per-workout TCX (stroke data) opens in Garmin, Strava, or TrainingPeaks.",
    exportCsv: "Download CSV",
    exportJson: "Download JSON",
    exportTcxNote: "TCX export (per workout with stroke data):",
    exportTcx: "Workout #{id} · TCX",
    syncTitle: "Re-sync logbook",
    syncNote:
      "Incremental sync fetches workouts since your last sync. Full re-sync re-downloads your entire history (slower, use after issues).",
    syncIncremental: "Incremental sync",
    syncFull: "Full re-sync",
    loadFullHistory: "Load full history",
    syncDemo: "Sync is unavailable in demo mode — connect your logbook to sync real data.",
    lastSync: "{total} workouts cached · last sync {date}",
    neverSynced: "never",
    deleteTitle: "Clear cached data",
    deleteNote:
      "Removes your cached workouts and replay detail from rowplay and signs you out. Your Concept2 logbook is untouched.",
    deleteAction: "Delete my cached data",
    deleteConfirm:
      "Delete all cached workouts and replay data from rowplay and sign out? Your Concept2 logbook will not be changed.",
    deleteDemo: "Demo mode — nothing was stored, so there is nothing to delete.",
    deleteDone: "Cached data cleared. You have been signed out.",
    deleteFailed: "Could not clear cached data",
    timezoneTitle: "Home timezone",
    timezoneNote:
      "Choose your local timezone so workouts rowed near midnight appear on the right calendar day.",
    timezoneLabel: "Home timezone",
    timezoneSaved: "Timezone saved",
    timezoneUtcDefault: "UTC (default)",
    timezoneGroupAmericas: "Americas",
    timezoneGroupEuropeAfrica: "Europe / Africa",
    timezoneGroupAsiaPacific: "Asia / Pacific",
    lastSyncError: "{total} workouts · last sync failed: {message}",
    partialCache: "{n} workouts cached · history still loading",
    exportPreviewCsv: "CSV: one row per workout, stable column order (17 columns)",
    exportPreviewJson: "JSON: array wrapped with schema metadata (version 1)",
    exportPreviewTcx: "TCX 2.0: per-stroke trackpoints, Garmin/Strava compatible",
    noTcxAvailable: "No workouts with per-stroke data for TCX export.",
  },
  token: {
    title: "Use your Concept2 token",
    introBefore: "Paste a personal API token from your Concept2 logbook (",
    introLink: "Edit Profile → Applications",
    introAfter:
      "). Paste it here once — rowplay sends it to the Worker over HTTPS, validates it, seals it into the httpOnly rp_tok cookie, and uses it only for server-side logbook reads. The token is never stored in KV or D1.",
    trustTitle: "How rowplay handles the token",
    trustAccessTitle: "Access:",
    trustAccessBody:
      "a personal Concept2 token authenticates as you; rowplay uses it only to read your profile, workouts and stroke data server-side.",
    trustStoredTitle: "Storage:",
    trustStoredBody:
      "the validated token is sealed into the httpOnly rp_tok cookie, not localStorage, KV or D1.",
    trustDisconnectTitle: "Disconnect:",
    trustDisconnectBody:
      "log out or delete account data from Data to clear the token cookie, session and private cache.",
    trustCacheTitle: "Cache:",
    trustCacheBody:
      "D1 caches workout summaries and replay detail while connected; public shares or leaderboard entries are created only when you publish.",
    apiToken: "API token",
    placeholder: "Paste your token",
    connect: "Connect with token",
    connecting: "Connecting…",
    rejected: "Concept2 rejected that token. Check it and try again.",
    serverMisconfigured:
      "This deployment isn’t set up for token sign-in (missing SESSION_SECRET). Contact the site owner.",
    empty: "Paste your Concept2 API token.",
    preferBefore: "Prefer the standard flow? ",
    preferLink: "Connect Concept2",
  },
  comparability: {
    blockedTitle: "Incomparable workouts",
    guidance: "Choose two workouts of the same machine, piece type, and distance or duration band.",
    noComparableCandidates: "No comparable sessions found.",
    groupComparable: "Comparable",
    groupIncomparable: "Other (incomparable)",
    reason: {
      crossSport: "These workouts are on different machines.",
      crossAxis: "One is a fixed-distance piece; the other is a fixed-time piece.",
      crossBand: "These workouts are in different distance or duration bands.",
    },
  },
  compare: {
    title: "Compare workouts",
    lead: "Side-by-side stats and overlay charts for any two sessions.",
    back: "Back to dashboard",
    workoutA: "Workout A",
    workoutB: "Workout B",
    choose: "Choose…",
    run: "Compare",
    swap: "Swap",
    pickTwo: "Pick two workouts above to compare.",
    deltaTable: "Head-to-head stats",
    deltaHint: "Positive delta means workout A is higher.",
    alignedNote: "Aligned over {distance}",
    noStrokeData: "No stroke data available for overlay charts.",
    winnerA: "Workout A wins",
    winnerB: "Workout B wins",
    tie: "Tie",
    verdictTimeA: "Workout A was {seconds}s faster",
    verdictTimeB: "Workout B was {seconds}s faster",
    verdictPaceA: "Workout A was {delta} faster",
    verdictPaceB: "Workout B was {delta} faster",
    statTime: "Time",
    statPace: "Pace",
    statAvgPower: "Avg power",
    statBest5sPower: "Best 5s power",
    statAvgHr: "Avg HR",
    statDps: "Dist/stroke",
    statConsistency: "Consistency",
    statMetric: "Metric",
    statDelta: "Δ (A − B)",
    repTimeDelta: "Time Δ",
    vsDistance: "vs distance",
    intervalTitle: "Interval comparison",
    intervalHint: "Per-rep pace and time deltas.",
  },
} as const;
