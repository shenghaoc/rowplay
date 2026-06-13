export const ja = {
  liveMode: {
    title: "ライブモード",
    enabled: "新しいワークアウトを自動同期",
    enabledHint: "選択した間隔でログブックを確認します",
    interval: "確認間隔",
    intervalSec: "{n} 秒",
    intervalMin: "{n} 分",
    lastPollLabel: "前回の確認",
    nextPollLabel: "次回の確認",
    polling: "新しいワークアウトを確認中…",
    sound: "通知音",
    soundHint: "新しいワークアウトが現れたら控えめなチャイムを鳴らします",
    newWorkout: "新しいワークアウト — {distance} · {time} · {sport}",
    newWorkouts: "{count} 件の新しいワークアウトを同期しました",
    view: "表示",
    error: "ライブ同期に失敗しました",
    errorRetry: "自動的に再試行します",
    rateLimit: "レート制限に達しました — 確認頻度を下げます",
    reauth: "セッションの有効期限が切れました — 再度ログインしてください",
    recovered: "ライブ同期を再開しました",
    warning: "ライブ同期が {count} 回連続で失敗しました",
  },
  annotations: {
    title: "コーチングノート",
    addNote: "ノートを追加",
    editNote: "ノートを編集",
    deleteNote: "削除",
    saveNote: "保存",
    cancelNote: "キャンセル",
    addPlaceholder: "この瞬間に選手が意識すべきことは？",
    noNotes:
      "まだコーチングノートがありません。スクラバーを任意の時点までドラッグしてノートを追加してください。",
    confirmDelete: "このノートを削除しますか？",
    seekTo: "{time} にジャンプ",
    timestampLabel: "時点：",
    pinnedTo: "固定位置：",
    saveError: "ノートを保存できませんでした。もう一度お試しください。",
    deleteError: "ノートを削除できませんでした。もう一度お試しください。",
  },
  leaderboard: {
    title: "ランキング",
    lead: "同じ種目で他の rowplay アスリートのゴーストと競争しましょう。種目と標準距離を選んで順位を確認します。",
    sport: "種目",
    distance: "距離",
    rank: "順位",
    athlete: "アスリート",
    time: "タイム",
    pace: "ペース",
    gap: "差",
    actions: "操作",
    you: "あなた",
    athletes: "{n} 人のアスリート",
    open: "開く",
    race: "対戦",
    raceHint: "「対戦」は、この種目の自分のリプレイにライバルをゴーストとして配置します。",
    empty: "この一覧にはまだ記録がありません — 最初の記録を公開しましょう。",
    publish: "ランキングに公開",
    publishing: "公開中…",
    publishOk: "公開しました — {sport} {distance} で {rank} 位です。",
    publishOffBoard: "公開できるのは標準距離（500m、1k、2k、5k、6k、10k、ハーフ）のみです。",
    publishFailed: "ランキングに公開できませんでした",
    publishNote:
      "公開すると、この記録は rowplay のランキングで公開されます。Concept2 のログブックには一切変更を加えません。",
    withdraw: "ランキングから削除",
    withdrawing: "削除中…",
    withdrawOk: "ランキングから削除しました。",
    withdrawFailed: "ランキングから削除できませんでした",
    ghostFallbackToast: "ライバルのストロークを読み込めませんでした — 平均ペースでレースします",
  },
  nav: {
    dashboard: "ダッシュボード",
    leaderboard: "ランキング",
    docs: "ヘルプ",
    settings: "データ",
    menuOpen: "メニューを開く",
    menuClose: "メニューを閉じる",
    skipToContent: "本文へスキップ",
  },
  common: {
    demoMode: "デモモード",
    replay: "リプレイ",
    loading: "読み込み中…",
    tryAgain: "もう一度お試しください。",
    dismiss: "閉じる",
    notAffiliated: "Concept2 とは無関係です",
    tagline: "rowplay · Concept2 ログブック分析 & リアルタイムリプレイ",
  },
  sync: {
    loading: "同期中…",
    done: "新規 {added} · 合計 {total} ワークアウトをキャッシュ",
    failed: "同期に失敗しました",
    incrementalDone: "最新です — {total} ワークアウトをキャッシュ",
    retry: "再試行",
    errorBadge: "前回の同期に失敗",
    errorHint: "{message}",
    demoUnavailable: "デモモードでは同期不可 — ログブックに接続して実データを同期してください。",
    partialWarning:
      "履歴はまだ読み込み中です — 同期が完了するまで合計と自己ベストが不完全な場合があります。",
    inProgress: "同期実行中…",
    historyWindow: "直近 {months} か月を表示 — より古い履歴を読み込み中…",
    historyBackfilling: "{total} ワークアウト · 履歴は {date} まで",
    historyComplete: "全履歴の同期が完了しました",
  },
  auth: {
    connect: "Concept2 に接続",
    useToken: "トークンを使う",
    logout: "ログアウト",
  },
  theme: { toLight: "ライトモードに切り替え", toDark: "ダークモードに切り替え" },
  lang: { switch: "言語を切り替え" },
  pwa: {
    updateAvailable: "rowplay の新しいバージョンが利用できます。",
    reload: "再読み込み",
  },
  landing: {
    tagline: "Concept2 · RowErg · SkiErg · BikeErg",
    title1: "ワークアウトをリプレイ。",
    title2: "スプリットを読み解く。",
    lead: "rowplay は Concept2 ログブックに接続し、各結果を豊富な分析へ — そしてストロークごとに追えるリアルタイムリプレイへ変換します。ライブコースと同期したペース・レート・パワー・心拍テレメトリ付きです。",
    exploreDemo: "デモを試す →",
    openDashboard: "ダッシュボードを開く →",
    connect: "Concept2 ログブックに接続 →",
    readGuide: "ガイドを読む",
    demoNote:
      "サンプルデータのデモモードで動作中。個人トークンを追加すると自分のログブックを読み込めます。",
    feat1Title: "リアルタイムリプレイ",
    feat1Body: "ペースがコースを走り抜ける様子を、ゲージとチャートが同期して再生。",
    feat2Title: "スプリット分析",
    feat2Body: "ペース・ストロークレート・パワー・HR の推移 — 3 台すべてに対応。",
    feat3Title: "エッジで配信",
    feat3Body: "Cloudflare から配信。ストロークデータをキャッシュし、即座にリプレイ。",
    tourEyebrow: "初回",
    tourTitle: "最初に試す 4 つ",
    tourBody:
      "ダッシュボードを見て、リプレイを開き、リーダーボードのゴーストと競い、外部で確認したいデータをエクスポートします。",
    tourDashboard: "ダッシュボード：合計、トレンド、PB",
    tourReplay: "リプレイ：同期したコースとゲージ",
    tourGhost: "ゴーストレース：過去またはライバルを追う",
    tourExport: "エクスポート：CSV、JSON、リプレイファイル",
    tourDismiss: "初回ツアーを閉じる",
  },
  docs: {
    title: "ユーザーガイド",
    description:
      "rowplay の使い方：はじめに、ローイング用語、ペースとワット、グラフ、よくある操作、FAQ、トラブルシューティング。",
    badge: "リポジトリ由来の docs",
    openDashboard: "ダッシュボードを開く",
    openSource: "ソースを開く",
    navLabel: "ユーザーガイドのセクション",
    contextual: {
      gettingStarted: "初めてですか？「はじめに」ガイドを読む",
      metrics: "ペース・ワット・ストロークレートの意味は？",
      charts: "このグラフの読み方",
      troubleshooting: "データが見つからない・おかしい？ トラブルシューティングへ",
      workflows: "リーダーボードとゴーストレースの仕組みを知る",
    },
    sections: {
      overview: {
        navTitle: "概要",
        markdown: `# rowplay ユーザーガイド

rowplay は、インドアのローイング・スキー・バイクのワークアウトを探索できるものに変えます。合計とトレンドのダッシュボード、ストロークごとのリプレイ、横並びの比較、そして気軽なリーダーボードです。

Concept2 のマシン — RowErg（ローイングマシン）、SkiErg、BikeErg — で記録したワークアウトに対応し、無料の Concept2 オンラインログブックから読み取ります。ローイングの専門用語を知らなくても大丈夫：このガイドは使う用語をすべて説明します。

## ここでできること

- **ダッシュボード** — 合計、トレンド、自己ベスト、トレーニング負荷をひと目で。
- **リプレイ** — どのワークアウトもストロークごとに再生。ペース、ストロークレート、パワー、心拍のグラフが同期して動きます。
- **比較** — 2 つのワークアウトをスプリットごとに横並びで。
- **リーダーボード** — 結果を公開し、他のアスリートと画面上の「ゴースト」としてレース。

## ガイドのセクション

- [はじめに](/docs/getting-started) — デモモード、ログブックの接続、最初の同期。
- [ローイングの基礎](/docs/rowing-metrics) — ストローク、スプリットなど、出会う用語の説明。
- [ペース・スプリット・ワット](/docs/pace-splits-watts) — 数値の意味と関係。
- [グラフと進歩](/docs/charts-and-progress) — ダッシュボードのパネルの読み方。
- [よくある操作](/docs/workflows) — リプレイ、ゴーストレース、比較、共有、エクスポート。
- [FAQ](/docs/faq) — アカウント、プライバシー、データに関する手短な回答。
- [トラブルシューティング](/docs/troubleshooting) — 欠けたデータ、おかしな数値、表示の問題。

> ヒント：rowplay はサンプルワークアウト入りのデモモードで起動します。Concept2 アカウントを接続する前に、このリストのすべてを試せます。`,
      },
      gettingStarted: {
        navTitle: "はじめに",
        markdown: `# はじめに

## まずはデモを試す

rowplay はデモモードで起動します。アカウントを接続していない状態では、すべてのページがリアルなサンプルワークアウトで埋まります。デモモードでの操作が実際のアカウントに影響することはありません。

1. [ダッシュボード](/dashboard)を開く。
2. リストから好きなワークアウトを選ぶ。
3. **リプレイ**を押して、再生・一時停止・スクラブ・速度の操作を試す。
4. [リーダーボード](/leaderboard)を開いてゴーストレースを試す。

## 自分のワークアウトを接続する

あなたのワークアウトは Concept2 ログブックにあります。Concept2 のマシン（と ErgData アプリ）が結果をアップロードする無料のオンライン記録帳です。rowplay は個人アクセストークン — データの読み取り鍵として働く長いコード — を使ってそのログブックを読み取ります。

1. log.concept2.com でログブックにサインインする。
2. **Edit Profile → Applications** を開き、個人 API トークンをコピーする。
3. rowplay に戻り、[トークンを使う](/auth/token)を開く。
4. トークンを貼り付けて送信する。
5. ダッシュボードで**同期**を押してワークアウト履歴を読み込む。

トークンは暗号化された接続で一度だけ送られ、保護されたブラウザの Cookie のみに保持されます。rowplay のサーバーはページを速く表示するためにワークアウトデータをキャッシュしますが、トークン自体を保存することはありません。

## 最初の同期

最初の同期は直近のワークアウトをすぐに読み込み、古い履歴をバックグラウンドで埋めていきます。完了するまで、長期の合計や自己ベストが不完全に見えることがあります — これは正常です。その後もおかしい場合は[トラブルシューティング](/docs/troubleshooting)を見てください。

## 接続を解除する

いつでも[データ](/settings)を開いて接続を解除できます。セッションが消去され、キャッシュされたワークアウトデータが rowplay から削除されます。Concept2 ログブックが変更されることはありません。`,
      },
      rowingMetrics: {
        navTitle: "ローイングの基礎",
        markdown: `# ローイングの基礎

インドアローイングが初めて — あるいはその語彙だけが初めて？ rowplay が使う用語を説明します。

## マシン

- **RowErg** — Concept2 のローイングマシン（「エルゴ」は仕事量を測る機械、エルゴメーターの略）。
- **SkiErg** — クロスカントリースキーのポール動作を再現する立位のマシン。
- **BikeErg** — Concept2 のステーショナリーバイク。

3 つとも同じ方法で運動量を測るため、rowplay は同じ種類の数値で表示します。

## ストローク

1 **ストローク**は動作の 1 サイクル — RowErg ではレッグドライブ、プル、そしてスタート位置への戻りです。ストロークは 2 つの数値で表されます。

- **ストロークレート（spm）** — 1 分あたりのストローク数。動作を回す速さで、安定したローイングはおよそ 18〜30 spm です。
- **1 ストロークあたりの距離（DPS）** — 1 ストロークで進むメートル数。高いほど、力強く効率的なストロークであることが多いです。

ストロークレートが高くても速いとは限りません。1 分間に 20 回の力強いストロークは、30 回の慌てたストロークより速く進むことがあります。

## 距離と時間

マシンはあなたの運動を**メートル**に換算します。ボート（やスキー、バイク）でコースを進んでいるかのような距離です。ワークアウトは距離ベース（「2000m 漕ぐ」）か時間ベース（「30 分漕ぐ」）です。**インターバルワークアウト**は、4 × 500m のように休憩を挟んだ繰り返しに分割します。

## ペースとスプリット

**ペース**は一定距離にかかる時間です — RowErg と SkiErg は 500 メートル、BikeErg は 1000 メートルあたり。**スプリット**はワークアウトの一区間でのペースです。この 2 つはエルゴトレーニングの中心なので、[専用のページ](/docs/pace-splits-watts)があります。

## 心拍数

マシンや ErgData アプリに接続した心拍ベルトや時計を着けていれば、毎分の拍数（**bpm**）が他の数値と並んで表示され、リプレイでは専用のグラフになります。`,
      },
      paceSplitsWatts: {
        navTitle: "ペース・スプリット・ワット",
        markdown: `# ペース・スプリット・ワット

エルゴトレーニングの中心となる数値です。計算はすべて rowplay が行います — それでも意味を知っていれば、どのグラフも読みやすくなります。

## ペース：500m あたりの時間

ペースは「この速さなら 500 メートルに何分かかるか」に答えます。時計の時刻のように書きます — **2:05** は 500m あたり 2 分 5 秒という意味です。

- **小さいほど速い。** 1:55 は 2:05 より速いペースです。
- グラフでは、ペースの向上は線が**下がる**ことを意味します。
- **BikeErg のペースは 1000m あたり**です（バイクは速いため）。rowplay が自動で処理するので、バイクのペースがローイングと似て見えても驚かないでください。

## スプリット

スプリットはワークアウトの一区切りでの平均ペースです — 2000m の各 500m や、インターバルセッションの各本数など。スプリットを比べると力の使い方が見えます：イーブンペース、終盤の失速、あるいは速いラストスパート（「ネガティブスプリット」は各スプリットが前より速いこと）。

## ワット

ワットは出力 — 電球と同じ単位 — を測ります。ペースが結果を示すのに対し、ワットは仕事量を示します。両者は同じ努力の 2 つの見方です。おおよそ 2:00/500m を保つには約 200 ワットが必要で、わずかなペース向上にも不釣り合いに大きなパワーが要ります — 2:00 から 1:54 へは約 30 ワットの上乗せです。

安定したローイングは体力に応じて 100〜250 ワットほど。スプリントでははるかに高くなります。

## ストロークレートは努力の量ではない

ストロークレート（spm）は漕ぐ頻度を示すだけで、強さではありません。2 人のローワーが同じ 2:00 ペースを保つこともあります — 1 人は 1 分 22 回の力強いストローク、もう 1 人は 28 回の軽いストロークで。ペース**と**レートを一緒に見る（リプレイは両方を描きます）と技術が見えてきます。同じペースで低いレートなら、1 ストロークあたりの距離が長いということです。

## どこで見られるか

- **ダッシュボード**はワークアウト全体の平均ペース、合計、自己ベストを表示します。
- **リプレイ**はワークアウト全体のペース、ストロークレート、ワット、心拍を再生と同期して描きます。
- リプレイの**インターバル比較**は、インターバルワークアウトをスプリットごとの棒グラフに分解します。`,
      },
      chartsAndProgress: {
        navTitle: "グラフと進歩",
        markdown: `# グラフと進歩

ダッシュボードは履歴を一連のパネルに変えます。このページはその読み方を説明します。

## 時間のトレンド

トレンドグラフは 1 つの指標 — ペース、距離、ストロークレート、1 ストロークあたりの距離 — を数週間のワークアウトにわたって追います。公平さを保つため、ペースのトレンドは**同条件どうし**を比較します。スプリントと長い安定漕ぎが 1 本の線に混ざることはありません。ワークアウトは距離帯にグループ化され、見たい帯を選びます。

- **ペース**は下がるほど良い（500m あたりの時間が短い）。
- グラフ上部の判定行が方向を要約します：向上中、横ばい、後退中。
- トレンドを描くには、同じ距離帯に少なくとも 2 回のセッションが必要です。

## 自己ベスト

PB パネルは標準距離（500m、1k、2k、5k、6k、10k など）での最速記録を追跡します。全期間のベストを信頼する前に、完全同期が終わっていることを確認してください — [トラブルシューティング](/docs/troubleshooting)参照。

## トレーニングカレンダーと強度

カレンダーはトレーニング量に応じて日ごとに色付けされ、継続や空白がひと目で分かります。強度ビューは、トレーニングが楽な運動ときつい運動にどう配分されているかを示します。

## フィットネス・疲労・フォーム

フレッシュネスパネルはトレーニング負荷から 3 本の曲線を推定します。**フィットネス**（長期に積み上げた仕事量）、**疲労**（直近セッションによる短期的な疲れ）、**フォーム**（フィットネス − 疲労 — 今日の調子）。激しく練習するとフィットネスと疲労は一緒に上がり、休むと疲労はフィットネスより速く下がります。だからフォームは楽な期間のあとにピークを迎えるのです。

## クリティカルパワー

クリティカルパワーパネルは、長時間の運動で維持できる最大出力を、自分のベスト記録から推定します。これがペース予測 — 最近走っていない距離で維持できそうなペースの見積もり — を支えます。

## ストローク効率（DPS）

DPS グラフは 1 ストロークで得たメートル数を追います。ペース正規化トグルは「単に強く漕いだ」効果を取り除くので、残るのはより純粋な技術です。直近の調子には 7 日平均、大きな流れには 28 日平均を使ってください。`,
      },
      workflows: {
        navTitle: "よくある操作",
        markdown: `# よくある操作

## ワークアウトをリプレイする

ダッシュボードからワークアウトを開き、**リプレイ**を押します。

- **再生 / 一時停止**で再生を制御。コースビューとすべてのゲージが同期します。
- タイムラインを**スクラブ**して任意の瞬間にジャンプ。
- **速度**は実時間の 0.5×〜8× でリプレイを再生します。
- コースビューを **2D と 3D** で切り替え（3D には比較的新しいブラウザが必要）。
- **目標ペース**を設定すると、ペースグラフに基準線が引かれます。

アニメーションはワークアウトの実際のレートに同期します。記録された 1 ストロークごとに 1 漕ぎ（ポールプラントやペダル 1 回転）が再現され、キャッチのたびに水しぶきや雪煙が上がり、再生速度に合わせて速くなります。3D のチェイスカメラは、艇速が上がるとわずかに画角を広げます。

3D では**画質**セレクターで低・中・高を選べます。端末が滑らかなフレームレートを維持できない場合は、解像度、次にエフェクトの順で自動的に下げるため、どのハードウェアでも安心して高画質を試せます。リプレイのアニメーションは OS の「視差効果を減らす」設定に従います。

Concept2 が提供する場合はストローク単位のデータを使います。ストロークデータがないワークアウトは split ベースのリプレイに戻るため、コースは引き続き再生されます。

## コーチングノートを追加する

リプレイのある瞬間で一時停止してノートを追加します（「ここでスライドを急ぎすぎ」など）。ノートはタイムラインにピン留めされ、自分でも、リプレイを共有した相手でも、そこへ直接ジャンプできます。

## ゴーストとレースする

ゴーストとは、画面上であなたと並んで漕ぐ過去の記録です。

1. [リーダーボード](/leaderboard)を開き、スポーツと距離を選ぶ。
2. エントリーの横の**レース**を押す。
3. その種目の自分のリプレイに、ライバルが追いかけるべき 2 艇目として現れます。

自分の過去の記録ともレースできます。自己ベスト挑戦がどこで時間を稼ぎ、どこで失ったかが正確に分かります。

## 2 つのワークアウトを比較する

ダッシュボードのワークアウトリストで、1 つ目のワークアウトの比較ボタンを使い、2 つ目を選びます。比較ビューが両方の記録をスプリットごとに並べます。

## リーダーボードに公開する

標準距離（500m、1k、2k、5k、6k、10k、ハーフマラソン）の結果は、リプレイページから rowplay のリーダーボードに公開できます。公開は任意で、取り消し可能で、Concept2 ログブックの内容を変えることはありません。

## 共有とエクスポート

- リプレイの**共有**は、読み取り専用の公開リンクを作ります — コーチに見せるのに便利です。
- [データ](/settings)ページの**エクスポート**は、ログブックを CSV または JSON でダウンロードできます。ストロークデータのあるワークアウトはワークアウトごとの TCX ファイルも可能です。

## データを最新に保つ

ダッシュボードの**同期**は、必要なときに新しい結果を取得します。**ライブモード**（同じくダッシュボード）は予定間隔でログブックを確認し、新しいワークアウトが届くと知らせます — セッション直後に便利です。

## 心拍をインポートする

ワークアウトに心拍データがなく、時計が記録している場合は、リプレイを開いて**心拍をインポート**を使い、時計の CSV・TCX・FIT エクスポートをワークアウトに統合します。`,
      },
      faq: {
        navTitle: "FAQ",
        markdown: `# FAQ

## Concept2 アカウントは必要？

見て回るだけなら不要です — デモモードはアカウントなしで動きます。自分のワークアウトを見るには、マシン（や ErgData アプリ）が結果を保存する無料の Concept2 ログブックアカウントが必要です。

## アクセストークンは安全？

トークンは HTTPS で一度だけ送信され、保護された httpOnly のブラウザ Cookie に封印されます。rowplay のサーバーに保存されることはありません。接続解除で消去されます。

## 他の人に自分のワークアウトが見える？

いいえ — ダッシュボードとリプレイは初期状態で非公開です。リーダーボードに公開するか、公開リンクを共有した場合にのみ見えます。どちらも取り消せます。

## rowplay は Concept2 ログブックを変更する？

決して変更しません。rowplay は読み取り専用です。rowplay のリーダーボードへの公開や、ここでのキャッシュデータ削除が、元のログブックエントリーを変えることはありません。

## 対応マシンは？

RowErg、SkiErg、BikeErg です。ペースはローイングとスキーが 500m あたり、バイクが 1000m あたりで表示されます。

## 一部のワークアウトにストロークごとのリプレイがないのは？

すべてのログブックエントリーがストロークごとのデータを含むわけではありません — 記録方法によります。そうしたワークアウトもスプリットを使って再生されます。データ点が少なくなるだけです。

## スマホで使える？

はい — リプレイを含むアプリ全体がモバイルブラウザで動き、アプリのようにホーム画面に追加できます。

## 使える言語は？

English、Deutsch、Español、Français、日本語、中文 — ヘッダー（モバイルではメニューボタンの中）から切り替えられます。`,
      },
      troubleshooting: {
        navTitle: "トラブルシューティング",
        markdown: `# トラブルシューティング

## 合計や自己ベストがおかしい

多くの場合、完全な履歴の同期がまだ終わっていません。最初の同期は古いワークアウトをバックグラウンドで埋めていきます。完了するまで、「全期間」で計算されるものは不完全になり得ます。[データ](/settings)で同期状態を確認し、必要なら完全同期を実行してください。

## ペースが大きくずれて見える

- **BikeErg のペースは 1000m あたり**で、500m あたりではありません — バイクの 2:00 ペースはローイングの 2:00 と同じ速さではありません。
- インターバルワークアウトはワークインターバルのペースを報告します。休憩は数えません。

## トレンドグラフがセッション不足だと言う

トレンドは同条件の距離を比較するため、同じ距離帯に少なくとも 2 回のセッションが必要です。似たワークアウトをもう 1 回記録するとトレンドが表示されます。

## ワークアウトにストロークのグラフがない

そのログブックエントリーにはストロークごとのデータがありません — 古い記録や一部の記録方法でよくあることです。リプレイはスプリットにフォールバックします。ストロークに依存するパネル（1 ストロークあたりの距離、ストローク比較）はストロークデータが必要で、欠けている場合はその旨を表示します。

## 心拍がない

ログブックに心拍があるのは、ワークアウト中にベルトや時計が接続されていた場合だけです。時計が別に記録していた場合は、リプレイページの**心拍をインポート**で CSV・TCX・FIT エクスポートをワークアウトに統合してください。

## 同期が失敗する・セッションが切れる

個人トークンは期限切れや取り消しがあり得ます。Concept2 プロフィールの新しいトークンで[トークンを使う](/auth/token)から再接続してください。短時間に多くのリクエストがあった場合、ログブックが一時的にレート制限することがあります — 1 分待って再試行してください。

## 新しいワークアウトが現れない

まずワークアウトが Concept2 ログブックに届いているか確認してください（マシンか ErgData アプリからのアップロードが必要です）。次にダッシュボードで**同期**を押すか、ライブモードを有効にして自動確認させてください。

## 表示の問題

- **3D リプレイが始まらない** — ブラウザに WebGPU または WebGL が必要です。2D ビューは常に動きます。
- **スマホでグラフが窮屈** — 横向きにすると広いグラフになります。小さい画面ではパネルが並べ替わります。
- **テーマや言語が違う** — どちらの切り替えもヘッダー（モバイルではメニューボタンの中）にあり、ブラウザごとに記憶されます。

まだ困っていますか？ [FAQ](/docs/faq) がさらにカバーしています。このガイドのすべてのページはヘッダーの**ヘルプ**から開けます。`,
      },
    },
  },
  dashboard: {
    eyebrow: "あなたのログブック",
    title: "結果とリプレイ",
    all: "すべて",
    sync: "同期",
    syncing: "同期中…",
    syncedNote: "{total} セッション · 最終同期 {date}",
    recentNote:
      "最近のワークアウトを表示中 — 「同期」で全履歴を読み込み、正確な PB とトレンドを確認してください。",
    latest: "最新",
    distance: "距離",
    time: "時間",
    avgRate: "平均レート",
    distStroke: "距離/ストローク",
    avgBpm: "平均 bpm",
    vsAvg: "あなたの {sport} 平均との比較",
    sessions: "セッション数",
    totalDistance: "総距離",
    totalTime: "総時間",
    avgPace: "平均ペース",
    sectionCoreEyebrow: "ここから",
    sectionCore: "今日の読み取り",
    sectionWorkoutsEyebrow: "ワークアウト",
    sectionWorkouts: "リプレイを探す",
    sectionWorkoutsBody:
      "深い分析パネルに入る前に、ワークアウトを絞り込み、タグ付け、比較、再生できます。",
    sectionRecordsEyebrow: "目標",
    sectionRecords: "目標、バッジ、PB",
    sectionRecordsBody:
      "シーズン目標、マイルストーン、標準距離ベスト、予測ツールをまとめています。",
    sectionAdvancedEyebrow: "分析",
    sectionAdvanced: "高度な分析",
    sectionAdvancedBody:
      "パワーモデル、トレーニング負荷、ストローク効率、長期トレンドを詳しく確認できます。",
    sectionPower: "CP/W′ とコンディション",
    sectionPowerBody:
      "自分の履歴からクリティカルパワー、維持可能ペース、負荷バランスを確認します。",
    sectionTraining: "トレーニング構造",
    sectionTrainingBody: "カレンダー、強度、トレンドで練習の配分を確認します。",
    sectionStroke: "ストローク効率と種目別",
    sectionStrokeBody: "DPS トレンドとマシン別サマリーで技術とペースの文脈を見ます。",
    tour: {
      eyebrow: "デモガイド",
      title: "まずこれを試す",
      body: "これらのヒントは任意で、このブラウザでは閉じた状態が保存されます。",
      dismissHint: "{title} を閉じる",
      latestReplay: {
        title: "最新ワークアウトを再生",
        body: "最新のデモピースを開いて再生します。",
        action: "リプレイを開く",
      },
      criticalPower: {
        title: "CP/W′ を確認",
        body: "持続パワーモデルとペース予測を見ます。",
        action: "パネルへ移動",
      },
      workoutFilters: {
        title: "フィルターを使う",
        body: "距離、タグ、ストロークデータ、ペースで絞り込みます。",
        action: "フィルターを試す",
      },
      leaderboardGhost: {
        title: "リーダーボードのゴーストと競う",
        body: "標準ボードを開き、Race でライバルを事前設定します。",
        action: "リーダーボードを開く",
      },
    },
    pbTitle: "自己ベスト · 標準距離",
    bySport: "種目別",
    thSport: "種目",
    thSessions: "セッション",
    thDistance: "距離",
    thTime: "時間",
    thAvgPace: "平均ペース",
    thBestPace: "ベストペース",
    trendTitle: "経時トレンド",
    likeForLike: "{sport}、同距離比較",
    mPace: "ペース",
    mDistStroke: "距離/ストローク",
    mDistance: "距離",
    mRate: "レート",
    holdingSteady: "安定 — {days} 日間 {metric} は横ばい",
    improving: "向上中 — {days} 日で {change}",
    slipping: "低下 — {days} 日で {change}",
    faster: "{delta} 速い",
    slower: "{delta} 遅い",
    emptyTrend: "この帯域は {n} セッションのみ — あと 1 回 {band} を記録するとトレンドが見えます。",
    dpsTrend: {
      title: "ストローク効率 (DPS)",
      raw: "生 DPS",
      normalised: "ペース正規化",
      ma7: "7 日平均",
      ma28: "28 日平均",
      yLabel: "m/ストローク",
      empty: "ストローク数データがありません",
      tooltipPace: "平均ペース",
      tooltipDps: "DPS",
    },
    calTitle: "トレーニングカレンダー",
    calMetricDistance: "距離",
    calMetricTime: "時間",
    calActiveDays: "アクティブ {n} 日",
    calCurrentStreak: "{n} 日連続",
    calLongestStreak: "最長: {n} 日",
    calLess: "少",
    calMore: "多",
    calTooltip: "{date} · {sessions} セッション · {volume}",
    calEmpty: "{date} · トレーニングなし",
    calAria: "トレーニングカレンダー、アクティブ {active} 日、現在 {streak} 日連続",
    calDowSun: "日",
    calDowMon: "月",
    calDowTue: "火",
    calDowWed: "水",
    calDowThu: "木",
    calDowFri: "金",
    calDowSat: "土",
    tid: {
      title: "トレーニング強度",
      time: "時間",
      distance: "距離",
      period4w: "直近4週間",
      period3m: "直近3か月",
      period12m: "直近12か月",
      empty: "この期間にワークアウトがありません",
      zone: {
        UT2: "UT2 — 回復",
        UT1: "UT1 — 有酸素",
        AT: "AT — 閾値",
        TR: "TR — レースペース",
        AN: "AN — 無酸素",
        Easy: "イージー",
        Moderate: "中強度",
        Hard: "高強度",
      },
    },
    formTitle: "フィットネスとコンディション",
    formAdvanced: "高度な分析",
    formSub: "全マシン横断のトレーニング負荷を、あなた自身のしきい値パワーに換算。",
    formFitness: "フィットネス",
    formFatigue: "疲労",
    formForm: "フォーム",
    formFitnessHint: "42 日負荷（CTL）",
    formFatigueHint: "7 日負荷（ATL）",
    formFormHint: "フィットネス − 疲労（TSB）",
    formFtp: "しきい値パワー",
    formCp: "クリティカルパワー",
    formModelled: "モデル推定",
    formEstimated: "推定",
    formRamp: "7 日間フィットネス変化",
    formChartFitness: "フィットネス",
    formChartFatigue: "疲労",
    formChartForm: "フォーム",
    formEmpty:
      "あと数週間セッションを記録すると、フィットネスとコンディションのチャートが表示されます。",
    bandTransition: "デトレーニング",
    descTransition: "かなり回復しているが、フィットネスは落ちている。そろそろ負荷を入れよう。",
    bandFresh: "フレッシュ",
    descFresh: "十分に休めてレース向き — 自己テストに適したタイミング。",
    bandNeutral: "ニュートラル",
    descNeutral: "バランスが取れている — 尖っても深く疲れてもいない。",
    bandProductive: "プロダクティブ",
    descProductive: "健康的で管理可能な疲労の下でフィットネスを構築中。",
    bandOverreaching: "オーバーリーチ",
    descOverreaching: "疲労が重い。負荷を抑え、回復を待とう。",
    goalsTitle: "シーズン目標とチャレンジ",
    goalsYear: "{year} 年の目標",
    goalsKindMeters: "距離（m）",
    goalsKindHours: "時間（時間）",
    goalsTargetMeters: "目標（m）",
    goalsTargetHours: "目標（時間）",
    goalsSave: "目標を保存",
    goalsSaving: "保存中…",
    goalsSaved: "目標を保存しました",
    goalsSaveFailed: "目標を保存できませんでした",
    goalsProgress: "{current} / {target}",
    goalsPct: "{pct}% 達成",
    goalsOnPace: "順調 — 年末予測 {projected}",
    goalsBehind: "遅れ — 予測 {projected} · あと {needed} 必要",
    goalsStreakCurrent: "{n} 日連続",
    goalsStreakCurrent_one: "{n} 日連続",
    goalsStreakLongest: "最長: {n} 日",
    goalsStreakLongest_one: "最長: {n} 日",
    goalsDaysSince: "前回セッションから {n} 日",
    goalsDaysSince_one: "前回セッションから {n} 日",
    goalsDaysSinceToday: "今日トレーニング済み",
    goalsWeekly: "{total} 週中 {active} 週がアクティブ",
    badgesTitle: "バッジ",
    badgeMeters100k: "10 万 m クラブ",
    badgeMeters500k: "50 万 m クラブ",
    badgeMeters1m: "100 万メートル",
    badgeMeters2m: "200 万メートル",
    badgeMeters5m: "500 万メートル",
    badgeClub500: "500 m クラブ PB",
    badgeClub1000: "1 k クラブ PB",
    badgeClub2000: "2 k クラブ PB",
    badgeClub5000: "5 k クラブ PB",
    badgeClub10000: "10 k クラブ PB",
    badgeEverySportWeek: "全種目週",
    pbTag: "PB",
    pbNew: "新 PB",
    pbCelebrate: "新しい {distance} PB — {time}！",
    pbCelebrateMore: "{count} 件の新 PB！",
    predictor: {
      title: "パフォーマンス予測",
      distance: "既知の距離",
      time: "既知のタイム",
      predict: "予測",
      colDistance: "距離",
      colPredicted: "予測",
      colBest: "自己ベスト",
      colStatus: "状態",
      beaten: "上回り",
      behind: "遅れ",
      untried: "未挑戦",
      noTime: "—",
      inputError: "有効なタイムを入力（例: 7:04）",
    },
    cpTitle: "クリティカルパワーとペース予測",
    cpSub:
      "Logbook の結果から作るベストエフォートのパワーモデルです。信頼度とデータ警告を明示します。",
    cpLabel: "クリティカルパワー（CP）",
    cpWPrime: "無酸素作業量（W′）",
    cpMethod: "フィット手法",
    cpExplainModel:
      "{scope} モデル: CP {cp} W と W′ {wPrime} kJ は、記録されたベスト努力からフィットしています。研究室での測定値ではなく、トレーニング用の推定として扱ってください。",
    cpExplainEstimate:
      "{scope} 推定: CP は最良の長めの努力から {cp} W と近似しています。CP/W′ をフィットするには、短・中・長時間の最大努力をさらに記録してください。",
    cpScopeLabel: "クリティカルパワーの範囲",
    cpScopeAll: "すべて",
    cpEmptyScope:
      "利用できる {scope} の努力がまだ足りません。このモデルを信頼する前に、複数の時間帯で最大努力のピースを追加してください。",
    cpConfidenceLabel: "信頼度",
    cpConfidence: { high: "高", medium: "中", low: "低", insufficient: "不足" },
    cpSample: "{n} 件の利用可能な努力 · {points} 個の包絡点",
    cpFreshness: "最新の努力 {date}",
    cpFit: "フィット R² {r2} · 残差 {residual}%",
    cpWarningsLabel: "モデル警告",
    cpWarning: {
      "too-few-efforts": "最大努力が少なすぎます",
      "narrow-duration-range": "時間範囲が狭い",
      "stale-efforts": "最新の努力が古くなっています",
      "mixed-sports": "複数スポーツが混在",
      "outlier-sensitive": "外れ値に敏感なフィット",
      "unrealistic-fit": "非現実的なフィットを却下",
      "estimate-only": "推定のみ",
    },
    cpPredictTitle: "どれくらい維持できる？",
    cpPredictSub:
      "選択したモデルから、単一スポーツのペースとフィニッシュタイムを予測します。ペースは /500m に正規化されています。",
    cpMixedPredictNote:
      "ペース予測にはスポーツを 1 つ選択してください。全スポーツ表示はパワーのみです。",
    cpModeDuration: "維持時間…",
    cpModeDistance: "所要時間…",
    cpHoldFor: "維持",
    cpMinutes: "分",
    cpDistance: "距離",
    cpPaceHint: "{scope} の約 {min} 分間のイーブンスプリットペース",
    cpTimeHint: "{dist} の {scope} 予測フィニッシュ",
    cpPreset6: "6 分",
    cpPreset20: "20 分",
    cpPreset30: "30 分",
    cpPreset60: "60 分",
    cpDist500: "500 m",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "パワー–時間: 実測 vs モデル",
    cpChartHint: "点はセッションベスト、線は CP/W′ の予測。線より上 = モデルを上回る。",
    cpChartActual: "あなたのベスト",
    cpChartModel: "CP モデル",
  },
  milestone: {
    title: "マイルストーン",
    next: "次の目標",
    lifetime_distance_rower_100k: "100km漕行",
    "lifetime_distance_rower_100k.toast": "🎉 100km漕行!",
    lifetime_distance_rower_250k: "250km漕行",
    "lifetime_distance_rower_250k.toast": "🎉 250km漕行!",
    lifetime_distance_rower_500k: "500km漕行",
    "lifetime_distance_rower_500k.toast": "🎉 500km漕行!",
    lifetime_distance_rower_1M: "100万m漕行",
    "lifetime_distance_rower_1M.toast": "🎉 100万m漕行!",
    lifetime_distance_rower_2M: "200万m漕行",
    "lifetime_distance_rower_2M.toast": "🎉 200万m漕行!",
    lifetime_distance_rower_5M: "500万m漕行",
    "lifetime_distance_rower_5M.toast": "🎉 500万m漕行!",
    lifetime_distance_rower_10M: "1000万m漕行",
    "lifetime_distance_rower_10M.toast": "🎉 1000万m漕行!",
    lifetime_distance_skierg_100k: "100km SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100km SkiErg!",
    lifetime_distance_skierg_250k: "250km SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250km SkiErg!",
    lifetime_distance_skierg_500k: "500km SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500km SkiErg!",
    lifetime_distance_skierg_1M: "100万m SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 100万m SkiErg!",
    lifetime_distance_skierg_2M: "200万m SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 200万m SkiErg!",
    lifetime_distance_skierg_5M: "500万m SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 500万m SkiErg!",
    lifetime_distance_skierg_10M: "1000万m SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 1000万m SkiErg!",
    lifetime_distance_bike_100k: "100km BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100km BikeErg!",
    lifetime_distance_bike_250k: "250km BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250km BikeErg!",
    lifetime_distance_bike_500k: "500km BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500km BikeErg!",
    lifetime_distance_bike_1M: "100万m BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 100万m BikeErg!",
    lifetime_distance_bike_2M: "200万m BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 200万m BikeErg!",
    lifetime_distance_bike_5M: "500万m BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 500万m BikeErg!",
    lifetime_distance_bike_10M: "1000万m BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 1000万m BikeErg!",
    lifetime_distance_combined_100k: "合計100km",
    "lifetime_distance_combined_100k.toast": "🎉 合計100km!",
    lifetime_distance_combined_250k: "合計250km",
    "lifetime_distance_combined_250k.toast": "🎉 合計250km!",
    lifetime_distance_combined_500k: "合計500km",
    "lifetime_distance_combined_500k.toast": "🎉 合計500km!",
    lifetime_distance_combined_1M: "合計100万m",
    "lifetime_distance_combined_1M.toast": "🎉 合計100万m!",
    lifetime_distance_combined_2M: "合計200万m",
    "lifetime_distance_combined_2M.toast": "🎉 合計200万m!",
    lifetime_distance_combined_5M: "合計500万m",
    "lifetime_distance_combined_5M.toast": "🎉 合計500万m!",
    lifetime_distance_combined_10M: "合計1000万m",
    "lifetime_distance_combined_10M.toast": "🎉 合計1000万m!",
    session_count_10: "10 ワークアウト",
    "session_count_10.toast": "🎉 10 ワークアウト!",
    session_count_25: "25 ワークアウト",
    "session_count_25.toast": "🎉 25 ワークアウト!",
    session_count_50: "50 ワークアウト",
    "session_count_50.toast": "🎉 50 ワークアウト!",
    session_count_100: "100 ワークアウト",
    "session_count_100.toast": "🎉 100 ワークアウト!",
    session_count_250: "250 ワークアウト",
    "session_count_250.toast": "🎉 250 ワークアウト!",
    session_count_500: "500 ワークアウト",
    "session_count_500.toast": "🎉 500 ワークアウト!",
    session_count_1000: "1000 ワークアウト",
    "session_count_1000.toast": "🎉 1000 ワークアウト!",
    session_count_2500: "2500 ワークアウト",
    "session_count_2500.toast": "🎉 2500 ワークアウト!",
    streak_7d: "7日連続",
    "streak_7d.toast": "🎉 7日連続!",
    streak_14d: "14日連続",
    "streak_14d.toast": "🎉 14日連続!",
    streak_30d: "30日連続",
    "streak_30d.toast": "🎉 30日連続!",
    streak_60d: "60日連続",
    "streak_60d.toast": "🎉 60日連続!",
    streak_100d: "100日連続",
    "streak_100d.toast": "🎉 100日連続!",
    pb_2k_sub8: "2k 8分切り",
    "pb_2k_sub8.toast": "🎉 2k 8分切り!",
    pb_2k_sub730: "2k 7:30切り",
    "pb_2k_sub730.toast": "🎉 2k 7:30切り!",
    pb_2k_sub7: "2k 7分切り",
    "pb_2k_sub7.toast": "🎉 2k 7分切り!",
    pb_2k_sub630: "2k 6:30切り",
    "pb_2k_sub630.toast": "🎉 2k 6:30切り!",
  },
  workout: {
    tag: {
      label: "タイプ",
      auto: "自動判定",
      "steady-state": "ステディ",
      interval: "インターバル",
      "race-piece": "レース距離",
      "time-trial": "タイムトライアル",
      "warmup-cooldown": "ウォームアップ / クールダウン",
      unknown: "その他",
      filter: { all: "すべてのタイプ" },
      saveError: "タグを保存できませんでした。もう一度お試しください。",
    },
  },
  workoutList: {
    empty: "このフィルターに該当するワークアウトはありません。",
    windowed: "{n} ワークアウト · パフォーマンスのため表示を制限",
    filtersTitle: "ワークアウトを探す",
    matching: "{n} 件一致",
    clearFilters: "フィルターをクリア",
    expand: "フィルターを増やす",
    collapse: "フィルターを減らす",
    dateFrom: "開始",
    dateTo: "終了",
    workoutType: "Logbook 種別",
    anyType: "すべての Logbook 種別",
    strokeData: "ストロークデータ",
    strokeAny: "すべて",
    strokeYes: "ストロークデータあり",
    strokeNo: "ストロークデータなし",
    searchComments: "コメントを検索…",
    search: "検索",
    distanceChips: "距離",
    durationChips: "時間",
    durationMin: "{n} 分",
    chipMarathon: "マラソン",
    sortGroup: "並べ替え",
    sortDate: "日付",
    sortDistance: "距離",
    sortTime: "時間",
    sortPace: "ペース",
    sortPower: "パワー",
    pbsOnly: "PB のみ",
    compare: "比較",
    comparePick: "比較する最初のワークアウトを選択",
    compareWith: "このワークアウトと比較",
    compareCancel: "キャンセル",
  },
  share: {
    shareReplay: "リプレイを共有",
    downloadImage: "画像をダウンロード",
    linkCopied: "共有リンクをコピーしました",
    linkReady: "このリンクがあれば誰でもリプレイを視聴できます",
    shareFailed: "共有リンクを作成できませんでした",
    privacyBlocked:
      "このワークアウトは Concept2 で公開されていないため共有できません。まずログブックでプライバシーを「Everyone」に設定してください。",
    imageSaved: "レースカードを保存しました",
    imageFailed: "レースカードを保存できませんでした",
    publicBanner: "共有リプレイ — 読み取り専用",
    ctaBefore: "自分のリプレイが欲しい？ ",
    ctaLink: "rowplay を試す",
    ctaAfter: " — Concept2 ログブック分析とワークアウトリプレイ。",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "平均パワー",
    raceCardAvgHr: "平均 HR",
  },
  replay: {
    hrImportTitle: "心拍数をインポート",
    hrImportHint:
      "このワークアウトにはログブックの心拍数がありません。ウォッチのエクスポート（CSV、TCX、FIT）をアップロードすると、リプレイに心拍数を重ねて表示できます。",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "ウォッチ開始オフセット",
    hrImportOffsetHint: "ウォッチが漕ぎ始めより前に開始した場合は正の値（秒）。",
    hrImportPreview: "{count} サンプル · 約 {avg} bpm 平均",
    hrImportApply: "心拍数を適用",
    hrImportClear: "インポートした心拍数を削除",
    hrImportApplied: "心拍数をインポートしました",
    hrImportCleared: "インポートした心拍数を削除しました",
    hrImportTooFew: "このファイルは心拍数サンプルが少なすぎます。",
    hrImportSaveFailed: "心拍数インポートを保存できませんでした",
    hrImportClearFailed: "心拍数インポートを削除できませんでした",
    back: "ダッシュボードに戻る",
    lowRes: "低解像度リプレイ",
    compareAgainst: "比較対象:",
    none: "なし",
    pastSession: "過去のセッション",
    constantPace: "一定ペース",
    uploadedFile: "アップロードしたファイル",
    chooseSession: "{sport} のセッションを選択…",
    setPace: "ペースを設定",
    targetPace: "目標ペース",
    targetPacePlaceholder: "分:秒",
    targetPaceSet: "目標ペースを設定",
    targetPaceClear: "クリア",
    targetPaceBand: "±5秒バンドを表示",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ {m} m リード",
    behind: "▼ {m} m ビハインド",
    searchSessions: "セッションを検索…",
    suggestedRival: "おすすめのライバル",
    raceVerdictWinSession: "{date} の {distance} に {seconds} 秒差で勝利（ゴール時 {m} m リード）",
    raceVerdictLoseSession:
      "{date} の {distance} に {seconds} 秒差で敗北（ゴール時 {m} m ビハインド）",
    raceVerdictWinPace: "{pace} ペースボートに {seconds} 秒差で勝利（ゴール時 {m} m リード）",
    raceVerdictLosePace: "{pace} ペースボートに {seconds} 秒差で敗北（ゴール時 {m} m ビハインド）",
    raceVerdictWinFile: "{name} に {seconds} 秒差で勝利（ゴール時 {m} m リード）",
    raceVerdictLoseFile: "{name} に {seconds} 秒差で敗北（ゴール時 {m} m ビハインド）",
    raceFinished: "レース終了",
    play: "再生",
    pause: "一時停止",
    viewToggle: "コース表示",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "3D表示にはこの端末でWebGPUまたはWebGLが必要です",
    view3dLoading: "3Dを読み込み中…",
    view3dError: "3D表示を読み込めませんでした",
    quality: "画質",
    qualityLow: "低",
    qualityMedium: "中",
    qualityHigh: "高",
    qualityUltra: "最高",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "ペース",
    gRate: "レート",
    gPower: "パワー",
    gHeart: "心拍",
    cPace: "ペース",
    cRate: "ストロークレート",
    cPower: "パワー",
    cHeart: "心拍数",
    strokeQuality: "ストローククオリティ",
    avgDistStroke: "平均 距離/ストローク",
    avgRate: "平均レート",
    paceVariation: "ペースのばらつき",
    paceVariationHint: "（低いほど安定）",
    fade: "フェード",
    negSplit: "ネガティブスプリット",
    slowedDown: "後半落ち",
    distPerStroke: "1 ストロークあたりの距離",
    distPerStrokeHint: "— 高いほどパワフルなストローク",
    paceVsRate: "ペース vs レート",
    paceVsRateHint: "— 最も効率の良いレートを探す",
    powerCurve: "パワーカーブ（時間帯別ベスト平均）",
    hrZones: "HR ゾーン（ゾーン内時間）",
    intervalBreakdown: "インターバル内訳",
    repComparison: "レップ比較",
    repComparisonN: "レップ比較（{n} レップ）",
    repComparisonRep: "レップ {n}",
    repComparisonAvgPace: "平均 {pace}",
    repComparisonMetricPace: "ペース",
    repComparisonMetricRate: "ストロークレート",
    repComparisonMetricPower: "パワー",
    repComparisonMetricHr: "心拍",
    splitBreakdown: "スプリット内訳",
    segReps: "レップ",
    segSplits: "スプリット",
    avgRepPace: "平均レップペース",
    avgSplitPace: "平均スプリットペース",
    consistency: "一貫性",
    consistencyHint: "（低いほど均等）",
    setFade: "セットフェード",
    faded: "フェード",
    fastestSlowest: "最速 → 最遅",
    splitsTitle: "スプリット",
    thNum: "#",
    thDist: "距離",
    thTime: "時間",
    thPace: "ペース",
    thRate: "レート",
    thHr: "HR",
    workoutDetails: "ワークアウト詳細",
    mDate: "日付",
    mSport: "種目",
    mType: "種別",
    mDistance: "距離",
    mTime: "時間",
    mAvgPace: "平均ペース",
    mAvgRate: "平均レート",
    mStrokeCount: "ストローク数",
    mAvgPower: "平均パワー",
    mAvgHr: "平均 HR",
    mHrRange: "HR 範囲",
    mCalories: "カロリー",
    mDragFactor: "ドラッグファクター",
    mResolution: "解像度",
    mSegments: "セグメント",
    mWorkoutId: "ワークアウト ID",
    mComments: "コメント",
    samples: "サンプル",
    perStroke: "ストローク単位",
    fromSplits: "スプリットから",
    intervalsWord: "インターバル",
    splitsWord: "スプリット",
    racingSession: "{date} のセッションとレース",
    racingFile: "{name} とレース",
    ghostYour: "あなたの {date}",
    loadSessionFailed: "そのセッションを読み込めませんでした",
    paceError: "1:52 のようなペースを入力してください",
    pacingAt: "{pace} でペーシング",
    noSamples: "そのファイルに使えるサンプルがありません。",
    fileReadError: "そのファイルを読み取れませんでした。",
    importFailed: "そのファイルをインポートできませんでした",
    zone1: "Z1 リカバリー",
    zone2: "Z2 エンデュランス",
    zone3: "Z3 テンポ",
    zone4: "Z4 しきい値",
    zone5: "Z5 最大",
    fullMetrics: "全指標",
    mHrEnding: "終了時心拍",
    mHrRecovery: "回復心拍",
    mHrDrop: "心拍低下",
    mRestTime: "休憩時間",
    mRestDistance: "休憩距離",
    mWeightClass: "体重クラス",
    mVerified: "検証済み",
    mTimezone: "タイムゾーン",
    mPrivacy: "プライバシー",
    mWattMinutes: "ワット分",
    provenanceTitle: "記録元",
    mPmVersion: "PM バージョン",
    mFirmware: "ファームウェア",
    mSerial: "シリアル番号",
    mDevice: "デバイス",
    mSource: "記録元",
    exrBadge: "EXR ソース",
    exrBadgeTitle:
      "ペースとパワーは PM5 からではなく EXR によって合成されています。PM 記録のワークアウトと直接比較できない場合があります。",
    mErgModel: "エルグモデル",
    mHrSensor: "心拍センサー",
    targetsTitle: "目標",
    mTargetPace: "目標ペース",
    mTargetWatts: "目標ワット",
    mTargetRate: "目標レート",
    mTargetHrZone: "目標心拍ゾーン",
    mTargetCalories: "目標カロリー",
    targetVsActualTitle: "目標と実績",
    targetHit: "達成",
    targetMiss: "未達",
    workRestTitle: "作業 : 休憩",
    workRestRatio: "休憩1秒あたりの作業",
    thCalories: "kcal",
    thWattMin: "W·min",
    thIntervalType: "種別",
    thRest: "休憩",
    thRestYes: "休憩",
    verifiedYes: "検証済み",
    verifiedNo: "未検証",
    weightHeavy: "ヘビー",
    weightLight: "ライト",
    intervalTypeTime: "時間",
    intervalTypeDistance: "距離",
    intervalTypeCalorie: "カロリー",
    intervalTypeWattminute: "ワット分",
    removeGhost: "ゴーストを削除",
    racingAgainst: "レース相手：{name}",
    compareAction: "比較",
    legendTitle: "凡例",
    legendGhost: "ゴースト",
    kbTitle: "キーボードショートカット",
    kbSpaceHint: "再生 / 一時停止",
    kbArrowHint: "±10 秒スクラブ",
    kbArrowShiftHint: "±30 秒スクラブ",
    kbBracketHint: "速度変更",
    kbHomeHint: "最初にリセット",
  },
  inspector: {
    toggle: "フィールドインスペクター",
    toggleOn: "フィールドインスペクターを隠す",
    panelLabel: "生フィールドインスペクター",
    sectionWorkout: "ワークアウト",
    sectionProvenance: "出所",
    sectionPerStroke: "ストロークごと",
    colField: "フィールド",
    colAsLogged: "記録値",
    colNormalized: "正規化",
    derived: "算出",
    noStrokeData: "この時点にストロークサンプルがありません。",
    tableLabel: "ストローク別フィールド表示",
    staticSport: "種目",
    staticDistance: "距離",
    staticTime: "時間",
    staticDrag: "ドラッグ係数",
    staticType: "ワークアウト種別",
    staticResolution: "解像度",
    fieldT: "経過時間（0.1秒）",
    fieldD: "距離（デシメートル）",
    fieldP: "ペース（0.1）",
    fieldSpm: "ストロークレート",
    fieldHr: "心拍",
    fieldWatts: "パワー（算出）",
    fieldProgress: "進捗",
    fieldSplit: "スプリット番号",
    fieldInterval: "インターバル番号",
    fieldDps: "ストロークあたり距離",
    metaPm: "PM バージョン",
    metaFirmware: "ファームウェア",
    metaErg: "エルグモデル",
    metaHrSensor: "HR センサー",
    metaSource: "ソースアプリ",
    metaSerial: "シリアル番号",
    metaDevice: "デバイス",
  },
  drift: {
    toggle: "効率ドリフトを表示",
    toggleOn: "効率ドリフトを非表示",
    baseline: "序盤ベースライン",
    fade: "効率の低下",
    unit: " m/ストローク",
    summaryTitle: "ストローク当たり距離のドリフト",
    summaryHint: "序盤セグメントから終盤までの DPS の変化",
    axisLabel: "DPS",
  },
  settings: {
    title: "アカウントとデータ",
    eyebrow: "プライバシーと管理",
    dataTitle: "保存している内容",
    dataNote:
      "rowplay は Concept2 のワークアウトを必要に応じて読み取り、リプレイを即座に表示できるよう Cloudflare にキャッシュします。API トークンは SESSION_SECRET で httpOnly rp_tok Cookie に封印されます。KV はセッションの本人情報/状態のみを保存し、D1 はワークアウトとリプレイのキャッシュだけを保存します。トークンは保存しません。切断またはデータ削除で、キャッシュされたユーザーデータとセッション状態を消去します。",
    factWorkouts: "エクスポート可能なワークアウト {n} 件",
    factDemo: "デモモード — サンプルデータのみ、永続化されません。",
    factCache: "D1 はワークアウト/リプレイのキャッシュを保存 — トークンは保存しません。",
    factSession:
      "KV はセッションの本人情報/状態を保存し、トークンは httpOnly rp_tok に封印します。",
    exportTitle: "ログブックをエクスポート",
    exportNote:
      "全履歴を CSV または JSON でダウンロード。ストロークデータ付きのワークアウト単位の TCX は Garmin、Strava、TrainingPeaks で開けます。",
    exportCsv: "CSV をダウンロード",
    exportJson: "JSON をダウンロード",
    exportTcxNote: "TCX エクスポート（ストロークデータ付きワークアウト）:",
    exportTcx: "ワークアウト #{id} · TCX",
    syncTitle: "ログブックを再同期",
    syncNote:
      "増分同期は前回以降のワークアウトのみ取得。完全再同期は全履歴を再ダウンロード（時間がかかり、問題時に使用）。",
    syncIncremental: "増分同期",
    syncFull: "完全再同期",
    loadFullHistory: "全履歴を読み込む",
    syncDemo: "デモモードでは同期不可 — ログブックに接続して実データを同期してください。",
    lastSync: "{total} ワークアウトをキャッシュ · 最終同期 {date}",
    neverSynced: "未同期",
    deleteTitle: "キャッシュデータを削除",
    deleteNote:
      "rowplay からキャッシュしたワークアウトとリプレイ詳細を削除し、ログアウトします。Concept2 ログブックは変更されません。",
    deleteAction: "キャッシュデータを削除",
    deleteConfirm:
      "rowplay のキャッシュしたワークアウトとリプレイデータをすべて削除してログアウトしますか？Concept2 ログブックは変更されません。",
    deleteDemo: "デモモード — 保存されていないため、削除するものはありません。",
    deleteDone: "キャッシュを削除しました。ログアウトしました。",
    deleteFailed: "キャッシュを削除できませんでした",
    timezoneTitle: "ホームタイムゾーン",
    timezoneNote:
      "深夜近くのワークアウトが正しいカレンダー日に表示されるよう、ローカルタイムゾーンを選択してください。",
    timezoneLabel: "ホームタイムゾーン",
    timezoneSaved: "タイムゾーンを保存しました",
    timezoneUtcDefault: "UTC（デフォルト）",
    timezoneGroupAmericas: "アメリカ",
    timezoneGroupEuropeAfrica: "ヨーロッパ / アフリカ",
    timezoneGroupAsiaPacific: "アジア / 太平洋",
    lastSyncError: "{total} ワークアウト · 前回の同期失敗: {message}",
    partialCache: "{n} ワークアウトをキャッシュ · 履歴はまだ読み込み中",
    exportPreviewCsv: "CSV: ワークアウトごとに1行、安定した列順（17列）",
    exportPreviewJson: "JSON: スキーマメタデータ付き配列（バージョン1）",
    exportPreviewTcx: "TCX 2.0: ストロークごとのトラックポイント、Garmin/Strava互換",
    noTcxAvailable: "TCXエクスポート用のストロークデータがあるワークアウトはありません。",
  },
  token: {
    title: "Concept2 トークンを使う",
    introBefore: "Concept2 ログブックの個人 API トークンを貼り付け（",
    introLink: "プロフィール編集 → アプリケーション",
    introAfter:
      "）。ここに一度貼り付けてください — rowplay は HTTPS で Worker に送り、検証してから httpOnly rp_tok Cookie に封印し、サーバー側のログブック読み取りにのみ使用します。トークンは KV にも D1 にも保存されません。",
    trustTitle: "rowplay のトークン処理",
    trustAccessTitle: "アクセス：",
    trustAccessBody:
      "個人 Concept2 トークンはあなたとして認証します。rowplay はサーバー側でプロフィール、ワークアウト、ストロークデータを読むためだけに使います。",
    trustStoredTitle: "保存：",
    trustStoredBody:
      "検証済みトークンは httpOnly rp_tok Cookie に封印され、localStorage、KV、D1 には保存されません。",
    trustDisconnectTitle: "切断：",
    trustDisconnectBody:
      "データ画面でログアウトまたはアカウントデータ削除を行うと、トークン Cookie、セッション、非公開キャッシュが消えます。",
    trustCacheTitle: "キャッシュ：",
    trustCacheBody:
      "接続中は D1 がワークアウト概要とリプレイ詳細をキャッシュします。公開共有やリーダーボード項目は公開した場合だけ作成されます。",
    apiToken: "API トークン",
    placeholder: "トークンを貼り付け",
    connect: "トークンで接続",
    connecting: "接続中…",
    rejected: "Concept2 がそのトークンを拒否しました。確認して再試行してください。",
    serverMisconfigured:
      "このデプロイはトークンサインインに対応していません（SESSION_SECRET が未設定）。サイト管理者にお問い合わせください。",
    empty: "Concept2 API トークンを貼り付けてください。",
    preferBefore: "標準フローがよい？ ",
    preferLink: "Concept2 に接続",
  },
  comparability: {
    blockedTitle: "比較できないワークアウト",
    guidance: "同じマシン・同じ種類・同じ距離または時間帯の 2 セッションを選んでください。",
    noComparableCandidates: "比較可能なセッションがありません。",
    groupComparable: "比較可能",
    groupIncomparable: "その他（比較不可）",
    reason: {
      crossSport: "マシンが異なります。",
      crossAxis: "一方は固定距離、もう一方は固定時間のピースです。",
      crossBand: "距離または時間の帯が異なります。",
    },
  },
  compare: {
    title: "ワークアウト比較",
    lead: "任意の 2 セッションの並列統計とオーバーレイチャート。",
    back: "ダッシュボードに戻る",
    workoutA: "ワークアウト A",
    workoutB: "ワークアウト B",
    choose: "選択…",
    run: "比較",
    swap: "入れ替え",
    pickTwo: "上で 2 つのワークアウトを選んで比較してください。",
    deltaTable: "対決統計",
    deltaHint: "差分が正のとき、ワークアウト A の方が高い。",
    alignedNote: "{distance} で位置合わせ",
    noStrokeData: "オーバーレイチャート用のストロークデータがありません。",
    winnerA: "ワークアウト A の勝ち",
    winnerB: "ワークアウト B の勝ち",
    tie: "引き分け",
    verdictTimeA: "ワークアウト A が {seconds} 秒速い",
    verdictTimeB: "ワークアウト B が {seconds} 秒速い",
    verdictPaceA: "ワークアウト A が {delta} 速い",
    verdictPaceB: "ワークアウト B が {delta} 速い",
    statTime: "時間",
    statPace: "ペース",
    statAvgPower: "平均パワー",
    statBest5sPower: "ベスト 5 秒パワー",
    statAvgHr: "平均 HR",
    statDps: "距離/ストローク",
    statConsistency: "一貫性",
    statMetric: "指標",
    statDelta: "Δ（A − B）",
    repTimeDelta: "時間 Δ",
    vsDistance: "対距離",
    intervalTitle: "インターバル比較",
    intervalHint: "レップごとのペースと時間差。",
  },
} as const;
