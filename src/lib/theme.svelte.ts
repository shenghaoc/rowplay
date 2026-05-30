import { createContext } from 'svelte';

export type ThemeName = 'light' | 'dark';

function persistTheme(theme: ThemeName) {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.theme = theme;
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
