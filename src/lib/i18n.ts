/**
 * Hand-rolled i18n (no library — same approach as the other apps). Pure
 * types/dictionaries/helpers live here; the reactive `I18n` `$state` class is in
 * `i18n.svelte.ts`. Keys are dot-paths into nested dictionaries; `t()` falls
 * back to English, then the key itself, and supports `{param}` interpolation.
 * Sport names (RowErg/SkiErg/BikeErg) are Concept2 brand terms — left untranslated.
 */
export type Language = 'en' | 'zh';

export const LANGUAGES: { value: Language; label: string }[] = [
	{ value: 'en', label: 'English' },
	{ value: 'zh', label: '中文' }
];

export function getStoredLanguage(): Language {
	if (typeof window === 'undefined') return 'en';
	return localStorage.getItem('lang') === 'zh' ? 'zh' : 'en';
}

export function persistLanguage(language: Language) {
	if (typeof document === 'undefined') return;
	localStorage.setItem('lang', language);
	document.documentElement.lang = language;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `lang=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
	if (!vars) return template;
	return Object.entries(vars).reduce(
		(acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
		template
	);
}

const en = {
	nav: { dashboard: 'Dashboard' },
	common: { demoMode: 'demo mode', replay: 'Replay', loading: 'loading…' },
	auth: {
		connect: 'Connect Concept2',
		useToken: 'Use a token',
		logout: 'Log out'
	},
	theme: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
	lang: { switch: 'Switch language' },
	landing: {
		tagline: 'Concept2 · RowErg · SkiErg · BikeErg',
		title1: 'Replay your workouts.',
		title2: 'Understand your splits.',
		lead: 'rowplay connects to your Concept2 logbook and turns every result into rich analytics — and a real-time replay you can watch stroke by stroke, with a live course and synchronized pace, rate, power and heart-rate telemetry.',
		exploreDemo: 'Explore the demo →',
		openDashboard: 'Open dashboard →',
		connect: 'Connect your Concept2 logbook →',
		demoNote: 'Running in demo mode with sample data. Add a personal token to load your own logbook.',
		feat1Title: 'Real-time replay',
		feat1Body: 'Watch your pace race the course while gauges and charts play back in sync.',
		feat2Title: 'Split analytics',
		feat2Body: 'Pace, stroke rate, power and HR over time — across all three machines.',
		feat3Title: 'On the edge',
		feat3Body: 'Served from Cloudflare with cached stroke data for instant replays.'
	},
	dashboard: {
		title: 'Dashboard',
		all: 'All',
		sync: 'Sync',
		syncing: 'Syncing…',
		syncedNote: '{total} workouts · last synced {date}',
		recentNote: 'Showing recent workouts — hit Sync to load your full history for accurate PBs and trends.',
		latest: 'Latest',
		distance: 'distance',
		time: 'time',
		avgRate: 'avg rate',
		distStroke: 'dist/stroke',
		avgBpm: 'avg bpm',
		vsAvg: 'vs your {sport} avg',
		sessions: 'Sessions',
		totalDistance: 'Total distance',
		totalTime: 'Total time',
		avgPace: 'Avg pace',
		pbTitle: 'Personal bests · standard distances',
		bySport: 'By sport',
		thSport: 'Sport',
		thSessions: 'Sessions',
		thDistance: 'Distance',
		thTime: 'Time',
		thAvgPace: 'Avg pace',
		thBestPace: 'Best pace',
		trendTitle: 'Trend over time',
		likeForLike: '{sport}, like-for-like distance',
		mPace: 'Pace',
		mDistStroke: 'Dist/stroke',
		mDistance: 'Distance',
		mRate: 'Rate',
		holdingSteady: 'Holding steady — {metric} flat over {days} days',
		improving: 'Improving — {change} over {days} days',
		slipping: 'Slipping — {change} over {days} days',
		faster: '{delta} faster',
		slower: '{delta} slower',
		emptyTrend: 'Only {n} session in this band — log another {band} to see a trend.'
	},
	workoutList: {
		empty: 'No workouts for this filter.',
		windowed: '{n} workouts · windowed for performance'
	},
	replay: {
		back: 'Back to dashboard',
		lowRes: 'low-res replay',
		compareAgainst: 'Compare against:',
		none: 'None',
		pastSession: 'A past session',
		constantPace: 'A constant pace',
		uploadedFile: 'An uploaded file',
		chooseSession: 'Choose a {sport} session…',
		setPace: 'Set pace',
		fileFormats: 'CSV · TCX · FIT',
		ahead: '▲ ahead by {m}m',
		behind: '▼ behind by {m}m',
		play: 'Play',
		pause: 'Pause',
		gPace: 'Pace',
		gRate: 'Rate',
		gPower: 'Power',
		gHeart: 'Heart',
		cPace: 'Pace',
		cRate: 'Stroke rate',
		cPower: 'Power',
		cHeart: 'Heart rate',
		strokeQuality: 'Stroke quality',
		avgDistStroke: 'avg dist / stroke',
		avgRate: 'avg rate',
		paceVariation: 'pace variation',
		paceVariationHint: '(lower = smoother)',
		fade: 'fade',
		negSplit: 'negative split',
		slowedDown: 'slowed down',
		distPerStroke: 'Distance per stroke',
		distPerStrokeHint: '— higher = more powerful stroke',
		paceVsRate: 'Pace vs rate',
		paceVsRateHint: '— find your most efficient rating',
		powerCurve: 'Power curve (best average over duration)',
		hrZones: 'Heart-rate zones (time in zone)',
		intervalBreakdown: 'Interval breakdown',
		splitBreakdown: 'Split breakdown',
		segReps: 'reps',
		segSplits: 'splits',
		avgRepPace: 'avg rep pace',
		avgSplitPace: 'avg split pace',
		consistency: 'consistency',
		consistencyHint: '(lower = evener)',
		setFade: 'set fade',
		faded: 'faded',
		fastestSlowest: 'fastest → slowest',
		splitsTitle: 'Splits',
		thNum: '#',
		thDist: 'Dist',
		thTime: 'Time',
		thPace: 'Pace',
		thRate: 'Rate',
		thHr: 'HR',
		workoutDetails: 'Workout details',
		mDate: 'Date',
		mSport: 'Sport',
		mType: 'Type',
		mDistance: 'Distance',
		mTime: 'Time',
		mAvgPace: 'Avg pace',
		mAvgRate: 'Avg rate',
		mStrokeCount: 'Stroke count',
		mAvgPower: 'Avg power',
		mAvgHr: 'Avg HR',
		mHrRange: 'HR range',
		mCalories: 'Calories',
		mDragFactor: 'Drag factor',
		mResolution: 'Resolution',
		mSegments: 'Segments',
		mWorkoutId: 'Workout id',
		mComments: 'Comments',
		samples: 'samples',
		perStroke: 'per-stroke',
		fromSplits: 'from splits',
		intervalsWord: 'intervals',
		splitsWord: 'splits'
	},
	token: {
		title: 'Use your Concept2 token',
		introBefore: 'Paste a personal API token from your Concept2 logbook (',
		introLink: 'Edit Profile → Applications',
		introAfter:
			'). rowplay keeps it server-side for your session only and uses it to read your own workouts — it never reaches the browser.',
		apiToken: 'API token',
		placeholder: 'Paste your token',
		connect: 'Connect with token',
		rejected: 'Concept2 rejected that token. Check it and try again.',
		empty: 'Paste your Concept2 API token.',
		preferBefore: 'Prefer the standard flow? ',
		preferLink: 'Connect Concept2'
	}
} as const;

const zh = {
	nav: { dashboard: '仪表板' },
	common: { demoMode: '演示模式', replay: '回放', loading: '加载中…' },
	auth: {
		connect: '连接 Concept2',
		useToken: '使用令牌',
		logout: '退出登录'
	},
	theme: { toLight: '切换到浅色模式', toDark: '切换到深色模式' },
	lang: { switch: '切换语言' },
	landing: {
		tagline: 'Concept2 · 划船机 · 滑雪机 · 单车机',
		title1: '回放你的训练。',
		title2: '读懂你的分段。',
		lead: 'rowplay 连接你的 Concept2 训练日志，把每条成绩转化为丰富的分析——以及可逐桨观看的实时回放，配有动态赛道和同步的配速、桨频、功率与心率数据。',
		exploreDemo: '体验演示 →',
		openDashboard: '打开仪表板 →',
		connect: '连接你的 Concept2 日志 →',
		demoNote: '正在以演示模式运行，使用示例数据。添加个人令牌以加载你自己的日志。',
		feat1Title: '实时回放',
		feat1Body: '观看你的配速在赛道上竞速，仪表与图表同步回放。',
		feat2Title: '分段分析',
		feat2Body: '配速、桨频、功率与心率随时间变化——涵盖全部三种器械。',
		feat3Title: '边缘加速',
		feat3Body: '由 Cloudflare 提供服务，缓存逐桨数据，实现即时回放。'
	},
	dashboard: {
		title: '仪表板',
		all: '全部',
		sync: '同步',
		syncing: '同步中…',
		syncedNote: '{total} 次训练 · 上次同步 {date}',
		recentNote: '正在显示最近的训练——点击「同步」以加载完整历史，获得准确的个人最佳与趋势。',
		latest: '最新',
		distance: '距离',
		time: '时间',
		avgRate: '平均桨频',
		distStroke: '每桨距离',
		avgBpm: '平均心率',
		vsAvg: '对比你的 {sport} 平均',
		sessions: '训练次数',
		totalDistance: '总距离',
		totalTime: '总时间',
		avgPace: '平均配速',
		pbTitle: '个人最佳 · 标准距离',
		bySport: '按器械',
		thSport: '器械',
		thSessions: '次数',
		thDistance: '距离',
		thTime: '时间',
		thAvgPace: '平均配速',
		thBestPace: '最佳配速',
		trendTitle: '随时间的趋势',
		likeForLike: '{sport}，同距离对比',
		mPace: '配速',
		mDistStroke: '每桨距离',
		mDistance: '距离',
		mRate: '桨频',
		holdingSteady: '保持稳定——{metric} 在 {days} 天内持平',
		improving: '正在进步——{days} 天内{change}',
		slipping: '有所退步——{days} 天内{change}',
		faster: '快了 {delta}',
		slower: '慢了 {delta}',
		emptyTrend: '该区间只有 {n} 次训练——再记录一次 {band} 即可看到趋势。'
	},
	workoutList: {
		empty: '该筛选条件下没有训练。',
		windowed: '{n} 次训练 · 已开启窗口化渲染以提升性能'
	},
	replay: {
		back: '返回仪表板',
		lowRes: '低分辨率回放',
		compareAgainst: '对比对象：',
		none: '无',
		pastSession: '一次过往训练',
		constantPace: '恒定配速',
		uploadedFile: '上传的文件',
		chooseSession: '选择一次 {sport} 训练…',
		setPace: '设定配速',
		fileFormats: 'CSV · TCX · FIT',
		ahead: '▲ 领先 {m} 米',
		behind: '▼ 落后 {m} 米',
		play: '播放',
		pause: '暂停',
		gPace: '配速',
		gRate: '桨频',
		gPower: '功率',
		gHeart: '心率',
		cPace: '配速',
		cRate: '桨频',
		cPower: '功率',
		cHeart: '心率',
		strokeQuality: '划桨质量',
		avgDistStroke: '平均每桨距离',
		avgRate: '平均桨频',
		paceVariation: '配速波动',
		paceVariationHint: '（越低越平稳）',
		fade: '衰减',
		negSplit: '后程加速',
		slowedDown: '后程减速',
		distPerStroke: '每桨距离',
		distPerStrokeHint: '——越高代表划桨越有力',
		paceVsRate: '配速对桨频',
		paceVsRateHint: '——找到你最高效的桨频',
		powerCurve: '功率曲线（各时长内的最佳平均功率）',
		hrZones: '心率区间（各区间用时）',
		intervalBreakdown: '间歇分解',
		splitBreakdown: '分段分解',
		segReps: '组',
		segSplits: '段',
		avgRepPace: '平均每组配速',
		avgSplitPace: '平均每段配速',
		consistency: '一致性',
		consistencyHint: '（越低越均匀）',
		setFade: '整组衰减',
		faded: '衰减',
		fastestSlowest: '最快 → 最慢',
		splitsTitle: '分段',
		thNum: '#',
		thDist: '距离',
		thTime: '时间',
		thPace: '配速',
		thRate: '桨频',
		thHr: '心率',
		workoutDetails: '训练详情',
		mDate: '日期',
		mSport: '器械',
		mType: '类型',
		mDistance: '距离',
		mTime: '时间',
		mAvgPace: '平均配速',
		mAvgRate: '平均桨频',
		mStrokeCount: '划桨数',
		mAvgPower: '平均功率',
		mAvgHr: '平均心率',
		mHrRange: '心率范围',
		mCalories: '卡路里',
		mDragFactor: '阻尼系数',
		mResolution: '数据精度',
		mSegments: '分段',
		mWorkoutId: '训练编号',
		mComments: '备注',
		samples: '个采样点',
		perStroke: '逐桨',
		fromSplits: '由分段合成',
		intervalsWord: '组间歇',
		splitsWord: '段'
	},
	token: {
		title: '使用你的 Concept2 令牌',
		introBefore: '从你的 Concept2 日志粘贴一个个人 API 令牌（',
		introLink: '编辑资料 → 应用',
		introAfter: '）。rowplay 仅在你的会话中将其保存在服务器端，用于读取你自己的训练——它绝不会进入浏览器。',
		apiToken: 'API 令牌',
		placeholder: '粘贴你的令牌',
		connect: '使用令牌连接',
		rejected: 'Concept2 拒绝了该令牌，请检查后重试。',
		empty: '请粘贴你的 Concept2 API 令牌。',
		preferBefore: '想用标准流程？',
		preferLink: '连接 Concept2'
	}
} as const;

const dictionaries = { en, zh } as const;

export function getValue(language: Language, key: string): string | undefined {
	let current: unknown = dictionaries[language];
	for (const segment of key.split('.')) {
		if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return typeof current === 'string' ? current : undefined;
}
