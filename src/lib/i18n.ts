/**
 * Hand-rolled i18n (no library — same approach as the other apps). Pure
 * types/dictionaries/helpers live here; the reactive `I18n` `$state` class is in
 * `i18n.svelte.ts`. Keys are dot-paths into nested dictionaries; `t()` falls
 * back to English, then the key itself, and supports `{param}` interpolation.
 * Sport names (RowErg/SkiErg/BikeErg) are Concept2 brand terms — left untranslated.
 */
/** BCP-47-ish codes for every bundled locale. Extend here when adding a language. */
export const SUPPORTED_LANGUAGES = ['en', 'zh', 'de', 'es', 'fr', 'ja'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGES: { value: Language; label: string }[] = [
	{ value: 'en', label: 'English' },
	{ value: 'zh', label: '中文' },
	{ value: 'de', label: 'Deutsch' },
	{ value: 'es', label: 'Español' },
	{ value: 'fr', label: 'Français' },
	{ value: 'ja', label: '日本語' }
];

export function isLanguage(value: unknown): value is Language {
	return (SUPPORTED_LANGUAGES as readonly unknown[]).includes(value);
}

export function getStoredLanguage(): Language {
	if (typeof window === 'undefined') return 'en';
	try {
		const stored = localStorage.getItem('lang');
		return isLanguage(stored) ? stored : 'en';
	} catch {
		return 'en';
	}
}

export function persistLanguage(language: Language) {
	if (typeof document === 'undefined') return;
	// Storage can throw in privacy-hardened browsers (strict Private Browsing,
	// blocking extensions). Don't let that abort the lang/cookie updates below —
	// mirrors the guard in getStoredLanguage.
	try {
		localStorage.setItem('lang', language);
	} catch {
		/* storage blocked — cookie below still carries the preference */
	}
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

export { getValue } from './locales';
