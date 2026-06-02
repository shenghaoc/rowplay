/**
 * daisyUI v5 with `prefix: du-` in src/app.css — component classes are `du-btn`, `du-card`, etc.
 * Custom layout code may freely use short names (`label`, `list`, `stats`, `badge`, …) without collision.
 *
 * @see .kiro/skills/daisyui/SKILL.md
 */

/** Must match @plugin "daisyui" { prefix: du- } in app.css */
export const DAISY_PREFIX = 'du-';

/** daisyUI component roots (unprefixed) — must not appear bare in class attributes */
export const DAISY_ROOTS = [
	'accordion',
	'alert',
	'avatar',
	'badge',
	'breadcrumbs',
	'btn',
	'calendar',
	'card',
	'carousel',
	'chat',
	'checkbox',
	'collapse',
	'countdown',
	'diff',
	'divider',
	'dock',
	'drawer',
	'dropdown',
	'fab',
	'fieldset',
	'file-input',
	'filter',
	'footer',
	'hero',
	'indicator',
	'input',
	'join',
	'kbd',
	'label',
	'link',
	'list',
	'loading',
	'mask',
	'menu',
	'modal',
	'navbar',
	'pagination',
	'progress',
	'radio',
	'range',
	'rating',
	'select',
	'skeleton',
	'stack',
	'stat',
	'stats',
	'status',
	'steps',
	'swap',
	'tab',
	'table',
	'tabs',
	'textarea',
	'timeline',
	'toast',
	'toggle',
	'tooltip',
	'validator',
	'theme-controller'
] as const;

const ROOT_SET = new Set<string>(DAISY_ROOTS);

export function classTokens(classAttr: string): string[] {
	return classAttr.trim().split(/\s+/).filter(Boolean);
}

function isBareDaisyToken(token: string): boolean {
	if (token.startsWith(DAISY_PREFIX)) return false;
	if (ROOT_SET.has(token)) return true;
	for (const r of DAISY_ROOTS) {
		if (token.startsWith(`${r}-`)) return true;
	}
	return false;
}

/** Unprefixed daisyUI class tokens in a class attribute (should use du-*). */
export function findUnprefixedDaisyTokens(classAttr: string): string[] {
	return classTokens(classAttr).filter(isBareDaisyToken);
}

export function labelHasToggleCollision(labelOpenTag: string): boolean {
	return /\bclass="[^"]*\b(?:du-)?toggle\b/.test(labelOpenTag);
}
