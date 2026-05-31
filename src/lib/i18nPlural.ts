import type { Language } from './i18n';

/** English one/other; Chinese uses the same template with {n}. */
export function pluralKey(lang: Language, base: string, n: number): string {
	if (lang === 'en' && n === 1) return `${base}_one`;
	return base;
}
