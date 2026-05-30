import { createContext } from 'svelte';
import { getValue, persistLanguage, type Language } from './i18n';

/**
 * Reactive translator. Instantiated once in the root layout and shared via
 * context (SSR-safe — no shared-module singleton that could leak between users).
 */
export class I18n {
	lang = $state<Language>('en');

	constructor(initial: Language = 'en') {
		this.lang = initial;
	}

	t = (key: string): string => getValue(this.lang, key) ?? getValue('en', key) ?? key;

	setLanguage(next: Language) {
		this.lang = next;
		persistLanguage(next);
	}

	toggle() {
		this.setLanguage(this.lang === 'en' ? 'zh' : 'en');
	}
}

export const [getI18nContext, setI18nContext] = createContext<I18n>();
