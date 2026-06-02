/**
 * daisyUI v5 — tokens that must not be used as rowplay *custom* class names.
 * Intentional daisyUI (`btn`, `card`, `badge`, `stat`, `label` on toggles, etc.) is fine.
 *
 * @see .kiro/skills/daisyui/SKILL.md
 */

/** Use `field-label`, `wlist`, `dash-stats`, etc. */
export const FORBIDDEN_CUSTOM_CLASS_TOKENS = ['list', 'stats'] as const;

export function classTokens(classAttr: string): string[] {
	return classAttr.trim().split(/\s+/).filter(Boolean);
}

export function findForbiddenCustomTokens(classAttr: string): string[] {
	return classTokens(classAttr).filter((t) =>
		(FORBIDDEN_CUSTOM_CLASS_TOKENS as readonly string[]).includes(t)
	);
}

export function labelHasToggleCollision(labelOpenTag: string): boolean {
	return /\bclass="[^"]*\btoggle\b/.test(labelOpenTag);
}
