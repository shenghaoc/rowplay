import { createContext } from 'svelte';

/** App theme (cookie / replay / charts). Light maps to daisyUI theme `rowplay`. */
export type ThemeName = 'light' | 'dark';

/** `data-theme` on `<html>` — must match @plugin "daisyui" { themes: rowplay, dark }. */
export function daisyThemeName(theme: ThemeName): 'rowplay' | 'dark' {
	return theme === 'dark' ? 'dark' : 'rowplay';
}

function persistTheme(theme: ThemeName) {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.theme = daisyThemeName(theme);
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

/**
 * Reactive theme. Seeded from the server (cookie) so SSR and the client agree;
 * shared via context like {@link I18n}.
 */
export class Theme {
	value = $state<ThemeName>('light');

	constructor(initial: ThemeName = 'light') {
		this.value = initial;
	}

	get isDark() {
		return this.value === 'dark';
	}

	set(next: ThemeName) {
		this.value = next;
		persistTheme(next);
	}

	toggle() {
		this.set(this.value === 'dark' ? 'light' : 'dark');
	}
}

export const [getThemeContext, setThemeContext] = createContext<Theme>();
