/**
 * daisyUI v5 with `prefix: du-` in src/app.css — component classes are `du-btn`, `du-card`, etc.
 * Custom layout code may freely use short names (`label`, `list`, `stats`, `badge`, …) without collision.
 *
 * The daisyUI vocabulary (roots, suffixes, token detection) is the single source of truth in
 * `daisyui-vocabulary.js`, shared with `scripts/prefix-daisyui.mjs`.
 *
 * @see .kiro/skills/daisyui/SKILL.md
 */

import { DAISY_PREFIX, DAISY_ROOTS, isDaisyClassToken } from './daisyui-vocabulary.js';

export { DAISY_PREFIX, DAISY_ROOTS };

export function classTokens(classAttr: string): string[] {
	return classAttr.trim().split(/\s+/).filter(Boolean);
}

/** Unprefixed daisyUI class tokens in a class attribute (should use du-*). */
export function findUnprefixedDaisyTokens(classAttr: string): string[] {
	return classTokens(classAttr).filter(isDaisyClassToken);
}

export function labelHasToggleCollision(labelOpenTag: string): boolean {
	return /\bclass="[^"]*\b(?:du-)?toggle\b/.test(labelOpenTag);
}
