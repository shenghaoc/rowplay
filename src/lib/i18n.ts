/**
 * Hand-rolled i18n (no library — same approach as the other apps). Pure
 * types/dictionaries/helpers live here; the reactive `I18n` `$state` class is in
 * `i18n.svelte.ts`. Keys are dot-paths into nested dictionaries; `t()` falls
 * back to English, then the key itself.
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

const en = {
	nav: { dashboard: 'Dashboard' },
	common: { demoMode: 'demo mode' },
	auth: {
		connect: 'Connect Concept2',
		useToken: 'Use a token',
		logout: 'Log out'
	},
	theme: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
	lang: { switch: 'Switch language' }
} as const;

const zh = {
	nav: { dashboard: '仪表板' },
	common: { demoMode: '演示模式' },
	auth: {
		connect: '连接 Concept2',
		useToken: '使用令牌',
		logout: '退出登录'
	},
	theme: { toLight: '切换到浅色模式', toDark: '切换到深色模式' },
	lang: { switch: '切换语言' }
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
