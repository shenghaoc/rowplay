export const zh = {
  liveMode: {
    title: "实时模式",
    enabled: "自动同步新训练",
    enabledHint: "按所选间隔轮询日志",
    interval: "轮询间隔",
    intervalSec: "{n} 秒",
    intervalMin: "{n} 分钟",
    lastPollLabel: "上次检查",
    nextPollLabel: "下次检查",
    polling: "正在检查新训练…",
    sound: "通知提示音",
    soundHint: "出现新训练时播放短促提示音",
    newWorkout: "新训练 — {distance} · {time} · {sport}",
    newWorkouts: "已同步 {count} 条新训练",
    view: "查看",
    error: "实时同步失败",
    errorRetry: "将自动重试",
    rateLimit: "已达到速率限制——降低轮询频率",
    reauth: "会话已过期——请重新登录",
    recovered: "实时同步已恢复",
    warning: "实时同步已连续失败 {count} 次",
  },
  annotations: {
    title: "教练笔记",
    addNote: "添加笔记",
    editNote: "编辑笔记",
    deleteNote: "删除",
    saveNote: "保存",
    cancelNote: "取消",
    addPlaceholder: "运动员此时应该注意什么？",
    noNotes: "暂无教练笔记。拖动进度条到某个时间点，然后添加笔记。",
    confirmDelete: "确认删除这条笔记？",
    seekTo: "跳转到 {time}",
    timestampLabel: "于",
    pinnedTo: "固定在时间轴标记处",
    saveError: "保存笔记失败，请重试。",
    deleteError: "删除笔记失败，请重试。",
  },
  leaderboard: {
    title: "排行榜",
    lead: "与其他 rowplay 运动员在同一项目上同场竞技。选择器械和标准距离查看排名。",
    sport: "器械",
    distance: "距离",
    rank: "名次",
    athlete: "运动员",
    time: "时间",
    pace: "配速",
    gap: "差距",
    actions: "操作",
    you: "你",
    athletes: "{n} 名运动员",
    open: "打开",
    race: "竞速",
    raceHint: "“竞速”会在你自己的回放中预设该对手为幽灵船。",
    empty: "该榜单暂无成绩——快来成为第一个发布成绩的人。",
    publish: "发布到排行榜",
    publishing: "发布中…",
    publishOk: "已发布——你在 {sport} {distance} 排名第 {rank}。",
    publishOffBoard: "仅标准距离（500m、1k、2k、5k、6k、10k、半马）可发布到榜单。",
    publishFailed: "无法发布到排行榜",
    publishNote: "发布会将该成绩公开到 rowplay 排行榜，但不会更改你的 Concept2 日志中的任何内容。",
    withdraw: "从排行榜移除",
    withdrawing: "正在移除…",
    withdrawOk: "已从排行榜移除。",
    withdrawFailed: "无法从排行榜移除",
    ghostFallbackToast: "无法加载对手的划桨数据 — 正在以其平均配速比赛",
  },
  nav: {
    dashboard: "仪表板",
    leaderboard: "排行榜",
    docs: "帮助",
    settings: "数据",
    menuOpen: "打开菜单",
    menuClose: "关闭菜单",
    skipToContent: "跳到主要内容",
  },
  common: {
    demoMode: "演示模式",
    replay: "回放",
    loading: "加载中…",
    tryAgain: "请重试。",
    dismiss: "关闭",
    notAffiliated: "与 Concept2 无关联",
    tagline: "rowplay · Concept2 训练日志分析与实时回放",
  },
  sync: {
    loading: "正在同步…",
    done: "新增 {added} · 共 {total} 次训练已缓存",
    failed: "同步失败",
    incrementalDone: "已是最新 — {total} 次训练已缓存",
    retry: "重试同步",
    errorBadge: "上次同步失败",
    errorHint: "{message}",
    demoUnavailable: "演示模式下无法同步 — 连接你的日志以同步真实数据。",
    partialWarning: "历史记录仍在加载 — 在同步完成之前，总计和个人最佳成绩可能不完整。",
    inProgress: "同步进行中…",
    historyWindow: "显示最近 {months} 个月——正在加载更早的历史…",
    historyBackfilling: "已缓存 {total} 次训练 · 历史回溯至 {date}",
    historyComplete: "完整历史已同步",
  },
  auth: {
    connect: "连接 Concept2",
    useToken: "使用令牌",
    logout: "退出登录",
  },
  theme: { toLight: "切换到浅色模式", toDark: "切换到深色模式" },
  lang: { switch: "切换语言" },
  pwa: {
    updateAvailable: "rowplay 有新版本可用。",
    reload: "重新加载",
  },
  landing: {
    tagline: "Concept2 · 划船机 · 滑雪机 · 单车机",
    title1: "回放你的训练。",
    title2: "读懂你的分段。",
    lead: "rowplay 连接你的 Concept2 训练日志，把每条成绩转化为丰富的分析——以及可逐桨观看的实时回放，配有动态赛道和同步的配速、桨频、功率与心率数据。",
    exploreDemo: "体验演示 →",
    openDashboard: "打开仪表板 →",
    connect: "连接你的 Concept2 日志 →",
    readGuide: "阅读指南",
    demoNote: "正在以演示模式运行，使用示例数据。添加个人令牌以加载你自己的日志。",
    feat1Title: "实时回放",
    feat1Body: "观看你的配速在赛道上竞速，仪表与图表同步回放。",
    feat2Title: "分段分析",
    feat2Body: "配速、桨频、功率与心率随时间变化——涵盖全部三种器械。",
    feat3Title: "边缘加速",
    feat3Body: "由 Cloudflare 全球分发，使用 Concept2 实时数据回放训练。",
    tourEyebrow: "首次使用",
    tourTitle: "先试这四件事",
    tourBody: "先看仪表板，再打开一次回放，挑战过去的训练成绩，最后导出你想在别处查看的数据。",
    tourDashboard: "仪表板：总量、趋势与 PB",
    tourReplay: "回放：同步赛道与仪表",
    tourGhost: "幽灵竞速：追赶历史成绩或目标配速",
    tourExport: "导出：CSV、JSON 或 TCX",
    tourDismiss: "关闭首次使用引导",
  },
  docs: {
    title: "使用指南",
    description:
      "rowplay 使用指南：快速上手、划船术语、配速与功率、图表解读、常用操作、常见问题与故障排查。",
    badge: "仓库文档驱动",
    openDashboard: "打开仪表板",
    openSource: "打开源文件",
    navLabel: "使用指南章节",
    contextual: {
      gettingStarted: "第一次来？阅读快速上手指南",
      metrics: "配速、功率和桨频是什么意思？",
      charts: "如何解读这张图表",
      troubleshooting: "数据缺失或看不懂？查看故障排查",
      workflows: "了解回放、幽灵和导出的使用方法",
    },
    sections: {
      overview: {
        navTitle: "概览",
        markdown: `# rowplay 使用指南

rowplay 把你的室内划船、滑雪和骑行训练变成可以探索的内容：汇总与趋势的仪表板和逐桨回放。

它支持在 Concept2 器械上记录的训练 — RowErg（划船机）、SkiErg 和 BikeErg — 并从免费的 Concept2 在线日志读取数据。上手不需要懂任何划船术语：本指南会解释用到的每一个词。

## 你可以在这里做什么

- **仪表板** — 一眼看到汇总、趋势、个人最佳和训练负荷。
- **回放** — 逐桨观看任意一次训练，配速、桨频、功率和心率图表同步播放。

## 指南章节

- [快速上手](/docs/getting-started) — 演示模式和连接日志。
- [划船基础](/docs/rowing-metrics) — 桨、分段，以及你会遇到的其他术语。
- [配速、分段与功率](/docs/pace-splits-watts) — 这些数字的含义和相互关系。
- [图表与进步](/docs/charts-and-progress) — 如何解读仪表板上的面板。
- [常用操作](/docs/workflows) — 回放、过去训练的幽灵和导出。
- [常见问题](/docs/faq) — 关于账户、隐私和数据的简短解答。
- [故障排查](/docs/troubleshooting) — 数据缺失、数字异常、显示问题。

> 提示：rowplay 默认以演示模式启动，内置示例训练 — 在连接 Concept2 账户之前，上面这些功能都可以先试一遍。`,
      },
      gettingStarted: {
        navTitle: "快速上手",
        markdown: `# 快速上手

## 先试试演示模式

rowplay 默认以演示模式启动：在没有连接账户时，所有页面都填充了逼真的示例训练。你在演示模式中的任何操作都不会影响真实账户。

1. 打开[仪表板](/dashboard)。
2. 从列表中任选一次训练。
3. 点击**回放**，试试播放、暂停、拖动和变速控件。
4. 使用仪表板筛选，然后打开另一个回放。

## 连接你自己的训练

你的训练保存在 Concept2 日志里 — 这是 Concept2 器械（和 ErgData 手机应用）上传成绩的免费在线记录本。rowplay 通过个人访问令牌读取这个日志：它是一串长代码，相当于你数据的只读钥匙。

1. 在 log.concept2.com 登录你的日志。
2. 打开 **Edit Profile → Applications**，复制你的个人 API 令牌。
3. 回到 rowplay，打开[使用令牌](/auth/token)。
4. 粘贴令牌并提交。
5. 打开仪表板。rowplay 会直接从 Concept2 API 获取你的完整训练历史。

令牌只通过加密连接发送一次，并且只保存在受保护的浏览器 Cookie 中。rowplay 的服务器不会保存训练或令牌。

## 断开连接

使用页眉中的**退出登录**按钮断开连接。[数据](/settings)仍保留导出和主时区设置。你的 Concept2 日志永远不会被修改。`,
      },
      rowingMetrics: {
        navTitle: "划船基础",
        markdown: `# 划船基础

刚接触室内划船 — 或者只是不熟悉它的词汇？以下是 rowplay 使用的术语。

## 器械

- **RowErg** — Concept2 的划船机（「erg」是测功仪 ergometer 的缩写，一种测量做功的机器）。
- **SkiErg** — 模拟越野滑雪撑杖动作的立式器械。
- **BikeErg** — Concept2 的固定单车。

三者以同样的方式测量你的努力程度，所以 rowplay 用同一类数字来展示它们。

## 桨

一**桨**是动作的一个完整循环 — 在 RowErg 上是蹬腿、拉桨、再滑回起始位置。两个数字描述你的桨：

- **桨频（spm）** — 每分钟桨数：你重复动作的速度。稳定划船通常在 18–30 spm。
- **每桨距离（DPS）** — 每一桨能让你前进多少米。数值越高，通常说明这一桨更有力、更高效。

桨频高不代表速度快：每分钟 20 桨扎实的划水，可能比 30 桨仓促的划水更快。

## 距离与时间

器械会把你的努力换算成**米**，就像你在水道上移动一条船（或滑雪板、单车）。训练要么按距离（「划 2000 米」），要么按时间（「划 30 分钟」）。**间歇训练**把整段拆成多组、组间休息 — 例如 4 × 500m。

## 配速与分段

**配速**是你完成固定距离所需的时间 — RowErg 和 SkiErg 按 500 米计，BikeErg 按 1000 米计。**分段**（split）是训练中某一段的配速。这两个概念是测功仪训练的核心，所以它们有[专门的一页](/docs/pace-splits-watts)。

## 心率

如果你佩戴的心率带或手表连接了器械或 ErgData 应用，每分钟心跳数（**bpm**）会与其他数字一同显示，并在回放中拥有自己的图表。`,
      },
      paceSplitsWatts: {
        navTitle: "配速、分段与功率",
        markdown: `# 配速、分段与功率

测功仪训练围绕这些数字展开。所有计算都由 rowplay 完成 — 但了解它们的含义，会让每张图表都更容易读懂。

## 配速：每 500 米用时

配速回答的问题是：「按这个速度，500 米要花我多长时间？」它写成钟表时间 — **2:05** 表示每 500 米 2 分 05 秒。

- **数值越小越快。** 1:55 比 2:05 的配速更快。
- 在图表上，配速进步意味着曲线**向下**走。
- **BikeErg 的配速按每 1000 米计**，不是 500 米，因为单车更快。rowplay 会自动处理 — 所以看到骑行配速和划船配速差不多时不必惊讶。

## 分段

分段是训练中某一段的平均配速 — 比如 2000 米中的每个 500 米，或间歇课中的每一组。比较分段能看出你的体力分配：匀速分段、末段掉速，或快速冲刺收尾（「负分段」指每一段都比上一段更快）。

## 功率（瓦特）

瓦特衡量你的输出功率 — 和灯泡是同一个单位。配速告诉你结果，瓦特告诉你做了多少功。它们是同一份努力的两种视角：保持约 2:00/500m 大约需要 200 瓦，而配速的小幅提升需要不成比例的更多功率 — 从 2:00 提到 1:54 大约要多付出 30 瓦。

稳定划船依体能大约在 100 到 250 瓦之间；冲刺时会飙得高得多。

## 桨频不等于努力程度

桨频（spm）只说明你划得多频繁，不说明划得多用力。两位划手可以都保持 2:00 配速 — 一位每分钟 22 桨、桨桨有力，另一位 28 桨、每桨更轻。把配速**和**桨频放在一起看（回放两者都画出来）能看出技术：同样的配速、更低的桨频，意味着每桨距离更长。

## 在哪里看这些数字

- **仪表板**展示跨训练的平均配速、汇总和个人最佳。
- **回放**绘制整次训练的配速、桨频、功率和心率，与播放同步。
- 回放中的**逐组对比**把间歇训练拆成逐段的柱状图。`,
      },
      chartsAndProgress: {
        navTitle: "图表与进步",
        markdown: `# 图表与进步

仪表板把你的历史变成一组面板。本页解释如何解读它们。

## 时间趋势

趋势图跟踪一个指标 — 配速、距离、桨频或每桨距离 — 跨越数周的训练。为了公平，配速趋势只做**同类比较**：一次冲刺和一次长距离稳定划永远不会混进同一条线。训练会按距离带分组，由你选择查看哪个距离带。

- 对**配速**而言，向下更好（每 500 米用时更短）。
- 图表上方的判定行总结方向：进步中、保持稳定或退步中。
- 一个距离带至少需要两次训练才能画出趋势。

## 个人最佳

PB 面板根据实时获取的 Concept2 历史，跟踪你在标准距离（500m、1k、2k、5k、6k、10k 等）上的最快成绩。

## 训练日历与强度

日历按训练量为每一天着色，连续训练和空档一目了然。强度视图展示你的训练在轻松和高强度之间的分布。

## 体能、疲劳与状态

状态面板根据训练负荷估算三条曲线：**体能**（长期积累的训练量）、**疲劳**（近期课次带来的短期疲惫）和**状态**（体能减疲劳 — 你今天的竞技准备度）。苦练会让体能和疲劳一起上升；休息时疲劳比体能下降更快，所以状态会在一段轻松期之后达到峰值。

## 临界功率

临界功率面板根据你自己的最佳成绩，估算你在长时间运动中可持续的最高输出。它驱动配速预测器 — 估计你在最近没比过的距离上能保持的配速。

## 划桨效率（DPS）

DPS 图表跟踪每桨获得的米数。配速归一化开关会剔除「单纯划得更猛」的影响，剩下的更接近纯技术。看近期状态用 7 天均线，看大趋势用 28 天均线。`,
      },
      workflows: {
        navTitle: "常用操作",
        markdown: `# 常用操作

## 回放一次训练

从仪表板打开任意训练，点击**回放**。

- **播放 / 暂停**控制回放；赛道视图和所有仪表保持同步。
- **拖动**时间轴可跳到任意时刻。
- **速度**可让回放以 0.5× 到 8× 实时速度运行。
- 在 **2D 和 3D** 赛道视图之间切换（3D 需要较新的浏览器）。
- 设置**目标配速**，在配速图上画出一条参考线。

动画会跟随训练中有效的已记录周期：每一条桨频记录推进一次编排好的划桨、撑杖周期或踏板转动；时间和距离都没有前进的间歇锚点不会生成假动作。画面中的运动学是确定性的示意动画，并非测得的生物力学。Concept2 不提供力曲线、手柄轨迹、发力行程、关节位置或身体姿态，rowplay 的功率则由配速换算。RowErg 按腿、躯干、手臂的顺序发力，并在回桨时反向衔接；SkiErg 将前伸、点杖/下压和恢复分开；BikeErg 将由踏频驱动的曲柄与由距离驱动的车轮转动分开。2D 和 3D 都会按项目显示水面、雪道或赛车场。3D 中手脚会保持在器械接触点上，更近且针对项目调整的追踪镜头会同时平滑跟随位置和注视点。

两种视图都会直接绘制轻量的程序化运动员形象，而不是下载或扫描人物模型。上臂、前臂和大腿、小腿保持固定比例，并在明确的肘、膝关节处弯曲；成形的躯干、骨盆和关节、运动服配色以及近侧与远侧的明暗区别，让每个姿势在回放尺寸下仍然清晰。手脚会在整个周期中与对应器械保持对齐。该形象只是通用示意，并不会复现运动员的身材、衣着或外貌。

在 3D 模式下，**画质**选择器可选低、中、高、Ultra。Ultra 需要 WebGPU；只支持 WebGL 的设备会停留在“高”。若设备无法保持流畅帧率，渲染器会自动先降低分辨率、再削减特效。回放动画遵循操作系统的减弱动态效果设置。

Concept2 提供逐桨数据时会优先使用。没有逐桨数据的训练会退回到分段回放，赛道仍然可以播放。

## 与幽灵竞速

幽灵是一次过去的成绩，会在屏幕上与你并排划行。

1. 在回放中打开你的一次训练。
2. 在幽灵控制中选择一次可比较的过去训练。
3. 过去的成绩会作为第二条船供你追赶。

你也可以和自己过去的成绩竞速，精确看到一次 PB 尝试在哪里赚了时间、在哪里丢了时间。

## 导出

[数据](/settings)页可以将实时日志下载为 CSV 或 JSON；有逐桨数据的训练还能按次导出 TCX 文件。

## 保持数据最新

仪表板和回放数据会从 Concept2 实时获取。**实时模式**还可以轮询日志并通知你新训练已到达。`,
      },
      faq: {
        navTitle: "常见问题",
        markdown: `# 常见问题

## 需要 Concept2 账户吗？

逛一逛不需要 — 演示模式无需账户。要查看你自己的训练，需要一个免费的 Concept2 日志账户，器械（或 ErgData 应用）会把成绩存到那里。

## 我的访问令牌安全吗？

令牌只通过 HTTPS 传输一次，并封存在受保护的 httpOnly 浏览器 Cookie 中。它绝不会保存在 rowplay 的服务器上。断开连接即清除。

## 别人能看到我的训练吗？

不能。你的仪表板和回放均为私密内容；rowplay 不提供公开分享或排行榜功能。

## rowplay 会改动我的 Concept2 日志吗？

绝不会。rowplay 只读取，不会修改日志的原始记录。

## 支持哪些器械？

RowErg、SkiErg 和 BikeErg。划船和滑雪的配速按每 500 米显示，单车按每 1000 米。

## 为什么有些训练没有逐桨回放？

不是每条日志记录都包含逐桨数据 — 取决于训练的记录方式。这些训练仍然可以回放，只是基于分段数据，数据点更少。

## 能在手机上用 rowplay 吗？

可以 — 包括回放在内的整个应用都能在手机浏览器中运行，还可以像 App 一样添加到主屏幕。

## 有哪些语言？

English、Deutsch、Español、Français、日本語和中文 — 在页眉切换（手机上在菜单按钮里）。`,
      },
      troubleshooting: {
        navTitle: "故障排查",
        markdown: `# 故障排查

## 汇总或个人最佳看起来不对

重新加载仪表板以获取最新的 Concept2 历史，并确认该训练已经出现在你的 Concept2 日志中。

## 某个配速看起来差得离谱

- **BikeErg 配速按每 1000 米计**，不是 500 米 — 骑行的 2:00 配速和划船的 2:00 不是同一个速度。
- 间歇训练报告的是工作段配速，休息时间不计入。

## 趋势图说训练次数不够

趋势只做同类距离的比较，因此同一距离带至少需要两次训练。再记录一次类似的训练，趋势就会出现。

## 某次训练没有桨数据图表

这条日志记录没有逐桨数据 — 在较早的成绩和某些记录方式中很常见。回放会退回到分段数据。依赖桨数据的面板（每桨距离、逐桨对比）需要桨数据，缺失时会明确提示。

## 心率缺失

只有训练时连接了心率带或手表，日志里才有心率。请确认源训练在 Concept2 中包含心率。

## 同步失败或会话过期

个人令牌可能过期或被撤销。请从 Concept2 个人资料获取新令牌，并在[使用令牌](/auth/token)重新连接。如果短时间内请求过多，日志可能短暂限流 — 等一分钟再试。

## 新训练没有出现

先确认训练已经到达你的 Concept2 日志（必须从器械或 ErgData 应用上传）。然后重新加载仪表板，或开启实时模式自动轮询。

## 显示问题

- **3D 回放无法启动** — 浏览器需要支持 WebGPU 或 WebGL；2D 视图始终可用。
- **手机上图表太挤** — 横屏可以获得更宽的图表；小屏幕上面板会自动重排。
- **主题或语言不对** — 两个开关都在页眉（手机上在菜单按钮里），并按浏览器记忆。

还是没解决？[常见问题](/docs/faq)涵盖更多内容，本指南的每一页都能从页眉的**帮助**进入。`,
      },
    },
  },
  dashboard: {
    eyebrow: "你的日志",
    title: "成绩与回放",
    all: "全部",
    sync: "同步",
    syncing: "同步中…",
    syncedNote: "{total} 次训练 · 上次同步 {date}",
    recentNote: "正在显示最近的训练——加载完整历史以获得准确的个人最佳与趋势。",
    latest: "最新",
    distance: "距离",
    time: "时间",
    avgRate: "平均桨频",
    distStroke: "每桨距离",
    avgBpm: "平均心率",
    vsAvg: "对比你的 {sport} 平均",
    sessions: "训练次数",
    totalDistance: "总距离",
    totalTime: "总时间",
    avgPace: "平均配速",
    sectionCoreEyebrow: "从这里开始",
    sectionCore: "一览",
    sectionWorkoutsEyebrow: "训练",
    sectionWorkouts: "查找回放",
    sectionWorkoutsBody: "直接筛选并打开训练，无需先钻进深层分析面板。",
    sectionRecordsEyebrow: "目标",
    sectionRecords: "目标、徽章与 PB",
    sectionRecordsBody: "赛季目标、里程碑、标准距离个人最佳和预测工具集中在这里。",
    sectionAdvancedEyebrow: "分析",
    sectionAdvanced: "进阶分析",
    sectionAdvancedBody: "功率模型、训练负荷、划桨效率和长期趋势，用于更深入复盘。",
    sectionPower: "CP/W′ 与状态",
    sectionPowerBody: "基于你的历史记录估算临界功率、可维持配速和负荷平衡。",
    sectionTraining: "训练结构",
    sectionTrainingBody: "用日历、强度和趋势查看训练如何分布。",
    sectionStroke: "划桨效率与器械拆分",
    sectionStrokeBody: "DPS 趋势和按器械汇总提供技术与配速背景。",
    tour: {
      eyebrow: "演示引导",
      title: "先试这些",
      body: "这些提示是可选的，在此浏览器关闭后会保持关闭。",
      dismissHint: "关闭 {title}",
      latestReplay: {
        title: "回放最新训练",
        body: "打开最新演示训练并点击播放。",
        action: "打开回放",
      },
      criticalPower: {
        title: "查看 CP/W′",
        body: "查看可维持功率模型和配速预测。",
        action: "跳到面板",
      },
      workoutFilters: {
        title: "使用训练筛选",
        body: "按距离、标签、逐桨数据或配速缩小列表。",
        action: "尝试筛选",
      },
      leaderboardGhost: {
        title: "挑战排行榜幽灵",
        body: "打开标准距离榜单，用“竞速”预载一个对手。",
        action: "打开排行榜",
      },
    },
    pbTitle: "个人最佳 · 标准距离",
    bySport: "按器械",
    thSport: "器械",
    thSessions: "次数",
    thDistance: "距离",
    thTime: "时间",
    thAvgPace: "平均配速",
    thBestPace: "最佳配速",
    trendTitle: "随时间的趋势",
    likeForLike: "{sport}，同距离对比",
    mPace: "配速",
    mDistStroke: "每桨距离",
    mDistance: "距离",
    mRate: "桨频",
    holdingSteady: "保持稳定——{metric} 在 {days} 天内持平",
    improving: "正在进步——{days} 天内{change}",
    slipping: "有所退步——{days} 天内{change}",
    faster: "快了 {delta}",
    slower: "慢了 {delta}",
    emptyTrend: "该区间只有 {n} 次训练——再记录一次 {band} 即可看到趋势。",
    dpsTrend: {
      title: "划桨效率 (DPS)",
      raw: "原始 DPS",
      normalised: "配速归一化",
      ma7: "7 日均值",
      ma28: "28 日均值",
      yLabel: "米/桨",
      empty: "暂无桨数数据",
      tooltipPace: "平均配速",
      tooltipDps: "DPS",
    },
    calTitle: "训练日历",
    calMetricDistance: "距离",
    calMetricTime: "时间",
    calActiveDays: "{n} 个活跃日",
    calCurrentStreak: "连续 {n} 天",
    calLongestStreak: "最长连续：{n} 天",
    calLess: "少",
    calMore: "多",
    calTooltip: "{date} · {sessions} 次训练 · {volume}",
    calEmpty: "{date} · 无训练",
    calAria: "训练日历，{active} 个活跃日，当前连续 {streak} 天",
    calDowSun: "日",
    calDowMon: "一",
    calDowTue: "二",
    calDowWed: "三",
    calDowThu: "四",
    calDowFri: "五",
    calDowSat: "六",
    tid: {
      title: "训练强度分布",
      time: "时间",
      distance: "距离",
      period4w: "近 4 周",
      period3m: "近 3 个月",
      period12m: "近 12 个月",
      empty: "该时段暂无训练",
      zone: {
        UT2: "UT2 — 恢复",
        UT1: "UT1 — 有氧",
        AT: "AT — 阈值",
        TR: "TR — 比赛配速",
        AN: "AN — 无氧",
        Easy: "轻松",
        Moderate: "中等",
        Hard: "高强度",
      },
    },
    formTitle: "体能与状态",
    formAdvanced: "进阶分析",
    formSub: "涵盖全部器械的训练负荷，按你自己的阈值功率换算。",
    formFitness: "体能",
    formFatigue: "疲劳",
    formForm: "状态",
    formFitnessHint: "42 天负荷（CTL）",
    formFatigueHint: "7 天负荷（ATL）",
    formFormHint: "体能 − 疲劳（TSB）",
    formFtp: "阈值功率",
    formCp: "临界功率",
    formModelled: "模型拟合",
    formEstimated: "估算",
    formRamp: "7 天体能增幅",
    formChartFitness: "体能",
    formChartFatigue: "疲劳",
    formChartForm: "状态",
    formEmpty: "在几周内再多记录几次训练，即可显示你的体能与状态图表。",
    bandTransition: "体能流失",
    descTransition: "状态很轻松，但体能正在下降。该加练了。",
    bandFresh: "充沛",
    descFresh: "已充分恢复、适合冲成绩——是测试自己的好时机。",
    bandNeutral: "中性",
    descNeutral: "平衡——既不锐利也不过度疲劳。",
    bandProductive: "高效",
    descProductive: "在健康、可控的疲劳下稳步提升体能。",
    bandOverreaching: "过度负荷",
    descOverreaching: "疲劳偏重。请减量，让身体恢复跟上。",
    goalsTitle: "赛季目标与挑战",
    goalsYear: "{year} 年目标",
    goalsKindMeters: "距离（米）",
    goalsKindHours: "时间（小时）",
    goalsTargetMeters: "目标（米）",
    goalsTargetHours: "目标（小时）",
    goalsSave: "保存目标",
    goalsSaving: "保存中…",
    goalsSaved: "目标已保存",
    goalsSaveFailed: "无法保存目标",
    goalsProgress: "{current} / {target}",
    goalsPct: "已完成 {pct}%",
    goalsOnPace: "进度正常——预计年底 {projected}",
    goalsBehind: "落后计划——预计 {projected} · 还需 {needed}",
    goalsStreakCurrent: "连续 {n} 天",
    goalsStreakCurrent_one: "连续 {n} 天",
    goalsStreakLongest: "最长连续：{n} 天",
    goalsStreakLongest_one: "最长连续：{n} 天",
    goalsDaysSince: "距上次训练 {n} 天",
    goalsDaysSince_one: "距上次训练 {n} 天",
    goalsDaysSinceToday: "今天已训练",
    goalsWeekly: "近 {total} 周中有 {active} 周有训练",
    badgesTitle: "徽章",
    badgeMeters100k: "10 万米",
    badgeMeters500k: "50 万米",
    badgeMeters1m: "百万米",
    badgeMeters2m: "200 万米",
    badgeMeters5m: "500 万米",
    badgeClub500: "500 米 PB",
    badgeClub1000: "1 公里 PB",
    badgeClub2000: "2 公里 PB",
    badgeClub5000: "5 公里 PB",
    badgeClub10000: "10 公里 PB",
    badgeEverySportWeek: "全器械一周",
    pbTag: "PB",
    pbNew: "新 PB",
    pbCelebrate: "新的 {distance} 个人最佳——{time}！",
    pbCelebrateMore: "{count} 项新的个人最佳！",
    predictor: {
      title: "成绩预测",
      distance: "已知距离",
      time: "已知用时",
      predict: "预测",
      colDistance: "距离",
      colPredicted: "预测",
      colBest: "你的最佳",
      colStatus: "状态",
      beaten: "已超越",
      behind: "落后",
      untried: "未尝试",
      noTime: "—",
      inputError: "请输入有效时间（例如 7:04）",
    },
    cpTitle: "临界功率与配速预测",
    cpSub: "基于你 Logbook 成绩的最佳努力功率模型，并明确显示置信度和数据警告。",
    cpLabel: "临界功率 (CP)",
    cpWPrime: "无氧做功 (W′)",
    cpMethod: "拟合方式",
    cpExplainModel:
      "{scope} 模型：CP {cp} W 和 W′ {wPrime} kJ 由你记录中的最佳努力拟合而来。请把它当作训练估计，而不是实验室测量。",
    cpExplainEstimate:
      "{scope} 估计：CP 由你最佳的较长努力近似为 {cp} W。请记录更多短、中、长时长的最大努力，以便拟合 CP/W′。",
    cpScopeLabel: "临界功率范围",
    cpScopeAll: "全部",
    cpEmptyScope: "可用的 {scope} 努力还不够。请先添加几个不同时长的最大努力，再信任此模型。",
    cpConfidenceLabel: "置信度",
    cpConfidence: { high: "高", medium: "中", low: "低", insufficient: "不足" },
    cpSample: "{n} 次可用努力 · {points} 个包络点",
    cpFreshness: "最新努力 {date}",
    cpFit: "拟合 R² {r2} · 残差 {residual}%",
    cpWarningsLabel: "模型警告",
    cpWarning: {
      "too-few-efforts": "最大努力太少",
      "narrow-duration-range": "时长范围较窄",
      "stale-efforts": "最新努力已过旧",
      "mixed-sports": "混合运动项目",
      "outlier-sensitive": "拟合易受离群值影响",
      "unrealistic-fit": "已拒绝不现实拟合",
      "estimate-only": "仅为估计",
    },
    cpPredictTitle: "我能维持多少？",
    cpPredictSub: "基于所选模型的单一运动配速和完赛时间预测。配速已标准化为 /500m。",
    cpMixedPredictNote: "请选择一个运动项目查看配速预测；全部运动视图仅显示功率。",
    cpModeDuration: "维持…",
    cpModeDistance: "用时…",
    cpHoldFor: "维持",
    cpMinutes: "分钟",
    cpDistance: "距离",
    cpPaceHint: "{scope} 约 {min} 分钟的均速配速",
    cpTimeHint: "{scope} 完成 {dist} 的预测时间",
    cpPreset6: "6 分钟",
    cpPreset20: "20 分钟",
    cpPreset30: "30 分钟",
    cpPreset60: "60 分钟",
    cpDist500: "500 米",
    cpDist2k: "2k",
    cpDist5k: "5k",
    cpDist10k: "10k",
    cpChartTitle: "功率–时长：实测 vs 模型",
    cpChartHint: "圆点为你的场次最佳；曲线为 CP/W′ 预测。高于曲线表示超出模型预期。",
    cpChartActual: "你的最佳",
    cpChartModel: "CP 模型",
  },
  milestone: {
    title: "里程碑",
    next: "下一个",
    lifetime_distance_rower_100k: "累计划船100k米",
    "lifetime_distance_rower_100k.toast": "🎉 累计划船100k米!",
    lifetime_distance_rower_250k: "累计划船250k米",
    "lifetime_distance_rower_250k.toast": "🎉 累计划船250k米!",
    lifetime_distance_rower_500k: "累计划船500k米",
    "lifetime_distance_rower_500k.toast": "🎉 累计划船500k米!",
    lifetime_distance_rower_1M: "累计划船100万米",
    "lifetime_distance_rower_1M.toast": "🎉 累计划船100万米!",
    lifetime_distance_rower_2M: "累计划船200万米",
    "lifetime_distance_rower_2M.toast": "🎉 累计划船200万米!",
    lifetime_distance_rower_5M: "累计划船500万米",
    "lifetime_distance_rower_5M.toast": "🎉 累计划船500万米!",
    lifetime_distance_rower_10M: "累计划船1000万米",
    "lifetime_distance_rower_10M.toast": "🎉 累计划船1000万米!",
    lifetime_distance_skierg_100k: "100k米 SkiErg",
    "lifetime_distance_skierg_100k.toast": "🎉 100k米 SkiErg!",
    lifetime_distance_skierg_250k: "250k米 SkiErg",
    "lifetime_distance_skierg_250k.toast": "🎉 250k米 SkiErg!",
    lifetime_distance_skierg_500k: "500k米 SkiErg",
    "lifetime_distance_skierg_500k.toast": "🎉 500k米 SkiErg!",
    lifetime_distance_skierg_1M: "100万米 SkiErg",
    "lifetime_distance_skierg_1M.toast": "🎉 100万米 SkiErg!",
    lifetime_distance_skierg_2M: "200万米 SkiErg",
    "lifetime_distance_skierg_2M.toast": "🎉 200万米 SkiErg!",
    lifetime_distance_skierg_5M: "500万米 SkiErg",
    "lifetime_distance_skierg_5M.toast": "🎉 500万米 SkiErg!",
    lifetime_distance_skierg_10M: "1000万米 SkiErg",
    "lifetime_distance_skierg_10M.toast": "🎉 1000万米 SkiErg!",
    lifetime_distance_bike_100k: "100k米 BikeErg",
    "lifetime_distance_bike_100k.toast": "🎉 100k米 BikeErg!",
    lifetime_distance_bike_250k: "250k米 BikeErg",
    "lifetime_distance_bike_250k.toast": "🎉 250k米 BikeErg!",
    lifetime_distance_bike_500k: "500k米 BikeErg",
    "lifetime_distance_bike_500k.toast": "🎉 500k米 BikeErg!",
    lifetime_distance_bike_1M: "100万米 BikeErg",
    "lifetime_distance_bike_1M.toast": "🎉 100万米 BikeErg!",
    lifetime_distance_bike_2M: "200万米 BikeErg",
    "lifetime_distance_bike_2M.toast": "🎉 200万米 BikeErg!",
    lifetime_distance_bike_5M: "500万米 BikeErg",
    "lifetime_distance_bike_5M.toast": "🎉 500万米 BikeErg!",
    lifetime_distance_bike_10M: "1000万米 BikeErg",
    "lifetime_distance_bike_10M.toast": "🎉 1000万米 BikeErg!",
    lifetime_distance_combined_100k: "累计100k米",
    "lifetime_distance_combined_100k.toast": "🎉 累计100k米!",
    lifetime_distance_combined_250k: "累计250k米",
    "lifetime_distance_combined_250k.toast": "🎉 累计250k米!",
    lifetime_distance_combined_500k: "累计500k米",
    "lifetime_distance_combined_500k.toast": "🎉 累计500k米!",
    lifetime_distance_combined_1M: "累计100万米",
    "lifetime_distance_combined_1M.toast": "🎉 累计100万米!",
    lifetime_distance_combined_2M: "累计200万米",
    "lifetime_distance_combined_2M.toast": "🎉 累计200万米!",
    lifetime_distance_combined_5M: "累计500万米",
    "lifetime_distance_combined_5M.toast": "🎉 累计500万米!",
    lifetime_distance_combined_10M: "累计1000万米",
    "lifetime_distance_combined_10M.toast": "🎉 累计1000万米!",
    session_count_10: "10 次训练",
    "session_count_10.toast": "🎉 10 次训练!",
    session_count_25: "25 次训练",
    "session_count_25.toast": "🎉 25 次训练!",
    session_count_50: "50 次训练",
    "session_count_50.toast": "🎉 50 次训练!",
    session_count_100: "100 次训练",
    "session_count_100.toast": "🎉 100 次训练!",
    session_count_250: "250 次训练",
    "session_count_250.toast": "🎉 250 次训练!",
    session_count_500: "500 次训练",
    "session_count_500.toast": "🎉 500 次训练!",
    session_count_1000: "1000 次训练",
    "session_count_1000.toast": "🎉 1000 次训练!",
    session_count_2500: "2500 次训练",
    "session_count_2500.toast": "🎉 2500 次训练!",
    streak_7d: "连续训练 7 天",
    "streak_7d.toast": "🎉 连续训练 7 天!",
    streak_14d: "连续训练 14 天",
    "streak_14d.toast": "🎉 连续训练 14 天!",
    streak_30d: "连续训练 30 天",
    "streak_30d.toast": "🎉 连续训练 30 天!",
    streak_60d: "连续训练 60 天",
    "streak_60d.toast": "🎉 连续训练 60 天!",
    streak_100d: "连续训练 100 天",
    "streak_100d.toast": "🎉 连续训练 100 天!",
    pb_2k_sub8: "2k 进 8 分",
    "pb_2k_sub8.toast": "🎉 2k 进 8 分!",
    pb_2k_sub730: "2k 进 7:30",
    "pb_2k_sub730.toast": "🎉 2k 进 7:30!",
    pb_2k_sub7: "2k 进 7 分",
    "pb_2k_sub7.toast": "🎉 2k 进 7 分!",
    pb_2k_sub630: "2k 进 6:30",
    "pb_2k_sub630.toast": "🎉 2k 进 6:30!",
  },
  workout: {
    tag: {
      label: "类型",
      auto: "自动识别",
      "steady-state": "稳态",
      interval: "间歇",
      "race-piece": "竞赛距离",
      "time-trial": "计时测试",
      "warmup-cooldown": "热身/放松",
      unknown: "其他",
      filter: { all: "全部类型" },
      saveError: "无法保存标签，请重试。",
    },
  },
  workoutList: {
    empty: "该筛选条件下没有训练。",
    windowed: "{n} 次训练 · 已虚拟化以提升性能",
    filtersTitle: "查找训练",
    matching: "匹配 {n} 条",
    clearFilters: "清除筛选",
    expand: "更多筛选",
    collapse: "收起筛选",
    dateFrom: "起始",
    dateTo: "截止",
    workoutType: "Logbook 类型",
    anyType: "任意 Logbook 类型",
    strokeData: "划桨数据",
    strokeAny: "不限",
    strokeYes: "有划桨数据",
    strokeNo: "无划桨数据",
    searchComments: "搜索备注…",
    search: "搜索",
    distanceChips: "距离",
    durationChips: "时长",
    durationMin: "{n} 分钟",
    chipMarathon: "马拉松",
    sortGroup: "排序",
    sortDate: "日期",
    sortDistance: "距离",
    sortTime: "时间",
    sortPace: "配速",
    sortPower: "功率",
    pbsOnly: "仅 PB",
    compare: "对比",
    comparePick: "先选择要对比的训练",
    compareWith: "与此训练对比",
    compareCancel: "取消",
    openReplay: "打开回放",
  },
  share: {
    shareReplay: "分享回放",
    downloadImage: "下载图片",
    linkCopied: "分享链接已复制",
    linkReady: "拥有此链接的人均可观看回放",
    shareFailed: "无法创建分享链接",
    privacyBlocked: "此训练在 Concept2 上未公开，无法分享。请先在日志中将其隐私设置为“Everyone”。",
    imageSaved: "成绩卡已保存",
    imageFailed: "无法保存成绩卡",
    publicBanner: "共享回放 — 只读查看",
    ctaBefore: "想要自己的回放？",
    ctaLink: "试试 rowplay",
    ctaAfter: " — Concept2 日志分析与训练回放。",
    raceCardBrand: "rowplay",
    raceCardAvgPower: "平均功率",
    raceCardAvgHr: "平均心率",
  },
  replay: {
    hrImportTitle: "导入心率",
    hrImportHint:
      "该训练在日志中没有心率。上传手表导出文件（CSV、TCX 或 FIT）即可在回放中叠加心率。",
    hrImportFormats: "CSV · TCX · FIT",
    hrImportOffset: "手表起始偏移",
    hrImportOffsetHint: "若手表比开始划桨更早启动，请填正数（秒）。",
    hrImportPreview: "{count} 个采样点 · 约 {avg} bpm 平均",
    hrImportApply: "应用心率",
    hrImportClear: "移除导入的心率",
    hrImportApplied: "心率已导入",
    hrImportCleared: "已移除导入的心率",
    hrImportTooFew: "该文件的有效心率采样点过少。",
    hrImportSaveFailed: "无法保存心率导入",
    hrImportClearFailed: "无法移除心率导入",
    back: "返回仪表板",
    moments: {
      title: "训练亮点",
      subtitle: "优先回看的关键片段。",
      lowResolution: "基于分段",
      jump: "跳到片段",
      bpm: "bpm",
      "best-sustained": "最佳持续推进",
      "slower-patch": "较慢片段",
      "efficient-rhythm": "最高效节奏",
      "finish-trend": "冲刺趋势",
      "best-rep": "最佳一组",
      "slowest-rep": "较慢一组",
      reasonBestSustained: "比今天基准快 {delta}%。",
      reasonSlowerPatch: "比今天基准慢 {delta}%；可检查节奏和恢复。",
      reasonEfficientRhythm: "不用最高桨频也保持了强配速。",
      reasonFinishStronger: "最后三分之一比前三分之一快 {delta}%。",
      reasonFinishFade: "最后三分之一比前三分之一慢 {delta}%。",
      reasonFinishSteady: "最后三分之一与前三分之一相差 {delta}% 内。",
      reasonBestRep: "第 {rep} 组比平均快 {delta} 秒/500m。",
      reasonSlowestRep: "第 {rep} 组比平均慢 {delta} 秒/500m。",
    },
    lowRes: "低分辨率回放",
    compareAgainst: "对比对象：",
    none: "无",
    pastSession: "一次过往训练",
    constantPace: "恒定配速",
    uploadedFile: "上传的文件",
    moreOptions: "更多选项",
    moreCompareOptions: "更多比较选项",
    chooseSession: "选择一次 {sport} 训练…",
    setPace: "设定配速",
    targetPace: "目标配速",
    targetPacePlaceholder: "分:秒",
    targetPaceSet: "设置目标配速",
    targetPaceClear: "清除",
    targetPaceBand: "显示 ±5 秒区间",
    fileFormats: "CSV · TCX · FIT",
    ahead: "▲ 领先 {m} 米",
    behind: "▼ 落后 {m} 米",
    searchSessions: "搜索训练…",
    suggestedRival: "推荐对手",
    raceVerdictWinSession:
      "你战胜了 {date} 的 {distance}，领先 {seconds} 秒（冲线时你领先 {m} 米）",
    raceVerdictLoseSession:
      "{date} 的 {distance} 战胜了你，领先 {seconds} 秒（冲线时你落后 {m} 米）",
    raceVerdictWinPace: "你战胜了 {pace} 配速艇，领先 {seconds} 秒（冲线时你领先 {m} 米）",
    raceVerdictLosePace: "{pace} 配速艇战胜了你，领先 {seconds} 秒（冲线时你落后 {m} 米）",
    raceVerdictWinFile: "你战胜了 {name}，领先 {seconds} 秒（冲线时你领先 {m} 米）",
    raceVerdictLoseFile: "{name} 战胜了你，领先 {seconds} 秒（冲线时你落后 {m} 米）",
    raceFinished: "竞速结束",
    play: "播放",
    pause: "暂停",
    viewToggle: "赛道视图",
    view2d: "2D",
    view3d: "3D",
    view3dUnsupported: "此设备需要 WebGPU 或 WebGL 才能使用 3D 视图",
    view3dLoading: "正在加载 3D…",
    view3dError: "无法加载 3D 视图",
    quality: "画质",
    qualityLow: "低",
    qualityMedium: "中",
    qualityHigh: "高",
    qualityUltra: "极高",
    backendWebgpu: "WebGPU",
    backendWebgl: "WebGL",
    gPace: "配速",
    gRate: "桨频",
    gPower: "功率",
    gHeart: "心率",
    cPace: "配速",
    cRate: "桨频",
    cPower: "功率",
    cHeart: "心率",
    strokeQuality: "划桨质量",
    avgDistStroke: "平均每桨距离",
    avgRate: "平均桨频",
    paceVariation: "配速波动",
    paceVariationHint: "（越低越平稳）",
    fade: "衰减",
    negSplit: "后程加速",
    slowedDown: "后程减速",
    distPerStroke: "每桨距离",
    distPerStrokeHint: "——越高代表划桨越有力",
    paceVsRate: "配速对桨频",
    paceVsRateHint: "——找到你最高效的桨频",
    powerCurve: "功率曲线（各时长内的最佳平均功率）",
    hrZones: "心率区间（各区间用时）",
    intervalBreakdown: "间歇分解",
    repComparison: "组次对比",
    repComparisonN: "组次对比（{n} 组）",
    repComparisonRep: "第 {n} 组",
    repComparisonAvgPace: "均 {pace}",
    repComparisonMetricPace: "配速",
    repComparisonMetricRate: "桨频",
    repComparisonMetricPower: "功率",
    repComparisonMetricHr: "心率",
    splitBreakdown: "分段分解",
    segReps: "组",
    segSplits: "段",
    avgRepPace: "平均每组配速",
    avgSplitPace: "平均每段配速",
    consistency: "一致性",
    consistencyHint: "（越低越均匀）",
    setFade: "整组衰减",
    faded: "衰减",
    fastestSlowest: "最快 → 最慢",
    splitsTitle: "分段",
    thNum: "#",
    thDist: "距离",
    thTime: "时间",
    thPace: "配速",
    thRate: "桨频",
    thHr: "心率",
    workoutDetails: "训练详情",
    mDate: "日期",
    mSport: "器械",
    mType: "类型",
    mDistance: "距离",
    mTime: "时间",
    mAvgPace: "平均配速",
    mAvgRate: "平均桨频",
    mStrokeCount: "划桨数",
    mAvgPower: "平均功率",
    mAvgHr: "平均心率",
    mHrRange: "心率范围",
    mCalories: "卡路里",
    mDragFactor: "阻尼系数",
    mResolution: "数据精度",
    mSegments: "分段",
    mWorkoutId: "训练编号",
    mComments: "备注",
    samples: "个采样点",
    perStroke: "逐桨",
    fromSplits: "由分段合成",
    intervalsWord: "组间歇",
    splitsWord: "段",
    racingSession: "正在与你 {date} 的训练竞速",
    racingFile: "正在与 {name} 竞速",
    ghostYour: "你的 {date}",
    loadSessionFailed: "无法加载该训练",
    paceError: "请输入配速，如 1:52",
    pacingAt: "以 {pace} 配速",
    noSamples: "该文件中没有可用的训练采样点。请尝试其他文件或检查格式。",
    fileReadError: "无法读取该文件。请确认文件是 CSV、TCX 或 FIT 导出格式。",
    importFailed: "无法导入该文件。请确保文件是有效的 CSV、TCX 或 FIT 导出格式。",
    zone1: "Z1 恢复",
    zone2: "Z2 耐力",
    zone3: "Z3 节奏",
    zone4: "Z4 阈值",
    zone5: "Z5 最大",
    fullMetrics: "完整指标",
    mHrEnding: "结束时心率",
    mHrRecovery: "恢复心率",
    mHrDrop: "心率下降",
    mRestTime: "休息时间",
    mRestDistance: "休息距离",
    mWeightClass: "体重级别",
    mVerified: "已验证",
    mTimezone: "时区",
    mPrivacy: "隐私",
    mWattMinutes: "瓦特分钟",
    provenanceTitle: "记录来源",
    mPmVersion: "PM 版本",
    mFirmware: "固件",
    mSerial: "序列号",
    mDevice: "设备",
    mSource: "记录来源",
    exrBadge: "EXR 来源",
    exrBadgeTitle:
      "配速与功率由 EXR 算法生成，而非 PM5 实测。数值可能与 PM 记录的训练不可直接比较。",
    mErgModel: "器械型号",
    mHrSensor: "心率传感器",
    targetsTitle: "目标",
    mTargetPace: "目标配速",
    mTargetWatts: "目标功率",
    mTargetRate: "目标桨频",
    mTargetHrZone: "目标心率区",
    mTargetCalories: "目标卡路里",
    targetVsActualTitle: "目标与实际",
    targetHit: "达标",
    targetMiss: "未达标",
    workRestTitle: "做功 : 休息",
    workRestRatio: "做功/休息秒比",
    thCalories: "卡",
    thWattMin: "瓦分",
    thIntervalType: "类型",
    thRest: "休息",
    thRestYes: "休息",
    verifiedYes: "已验证",
    verifiedNo: "未验证",
    weightHeavy: "重量级",
    weightLight: "轻量级",
    intervalTypeTime: "时间",
    intervalTypeDistance: "距离",
    intervalTypeCalorie: "卡路里",
    intervalTypeWattminute: "瓦特分钟",
    removeGhost: "移除对手",
    racingAgainst: "正在与 {name} 竞赛",
    compareAction: "对比",
    legendTitle: "图例",
    legendGhost: "幽灵",
    kbTitle: "键盘快捷键",
    kbSpaceHint: "播放 / 暂停",
    kbArrowHint: "快退/快进 ±10 秒",
    kbArrowShiftHint: "快退/快进 ±30 秒",
    kbBracketHint: "调整速度",
    kbHomeHint: "重置到开始",
  },
  inspector: {
    toggle: "字段检查器",
    toggleOn: "隐藏字段检查器",
    panelLabel: "原始字段检查器",
    sectionWorkout: "训练",
    sectionProvenance: "来源",
    sectionPerStroke: "逐桨",
    colField: "字段",
    colAsLogged: "原始记录",
    colNormalized: "标准化",
    derived: "推导",
    noStrokeData: "当前时刻无逐桨采样。",
    tableLabel: "逐桨字段读数",
    staticSport: "项目",
    staticDistance: "距离",
    staticTime: "时间",
    staticDrag: "阻力系数",
    staticType: "训练类型",
    staticResolution: "分辨率",
    fieldT: "用时（十分之一秒）",
    fieldD: "距离（分米）",
    fieldP: "配速（十分之一）",
    fieldSpm: "桨频",
    fieldHr: "心率",
    fieldWatts: "功率（推导）",
    fieldProgress: "进度",
    fieldSplit: "分段序号",
    fieldInterval: "间歇序号",
    fieldDps: "每桨距离",
    metaPm: "PM 版本",
    metaFirmware: "固件",
    metaErg: "器械型号",
    metaHrSensor: "心率传感器",
    metaSource: "来源应用",
    metaSerial: "序列号",
    metaDevice: "设备",
  },
  drift: {
    toggle: "显示效率漂移",
    toggleOn: "隐藏效率漂移",
    baseline: "开局基线",
    fade: "效率衰减",
    unit: " 米/桨",
    summaryTitle: "每桨距离漂移",
    summaryHint: "从开局段到结束段的 DPS 变化",
    axisLabel: "DPS",
  },
  settings: {
    title: "账户与数据",
    eyebrow: "你的数据",
    dataTitle: "你的数据如何处理",
    dataNote:
      "rowplay 每次访问时从 Concept2 API 实时读取你的训练数据。你的登录令牌保存在安全的浏览器 cookie 中 — 不会存储在任何服务器上。退出登录会清除它。",
    factWorkouts: "可导出 {n} 次训练",
    factDemo: "演示模式——仅示例数据，不会持久保存。",
    factCache: "训练数据通过 Concept2 API 实时获取 — 无服务器端缓存。",
    factSession: "你的登录信息保存在安全的浏览器 cookie 中。我们的服务器上不存储任何数据。",
    exportTitle: "导出日志",
    exportNote:
      "以 CSV 或 JSON 下载完整历史。含逐桨数据的单次训练可导出 TCX，可在 Garmin、Strava 或 TrainingPeaks 中打开。",
    exportCsv: "下载 CSV",
    exportJson: "下载 JSON",
    exportTcxNote: "TCX 导出（含逐桨数据的训练）：",
    exportTcx: "训练 #{id} · TCX",
    syncTitle: "重新同步日志",
    syncNote:
      "增量同步仅获取上次同步之后的训练。完整重新同步会重新下载全部历史（较慢，出问题时使用）。",
    syncIncremental: "增量同步",
    syncFull: "完整重新同步",
    loadFullHistory: "加载完整历史",
    syncDemo: "演示模式下无法同步——连接你的日志以同步真实数据。",
    lastSync: "已缓存 {total} 次训练 · 上次同步 {date}",
    neverSynced: "从未",
    deleteTitle: "清除缓存数据",
    deleteNote: "从 rowplay 删除已缓存的训练与回放详情并退出登录。你的 Concept2 日志不会被修改。",
    deleteAction: "删除我的缓存数据",
    deleteConfirm:
      "删除 rowplay 中所有已缓存的训练与回放数据并退出登录？你的 Concept2 日志不会被更改。",
    deleteDemo: "演示模式——未存储任何数据，无需删除。",
    deleteDone: "已清除缓存数据，你已退出登录。",
    deleteFailed: "无法清除缓存数据",
    timezoneTitle: "主时区",
    timezoneNote: "选择你的本地时区，使临近午夜划行的训练显示在正确的日历日上。",
    timezoneLabel: "主时区",
    timezoneSaved: "时区已保存",
    timezoneUtcDefault: "UTC（默认）",
    timezoneGroupAmericas: "美洲",
    timezoneGroupEuropeAfrica: "欧洲 / 非洲",
    timezoneGroupAsiaPacific: "亚洲 / 太平洋",
    lastSyncError: "{total} 次训练 · 上次同步失败：{message}",
    partialCache: "已缓存 {n} 次训练 · 历史记录仍在加载",
    exportPreviewCsv: "CSV：每次训练一行，列顺序固定（17 列）",
    exportPreviewJson: "JSON：包含架构元数据的数组（版本 1）",
    exportPreviewTcx: "TCX 2.0：逐桨轨迹点，兼容 Garmin/Strava",
    noTcxAvailable: "没有含逐桨数据的训练可用于 TCX 导出。",
  },
  token: {
    title: "使用你的 Concept2 令牌",
    introBefore: "从 Concept2 日志粘贴你的个人 API 令牌（",
    introLink: "编辑资料 → 应用",
    introAfter:
      "）。令牌通过 HTTPS 发送，验证后仅保存在安全的浏览器 cookie 中 — 不会存储在任何服务器上。",
    trustTitle: "rowplay 如何处理令牌",
    trustAccessTitle: "访问：",
    trustAccessBody: "个人 Concept2 令牌代表你本人认证；rowplay 只用它读取资料、训练和逐桨数据。",
    trustStoredTitle: "存储：",
    trustStoredBody:
      "验证后的令牌保存在安全的浏览器 cookie 中 — 不使用 localStorage 或任何服务器端存储。",
    trustDisconnectTitle: "断开：",
    trustDisconnectBody: "页眉中的「退出登录」会清除令牌和会话。",
    trustCacheTitle: "数据：",
    trustCacheBody: "训练数据每次请求时通过 Concept2 API 实时获取 — 服务器端不存储任何内容。",
    apiToken: "API 令牌",
    placeholder: "粘贴你的令牌",
    connect: "使用令牌连接",
    connecting: "连接中…",
    rejected: "Concept2 拒绝了该令牌，请检查后重试。",
    serverUnavailable: "无法连接 Concept2，服务器可能暂时不可用。请稍后再试。",
    serverMisconfigured: "此部署未配置令牌登录（缺少 SESSION_SECRET）。请联系站点所有者。",
    empty: "请粘贴你的 Concept2 API 令牌。",
    preferBefore: "想用标准流程？",
    preferLink: "连接 Concept2",
  },
  comparability: {
    blockedTitle: "无法对比的训练",
    guidance: "请选择同一器械、同一类型且距离或时长区间相同的两次训练。",
    noComparableCandidates: "没有可对比的历史训练。",
    groupComparable: "可对比",
    groupIncomparable: "其他（不可对比）",
    reason: {
      crossSport: "这两次训练使用的器械不同。",
      crossAxis: "一次为固定距离，另一次为固定时间。",
      crossBand: "这两次训练的距离或时长区间不同。",
    },
  },
  compare: {
    title: "训练对比",
    lead: "两次训练的并排数据与叠加图表。",
    back: "返回仪表板",
    workoutA: "训练 A",
    workoutB: "训练 B",
    choose: "选择…",
    run: "对比",
    swap: "交换",
    pickTwo: "请在上方选择两次训练进行对比。",
    deltaTable: "逐项对比",
    deltaHint: "正的差值表示训练 A 更高。",
    alignedNote: "对齐距离：{distance}",
    noStrokeData: "没有可用的划桨数据来绘制叠加图表。",
    winnerA: "训练 A 胜出",
    winnerB: "训练 B 胜出",
    tie: "平局",
    verdictTimeA: "训练 A 快了 {seconds} 秒",
    verdictTimeB: "训练 B 快了 {seconds} 秒",
    verdictPaceA: "训练 A 快了 {delta}",
    verdictPaceB: "训练 B 快了 {delta}",
    statTime: "时间",
    statPace: "配速",
    statAvgPower: "平均功率",
    statBest5sPower: "最佳 5 秒功率",
    statAvgHr: "平均心率",
    statDps: "每桨距离",
    statConsistency: "一致性",
    statMetric: "指标",
    statDelta: "Δ（A − B）",
    repTimeDelta: "时间 Δ",
    vsDistance: "对距离",
    intervalTitle: "间歇对比",
    intervalHint: "各组配速和时间差异。",
  },
} as const;
