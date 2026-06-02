/**
 * Guards against rowplay layout class names that collide with daisyUI components.
 * The daisyUI `stats` container forces an opinionated grid — use `dash-stats` instead.
 *
 * @see .kiro/specs/mobile-stats-spacing-fix/
 * @see .kiro/skills/daisyui/SKILL.md
 */

/** Must not be used as a custom layout hook (use `dash-stats`). */
export const FORBIDDEN_CUSTOM_ROOTS = ['stats'] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_CUSTOM_ROOTS);

export function classTokens(classAttr: string): string[] {
	return classAttr.trim().split(/\s+/).filter(Boolean);
}

export function findForbiddenLayoutTokens(classAttr: string): string[] {
	return classTokens(classAttr).filter((t) => FORBIDDEN.has(t));
}

export function labelHasToggleCollision(labelOpenTag: string): boolean {
	return /\bclass="[^"]*\btoggle\b/.test(labelOpenTag);
}
