/**
 * daisyUI collision helpers for rowplay.
 *
 * Markup should use idiomatic daisyUI classes (`btn`, `stat-title`, …).
 * Custom layout hooks must not repurpose daisyUI component roots (especially
 * `stats`, which forces an opinionated grid). Scoped Svelte classes like
 * `drawer-nav` or `status-row` are fine — they never appear in `class=""` and
 * must not be treated as daisyUI tokens by prefix-stripping codemods.
 *
 * @see .kiro/specs/mobile-stats-spacing-fix/
 * @see .kiro/skills/daisyui/SKILL.md
 */

/** daisyUI v5 component roots — see `.kiro/skills/daisyui/SKILL.md` */
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

/** rowplay layout hooks — never prefix or treat as daisyUI markup */
export const ROWPLAY_LAYOUT_HOOKS = new Set([
	'dash-stats',
	'side-tag',
	'iconbtn',
	'drawer-nav',
	'drawer-actions',
	'drawer-theme',
	'menu-btn',
	'footer-inner',
	'status-row',
	'status-label',
	'status-time'
]);

/** Must not be used as a custom layout class in markup (use `dash-stats`). */
export const FORBIDDEN_CUSTOM_ROOTS = ['stats'] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_CUSTOM_ROOTS);

/**
 * Known daisyUI modifier / part segments (not exhaustive — extend when adopting
 * new components). Used to avoid false positives like `drawer-nav` or `menu-btn`.
 */
const MODIFIER_SEGMENTS = new Set([
	'primary',
	'secondary',
	'accent',
	'neutral',
	'info',
	'success',
	'warning',
	'error',
	'ghost',
	'outline',
	'dash',
	'soft',
	'link',
	'active',
	'disabled',
	'xs',
	'sm',
	'md',
	'lg',
	'xl',
	'square',
	'circle',
	'block',
	'bordered',
	'title',
	'value',
	'desc',
	'figure',
	'actions',
	'body',
	'image',
	'center',
	'horizontal',
	'vertical',
	'item',
	'reset',
	'text',
	'alt',
	'start',
	'end',
	'side',
	'toggle',
	'content',
	'open',
	'online',
	'offline',
	'placeholder'
]);

/** Per-root allowed suffixes when not covered by MODIFIER_SEGMENTS (drawer parts, etc.) */
const ROOT_EXTRA_SUFFIXES: Partial<Record<string, Set<string>>> = {
	drawer: new Set(['side', 'toggle', 'content', 'end', 'open']),
	menu: new Set(['title', 'horizontal', 'vertical', 'dropdown', 'item']),
	footer: new Set(['title', 'center', 'horizontal', 'vertical']),
	status: new Set(['success', 'warning', 'error', 'info', 'neutral'])
};

export function classTokens(classAttr: string): string[] {
	return classAttr.trim().split(/\s+/).filter(Boolean);
}

function suffixAllowed(root: string, suffix: string): boolean {
	if (ROOT_EXTRA_SUFFIXES[root]?.has(suffix)) return true;
	const parts = suffix.split('-');
	return parts.every((p) => MODIFIER_SEGMENTS.has(p));
}

/**
 * True when `token` is an idiomatic daisyUI class for HTML `class=""` attributes
 * (exact root or root + known modifiers). Returns false for rowplay layout hooks
 * and custom scoped names like `drawer-nav` / `status-row`.
 */
export function isDaisyUiMarkupToken(token: string): boolean {
	if (ROWPLAY_LAYOUT_HOOKS.has(token)) return false;
	if (FORBIDDEN.has(token)) return true; // still a real daisyUI class, just forbidden as a custom layout root (see findForbiddenLayoutTokens)
	if (!token.includes('-')) return ROOT_SET.has(token);
	const dash = token.indexOf('-');
	const root = token.slice(0, dash);
	if (!ROOT_SET.has(root)) return false;
	const suffix = token.slice(dash + 1);
	return suffixAllowed(root, suffix);
}

/** Custom layout tokens that collide with daisyUI (e.g. bare `stats` on a grid). */
export function findForbiddenLayoutTokens(classAttr: string): string[] {
	return classTokens(classAttr).filter((t) => FORBIDDEN.has(t));
}

export function labelHasToggleCollision(labelOpenTag: string): boolean {
	return (
		/\bclass\s*=\s*["'][^"']*\btoggle\b/.test(labelOpenTag) ||
		/\bclass:toggle\b/.test(labelOpenTag)
	);
}
