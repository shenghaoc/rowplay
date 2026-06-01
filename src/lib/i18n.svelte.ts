import { createContext } from 'svelte';
import {
	getValue,
	interpolate,
	persistLanguage,
	SUPPORTED_LANGUAGES,
	type Language
} from './i18n';

/**
 * Reactive translator. Instantiated once in the root layout and shared via
 * context (SSR-safe — no shared-module singleton that could leak between users).
 */
export class I18n {
	lang = $state<Language>('en');

	constructor(initial: Language = 'en') {
		this.lang = initial;
	}

	/** Reactive translator — use via `$derived(i18n.translate)` in components. */
	translate = $derived.by(() => {
		const lang = this.lang;
		return (key: string, vars?: Record<string, string | number>) =>
			interpolate(getValue(lang, key) ?? getValue('en', key) ?? key, vars);
	});

	/** Imperative translate (e.g. server callbacks); prefer `translate` in UI. */
	t = (key: string, vars?: Record<string, string | number>): string =>
		interpolate(getValue(this.lang, key) ?? getValue('en', key) ?? key, vars);

	setLanguage(next: Language) {
		this.lang = next;
		persistLanguage(next);
	}

	/** Cycle through bundled locales (used where a compact control is enough). */
	cycle() {
		const i = SUPPORTED_LANGUAGES.indexOf(this.lang);
		const next = SUPPORTED_LANGUAGES[(i + 1) % SUPPORTED_LANGUAGES.length];
		this.setLanguage(next);
	}
}

export const [getI18nContext, setI18nContext] = createContext<I18n>();
