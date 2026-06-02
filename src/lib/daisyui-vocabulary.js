/**
 * Single source of truth for the daisyUI v5 class vocabulary used by the
 * `du-` prefix tooling. Imported by both:
 *   - src/lib/daisyui-collision.ts  (collision guard — app + tests)
 *   - scripts/prefix-daisyui.mjs    (codemod)
 *
 * Plain ESM `.js` so the Node codemod can import it directly (it cannot import
 * the `.ts` module) while SvelteKit/Vite/tsc still type-check it via `checkJs`.
 *
 * Reference: .kiro/skills/daisyui/SKILL.md
 */

/** Must match `@plugin "daisyui" { prefix: du- }` in app.css */
export const DAISY_PREFIX = 'du-';

/** daisyUI v5 component roots (unprefixed) — must not appear bare in markup. */
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
];

/**
 * Known daisyUI suffix segments (colors, sizes, styles, behaviors, parts,
 * placements, directions). A `root-suffix` class is only treated as daisyUI
 * when the first segment of its suffix appears here. This keeps custom classes
 * that merely share a root prefix (e.g. `drawer-nav`, `status-row`, `btn-icon`)
 * out of the collision guard and the codemod.
 *
 * Deliberately OMITS segments that collide with rowplay's custom layout
 * classes: `nav`, `actions`, `theme`, `inner`, `row`, `label`, `time`, `icon`,
 * `live`, `btn`. (As a side effect a few unused daisyUI parts — `card-actions`,
 * `stat-actions`, `list-row`, `dock-label` — are not guarded; none are used.)
 */
export const DAISY_SUFFIXES = new Set([
	// colors
	'primary',
	'secondary',
	'accent',
	'neutral',
	'info',
	'success',
	'warning',
	'error',
	'base',
	// sizes
	'xs',
	'sm',
	'md',
	'lg',
	'xl',
	// styles / behaviors
	'outline',
	'dash',
	'soft',
	'ghost',
	'link',
	'glass',
	'bordered',
	'wide',
	'block',
	'active',
	'disabled',
	'hover',
	'focus',
	'open',
	'close',
	'checked',
	// parts / placements / directions
	'title',
	'value',
	'desc',
	'figure',
	'body',
	'content',
	'side',
	'toggle',
	'overlay',
	'box',
	'backdrop',
	'bubble',
	'header',
	'footer',
	'image',
	'start',
	'center',
	'end',
	'top',
	'bottom',
	'middle',
	'left',
	'right',
	'vertical',
	'horizontal',
	'arrow',
	'plus',
	'zebra',
	'pin',
	'spinner',
	'dots',
	'ring',
	'ball',
	'bars',
	'infinity',
	'squircle',
	'hexagon',
	'heart',
	'star',
	'triangle',
	'diamond',
	'decagon',
	'pentagon',
	'half',
	'square',
	'circle',
	'online',
	'offline',
	'placeholder',
	'reset',
	'legend',
	'col',
	'snap',
	'compact',
	'hidden',
	'text',
	'flower',
	'main',
	'item',
	'group'
]);

const ROOT_SET = new Set(DAISY_ROOTS);
const ROOTS_BY_LENGTH = [...DAISY_ROOTS].sort((a, b) => b.length - a.length);

/**
 * True when `token` is a daisyUI component class that should carry the `du-`
 * prefix. Matches an exact root (`btn`, `card`) or a `root-suffix` where the
 * suffix's first segment is a known daisyUI modifier/part (`btn-primary`,
 * `stat-title`) — never an arbitrary custom class (`btn-icon`, `drawer-nav`).
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isDaisyClassToken(token) {
	if (!token || token.startsWith(DAISY_PREFIX)) return false;
	if (ROOT_SET.has(token)) return true;
	for (const root of ROOTS_BY_LENGTH) {
		if (token.startsWith(`${root}-`)) {
			const firstSegment = token.slice(root.length + 1).split('-')[0];
			return DAISY_SUFFIXES.has(firstSegment);
		}
	}
	return false;
}
